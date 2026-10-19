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

  /* ---------- 标签切换 ---------- */
  document.querySelectorAll('.ad-nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.ad-nav button').forEach(function (x) { x.classList.remove('on'); });
      document.querySelectorAll('.ad-panel').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      document.getElementById('tab-' + b.dataset.tab).classList.add('on');
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
      fillSpouseBox(document.getElementById('m_spouse'), id, m.spouse_ids || []);
    } else {
      document.getElementById('m_id').value = '';
      ['m_name','m_zibei','m_birth','m_death','m_bio'].forEach(function (k) { document.getElementById(k).value = ''; });
      document.getElementById('m_gender').value = 'male';
      document.getElementById('m_father').value = '';
      document.getElementById('m_mother').value = '';
      document.getElementById('m_order').value = 1;
      fillSpouseBox(document.getElementById('m_spouse'), null, []);
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

  /* ---------- 全局 ---------- */
  document.getElementById('zpLogout').addEventListener('click', function () { api('logout', {}, function () { location.href = 'index.php'; }); });

  function loadAll() {
    api('get_tree', {}, function (r) {
      if (r.ok) { STATE.members = r.members; STATE.settings = r.settings; fillZibeiDatalist(); renderMembers(); }
    });
    api('list_users', {}, function (r) { if (r.ok) { users = r.users; renderUsers(); } });
  }

  // 初始渲染
  fillZibeiDatalist();
  renderMembers();
  loadAll(); // 拉取最新成员与用户
})();
