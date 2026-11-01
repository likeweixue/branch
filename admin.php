<?php
/**
 * 后台管理（需管理员登录）
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';

zp_ensure_seed();

if (!zp_is_admin()) {
    header('Location: index.php');
    exit;
}
$cur = zp_current_user();
$members = zp_load_json(MEMBERS_FILE, []);
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$users_local = zp_load_json(USERS_FILE, []);
$zp_admin = ['members' => $members, 'settings' => $settings];

/* 服务端渲染辅助：取成员名 / 生成下拉选项（即便 JS 未加载也能显示数据） */
function zp_name($ms, $id) {
    if (!$id) return '—';
    foreach ($ms as $m) { if ($m['id'] === $id) return $m['name']; }
    return '—';
}
function zp_opt($ms, $sel, $withNone) {
    $h = $withNone ? '<option value="">（无）</option>' : '';
    foreach ($ms as $m) {
        $lab = htmlspecialchars($m['name']) . ($m['zi_bei'] ? '（' . htmlspecialchars($m['zi_bei']) . '）' : '');
        $h .= '<option value="' . $m['id'] . '"' . ($m['id'] === $sel ? ' selected' : '') . '>' . $lab . '</option>';
    }
    return $h;
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 后台管理</title>
<link rel="stylesheet" href="assets/css/splash.css">
<link rel="stylesheet" href="assets/css/app.css">
<style>
  .ad-wrap{max-width:1100px;margin:74px auto 40px;padding:0 20px;}
  .ad-nav{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;}
  .ad-nav button{border:1.5px solid var(--hair);background:var(--card);color:var(--ink-soft);font-family:var(--din);font-size:13px;letter-spacing:.06em;padding:8px 16px;border-radius:2px;}
  .ad-nav button.on{border-color:var(--accent);color:var(--accent);}
  .ad-panel{display:none;background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.05);}
  .ad-panel.on{display:block;}
  .ad-panel h2{font-family:var(--din);font-size:17px;letter-spacing:.04em;margin:0 0 16px;}
  table.ad-t{width:100%;border-collapse:collapse;font-size:13px;}
  table.ad-t th,table.ad-t td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--hair-soft);}
  table.ad-t th{color:var(--muted);font-weight:600;font-family:var(--mono);font-size:10px;letter-spacing:.1em;}
  .ad-act{color:var(--accent);cursor:pointer;margin-right:10px;}
  .ad-act.del{color:#e5484d;}
  .ad-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;background:var(--bg);padding:18px;border-radius:10px;}
  .ad-form .full{grid-column:1 / -1;}
  .ad-form label{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:5px;}
  .ad-form input,.ad-form select,.ad-form textarea{font:inherit;font-size:13px;padding:9px 11px;border:1px solid var(--hair);border-radius:8px;background:#fff;color:var(--ink);width:100%;outline:none;}
  .ad-form input:focus,.ad-form select:focus,.ad-form textarea:focus{border-color:var(--accent);}
  .ad-form textarea{resize:vertical;min-height:60px;}
  .ad-chk{display:flex;flex-wrap:wrap;gap:10px;max-height:140px;overflow:auto;}
  .ad-chk label{display:flex;align-items:center;gap:5px;font-weight:400;font-size:12px;color:var(--ink);}
  .ad-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
  .ad-row label{font-size:12px;font-weight:600;color:var(--ink-soft);min-width:84px;}
  .ad-row input[type=text],.ad-row select,.ad-row textarea{flex:1;font:inherit;font-size:13px;padding:8px 11px;border:1px solid var(--hair);border-radius:8px;background:#fff;color:var(--ink);outline:none;min-width:160px;}
  .ad-row textarea{font-family:var(--mono);min-height:54px;}
  .ad-color{display:flex;align-items:center;gap:10px;}
  .ad-color input[type=color]{width:46px;height:32px;border:1px solid var(--hair);border-radius:6px;background:none;padding:2px;}
  .ad-muted{color:var(--muted);font-size:12px;font-family:var(--mono);letter-spacing:.04em;}
  .ad-sel-member{font-size:12px;color:var(--muted);}
  .ad-top a{text-decoration:none;}
</style>
</head>
<body>

<header class="zp-top">
  <div class="zp-brand"><b>宗谱</b><span>ADMIN CONSOLE</span></div>
  <div class="spacer"></div>
  <span class="zp-tag"><?= htmlspecialchars($cur['username']) ?> · 管理员</span>
  <a class="zp-btn accent" href="editor.php">画布编辑器 →</a>
  <a class="zp-btn" href="index.php">← 返回首页</a>
  <button class="zp-btn ghost" id="zpLogout">退出</button>
</header>

<div class="ad-wrap">
  <div class="ad-nav">
    <button data-tab="members" class="on">成员管理</button>
    <button data-tab="zb">字辈与排列</button>
    <button data-tab="lines">连线颜色</button>
    <button data-tab="users">用户管理</button>
  </div>

  <!-- 成员管理 -->
  <section class="ad-panel on" id="tab-members">
    <h2>成员管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddMember">+ 添加成员</button>
      <span class="ad-muted">提示：父/母填其一即可；配偶可多选（红线）。删除成员会一并清理其亲属指向。</span></div>
    <div class="ad-form" id="adMemberForm" style="display:none">
      <input type="hidden" id="m_id">
      <div><label>姓名 *</label><input id="m_name" type="text" placeholder="如 刘永生"></div>
      <div><label>字辈（可输入，也可从下拉选）</label><input id="m_zibei" type="text" list="zbList" maxlength="4" placeholder="如 永"><datalist id="zbList"><?php foreach (($settings['zi_bei'] ?? []) as $z): ?><option value="<?= htmlspecialchars($z) ?>"><?php endforeach; ?></datalist></div>
      <div><label>性别</label><select id="m_gender"><option value="male">男</option><option value="female">女</option></select></div>
      <div><label>出生日期</label><input id="m_birth" type="text" placeholder="YYYY-MM-DD"></div>
      <div><label>逝世日期（健在留空）</label><input id="m_death" type="text" placeholder="YYYY-MM-DD"></div>
      <div><label>父亲</label><select id="m_father"><?= zp_opt($members, '', true) ?></select></div>
      <div><label>母亲</label><select id="m_mother"><?= zp_opt($members, '', true) ?></select></div>
      <div class="full"><label>配偶（两姓结姻 · 红线，可多选）</label><div class="ad-chk" id="m_spouse"><?php foreach ($members as $m): ?><label><input type="checkbox" id="sp_<?= $m['id'] ?>" value="<?= $m['id'] ?>"><?= htmlspecialchars($m['name']) . ($m['zi_bei'] ? '（' . htmlspecialchars($m['zi_bei']) . '）' : '') ?></label><?php endforeach; ?></div></div>
      <div><label>同辈排行（数字，越小越年长）</label><input id="m_order" type="number" value="1" min="1"></div>
      <div class="full"><label>简介 / 备注</label><textarea id="m_bio" placeholder="生平、事迹等"></textarea></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="mCancel">取消</button>
        <button class="zp-btn accent" id="mSave">保存成员</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>姓名</th><th>字辈</th><th>性别</th><th>生卒</th><th>父母</th><th>配偶</th><th>操作</th></tr></thead>
      <tbody id="mList"><?php foreach ($members as $m):
        $sp = [];
        foreach (($m['spouse_ids'] ?? []) as $sid) { $sp[] = zp_name($members, $sid); }
        $spouse = $sp ? implode('、', $sp) : '—';
        $par = array_filter([!empty($m['father_id']) ? zp_name($members, $m['father_id']) : null, !empty($m['mother_id']) ? zp_name($members, $m['mother_id']) : null]);
        $parents = $par ? implode(' / ', $par) : '—';
        $gender = ($m['gender'] ?? 'male') === 'female' ? '女' : '男';
        $birth = ($m['birth'] ?? '') ?: '?';
        $life = $birth . (!empty($m['death']) ? ' ～ ' . htmlspecialchars($m['death']) : '');
      ?><tr>
        <td><?= htmlspecialchars($m['name']) ?></td>
        <td><?= $m['zi_bei'] ? htmlspecialchars($m['zi_bei']) : '—' ?></td>
        <td><?= $gender ?></td>
        <td><?= htmlspecialchars($life) ?></td>
        <td><?= htmlspecialchars($parents) ?></td>
        <td><?= htmlspecialchars($spouse) ?></td>
        <td><span class="ad-act" data-edit="<?= $m['id'] ?>">编辑</span><span class="ad-act del" data-del="<?= $m['id'] ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>

  <!-- 字辈与排列 -->
  <section class="ad-panel" id="tab-zb">
    <h2>字辈与排列</h2>
    <div class="ad-row"><label>字辈序列</label><textarea id="zb_list" placeholder="用空格或逗号分隔，如：仁 德 朝 众 大 ……"><?= htmlspecialchars(implode(' ', $settings['zi_bei'] ?? [])) ?></textarea></div>
    <p class="ad-muted">左侧为长辈（大字辈），右侧为晚辈（小字辈）。如「仁德朝众大…永远照光明」，仁是最高辈、明是最低辈。</p>
    <div class="ad-row"><label>排列方向</label>
      <select id="zb_layout"><option value="horizontal"<?= ($settings['layout']??'horizontal')==='horizontal'?' selected':'' ?>>横排（左大字辈 · 右小字辈）</option><option value="vertical"<?= ($settings['layout']??'')==='vertical'?' selected':'' ?>>竖排（上大字辈 · 下小字辈）</option></select>
    </div>
    <h2 style="margin-top:22px">启动页</h2>
    <div class="ad-row"><label>启用启动页</label><input type="checkbox" id="su_enabled" <?= !empty($settings['startup']['enabled'])?'checked':'' ?>></div>
    <div class="ad-row"><label>播放时机</label><select id="su_mode"><option value="first"<?= ($settings['startup']['mode']??'first')==='first'?' selected':'' ?>>首次访问</option><option value="always"<?= ($settings['startup']['mode']??'')==='always'?' selected':'' ?>>每次访问</option><option value="off"<?= ($settings['startup']['mode']??'')==='off'?' selected':'' ?>>关闭</option></select></div>
    <div class="ad-row"><label>主标题</label><input type="text" id="su_b1" value="<?= htmlspecialchars($settings['startup']['brand1'] ?? '宗谱') ?>"></div>
    <div class="ad-row"><label>副标题</label><input type="text" id="su_b2" value="<?= htmlspecialchars($settings['startup']['brand2'] ?? 'CLAN GENEALOGY') ?>"></div>
    <div class="ad-row"><label>产品行</label><input type="text" id="su_b3" value="<?= htmlspecialchars($settings['startup']['brand3'] ?? 'FAMILY TREE OS') ?>"></div>
    <div class="ad-row"><label>组织名</label><input type="text" id="su_org" value="<?= htmlspecialchars($settings['startup']['org'] ?? '家族族谱') ?>"></div>
    <div class="ad-row" style="justify-content:flex-end"><button class="zp-btn accent" id="zbSave">保存字辈与启动页</button></div>
  </section>

  <!-- 连线颜色 -->
  <section class="ad-panel" id="tab-lines">
    <h2>连线颜色</h2>
    <p class="ad-muted">父子/母子默认浅线；两姓结姻（婚姻）默认红线；本人节点高亮色。</p>
    <div class="ad-row"><label>父子 / 母子</label><div class="ad-color"><input type="color" id="ln_parent" value="<?= htmlspecialchars($settings['lines']['parent'] ?? '#cfd3d8') ?>"><span id="ln_parent_v" class="ad-muted"></span></div></div>
    <div class="ad-row"><label>两姓结姻</label><div class="ad-color"><input type="color" id="ln_marriage" value="<?= htmlspecialchars($settings['lines']['marriage'] ?? '#e5484d') ?>"><span id="ln_marriage_v" class="ad-muted"></span></div></div>
    <div class="ad-row"><label>本人高亮</label><div class="ad-color"><input type="color" id="ln_self" value="<?= htmlspecialchars($settings['lines']['self'] ?? '#ff7500') ?>"><span id="ln_self_v" class="ad-muted"></span></div></div>
    <div class="ad-row" style="justify-content:flex-end"><button class="zp-btn accent" id="lnSave">保存连线颜色</button></div>
  </section>

  <!-- 用户管理 -->
  <section class="ad-panel" id="tab-users">
    <h2>用户管理</h2>
    <div class="ad-row"><button class="zp-btn accent" id="adAddUser">+ 添加用户</button>
      <span class="ad-muted">管理员可创建用户并绑定对应家族成员；普通用户仅可登录浏览。</span></div>
    <div class="ad-form" id="adUserForm" style="display:none">
      <input type="hidden" id="u_id">
      <div><label>用户名 *</label><input id="u_name" type="text"></div>
      <div><label>密码（新增必填 / 修改留空不改）</label><input id="u_pass" type="password" placeholder="至少 6 位"></div>
      <div><label>角色</label><select id="u_role"><option value="member">普通成员</option><option value="admin">管理员</option></select></div>
      <div><label>绑定成员</label><select id="u_member"><?= zp_opt($members, '', true) ?></select></div>
      <div class="full" style="display:flex;gap:10px;justify-content:flex-end">
        <button class="zp-btn ghost" id="uCancel">取消</button>
        <button class="zp-btn accent" id="uSave">保存用户</button>
      </div>
    </div>
    <table class="ad-t">
      <thead><tr><th>用户名</th><th>角色</th><th>绑定成员</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody id="uList"><?php foreach ($users_local as $u):
        $role = ($u['role'] ?? 'member') === 'admin' ? '管理员' : '普通成员';
        $mem = !empty($u['member_id']) ? zp_name($members, $u['member_id']) : '—';
      ?><tr>
        <td><?= htmlspecialchars($u['username']) ?></td>
        <td><?= $role ?></td>
        <td><?= htmlspecialchars($mem) ?></td>
        <td><?= htmlspecialchars($u['created'] ?? '') ?></td>
        <td><span class="ad-act" data-uedit="<?= $u['id'] ?>">编辑</span><span class="ad-act del" data-udel="<?= $u['id'] ?>">删除</span></td>
      </tr><?php endforeach; ?></tbody>
    </table>
  </section>
</div>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_ADMIN = <?= json_encode($zp_admin, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="assets/js/admin.js"></script>
</body>
</html>
