/* ============================================================================
 * 家族相册：错位照片墙（瀑布流铺贴）
 *   - 滚轮缩放：改变每张照片的基准宽度，列数与铺贴方式随之重排（以光标为锚点）
 *   - 拖拽平移：像一张可以推来推去的桌面
 *   - 点击放大：灯箱内左右翻看，支持 ← → Esc
 * 照片只存图床直链，这里不涉及上传。
 * ========================================================================== */
(function () {
  'use strict';

  var DATA = window.ZP_ALBUM || { photos: [] };
  var stage = document.getElementById('alStage');
  var wall = document.getElementById('alWall');
  if (!stage || !wall) return;

  var all = (DATA.photos || []).slice();

  /* ---------- 尺寸常量 ---------- */
  var GAP = 12;          // 照片间距
  var SIDEPAD = 26;      // 画布左右留白
  var MINW = 128;        // 最小基准宽度
  var MAXW = 720;        // 最大基准宽度（手动缩放上限）
  var FITMAX = 400;      // 适屏时的上限：留一点「墙」的密度，别把一张照片铺满屏
  var DEF_RATIO = 4 / 3; // 图片宽高比未知时的占位比例

  var tileW = 300;       // 当前基准宽度
  var REF = 300;         // 「100%」对应的基准宽度
  var pan = { x: 0, y: 0 };
  var geo = {};          // id -> {x,y,w,h} 铺贴后的世界坐标
  var els = {};          // id -> DOM
  var ratio = {};        // id -> 宽高比（取自 naturalWidth/Height）
  var list = [];         // 当前可见（筛选后）照片
  var activeYear = '';
  var keyword = '';
  var userTouched = false;
  var reflowTimer = 0;

  var hud = document.getElementById('alHud');
  var pctEl = document.getElementById('alPct');
  var blank = document.getElementById('alBlank');

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function topPad() {
    if (!hud || hud.hidden) return 24;
    var r = hud.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return Math.max(24, Math.round(r.bottom - s.top + 16));
  }
  function availW() { return Math.max(240, stage.clientWidth - SIDEPAD * 2); }
  function availH() { return Math.max(220, stage.clientHeight - topPad() - 70); }

  function colsFor(w) {
    return clamp(Math.floor((availW() + GAP) / (w + GAP)), 1, 12);
  }

  /* ---------- 铺贴：最短列优先，形成错位瀑布流 ---------- */
  function simulate(w) {
    var cols = colsFor(w), colH = [], i;
    for (i = 0; i < cols; i++) colH.push(topPad());
    list.forEach(function (p) {
      var h = Math.round(w / (ratio[p.id] || DEF_RATIO));
      var c = 0;
      for (var k = 1; k < cols; k++) if (colH[k] < colH[c] - 0.5) c = k;
      colH[c] = colH[c] + h + GAP;
    });
    var maxH = 0;
    for (i = 0; i < cols; i++) maxH = Math.max(maxH, colH[i]);
    return { w: cols * w + (cols - 1) * GAP, h: Math.max(0, maxH - GAP) };
  }

  function layout() {
    if (!list.length) return;
    var cols = colsFor(tileW);
    var usedW = cols * tileW + (cols - 1) * GAP;
    var x0 = SIDEPAD + Math.max(0, (availW() - usedW) / 2);
    var colH = [], colX = [], i;
    for (i = 0; i < cols; i++) {
      colH.push(topPad());
      colX.push(x0 + i * (tileW + GAP));
    }
    list.forEach(function (p) {
      var h = Math.round(tileW / (ratio[p.id] || DEF_RATIO));
      var c = 0;
      for (var k = 1; k < cols; k++) if (colH[k] < colH[c] - 0.5) c = k;
      var x = Math.round(colX[c]), y = Math.round(colH[c]);
      var el = els[p.id];
      if (el) {
        el.style.width = tileW + 'px';
        el.style.height = h + 'px';
        el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      }
      geo[p.id] = { x: x, y: y, w: tileW, h: h };
      colH[c] = y + h + GAP;
    });
    var maxH = 0;
    for (i = 0; i < cols; i++) maxH = Math.max(maxH, colH[i]);
    wall.style.width = usedW + 'px';
    wall.style.height = Math.max(0, maxH - GAP) + 'px';
    updatePct();
  }

  /* ---------- 默认视图：按「一屏约 4~5 列」铺，铺不下就往下铺（可拖拽看） ---------- */
  function defaultView() {
    if (!list.length) return;
    tileW = Math.round(clamp(availW() / 4.4, Math.min(MINW, availW()), Math.min(FITMAX, availW())));
    REF = tileW;
    layout();
    pan = { x: 0, y: 0 };
    applyPan();
  }

  /* ---------- 适屏：二分找「全部装进一屏」的最大基准宽度 ---------- */
  function fit() {
    if (!list.length) return;
    var maxW = Math.min(FITMAX, availW());
    var lo = Math.min(MINW, maxW), hi = maxW, best = lo;
    for (var it = 0; it < 12; it++) {
      var mid = (lo + hi) / 2;
      var s = simulate(mid);
      if (s.h <= availH() && s.w <= availW()) { best = mid; lo = mid; } else { hi = mid; }
    }
    tileW = Math.round(clamp(best, Math.min(MINW, maxW), maxW));
    layout();
    pan = { x: 0, y: 0 };
    applyPan();
  }

  function applyPan() {
    wall.style.transform = 'translate3d(' + pan.x + 'px,' + pan.y + 'px,0)';
  }

  function updatePct() {
    if (!pctEl) return;
    var p = Math.round(tileW / REF * 100);
    pctEl.textContent = p + '%';
  }

  /* ---------- 构建 DOM ---------- */
  function build() {
    wall.innerHTML = '';
    els = {};
    geo = {};
    list.forEach(function (p) {
      var el = document.createElement('figure');
      el.className = 'al-item';
      el.setAttribute('data-id', p.id);
      el.title = p.title || '';

      var img = document.createElement('img');
      img.className = 'al-img';
      img.alt = p.title || '家族照片';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', function () {
        if (!img.naturalWidth || !img.naturalHeight) return;
        var r = img.naturalWidth / img.naturalHeight;
        if (Math.abs((ratio[p.id] || 0) - r) > 0.002) {
          ratio[p.id] = r;
          reflowSoon();
        }
      });
      img.addEventListener('error', function () { el.classList.add('is-broken'); });
      img.src = p.url;
      el.appendChild(img);

      var cap = document.createElement('figcaption');
      cap.className = 'al-cap';
      var b = document.createElement('b');
      b.textContent = p.title || '未命名';
      cap.appendChild(b);
      var meta = [p.date, p.place].filter(function (s) { return s && String(s).trim(); }).join(' · ');
      if (meta) {
        var sp = document.createElement('span');
        sp.textContent = meta;
        cap.appendChild(sp);
      }
      el.appendChild(cap);

      wall.appendChild(el);
      els[p.id] = el;
      if (!ratio[p.id]) ratio[p.id] = DEF_RATIO;
    });
  }

  /* 图片陆续加载完成、比例变化后重排（用户已手动缩放则不再抢镜头） */
  function reflowSoon() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(function () {
      if (userTouched) layout(); else defaultView();
    }, 120);
  }

  /* ---------- 缩放（以光标为锚点） ---------- */
  function itemAt(lx, ly) {
    var wx = lx - pan.x, wy = ly - pan.y;
    for (var i = 0; i < list.length; i++) {
      var g = geo[list[i].id];
      if (g && wx >= g.x && wx <= g.x + g.w && wy >= g.y && wy <= g.y + g.h) return list[i].id;
    }
    return null;
  }

  function zoomAt(cx, cy, factor) {
    if (!list.length) return;
    var s = stage.getBoundingClientRect();
    var lx = cx - s.left, ly = cy - s.top;
    var id = itemAt(lx, ly);
    var oldW = tileW;
    var nw = Math.round(clamp(tileW * factor, MINW, Math.min(MAXW, availW())));
    if (nw === oldW) { updatePct(); return; }

    var rel = null;
    if (id) {
      var g0 = geo[id];
      rel = { fx: (lx - pan.x - g0.x) / g0.w, fy: (ly - pan.y - g0.y) / g0.h };
    }
    userTouched = true;
    tileW = nw;
    layout();

    if (id && rel) {
      var g = geo[id];
      pan.x += lx - (pan.x + g.x + rel.fx * g.w);
      pan.y += ly - (pan.y + g.y + rel.fy * g.h);
    } else {
      var k = tileW / oldW;
      pan.x = lx - (lx - pan.x) * k;
      pan.y = ly - (ly - pan.y) * k;
    }
    applyPan();
  }

  /* ---------- 拖拽平移 ---------- */
  var drag = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    drag = {
      sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: 0,
      item: e.target.closest ? e.target.closest('.al-item') : null
    };
    stage.classList.add('grabbing');
    if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > drag.moved) drag.moved = Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4) {
      userTouched = true;
      pan.x = drag.px + dx;
      pan.y = drag.py + dy;
      applyPan();
    }
  });
  function endDrag() {
    if (!drag) return;
    var click = drag.moved <= 4, item = drag.item;
    drag = null;
    stage.classList.remove('grabbing');
    if (click && item) openLb(item.getAttribute('data-id'));
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', function () { drag = null; stage.classList.remove('grabbing'); });

  stage.addEventListener('wheel', function (e) {
    if (!list.length) return;
    e.preventDefault();
    var step = Math.abs(e.deltaY) > 60 ? 0.16 : 0.1;
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 + step : 1 / (1 + step));
  }, { passive: false });

  /* ---------- 灯箱 ---------- */
  var lb = document.getElementById('alLb');
  var lbImg = document.getElementById('alLbImg');
  var lbTitle = document.getElementById('alLbTitle');
  var lbMeta = document.getElementById('alLbMeta');
  var lbNote = document.getElementById('alLbNote');
  var lbCount = document.getElementById('alLbCount');
  var curIdx = -1;

  function renderLb() {
    var p = list[curIdx];
    if (!p) return;
    lbImg.src = p.url;
    lbImg.alt = p.title || '家族照片';
    lbTitle.textContent = p.title || '未命名';
    var meta = [p.date, p.place].filter(function (s) { return s && String(s).trim(); });
    if (p.who && p.who.length) meta.push(p.who.join('、'));
    lbMeta.textContent = meta.join(' · ');
    lbMeta.hidden = !meta.length;
    lbNote.textContent = p.note || '';
    lbNote.hidden = !String(p.note || '').trim();
    lbCount.textContent = (curIdx + 1) + ' / ' + list.length;
  }
  function openLb(id) {
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === id) { i = k; break; }
    if (i < 0) return;
    curIdx = i;
    renderLb();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLb() {
    lb.hidden = true;
    curIdx = -1;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
  }
  function stepLb(d) {
    if (curIdx < 0 || !list.length) return;
    curIdx = (curIdx + d + list.length) % list.length;
    renderLb();
  }

  document.getElementById('alLbX').addEventListener('click', closeLb);
  document.getElementById('alLbPrev').addEventListener('click', function (e) { e.stopPropagation(); stepLb(-1); });
  document.getElementById('alLbNext').addEventListener('click', function (e) { e.stopPropagation(); stepLb(1); });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target.classList.contains('al-lb-stage')) closeLb();
  });

  document.addEventListener('keydown', function (e) {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') stepLb(-1);
      else if (e.key === 'ArrowRight') stepLb(1);
      return;
    }
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === '+' || e.key === '=') zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1.14);
    else if (e.key === '-' || e.key === '_') zoomAt(stage.clientWidth / 2 + stage.getBoundingClientRect().left, stage.clientHeight / 2 + stage.getBoundingClientRect().top, 1 / 1.14);
    else if (e.key === '0') { userTouched = false; defaultView(); }
  });

  /* ---------- 缩放按钮 ---------- */
  function centerZoom(f) {
    var s = stage.getBoundingClientRect();
    zoomAt(s.left + s.width / 2, s.top + s.height / 2, f);
  }
  var zin = document.getElementById('alIn'), zout = document.getElementById('alOut'), zfit = document.getElementById('alFit');
  if (zin) zin.addEventListener('click', function () { centerZoom(1.16); });
  if (zout) zout.addEventListener('click', function () { centerZoom(1 / 1.16); });
  if (zfit) zfit.addEventListener('click', function () { userTouched = false; fit(); });

  /* ---------- 筛选 / 搜索 ---------- */
  var search = document.getElementById('alSearch');
  var chips = Array.prototype.slice.call(document.querySelectorAll('#alChips .al-chip'));

  function updateEmpty() {
    if (!blank) return;
    if (!all.length) { blank.hidden = false; return; }
    if (!list.length) {
      blank.hidden = false;
      blank.innerHTML = '<div class="al-blank-ic">▤</div><h3>没有匹配的照片</h3><p>换个关键词或年份试试。</p>';
    } else {
      blank.hidden = true;
    }
  }

  function applyFilter() {
    var kw = keyword.trim().toLowerCase();
    list = all.filter(function (p) {
      if (activeYear && p.year !== activeYear) return false;
      if (!kw) return true;
      var hay = [p.title, p.place, p.note, p.date].concat(p.who || []).join(' ').toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
    userTouched = false;
    build();
    defaultView();
    updateEmpty();
    if (curIdx >= 0) {
      if (!list.length) closeLb();
      else { if (curIdx >= list.length) curIdx = 0; renderLb(); }
    }
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      activeYear = c.getAttribute('data-year') || '';
      applyFilter();
    });
  });
  if (search) {
    var sTimer = 0;
    search.addEventListener('input', function () {
      clearTimeout(sTimer);
      sTimer = setTimeout(function () { keyword = search.value; applyFilter(); }, 160);
    });
  }

  /* ---------- 窗口尺寸变化 ---------- */
  var rTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rTimer);
    rTimer = setTimeout(function () {
      if (userTouched) { layout(); } else { defaultView(); }
    }, 180);
  });

  /* ---------- 启动 ---------- */
  if (!all.length) { updateEmpty(); return; }
  list = all.slice();
  build();
  defaultView();
  updateEmpty();
})();
