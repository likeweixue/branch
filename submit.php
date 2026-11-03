<?php
/**
 * 前台：续谱收集表
 *
 * 别人（没有账号的亲戚也行）在这里填写「新增家人」或「修正现有信息」，
 * 提交后进入 data/submissions.json 排队；管理员在后台「续谱审核」里逐条
 * 批准（合并进族谱）或驳回。相当于一次 PR：提交 → 审核 → 合并。
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';
require_once __DIR__ . '/core/layout.php';
require_once __DIR__ . '/core/submissions.php';

zp_ensure_seed();

$cur      = zp_current_user();
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$members  = zp_load_json(MEMBERS_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }
$nameOf = function ($id) use ($byId) { return $byId[$id]['name'] ?? '—'; };

$done = null;          // 提交成功后的回执 [id, payload, type]
$err  = '';

/* ---------------- 处理提交 ---------------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = $_POST;
    if (trim((string) ($in['website'] ?? '')) !== '') {
        // 蜜罐命中：假装成功，不落库
        $done = ['id' => '—', 'payload' => [], 'type' => 'new'];
    } else {
        $r = zp_sub_add($in);
        if (!empty($r['ok'])) {
            list($payload, $submitter, $meta, ) = zp_sub_clean($in, $members);
            $done = ['id' => $r['id'], 'payload' => $payload, 'type' => $meta['type'], 'target' => $meta['target_id'], 'msg' => $r['msg'] ?? ''];
        } else {
            $err = $r['msg'] ?? '提交失败';
        }
    }
}

/** 表单值回填 */
function zp_sub_old($k, $d = '') { return htmlspecialchars((string) ($_POST[$k] ?? $d), ENT_QUOTES, 'UTF-8'); }
$oldType = (($_POST['type'] ?? 'new') === 'edit') ? 'edit' : 'new';
$oldSpouse = is_array($_POST['spouse_ids'] ?? null) ? $_POST['spouse_ids'] : [];
$zb = $settings['zi_bei'] ?? [];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 续谱收集表</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/splash.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<style>
  .sub-wrap{max-width:1080px; margin:88px auto 60px; padding:0 20px; display:grid; grid-template-columns:1fr 300px; gap:26px; align-items:start;}
  .sub-card{background:var(--card); border:1px solid var(--hair); border-radius:14px; padding:26px 26px 24px; box-shadow:0 10px 30px rgba(0,0,0,.05);}
  .sub-card h1{font-family:var(--din); font-size:22px; letter-spacing:.03em; margin:0 0 6px;}
  .sub-sub{color:var(--muted); font-size:13px; line-height:1.7; margin:0 0 20px;}
  .sub-tabs{display:flex; gap:8px; margin-bottom:20px;}
  .sub-tabs label{border:1.5px solid var(--hair); border-radius:10px; padding:9px 16px; font-size:13px; cursor:pointer; color:var(--ink-soft); display:flex; align-items:center; gap:7px;}
  .sub-tabs input{accent-color:var(--accent);}
  .sub-tabs label.on{border-color:var(--accent); color:var(--accent); background:var(--accent-soft);}
  .sub-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
  .sub-grid .full{grid-column:1 / -1;}
  .sub-field label{display:block; font-size:12px; font-weight:600; color:var(--ink-soft); margin-bottom:6px;}
  .sub-field input[type=text],.sub-field select,.sub-field textarea{
    font:inherit; font-size:13px; width:100%; padding:10px 12px; border:1px solid var(--hair);
    border-radius:9px; background:#fff; color:var(--ink); outline:none;}
  .sub-field input:focus,.sub-field select:focus,.sub-field textarea:focus{border-color:var(--accent);}
  .sub-field textarea{resize:vertical; min-height:72px;}
  .sub-hint{font-size:11px; color:var(--muted); margin-top:6px; line-height:1.6;}
  .sub-chk{display:flex; flex-wrap:wrap; gap:8px 14px; max-height:132px; overflow:auto; border:1px solid var(--hair); border-radius:9px; padding:10px 12px; background:#fff;}
  .sub-chk label{display:flex; align-items:center; gap:5px; font-size:12px; font-weight:400; color:var(--ink); margin:0;}
  .sub-ava{display:flex; gap:12px; align-items:flex-start;}
  .sub-ava-prev{width:64px; height:64px; flex:0 0 64px; border-radius:10px; border:1px solid var(--hair); background:var(--bg-2);
    display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--muted); overflow:hidden;}
  .sub-ava-prev img{width:100%; height:100%; object-fit:cover; display:block;}
  .sub-actions{display:flex; align-items:center; gap:12px; margin-top:22px;}
  .sub-hp{position:absolute; left:-9999px; width:1px; height:1px; opacity:0;}
  .sub-side{background:var(--card); border:1px solid var(--hair); border-radius:14px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,.04);}
  .sub-side h3{font-family:var(--din); font-size:13px; letter-spacing:.08em; margin:0 0 12px; color:var(--ink-soft);}
  .sub-step{display:flex; gap:10px; font-size:12px; line-height:1.65; color:var(--ink-soft); margin-bottom:12px;}
  .sub-step b{flex:0 0 20px; height:20px; border-radius:50%; background:var(--accent-soft); color:var(--accent);
    font-family:var(--din); font-size:11px; display:flex; align-items:center; justify-content:center;}
  .sub-side .ad-muted{font-family:var(--mono); font-size:10px; letter-spacing:.06em; color:var(--muted);}
  .sub-err{border:1px solid #f0c2c3; background:#fdf2f2; color:#b4292d; border-radius:10px; padding:11px 14px; font-size:13px; margin-bottom:16px;}
  .sub-ok{text-align:center; padding:26px 10px 10px;}
  .sub-ok .ring{width:56px; height:56px; margin:0 auto 16px; border-radius:50%; border:1.5px solid var(--accent); color:var(--accent);
    display:flex; align-items:center; justify-content:center; font-size:24px;}
  .sub-ok h2{font-family:var(--din); font-size:19px; margin:0 0 8px;}
  .sub-ok p{color:var(--muted); font-size:13px; line-height:1.8; margin:0 0 4px;}
  .sub-receipt{display:inline-flex; gap:8px; align-items:center; margin:14px 0 4px; font-family:var(--mono); font-size:11px;
    letter-spacing:.08em; color:var(--ink-soft); background:var(--bg); border:1px solid var(--hair); border-radius:999px; padding:6px 14px;}
  .sub-receipt b{color:var(--accent);}
  @media (max-width:900px){
    .sub-wrap{grid-template-columns:1fr; margin-top:78px;}
    .sub-grid{grid-template-columns:1fr;}
  }
</style>
</head>
<body>

<?php zp_render_header($cur, $settings, 'submit', ['login' => 'button', 'sub' => 'CLAN GENEALOGY']); ?>

<div class="sub-wrap">
  <div class="sub-card">
    <?php if ($done): ?>
      <div class="sub-ok">
        <div class="ring">✓</div>
        <h2>已收到，等着入谱</h2>
        <p>
          <?php if (!empty($done['payload']['name'])): ?>
            「<?= zp_h($done['payload']['name']) ?>」的<?= $done['type'] === 'edit' ? '修改申请' : '入谱申请' ?>已经排进审核队列。
          <?php else: ?>
            提交已经收到。
          <?php endif; ?>
        </p>
        <p>管理员核对无误后会合并进族谱，届时在「族谱」页就能看到。</p>
        <div class="sub-receipt">受理编号 <b>#<?= zp_h($done['id']) ?></b></div>
        <div class="sub-actions" style="justify-content:center; margin-top:22px">
          <a class="zp-btn" href="submit.php" style="text-decoration:none">再提交一位</a>
          <a class="zp-btn accent" href="index.php" style="text-decoration:none">去看族谱</a>
        </div>
      </div>
    <?php else: ?>
      <h1>续谱收集表</h1>
      <p class="sub-sub">
        家里添了人、改了名、补上了生卒年，都可以在这里填一笔。提交后由管理员审核，
        通过才会并进族谱——所以放心填，不会直接改坏谱。
      </p>

      <?php if ($err !== ''): ?><div class="sub-err"><?= zp_h($err) ?></div><?php endif; ?>

      <form method="post" action="submit.php" id="subForm">
        <div class="sub-tabs">
          <label class="<?= $oldType === 'new' ? 'on' : '' ?>"><input type="radio" name="type" value="new"<?= $oldType === 'new' ? ' checked' : '' ?>> 新增一位家人</label>
          <label class="<?= $oldType === 'edit' ? 'on' : '' ?>"><input type="radio" name="type" value="edit"<?= $oldType === 'edit' ? ' checked' : '' ?>> 修正现有信息</label>
        </div>

        <div class="sub-grid" id="editPick" style="<?= $oldType === 'edit' ? '' : 'display:none' ?>">
          <div class="sub-field full">
            <label>要修正谁</label>
            <select name="target_id" id="targetSel">
              <option value="">— 选择族谱中已有的人 —</option>
              <?php foreach ($members as $m): ?>
                <option value="<?= zp_h($m['id']) ?>"<?= ($_POST['target_id'] ?? '') === $m['id'] ? ' selected' : '' ?>><?= zp_h($m['name']) ?><?= $m['zi_bei'] ? '（' . zp_h($m['zi_bei']) . '）' : '' ?></option>
              <?php endforeach; ?>
            </select>
            <div class="sub-hint">选好人后，下面的信息会自动带出他现在的记录，改哪项填哪项即可。</div>
          </div>
        </div>

        <div class="sub-grid">
          <div class="sub-field">
            <label>姓名 *</label>
            <input type="text" name="name" id="f_name" maxlength="24" value="<?= zp_sub_old('name') ?>" placeholder="如 刘常云">
          </div>
          <div class="sub-field">
            <label>字辈</label>
            <input type="text" name="zi_bei" id="f_zi" maxlength="4" list="zbList" value="<?= zp_sub_old('zi_bei') ?>" placeholder="如 常">
            <datalist id="zbList"><?php foreach ($zb as $z): ?><option value="<?= htmlspecialchars($z) ?>"><?php endforeach; ?></datalist>
          </div>
          <div class="sub-field">
            <label>性别</label>
            <select name="gender" id="f_gender">
              <option value="male"<?= ($_POST['gender'] ?? 'male') === 'male' ? ' selected' : '' ?>>男</option>
              <option value="female"<?= ($_POST['gender'] ?? '') === 'female' ? ' selected' : '' ?>>女</option>
            </select>
          </div>
          <div class="sub-field">
            <label>出生（可空）</label>
            <input type="text" name="birth" id="f_birth" maxlength="20" value="<?= zp_sub_old('birth') ?>" placeholder="1998-06-12 或 1998">
          </div>
          <div class="sub-field">
            <label>逝世（健在留空）</label>
            <input type="text" name="death" id="f_death" maxlength="20" value="<?= zp_sub_old('death') ?>" placeholder="2011-03">
          </div>
          <div class="sub-field">
            <label>父亲</label>
            <select name="father_id" id="f_father">
              <option value="">（未记）</option>
              <?php foreach ($members as $m): ?>
                <option value="<?= zp_h($m['id']) ?>"<?= ($_POST['father_id'] ?? '') === $m['id'] ? ' selected' : '' ?>><?= zp_h($m['name']) ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="sub-field">
            <label>母亲</label>
            <select name="mother_id" id="f_mother">
              <option value="">（未记）</option>
              <?php foreach ($members as $m): ?>
                <option value="<?= zp_h($m['id']) ?>"<?= ($_POST['mother_id'] ?? '') === $m['id'] ? ' selected' : '' ?>><?= zp_h($m['name']) ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="sub-field full">
            <label>配偶（可多选，最多 4 位）</label>
            <div class="sub-chk" id="f_spouse">
              <?php foreach ($members as $m): ?>
                <label><input type="checkbox" name="spouse_ids[]" value="<?= zp_h($m['id']) ?>"<?= in_array($m['id'], $oldSpouse, true) ? ' checked' : '' ?>><?= zp_h($m['name']) ?></label>
              <?php endforeach; ?>
            </div>
          </div>
          <div class="sub-field full">
            <label>头像链接（可空）</label>
            <div class="sub-ava">
              <div class="sub-ava-prev" id="avaPrev"><span>未设置</span></div>
              <div style="flex:1; min-width:0">
                <input type="text" name="avatar" id="f_avatar" value="<?= zp_sub_old('avatar') ?>" placeholder="https://图床/xxx.jpg">
                <div class="sub-hint">图床直链即可；不填就用姓名首字。</div>
              </div>
            </div>
          </div>
          <div class="sub-field full">
            <label>简介 / 听说过的事</label>
            <textarea name="bio" id="f_bio" maxlength="800" placeholder="生年、住哪儿、做过什么、小名……想到什么写什么"><?= zp_sub_old('bio') ?></textarea>
          </div>

          <div class="sub-field">
            <label>你是谁（称呼）</label>
            <input type="text" name="submitter_name" id="f_sub" maxlength="24" value="<?= zp_sub_old('submitter_name') ?>" placeholder="如 刘永生（刘常云之曾外孙）">
          </div>
          <div class="sub-field">
            <label>联系方式（微信 / 电话，可空）</label>
            <input type="text" name="submitter_contact" maxlength="60" value="<?= zp_sub_old('submitter_contact') ?>" placeholder="方便核对时联系你">
          </div>
          <div class="sub-field full">
            <label>说明（为什么改 / 依据是什么）</label>
            <textarea name="note" maxlength="600" placeholder="如：老人口述、手抄族谱第 3 页、墓碑照片……"><?= zp_sub_old('note') ?></textarea>
          </div>
        </div>

        <input class="sub-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">

        <div class="sub-actions">
          <button class="zp-btn accent" type="submit">提交，等审核</button>
          <span class="sub-hint" style="margin:0">提交不会直接改谱，管理员核对后才并入。</span>
        </div>
      </form>
    <?php endif; ?>
  </div>

  <aside class="sub-side">
    <h3>HOW IT WORKS</h3>
    <div class="sub-step"><b>1</b><div>填写这位家人的姓名、字辈、生卒，选好他挂在谁名下。</div></div>
    <div class="sub-step"><b>2</b><div>提交后进入待审队列，族谱上暂时看不到。</div></div>
    <div class="sub-step"><b>3</b><div>管理员逐条核对，批准即合并进族谱；有疑问会按你留的方式联系。</div></div>
    <div class="sub-step"><b>4</b><div>合并后可继续在后台补照片、语录与大事记。</div></div>
    <p class="ad-muted" style="margin-top:16px">现有 <?= count($members) ?> 位成员 · 待审 <?= zp_subs_pending_count() ?> 条</p>
    <?php if ($isAdmin): ?>
      <p style="margin-top:14px"><a class="zp-btn ghost" href="admin.php#review" style="text-decoration:none;display:inline-flex">去后台审核 →</a></p>
    <?php endif; ?>
  </aside>
</div>

<script>
window.ZP_SUB = <?= json_encode($members, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script>
(function () {
  var MS = window.ZP_SUB || [];
  var byId = {}; MS.forEach(function (m) { byId[m.id] = m; });

  /* 新增 / 修正 切换 */
  var tabs = document.querySelectorAll('.sub-tabs label');
  var pick = document.getElementById('editPick');
  tabs.forEach(function (lb) {
    lb.addEventListener('click', function () {
      setTimeout(function () {
        tabs.forEach(function (x) { x.classList.toggle('on', x.querySelector('input').checked); });
        var isEdit = document.querySelector('input[name=type]:checked').value === 'edit';
        pick.style.display = isEdit ? '' : 'none';
      }, 0);
    });
  });

  /* 选人后带出既有信息 */
  var sel = document.getElementById('targetSel');
  if (sel) sel.addEventListener('change', function () {
    var m = byId[sel.value];
    if (!m) return;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
    set('f_name', m.name); set('f_zi', m.zi_bei); set('f_birth', m.birth); set('f_death', m.death || '');
    set('f_bio', m.bio || ''); set('f_avatar', m.avatar || '');
    document.getElementById('f_gender').value = (m.gender === 'female') ? 'female' : 'male';
    document.getElementById('f_father').value = m.father_id || '';
    document.getElementById('f_mother').value = m.mother_id || '';
    document.querySelectorAll('#f_spouse input').forEach(function (c) {
      c.checked = (m.spouse_ids || []).indexOf(c.value) >= 0;
    });
    drawAva();
  });

  /* 头像预览 */
  var ava = document.getElementById('f_avatar'), prev = document.getElementById('avaPrev');
  function drawAva() {
    var u = (ava.value || '').trim();
    if (!u) { prev.innerHTML = '<span>未设置</span>'; return; }
    prev.innerHTML = '<img src="' + u.replace(/"/g, '&quot;') + '" alt="">';
    var img = prev.querySelector('img');
    img.addEventListener('error', function () { prev.innerHTML = '<span>加载失败</span>'; });
  }
  if (ava) { ava.addEventListener('input', drawAva); ava.addEventListener('change', drawAva); drawAva(); }
})();
</script>
</body>
</html>
