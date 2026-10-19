/* ============================================================================
 * 画布编辑器（无边记式）：拖拽成员、绘制父子/姻亲连线
 * ========================================================================== */
(function () {
  'use strict';
  var STATE = window.ZP_ED || { members: [], settings: {}, me: null };
  var members = STATE.members || [];
  var settings = STATE.settings || {};
  var me = STATE.me || null;
  var lines = (settings.lines || {});

  var PARENT_COLOR = lines.parent || '#cfd3d8';
  var MARRIAGE_COLOR = lines.marriage || '#e5484d';
  var SELF_COLOR = lines.self || '#ff7500';

  var byId = {};
  members.forEach(function (m) { byId[m.id] = m; });

  var posMap = {};           // id -> {x, y}
  var nodeEls = {};          // id -> element
  var center = {};           // id -> {x, y} 中心点（世界坐标）
  var view = { x: 0, y: 0, scale: 1 };
  var mode = 'move';
  var pending = null;         // 连线模式的待连接源

  var stage = document.getElementById('edStage');
  var world = document.getElementById('edWorld');
  var nodesLayer = document.getElementById('edNodes');
  var svg = document.getElementById('edLines');
  var SVGNS = 'http://www.w3.org/2000/svg';

  function toast(msg) {
    var t = document.getElementById('zpToast');
    t.textContent = msg; t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(id) { return byId[id]; }

  /* ---------- 代数 / 自动布局 ---------- */
  function generation(id, seen, guard) {
    if (seen[id] != null) return seen[id];
    if (guard > 200) return 0;
    var m = get(id);
    if (!m) return 0;
    var f = m.father_id && get(m.father_id), mo = m.mother_id && get(m.mother_id);
    if (!f && !mo) { seen[id] = 0; return 0; }
    var g = 0;
    if (f) g = Math.max(g, generation(f.id, seen, guard + 1) + 1);
    if (mo) g = Math.max(g, generation(mo.id, seen, guard + 1) + 1);
    seen[id] = g; return g;
  }
  function autoLayout() {
    var seen = {};
    members.forEach(function (m) { generation(m.id, seen, 0); });
    var groups = {};
    members.forEach(function (m) { var g = seen[m.id] || 0; (groups[g] = groups[g] || []).push(m); });
    var vGap = 150, hGap = 170, ox = 80, oy = 80;
    Object.keys(groups).forEach(function (g) {
      var list = groups[g].sort(function (a, b) { return ((a.order || 1) - (b.order || 1)) || (a.name < b.name ? -1 : 1); });
      list.forEach(function (m, i) {
        if (!posMap[m.id]) posMap[m.id] = { x: ox + i * hGap, y: oy + (g * 1) * vGap };
      });
    });
  }

  /* ---------- 渲染节点 ---------- */
  function renderNodes() {
    nodesLayer.innerHTML = '';
    nodeEls = {};
    members.forEach(function (m) {
      var p = posMap[m.id] || { x: 80, y: 80 };
      var el = document.createElement('div');
      el.className = 'ed-node' + (m.id === me ? ' self' : '') + (m.id === pending ? ' pending' : '');
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

  /* ---------- 渲染连线 ---------- */
  function measureCenters() {
    members.forEach(function (m) {
      var el = nodeEls[m.id];
      var p = posMap[m.id] || { x: 80, y: 80 };
      center[m.id] = { x: p.x + (el ? el.offsetWidth : 96) / 2, y: p.y + (el ? el.offsetHeight : 56) / 2 };
    });
  }
  function renderLines() {
    measureCenters();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    members.forEach(function (m) {
      var c = center[m.id]; if (!c) return;
      ['father_id', 'mother_id'].forEach(function (pk) {
        var pid = m[pk]; if (!pid || !get(pid) || !center[pid]) return;
        drawLine(center[pid], c, PARENT_COLOR, 'parent', pid, m.id);
      });
    });
    // 姻亲（每对只画一次）
    var done = {};
    members.forEach(function (m) {
      (m.spouse_ids || []).forEach(function (sid) {
        if (!get(sid) || !center[sid]) return;
        var key = [m.id, sid].sort().join('|');
        if (done[key]) return; done[key] = true;
        drawLine(c2(m.id), c2(sid), MARRIAGE_COLOR, 'marriage', m.id, sid);
      });
    });
  }
  function c2(id) { return center[id]; }
  function drawLine(a, b, color, type, from, to) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'ed-line');
    g.dataset.type = type; g.dataset.from = from; g.dataset.to = to;
    // 透明加宽命中区
    var hit = document.createElementNS(SVGNS, 'line');
    hit.setAttribute('x1', a.x); hit.setAttribute('y1', a.y);
    hit.setAttribute('x2', b.x); hit.setAttribute('y2', b.y);
    hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14');
    // 可见线
    var line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', type === 'marriage' ? '2.5' : '2.5');
    line.setAttribute('stroke-linecap', 'round');
    g.appendChild(hit); g.appendChild(line);
    g.addEventListener('click', function (e) { e.stopPropagation(); onLineClick(type, from, to); });
    svg.appendChild(g);
  }

  /* ---------- 视图变换 ---------- */
  function applyView() {
    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
  }
  function stageRect() { return stage.getBoundingClientRect(); }
  function toWorld(clientX, clientY) {
    var r = stageRect();
    return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale };
  }
  function fit() {
    measureCenters();
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach(function (m) {
      var el = nodeEls[m.id], p = posMap[m.id]; if (!p) return;
      var w = el ? el.offsetWidth : 96, h = el ? el.offsetHeight : 56;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w); maxY = Math.max(maxY, p.y + h);
    });
    if (!isFinite(minX)) { view = { x: 40, y: 40, scale: 1 }; applyView(); return; }
    var r = stageRect();
    var pad = 60;
    var cw = (maxX - minX) + pad * 2, ch = (maxY - minY) + pad * 2;
    var s = Math.min(r.width / cw, r.height / ch, 1.4);
    s = Math.max(0.2, s);
    view.scale = s;
    view.x = (r.width - (maxX - minX) * s) / 2 - minX * s;
    view.y = (r.height - (maxY - minY) * s) / 2 - minY * s;
    applyView();
  }

  /* ---------- 平移 / 缩放 ---------- */
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = stageRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var before = { x: (mx - view.x) / view.scale, y: (my - view.y) / view.scale };
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view.scale = Math.max(0.15, Math.min(2.5, view.scale * factor));
    view.x = mx - before.x * view.scale;
    view.y = my - before.y * view.scale;
    applyView();
  }, { passive: false });

  var panning = false, panStart = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.ed-node')) return;       // 节点自己处理
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

  /* ---------- 节点拖拽 / 点击 ---------- */
  function attachNode(el, id) {
    var dragging = false, moved = false, start = null, orig = null;
    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
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
      posMap[id] = { x: orig.x + dx, y: orig.y + dy };
      el.style.left = posMap[id].x + 'px';
      el.style.top = posMap[id].y + 'px';
      renderLines();
    });
    el.addEventListener('pointerup', function (e) {
      dragging = false; el.classList.remove('dragging');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!moved) onNodeClick(id);
    });
  }

  function onNodeClick(id) {
    if (mode === 'parent' || mode === 'marriage') {
      if (!pending) {
        pending = id; updatePending(); return;
      }
      if (pending === id) { pending = null; updatePending(); return; }
      if (mode === 'parent') connectParent(pending, id);
      else connectMarriage(pending, id);
      pending = null; updatePending();
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
    // 长辈作为 parent：按性别决定父/母
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
      toast('已解除姻亲：' + ma.name + ' / ' + mb.name);
    } else {
      ma.spouse_ids = sa.concat([b]);
      mb.spouse_ids = sb.concat([a]);
      toast('已连接姻亲：' + ma.name + ' ∞ ' + mb.name);
    }
    renderNodes(); renderLines();
  }

  function onLineClick(type, from, to) {
    if (mode !== 'unlink') { toast('请切换到「删连线」模式再点击线条'); return; }
    var a = get(from), b = get(to);
    if (type === 'parent') {
      var child = get(to);
      if (child) {
        if (child.father_id === from) child.father_id = null;
        if (child.mother_id === from) child.mother_id = null;
      }
      toast('已删除父子连线');
    } else if (type === 'marriage') {
      if (a) a.spouse_ids = (a.spouse_ids || []).filter(function (x) { return x !== to; });
      if (b) b.spouse_ids = (b.spouse_ids || []).filter(function (x) { return x !== from; });
      toast('已删除姻亲连线');
    }
    renderNodes(); renderLines();
  }

  /* ---------- 添加成员 ---------- */
  function nextId() {
    var max = 0;
    members.forEach(function (m) {
      var mm = /^m(\d+)$/.exec(m.id || '');
      if (mm) max = Math.max(max, parseInt(mm[1], 10));
    });
    return 'm' + (max + 1);
  }
  document.getElementById('edAddNode').addEventListener('click', function () {
    var name = prompt('新成员姓名：');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    var id = nextId();
    var c = toWorld(stageRect().left + stageRect().width / 2, stageRect().top + stageRect().height / 2);
    var m = { id: id, name: name, zi_bei: '', gender: 'male', birth: '', death: null, bio: '', father_id: null, mother_id: null, spouse_ids: [], order: 99, pos: null };
    members.push(m); byId[id] = m;
    posMap[id] = { x: c.x - 48, y: c.y - 28 };
    renderNodes(); renderLines(); fit();
    toast('已添加，记得点「保存」');
  });

  /* ---------- 保存 ---------- */
  document.getElementById('edSave').addEventListener('click', function () {
    var payload = members.map(function (m) {
      var p = posMap[m.id];
      var el = nodeEls[m.id];
      var copy = {};
      Object.keys(m).forEach(function (k) { copy[k] = m[k]; });
      // 保存为节点中心坐标（与前端一致）
      copy.pos = p ? {
        x: Math.round(p.x + (el ? el.offsetWidth : 96) / 2),
        y: Math.round(p.y + (el ? el.offsetHeight : 56) / 2)
      } : null;
      return copy;
    });
    fetch('api.php?action=save_tree', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: payload })
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.ok) toast('已保存画布'); else toast(r.msg || '保存失败');
    }).catch(function () { toast('网络错误'); });
  });

  document.getElementById('edAuto').addEventListener('click', function () {
    posMap = {}; autoLayout(); renderNodes(); renderLines(); fit(); toast('已自动布局');
  });
  document.getElementById('edFit').addEventListener('click', fit);
  document.getElementById('edLogout').addEventListener('click', function () {
    fetch('api.php?action=logout', { method: 'POST' }).then(function () { location.href = 'index.php'; });
  });

  /* ---------- 模式切换 ---------- */
  document.querySelectorAll('.ed-mode').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.ed-mode').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      mode = b.dataset.mode;
      if (mode === 'move' || mode === 'unlink') { pending = null; updatePending(); }
    });
  });

  /* ---------- 初始化 ---------- */
  members.forEach(function (m) {
    if (m.pos && typeof m.pos.x === 'number' && typeof m.pos.y === 'number') {
      posMap[m.id] = { x: m.pos.x, y: m.pos.y };
    }
  });
  autoLayout();          // 仅填充缺少 pos 的节点
  renderNodes();
  renderLines();
  fit();
  window.addEventListener('resize', fit);
})();
