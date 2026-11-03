/* ============================================================================
 * 土地页：地块列表 ↔ 地图联动
 * ========================================================================== */
(function () {
  'use strict';
  var D = window.ZP_LAND || { lands: [] };
  var lands = D.lands || [];
  var box = document.getElementById('plMap');
  if (!box) return;

  var geo = lands.filter(function (l) { return l.lat != null && l.lng != null; });
  var center = geo.length ? [geo[0].lat, geo[0].lng] : [26.0, 113.0];
  var map = new ZMap(box, { center: center, zoom: geo.length ? 13 : 10 });

  if (!geo.length) {
    var none = document.createElement('div');
    none.className = 'pl-map-none';
    none.innerHTML = '<b>还没有地块标点</b><span>在后台填入经纬度后，这里会显示地块分布</span>';
    box.appendChild(none);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function cardOf(id) { return document.getElementById('land-' + id); }

  function highlight(id, scroll) {
    document.querySelectorAll('.pl-card.on').forEach(function (c) { c.classList.remove('on'); });
    var c = cardOf(id);
    if (!c) return;
    c.classList.add('on');
    if (scroll) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
      onClick: function (m) { highlight(m.id, true); }
    };
  }));
  if (geo.length) map.fitMarkers();

  // 卡片上的「定位 ↗」
  document.querySelectorAll('[data-locate]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-locate');
      var l = lands.filter(function (x) { return x.id === id; })[0];
      if (!l || l.lat == null) return;
      map.setView(l.lat, l.lng, Math.max(map.z, 15));
      highlight(id, false);
    });
  });

  // 底图切换
  var tiles = document.getElementById('plTiles');
  if (tiles) {
    tiles.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      tiles.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      map.setTile(b.getAttribute('data-tile'));
    });
  }
})();
