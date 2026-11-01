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

  var COL_W = 400, ROW_H = 96, NODE_W = 176, NODE_H = 60, PAD = 80;
  var COL_W_V = 230, ROW_H_V = 170;   // 竖排：横向排兄弟、纵向排辈分，需容纳配偶错位
  var layoutMode = settings.layout === 'vertical' ? 'vertical' : 'horizontal';

  var pos = {};        // id -> {x,y}  (世界坐标，节点中心)
  var view = { x: 0, y: 0, k: 1 };

  /* ---------------- 布局 ---------------- */
  function primaryParent(m) {
    if (m.father_id && byId[m.father_id]) return byId[m.father_id];
    if (m.mother_id && byId[m.mother_id]) return byId[m.mother_id];
    return null;
  }
  function childrenOf(id) {
    return members.filter(function (m) {
      if (m.father_id === id) return true;
      if (!m.father_id && m.mother_id === id) return true; // 仅随母的成员挂在母亲下
      return false;
    }).sort(cmpOrder);
  }
  function cmpOrder(a, b) {
    var oa = a.order || 0, ob = b.order || 0;
    if (oa !== ob) return oa - ob;
    return (a.birth || '').localeCompare(b.birth || '');
  }

  function computeLayout() {
    pos = {};
    var unitOf = {}, units = [];

    /* 1) 夫妻合并为「家庭单元」，避免两口子被拆到两列 */
    members.forEach(function (m) {
      var u = { uid: units.length, ids: [m.id], members: [m], row: null, depth: null, kids: [], parent: null, anchor: m, partner: null };
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

    /* 2) 单元代表：优先"父母在谱中"的一方，其次男性；另一位作为配偶贴左侧 */
    units.forEach(function (u) {
      var best = u.members[0], bestScore = -1;
      u.members.forEach(function (m) {
        var hasP = !!(m.father_id && byId[m.father_id]) || !!(m.mother_id && byId[m.mother_id]);
        var score = (hasP ? 2 : 0) + (m.gender === 'male' ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = m; }
      });
      u.anchor = best;
      u.partner = u.members.filter(function (m) { return m.id !== best.id; })[0] || null;
    });

    /* 3) 父子关系归到单元：优先父亲所在单元 */
    units.forEach(function (u) {
      var p = null;
      u.ids.forEach(function (id) {
        if (p) return;
        var m = byId[id]; if (!m) return;
        if (m.father_id && unitOf[m.father_id] && unitOf[m.father_id] !== u) p = unitOf[m.father_id];
        else if (m.mother_id && unitOf[m.mother_id] && unitOf[m.mother_id] !== u) p = unitOf[m.mother_id];
      });
      u.parent = p || null;
      if (p) p.kids.push(u);
    });

    /* 4) 代数：一代一列 */
    function unitDepth(u, seen, guard) {
      if (u.depth != null) return u.depth;
      if (guard > 200 || seen[u.uid]) return 0;
      seen[u.uid] = true;
      var d = (u.parent && !seen[u.parent.uid]) ? unitDepth(u.parent, seen, guard + 1) + 1 : 0;
      u.depth = d; return d;
    }
    units.forEach(function (u) { unitDepth(u, {}, 0); });

    /* 5) 行号：同代按父母位置排序（减少交叉），一代内依次占行 */
    var byDepth = {};
    units.forEach(function (u) { (byDepth[u.depth] = byDepth[u.depth] || []).push(u); });
    Object.keys(byDepth).sort(function (a, b) { return a - b; }).forEach(function (dk) {
      var list = byDepth[dk];
      list.forEach(function (u, i) { u._i = i; });
      list.sort(function (a, b) {
        var ra = a.parent ? a.parent.row : -1;
        var rb = b.parent ? b.parent.row : -1;
        if (ra !== rb) return ra - rb;
        return a._i - b._i;
      });
      list.forEach(function (u, i) { u.row = i; });
    });

    /* 6) 落坐标（节点中心）：配偶紧贴本人左侧，留出 18px 间隙 */
    var offX = NODE_W + 18;   // 横向：两人中心距 = 卡宽 + 间距
    var offY = NODE_H + 14;   // 纵向：同理
    var cw = layoutMode === 'vertical' ? COL_W_V : COL_W;
    var rh = layoutMode === 'vertical' ? ROW_H_V : ROW_H;
    units.forEach(function (u) {
      var d = u.depth || 0, r = u.row;
      u.members.forEach(function (m) {
        var isPartner = u.partner && m.id === u.partner.id;
        if (layoutMode === 'horizontal') {
          pos[m.id] = { x: d * cw + PAD - (isPartner ? offX : 0), y: r * rh + PAD };
        } else {
          pos[m.id] = { x: r * cw + PAD, y: d * rh + PAD - (isPartner ? offY : 0) };
        }
      });
    });

    /* 7) 编辑器保存过的手动坐标优先 */
    members.forEach(function (m) {
      if (!pos[m.id]) pos[m.id] = { x: PAD, y: PAD };
      if (m.pos && typeof m.pos.x === 'number' && typeof m.pos.y === 'number') {
        pos[m.id].x = m.pos.x; pos[m.id].y = m.pos.y;
      }
    });
  }

  /* ---------------- 渲染 ---------------- */
  var svg, vp, gEdges, gNodes, stage;
  function render() {
    computeLayout();
    stage = document.getElementById('zpStage');
    stage.innerHTML = '';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    vp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    vp.setAttribute('id', 'vp');
    gEdges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gNodes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    vp.appendChild(gEdges); vp.appendChild(gNodes);
    svg.appendChild(vp);
    stage.appendChild(svg);

    var parentColor = (settings.lines && settings.lines.parent) || '#cfd3d8';
    var marriageColor = (settings.lines && settings.lines.marriage) || '#e5484d';

    // 父子/母子连线
    members.forEach(function (m) {
      var p = primaryParent(m);
      if (p && pos[p.id] && pos[m.id]) {
        gEdges.appendChild(edge(pos[p.id], pos[m.id], parentColor, layoutMode));
      }
    });
    // 配偶连线（去重）
    var drawn = {};
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        var key = [m.id, sid].sort().join('|');
        if (drawn[key]) return;
        drawn[key] = true;
        if (pos[sid] && pos[m.id]) gEdges.appendChild(edge(pos[m.id], pos[sid], marriageColor, layoutMode, true));
      });
    });

    // 节点
    members.forEach(function (m) {
      if (!pos[m.id]) return;
      gNodes.appendChild(nodeEl(m));
    });

    applyView();
    fit();
  }

  function edge(a, b, color, mode, marriage) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var ax, ay, bx, by;
    if (mode === 'horizontal') {
      // 子辈在右就从右缘出发，在左（如母系）就从左缘出发，避免连线穿过卡片
      var dir = b.x >= a.x ? 1 : -1;
      ax = a.x + dir * NODE_W / 2; ay = a.y;
      bx = b.x - dir * NODE_W / 2; by = b.y;
    } else {
      var dirY = b.y >= a.y ? 1 : -1;
      ax = a.x; ay = a.y + dirY * NODE_H / 2;
      bx = b.x; by = b.y - dirY * NODE_H / 2;
    }
    // 平滑曲线
    var mx = (ax + bx) / 2, my = (ay + by) / 2;
    var d;
    if (mode === 'horizontal') d = 'M' + ax + ',' + ay + ' C' + mx + ',' + ay + ' ' + mx + ',' + by + ' ' + bx + ',' + by;
    else d = 'M' + ax + ',' + ay + ' C' + ax + ',' + my + ' ' + bx + ',' + my + ' ' + bx + ',' + by;
    p.setAttribute('d', d);
    p.setAttribute('class', 'zp-link');
    p.setAttribute('stroke', color);
    if (marriage) p.setAttribute('stroke-dasharray', '1 0');
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
    tip.innerHTML =
      '<div class="t-name">' + esc(m.name) + (m.zi_bei ? '<span class="t-zb">' + esc(m.zi_bei) + '</span>' : '') + '</div>' +
      '<div class="t-row"><span>性别</span><b>' + (m.gender === 'female' ? '女' : '男') + '</b></div>' +
      '<div class="t-row"><span>生卒</span><b>' + esc(life) + '</b></div>' +
      '<div class="t-row"><span>字辈</span><b>' + esc(zb) + '</b></div>' +
      (m.bio ? '<div class="t-row"><span>简介</span><b style="font-weight:400;max-width:160px;text-align:right">' + esc(m.bio) + '</b></div>' : '') +
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
  function fit() {
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    members.forEach(function (m) { if (!pos[m.id]) return; minX = Math.min(minX, pos[m.id].x); minY = Math.min(minY, pos[m.id].y); maxX = Math.max(maxX, pos[m.id].x); maxY = Math.max(maxY, pos[m.id].y); });
    if (minX > maxX) return;
    minX -= NODE_W; minY -= NODE_H; maxX += NODE_W; maxY += NODE_H;
    var W = maxX - minX, H = maxY - minY;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var k = Math.min(sw / W, sh / H, 1.2);
    view.k = k;
    view.x = (sw - W * k) / 2 - minX * k;
    view.y = (sh - H * k) / 2 - minY * k;
    applyView();
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
    document.getElementById('zpReset').addEventListener('click', function () { view = { x: 0, y: 0, k: 1 }; view.k = 1; fit(); });
    document.getElementById('zpToggle').addEventListener('click', function () {
      layoutMode = layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
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

  /* ---------------- 启动 ---------------- */
  function boot() {
    var legend = document.getElementById('zpLegend');
    if (legend) legend.innerHTML = '<div><i style="background:' + ((settings.lines && settings.lines.parent) || '#cfd3d8') + '"></i>父子 / 母子</div><div><i style="background:' + ((settings.lines && settings.lines.marriage) || '#e5484d') + '"></i>两姓结姻</div>';
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
