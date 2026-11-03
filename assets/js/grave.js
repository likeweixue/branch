/* ============================================================================
 * 坟茔页：星空（canvas）+ 地图视图 + 名册联动
 * 星星越多 = 家族走得人越多；越亮 = 与你越近（服务端按亲属跳数算好 score）
 * ========================================================================== */
(function () {
  'use strict';
  var D = window.ZP_GRAVE || { graves: [] };
  var graves = D.graves || [];
  var canvas = document.getElementById('gvCanvas');
  if (!canvas || !graves.length) return;
  var ctx = canvas.getContext('2d');
  var tipEl = document.getElementById('gvTip');
  var detailEl = document.getElementById('gvDetail');
  var skyEl = document.getElementById('gvSky');

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function relLabel(d) {
    if (d === null || d === undefined) return '无直系血缘路径';
    if (d === 0) return '本人';
    if (d === 1) return '父母 / 子女 / 配偶';
    if (d === 2) return '祖辈 / 兄弟 / 孙辈';
    if (d === 3) return '曾祖辈 / 叔伯姑舅姨';
    return '第 ' + d + ' 层亲属';
  }
  function relText(g) {
    if (!D.hasUser) return '登录后按亲疏分亮暗';
    var t = relLabel(g.dist);
    return g.lineal ? '直系血脉 · ' + t : t;
  }

  /* ---------- 星空 ---------- */
  var stars = graves.map(function (g) {
    var h = hash(g.id);
    return {
      g: g,
      x: 0, y: 0,
      r: 2.2 + 4.0 * (g.score || 0.2),
      phase: (h % 1000) / 1000 * Math.PI * 2,
      speed: 0.5 + ((h >>> 10) % 60) / 100,
      bright: 0
    };
  });
  // 亮的先排，占据更好的位置
  stars.sort(function (a, b) { return b.g.score - a.g.score; });

  var dust = [];
  var dustCanvas = document.createElement('canvas');
  var dctx = dustCanvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  function layout() {
    var rect = skyEl.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(260, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // 全屏时画布大得多，星点跟着放大，否则在 27 寸屏上像撒了几粒盐
    var sc = Math.max(0.85, Math.min(1.85, Math.sqrt((W * H) / 720000)));

    var padX = W < 640 ? 34 : 62;
    var padTop = W < 640 ? 96 : 104;
    var padBottom = 56;
    var areaW = W - padX * 2, areaH = H - padTop - padBottom;
    var minD = Math.max(46, Math.sqrt((areaW * areaH) / stars.length) * 0.52);

    var i_ = 0;
    stars.forEach(function (s) {
      s.r = (2.2 + 4.0 * (s.g.score || 0.2)) * sc;
      var placed = false;
      for (var tryN = 0; tryN < 40; tryN++) {
        var h = hash(s.g.id + ':' + tryN);
        var x = padX + ((h % 997) / 997) * areaW;
        var y = padTop + (((h >>> 9) % 991) / 991) * areaH;
        var ok = true;
        for (var j = 0; j < i_; j++) {
          var dx = stars[j].x - x, dy = stars[j].y - y;
          if (Math.sqrt(dx * dx + dy * dy) < minD) { ok = false; break; }
        }
        if (ok) { s.x = x; s.y = y; placed = true; break; }
      }
      if (!placed) {
        s.x = padX + Math.random() * areaW;
        s.y = padTop + Math.random() * areaH;
      }
      i_++;
    });

    // 星尘：离屏画一次
    dust = [];
    var dn = Math.round(Math.min(900, (W * H) / 2400));
    for (var k = 0; k < dn; k++) {
      var hh = hash('dust' + k);
      dust.push({
        x: ((hh % 9973) / 9973) * W,
        y: (((hh >>> 11) % 9973) / 9973) * H,
        r: (0.4 + ((hh >>> 5) % 100) / 160) * Math.min(1.4, sc),
        a: 0.1 + ((hh >>> 17) % 100) / 320
      });
    }
    dustCanvas.width = Math.round(W * DPR);
    dustCanvas.height = Math.round(H * DPR);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.clearRect(0, 0, W, H);
    dust.forEach(function (d) {
      dctx.beginPath();
      dctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      dctx.fillStyle = 'rgba(200,215,255,' + d.a + ')';
      dctx.fill();
    });
  }

  var hover = null, selected = null;

  function paint(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(dustCanvas, 0, 0, W, H);

    stars.forEach(function (s) {
      var isHover = hover === s;
      var isSel = selected === s;
      var twinkle = 0.82 + 0.18 * Math.sin(t * 0.001 * s.speed + s.phase);
      var base = s.g.score;
      var a = Math.min(1, (0.45 + base * 0.55) * twinkle);
      if (isHover || isSel) a = 1;

      var r = s.r * (isHover || isSel ? 1.5 : 1);
      // 光晕
      var gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 9);
      var glowA = a * (0.14 + base * 0.26);
      gr.addColorStop(0, 'rgba(198,220,255,' + glowA.toFixed(3) + ')');
      gr.addColorStop(0.45, 'rgba(150,180,255,' + (glowA * 0.36).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 9, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();

      // 核心
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.fill();

      // 亮星加一点星芒
      if (base > 0.45 || isHover || isSel) {
        ctx.save();
        ctx.globalAlpha = (isHover || isSel) ? 0.5 : 0.22 * a;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 0.9;
        var L = r * (isHover || isSel ? 7 : 4.4);
        ctx.beginPath();
        ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
        ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
        ctx.stroke();
        ctx.restore();
      }

      // 选中环
      if (isSel) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 3.4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,176,102,.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  function loop(t) {
    paint(t);
    requestAnimationFrame(loop);
  }

  function pick(mx, my) {
    var best = null, bestD = 22;
    stars.forEach(function (s) {
      var dx = s.x - mx, dy = s.y - my;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }

  canvas.addEventListener('mousemove', function (e) {
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var hit = pick(mx, my);
    hover = hit;
    if (!hit) { tipEl.classList.remove('on'); return; }
    var g = hit.g;
    tipEl.innerHTML = '<b>' + esc(g.name) + '</b>' +
      (g.who.length ? '<span>' + g.who.map(function (w) { return esc(w.name); }).join('、') + '</span><br>' : '') +
      (g.place ? '葬于 <em>' + esc(g.place) + '</em>' : '<span>未记地名</span>') +
      '<br><span>' + esc(relText(g)) + '</span>';
    tipEl.classList.add('on');
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = mx + 16, y = my - th - 12;
    if (x + tw > W - 8) x = mx - tw - 16;
    if (y < 8) y = my + 18;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  });
  canvas.addEventListener('mouseleave', function () {
    hover = null;
    tipEl.classList.remove('on');
  });
  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect();
    var hit = pick(e.clientX - r.left, e.clientY - r.top);
    if (hit) { selected = hit; showDetail(hit.g); highlightCard(hit.g.id, false); }
  });

  /* ---------- 详情卡 ---------- */
  function showDetail(g) {
    detailEl.hidden = false;
    var rows = '';
    if (g.place) rows += '<div class="d-row"><span>地名</span><b>' + esc(g.place) + '</b></div>';
    if (g.facing) rows += '<div class="d-row"><span>朝向</span><b>' + esc(g.facing) + '</b></div>';
    if (g.type) rows += '<div class="d-row"><span>形制</span><b>' + esc(g.type) + '</b></div>';
    if (g.date) rows += '<div class="d-row"><span>立碑</span><b>' + esc(g.date) + '</b></div>';
    if (g.visited) rows += '<div class="d-row"><span>祭扫</span><b>' + esc(g.visited) + '</b></div>';
    rows += '<div class="d-row"><span>与你的距离</span><b>' + esc(relText(g)) + '</b></div>';
    if (g.lat != null) rows += '<div class="d-row"><span>坐标</span><b>' + g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) + '</b></div>';

    var photos = (g.photos || []).length
      ? '<div class="d-photos">' + g.photos.slice(0, 3).map(function (p) {
          return '<a href="' + esc(p) + '" target="_blank" rel="noopener"><img src="' + esc(p) + '" alt="" referrerpolicy="no-referrer"></a>';
        }).join('') + '</div>'
      : '';

    detailEl.innerHTML =
      '<button class="d-x" type="button" title="关闭">✕</button>' +
      '<h3>' + esc(g.name) + '</h3>' +
      '<div class="d-who">' + (g.who.length ? g.who.map(function (w) {
        return esc(w.name) + (w.zi_bei ? '（' + esc(w.zi_bei) + '）' : '');
      }).join('、') : '未关联家人') + '</div>' +
      rows +
      (g.address ? '<p class="d-note">' + esc(g.address) + '</p>' : '') +
      (g.note ? '<p class="d-note">' + esc(g.note) + '</p>' : '') +
      photos;
    detailEl.querySelector('.d-x').addEventListener('click', function () {
      detailEl.hidden = true;
      selected = null;
    });
  }

  function highlightCard(id, scroll) {
    document.querySelectorAll('.gv-card.on').forEach(function (c) { c.classList.remove('on'); });
    var c = document.getElementById('grave-' + id);
    if (!c) return;
    if (scroll) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- 地图视图 ---------- */
  var map = null;
  function ensureMap() {
    if (map) return;
    var el = document.getElementById('gvMap');
    var geo = graves.filter(function (g) { return g.lat != null && g.lng != null; });
    map = new ZMap(el, {
      center: geo.length ? [geo[0].lat, geo[0].lng] : [26.0, 113.0],
      zoom: geo.length ? 12 : 9,
      base: 'atlas',
      theme: 'dark'
    });
    map.setMarkers(geo.map(function (g) {
      return {
        id: g.id,
        lat: g.lat,
        lng: g.lng,
        cls: 'is-grave',
        title: g.name + (g.place ? ' · ' + g.place : ''),
        html: '<span class="zm-pin"><i></i></span>',
        onClick: function (m) { showDetail(g); highlightCard(g.id, true); }
      };
    }));
    if (geo.length) map.fitMarkers();
    var tiles = document.getElementById('gvTiles');
    if (tiles) {
      tiles.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        tiles.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        map.setBase(b.getAttribute('data-tile'));
      });
      map.on('basechange', function (k) {
        tiles.querySelectorAll('button').forEach(function (x) {
          x.classList.toggle('on', x.getAttribute('data-tile') === k);
        });
      });
    }
    // 定位按钮
    document.querySelectorAll('.gv-locate').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-locate');
        var g = graves.filter(function (x) { return x.id === id; })[0];
        if (!g || g.lat == null) return;
        switchView('map');
        setTimeout(function () {
          ensureMap();
          map.setView(g.lat, g.lng, 15);
          showDetail(g);
        }, 60);
      });
    });
  }

  /* ---------- 全屏星空 ---------- */
  var exitBtn = document.getElementById('gvExit');
  var full = false;

  function setFull(on) {
    if (full === on) return;
    full = on;
    skyEl.classList.toggle('is-full', on);
    document.body.classList.toggle('gv-locked', on);
    if (exitBtn) exitBtn.hidden = !on;
    if (!skyEl.hidden) {
      requestAnimationFrame(function () {
        layout();
        paint(window.performance ? performance.now() : 0);
      });
    }
  }

  if (exitBtn) exitBtn.addEventListener('click', function () { setFull(false); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && full) {
      setFull(false);
      e.preventDefault();
    }
  });

  function switchView(v) {
    var mp = document.getElementById('gvMapView');
    document.querySelectorAll('#gvTabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === v);
    });
    if (v === 'map') {
      setFull(false);
      detailEl.hidden = true;
      skyEl.hidden = true;
      mp.hidden = false;
      ensureMap();
      setTimeout(function () { if (map) map.resize(); }, 30);
    } else {
      mp.hidden = true;
      skyEl.hidden = false;
      layout();
      paint(window.performance ? performance.now() : 0);
    }
  }

  document.getElementById('gvTabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.getAttribute('data-view') === 'sky') {
      // 点「星空」= 铺满整个浏览器
      switchView('sky');
      setFull(true);
    } else {
      switchView('map');
    }
  });

  // 名册卡片点击 → 星空里点亮（并全屏）
  document.querySelectorAll('.gv-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;
      var id = card.getAttribute('data-grave');
      var s = stars.filter(function (x) { return x.g.id === id; })[0];
      if (!s) return;
      switchView('sky');
      setFull(true);
      selected = s;
      showDetail(s.g);
      highlightCard(id, false);
    });
  });

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (!skyEl.hidden) layout();
      else if (map) map.resize();
    }, 160);
  });

  layout();
  paint(0);                        // 先同步画一帧，别等 rAF（后台标签页/无头截图会推迟回调）
  requestAnimationFrame(loop);

  // 初始视图（?view=map 可直链）
  var onBtn = document.querySelector('#gvTabs button.on');
  if (onBtn && onBtn.getAttribute('data-view') === 'map') switchView('map');

  // 深链：#gv=gv1
  var m = (location.hash || '').match(/gv=([\w\-]+)/);
  if (m) {
    var g0 = graves.filter(function (x) { return x.id === m[1]; })[0];
    if (g0) {
      var s0 = stars.filter(function (x) { return x.g.id === g0.id; })[0];
      if (s0) { selected = s0; showDetail(g0); }
    }
  }
})();
