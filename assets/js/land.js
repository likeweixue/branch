/* ============================================================================
 * 土地页：地块列表 ↔ 地图 两个视图
 *   默认只显示地块卡片；点「地图」才创建并铺开地图（懒加载，省流量）
 * ========================================================================== */
(function () {
  'use strict';
  var D = window.ZP_LAND || { lands: [] };
  var lands = D.lands || [];
  var grid = document.getElementById('plGrid');
  var tabs = document.getElementById('plTabs');
  var popEl = document.getElementById('plPop');
  if (!grid || !tabs) return;

  var geo = lands.filter(function (l) { return l.lat != null && l.lng != null; });
  var map = null;
  var view = 'list';
  var curPop = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function cardOf(id) { return document.getElementById('land-' + id); }
  function landOf(id) {
    for (var i = 0; i < lands.length; i++) if (lands[i].id === id) return lands[i];
    return null;
  }

  function highlight(id, scroll) {
    document.querySelectorAll('.pl-card.on').forEach(function (c) { c.classList.remove('on'); });
    var c = cardOf(id);
    if (!c) return;
    c.classList.add('on');
    if (scroll) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- 地图（首次切到地图视图才创建） ---------- */
  function initMap() {
    if (map) return;
    var box = document.getElementById('plMap');
    if (!box) return;

    if (!geo.length) {
      var none = document.createElement('div');
      none.className = 'pl-map-none';
      none.innerHTML = '<b>还没有地块标点</b><span>在后台填入经纬度后，这里会显示地块分布</span>';
      box.appendChild(none);
      return;
    }

    // 记住上次选的底图（默认素白）
    var savedBase = 'plain';
    try {
      var sb = localStorage.getItem('zp_land_base');
      if (sb === 'plain' || sb === 'gaode' || sb === 'atlas') savedBase = sb;
    } catch (e) {}

    map = new ZMap(box, {
      center: [geo[0].lat, geo[0].lng],
      zoom: 13,
      base: savedBase,
      theme: 'light'
    });

    map.setMarkers(geo.map(function (l) {
      var sub = [];
      if (l.area !== '') sub.push(l.area + (l.unit || '亩'));
      if (l.status) sub.push(l.status);
      return {
        id: l.id,
        lat: l.lat,
        lng: l.lng,
        cls: 'is-land',
        title: l.name + (sub.length ? ' · ' + sub.join(' · ') : ''),
        html: '<span class="zm-tag">' + esc(l.name) + '</span>',
        onClick: function (m) { highlight(m.id, false); showPop(m.id); }
      };
    }));
    map.fitMarkers();

    var tiles = document.getElementById('plTiles');
    if (tiles) {
      tiles.querySelectorAll('button').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-tile') === map.base);
      });
      tiles.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        tiles.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var kind = b.getAttribute('data-tile');
        map.setBase(kind);
        try { localStorage.setItem('zp_land_base', kind); } catch (err) {}
      });
      map.on('basechange', function (k) {
        tiles.querySelectorAll('button').forEach(function (x) {
          x.classList.toggle('on', x.getAttribute('data-tile') === k);
        });
      });
    }
  }

  /* ---------- 地图上的地块浮层 ---------- */
  function showPop(id) {
    var l = landOf(id);
    if (!l || !popEl) return;
    curPop = id;
    var meta = [];
    if (l.area !== '') meta.push('<span><b>' + esc(l.area) + '</b> ' + esc(l.unit || '亩') + '</span>');
    if (l.status) meta.push('<span>' + esc(l.status) + '</span>');
    if (l.location) meta.push('<span>位置 <b>' + esc(l.location) + '</b></span>');
    if (l.owners.length) meta.push('<span>现归 <b>' + esc(l.owners.join('、')) + '</b></span>');

    var last = '';
    if (l.history.length) {
      var h = l.history[l.history.length - 1];
      last = '<p class="pl-pop-last">' + esc(h.date || '待考') + ' · ' + esc(h.event || '变更') +
        (h.to.length ? ' <em>→ ' + esc(h.to.join('、')) + '</em>' : '') +
        (h.note ? '<br>' + esc(h.note) : '') + '</p>';
    }

    popEl.innerHTML =
      '<button class="pl-pop-x" type="button" title="关闭">✕</button>' +
      '<h4>' + esc(l.name) + '</h4>' +
      '<div class="pl-pop-meta">' + meta.join('') + '</div>' +
      last +
      '<button class="pl-pop-go" type="button">完整流转 →</button>';
    popEl.hidden = false;

    popEl.querySelector('.pl-pop-x').addEventListener('click', function () {
      popEl.hidden = true;
      curPop = null;
    });
    popEl.querySelector('.pl-pop-go').addEventListener('click', function () {
      switchView('list');
      highlight(id, true);
    });
  }

  /* ---------- 视图切换 ---------- */
  function switchView(v) {
    view = v;
    grid.setAttribute('data-view', v);
    tabs.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === v);
    });
    if (v === 'map') {
      initMap();
      if (map) {
        requestAnimationFrame(function () {
          map.resize();
          if (!map._fitted) { map.fitMarkers(); map._fitted = true; }
        });
      }
    } else if (popEl) {
      popEl.hidden = true;
      curPop = null;
    }
  }

  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) switchView(b.getAttribute('data-view'));
  });

  // 卡片上的「定位 ↗」
  document.querySelectorAll('[data-locate]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-locate');
      var l = landOf(id);
      if (!l || l.lat == null) return;
      switchView('map');
      setTimeout(function () {
        if (!map) return;
        map.setView(l.lat, l.lng, Math.max(map.z, 15));
        highlight(id, false);
        showPop(id);
      }, 40);
    });
  });

  // 初始视图：服务端已写好 data-view（?view=map 可直链）
  if (grid.getAttribute('data-view') === 'map') switchView('map');
})();
