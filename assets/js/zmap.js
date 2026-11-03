/* ============================================================================
 * ZMap —— 零依赖的极简瓦片地图
 * 用于「土地」「坟茔」两个页面：拖拽平移、滚轮缩放、标注点、悬停提示。
 *
 *   var map = new ZMap(el, { center: [lat, lng], zoom: 13, tile: 'osm' });
 *   map.setMarkers([{ id, lat, lng, html, cls, title }]);
 *   map.on('markerclick', fn);   map.on('ready', fn);
 *
 * 底图：osm（WGS-84 标准） / gaode（GCJ-02，中国境内更清晰，坐标可能偏移） / none
 * 断网或瓦片全挂时自动降级为「坐标纸」网格，标注点照常显示。
 * ========================================================================== */
window.ZMap = (function () {
  'use strict';

  var TILE = 256;
  var TILES = {
    osm:   { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', sub: ['a', 'b', 'c'], max: 19 },
    gaode: { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', sub: ['1', '2', '3', '4'], max: 18 }
  };

  function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function lat2y(lat, z) {
    var r = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function y2lat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function ZMap(el, opt) {
    opt = opt || {};
    this.el = el;
    this.tileKind = opt.tile || 'osm';
    this.minZoom = opt.minZoom || 3;
    this.maxZoom = opt.maxZoom || 18;
    this.markers = [];
    this.handlers = {};
    this.ready = false;
    this.tileFail = 0;
    this.tileOk = 0;

    el.classList.add('zmap');
    el.innerHTML = '';
    this.gridLayer = document.createElement('div');
    this.gridLayer.className = 'zm-grid';
    this.tileLayer = document.createElement('div');
    this.tileLayer.className = 'zm-tiles';
    this.markLayer = document.createElement('div');
    this.markLayer.className = 'zm-marks';
    this.hint = document.createElement('div');
    this.hint.className = 'zm-hint';
    el.appendChild(this.gridLayer);
    el.appendChild(this.tileLayer);
    el.appendChild(this.markLayer);
    el.appendChild(this.hint);

    // 缩放 / 归位控件
    if (opt.controls !== false) {
      var self0 = this;
      var ctrl = document.createElement('div');
      ctrl.className = 'zm-ctrl';
      var mk = function (label, title, fn) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
        ctrl.appendChild(b);
      };
      mk('＋', '放大', function () { self0.zoomAt(self0.z + 1, self0.w / 2, self0.h / 2); });
      mk('－', '缩小', function () { self0.zoomAt(self0.z - 1, self0.w / 2, self0.h / 2); });
      mk('◉', '全部标点入镜', function () { self0.fitMarkers(); });
      el.appendChild(ctrl);
    }

    var c = opt.center || [26.0, 113.0];
    this.z = Math.max(this.minZoom, Math.min(this.maxZoom, opt.zoom || 12));
    this.cx = lon2x(c[1], this.z) * TILE;
    this.cy = lat2y(c[0], this.z) * TILE;

    this._tiles = {};
    this._bind();
    var self = this;
    requestAnimationFrame(function () { self.resize(); });
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(el);
    }
  }

  ZMap.prototype._bind = function () {
    var self = this, drag = null;

    this.el.addEventListener('mousedown', function (e) {
      if (e.target.closest('.zm-mark')) return;
      drag = { x: e.clientX, y: e.clientY, cx: self.cx, cy: self.cy };
      self.el.classList.add('grabbing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      self.cx = drag.cx - (e.clientX - drag.x);
      self.cy = drag.cy - (e.clientY - drag.y);
      self.render();
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null;
      self.el.classList.remove('grabbing');
    });

    this.el.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = self.el.getBoundingClientRect();
      self.zoomAt(self.z + (e.deltaY < 0 ? 1 : -1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    // 双击放大
    this.el.addEventListener('dblclick', function (e) {
      var r = self.el.getBoundingClientRect();
      self.zoomAt(self.z + 1, e.clientX - r.left, e.clientY - r.top);
    });

    // 触摸：单指平移、双指缩放
    var tstart = null;
    this.el.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        tstart = { x: e.touches[0].clientX, y: e.touches[0].clientY, cx: self.cx, cy: self.cy };
      } else if (e.touches.length === 2) {
        tstart = { d: self._dist(e.touches), z: self.z, mx: 0, my: 0 };
      }
    }, { passive: true });
    this.el.addEventListener('touchmove', function (e) {
      if (!tstart) return;
      if (e.touches.length === 1 && tstart.cx != null) {
        self.cx = tstart.cx - (e.touches[0].clientX - tstart.x);
        self.cy = tstart.cy - (e.touches[0].clientY - tstart.y);
        self.render();
        e.preventDefault();
      } else if (e.touches.length === 2 && tstart.d) {
        var d = self._dist(e.touches);
        var nz = Math.round(tstart.z + Math.log(d / tstart.d) / Math.LN2);
        var r = self.el.getBoundingClientRect();
        self.zoomAt(nz, (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
                            (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top);
        e.preventDefault();
      }
    }, { passive: false });
    this.el.addEventListener('touchend', function () { tstart = null; }, { passive: true });
  };

  ZMap.prototype._dist = function (t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  };

  ZMap.prototype.on = function (name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); return this; };
  ZMap.prototype.emit = function (name, a, b) { (this.handlers[name] || []).forEach(function (f) { f(a, b); }); };

  ZMap.prototype.resize = function () {
    this.w = this.el.clientWidth;
    this.h = this.el.clientHeight;
    this.render();
  };

  /** 以容器内某点为锚点缩放（保持该点地理坐标不动） */
  ZMap.prototype.zoomAt = function (nz, mx, my) {
    nz = Math.max(this.minZoom, Math.min(this.maxZoom, nz));
    if (nz === this.z) return;
    var w = this.w || this.el.clientWidth, h = this.h || this.el.clientHeight;
    var wx = this.cx + (mx - w / 2), wy = this.cy + (my - h / 2);
    var s = Math.pow(2, nz - this.z);
    this.cx = wx * s - (mx - w / 2);
    this.cy = wy * s - (my - h / 2);
    this.z = nz;
    this.render();
  };

  /** 平移到某点（经纬度） */
  ZMap.prototype.setView = function (lat, lng, z) {
    if (z != null) this.z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    this.cx = lon2x(lng, this.z) * TILE;
    this.cy = lat2y(lat, this.z) * TILE;
    this.render();
  };

  ZMap.prototype.center = function () {
    var w = this.w || this.el.clientWidth, h = this.h || this.el.clientHeight;
    return { lat: y2lat((this.cy) / TILE, this.z), lng: x2lon((this.cx) / TILE, this.z), zoom: this.z, w: w, h: h };
  };

  /** 让所有标注点进入视野 */
  ZMap.prototype.fitMarkers = function (pad) {
    var pts = this.markers.filter(function (m) { return m.lat != null && m.lng != null; });
    if (!pts.length) return;
    var w = this.w || this.el.clientWidth, h = this.h || this.el.clientHeight;
    pad = pad || 60;
    var best = this.z;
    for (var z = this.maxZoom; z >= this.minZoom; z--) {
      var xs = pts.map(function (m) { return lon2x(m.lng, z) * TILE; });
      var ys = pts.map(function (m) { return lat2y(m.lat, z) * TILE; });
      var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      if (dx <= w - pad * 2 && dy <= h - pad * 2) { best = z; break; }
    }
    this.z = best;
    var xs2 = pts.map(function (m) { return lon2x(m.lng, best) * TILE; });
    var ys2 = pts.map(function (m) { return lat2y(m.lat, best) * TILE; });
    this.cx = (Math.max.apply(null, xs2) + Math.min.apply(null, xs2)) / 2;
    this.cy = (Math.max.apply(null, ys2) + Math.min.apply(null, ys2)) / 2;
    this.render();
  };

  ZMap.prototype.setMarkers = function (list) {
    this.markers = (list || []).filter(function (m) { return m.lat != null && m.lng != null; });
    this.markLayer.innerHTML = '';
    var self = this;
    this.markers.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'zm-mark ' + (m.cls || '');
      el.innerHTML = m.html || '';
      el.title = m.title || '';
      el.dataset.id = m.id || '';
      if (m.onClick) el.addEventListener('click', function (e) { e.stopPropagation(); m.onClick(m, el); });
      el.addEventListener('mouseenter', function () { self.emit('markerenter', m, el); });
      el.addEventListener('mouseleave', function () { self.emit('markerleave', m, el); });
      m.el = el;
      self.markLayer.appendChild(el);
    });
    this.render();
  };

  ZMap.prototype.render = function () {
    if (!this.w) { this.w = this.el.clientWidth; this.h = this.el.clientHeight; }
    if (!this.w) return;
    this.renderTiles();
    this.renderMarks();
  };

  ZMap.prototype.renderTiles = function () {
    var def = TILES[this.tileKind];
    var w = this.w, h = this.h;
    var z = this.z;
    var px0 = this.cx - w / 2, py0 = this.cy - h / 2;

    // 无底图：只画坐标纸
    if (!def) {
      this.tileLayer.style.display = 'none';
      this.gridLayer.style.display = 'block';
      this.gridLayer.style.backgroundPosition = (-px0 % 64) + 'px ' + (-py0 % 64) + 'px';
      this.hint.textContent = '坐标模式 · 未加载底图';
      this.hint.classList.add('on');
      return;
    }
    this.gridLayer.style.display = 'none';
    this.tileLayer.style.display = 'block';

    var n = Math.pow(2, z);
    var tx0 = Math.floor(px0 / TILE), tx1 = Math.floor((px0 + w) / TILE);
    var ty0 = Math.floor(py0 / TILE), ty1 = Math.floor((py0 + h) / TILE);
    var want = {};

    for (var ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (var tx = tx0; tx <= tx1; tx++) {
        var wx = ((tx % n) + n) % n;
        var key = z + '/' + wx + '/' + ty;
        want[key] = true;
        var img = this._tiles[key];
        if (!img) {
          img = document.createElement('img');
          img.className = 'zm-tile';
          img.alt = '';
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          var sub = def.sub[Math.abs(tx + ty) % def.sub.length];
          img.src = def.url.replace('{s}', sub).replace('{z}', z).replace('{x}', wx).replace('{y}', ty);
          var self = this;
          img.addEventListener('load', function () {
            self.tileOk++;
            self.hint.classList.remove('on');
          });
          img.addEventListener('error', function () {
            self.tileFail++;
            img.classList.add('dead');
            // 连续失败很多 → 底图不可用，降级到坐标纸
            if (self.tileOk === 0 && self.tileFail >= 6) {
              self.tileKind = 'none';
              self.hint.textContent = '底图加载失败 · 已切到坐标模式';
              self.hint.classList.add('on');
              self.renderTiles();
            }
          });
          this._tiles[key] = img;
          this.tileLayer.appendChild(img);
        }
        img.style.left = (tx * TILE - px0) + 'px';
        img.style.top = (ty * TILE - py0) + 'px';
      }
    }
    // 清掉视野外的旧瓦片，避免节点堆积
    for (var k in this._tiles) {
      if (!want[k]) {
        var old = this._tiles[k];
        if (old.parentNode) old.parentNode.removeChild(old);
        delete this._tiles[k];
      }
    }
  };

  ZMap.prototype.renderMarks = function () {
    var w = this.w, h = this.h;
    var px0 = this.cx - w / 2, py0 = this.cy - h / 2;
    var n = Math.pow(2, this.z);
    this.markers.forEach(function (m) {
      if (!m.el) return;
      var x = lon2x(m.lng, this.z) * TILE - px0;
      var y = lat2y(m.lat, this.z) * TILE - py0;
      if (x < -80 || y < -80 || x > w + 80 || y > h + 80) { m.el.style.display = 'none'; return; }
      m.el.style.display = '';
      m.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }, this);
  };

  ZMap.prototype.setTile = function (kind) {
    this.tileKind = kind;
    this.tileOk = 0; this.tileFail = 0;
    for (var k in this._tiles) {
      if (this._tiles[k].parentNode) this._tiles[k].parentNode.removeChild(this._tiles[k]);
    }
    this._tiles = {};
    this.tileLayer.innerHTML = '';
    this.hint.classList.remove('on');
    this.render();
  };

  return ZMap;
})();
