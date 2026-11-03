/* ============================================================================
 * ZMap —— 零依赖的极简地图（拖拽平移 / 滚轮缩放 / 标注 / 悬停）
 *
 *   var map = new ZMap(el, { center: [lat, lng], zoom: 13, base: 'plain', theme: 'light' });
 *   map.setMarkers([{ id, lat, lng, html, cls, title }]);
 *   map.on('markerclick', fn);
 *
 * 底图：
 *   plain  「素白」—— 高德瓦片 + 降饱和滤镜，浅灰底、白陆地、细线条，
 *          观感接近 Positron / Radiocast 那类极简风格。
 *   gaode  高德原色瓦片（信息最全，但色块多、花）
 *   atlas  离线「典藏」—— 本地 Canvas 画经纬网、比例尺、指北针，零请求
 *   none   坐标纸
 *
 * 缩到 z ≤ 3 时自动切成「地球」：用 assets/data/world-land.js 的陆地轮廓
 * 做正交投影，浅灰海面 + 白陆地 + 柔光，脚下那块地会亮成一个小点。
 *
 * 在线瓦片连续失败会自动退回 atlas，不会留一片空白。
 * ========================================================================== */
window.ZMap = (function () {
  'use strict';

  var TILE = 256;
  var GLOBE_MAX = 3;          // 缩放 ≤ 这个级别就用地球视图
  var RAD = Math.PI / 180;

  var BASES = {
    plain: {
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      sub: ['1', '2', '3', '4'],
      max: 18,
      filter: 'plain'
    },
    gaode: {
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      sub: ['1', '2', '3', '4'],
      max: 18
    }
  };

  /* 两套离线底图配色：浅色「宣纸」/ 深色「星夜」 */
  var THEMES = {
    light: {
      bg: '#f8f4ea', bg2: '#efe8d9',
      grid: 'rgba(124,112,94,.20)', grid5: 'rgba(124,112,94,.40)',
      text: 'rgba(110,99,82,.82)', ring: 'rgba(124,112,94,.30)',
      ink: 'rgba(80,70,55,.92)',
      blob: '168,148,110', blobA: 0.085,
      // 地球：浅灰海、近白陆地、几乎看不见的岸线
      ocean: '#e1e5ea', land: '#fdfdfd', coast: 'rgba(120,128,138,.26)',
      grat: 'rgba(120,128,138,.13)', limb: 'rgba(120,128,138,.22)',
      dot: '#e5484d', dotRing: 'rgba(255,255,255,.9)',
      label: 'rgba(96,106,118,.92)', labelHalo: 'rgba(255,255,255,.85)'
    },
    dark: {
      bg: '#0d1320', bg2: '#070a11',
      grid: 'rgba(150,180,255,.13)', grid5: 'rgba(150,180,255,.28)',
      text: 'rgba(160,190,240,.7)', ring: 'rgba(150,180,255,.22)',
      ink: 'rgba(200,220,255,.9)',
      blob: '56,104,196', blobA: 0.15,
      ocean: '#070d17', land: '#212c40', coast: 'rgba(125,165,225,.34)',
      grat: 'rgba(120,160,220,.11)', limb: 'rgba(120,160,220,.22)',
      dot: '#ff7a6b', dotRing: 'rgba(10,15,25,.9)',
      label: 'rgba(178,198,226,.88)', labelHalo: 'rgba(6,10,18,.8)'
    }
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

  /** 二维整数哈希，用来给地形晕染「固定」位置 */
  function hash2(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* 地球视图上的地名：只放一小撮，够让球不空就行 */
  var GLOBE_LABELS = [
    ['北京', 39.90, 116.41], ['上海', 31.23, 121.47], ['广州', 23.13, 113.26],
    ['成都', 30.57, 104.07], ['乌鲁木齐', 43.83, 87.62], ['哈尔滨', 45.80, 126.53],
    ['拉萨', 29.65, 91.14], ['台北', 25.03, 121.56],
    ['东京', 35.68, 139.69], ['首尔', 37.57, 126.98], ['新德里', 28.61, 77.21],
    ['莫斯科', 55.75, 37.62], ['伦敦', 51.51, -0.13], ['巴黎', 48.86, 2.35],
    ['开罗', 30.04, 31.24], ['悉尼', -33.87, 151.21], ['纽约', 40.71, -74.01],
    ['洛杉矶', 34.05, -118.24], ['圣保罗', -23.55, -46.63], ['开普敦', -33.92, 18.42]
  ];

  /** 把任意正数收成最接近的 1 / 2 / 5 × 10^n */
  function niceNum(v) {
    if (!(v > 0)) return 1;
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var f = v / e;
    var n = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
    return n * e;
  }

  /** 度数保留几位小数 */
  function degDec(step) {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    if (step >= 0.01) return 2;
    if (step >= 0.001) return 3;
    return 4;
  }

  function ZMap(el, opt) {
    opt = opt || {};
    this.el = el;
    this.base = opt.base || opt.tile || 'plain';
    this.theme = opt.theme || 'light';
    this.minZoom = opt.minZoom || 2;
    this.maxZoom = opt.maxZoom || 18;
    this.markers = [];
    this.handlers = {};
    this.ready = false;
    this.tileFail = 0;
    this.tileOk = 0;
    this._fellBack = false;

    el.classList.add('zmap');
    el.setAttribute('data-theme', this.theme);
    el.innerHTML = '';

    this.gridLayer = document.createElement('div');
    this.gridLayer.className = 'zm-grid';

    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.className = 'zm-base';
    this.baseCtx = this.baseCanvas.getContext('2d');

    this.tileLayer = document.createElement('div');
    this.tileLayer.className = 'zm-tiles';

    this.markLayer = document.createElement('div');
    this.markLayer.className = 'zm-marks';

    this.hint = document.createElement('div');
    this.hint.className = 'zm-hint';

    el.appendChild(this.gridLayer);
    el.appendChild(this.baseCanvas);
    el.appendChild(this.tileLayer);
    el.appendChild(this.markLayer);
    el.appendChild(this.hint);

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
      mk('◒', '看地球（缩到世界）', function () { self0.toGlobe(); });
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
      if (e.target.closest('.zm-mark, .zm-ctrl')) return;
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

    this.el.addEventListener('dblclick', function (e) {
      var r = self.el.getBoundingClientRect();
      self.zoomAt(self.z + 1, e.clientX - r.left, e.clientY - r.top);
    });

    var tstart = null;
    this.el.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        tstart = { x: e.touches[0].clientX, y: e.touches[0].clientY, cx: self.cx, cy: self.cy };
      } else if (e.touches.length === 2) {
        tstart = { d: self._dist(e.touches), z: self.z };
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

  ZMap.prototype.setView = function (lat, lng, z) {
    if (z != null) this.z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    this.cx = lon2x(lng, this.z) * TILE;
    this.cy = lat2y(lat, this.z) * TILE;
    this.render();
  };

  /** 缩到世界级，看一眼地球 */
  ZMap.prototype.toGlobe = function () {
    var m = this.markers[0];
    var c = this.center();
    this.setView(m ? m.lat : c.lat, m ? m.lng : c.lng, 2);
  };

  /** 当前是否走地球视图 */
  ZMap.prototype.useGlobe = function () {
    return this.base !== 'none' && this.z <= GLOBE_MAX && !!window.ZP_WORLD_LAND;
  };

  /** 地球视图的几何：球心、半径、正交投影函数 */
  ZMap.prototype._globe = function () {
    var w = this.w, h = this.h;
    var c = this.center();
    var lat0 = c.lat * RAD, lng0 = c.lng * RAD;
    var sin0 = Math.sin(lat0), cos0 = Math.cos(lat0);
    var R = Math.min(w, h) * 0.32 * Math.pow(1.8, this.z - 2);
    R = Math.max(40, Math.min(R, Math.max(w, h) * 2.2));
    var cx = w / 2, cy = h / 2;
    var lastA = null;          // 背面点的方位角记忆，避免逼近对跖点时方向乱跳

    /** 经纬度 → 视图空间单位向量（Z > 0 即在可见半球） */
    function view(lon, lat) {
      var phi = lat * RAD, dlam = lon * RAD - lng0;
      var cp = Math.cos(phi), sp = Math.sin(phi), cd = Math.cos(dlam);
      return [cp * Math.sin(dlam), cos0 * sp - sin0 * cp * cd, sin0 * sp + cos0 * cp * cd];
    }

    function project(lon, lat) {
      var phi = lat * RAD, dlam = lon * RAD - lng0;
      var cosphi = Math.cos(phi), sinphi = Math.sin(phi), cosd = Math.cos(dlam);
      var cosc = sin0 * sinphi + cos0 * cosphi * cosd;
      var x = cosphi * Math.sin(dlam);
      var y = cos0 * sinphi - sin0 * cosphi * cosd;
      if (cosc < 0) {          // 背面：压到轮廓线上，跨地平线的陆地才不会穿帮
        var r = Math.sqrt(x * x + y * y);
        var a = r > 0.02 ? Math.atan2(y, x) : (lastA == null ? 0 : lastA);
        lastA = a;
        return [Math.cos(a), Math.sin(a), false];
      }
      lastA = null;
      return [x, y, true];
    }
    return { cx: cx, cy: cy, R: R, project: project, view: view };
  };

  ZMap.prototype.center = function () {
    var w = this.w || this.el.clientWidth, h = this.h || this.el.clientHeight;
    return { lat: y2lat(this.cy / TILE, this.z), lng: x2lon(this.cx / TILE, this.z), zoom: this.z, w: w, h: h };
  };

  /** 让所有标注点进入视野 */
  ZMap.prototype.fitMarkers = function (pad) {
    var pts = this.markers.filter(function (m) { return m.lat != null && m.lng != null; });
    if (!pts.length) return;
    var w = this.w || this.el.clientWidth, h = this.h || this.el.clientHeight;
    pad = pad || 64;
    var best = this.minZoom;
    // 最多放到 16 级：再往里瓦片往往是空白，标点会飘在一片白（或黑）上
    var zTop = Math.min(this.maxZoom, 16);
    for (var z = zTop; z >= this.minZoom; z--) {
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
    this.renderLayer();
    this.renderMarks();
  };

  ZMap.prototype.renderLayer = function () {
    var w = this.w, h = this.h;

    // 缩到世界级 → 画地球（比瓦片好看，也不为几张世界瓦片跑一趟网络）
    if (this.useGlobe()) {
      this.gridLayer.style.display = 'none';
      this.tileLayer.style.opacity = '0';
      this._dropTiles();
      this.baseCanvas.style.opacity = '1';
      this.hint.classList.remove('on');
      this.renderGlobe();
      return;
    }
    this.baseCanvas.style.opacity = '0';

    if (this.base === 'atlas') {
      this.gridLayer.style.display = 'none';
      this.tileLayer.style.display = 'none';
      this.baseCanvas.style.opacity = '1';
      this.hint.classList.remove('on');
      this.renderBase();
      return;
    }

    var def = BASES[this.base];
    if (!def) {
      this.tileLayer.style.display = 'none';
      this.gridLayer.style.display = 'block';
      this.gridLayer.style.backgroundPosition = (-(this.cx - w / 2) % 64) + 'px ' + (-(this.cy - h / 2) % 64) + 'px';
      this.hint.textContent = '坐标纸 · 无底图';
      this.hint.classList.add('on');
      return;
    }
    this.gridLayer.style.display = 'none';
    this.tileLayer.style.display = 'block';
    this.tileLayer.style.opacity = '1';
    this.tileLayer.setAttribute('data-base', this.base);

    var z = this.z;
    var px0 = this.cx - w / 2, py0 = this.cy - h / 2;
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
            // 一张都没成功 → 直接退回离线底图，别让人对着空白
            if (self.tileOk === 0 && self.tileFail >= 3) self.fallbackBase();
          });
          this._tiles[key] = img;
          this.tileLayer.appendChild(img);
        }
        img.style.left = (tx * TILE - px0) + 'px';
        img.style.top = (ty * TILE - py0) + 'px';
      }
    }
    for (var k in this._tiles) {
      if (!want[k]) {
        var old = this._tiles[k];
        if (old.parentNode) old.parentNode.removeChild(old);
        delete this._tiles[k];
      }
    }
  };

  /** 清掉所有瓦片（切底图 / 切地球时用） */
  ZMap.prototype._dropTiles = function () {
    for (var k in this._tiles) {
      if (this._tiles[k].parentNode) this._tiles[k].parentNode.removeChild(this._tiles[k]);
    }
    this._tiles = {};
    this.tileLayer.innerHTML = '';
  };

  /** 在线瓦片挂了 → 静默切到离线底图 */
  ZMap.prototype.fallbackBase = function () {
    if (this._fellBack) return;
    this._fellBack = true;
    var msg = '底图连不上 · 已切到离线底图';
    this.base = 'atlas';
    this._dropTiles();
    this.render();
    this.hint.textContent = msg;
    this.hint.classList.add('on');
    var self = this;
    setTimeout(function () { self.hint.classList.remove('on'); }, 4200);
    this.emit('basechange', 'atlas');
  };

  /* ------------------------------------------------------------------
   * 离线底图：经纬网 + 度数标注 + 比例尺 + 指北针
   * 全部以 Web Mercator 真实投影计算，所以标点落位是准的，
   * 只是不画道路和建筑 —— 换来的是零请求、离线可用。
   * ------------------------------------------------------------------ */
  ZMap.prototype.renderBase = function () {
    var c = this.baseCanvas, ctx = this.baseCtx;
    var w = this.w, h = this.h;
    if (!w || !h) return;

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var t = THEMES[this.theme] || THEMES.light;
    var z = this.z;
    var px0 = this.cx - w / 2, py0 = this.cy - h / 2;

    // 底色
    var g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.9);
    g.addColorStop(0, t.bg);
    g.addColorStop(1, t.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 网格步长：让屏幕间距落在 100~150px
    var degPerPx = 360 / (TILE * Math.pow(2, z));
    var step = Math.min(90, niceNum(degPerPx * 105));
    var dec = degDec(step);

    var lonL = x2lon(px0 / TILE, z), lonR = x2lon((px0 + w) / TILE, z);
    var latT = y2lat(py0 / TILE, z), latB = y2lat((py0 + h) / TILE, z);

    // 地形晕染：一团团很淡的径向渐变，钉在经纬度上，随地图一起平移缩放
    var blob = Math.min(60, niceNum(degPerPx * 520));
    var bi0 = Math.floor(lonL / blob) - 1, bi1 = Math.ceil(lonR / blob) + 1;
    var bj0 = Math.floor(latB / blob) - 1, bj1 = Math.ceil(latT / blob) + 1;
    var guard = 0;
    for (var bj = bj0; bj <= bj1; bj++) {
      for (var bi = bi0; bi <= bi1; bi++) {
        if (++guard > 42) break;
        var hh = hash2(bi, bj);
        var blon = (bi + 0.1 + ((hh % 800) / 1000)) * blob;
        var blat = (bj + 0.1 + (((hh >>> 9) % 800) / 1000)) * blob;
        if (blat < -84 || blat > 84) continue;
        var sx = lon2x(blon, z) * TILE - px0;
        var sy = lat2y(blat, z) * TILE - py0;
        var R = 190 + ((hh >>> 19) % 220);
        if (sx + R < 0 || sy + R < 0 || sx - R > w || sy - R > h) continue;
        var rad = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        rad.addColorStop(0, 'rgba(' + t.blob + ',' + t.blobA + ')');
        rad.addColorStop(0.58, 'rgba(' + t.blob + ',' + (t.blobA * 0.5).toFixed(3) + ')');
        rad.addColorStop(1, 'rgba(' + t.blob + ',0)');
        ctx.fillStyle = rad;
        ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      }
    }

    ctx.lineWidth = 1;

    // 纬线
    var i0 = Math.floor(latB / step), i1 = Math.ceil(latT / step);
    for (var i = i0; i <= i1; i++) {
      var lat = i * step;
      if (lat < -85 || lat > 85) continue;
      var y = lat2y(lat, z) * TILE - py0;
      var major = (i % 5 === 0);
      ctx.strokeStyle = major ? t.grid5 : t.grid;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();
    }
    // 经线
    var j0 = Math.floor(lonL / step), j1 = Math.ceil(lonR / step);
    for (var j = j0; j <= j1; j++) {
      var lon = j * step;
      var x = lon2x(lon, z) * TILE - px0;
      var mj = (j % 5 === 0);
      ctx.strokeStyle = mj ? t.grid5 : t.grid;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
    }

    // 度数标注
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = t.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i2 = i0; i2 <= i1; i2++) {
      var lat2 = i2 * step;
      if (lat2 < -85 || lat2 > 85) continue;
      var y2 = lat2y(lat2, z) * TILE - py0;
      if (y2 < 18 || y2 > h - 30) continue;
      ctx.fillText(Math.abs(lat2).toFixed(dec) + '°' + (lat2 >= 0 ? 'N' : 'S'), 8, y2 - 8);
    }
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    for (var j2 = j0; j2 <= j1; j2++) {
      var lon2 = j2 * step;
      var x2 = lon2x(lon2, z) * TILE - px0;
      if (x2 < 130 || x2 > w - 70) continue;
      ctx.fillText(Math.abs(lon2).toFixed(dec) + '°' + (lon2 >= 0 ? 'E' : 'W'), x2, h - 9);
    }

    // 比例尺（右下，给左下的信息卡腾地方）
    var latMid = y2lat(this.cy / TILE, z);
    var mpp = 156543.03392 * Math.cos(latMid * Math.PI / 180) / Math.pow(2, z);
    var meters = niceNum(mpp * 96);
    var barW = meters / mpp;
    var bx = Math.max(16, w - 210 - Math.max(0, barW - 96)), by = h - 54;
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - 5);
    ctx.moveTo(bx, by - 2.5);
    ctx.lineTo(bx + barW, by - 2.5);
    ctx.moveTo(bx + barW, by - 5);
    ctx.lineTo(bx + barW, by);
    ctx.stroke();
    ctx.fillStyle = t.ink;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(meters >= 1000 ? (meters / 1000) + ' km' : meters + ' m', bx, by + 2);

    // 指北针（右上，落在缩放按钮下方）
    var nx = w - 27, ny = 148;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.strokeStyle = t.ring;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = t.ink;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = t.text;
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', nx, ny + 14);
  };

  /* ------------------------------------------------------------------
   * 地球视图：正交投影 + 世界陆地轮廓
   * 浅色主题下就是「浅灰海面 / 白陆地 / 一圈细边」，和 Radiocast 那种
   * 极简地图一个味道；深色主题则变成深海的蓝。
   * ------------------------------------------------------------------ */
  ZMap.prototype.renderGlobe = function () {
    var c = this.baseCanvas, ctx = this.baseCtx;
    var w = this.w, h = this.h;
    if (!w || !h) return;

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var t = THEMES[this.theme] || THEMES.light;
    var G = this._globe();
    var cx = G.cx, cy = G.cy, R = G.R, project = G.project, view = G.view;

    // 球体本身
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = t.ocean;
    ctx.fillRect(0, 0, w, h);

    // 经纬网（很淡，只为让球有点体积）
    ctx.strokeStyle = t.grat;
    ctx.lineWidth = 1;
    var i, p;
    for (var lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      var pen = false;
      for (var lat = -85; lat <= 85; lat += 5) {
        p = project(lon, lat);
        if (!p[2]) { pen = false; continue; }
        var sx = cx + p[0] * R, sy = cy - p[1] * R;
        if (pen) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); pen = true; }
      }
      ctx.stroke();
    }
    for (var la = -60; la <= 60; la += 30) {
      ctx.beginPath();
      var started = false;
      for (var lo = -180; lo <= 180; lo += 5) {
        p = project(lo, la);
        if (!p[2]) { started = false; continue; }
        var lx = cx + p[0] * R, ly = cy - p[1] * R;
        if (started) ctx.lineTo(lx, ly); else { ctx.moveTo(lx, ly); started = true; }
      }
      ctx.stroke();
    }

    // 陆地：先用 z=0 平面把多边形裁到可见半球（3D 里是真平面，裁得准），
    // 再把落在轮廓线上的相邻点沿圆弧补密，避免出现直线切口。
    var rings = window.ZP_WORLD_LAND || [];

    function clipZ(poly) {
      var out = [];
      for (var k = 0; k < poly.length; k++) {
        var A = poly[k], B = poly[(k + 1) % poly.length];
        var ain = A[2] >= 0, bin = B[2] >= 0;
        if (ain) out.push(A);
        if (ain !== bin) {
          var tt = A[2] / (A[2] - B[2]);
          out.push([A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt, 0]);
        }
      }
      return out;
    }

    ctx.beginPath();
    for (i = 0; i < rings.length; i++) {
      var r = rings[i], n = r.length / 2;
      var poly = [];
      for (var j = 0; j < n; j++) poly.push(view(r[j * 2] / 100, r[j * 2 + 1] / 100));
      var clipped = clipZ(poly);
      if (clipped.length < 3) continue;         // 整个在背面

      var scr = [], onLimb = [];
      for (j = 0; j < clipped.length; j++) {
        var v = clipped[j];
        if (v[2] === 0) {
          var mm = Math.sqrt(v[0] * v[0] + v[1] * v[1]) || 1;
          scr.push([v[0] / mm, v[1] / mm]);
          onLimb.push(true);
        } else {
          scr.push([v[0], v[1]]);
          onLimb.push(false);
        }
      }

      for (j = 0; j < scr.length; j++) {
        var a = scr[j], b = scr[(j + 1) % scr.length];
        var X = cx + a[0] * R, Y = cy - a[1] * R;
        if (j === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        if (onLimb[j] && onLimb[(j + 1) % scr.length]) {
          var A1 = Math.atan2(a[1], a[0]), A2 = Math.atan2(b[1], b[0]);
          var dA = A2 - A1;
          while (dA > Math.PI) dA -= Math.PI * 2;
          while (dA < -Math.PI) dA += Math.PI * 2;
          var steps = Math.max(1, Math.round(Math.abs(dA) / 0.07));
          for (var s = 1; s < steps; s++) {
            var ang = A1 + dA * s / steps;
            ctx.lineTo(cx + Math.cos(ang) * R, cy - Math.sin(ang) * R);
          }
        }
      }
      ctx.closePath();
    }
    ctx.fillStyle = t.land;
    ctx.fill();
    ctx.strokeStyle = t.coast;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 地名（球够大时才标；小屏上宁可干净，也不要糊成一团）
    if (R > 150) {
      ctx.font = '11px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (i = 0; i < GLOBE_LABELS.length; i++) {
        var L = GLOBE_LABELS[i];
        var lp = project(L[2], L[1]);
        if (!lp[2]) continue;
        // 贴着轮廓的标签会被裁掉，往里挪一点
        var dist = Math.sqrt(lp[0] * lp[0] + lp[1] * lp[1]);
        if (dist > 0.93) continue;
        var TX = cx + lp[0] * R, TY = cy - lp[1] * R;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = t.labelHalo;
        ctx.strokeText(L[0], TX, TY);
        ctx.fillStyle = t.label;
        ctx.fillText(L[0], TX, TY);
      }
    }

    // 受光：左上亮一点、右下压暗一点，球就有了立体感
    var sh = ctx.createRadialGradient(cx - R * 0.36, cy - R * 0.42, R * 0.08, cx, cy, R * 1.08);
    sh.addColorStop(0, 'rgba(255,255,255,.16)');
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.07)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 一圈细边
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = t.limb;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 球下方的柔影
    var sg = ctx.createRadialGradient(cx, cy + R * 1.02, R * 0.1, cx, cy + R * 1.02, R * 0.9);
    sg.addColorStop(0, 'rgba(30,40,60,.10)');
    sg.addColorStop(1, 'rgba(30,40,60,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  };

  ZMap.prototype.renderMarks = function () {
    var w = this.w, h = this.h;

    if (this.useGlobe()) {
      var G = this._globe();
      this.markers.forEach(function (m) {
        if (!m.el) return;
        var p = G.project(m.lng, m.lat);
        if (!p[2]) { m.el.style.display = 'none'; return; }
        m.el.style.display = '';
        m.el.classList.add('is-globed');
        m.el.style.transform = 'translate(' + Math.round(G.cx + p[0] * G.R) + 'px,' +
                               Math.round(G.cy - p[1] * G.R) + 'px)';
      });
      return;
    }

    var px0 = this.cx - w / 2, py0 = this.cy - h / 2;
    this.markers.forEach(function (m) {
      if (!m.el) return;
      var x = lon2x(m.lng, this.z) * TILE - px0;
      var y = lat2y(m.lat, this.z) * TILE - py0;
      if (x < -80 || y < -80 || x > w + 80 || y > h + 80) { m.el.style.display = 'none'; return; }
      m.el.style.display = '';
      m.el.classList.remove('is-globed');
      m.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }, this);
  };

  ZMap.prototype.setBase = function (kind) {
    this.base = kind;
    this.tileOk = 0; this.tileFail = 0;
    this._fellBack = false;
    this._dropTiles();
    this.tileLayer.setAttribute('data-base', kind);
    this.hint.classList.remove('on');
    this.render();
  };

  /** 兼容旧调用名 */
  ZMap.prototype.setTile = ZMap.prototype.setBase;

  return ZMap;
})();
