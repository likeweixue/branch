<?php
/**
 * 画布编辑器（无边记式）：拖拽成员节点、绘制父子/姻亲连线。需管理员登录。
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
$members = zp_load_json(MEMBERS_FILE, []);
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$u = zp_current_user();
$me = $u['member_id'] ?? null;
$ed = ['members' => $members, 'settings' => $settings, 'me' => $me];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 画布编辑器</title>
<link rel="stylesheet" href="assets/css/splash.css">
<link rel="stylesheet" href="assets/css/app.css">
<link rel="stylesheet" href="assets/css/editor.css">
</head>
<body class="ed-body">

<header class="zp-top">
  <div class="zp-brand"><b>宗谱</b><span>CANVAS EDITOR</span></div>
  <div class="spacer"></div>
  <span class="zp-tag">画布编辑器</span>
  <a class="zp-btn" href="admin.php">← 返回后台</a>
  <button class="zp-btn ghost" id="edLogout">退出</button>
</header>

<div class="ed-toolbar">
  <div class="ed-modes">
    <button class="ed-mode on" data-mode="move">✥ 移动</button>
    <button class="ed-mode" data-mode="parent">⤓ 连父子</button>
    <button class="ed-mode" data-mode="marriage">∞ 连姻亲</button>
    <button class="ed-mode" data-mode="unlink">✕ 删连线</button>
  </div>
  <div class="ed-actions">
    <button class="zp-btn" id="edFit">适应屏幕</button>
    <button class="zp-btn" id="edAuto">自动布局</button>
    <button class="zp-btn" id="edAddNode">＋ 添加成员</button>
    <button class="zp-btn accent" id="edSave">保存</button>
  </div>
</div>

<div class="ed-hint" id="edHint">提示：滚轮缩放，拖空白处平移，拖节点可移动。选择「连父子」后依次点击 长辈 → 晚辈；「连姻亲」依次点击两人；「删连线」点击线条删除。</div>

<div class="ed-stage" id="edStage">
  <div class="ed-world" id="edWorld">
    <svg class="ed-lines" id="edLines" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="ed-nodes" id="edNodes"></div>
  </div>
</div>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_ED = <?= json_encode($ed, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="assets/js/editor.js"></script>
</body>
</html>
