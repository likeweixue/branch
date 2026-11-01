<?php
/**
 * 前台：族谱树首页 + DeepSeek 风格启动页
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';

zp_ensure_seed();

$members = zp_load_json(MEMBERS_FILE, []);
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$me = null;
$cur = zp_current_user();
if ($cur) { $me = $cur['member_id'] ?? null; }

// 启动页配置
$su = $settings['startup'] ?? [];
$startupName = '访客';
if ($cur) {
    if (!empty($cur['member_id'])) {
        foreach ($members as $mm) { if ($mm['id'] === $cur['member_id']) { $startupName = $mm['name']; break; } }
    }
    if ($startupName === '访客') $startupName = $cur['username'];
}
$zp_startup = [
    'enabled' => !empty($su['enabled']),
    'mode'    => $su['mode'] ?? 'first',
    'name'    => $startupName,
    'brand1'  => $su['brand1'] ?? '宗谱',
    'brand2'  => $su['brand2'] ?? 'CLAN GENEALOGY',
    'brand3'  => $su['brand3'] ?? 'FAMILY TREE OS',
    'org'     => $su['org'] ?? '家族族谱',
];

$zp_data = [
    'members' => $members,
    'settings' => $settings,
    'me' => $me,
    'role' => $cur ? $cur['role'] : null,
    'logged_in' => !empty($cur),
];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 家族族谱</title>
<link rel="stylesheet" href="assets/css/splash.css">
<link rel="stylesheet" href="assets/css/app.css">
</head>
<body>

<!-- ============ 启动页 ============ -->
<div id="zp-splash" class="zp-boot">
  <div class="zps-black">
    <div class="zps-black-inner">
      <svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M50 8 L84 26 L84 62 L50 92 L16 62 L16 26 Z M50 18 L26 31 L26 57 L50 74 L74 57 L74 31 Z M50 30 a8 8 0 1 0 0 16 a8 8 0 1 0 0 -16 Z"/></svg>
      <div class="zps-black-zh"><?= htmlspecialchars($zp_startup['org']) ?></div>
      <div class="zps-black-en"><?= htmlspecialchars($zp_startup['brand2']) ?></div>
      <div class="zps-black-sub"><?= htmlspecialchars($zp_startup['brand3']) ?></div>
    </div>
  </div>

  <div class="zps-wash"></div>
  <div class="zps-flash"></div>

  <div class="zps-plate">
    <div class="zps-grain"></div>
    <div class="zps-brand">
      <div class="zps-b1"><?= htmlspecialchars($zp_startup['brand1']) ?></div>
      <div class="zps-b2"><?= htmlspecialchars($zp_startup['brand2']) ?></div>
      <div class="zps-b3"><b><?= htmlspecialchars($zp_startup['brand3']) ?></b></div>
    </div>

    <div class="zps-frame">
      <div class="zps-corner zps-c-tl"></div><div class="zps-corner zps-c-tr"></div>
      <div class="zps-corner zps-c-bl"></div><div class="zps-corner zps-c-br"></div>
    </div>

    <div class="zps-reticle">
      <svg viewBox="0 0 100 100">
        <g class="zps-rot-a"><circle class="ring-a" cx="50" cy="50" r="46"/></g>
        <g class="zps-rot-b"><circle class="ring-b" cx="50" cy="50" r="38"/></g>
        <circle class="dot-a" cx="50" cy="4" r="1.6"/>
        <circle class="dot-o" cx="50" cy="96" r="2.4"/>
        <path class="bracket" d="M14 30 L14 14 L30 14"/>
        <path class="bracket" d="M86 70 L86 86 L70 86"/>
      </svg>
    </div>

    <div class="zps-center">
      <div class="zps-status" id="zpsStatus"></div>
      <div class="zps-sub" id="zpsSub"></div>
      <div class="zps-rule"></div>
    </div>

    <div class="zps-slats">
      <div class="zps-slat"></div><div class="zps-slat"></div><div class="zps-slat"></div>
      <div class="zps-slat"></div><div class="zps-slat"></div><div class="zps-slat"></div>
    </div>

    <div class="zps-foot"><span>POWERED BY ZUPÚ</span><i></i></div>
    <div class="zps-skip" id="zpsSkip">SKIP ⏭</div>
    <div class="zps-vignette"></div>
  </div>

  <div class="zps-welcome">
    <div class="zps-w1">欢迎</div>
    <div class="zps-w2" id="zpsW2">访客</div>
    <div class="zps-w3">
      <svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M50 8 L84 26 L84 62 L50 92 L16 62 L16 26 Z M50 18 L26 31 L26 57 L50 74 L74 57 L74 31 Z M50 30 a8 8 0 1 0 0 16 a8 8 0 1 0 0 -16 Z"/></svg>
      <span><?= htmlspecialchars($zp_startup['brand3']) ?></span>
    </div>
    <div class="zps-w4">身份核验通过 · 谱系已就绪</div>
  </div>

  <div class="zps-bloom"></div>
  <div class="zps-streak"></div>
</div>

<!-- ============ 顶栏 ============ -->
<header class="zp-top">
  <div class="zp-brand"><b>宗谱</b><span>CLAN GENEALOGY</span></div>
  <div class="spacer"></div>
  <?php if ($cur): ?>
    <div class="zp-user"><span class="dot"></span><?= htmlspecialchars($cur['username']) ?><?= $cur['role']==='admin'?'（管理员）':'' ?></div>
    <button class="zp-btn ghost" id="zpLogout">退出</button>
    <?php if ($cur['role']==='admin'): ?>
      <a class="zp-btn accent" href="admin.php">后台</a>
    <?php endif; ?>
  <?php else: ?>
    <button class="zp-btn accent" data-login-open>登录 / 注册</button>
  <?php endif; ?>
  <span class="zp-tag">字辈 <?= count($settings['zi_bei'] ?? []) ?> 字 · <?= htmlspecialchars($settings['zi_bei'][0] ?? '') ?>→<?= htmlspecialchars(end($settings['zi_bei']) ?? '') ?></span>
</header>

<!-- ============ 画布 ============ -->
<div class="zp-stage" id="zpStage"></div>
<div class="zp-empty" id="zpEmpty" style="display:none">尚无家族成员 · 请管理员在后台添加</div>

<div class="zp-ctrl">
  <button id="zpFit" title="适配视图">⤢</button>
  <button id="zpReset" title="重置缩放">⟳</button>
  <button id="zpToggle" title="横排 / 竖排">⇄ 竖排</button>
</div>

<div class="zp-legend" id="zpLegend"></div>

<div class="zp-tip" id="zpTip"></div>
<div class="zp-toast" id="zpToast"></div>

<!-- ============ 登录浮层 ============ -->
<div class="zp-modal-mask" id="zpLogin">
  <div class="zp-modal">
    <div class="m-head"><h3>登录 / 注册</h3><span class="x" id="zpLoginClose">✕</span></div>
    <div class="m-body">
      <div class="zp-field"><label>用户名</label><input id="zpUser" type="text" placeholder="例如 admin"></div>
      <div class="zp-field"><label>密码（注册至少 6 位）</label><input id="zpPass" type="password" placeholder="••••••"></div>
      <div class="m-actions">
        <button class="zp-btn accent" id="zpLoginBtn">登录</button>
        <button class="zp-btn" id="zpRegBtn">注册新账号</button>
      </div>
      <div class="m-note">默认管理员 admin / admin123（请登录后尽快修改）</div>
    </div>
  </div>
</div>

<script>window.ZP = <?= json_encode($zp_data, JSON_UNESCAPED_UNICODE) ?>;</script>
<script>window.ZP_STARTUP = <?= json_encode($zp_startup, JSON_UNESCAPED_UNICODE) ?>;</script>
<script src="assets/js/splash.js"></script>
<script src="assets/js/app.js"></script>
</body>
</html>
