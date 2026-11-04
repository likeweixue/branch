/* ============================================================================
 * ZUPÚ 前端主程序：族谱树布局 / 渲染 / 悬停信息 / 亲属称呼 / 平移缩放
 * 数据来自 window.ZP = { members, settings, me, role, logged_in }
 * ========================================================================== */
(function () {
  'use strict';
  var DATA = window.ZP || { members: [], settings: {}, me: null };
  var members = DATA.members || [];
  var settings = DATA.settings || {};
  var me = DATA.me || null;

  var byId = {};
  members.forEach(function (m) { byId[m.id] = m; });

  // 坟墓：member_id -> 坟（一个人只挂最近录入的一座）
  var graveOf = {};
  (DATA.graves || []).forEach(function (g) {
    (g.member_ids || []).forEach(function (mid) {
      if (!graveOf[mid]) graveOf[mid] = g;
    });
  });

  /** 连线类型（与后端 zp_line_types 对齐；老数据回退到 lines） */
  function lineTypes() {
    var lt = settings.line_types;
    if (!Array.isArray(lt) || !lt.length) {
      lt = [
        { id: 'lt1', label: '父子 / 母子', color: (settings.lines && settings.lines.parent) || '#cfd3d8', kind: 'parent' },
        { id: 'lt2', label: '两姓结姻', color: (settings.lines && settings.lines.marriage) || '#e5484d', kind: 'marriage' }
      ];
    }
    return lt;
  }
  function lineTypeById(id) {
    var all = lineTypes();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function lineColorOf(kind, fallback) {
    var all = lineTypes();
    for (var i = 0; i < all.length; i++) if (all[i].kind === kind) return all[i].color || fallback;
    return fallback;
  }

  /* ---------- 尺寸与排列 ----------
   * 横排：一代一列（长辈在左），同代占一行 → 一列列竖着对齐
   * 竖排：一代一行（长辈在上），同代占一列 → 一行行横着对齐
   * 夫妻并肩：配偶永远贴在本人右侧，因此每列留出两张卡的宽度
   */
  var NODE_W = 176, NODE_H = 60, PAD = 80;
  var COL_W = 420, ROW_H = 100;        // 横排：列宽 / 行高
  var COL_W_V = 420, ROW_H_V = 152;    // 竖排：列宽 / 行高
  var PARTNER_GAP = 18, PARTNER_OFF = NODE_W + PARTNER_GAP;

  var layoutMode = settings.layout === 'vertical' ? 'vertical' : 'horizontal';
  var customMode = settings.layout_mode === 'custom';   // 用编辑器保存的手工位置

  var pos = {};        // id -> {x,y}  (世界坐标，节点中心)
  var view = { x: 0, y: 0, k: 1 };

  /* ---------------- 布局 ---------------- */
  function primaryParentId(m) {
    if (m.father_id && byId[m.father_id]) return m.father_id;
    if (m.mother_id && byId[m.mother_id]) return m.mother_id;
    return null;
  }
  function cmpOrder(a, b) {
    var oa = a.order || 0, ob = b.order || 0;
    if (oa !== ob) return oa - ob;
    var ba = a.birth || '', bb = b.birth || '';
    if (ba !== bb) return ba < bb ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  }
  function unitOrder(a, b) { return cmpOrder(a.anchor, b.anchor); }

  function computeLayout() {
    pos = {};
    var unitOf = {}, units = [];

    /* 1) 夫妻合并为「家庭单元」，避免两口子被拆到两列 */
    members.forEach(function (m) {
      var u = { uid: units.length, ids: [m.id], members: [m], kids: [], parent: null, depth: null, slot: null, anchor: m, partner: null };
      unitOf[m.id] = u; units.push(u);
    });
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

    /* 2) 单元代表：世系更长的一方坐主位（配偶贴其右侧） */
    var ancCache = {};
    function ancDepth(id, guard) {
      if (ancCache.hasOwnProperty(id)) return ancCache[id];
      if (!id || !byId[id] || guard > 50) return 0;
      ancCache[id] = 0;                       // 防环
      var m = byId[id], d = 0;
      if (m.father_id && byId[m.father_id]) d = Math.max(d, ancDepth(m.father_id, (guard || 0) + 1) + 1);
      if (m.mother_id && byId[m.mother_id]) d = Math.max(d, ancDepth(m.mother_id, (guard || 0) + 1) + 1);
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

    /* 3) 父子关系归到单元：谁家世系更长就挂谁家 */
    units.forEach(function (u) {
      var p = null, bestScore = -1;
      u.ids.forEach(function (id) {
        var m = byId[id]; if (!m) return;
        var cands = [];
        if (m.father_id && unitOf[m.father_id] && unitOf[m.father_id] !== u) cands.push(m.father_id);
        if (m.mother_id && unitOf[m.mother_id] && unitOf[m.mother_id] !== u) cands.push(m.mother_id);
        cands.forEach(function (pid) {
          var score = ancDepth(pid, 0);
          if (score > bestScore) { bestScore = score; p = unitOf[pid]; }
        });
      });
      u.parent = (p && p !== u) ? p : null;
      if (u.parent) u.parent.kids.push(u);
    });

    /* 4) 代数：一代一列 / 一行 */
    function unitDepth(u, seen, guard) {
      if (u.depth != null) return u.depth;
      if (guard > 200 || seen[u.uid]) return 0;
      seen[u.uid] = true;
      var d = (u.parent && !seen[u.parent.uid]) ? unitDepth(u.parent, seen, guard + 1) + 1 : 0;
      u.depth = d; return d;
    }
    units.forEach(function (u) { unitDepth(u, {}, 0); });

    /* 5) 同代排序：后辈排在自己父母下面，避免连线交叉 */
    var cursor = 0;
    function placeUnit(u, guard) {
      if (u.slot != null) return u.slot;
      if (guard > 300 || u._busy) { u.slot = cursor++; return u.slot; }
      u._busy = true;
      var kids = u.kids.slice().sort(unitOrder);
      if (!kids.length) {
        u.slot = cursor++;
      } else {
        var first = null, last = null;
        kids.forEach(function (k) {
          var s = placeUnit(k, guard + 1);
          if (first === null) first = s;
          last = s;
        });
        u.slot = (first + last) / 2;      // 父母落在子女正中 —— 树才长得直
      }
      delete u._busy;
      return u.slot;
    }
    units.filter(function (u) { return !u.parent; }).sort(unitOrder).forEach(function (u) { placeUnit(u, 0); });
    units.forEach(function (u) { if (u.slot == null) placeUnit(u, 0); });

    /* 6) 落坐标（节点中心）：配偶紧贴本人右侧 */
    var colW = layoutMode === 'vertical' ? COL_W_V : COL_W;
    var rowH = layoutMode === 'vertical' ? ROW_H_V : ROW_H;
    units.forEach(function (u) {
      var d = u.depth || 0, s = u.slot || 0;
      var ax = (layoutMode === 'vertical' ? s * colW : d * colW) + PAD;
      var ay = (layoutMode === 'vertical' ? d * rowH : s * rowH) + PAD;
      u.members.forEach(function (m) {
        var isPartner = u.partner && m.id === u.partner.id;
        pos[m.id] = { x: ax + (isPartner ? PARTNER_OFF : 0), y: ay };
      });
    });

    /* 7) 编辑器保存过的手工坐标优先（仅「自定义布局」时生效） */
    members.forEach(function (m) {
      if (!pos[m.id]) pos[m.id] = { x: PAD, y: PAD };
      if (customMode && m.pos && typeof m.pos.x === 'number' && typeof m.pos.y === 'number') {
        pos[m.id].x = m.pos.x; pos[m.id].y = m.pos.y;
      }
    });
  }

  /* ---------------- 渲染 ---------------- */
  var svg, vp, gEdges, gNodes, stage;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var ARROWS = settings.edge_arrows || {};
  var STYLES = settings.edge_styles || {};
  var FREE_EDGES = Array.isArray(settings.free_edges) ? settings.free_edges : [];

  /** 连线箭头：key 与画布编辑器保持一致 */
  function arrowKey(type, from, to) {
    if (type === 'marriage') {
      var pair = [from, to].sort();
      return 'marriage:' + pair[0] + '|' + pair[1];
    }
    return 'parent:' + from + '>' + to;
  }
  function edgeStyle(key) { return STYLES[key] || {}; }
  function arrowOf(type, from, to) {
    var k = arrowKey(type, from, to);
    var v = (STYLES[k] || {}).a || ARROWS[k];
    return (v === 'to' || v === 'back') ? v : '';
  }

  function render() {
    computeLayout();
    stage = document.getElementById('zpStage');
    stage.innerHTML = '';
    svg = document.createElementNS(SVGNS, 'svg');
    vp = document.createElementNS(SVGNS, 'g');
    vp.setAttribute('id', 'vp');
    gEdges = document.createElementNS(SVGNS, 'g');
    gNodes = document.createElementNS(SVGNS, 'g');
    vp.appendChild(gEdges); vp.appendChild(gNodes);
    svg.appendChild(vp);
    stage.appendChild(svg);
    defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    markerCache = {};          // 每次重绘都重建箭头标记

    var parentColor = lineColorOf('parent', (settings.lines && settings.lines.parent) || '#cfd3d8');
    var marriageColor = lineColorOf('marriage', (settings.lines && settings.lines.marriage) || '#e5484d');

    // 父子/母子连线（成员指定了关系线类型时，用该类型的颜色）
    members.forEach(function (m) {
      var pid = primaryParentId(m);
      if (!pid || !pos[pid] || !pos[m.id]) return;
      var key = arrowKey('parent', pid, m.id);
      var c = edgeStyle(key).c || parentColor;
      if (!edgeStyle(key).c && m.link_type) {
        var t = lineTypeById(m.link_type);
        if (t && t.color) c = t.color;
      }
      var j = junctionOf(pid);
      if (!j) return;
      gEdges.appendChild(edge(parentPath(j, pos[m.id]), c, arrowOf('parent', pid, m.id), 'link'));
    });
    // 配偶连线（去重）
    var drawn = {};
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        if (!pos[sid] || !pos[m.id]) return;
        var key = [m.id, sid].sort().join('|');
        if (drawn[key]) return;
        drawn[key] = true;
        var c = edgeStyle(arrowKey('marriage', m.id, sid)).c || marriageColor;
        gEdges.appendChild(edge(marriagePath(pos[m.id], pos[sid]), c, arrowOf('marriage', m.id, sid), 'link is-marriage'));
      });
    });
    // 编辑器里手画的「自定义线」：不打乱辈分，只画一条弧
    FREE_EDGES.forEach(function (f) {
      if (!pos[f.from] || !pos[f.to]) return;
      var key = 'free:' + f.id;
      var c = edgeStyle(key).c || '#7a5af8';
      var st = edgeStyle(key);
      gEdges.appendChild(edge(freePath(pos[f.from], pos[f.to]), c, st.a === 'to' || st.a === 'back' ? st.a : '', 'link is-free'));
    });

    // 节点
    members.forEach(function (m) {
      if (!pos[m.id]) return;
      gNodes.appendChild(nodeEl(m));
    });

    applyView();
    initialView();
  }

  /* ---------- 连线几何 ----------
   * 父子线从「夫妻中间」或「父辈卡边」出发，走折线汇到子女卡边：
   * 横排先横、再竖、再横（一条主干挂一串子女）；竖排先竖、再横、再竖。
   */
  function junctionOf(pid) {
    var m = byId[pid], p = pos[pid];
    if (!m || !p) return null;
    var sid = null;
    (m.spouse_ids || []).forEach(function (s) { if (!sid && pos[s]) sid = s; });
    if (!sid) {
      return layoutMode === 'horizontal'
        ? { x: p.x + NODE_W / 2, y: p.y }
        : { x: p.x, y: p.y + NODE_H / 2 };
    }
    var sp = pos[sid];
    if (layoutMode === 'horizontal') {
      var left = Math.min(p.x, sp.x), right = Math.max(p.x, sp.x);
      return { x: (left + NODE_W / 2 + right - NODE_W / 2) / 2, y: p.y };
    }
    return { x: (p.x + sp.x) / 2, y: p.y + NODE_H / 2 };
  }

  function parentPath(j, c) {
    if (layoutMode === 'horizontal') {
      var dir = c.x >= j.x ? 1 : -1;
      var ex = c.x - dir * NODE_W / 2;
      if (Math.abs(ex - j.x) < 34) return 'M' + j.x + ',' + j.y + ' L' + ex + ',' + c.y;
      var mx = j.x + (ex - j.x) / 2;
      return 'M' + j.x + ',' + j.y + ' H' + mx + ' V' + c.y + ' H' + ex;
    }
    var ey = c.y - NODE_H / 2;
    if (Math.abs(ey - j.y) < 34) return 'M' + j.x + ',' + j.y + ' L' + c.x + ',' + ey;
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

  /** 自定义线：走一段弧，和姻亲直线区分开（与编辑器几何一致） */
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


  var defs, markerCache;
  function markerId(color, at) {
    var c = String(color || '#cfd3d8').replace(/[^0-9a-z]/gi, '');
    var id = 'zp-ar-' + c + '-' + at;
    if (!markerCache[id]) {
      markerCache[id] = true;
      var mk = document.createElementNS(SVGNS, 'marker');
      mk.setAttribute('id', id);
      mk.setAttribute('viewBox', '0 0 10 10');
      mk.setAttribute('refX', at === 'end' ? '9' : '1');
      mk.setAttribute('refY', '5');
      mk.setAttribute('markerWidth', '6.5');
      mk.setAttribute('markerHeight', '6.5');
      mk.setAttribute('orient', at === 'end' ? 'auto' : 'auto-start-reverse');
      var mp = document.createElementNS(SVGNS, 'path');
      mp.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      mp.setAttribute('fill', color);
      mk.appendChild(mp);
      defs.appendChild(mk);
    }
    return id;
  }
  markerCache = {};

  function edge(d, color, arrow, cls) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'zp-link' + (cls ? ' ' + cls : ''));
    p.setAttribute('stroke', color);
    if (cls && cls.indexOf('is-free') !== -1) p.setAttribute('stroke-dasharray', '7 4');
    if (arrow === 'to') p.setAttribute('marker-end', 'url(#' + markerId(color, 'end') + ')');
    else if (arrow === 'back') p.setAttribute('marker-start', 'url(#' + markerId(color, 'start') + ')');
    return p;
  }

  function nodeEl(m) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'zp-node' + (m.id === me ? ' me' : ''));
    g.setAttribute('transform', 'translate(' + pos[m.id].x + ',' + pos[m.id].y + ')');
    var card = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    card.setAttribute('class', 'nd-card');
    card.setAttribute('x', -NODE_W / 2); card.setAttribute('y', -NODE_H / 2);
    card.setAttribute('width', NODE_W); card.setAttribute('height', NODE_H);
    card.setAttribute('rx', 12);
    g.appendChild(card);

    var ava = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ava.setAttribute('class', 'nd-ava');
    ava.setAttribute('cx', -NODE_W / 2 + 30); ava.setAttribute('cy', 0); ava.setAttribute('r', 20);
    g.appendChild(ava);

    var ini = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    ini.setAttribute('class', 'nd-ini');
    ini.setAttribute('x', -NODE_W / 2 + 30); ini.setAttribute('y', 0);
    ini.setAttribute('font-size', '16');
    ini.textContent = (m.name || '?').slice(0, 1);
    g.appendChild(ini);

    // 头像（后台填了图床链接才画）：圆形裁切，失败时露出下面的首字
    if (m.avatar) {
      var cid = 'avc-' + m.id;
      var clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clip.setAttribute('id', cid);
      var cc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cc.setAttribute('cx', -NODE_W / 2 + 30); cc.setAttribute('cy', 0); cc.setAttribute('r', 20);
      clip.appendChild(cc);
      g.appendChild(clip);
      var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', m.avatar);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', m.avatar);
      img.setAttribute('x', -NODE_W / 2 + 10); img.setAttribute('y', -20);
      img.setAttribute('width', 40); img.setAttribute('height', 40);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', 'url(#' + cid + ')');
      img.setAttribute('class', 'nd-photo');
      img.setAttribute('referrerpolicy', 'no-referrer');
      g.appendChild(img);
    }

    var name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    name.setAttribute('class', 'nd-name');
    name.setAttribute('x', -NODE_W / 2 + 58); name.setAttribute('y', -4);
    name.setAttribute('text-anchor', 'start');
    name.textContent = m.name || '(无名)';
    g.appendChild(name);

    var sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('class', 'nd-zb');
    sub.setAttribute('x', -NODE_W / 2 + 58); sub.setAttribute('y', 16);
    sub.setAttribute('text-anchor', 'start');
    var zb = m.zi_bei ? ('〔' + m.zi_bei + '〕') : '';
    var yr = m.birth ? (m.birth.slice(0, 4) + '年') : '';
    sub.textContent = (zb + (zb && yr ? ' ' : '') + yr).trim() || (m.gender === 'female' ? '女' : '男');
    g.appendChild(sub);

    g.addEventListener('mouseenter', function (e) { showTip(m, e); });
    g.addEventListener('mousemove', function (e) { moveTip(e); });
    g.addEventListener('mouseleave', hideTip);
    return g;
  }

  /* ---------------- 悬停信息卡 + 称呼 ---------------- */
  var tip;
  function showTip(m, e) {
    tip = document.getElementById('zpTip');
    var call = (me && me !== m.id) ? kinship(me, m.id) : (me === m.id ? '我（本人）' : null);
    var zb = m.zi_bei ? '字辈「' + m.zi_bei + '」' : '未设字辈';
    var life = m.birth ? m.birth : '未知';
    if (m.death) life += ' ～ ' + m.death;
    var relText = call ? call : (me ? '（无直接血缘路径）' : '登录后显示称呼');
    // 只有后台标了「已故」并且录了坟，才显示安葬地
    var gv = (m.death && graveOf[m.id]) ? graveOf[m.id] : null;
    var graveRow = '';
    if (gv) {
      var gp = gv.place || gv.address || '';
      var shown = gp || '已记录';
      graveRow = '<div class="t-row t-grave"><span>安葬</span><b>' +
        (gp ? '<a href="grave.php#gv=' + encodeURIComponent(gv.id) + '">' + esc(shown) + '</a>' : esc(shown)) +
        '</b></div>';
    }
    tip.innerHTML =
      '<div class="t-head">' +
        (m.avatar
          ? '<img class="t-ava" src="' + esc(m.avatar) + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="t-ava is-empty">' + esc((m.name || '?').slice(0, 1)) + '</span>') +
        '<div class="t-name">' + esc(m.name) + (m.zi_bei ? '<span class="t-zb">' + esc(m.zi_bei) + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="t-row"><span>性别</span><b>' + (m.gender === 'female' ? '女' : '男') + '</b></div>' +
      '<div class="t-row"><span>生卒</span><b>' + esc(life) + '</b></div>' +
      '<div class="t-row"><span>字辈</span><b>' + esc(zb) + '</b></div>' +
      (m.bio ? '<div class="t-row"><span>简介</span><b style="font-weight:400;max-width:160px;text-align:right">' + esc(m.bio) + '</b></div>' : '') +
      graveRow +
      '<div class="t-call"><span class="lab">称呼</span><span class="val">' + esc(relText) + '</span></div>';
    tip.classList.add('on');
    moveTip(e);
  }
  function moveTip(e) {
    if (!tip) return;
    var x = e.clientX + 16, y = e.clientY + 16;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 10) x = e.clientX - w - 16;
    if (y + h > window.innerHeight - 10) y = e.clientY - h - 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.classList.remove('on'); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------------- 亲属称呼 ----------------
   * 算法：用「双亲 + 代数距离」的祖先集，避免只走父系而丢失母系。
   * - 直系长辈/晚辈：沿祖先集求代数差，父系/母系决定 祖父/外祖父 等。
   * - 旁系：求最近共同祖先(LCA)，按 (n,m)=各自到 LCA 的代数 判定 兄弟姐妹/叔伯姑舅姨/堂表/祖辈旁系。
   */
  function parentsList(id) {
    var m = byId[id], r = [];
    if (m && m.father_id && byId[m.father_id]) r.push(m.father_id);
    if (m && m.mother_id && byId[m.mother_id]) r.push(m.mother_id);
    return r;
  }
  function ancestorsWithDist(id) {
    var dist = {}; dist[id] = 0;
    var q = [id], seen = {}; seen[id] = true, guard = 0;
    while (q.length && guard++ < 500) {
      var cur = q.shift(), d = dist[cur], m = byId[cur];
      if (!m) continue;
      [m.father_id, m.mother_id].forEach(function (pid) {
        if (pid && byId[pid] && !seen[pid]) { seen[pid] = true; dist[pid] = d + 1; q.push(pid); }
      });
    }
    return dist;
  }
  function ancestorTerm(k, tid, maternal) {
    var g = (byId[tid] && byId[tid].gender === 'female') ? 'f' : 'm';
    if (k === 1) return g === 'f' ? '母亲' : '父亲';
    var tp = { 2: '祖父', 3: '曾祖父', 4: '高祖父', 5: '天祖父' };
    var tp_f = { 2: '祖母', 3: '曾祖母', 4: '高祖母', 5: '天祖母' };
    var tm = { 2: '外祖父', 3: '外曾祖父', 4: '外高祖父', 5: '外天祖父' };
    var tm_f = { 2: '外祖母', 3: '外曾祖母', 4: '外高祖母', 5: '外天祖母' };
    if (maternal) return g === 'f' ? (tm_f[k] || ('外第' + k + '世祖母')) : (tm[k] || ('外第' + k + '世祖'));
    return g === 'f' ? (tp_f[k] || ('第' + k + '世祖母')) : (tp[k] || ('第' + k + '世祖'));
  }
  function descendantTerm(k, tid) {
    var g = (byId[tid] && byId[tid].gender === 'female') ? 'f' : 'm';
    var t = { 1: { m: '儿子', f: '女儿' }, 2: { m: '孙子', f: '孙女' }, 3: { m: '曾孙', f: '曾孙女' }, 4: { m: '玄孙', f: '玄孙女' } };
    if (t[k]) return t[k][g];
    return '第' + k + '世孙';
  }
  function olderThan(a, b) {
    var ba = (byId[a] && byId[a].birth) || '', bb = (byId[b] && byId[b].birth) || '';
    if (ba && bb && ba !== bb) return ba < bb;
    var oa = byId[a] ? (byId[a].order || 0) : 0, ob = byId[b] ? (byId[b].order || 0) : 0;
    return oa < ob;
  }
  function collateral(n, m, egoId, tid, best) {
    var tg = (byId[tid] && byId[tid].gender === 'female') ? 'f' : 'm';
    var eA = ancestorsWithDist(egoId);
    var ego = byId[egoId] || {};
    var pathParent = null;
    for (var px in eA) {
      if (eA[px] === n - 1) { // ego 的第 (n-1) 代祖先，紧贴 LCA
        var pda = ancestorsWithDist(px);
        if (pda[best] === 1) { pathParent = px; break; }
      }
    }
    var paternalSide = !(pathParent && byId[pathParent] && byId[pathParent].gender === 'female');
    var sib = function (older) { return tg === 'm' ? (older ? '哥哥' : '弟弟') : (older ? '姐姐' : '妹妹'); };

    // 同胞兄弟姐妹
    if (n === 1 && m === 1) return sib(olderThan(tid, egoId));

    // 侄 / 外甥（target 为 ego 兄弟姐妹的子女）
    if (n === 1 && m === 2) {
      var tgt = byId[tid] || {};
      var sibP = [tgt.father_id, tgt.mother_id].find(function (pid) {
        if (!pid || !byId[pid]) return false;
        return ancestorsWithDist(pid)[best] === 1;
      });
      var sibMale = sibP && byId[sibP].gender === 'male';
      return sibMale ? (tg === 'm' ? '侄子' : '侄女') : (tg === 'm' ? '外甥' : '外甥女');
    }
    if (n === 1) return '族亲（晚辈）';

    // 伯叔姑舅姨（target 为 ego 第 (n-1) 代祖先的兄弟姐妹，即 m===1）
    if (m === 1) {
      var level = n - 1;
      if (paternalSide) {
        if (tg === 'f') return level === 1 ? '姑母' : (level === 2 ? '姑祖母' : '姑祖');
        if (level === 1) return olderThan(tid, pathParent) ? '伯父' : '叔父';
        if (level === 2) return olderThan(tid, pathParent) ? '伯祖父' : '叔祖父';
        return '族伯';
      } else {
        if (tg === 'f') return level === 1 ? '姨母' : (level === 2 ? '姨婆' : '姨祖');
        if (level === 1) return '舅父';
        if (level === 2) return '舅公';
        return '族舅';
      }
    }

    // 堂 / 表（同代旁系，n===2 且 m===2）
    if (m === 2 && n === 2) return (paternalSide ? '堂' : '表') + sib(olderThan(tid, egoId));
    return '族亲';
  }
  function kinship(egoId, tid) {
    try {
      if (!egoId) return null;
      if (egoId === tid) return '我（本人）';
      if (!byId[egoId] || !byId[tid]) return '族亲';
      var eA = ancestorsWithDist(egoId), tA = ancestorsWithDist(tid);
      if (eA.hasOwnProperty(tid)) {
        var egoMom = byId[egoId] ? byId[egoId].mother_id : null;
        var maternal = !!(egoMom && tA[egoMom] !== undefined && tA[egoMom] < eA[tid]);
        return ancestorTerm(eA[tid], tid, maternal);
      }
      if (tA.hasOwnProperty(egoId)) return descendantTerm(tA[egoId], tid);
      var best = null, bestSum = 1e9;
      for (var a in eA) {
        if (tA.hasOwnProperty(a)) { var s = eA[a] + tA[a]; if (s < bestSum) { bestSum = s; best = a; } }
      }
      if (!best) return '族亲';
      return collateral(eA[best], tA[best], egoId, tid, best);
    } catch (e) { return '族亲'; }
  }

  /* ---------------- 平移 / 缩放 ---------------- */
  function applyView() {
    vp.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
  }
  /** 整棵树的包围盒（含卡片半宽/半高） */
  function treeBox() {
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    members.forEach(function (m) {
      if (!pos[m.id]) return;
      minX = Math.min(minX, pos[m.id].x); minY = Math.min(minY, pos[m.id].y);
      maxX = Math.max(maxX, pos[m.id].x); maxY = Math.max(maxY, pos[m.id].y);
    });
    if (minX > maxX) return null;
    return { minX: minX - NODE_W, minY: minY - NODE_H, maxX: maxX + NODE_W, maxY: maxY + NODE_H };
  }

  function fit() {
    var b = treeBox();
    if (!b) return;
    var W = b.maxX - b.minX, H = b.maxY - b.minY;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var k = Math.min(sw / W, sh / H, 1.2);
    view.k = k;
    view.x = (sw - W * k) / 2 - b.minX * k;
    view.y = (sh - H * k) / 2 - b.minY * k;
    applyView();
  }

  /**
   * 首屏视图：世代一多，整棵树塞进一屏会缩到看不清。
   * 这里仍是「整棵树」优先，但缩放不低于 MIN_K；
   * 跌破时横排对齐左上（最早一代），竖排对齐顶部（最高一辈），
   * 用户拖一下、滚一下就能看后面的世代。
   */
  var MIN_K = 0.52;
  function initialView() {
    fit();
    if (view.k >= MIN_K) return;
    var b = treeBox();
    if (!b) return;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    view.k = MIN_K;
    var W = (b.maxX - b.minX) * view.k, H = (b.maxY - b.minY) * view.k;
    if (layoutMode === 'vertical') {
      view.y = 46 - b.minY * view.k;                                  // 最高一辈贴着上沿
      view.x = W <= sw ? (sw - W) / 2 - b.minX * view.k : 44 - b.minX * view.k;
    } else {
      view.x = 44 - b.minX * view.k;                                  // 最早一代贴着左沿
      view.y = H <= sh ? (sh - H) / 2 - b.minY * view.k : 46 - b.minY * view.k;
    }
    applyView();
  }

  /** 按钮缩放：以视口中心为锚点 */
  function zoomBy(f) {
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var nk = Math.max(0.15, Math.min(3, view.k * f));
    view.x = sw / 2 - (sw / 2 - view.x) * (nk / view.k);
    view.y = sh / 2 - (sh / 2 - view.y) * (nk / view.k);
    view.k = nk; applyView();
  }
  function setupPanZoom() {
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.zp-node')) return;
      dragging = true; sx = e.clientX; sy = e.clientY; ox = view.x; oy = view.y;
      stage.classList.add('grabbing'); stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      view.x = ox + (e.clientX - sx); view.y = oy + (e.clientY - sy); applyView();
    });
    stage.addEventListener('pointerup', function () { dragging = false; stage.classList.remove('grabbing'); });
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = svg.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      var nk = Math.max(0.15, Math.min(3, view.k * delta));
      // 以光标为中心缩放
      view.x = mx - (mx - view.x) * (nk / view.k);
      view.y = my - (my - view.y) * (nk / view.k);
      view.k = nk; applyView();
    }, { passive: false });
  }

  /* ---------------- 控制条 ---------------- */
  function setupControls() {
    document.getElementById('zpFit').addEventListener('click', fit);
    var tg = document.getElementById('zpToggle');
    if (tg) tg.textContent = layoutMode === 'horizontal' ? '⇄ 竖排' : '⇄ 横排';
    document.getElementById('zpReset').addEventListener('click', function () { view = { x: 0, y: 0, k: 1 }; view.k = 1; fit(); });
    var zo = document.getElementById('zpZoomOut'), zi = document.getElementById('zpZoomIn');
    if (zo) zo.addEventListener('click', function () { zoomBy(1 / 1.25); });
    if (zi) zi.addEventListener('click', function () { zoomBy(1.25); });
    document.getElementById('zpToggle').addEventListener('click', function () {
      // 手工布局下点这个 = 回到自动排列（换个方向看）
      layoutMode = layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
      customMode = false;
      this.textContent = layoutMode === 'horizontal' ? '⇄ 竖排' : '⇄ 横排';
      render();
    });
  }

  /* ---------------- 登录 / 注册 ---------------- */
  function setupAuth() {
    var mask = document.getElementById('zpLogin');
    document.querySelectorAll('[data-login-open]').forEach(function (b) {
      b.addEventListener('click', function () { mask.classList.add('on'); });
    });
    document.getElementById('zpLoginClose').addEventListener('click', function () { mask.classList.remove('on'); });
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.remove('on'); });
    document.getElementById('zpLoginBtn').addEventListener('click', function () {
      var u = document.getElementById('zpUser').value.trim();
      var p = document.getElementById('zpPass').value;
      api('login', { username: u, password: p }, function (r) {
        if (r.ok) { location.reload(); } else { toast(r.msg || '登录失败'); }
      });
    });
    document.getElementById('zpRegBtn').addEventListener('click', function () {
      var u = document.getElementById('zpUser').value.trim();
      var p = document.getElementById('zpPass').value;
      if (p.length < 6) { toast('密码至少 6 位'); return; }
      api('register', { username: u, password: p }, function (r) {
        if (r.ok) { toast('注册成功，请登录'); document.getElementById('zpPass').value = ''; }
        else toast(r.msg || '注册失败');
      });
    });
    var logout = document.getElementById('zpLogout');
    if (logout) logout.addEventListener('click', function () { api('logout', {}, function () { location.reload(); }); });
  }

  function api(action, data, cb) {
    fetch('api.php?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function (r) { return r.json(); }).then(cb).catch(function () { toast('网络错误'); });
  }
  function toast(msg) {
    var t = document.getElementById('zpToast'); t.textContent = msg; t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ---------------- 图例（全部来自后台配置的连线类型） ---------------- */
  function renderLegend() {
    var box = document.getElementById('zpLegend');
    if (!box) return;
    var html = '';
    lineTypes().forEach(function (t) {
      var col = t.color || '#cfd3d8';
      html += '<div><i style="background:' + esc(col) + '"></i>' + esc(t.label || '关系线') + '</div>';
    });
    box.innerHTML = html;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    renderLegend();
    setupAuth();
    if (!members.length) {
      var em = document.getElementById('zpEmpty'); if (em) em.style.display = 'flex';
      return;
    }
    render();
    setupPanZoom();
    setupControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
