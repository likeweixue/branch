/* ============================================================================
 * 画布编辑器（无边记式）
 *  - 横排 / 竖排自由切换，自动排列保证「一列列 / 一行行」对齐
 *  - 拖拽节点时自动吸附其他节点的边与中线，并显示辅助线
 *  - 可增删成员、删除关系线、设置箭头方向
 *  - 「保存布局」把手工摆好的位置存下来，前台族谱照着显示
 * ========================================================================== */
(function () {
  'use strict';
  var STATE = window.ZP_ED || { members: [], settings: {}, me: null };
  var members = STATE.members || [];
  var settings = STATE.settings || {};
  var me = STATE.me || null;
  var lines = settings.lines || {};

  var PARENT_COLOR = lines.parent || '#cfd3d8';
  var MARRIAGE_COLOR = lines.marriage || '#e5484d';

  var byId = {};
  members.forEach(function (m) { byId[m.id] = m; });

  var posMap = {};            // id -> {x, y} 节点左上角（世界坐标）
  var nodeEls = {};           // id -> element
  var arrows = {};            // 'parent:m1>m2' -> 'to' | 'back'
  Object.keys(STATE.arrows || {}).forEach(function (k) { arrows[k] = STATE.arrows[k]; });

  var orient = STATE.layout === 'vertical' ? 'vertical' : 'horizontal';
  var posMode = STATE.layoutMode === 'custom' ? 'custom' : 'auto';
  var view = { x: 0, y: 0, scale: 1 };
  var mode = 'move';
  var pending = null;         // 连线模式的起点
  var selected = null;        // 当前选中的节点

  var stage = document.getElementById('edStage');
  var world = document.getElementById('edWorld');
  var nodesLayer = document.getElementById('edNodes');
  var svg = document.getElementById('edLines');
  var guideV = document.getElementById('edGuideV');
  var guideH = document.getElementById('edGuideH');
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* 尺寸与排列常量 */
  var NODE_W = 132, NODE_H = 56;
  var COL_W = 320, ROW_H = 112;          // 横排：列宽 / 行高
  var COL_W_V = 320, ROW_H_V = 150;      // 竖排：列宽 / 行高
  var PARTNER_GAP = 14, PARTNER_OFF = NODE_W + PARTNER_GAP;
  var PAD = 90;

  function toast(msg) {
    var t = document.getElementById('zpToast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function get(id) { return byId[id]; }
  function setLayoutState() {
    var el = document.getElementById('edLayoutState');
    if (!el) return;
    el.textContent = posMode === 'custom' ? '自定义布局' : '自动排列';
    el.classList.toggle('is-custom', posMode === 'custom');
  }

  /* ------------------------------------------------------------------
   * 自动排列
   * 夫妻合并成「家庭单元」，父母落在子女正中：
   * 横排 → 一代一列、同代一行；竖排 → 一代一行、同代一列。
   * ------------------------------------------------------------------ */
  function cmpOrder(a, b) {
    var oa = a.order || 0, ob = b.order || 0;
    if (oa !== ob) return oa - ob;
    var ba = a.birth || '', bb = b.birth || '';
    if (ba !== bb) return ba < bb ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  }

  function autoLayout(onlyMissing) {
    if (!members.length) return;
    var unitOf = {}, units = [];

    members.forEach(function (m) {
      var u = {
        uid: units.length, ids: [m.id], members: [m], kids: [],
        parent: null, depth: null, slot: null, anchor: m, partner: null
      };
      unitOf[m.id] = u; units.push(u);
    });

    // 夫妻合并
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        var a = unitOf[m.id], b = unitOf[sid];
        if (!a || !b || a === b) return;
        b.ids.forEach(function (id) { unitOf[id] = a; });
        a.ids = a.ids.concat(b.ids);
        a.members = a.members.concat(b.members);
        units.splice(units.indexOf(b), 1);
      });
    });

    // 上溯代数：世系更长的一方坐主位，配偶贴右侧
    var ancCache = {};
    function ancDepth(id, guard) {
      if (ancCache.hasOwnProperty(id)) return ancCache[id];
      if (!id || !byId[id] || guard > 50) return 0;
      ancCache[id] = 0;
      var m = byId[id], d = 0;
      if (m.father_id && byId[m.father_id]) d = Math.max(d, ancDepth(m.father_id, guard + 1) + 1);
      if (m.mother_id && byId[m.mother_id]) d = Math.max(d, ancDepth(m.mother_id, guard + 1) + 1);
      ancCache[id] = d;
      return d;
    }
    units.forEach(function (u) {
      var best = u.members[0], bestScore = -1;
      u.members.forEach(function (m) {
        var hasP = !!(m.father_id && byId[m.father_id]) || !!(m.mother_id && byId[m.mother_id]);
        var score = Math.min(ancDepth(m.id, 0), 9) * 10 + (hasP ? 2 : 0) + (m.gender === 'male' ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = m; }
      });
      u.anchor = best;
      u.partner = u.members.filter(function (m) { return m.id !== best.id; })[0] || null;
    });

    // 父子归属：世系更长的那一支当主干
    units.forEach(function (u) {
      var p = null, bestScore = -1;
      u.ids.forEach(function (id) {
        var m = byId[id]; if (!m) return;
        var cands = [];
        if (m.father_id && unitOf[m.father_id] && unitOf[m.father_id] !== u) cands.push(m.father_id);
        if (m.mother_id && unitOf[m.mother_id] && unitOf[m.mother_id] !== u) cands.push(m.mother_id);
        cands.forEach(function (pid) {
          var s = ancDepth(pid, 0);
          if (s > bestScore) { bestScore = s; p = unitOf[pid]; }
        });
      });
      u.parent = (p && p !== u) ? p : null;
      if (u.parent) u.parent.kids.push(u);
    });

    // 代数
    function unitDepth(u, seen, guard) {
      if (u.depth != null) return u.depth;
      if (guard > 200 || seen[u.uid]) return 0;
      seen[u.uid] = true;
      u.depth = (u.parent && !seen[u.parent.uid]) ? unitDepth(u.parent, seen, guard + 1) + 1 : 0;
      return u.depth;
    }
    units.forEach(function (u) { unitDepth(u, {}, 0); });

    // 同代次序：父辈落在子女正中，树才长得直
    var cursor = 0;
    function placeUnit(u, guard) {
      if (u.slot != null) return u.slot;
      if (guard > 300 || u._busy) { u.slot = cursor++; return u.slot; }
      u._busy = true;
      var kids = u.kids.slice().sort(function (a, b) { return cmpOrder(a.anchor, b.anchor); });
      if (!kids.length) {
        u.slot = cursor++;
      } else {
        var first = null, last = null;
        kids.forEach(function (k) {
          var s = placeUnit(k, guard + 1);
          if (first === null) first = s;
          last = s;
        });
        u.slot = (first + last) / 2;
      }
      delete u._busy;
      return u.slot;
    }
    units.filter(function (u) { return !u.parent; })
      .sort(function (a, b) { return cmpOrder(a.anchor, b.anchor); })
      .forEach(function (u) { placeUnit(u, 0); });
    units.forEach(function (u) { if (u.slot == null) placeUnit(u, 0); });

    // 落坐标
    var colW = orient === 'vertical' ? COL_W_V : COL_W;
    var rowH = orient === 'vertical' ? ROW_H_V : ROW_H;
    var computed = {};
    units.forEach(function (u) {
      var d = u.depth || 0, s = u.slot || 0;
      var ax = (orient === 'vertical' ? s * colW : d * colW) + PAD;
      var ay = (orient === 'vertical' ? d * rowH : s * rowH) + PAD;
      u.members.forEach(function (m) {
        var isPartner = u.partner && m.id === u.partner.id;
        computed[m.id] = { x: ax + (isPartner ? PARTNER_OFF : 0), y: ay };
      });
    });

    Object.keys(computed).forEach(function (id) {
      if (onlyMissing && posMap[id]) return;
      posMap[id] = computed[id];
    });
  }

  /* ------------------------------------------------------------------
   * 节点渲染
   * ------------------------------------------------------------------ */
  function renderNodes() {
    nodesLayer.innerHTML = '';
    nodeEls = {};
    members.forEach(function (m) {
      var p = posMap[m.id] || { x: 80, y: 80 };
      var el = document.createElement('div');
      el.className = 'ed-node' +
        (m.id === me ? ' self' : '') +
        (m.id === pending ? ' pending' : '') +
        (m.id === selected ? ' sel' : '');
      el.dataset.id = m.id;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.innerHTML =
        '<div class="ed-name">' + esc(m.name) + '</div>' +
        '<div class="ed-sub">' +
          (m.zi_bei ? '<span class="ed-zb">' + esc(m.zi_bei) + '</span>' : '') +
          (m.birth ? '<span class="ed-birth">' + esc(m.birth) + '</span>' : '') +
        '</div>';
      nodesLayer.appendChild(el);
      nodeEls[m.id] = el;
      attachNode(el, m.id);
    });
  }

  /* ------------------------------------------------------------------
   * 连线
   * ------------------------------------------------------------------ */
  var defs = null, markerCache = {};

  function arrowKey(type, from, to) {
    if (type === 'marriage') {
      var pair = [from, to].sort();
      return 'marriage:' + pair[0] + '|' + pair[1];
    }
    return 'parent:' + from + '>' + to;
  }

  function markerId(color, at) {
    var c = String(color || '#cfd3d8').replace(/[^0-9a-z]/gi, '');
    var id = 'ed-ar-' + c + '-' + at;
    if (!markerCache[id]) {
      markerCache[id] = true;
      var mk = document.createElementNS(SVGNS, 'marker');
      mk.setAttribute('id', id);
      mk.setAttribute('viewBox', '0 0 10 10');
      mk.setAttribute('refX', at === 'end' ? '9' : '1');
      mk.setAttribute('refY', '5');
      mk.setAttribute('markerWidth', '7');
      mk.setAttribute('markerHeight', '7');
      mk.setAttribute('orient', at === 'end' ? 'auto' : 'auto-start-reverse');
      var mp = document.createElementNS(SVGNS, 'path');
      mp.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      mp.setAttribute('fill', color);
      mk.appendChild(mp);
      defs.appendChild(mk);
    }
    return id;
  }

  function centerOf(id) {
    var p = posMap[id];
    if (!p) return null;
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
  }

  /** 父子线的起点：夫妻之间（或单亲卡边） */
  function junctionOf(pid) {
    var m = get(pid), p = posMap[pid];
    if (!m || !p) return null;
    var sid = null;
    (m.spouse_ids || []).forEach(function (s) { if (!sid && posMap[s]) sid = s; });
    var c = centerOf(pid);
    if (!sid) {
      return orient === 'horizontal'
        ? { x: c.x + NODE_W / 2, y: c.y }
        : { x: c.x, y: c.y + NODE_H / 2 };
    }
    var sc = centerOf(sid);
    if (orient === 'horizontal') {
      var left = Math.min(c.x, sc.x), right = Math.max(c.x, sc.x);
      return { x: (left + NODE_W / 2 + right - NODE_W / 2) / 2, y: c.y };
    }
    return { x: (c.x + sc.x) / 2, y: c.y + NODE_H / 2 };
  }

  function parentPath(j, c) {
    if (orient === 'horizontal') {
      var dir = c.x >= j.x ? 1 : -1;
      var ex = c.x - dir * NODE_W / 2;
      if (Math.abs(ex - j.x) < 30) return 'M' + j.x + ',' + j.y + ' L' + ex + ',' + c.y;
      var mx = j.x + (ex - j.x) / 2;
      return 'M' + j.x + ',' + j.y + ' H' + mx + ' V' + c.y + ' H' + ex;
    }
    var ey = c.y - NODE_H / 2;
    if (Math.abs(ey - j.y) < 30) return 'M' + j.x + ',' + j.y + ' L' + c.x + ',' + ey;
    var my = j.y + (ey - j.y) / 2;
    return 'M' + j.x + ',' + j.y + ' V' + my + ' H' + c.x + ' V' + ey;
  }

  function marriagePath(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      var s = dx >= 0 ? 1 : -1;
      return 'M' + (a.x + s * NODE_W / 2) + ',' + a.y + ' L' + (b.x - s * NODE_W / 2) + ',' + b.y;
    }
    var t = dy >= 0 ? 1 : -1;
    return 'M' + a.x + ',' + (a.y + t * NODE_H / 2) + ' L' + b.x + ',' + (b.y - t * NODE_H / 2);
  }

  function renderLines() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    markerCache = {};

    // 父/母线：每个子女只画一条（优先父亲）
    members.forEach(function (m) {
      var pid = (m.father_id && get(m.father_id)) ? m.father_id : ((m.mother_id && get(m.mother_id)) ? m.mother_id : null);
      if (!pid) return;
      var j = junctionOf(pid), c = centerOf(m.id);
      if (!j || !c) return;
      var color = PARENT_COLOR;
      if (m.link_type) {
        var lt = (settings.line_types || []).filter(function (t) { return t.id === m.link_type; })[0];
        if (lt && lt.color) color = lt.color;
      }
      drawLine(parentPath(j, c), color, 'parent', pid, m.id);
    });

    // 姻亲线（每对只画一次）
    var done = {};
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        if (!get(sid) || !posMap[sid]) return;
        var key = [m.id, sid].sort().join('|');
        if (done[key]) return;
        done[key] = true;
        var a = centerOf(m.id), b = centerOf(sid);
        if (a && b) drawLine(marriagePath(a, b), MARRIAGE_COLOR, 'marriage', m.id, sid);
      });
    });
  }

  function drawLine(d, color, type, from, to) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'ed-line');
    g.dataset.type = type; g.dataset.from = from; g.dataset.to = to;

    var hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '16');

    var line = document.createElementNS(SVGNS, 'path');
    line.setAttribute('d', d); line.setAttribute('fill', 'none');
    line.setAttribute('class', 'ln-body');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', type === 'marriage' ? '2.5' : '1.8');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');

    var arrow = arrows[arrowKey(type, from, to)] || '';
    if (arrow === 'to') line.setAttribute('marker-end', 'url(#' + markerId(color, 'end') + ')');
    else if (arrow === 'back') line.setAttribute('marker-start', 'url(#' + markerId(color, 'start') + ')');

    g.appendChild(hit); g.appendChild(line);
    g.addEventListener('click', function (e) { e.stopPropagation(); onLineClick(type, from, to); });
    svg.appendChild(g);
  }

  /* ------------------------------------------------------------------
   * 视图变换
   * ------------------------------------------------------------------ */
  function applyView() {
    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
  }
  function stageRect() { return stage.getBoundingClientRect(); }
  function toWorld(clientX, clientY) {
    var r = stageRect();
    return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale };
  }
  function fit() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach(function (m) {
      var p = posMap[m.id]; if (!p) return;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
    });
    if (!isFinite(minX)) { view = { x: 40, y: 40, scale: 1 }; applyView(); return; }
    var r = stageRect(), pad = 70;
    var cw = (maxX - minX) + pad * 2, ch = (maxY - minY) + pad * 2;
    var s = Math.min(r.width / cw, r.height / ch, 1.4);
    s = Math.max(0.2, s);
    view.scale = s;
    view.x = (r.width - (maxX - minX) * s) / 2 - minX * s;
    view.y = (r.height - (maxY - minY) * s) / 2 - minY * s;
    applyView();
  }

  /* ------------------------------------------------------------------
   * 平移 / 缩放
   * ------------------------------------------------------------------ */
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = stageRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var before = { x: (mx - view.x) / view.scale, y: (my - view.y) / view.scale };
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view.scale = Math.max(0.12, Math.min(2.6, view.scale * factor));
    view.x = mx - before.x * view.scale;
    view.y = my - before.y * view.scale;
    applyView();
  }, { passive: false });

  var panning = false, panStart = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.ed-node')) return;
    panning = true; stage.classList.add('panning');
    panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', function (e) {
    if (!panning) return;
    view.x = panStart.vx + (e.clientX - panStart.x);
    view.y = panStart.vy + (e.clientY - panStart.y);
    applyView();
  });
  stage.addEventListener('pointerup', function (e) {
    panning = false; stage.classList.remove('panning');
    try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  /* ------------------------------------------------------------------
   * 拖拽吸附
   * ------------------------------------------------------------------ */
  var SNAP_PX = 7;

  function snapPos(id, x, y) {
    var on = document.getElementById('edSnap');
    if (on && !on.checked) return { x: x, y: y, gx: null, gy: null };
    var tol = SNAP_PX / view.scale;
    var xs = [], ys = [];
    members.forEach(function (m) {
      if (m.id === id) return;
      var p = posMap[m.id]; if (!p) return;
      xs.push(p.x, p.x + NODE_W / 2, p.x + NODE_W);
      ys.push(p.y, p.y + NODE_H / 2, p.y + NODE_H);
    });
    var mineX = [x, x + NODE_W / 2, x + NODE_W];
    var mineY = [y, y + NODE_H / 2, y + NODE_H];
    var dx = null, gx = null, dy = null, gy = null;
    mineX.forEach(function (sx) {
      xs.forEach(function (tx) {
        var d = tx - sx;
        if (Math.abs(d) <= tol && (dx === null || Math.abs(d) < Math.abs(dx))) { dx = d; gx = tx; }
      });
    });
    mineY.forEach(function (sy) {
      ys.forEach(function (ty) {
        var d = ty - sy;
        if (Math.abs(d) <= tol && (dy === null || Math.abs(d) < Math.abs(dy))) { dy = d; gy = ty; }
      });
    });
    return { x: x + (dx || 0), y: y + (dy || 0), gx: gx, gy: gy };
  }

  function showGuides(gx, gy) {
    if (gx === null || gx === undefined) { guideV.hidden = true; }
    else {
      guideV.hidden = false;
      guideV.style.left = gx + 'px';
      guideV.style.width = (1 / view.scale) + 'px';
    }
    if (gy === null || gy === undefined) { guideH.hidden = true; }
    else {
      guideH.hidden = false;
      guideH.style.top = gy + 'px';
      guideH.style.height = (1 / view.scale) + 'px';
    }
  }
  function hideGuides() { guideV.hidden = true; guideH.hidden = true; }

  /* ------------------------------------------------------------------
   * 节点：拖拽 / 点击
   * ------------------------------------------------------------------ */
  function attachNode(el, id) {
    var dragging = false, moved = false, start = null, orig = null;
    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (mode === 'delete') return;                    // 删除模式交给 click
      dragging = true; moved = false;
      start = { x: e.clientX, y: e.clientY };
      orig = { x: posMap[id].x, y: posMap[id].y };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = (e.clientX - start.x) / view.scale;
      var dy = (e.clientY - start.y) / view.scale;
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) moved = true;
      var nx = orig.x + dx, ny = orig.y + dy;
      var s = snapPos(id, nx, ny);
      posMap[id] = { x: s.x, y: s.y };
      el.style.left = s.x + 'px';
      el.style.top = s.y + 'px';
      showGuides(s.gx, s.gy);
      renderLines();
    });
    el.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false; el.classList.remove('dragging');
      hideGuides();
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) {
        if (posMode !== 'custom') { posMode = 'custom'; setLayoutState(); }
        toast('位置已定，点「保存布局」前台就照这样排');
      } else {
        onNodeClick(id);
      }
    });
    el.addEventListener('click', function (e) {
      if (mode === 'delete') { e.stopPropagation(); askDelete(id); }
    });
  }

  function onNodeClick(id) {
    if (mode === 'parent' || mode === 'marriage') {
      if (!pending) { pending = id; updatePending(); return; }
      if (pending === id) { pending = null; updatePending(); return; }
      if (mode === 'parent') connectParent(pending, id);
      else connectMarriage(pending, id);
      pending = null; updatePending();
      return;
    }
    if (mode === 'move' || mode === 'arrow' || mode === 'unlink') {
      selected = (selected === id) ? null : id;
      members.forEach(function (m) {
        var e = nodeEls[m.id];
        if (e) e.classList.toggle('sel', m.id === selected);
      });
    }
  }

  function updatePending() {
    members.forEach(function (m) {
      var el = nodeEls[m.id];
      if (el) el.classList.toggle('pending', m.id === pending);
    });
  }

  function isAncestor(anc, node) {
    var q = [node], seen = {}, g = 0;
    while (q.length && g++ < 300) {
      var cur = q.shift(); if (seen[cur]) continue; seen[cur] = true;
      if (cur === anc) return true;
      var m = get(cur); if (!m) continue;
      if (m.father_id) q.push(m.father_id);
      if (m.mother_id) q.push(m.mother_id);
    }
    return false;
  }
  function connectParent(parentId, childId) {
    var p = get(parentId), c = get(childId);
    if (!p || !c) return;
    if (parentId === childId) { toast('不能指向自己'); return; }
    if (isAncestor(parentId, childId)) { toast('会形成循环关系'); return; }
    if (p.gender === 'female') c.mother_id = parentId; else c.father_id = parentId;
    toast('已连接：' + p.name + ' → ' + c.name);
    renderNodes(); renderLines();
  }
  function connectMarriage(a, b) {
    var ma = get(a), mb = get(b); if (!ma || !mb) return;
    var sa = ma.spouse_ids || [], sb = mb.spouse_ids || [];
    if (sa.indexOf(b) !== -1) {
      ma.spouse_ids = sa.filter(function (x) { return x !== b; });
      mb.spouse_ids = sb.filter(function (x) { return x !== a; });
      delete arrows[arrowKey('marriage', a, b)];
      toast('已解除姻亲：' + ma.name + ' / ' + mb.name);
    } else {
      ma.spouse_ids = sa.concat([b]);
      mb.spouse_ids = sb.concat([a]);
      toast('已连接姻亲：' + ma.name + ' ∞ ' + mb.name);
    }
    renderNodes(); renderLines();
  }

  function onLineClick(type, from, to) {
    if (mode === 'unlink') {
      var a = get(from), b = get(to);
      if (type === 'parent') {
        var child = get(to);
        if (child) {
          if (child.father_id === from) child.father_id = null;
          if (child.mother_id === from) child.mother_id = null;
        }
        delete arrows[arrowKey('parent', from, to)];
        toast('已删除父子连线');
      } else {
        if (a) a.spouse_ids = (a.spouse_ids || []).filter(function (x) { return x !== to; });
        if (b) b.spouse_ids = (b.spouse_ids || []).filter(function (x) { return x !== from; });
        delete arrows[arrowKey('marriage', from, to)];
        toast('已删除姻亲连线');
      }
      renderNodes(); renderLines();
      return;
    }
    if (mode === 'arrow') {
      var key = arrowKey(type, from, to);
      var cur = arrows[key] || '';
      var next = cur === '' ? 'to' : (cur === 'to' ? 'back' : '');
      if (next) arrows[key] = next; else delete arrows[key];
      renderLines();
      var nameA = (get(from) || {}).name || from, nameB = (get(to) || {}).name || to;
      toast(next === 'to' ? ('箭头：' + nameA + ' → ' + nameB)
          : next === 'back' ? ('箭头：' + nameB + ' → ' + nameA)
          : '箭头已去掉');
      return;
    }
    toast('切到「删连线」或「箭头」模式后再点线条');
  }

  /* ------------------------------------------------------------------
   * 弹窗
   * ------------------------------------------------------------------ */
  var mask = document.getElementById('edMask');
  var modalTitle = document.getElementById('edModalTitle');
  var modalBody = document.getElementById('edModalBody');
  var modalOk = document.getElementById('edModalOk');
  var modalCancel = document.getElementById('edModalCancel');
  var modalX = document.getElementById('edModalX');
  var modalState = null;

  function openModal(opts) {
    modalState = opts || {};
    modalTitle.textContent = modalState.title || '';
    modalBody.innerHTML = modalState.body || '';
    modalOk.textContent = modalState.okText || '确定';
    modalOk.className = 'zp-btn ' + (modalState.danger ? '' : 'accent');
    if (modalState.danger) {
      modalOk.style.borderColor = '#a8322f';
      modalOk.style.color = '#a8322f';
    } else {
      modalOk.style.borderColor = '';
      modalOk.style.color = '';
    }
    mask.hidden = false;
    document.body.style.overflow = 'hidden';
    var first = modalBody.querySelector('input, textarea, select');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }
  function closeModal() {
    mask.hidden = true;
    modalState = null;
    document.body.style.overflow = '';
  }
  function submitModal() {
    if (!modalState) return;
    var keep = modalState.onOk ? modalState.onOk() : true;
    if (keep !== false) closeModal();
  }

  modalOk.addEventListener('click', submitModal);
  modalCancel.addEventListener('click', closeModal);
  modalX.addEventListener('click', closeModal);
  mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  modalBody.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault(); submitModal();
    }
  });

  /* ------------------------------------------------------------------
   * 添加成员（面板式，不再是浏览器 prompt）
   * ------------------------------------------------------------------ */
  function nextId() {
    var max = 0;
    members.forEach(function (m) {
      var mm = /^m(\d+)$/.exec(m.id || '');
      if (mm) max = Math.max(max, parseInt(mm[1], 10));
    });
    return 'm' + (max + 1);
  }

  function addMemberModal() {
    openModal({
      title: '添加成员',
      okText: '添加',
      body:
        '<div class="ed-form">' +
          '<div class="full"><label>姓名 *</label><input type="text" id="nf_name" placeholder="如 刘永生" autocomplete="off"></div>' +
          '<div><label>性别</label><div class="ed-gender">' +
            '<label><input type="radio" name="nf_gender" value="male" checked><span>男</span></label>' +
            '<label><input type="radio" name="nf_gender" value="female"><span>女</span></label>' +
          '</div></div>' +
          '<div><label>字辈</label><input type="text" id="nf_zb" maxlength="4" placeholder="如 永"></div>' +
          '<div><label>出生</label><input type="text" id="nf_birth" placeholder="YYYY-MM-DD"></div>' +
          '<div><label>已故（健在留空）</label><input type="text" id="nf_death" placeholder="YYYY-MM-DD"></div>' +
          '<div class="full"><label>简介 / 备注</label><textarea id="nf_bio" placeholder="生平、事迹…"></textarea></div>' +
        '</div>',
      onOk: function () {
        var nameEl = document.getElementById('nf_name');
        var name = (nameEl.value || '').trim();
        if (!name) { nameEl.focus(); toast('请填写姓名'); return false; }
        var genderEl = modalBody.querySelector('input[name=nf_gender]:checked');
        var id = nextId();
        var m = {
          id: id, name: name,
          zi_bei: (document.getElementById('nf_zb').value || '').trim(),
          gender: genderEl ? genderEl.value : 'male',
          birth: (document.getElementById('nf_birth').value || '').trim(),
          death: (document.getElementById('nf_death').value || '').trim() || null,
          bio: (document.getElementById('nf_bio').value || '').trim(),
          avatar: '', link_type: '',
          father_id: null, mother_id: null, spouse_ids: [], order: 99, pos: null
        };
        members.push(m); byId[id] = m;

        if (posMode === 'custom') {
          // 手工布局：新成员先落在视野中心，自己拖到想要的位置
          var c = toWorld(stageRect().left + stageRect().width / 2, stageRect().top + stageRect().height / 2);
          posMap[id] = { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2 };
        } else {
          autoLayout();
        }
        renderNodes(); renderLines(); fit();
        toast('已添加「' + name + '」，记得保存布局');
        return true;
      }
    });
  }

  /* ------------------------------------------------------------------
   * 删除成员
   * ------------------------------------------------------------------ */
  function askDelete(id) {
    var m = get(id);
    if (!m) return;
    var kids = members.filter(function (x) { return x.father_id === id || x.mother_id === id; });
    var spouses = (m.spouse_ids || []).map(function (s) { return (get(s) || {}).name; }).filter(Boolean);
    openModal({
      title: '删除成员',
      okText: '删除',
      danger: true,
      body:
        '<p class="ed-confirm">确定把 <b>' + esc(m.name) + '</b> 从族谱里删掉吗？' +
        (kids.length || spouses.length
          ? '<span class="ed-warn">会一并解开：' + (spouses.length ? '与 ' + esc(spouses.join('、')) + ' 的姻亲线；' : '') +
            (kids.length ? '与 ' + esc(kids.map(function (x) { return x.name; }).join('、')) + ' 的父子线；' : '') +
            '删完记得点「保存布局」。</span>'
          : '<span class="ed-warn">删完记得点「保存布局」。</span>') +
        '</p>',
      onOk: function () {
        members = members.filter(function (x) { return x.id !== id; });
        delete byId[id];
        delete posMap[id];
        members.forEach(function (x) {
          if (x.father_id === id) x.father_id = null;
          if (x.mother_id === id) x.mother_id = null;
          if (x.spouse_ids) x.spouse_ids = x.spouse_ids.filter(function (s) { return s !== id; });
        });
        Object.keys(arrows).forEach(function (k) {
          if (k.indexOf(':' + id + '>') !== -1 || k.indexOf('|' + id) !== -1 || k.indexOf(id + '|') !== -1 ||
              k.indexOf('>' + id) !== -1) delete arrows[k];
        });
        if (selected === id) selected = null;
        renderNodes(); renderLines();
        toast('已删除「' + m.name + '」');
        return true;
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (mask.hidden === false) {
      if (e.key === 'Escape') { closeModal(); e.preventDefault(); }
      return;
    }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      askDelete(selected); e.preventDefault();
    }
    if (e.key === 'Escape' && pending) { pending = null; updatePending(); }
  });

  /* ------------------------------------------------------------------
   * 工具栏
   * ------------------------------------------------------------------ */
  document.getElementById('edAddNode').addEventListener('click', addMemberModal);

  document.getElementById('edAuto').addEventListener('click', function () {
    posMode = 'auto'; setLayoutState();
    autoLayout(); renderNodes(); renderLines(); fit();
    toast('已按「' + (orient === 'vertical' ? '竖排' : '横排') + '」重新排列');
  });

  document.getElementById('edFit').addEventListener('click', fit);
  document.getElementById('edLogout').addEventListener('click', function () {
    fetch('api.php?action=logout', { method: 'POST' }).then(function () { location.href = 'index.php'; });
  });

  /* 排列方向切换 */
  document.querySelectorAll('#edOrient button').forEach(function (b) {
    b.addEventListener('click', function () {
      var o = b.dataset.orient;
      if (o === orient && posMode === 'auto') return;
      orient = o;
      posMode = 'auto';
      setLayoutState();
      document.querySelectorAll('#edOrient button').forEach(function (x) { x.classList.toggle('on', x.dataset.orient === orient); });
      autoLayout(); renderNodes(); renderLines(); fit();
      toast(orient === 'vertical' ? '已切成竖排：长辈在上' : '已切成横排：长辈在左');
    });
  });

  /* 模式切换 */
  document.querySelectorAll('.ed-mode').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.ed-mode').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      mode = b.dataset.mode;
      stage.style.cursor = (mode === 'move') ? '' : 'default';
      if (mode !== 'parent' && mode !== 'marriage') { pending = null; updatePending(); }
      if (mode === 'delete') {
        selected = null;
        members.forEach(function (m) { if (nodeEls[m.id]) nodeEls[m.id].classList.remove('sel'); });
        toast('鼠标移到节点上点一下即可删除');
      }
      if (mode === 'arrow') toast('点线条切换箭头：无 → 正向 → 反向');
    });
  });

  /* 保存：成员 + 连线箭头 + 排列方式 + 是否自定义布局 */
  document.getElementById('edSave').addEventListener('click', function () {
    var payload = members.map(function (m) {
      var p = posMap[m.id];
      var copy = {};
      Object.keys(m).forEach(function (k) { copy[k] = m[k]; });
      copy.pos = p ? { x: Math.round(p.x + NODE_W / 2), y: Math.round(p.y + NODE_H / 2) } : null;
      return copy;
    });
    fetch('api.php?action=save_tree', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        members: payload,
        arrows: arrows,
        layout: orient,
        layout_mode: posMode
      })
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.ok) toast(posMode === 'custom' ? '已保存：前台会照这个布局显示' : '已保存');
      else toast(r.msg || '保存失败');
    }).catch(function () { toast('网络错误'); });
  });

  /* ------------------------------------------------------------------
   * 初始化
   * ------------------------------------------------------------------ */
  members.forEach(function (m) {
    if (m.pos && typeof m.pos.x === 'number' && typeof m.pos.y === 'number') {
      posMap[m.id] = { x: m.pos.x - NODE_W / 2, y: m.pos.y - NODE_H / 2 };
    }
  });
  if (posMode === 'auto' || !Object.keys(posMap).length) {
    autoLayout();
  } else {
    autoLayout(true);      // 只补没有坐标的成员
  }

  document.querySelectorAll('#edOrient button').forEach(function (x) {
    x.classList.toggle('on', x.dataset.orient === orient);
  });
  setLayoutState();

  renderNodes();
  renderLines();
  fit();
  window.addEventListener('resize', fit);
})();
