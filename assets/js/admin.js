/* ============================================================================
 * ZUPÚ 后台管理逻辑
 * ========================================================================== */
(function () {
  'use strict';
  var STATE = window.ZP_ADMIN || { members: [], settings: {} };
  var users = [];

  function api(action, data, cb) {
    fetch('api.php?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function (r) { return r.json(); }).then(cb).catch(function () { toast('网络错误'); });
  }
  function toast(msg) { var t = document.getElementById('zpToast'); t.textContent = msg; t.classList.add('on'); setTimeout(function () { t.classList.remove('on'); }, 2200); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function byId(id) { return STATE.members.find(function (m) { return m.id === id; }); }
  function nameOf(id) { var m = byId(id); return m ? m.name : '—'; }

  /* ---------- 通用：图片预览（头像 / 相册链接） ---------- */
  function avaCell(url, name) {
    if (url) return '<span class="ad-thumb"><img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
    return '<span class="ad-thumb is-empty"><i>' + esc(String(name || '?').slice(0, 1)) + '</i></span>';
  }
  function bindPreview(inputId, prevId, phText) {
    var input = document.getElementById(inputId);
    var prev = document.getElementById(prevId);
    if (!input || !prev) return;
    function draw() {
      var u = input.value.trim();
      if (!u) { prev.innerHTML = '<span>' + esc(phText) + '</span>'; return; }
      prev.innerHTML = '<img src="' + esc(u) + '" alt="">';
      var img = prev.querySelector('img');
      img.addEventListener('error', function () { prev.innerHTML = '<span>加载失败</span>'; });
    }
    input.addEventListener('input', draw);
    input.addEventListener('change', draw);
    input.__draw = draw;
    draw();
  }

  /* ---------- 标签切换（支持 #quotes / #history 直达） ---------- */
  function activateTab(name) {
    var btn = document.querySelector('.ad-nav button[data-tab="' + name + '"]');
    var panel = document.getElementById('tab-' + name);
    if (!btn || !panel) return false;
    document.querySelectorAll('.ad-nav button').forEach(function (x) { x.classList.remove('on'); });
    document.querySelectorAll('.ad-panel').forEach(function (x) { x.classList.remove('on'); });
    btn.classList.add('on');
    panel.classList.add('on');
    return true;
  }
  document.querySelectorAll('.ad-nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      activateTab(b.dataset.tab);
      if (history.replaceState) history.replaceState(null, '', '#' + b.dataset.tab);
    });
  });

  /* ---------- 下拉填充 ---------- */
  function fillMemberSelect(sel, excludeId, withNone) {
    var html = withNone ? '<option value="">（无）</option>' : '';
    STATE.members.forEach(function (m) {
      if (excludeId && m.id === excludeId) return;
      html += '<option value="' + m.id + '">' + esc(m.name) + (m.zi_bei ? '（' + esc(m.zi_bei) + '）' : '') + '</option>';
    });
    sel.innerHTML = html;
  }
  function fillSpouseBox(box, excludeId, selected) {
    box.innerHTML = '';
    STATE.members.forEach(function (m) {
      if (excludeId && m.id === excludeId) return;
      var id = 'sp_' + m.id;
      var lab = document.createElement('label');
      lab.innerHTML = '<input type="checkbox" id="' + id + '" value="' + m.id + '"' + (selected.indexOf(m.id) !== -1 ? ' checked' : '') + '>' + esc(m.name) + (m.zi_bei ? '（' + esc(m.zi_bei) + '）' : '');
      box.appendChild(lab);
    });
  }
  function fillZibeiDatalist() {
    var dl = document.getElementById('zbList');
    if (!dl) return;
    dl.innerHTML = (STATE.settings.zi_bei || []).map(function (z) { return '<option value="' + esc(z) + '">'; }).join('');
  }

  /* ---------- 成员列表 ---------- */
  function renderMembers() {
    var tb = document.getElementById('mList');
    tb.innerHTML = '';
    STATE.members.forEach(function (m) {
      var tr = document.createElement('tr');
      var spouse = (m.spouse_ids || []).map(nameOf).join('、') || '—';
      var parents = [m.father_id ? nameOf(m.father_id) : null, m.mother_id ? nameOf(m.mother_id) : null].filter(Boolean).join(' / ') || '—';
      tr.innerHTML =
        '<td>' + avaCell(m.avatar, m.name) + '</td>' +
        '<td>' + esc(m.name) + '</td>' +
        '<td>' + (m.zi_bei ? esc(m.zi_bei) : '—') + '</td>' +
        '<td>' + (m.gender === 'female' ? '女' : '男') + '</td>' +
        '<td>' + (m.birth || '?') + (m.death ? ' ～ ' + m.death : '') + '</td>' +
        '<td>' + esc(parents) + '</td>' +
        '<td>' + esc(spouse) + '</td>' +
        '<td><span class="ad-act" data-edit="' + m.id + '">编辑</span><span class="ad-act del" data-del="' + m.id + '">删除</span></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-edit]').forEach(function (e) {
      e.addEventListener('click', function () { openMemberForm(e.dataset.edit); });
    });
    tb.querySelectorAll('[data-del]').forEach(function (e) {
      e.addEventListener('click', function () {
        if (confirm('确定删除「' + nameOf(e.dataset.del) + '」？相关亲属指向会一并清理。')) {
          api('delete_member', { id: e.dataset.del }, function (r) { if (r.ok) { toast('已删除'); loadAll(); } else toast(r.msg || '删除失败'); });
        }
      });
    });
  }

  function openMemberForm(id) {
    var f = document.getElementById('adMemberForm');
    f.style.display = 'grid';
    fillMemberSelect(document.getElementById('m_father'), id, true);
    fillMemberSelect(document.getElementById('m_mother'), id, true);
    if (id) {
      var m = byId(id);
      document.getElementById('m_id').value = m.id;
      document.getElementById('m_name').value = m.name || '';
      document.getElementById('m_zibei').value = m.zi_bei || '';
      document.getElementById('m_gender').value = m.gender || 'male';
      document.getElementById('m_birth').value = m.birth || '';
      document.getElementById('m_death').value = m.death || '';
      document.getElementById('m_father').value = m.father_id || '';
      document.getElementById('m_mother').value = m.mother_id || '';
      document.getElementById('m_order').value = m.order || 1;
      document.getElementById('m_bio').value = m.bio || '';
      document.getElementById('m_avatar').value = m.avatar || '';
      fillSpouseBox(document.getElementById('m_spouse'), id, m.spouse_ids || []);
      if (document.getElementById('m_avatar').__draw) document.getElementById('m_avatar').__draw();
    } else {
      document.getElementById('m_id').value = '';
      ['m_name','m_zibei','m_birth','m_death','m_bio','m_avatar'].forEach(function (k) { document.getElementById(k).value = ''; });
      document.getElementById('m_gender').value = 'male';
      document.getElementById('m_father').value = '';
      document.getElementById('m_mother').value = '';
      document.getElementById('m_order').value = 1;
      fillSpouseBox(document.getElementById('m_spouse'), null, []);
      if (document.getElementById('m_avatar').__draw) document.getElementById('m_avatar').__draw();
    }
    f.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('adAddMember').addEventListener('click', function () { openMemberForm(null); });
  document.getElementById('mCancel').addEventListener('click', function () { document.getElementById('adMemberForm').style.display = 'none'; });
  document.getElementById('mSave').addEventListener('click', function () {
    var spouse = [];
    document.querySelectorAll('#m_spouse input:checked').forEach(function (c) { spouse.push(c.value); });
    var data = {
      id: document.getElementById('m_id').value,
      name: document.getElementById('m_name').value.trim(),
      zi_bei: document.getElementById('m_zibei').value.trim(),
      gender: document.getElementById('m_gender').value,
      birth: document.getElementById('m_birth').value.trim(),
      death: document.getElementById('m_death').value.trim(),
      father_id: document.getElementById('m_father').value || '',
      mother_id: document.getElementById('m_mother').value || '',
      spouse_ids: spouse,
      order: parseInt(document.getElementById('m_order').value, 10) || 1,
      bio: document.getElementById('m_bio').value.trim(),
      avatar: document.getElementById('m_avatar').value.trim(),
    };
    if (!data.name) { toast('请填写姓名'); return; }
    api('save_member', data, function (r) { if (r.ok) { toast('已保存'); document.getElementById('adMemberForm').style.display = 'none'; loadAll(); } else toast(r.msg || '保存失败'); });
  });

  /* ---------- 字辈 / 排列 / 启动页 ---------- */
  document.getElementById('zbSave').addEventListener('click', function () {
    var raw = document.getElementById('zb_list').value;
    var zb = raw.split(/[\s,，、]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    var data = {
      zi_bei: zb,
      layout: document.getElementById('zb_layout').value,
      startup: {
        enabled: document.getElementById('su_enabled').checked,
        mode: document.getElementById('su_mode').value,
        brand1: document.getElementById('su_b1').value,
        brand2: document.getElementById('su_b2').value,
        brand3: document.getElementById('su_b3').value,
        org: document.getElementById('su_org').value,
      }
    };
    api('save_settings', data, function (r) { if (r.ok) { toast('已保存'); loadAll(); } else toast(r.msg || '保存失败'); });
  });

  /* ---------- 连线颜色 ---------- */
  function bindColor(id, vid) {
    var el = document.getElementById(id), v = document.getElementById(vid);
    var upd = function () { if (v) v.textContent = el.value; };
    el.addEventListener('input', upd); upd();
  }
  bindColor('ln_parent', 'ln_parent_v'); bindColor('ln_marriage', 'ln_marriage_v'); bindColor('ln_self', 'ln_self_v');
  document.getElementById('lnSave').addEventListener('click', function () {
    var data = { lines: {
      parent: document.getElementById('ln_parent').value,
      marriage: document.getElementById('ln_marriage').value,
      self: document.getElementById('ln_self').value
    } };
    api('save_settings', data, function (r) { if (r.ok) toast('已保存连线颜色'); else toast(r.msg || '保存失败'); });
  });

  /* ---------- 用户管理 ---------- */
  function renderUsers() {
    var tb = document.getElementById('uList');
    tb.innerHTML = '';
    users.forEach(function (u) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(u.username) + '</td>' +
        '<td>' + (u.role === 'admin' ? '管理员' : '普通成员') + '</td>' +
        '<td>' + (u.member_id ? esc(nameOf(u.member_id)) : '—') + '</td>' +
        '<td>' + esc(u.created) + '</td>' +
        '<td><span class="ad-act" data-uedit="' + u.id + '">编辑</span><span class="ad-act del" data-udel="' + u.id + '">删除</span></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-uedit]').forEach(function (e) { e.addEventListener('click', function () { openUserForm(e.dataset.uedit); }); });
    tb.querySelectorAll('[data-udel]').forEach(function (e) { e.addEventListener('click', function () {
      if (confirm('确定删除该用户？')) api('delete_user', { id: e.dataset.udel }, function (r) { if (r.ok) { toast('已删除'); loadAll(); } else toast(r.msg || '删除失败'); });
    }); });
  }
  function openUserForm(id) {
    var f = document.getElementById('adUserForm');
    f.style.display = 'grid';
    fillMemberSelect(document.getElementById('u_member'), null, true);
    if (id) {
      var u = users.find(function (x) { return x.id === id; });
      document.getElementById('u_id').value = u.id;
      document.getElementById('u_name').value = u.username;
      document.getElementById('u_pass').value = '';
      document.getElementById('u_role').value = u.role;
      document.getElementById('u_member').value = u.member_id || '';
    } else {
      document.getElementById('u_id').value = '';
      document.getElementById('u_name').value = '';
      document.getElementById('u_pass').value = '';
      document.getElementById('u_role').value = 'member';
      document.getElementById('u_member').value = '';
    }
    f.scrollIntoView({ behavior: 'smooth' });
  }
  document.getElementById('adAddUser').addEventListener('click', function () { openUserForm(null); });
  document.getElementById('uCancel').addEventListener('click', function () { document.getElementById('adUserForm').style.display = 'none'; });
  document.getElementById('uSave').addEventListener('click', function () {
    var data = {
      id: document.getElementById('u_id').value,
      username: document.getElementById('u_name').value.trim(),
      password: document.getElementById('u_pass').value,
      role: document.getElementById('u_role').value,
      member_id: document.getElementById('u_member').value || '',
    };
    if (!data.username) { toast('请填写用户名'); return; }
    api('save_user', data, function (r) { if (r.ok) { toast('已保存'); document.getElementById('adUserForm').style.display = 'none'; loadAll(); } else toast(r.msg || '保存失败'); });
  });

  /* ---------- 语录管理 ---------- */
  var quotes = (STATE.quotes || []).slice();

  function qSpeaker(q) {
    if (q.member_id) { var m = byId(q.member_id); if (m) return m.name; }
    return (q.speaker || '').trim() || '佚名';
  }
  function cut(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function renderQuotes() {
    var tb = document.getElementById('qList');
    if (!tb) return;
    tb.innerHTML = '';
    quotes.forEach(function (q) {
      var meta = [q.context, q.year].filter(function (s) { return s && String(s).trim(); }).join(' · ') || '—';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(qSpeaker(q)) + (q.relation ? '<span class="ad-muted"> · ' + esc(q.relation) + '</span>' : '') + '</td>' +
        '<td>' + esc(cut(q.text, 40)) + '</td>' +
        '<td>' + esc(meta) + '</td>' +
        '<td><span class="ad-act" data-qedit="' + q.id + '">编辑</span><span class="ad-act del" data-qdel="' + q.id + '">删除</span></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-qedit]').forEach(function (e) {
      e.addEventListener('click', function () { openQuoteForm(e.dataset.qedit); });
    });
    tb.querySelectorAll('[data-qdel]').forEach(function (e) {
      e.addEventListener('click', function () {
        if (!confirm('确定删除这条语录？')) return;
        api('delete_quote', { id: e.dataset.qdel }, function (r) {
          if (r.ok) { toast('已删除'); loadAll(); } else toast(r.msg || '删除失败');
        });
      });
    });
  }
  function openQuoteForm(id) {
    var f = document.getElementById('adQuoteForm');
    if (!f) return;
    f.style.display = 'grid';
    fillMemberSelect(document.getElementById('q_member'), null, true);
    var q = id ? quotes.filter(function (x) { return x.id === id; })[0] : null;
    document.getElementById('q_id').value = q ? q.id : '';
    document.getElementById('q_member').value = q && q.member_id ? q.member_id : '';
    document.getElementById('q_relation').value = q ? (q.relation || '') : '';
    document.getElementById('q_speaker').value = q ? (q.speaker || '') : '';
    document.getElementById('q_year').value = q ? (q.year || '') : '';
    document.getElementById('q_text').value = q ? (q.text || '') : '';
    document.getElementById('q_context').value = q ? (q.context || '') : '';
    document.getElementById('q_text').focus();
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.getElementById('adAddQuote').addEventListener('click', function () { openQuoteForm(null); });
  document.getElementById('qCancel').addEventListener('click', function () { document.getElementById('adQuoteForm').style.display = 'none'; });
  document.getElementById('qSave').addEventListener('click', function () {
    var data = {
      id: document.getElementById('q_id').value,
      member_id: document.getElementById('q_member').value || '',
      relation: document.getElementById('q_relation').value.trim(),
      speaker: document.getElementById('q_speaker').value.trim(),
      year: document.getElementById('q_year').value.trim(),
      text: document.getElementById('q_text').value.trim(),
      context: document.getElementById('q_context').value.trim(),
    };
    if (!data.text) { toast('请填写语录内容'); return; }
    api('save_quote', data, function (r) {
      if (r.ok) { toast('已保存'); document.getElementById('adQuoteForm').style.display = 'none'; loadAll(); }
      else toast(r.msg || '保存失败');
    });
  });

  /* ---------- 历史管理 ---------- */
  var events = (STATE.events || []).slice();

  function fillEventMembers(selected) {
    var box = document.getElementById('ev_members');
    if (!box) return;
    box.innerHTML = '';
    STATE.members.forEach(function (m) {
      var lab = document.createElement('label');
      lab.innerHTML = '<input type="checkbox" value="' + m.id + '"' + (selected.indexOf(m.id) !== -1 ? ' checked' : '') + '>' + esc(m.name);
      box.appendChild(lab);
    });
  }
  function renderEvents() {
    var tb = document.getElementById('evList');
    if (!tb) return;
    tb.innerHTML = '';
    events.forEach(function (ev) {
      var mem = (ev.member_ids || []).map(function (id) { return byId(id) ? byId(id).name : null; }).filter(Boolean).join('、') || '—';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (String(ev.date || '').trim() ? esc(ev.date) : '待考') + '</td>' +
        '<td>' + esc(ev.title) + '</td>' +
        '<td>' + (String(ev.category || '').trim() ? esc(ev.category) : '—') + '</td>' +
        '<td>' + esc(mem) + '</td>' +
        '<td><span class="ad-act" data-evedit="' + ev.id + '">编辑</span><span class="ad-act del" data-evdel="' + ev.id + '">删除</span></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-evedit]').forEach(function (e) {
      e.addEventListener('click', function () { openEventForm(e.dataset.evedit); });
    });
    tb.querySelectorAll('[data-evdel]').forEach(function (e) {
      e.addEventListener('click', function () {
        if (!confirm('确定删除这条历史记录？')) return;
        api('delete_event', { id: e.dataset.evdel }, function (r) {
          if (r.ok) { toast('已删除'); loadAll(); } else toast(r.msg || '删除失败');
        });
      });
    });
  }
  function openEventForm(id) {
    var f = document.getElementById('adEventForm');
    if (!f) return;
    var ev = id ? events.filter(function (x) { return x.id === id; })[0] : null;
    f.style.display = 'grid';
    document.getElementById('ev_id').value = ev ? ev.id : '';
    document.getElementById('ev_date').value = ev ? (ev.date || '') : '';
    document.getElementById('ev_cat').value = ev ? (ev.category || '') : '';
    document.getElementById('ev_title').value = ev ? (ev.title || '') : '';
    document.getElementById('ev_text').value = ev ? (ev.text || '') : '';
    fillEventMembers(ev ? (ev.member_ids || []) : []);
    document.getElementById('ev_title').focus();
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.getElementById('adAddEvent').addEventListener('click', function () { openEventForm(null); });
  document.getElementById('evCancel').addEventListener('click', function () { document.getElementById('adEventForm').style.display = 'none'; });
  document.getElementById('evSave').addEventListener('click', function () {
    var ids = [];
    document.querySelectorAll('#ev_members input:checked').forEach(function (c) { ids.push(c.value); });
    var data = {
      id: document.getElementById('ev_id').value,
      date: document.getElementById('ev_date').value.trim(),
      category: document.getElementById('ev_cat').value.trim(),
      title: document.getElementById('ev_title').value.trim(),
      text: document.getElementById('ev_text').value.trim(),
      member_ids: ids,
    };
    if (!data.title) { toast('请填写事件标题'); return; }
    api('save_event', data, function (r) {
      if (r.ok) { toast('已保存'); document.getElementById('adEventForm').style.display = 'none'; loadAll(); }
      else toast(r.msg || '保存失败');
    });
  });

  /* ---------- 相册管理 ---------- */
  var photos = (STATE.photos || []).slice();

  function fillPhotoMembers(selected) {
    var box = document.getElementById('ph_members');
    if (!box) return;
    box.innerHTML = '';
    STATE.members.forEach(function (m) {
      var lab = document.createElement('label');
      lab.innerHTML = '<input type="checkbox" value="' + m.id + '"' + (selected.indexOf(m.id) !== -1 ? ' checked' : '') + '>' + esc(m.name);
      box.appendChild(lab);
    });
  }
  function renderPhotos() {
    var tb = document.getElementById('phList');
    if (!tb) return;
    tb.innerHTML = '';
    photos.forEach(function (ph) {
      var who = (ph.member_ids || []).map(function (id) { return byId(id) ? byId(id).name : null; }).filter(Boolean).join('、') || '—';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + avaCell(ph.url, ph.title || '照').replace('ad-thumb', 'ad-thumb ad-thumb-wide') + '</td>' +
        '<td>' + (String(ph.title || '').trim() ? esc(ph.title) : '（未命名）') +
          (String(ph.note || '').trim() ? '<div class="ad-muted">' + esc(cut(ph.note, 26)) + '</div>' : '') + '</td>' +
        '<td>' + (String(ph.date || '').trim() ? esc(ph.date) : '待考') + '</td>' +
        '<td>' + (String(ph.place || '').trim() ? esc(ph.place) : '—') + '</td>' +
        '<td>' + esc(who) + '</td>' +
        '<td><span class="ad-act" data-phedit="' + ph.id + '">编辑</span><span class="ad-act del" data-phdel="' + ph.id + '">删除</span></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-phedit]').forEach(function (e) {
      e.addEventListener('click', function () { openPhotoForm(e.dataset.phedit); });
    });
    tb.querySelectorAll('[data-phdel]').forEach(function (e) {
      e.addEventListener('click', function () {
        if (!confirm('确定从相册删除这张照片？（只删链接，不影响图床上的原图）')) return;
        api('delete_photo', { id: e.dataset.phdel }, function (r) {
          if (r.ok) { toast('已删除'); loadAll(); } else toast(r.msg || '删除失败');
        });
      });
    });
  }
  function openPhotoForm(id) {
    var f = document.getElementById('adPhotoForm');
    if (!f) return;
    var ph = id ? photos.filter(function (x) { return x.id === id; })[0] : null;
    f.style.display = 'grid';
    document.getElementById('ph_id').value = ph ? ph.id : '';
    document.getElementById('ph_url').value = ph ? (ph.url || '') : '';
    document.getElementById('ph_title').value = ph ? (ph.title || '') : '';
    document.getElementById('ph_date').value = ph ? (ph.date || '') : '';
    document.getElementById('ph_place').value = ph ? (ph.place || '') : '';
    document.getElementById('ph_note').value = ph ? (ph.note || '') : '';
    fillPhotoMembers(ph ? (ph.member_ids || []) : []);
    if (document.getElementById('ph_url').__draw) document.getElementById('ph_url').__draw();
    (ph ? document.getElementById('ph_title') : document.getElementById('ph_url')).focus();
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  var addPhotoBtn = document.getElementById('adAddPhoto');
  if (addPhotoBtn) addPhotoBtn.addEventListener('click', function () { openPhotoForm(null); });
  var phCancel = document.getElementById('phCancel');
  if (phCancel) phCancel.addEventListener('click', function () { document.getElementById('adPhotoForm').style.display = 'none'; });
  var phSave = document.getElementById('phSave');
  if (phSave) phSave.addEventListener('click', function () {
    var ids = [];
    document.querySelectorAll('#ph_members input:checked').forEach(function (c) { ids.push(c.value); });
    var data = {
      id: document.getElementById('ph_id').value,
      url: document.getElementById('ph_url').value.trim(),
      title: document.getElementById('ph_title').value.trim(),
      date: document.getElementById('ph_date').value.trim(),
      place: document.getElementById('ph_place').value.trim(),
      note: document.getElementById('ph_note').value.trim(),
      member_ids: ids,
    };
    if (!data.url) { toast('请填写图片链接'); return; }
    api('save_photo', data, function (r) {
      if (r.ok) { toast('已保存'); document.getElementById('adPhotoForm').style.display = 'none'; loadAll(); }
      else toast(r.msg || '保存失败');
    });
  });

  /* ---------- 全局 ---------- */
  document.getElementById('zpLogout').addEventListener('click', function () { api('logout', {}, function () { location.href = 'index.php'; }); });

  function loadAll() {
    api('get_tree', {}, function (r) {
      if (r.ok) { STATE.members = r.members; STATE.settings = r.settings; fillZibeiDatalist(); renderMembers(); }
    });
    api('list_users', {}, function (r) { if (r.ok) { users = r.users; renderUsers(); } });
    api('list_quotes', {}, function (r) { if (r.ok) { quotes = r.quotes; renderQuotes(); } });
    api('list_events', {}, function (r) { if (r.ok) { events = r.events; renderEvents(); } });
    api('list_photos', {}, function (r) { if (r.ok) { photos = r.photos; renderPhotos(); } });
  }

  // 初始渲染
  fillZibeiDatalist();
  bindPreview('m_avatar', 'm_avatar_prev', '未设置');
  bindPreview('ph_url', 'ph_prev', '预览');
  renderMembers();
  renderQuotes();
  renderEvents();
  renderPhotos();
  var hashTab = (location.hash || '').replace(/^#/, '');
  if (hashTab) activateTab(hashTab);
  loadAll(); // 拉取最新成员、用户、语录、历史
})();
