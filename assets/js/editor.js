/* ============================================================================
 * 画布编辑器（无边记式）
 *  - 横排 / 竖排自由切换，自动排列保证「一列列 / 一行行」对齐
 *  - 拖拽节点时自动吸附其他节点的边与中线，并显示辅助线
 *  - 点人物 / 点线条 → 右侧检查器：改颜色、改箭头、断开关系
 *  - 「新建连线」可从任一人物连到另一人（亲子 / 姻亲 / 自定义线）
 *  - 「保存布局」把位置、连线样式一起存下来，前台族谱照此显示
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
  var FREE_COLOR = '#7a5af8';

  var PRESETS = ['#cfd3d8', '#e5484d', '#7a5af8', '#1f78d1', '#c99a2e', '#2f9e63', '#2c2a26'];

  var byId = {};
  members.forEach(function (m) { byId[m.id] = m; });

  var posMap = {};            // id -> {x, y} 节点左上角（世界坐标）
  var nodeEls = {};           // id -> element
  var styles = {};            // 连线键 -> {c: 颜色, a: 'to'|'back'}
  var freeEdges = [];         // 自定义线 [{id, from, to, label}]

  /* 连线样式：新版 edge_styles 优先，老数据 edge_arrows 兜底 */
  (function () {
    var src = STATE.styles || {};
    Object.keys(src).forEach(function (k) {
      var v = src[k] || {}, o = {};
      if (v.c) o.c = v.c;
      if (v.a === 'to' || v.a === 'back') o.a = v.a;
      if (Object.keys(o).length) styles[k] = o;
    });
    var old = STATE.arrows || {};
    Object.keys(old).forEach(function (k) {
      if (old[k] !== 'to' && old[k] !== 'back') return;
      styles[k] = styles[k] || {};
      if (!styles[k].a) styles[k].a = old[k];
    });
    (STATE.freeEdges || []).forEach(function (f) {
      if (f && f.id && f.from && f.to && byId[f.from] && byId[f.to]) {
        freeEdges.push({ id: f.id, from: f.from, to: f.to, label: f.label || '' });
      }
    });
  })();

  var orient = STATE.layout === 'vertical' ? 'vertical' : 'horizontal';
  var posMode = STATE.layoutMode === 'custom' ? 'custom' : 'auto';
  var view = { x: 0, y: 0, scale: 1 };
  var mode = 'move';
  var pending = null;         // 连线模式的起点
  var selNode = null;         // 选中的人物
  var selEdge = null;         // 选中的连线键

  var stage = document.getElementById('edStage');
  var world = document.getElementById('edWorld');
  var nodesLayer = document.getElementById('edNodes');
  var svg = document.getElementById('edLines');
  var guideV = document.getElementById('edGuideV');
  var guideH = document.getElementById('edGuideH');
  var panel = document.getElementById('edPanel');
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
        (m.id === selNode ? ' sel' : '');
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
   * 连线：几何 + 绘制
   * ------------------------------------------------------------------ */
  var defs = null, markerCache = {};

  function edgeKey(type, from, to) {
    if (type === 'marriage') {
      var pair = [from, to].sort();
      return 'marriage:' + pair[0] + '|' + pair[1];
    }
    return 'parent:' + from + '>' + to;
  }
  function freeKey(id) { return 'free:' + id; }

  function styleOf(key) { return styles[key] || {}; }
  function setStyle(key, color, arrow) {
    var o = styles[key] || {};
    if (color) o.c = color; else delete o.c;
    if (arrow === 'to' || arrow === 'back') o.a = arrow; else delete o.a;
    if (o.c || o.a) styles[key] = o; else delete styles[key];
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

  /** 自定义线：走一段弧，和姻亲直线区分开 */
  function freePath(a0, b0) {
    // 端点收到卡片边框上，别从卡片里穿出来
    var a = trimToRect(a0, b0), b = trimToRect(b0, a0);
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var mx = (a.x + b.x) / 2 + nx * 38;
    var my = (a.y + b.y) / 2 + ny * 38;
    return 'M' + a.x + ',' + a.y + ' Q' + mx + ',' + my + ' ' + b.x + ',' + b.y;
  }

  /** 从卡片中心朝 q 方向，落在卡片边框上的点 */
  function trimToRect(p, q) {
    var dx = q.x - p.x, dy = q.y - p.y;
    if (!dx && !dy) return { x: p.x, y: p.y };
    var tx = dx ? (NODE_W / 2) / Math.abs(dx) : Infinity;
    var ty = dy ? (NODE_H / 2) / Math.abs(dy) : Infinity;
    var t = Math.min(tx, ty);
    return { x: p.x + dx * t, y: p.y + dy * t };
  }


  /** 当前所有可画/可点的连线 */
  function edgeList() {
    var out = [];
    members.forEach(function (m) {
      var pid = (m.father_id && get(m.father_id)) ? m.father_id
              : ((m.mother_id && get(m.mother_id)) ? m.mother_id : null);
      if (!pid || !posMap[pid] || !posMap[m.id]) return;
      out.push({ key: edgeKey('parent', pid, m.id), type: 'parent', from: pid, to: m.id });
    });
    var done = {};
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        if (!get(sid) || !posMap[sid] || !posMap[m.id]) return;
        var k = edgeKey('marriage', m.id, sid);
        if (done[k]) return;
        done[k] = true;
        out.push({ key: k, type: 'marriage', from: m.id, to: sid });
      });
    });
    freeEdges.forEach(function (f) {
      if (!posMap[f.from] || !posMap[f.to]) return;
      out.push({ key: freeKey(f.id), type: 'free', from: f.from, to: f.to, free: f });
    });
    return out;
  }

  function colorOf(e) {
    var st = styleOf(e.key);
    if (st.c) return st.c;
    if (e.type === 'free') return FREE_COLOR;
    if (e.type === 'marriage') return MARRIAGE_COLOR;
    var m = get(e.to);
    if (m && m.link_type) {
      var lt = (settings.line_types || []).filter(function (t) { return t.id === m.link_type; })[0];
      if (lt && lt.color) return lt.color;
    }
    return PARENT_COLOR;
  }

  function pathOf(e) {
    if (e.type === 'parent') {
      var j = junctionOf(e.from), c = centerOf(e.to);
      if (!j || !c) return '';
      return parentPath(j, c);
    }
    var a = centerOf(e.from), b = centerOf(e.to);
    if (!a || !b) return '';
    return e.type === 'marriage' ? marriagePath(a, b) : freePath(a, b);
  }

  function renderLines() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    markerCache = {};

    edgeList().forEach(function (e) {
      var d = pathOf(e);
      if (!d) return;
      drawLine(d, colorOf(e), e);
    });
  }

  function drawLine(d, color, e) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'ed-line' + (selEdge === e.key ? ' sel' : ''));
    g.dataset.type = e.type; g.dataset.from = e.from; g.dataset.to = e.to; g.dataset.key = e.key;

    var halo = document.createElementNS(SVGNS, 'path');
    halo.setAttribute('d', d); halo.setAttribute('class', 'ln-halo');
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', color); halo.setAttribute('stroke-width', '10');

    var hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '18');

    var line = document.createElementNS(SVGNS, 'path');
    line.setAttribute('d', d); line.setAttribute('fill', 'none');
    line.setAttribute('class', 'ln-body');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', e.type === 'marriage' ? '2.5' : '1.8');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    if (e.type === 'free') line.setAttribute('stroke-dasharray', '7 4');

    var a = styleOf(e.key).a;
    if (a === 'to') line.setAttribute('marker-end', 'url(#' + markerId(color, 'end') + ')');
    else if (a === 'back') line.setAttribute('marker-start', 'url(#' + markerId(color, 'start') + ')');

    g.appendChild(halo); g.appendChild(hit); g.appendChild(line);

    // 线条自己接管指针，别让舞台把它当成「拖空白」
    g.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    g.addEventListener('click', function (ev) { ev.stopPropagation(); onEdgeClick(e); });
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
    if (e.target.closest('.ed-node, .ed-line, .ed-panel')) return;
    panning = true; stage.classList.add('panning');
    panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    // 先不抢指针：抢了之后线条的 click 会被吞掉
  });
  stage.addEventListener('pointermove', function (e) {
    if (!panning) return;
    if (!e.buttons) { panning = false; stage.classList.remove('panning'); return; }
    view.x = panStart.vx + (e.clientX - panStart.x);
    view.y = panStart.vy + (e.clientY - panStart.y);
    applyView();
  });
  stage.addEventListener('pointerup', function () {
    panning = false; stage.classList.remove('panning');
  });
  stage.addEventListener('click', function (e) {
    if (e.target.closest('.ed-node, .ed-line, .ed-panel')) return;
    selectNode(null);                 // 点空白处取消选中
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
    if (mode === 'parent' || mode === 'marriage' || mode === 'link') {
      if (!pending) { pending = id; updatePending(); toast('已选「' + get(id).name + '」，再点另一端'); return; }
      if (pending === id) { pending = null; updatePending(); return; }
      var a = pending;
      pending = null; updatePending();
      newLineModal(a, id);
      return;
    }
    selectNode(id);
  }

  function updatePending() {
    members.forEach(function (m) {
      var el = nodeEls[m.id];
      if (el) el.classList.toggle('pending', m.id === pending);
    });
  }

  function selectNode(id) {
    selNode = id;
    selEdge = null;
    members.forEach(function (m) {
      var e = nodeEls[m.id];
      if (e) e.classList.toggle('sel', m.id === selNode);
    });
    renderLines();
    renderPanel();
  }
  function selectEdge(key) {
    selEdge = key;
    selNode = null;
    members.forEach(function (m) {
      var e = nodeEls[m.id];
      if (e) e.classList.remove('sel');
    });
    renderLines();
    renderPanel();
  }
  function clearSel() {
    selNode = null; selEdge = null;
    members.forEach(function (m) {
      var e = nodeEls[m.id];
      if (e) e.classList.remove('sel');
    });
    renderLines();
    renderPanel();
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

  function addSpouse(a, b) {
    var ma = get(a), mb = get(b);
    if (!ma || !mb) return;
    ma.spouse_ids = ma.spouse_ids || [];
    mb.spouse_ids = mb.spouse_ids || [];
    if (ma.spouse_ids.indexOf(b) === -1) ma.spouse_ids.push(b);
    if (mb.spouse_ids.indexOf(a) === -1) mb.spouse_ids.push(a);
  }
  function removeSpouse(a, b) {
    var ma = get(a), mb = get(b);
    if (ma) ma.spouse_ids = (ma.spouse_ids || []).filter(function (x) { return x !== b; });
    if (mb) mb.spouse_ids = (mb.spouse_ids || []).filter(function (x) { return x !== a; });
  }

  function onEdgeClick(e) {
    if (mode === 'unlink') { askDeleteEdge(e); return; }
    if (mode === 'delete') { toast('当前是「删人」模式，点人物才会删除'); return; }
    selectEdge(e.key);
  }

  /* ------------------------------------------------------------------
   * 右侧检查器
   * ------------------------------------------------------------------ */
  function renderPanel() {
    if (selEdge) { renderEdgePanel(selEdge); return; }
    if (selNode && get(selNode)) { renderNodePanel(selNode); return; }
    panel.hidden = true;
    panel.innerHTML = '';
  }

  function swatchRow(current) {
    var h = PRESETS.map(function (c) {
      return '<button type="button" class="ed-sw' + (c.toLowerCase() === String(current).toLowerCase() ? ' on' : '') +
        '" data-c="' + c + '" style="--c:' + c + '" title="' + c + '"></button>';
    }).join('');
    return '<div class="ed-swrow">' + h +
      '<label class="ed-sw ed-sw-custom" title="自定义颜色"><input type="color" value="' + (current || '#cfd3d8') + '" data-role="pick"></label></div>';
  }

  /** 子女实际画线的那位父/母（有父走父，否则走母） */
  function primaryParentId(m) {
    if (m.father_id && get(m.father_id)) return m.father_id;
    if (m.mother_id && get(m.mother_id)) return m.mother_id;
    return null;
  }

  function relRow(k, m, edgeKeyVal, unsetKind, unsetNode) {
    if (!m) {
      return '<div class="ed-rel"><b>' + k + '</b><span class="ed-none">未设置</span></div>';
    }
    var dot = edgeKeyVal
      ? '<button type="button" class="ed-dot" data-act="edge" data-key="' + esc(edgeKeyVal) + '" style="--c:' + esc(styleOf(edgeKeyVal).c || '#cfd3d8') + '" title="设置这根线"></button>'
      : '<span class="ed-dot is-off"></span>';
    var rm = unsetKind
      ? '<button type="button" class="ed-ico" data-act="unset" data-kind="' + unsetKind + '" data-node="' + esc(unsetNode) + '" title="断开">' +
        '<svg class="ed-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 4.6h10.8"/><path d="M6.4 2.6h3.2"/><path d="M4.5 4.6 5.2 13a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.4"/></svg></button>'
      : '';
    return '<div class="ed-rel"><b>' + k + '</b>' +
      '<button type="button" class="ed-relname" data-act="goto" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button>' +
      dot + rm + '</div>';
  }

  function renderNodePanel(id) {
    var m = get(id);
    var kids = members.filter(function (x) { return x.father_id === id || x.mother_id === id; })
      .sort(cmpOrder);
    var myPid = primaryParentId(m);
    var rows = [];
    rows.push(relRow('父', m.father_id && get(m.father_id),
      (myPid && myPid === m.father_id) ? edgeKey('parent', myPid, id) : '', 'father', id));
    rows.push(relRow('母', m.mother_id && get(m.mother_id),
      (myPid && myPid === m.mother_id) ? edgeKey('parent', myPid, id) : '', 'mother', id));
    (m.spouse_ids || []).forEach(function (sid) {
      if (!get(sid)) return;
      rows.push(relRow('配偶', get(sid), edgeKey('marriage', id, sid), 'spouse', id + '>' + sid));
    });
    if (!(m.spouse_ids || []).length) rows.push(relRow('配偶', null));
    kids.forEach(function (k) {
      var kp = primaryParentId(k);
      rows.push(relRow(k.gender === 'female' ? '女' : '子', k,
        (kp === id) ? edgeKey('parent', id, k.id) : '', 'child', id + '>' + k.id));
    });

    var frees = freeEdges.filter(function (f) { return f.from === id || f.to === id; }).map(function (f) {
      var other = get(f.from === id ? f.to : f.from);
      var key = freeKey(f.id);
      return '<div class="ed-rel"><b>连线</b>' +
        '<button type="button" class="ed-relname" data-act="goto" data-id="' + esc(other.id) + '">' + esc(other.name) +
        (f.label ? '<i class="ed-rel-tag">' + esc(f.label) + '</i>' : '') + '</button>' +
        '<button type="button" class="ed-dot" data-act="edge" data-key="' + esc(key) + '" style="--c:' + esc(styleOf(key).c || FREE_COLOR) + '"></button>' +
        '<button type="button" class="ed-ico" data-act="unset" data-kind="free" data-node="' + esc(f.id) + '" title="删除这根线">' +
        '<svg class="ed-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 4.6h10.8"/><path d="M6.4 2.6h3.2"/><path d="M4.5 4.6 5.2 13a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.4"/></svg></button></div>';
    });

    panel.innerHTML =
      '<div class="ed-ph"><div>' +
        '<div class="ed-pn">' + esc(m.name) + (m.zi_bei ? '<span class="ed-pt">' + esc(m.zi_bei) + '</span>' : '') + '</div>' +
        '<div class="ed-ps">' + (m.gender === 'female' ? '女' : '男') +
          (m.birth ? ' · ' + esc(m.birth) : '') +
          (m.death ? ' · 故 ' + esc(m.death) : '') + '</div>' +
      '</div><button type="button" class="ed-px" data-act="close"><svg class="ed-i" viewBox="0 0 16 16"><path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"/></svg></button></div>' +
      '<div class="ed-sec"><div class="ed-st">亲属关系</div>' + rows.join('') + frees.join('') + '</div>' +
      '<button type="button" class="ed-pbtn" data-act="newline">' +
        '<svg class="ed-i" viewBox="0 0 16 16"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>从「' + esc(m.name) + '」新建连线</button>';

    panel.hidden = false;
  }

  function edgeTitle(key) {
    if (key.indexOf('free:') === 0) {
      var f = freeEdges.filter(function (x) { return freeKey(x.id) === key; })[0];
      if (!f) return { title: '自定义线', sub: '', from: '', to: '' };
      var a = get(f.from), b = get(f.to);
      return { title: (a ? a.name : '?') + ' —— ' + (b ? b.name : '?'), sub: f.label || '自定义线', from: f.from, to: f.to };
    }
    var m = /^(parent|marriage):(.+)$/.exec(key);
    if (!m) return { title: '连线', sub: '', from: '', to: '' };
    var type = m[1];
    if (type === 'parent') {
      var p = key.slice(7).split('>');
      var pa = get(p[0]), ch = get(p[1]);
      var kind = pa && pa.gender === 'female' ? '母子' : '父子';
      return { title: (pa ? pa.name : '?') + ' → ' + (ch ? ch.name : '?'), sub: kind + '连线', from: p[0], to: p[1] };
    }
    var q = key.slice(9).split('|');
    var x = get(q[0]), y = get(q[1]);
    return { title: (x ? x.name : '?') + ' —— ' + (y ? y.name : '?'), sub: '姻亲连线', from: q[0], to: q[1] };
  }

  function renderEdgePanel(key) {
    var info = edgeTitle(key);
    var st = styleOf(key);
    var cur = st.c || (key.indexOf('free:') === 0 ? FREE_COLOR : (key.indexOf('marriage:') === 0 ? MARRIAGE_COLOR : PARENT_COLOR));
    var curA = st.a || '';
    var aName = (get(info.from) || {}).name || '前者';
    var bName = (get(info.to) || {}).name || '后者';

    panel.innerHTML =
      '<div class="ed-ph"><div>' +
        '<div class="ed-pn ed-pn-sm">' + esc(info.title) + '</div>' +
        '<div class="ed-ps">' + esc(info.sub) + '</div>' +
      '</div><button type="button" class="ed-px" data-act="close"><svg class="ed-i" viewBox="0 0 16 16"><path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"/></svg></button></div>' +
      '<div class="ed-sec"><div class="ed-st">线条颜色</div>' + swatchRow(cur) + '</div>' +
      '<div class="ed-sec"><div class="ed-st">箭头方向</div>' +
        '<div class="ed-seg ed-seg2">' +
          '<button type="button" data-act="arrow" data-a="" class="' + (curA === '' ? 'on' : '') + '">无</button>' +
          '<button type="button" data-act="arrow" data-a="to" class="' + (curA === 'to' ? 'on' : '') + '">正向</button>' +
          '<button type="button" data-act="arrow" data-a="back" class="' + (curA === 'back' ? 'on' : '') + '">反向</button>' +
        '</div>' +
        '<p class="ed-pnote" style="margin-top:7px">正向 = ' + esc(aName) + ' → ' + esc(bName) + '；反向反之。</p>' +
      '</div>' +
      '<div class="ed-sec"><div class="ed-st">关系</div>' +
        '<p class="ed-pnote">' + (info.sub === '自定义线' ? '这根线只是画着看，不写入亲属关系。' : '这根线代表真实的亲属关系，改接到别人请用「连线」模式重新连一次。') + '</p>' +
      '</div>' +
      '<button type="button" class="ed-pbtn danger" data-act="cut">断开这根线</button>';

    panel.hidden = false;
  }

  /* 面板内的事件委托 */
  panel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === 'close') { clearSel(); return; }
    if (act === 'goto') { selectNode(btn.dataset.id); return; }
    if (act === 'edge') { selectEdge(btn.dataset.key); return; }
    if (act === 'newline') { newLineModal(selNode, null); return; }

    if (act === 'unset') {
      var kind = btn.dataset.kind, node = btn.dataset.node;
      if (kind === 'free') {
        freeEdges = freeEdges.filter(function (f) { return f.id !== node; });
        delete styles[freeKey(node)];
        clearSel(); renderLines(); toast('已删除这根线');
        return;
      }
      if (kind === 'father' || kind === 'mother') {
        var mm = get(node);
        var pid = mm ? mm[kind + '_id'] : null;
        if (mm) mm[kind + '_id'] = null;
        if (pid) delete styles[edgeKey('parent', pid, node)];
        clearSel(); renderLines(); toast('已断开');
        return;
      }
      if (kind === 'spouse') {
        var pair = node.split('>');
        removeSpouse(pair[0], pair[1]);
        delete styles[edgeKey('marriage', pair[0], pair[1])];
        clearSel(); renderLines(); toast('已解除姻亲');
        return;
      }
      if (kind === 'child') {
        var pair2 = node.split('>');
        var child = get(pair2[1]);
        if (child) {
          if (child.father_id === pair2[0]) child.father_id = null;
          if (child.mother_id === pair2[0]) child.mother_id = null;
        }
        delete styles[edgeKey('parent', pair2[0], pair2[1])];
        clearSel(); renderLines(); toast('已断开这根父子线');
        return;
      }
    }

    if (act === 'arrow') {
      setStyle(selEdge, styleOf(selEdge).c, btn.dataset.a);
      renderLines(); renderPanel(); return;
    }

    if (act === 'cut') {
      var target = selEdge;
      askDeleteEdge({ key: target, type: target.indexOf('free:') === 0 ? 'free' : (target.indexOf('marriage:') === 0 ? 'marriage' : 'parent'),
        from: edgeTitle(target).from, to: edgeTitle(target).to });
      return;
    }
  });

  /* 颜色选择（面板内） */
  panel.addEventListener('click', function (e) {
    var sw = e.target.closest('.ed-sw[data-c]');
    if (!sw || !selEdge) return;
    setStyle(selEdge, sw.dataset.c, styleOf(selEdge).a);
    renderLines(); renderPanel();
  });
  panel.addEventListener('input', function (e) {
    if (!e.target.matches('input[data-role=pick]') || !selEdge) return;
    setStyle(selEdge, e.target.value, styleOf(selEdge).a);
    renderLines();
    var row = panel.querySelector('.ed-swrow');
    if (row) [].forEach.call(row.querySelectorAll('.ed-sw[data-c]'), function (x) { x.classList.remove('on'); });
  });

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
    if (modalState.after) modalState.after();
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
  /* 弹窗内的颜色 / 箭头选择（挂一次，读取当前 modalState.picked） */
  modalBody.addEventListener('click', function (e) {
    var st = modalState && modalState.picked;
    if (!st) return;
    var sw = e.target.closest('.ed-sw[data-c]');
    if (sw) {
      st.color = sw.dataset.c;
      [].forEach.call(modalBody.querySelectorAll('.ed-sw[data-c]'), function (x) { x.classList.remove('on'); });
      sw.classList.add('on');
      var pick = document.getElementById('nl_color');
      if (pick) pick.value = st.color;
      return;
    }
    var ar = e.target.closest('#nl_arrow button');
    if (ar) {
      st.arrow = ar.dataset.a;
      [].forEach.call(modalBody.querySelectorAll('#nl_arrow button'), function (x) { x.classList.remove('on'); });
      ar.classList.add('on');
    }
  });
  modalBody.addEventListener('input', function (e) {
    var st = modalState && modalState.picked;
    if (!st || e.target.id !== 'nl_color') return;
    st.color = e.target.value;
    [].forEach.call(modalBody.querySelectorAll('.ed-sw[data-c]'), function (x) { x.classList.remove('on'); });
  });
  modalBody.addEventListener('change', function (e) {
    var st = modalState && modalState.picked;
    if (!st || e.target.id !== 'nl_rel') return;
    if (e.target.value === 'spouse' && st.color === PRESETS[0]) {
      st.color = PRESETS[1];
      var pick = document.getElementById('nl_color');
      if (pick) pick.value = st.color;
      [].forEach.call(modalBody.querySelectorAll('.ed-sw[data-c]'), function (x) {
        x.classList.toggle('on', x.dataset.c === st.color);
      });
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
          var r = stageRect();
          var c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
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
   * 新建连线：从某个人连向另一个人，自选颜色与箭头
   * ------------------------------------------------------------------ */
  function newLineModal(fromId, presetTo) {
    var from = get(fromId);
    if (!from) return;
    var others = members.filter(function (m) { return m.id !== fromId; }).sort(cmpOrder);
    if (!others.length) { toast('还没有别人可以连'); return; }

    var opts = others.map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === presetTo ? ' selected' : '') + '>' +
        esc(m.name) + (m.zi_bei ? ' · ' + esc(m.zi_bei) + '辈' : '') + '</option>';
    }).join('');

    var picked = { color: PRESETS[0], arrow: '' };

    openModal({
      title: '新建连线',
      okText: '连上',
      picked: picked,
      body:
        '<p class="ed-pnote" style="margin:0 0 12px">从「' + esc(from.name) + '」连出一根线</p>' +
        '<div class="ed-form">' +
          '<div class="full"><label>连到谁</label><select id="nl_to">' + opts + '</select></div>' +
          '<div class="full"><label>这根线表示</label><select id="nl_rel">' +
            '<option value="parent-out">' + esc(from.name) + ' 是对方的长辈（父 / 母）</option>' +
            '<option value="parent-in">' + esc(from.name) + ' 是对方的晚辈（子 / 女）</option>' +
            '<option value="spouse">两人是配偶</option>' +
            '<option value="free">自定义线（只画线，不写入亲属关系）</option>' +
          '</select></div>' +
          '<div class="full"><label>线条颜色</label><div class="ed-swrow" id="nl_colors">' +
            PRESETS.map(function (c) {
              return '<button type="button" class="ed-sw' + (c === picked.color ? ' on' : '') + '" data-c="' + c + '" style="--c:' + c + '"></button>';
            }).join('') +
            '<label class="ed-sw ed-sw-custom" title="自定义颜色"><input type="color" id="nl_color" value="' + picked.color + '"></label>' +
          '</div></div>' +
          '<div class="full"><label>箭头方向</label><div class="ed-seg ed-seg2" id="nl_arrow">' +
            '<button type="button" data-a="" class="on">无</button>' +
            '<button type="button" data-a="to">正向</button>' +
            '<button type="button" data-a="back">反向</button>' +
          '</div><p class="ed-pnote" style="margin-top:6px">正向 = 从「' + esc(from.name) + '」指向对方。</p></div>' +
        '</div>',
      onOk: function () {
        var toId = document.getElementById('nl_to').value;
        var rel = document.getElementById('nl_rel').value;
        var to = get(toId);
        if (!to) return false;
        var key = '';

        if (rel === 'parent-out') {
          if (toId === fromId) { toast('不能连到自己'); return false; }
          if (isAncestor(toId, fromId)) { toast('「' + to.name + '」已经是「' + from.name + '」的后辈，会形成循环'); return false; }
          if (from.gender === 'female') to.mother_id = fromId; else to.father_id = fromId;
          key = edgeKey('parent', fromId, toId);
        } else if (rel === 'parent-in') {
          if (isAncestor(fromId, toId)) { toast('「' + from.name + '」已经是「' + to.name + '」的后辈，会形成循环'); return false; }
          if (to.gender === 'female') from.mother_id = toId; else from.father_id = toId;
          key = edgeKey('parent', toId, fromId);
        } else if (rel === 'spouse') {
          if (fromId === toId) { toast('不能和自己结姻'); return false; }
          addSpouse(fromId, toId);
          key = edgeKey('marriage', fromId, toId);
        } else {
          var f = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), from: fromId, to: toId, label: '' };
          freeEdges.push(f);
          key = freeKey(f.id);
        }

        setStyle(key, picked.color, picked.arrow);
        if (!key) { toast('没有建成线'); return false; }
        selEdge = key; selNode = null;
        renderNodes(); renderLines(); renderPanel();
        toast('已连上：' + from.name + (rel === 'spouse' ? ' —— ' : ' → ') + to.name);
        return true;
      }
    });
  }

  /* ------------------------------------------------------------------
   * 删除连线 / 删除成员
   * ------------------------------------------------------------------ */
  function askDeleteEdge(e) {
    var info = edgeTitle(e.key);
    openModal({
      title: '断开连线',
      okText: '断开',
      danger: true,
      body: '<p class="ed-confirm">确定断开 <b>' + esc(info.title) + '</b> 吗？' +
        '<span class="ed-warn">' +
        (e.type === 'free' ? '这根自定义线会被删掉。' : '亲属关系也会一起解除，删完记得保存布局。') +
        '</span></p>',
      onOk: function () {
        if (e.type === 'free') {
          var fid = e.key.slice(5);
          freeEdges = freeEdges.filter(function (f) { return f.id !== fid; });
        } else if (e.type === 'marriage') {
          removeSpouse(e.from, e.to);
        } else {
          var child = get(e.to);
          if (child) {
            if (child.father_id === e.from) child.father_id = null;
            if (child.mother_id === e.from) child.mother_id = null;
          }
        }
        delete styles[e.key];
        clearSel();
        toast('已断开');
        return true;
      }
    });
  }

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
        freeEdges = freeEdges.filter(function (f) { return f.from !== id && f.to !== id; });
        Object.keys(styles).forEach(function (k) {
          if (k.indexOf(':' + id + '>') !== -1 || k.indexOf('>' + id) !== -1 ||
              k.indexOf('|' + id) !== -1 || k.indexOf(id + '|') !== -1) delete styles[k];
        });
        if (selNode === id) selNode = null;
        renderNodes(); renderLines(); renderPanel();
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && selNode) {
      askDelete(selNode); e.preventDefault();
    }
    if (e.key === 'Escape') {
      if (pending) { pending = null; updatePending(); }
      else if (selNode || selEdge) clearSel();
    }
  });

  /* ------------------------------------------------------------------
   * 工具栏
   * ------------------------------------------------------------------ */
  document.getElementById('edAddNode').addEventListener('click', addMemberModal);

  document.getElementById('edAuto').addEventListener('click', function () {
    if (posMode === 'custom') {
      openModal({
        title: '回到自动排列',
        okText: '重新排列',
        body: '<p class="ed-confirm">会覆盖你手工摆的位置，改回按辈分自动排。<span class="ed-warn">保存布局后才写入。</span></p>',
        onOk: function () {
          posMode = 'auto'; setLayoutState();
          autoLayout(); renderNodes(); renderLines(); fit();
          toast('已按「' + (orient === 'vertical' ? '竖排' : '横排') + '」重新排列');
          return true;
        }
      });
      return;
    }
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
      if (mode !== 'parent' && mode !== 'marriage' && mode !== 'link') { pending = null; updatePending(); }
      if (mode === 'link') toast('点第一个人，再点第二个，弹出连线设置');
      if (mode === 'unlink') toast('点线条即可断开');
      if (mode === 'delete') toast('点人物即可删除');
    });
  });

  /* 保存：成员 + 连线样式 + 自定义线 + 排列方式 */
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
        styles: styles,
        arrows: {},
        free_edges: freeEdges,
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
