<?php
/**
 * 画布编辑器（无边记式）：拖拽成员节点、绘制父子/姻亲连线。
 * 横排 / 竖排自由切换，拖拽会自动吸附对齐，手工摆好可以「保存布局」。
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
$ed = [
    'members'    => $members,
    'settings'   => $settings,
    'me'         => $me,
    'layout'     => $settings['layout'] ?? 'horizontal',
    'layoutMode' => zp_layout_mode($settings),
    'arrows'     => $settings['edge_arrows'] ?? [],
];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 画布编辑器</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/splash.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/editor.css') ?>">
</head>
<body class="ed-body">

<header class="zp-top">
  <a class="zp-brand" href="index.php" style="text-decoration:none;color:inherit"><b>宗谱</b><span>CANVAS EDITOR</span></a>
  <nav class="zp-nav">
    <a href="index.php">族谱</a>
    <a href="quotes.php">语录</a>
    <a href="history.php">历史</a>
  </nav>
  <div class="spacer"></div>
  <a class="zp-btn" href="admin.php">← 返回后台</a>
  <button class="zp-btn ghost" id="edLogout">退出</button>
</header>

<div class="ed-toolbar">
  <div class="ed-tools">
    <div class="ed-grp">
      <span class="ed-grp-t">模式</span>
      <div class="ed-seg" id="edModes">
        <button type="button" class="ed-mode on" data-mode="move">✥ 移动</button>
        <button type="button" class="ed-mode" data-mode="parent">⤓ 连父子</button>
        <button type="button" class="ed-mode" data-mode="marriage">∞ 连姻亲</button>
        <button type="button" class="ed-mode" data-mode="unlink">✕ 删连线</button>
        <button type="button" class="ed-mode" data-mode="arrow">➤ 箭头</button>
        <button type="button" class="ed-mode" data-mode="delete">🗑 删人物</button>
      </div>
    </div>
    <div class="ed-grp">
      <span class="ed-grp-t">排列</span>
      <div class="ed-seg" id="edOrient">
        <button type="button" data-orient="horizontal">⇢ 横排</button>
        <button type="button" data-orient="vertical">⇣ 竖排</button>
      </div>
    </div>
    <div class="ed-grp">
      <span class="ed-grp-t">吸附</span>
      <label class="ed-check"><input type="checkbox" id="edSnap" checked><span>对齐辅助线</span></label>
      <span class="ed-layout-state" id="edLayoutState">自动排列</span>
    </div>
  </div>
  <div class="ed-actions">
    <button class="zp-btn ghost" id="edFit">适应屏幕</button>
    <button class="zp-btn" id="edAuto">自动排列</button>
    <button class="zp-btn" id="edAddNode">＋ 添加成员</button>
    <button class="zp-btn accent" id="edSave">保存布局</button>
  </div>
</div>

<div class="ed-hint" id="edHint">滚轮缩放，拖空白处平移，拖节点可移动（会自动吸附对齐）。「连父子」依次点 长辈 → 晚辈；「连姻亲」依次点两人；「删连线」点线条；「箭头」点线条切换 无 / 正向 / 反向；「删人物」点节点。</div>

<div class="ed-stage" id="edStage">
  <div class="ed-world" id="edWorld">
    <div class="ed-guide v" id="edGuideV" hidden></div>
    <div class="ed-guide h" id="edGuideH" hidden></div>
    <svg class="ed-lines" id="edLines" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="ed-nodes" id="edNodes"></div>
  </div>
</div>

<!-- 面板式弹窗：新增成员 / 确认删除 -->
<div class="ed-mask" id="edMask" hidden>
  <div class="ed-modal" role="dialog" aria-modal="true" aria-labelledby="edModalTitle">
    <div class="ed-modal-h">
      <h3 id="edModalTitle">添加成员</h3>
      <button type="button" class="ed-x" id="edModalX" aria-label="关闭">✕</button>
    </div>
    <div class="ed-modal-b" id="edModalBody"></div>
    <div class="ed-modal-f">
      <button type="button" class="zp-btn ghost" id="edModalCancel">取消</button>
      <button type="button" class="zp-btn accent" id="edModalOk">确定</button>
    </div>
  </div>
</div>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_ED = <?= json_encode($ed, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= zp_asset('assets/js/editor.js') ?>"></script>
</body>
</html>
