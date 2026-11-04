<?php
/**
 * 画布编辑器（无边记式）：拖拽成员节点、绘制父子/姻亲/自定义连线。
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
    'styles'     => (object) ($settings['edge_styles'] ?? []),
    'arrows'     => (object) ($settings['edge_arrows'] ?? []),
    'freeEdges'  => $settings['free_edges'] ?? [],
];

/** 14px 描边图标（不用表情符号，保持简约） */
function ed_icon($name) {
    $p = [
        'select'   => '<path d="M3.6 2.4 12.4 8.2 8.6 9.2 6.9 13Z"/>',
        'link'     => '<circle cx="3.7" cy="12.3" r="1.9"/><circle cx="12.3" cy="3.7" r="1.9"/><path d="M5.2 10.8 10.8 5.2"/>',
        'cut'      => '<path d="M2.4 8h3.4M10.2 8h3.4"/><path d="M6.4 5.2 9.6 10.8M9.6 5.2 6.4 10.8"/>',
        'person-x' => '<circle cx="6.4" cy="5.4" r="2.5"/><path d="M1.9 13.5c0-2.5 2.1-4.1 4.5-4.1 1.4 0 2.7.5 3.5 1.5"/><path d="M10.4 12.6h3.9"/>',
        'col'      => '<path d="M4 3.2v9.6M8 3.2v9.6M12 3.2v9.6"/>',
        'row'      => '<path d="M3.2 4h9.6M3.2 8h9.6M3.2 12h9.6"/>',
        'plus'     => '<path d="M8 3.4v9.2M3.4 8h9.2"/>',
        'x'        => '<path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"/>',
        'trash'    => '<path d="M2.6 4.6h10.8"/><path d="M6.4 2.6h3.2"/><path d="M4.5 4.6 5.2 13a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.4"/><path d="M6.7 7.2v4M9.3 7.2v4"/>',
        'arrow'    => '<path d="M2.6 8h9.4"/><path d="M8.6 4.6 12 8l-3.4 3.4"/>',
        'fit'      => '<path d="M2.6 6V2.6H6M10 2.6h3.4V6M13.4 10v3.4H10M6 13.4H2.6V10"/>',
        'tree'     => '<path d="M8 2.6v4.2M8 6.8H4.4v3M8 6.8h3.6v3"/>',
    ];
    return '<svg class="ed-i" viewBox="0 0 16 16" aria-hidden="true">' . ($p[$name] ?? '') . '</svg>';
}
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
        <button type="button" class="ed-mode on" data-mode="move" title="点选人物 / 线条，拖动可移动"><?= ed_icon('select') ?>选择</button>
        <button type="button" class="ed-mode" data-mode="link" title="依次点两个人，新建一根线"><?= ed_icon('link') ?>连线</button>
        <button type="button" class="ed-mode" data-mode="unlink" title="点线条直接断开"><?= ed_icon('cut') ?>删线</button>
        <button type="button" class="ed-mode" data-mode="delete" title="点人物删除"><?= ed_icon('person-x') ?>删人</button>
      </div>
    </div>
    <div class="ed-grp">
      <span class="ed-grp-t">排列</span>
      <div class="ed-seg" id="edOrient">
        <button type="button" data-orient="horizontal" title="长辈在左，一代一列"><?= ed_icon('col') ?>横排</button>
        <button type="button" data-orient="vertical" title="长辈在上，一代一行"><?= ed_icon('row') ?>竖排</button>
      </div>
    </div>
    <div class="ed-grp">
      <span class="ed-grp-t">吸附</span>
      <label class="ed-check"><input type="checkbox" id="edSnap" checked><span>对齐辅助线</span></label>
      <span class="ed-layout-state" id="edLayoutState">自动排列</span>
    </div>
  </div>
  <div class="ed-actions">
    <button class="zp-btn ghost" id="edFit"><?= ed_icon('fit') ?>适应屏幕</button>
    <button class="zp-btn ghost" id="edAuto"><?= ed_icon('tree') ?>自动排列</button>
    <button class="zp-btn" id="edAddNode"><?= ed_icon('plus') ?>添加成员</button>
    <button class="zp-btn accent" id="edSave">保存布局</button>
  </div>
</div>

<div class="ed-hint" id="edHint">滚轮缩放、拖空白处平移、拖节点移动（自动吸附对齐）。点一个人物或一根线，右侧出设置面板：改颜色、改箭头、断开关系，或「新建连线」连到另一个人。</div>

<div class="ed-stage" id="edStage">
  <div class="ed-world" id="edWorld">
    <div class="ed-guide v" id="edGuideV" hidden></div>
    <div class="ed-guide h" id="edGuideH" hidden></div>
    <svg class="ed-lines" id="edLines" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="ed-nodes" id="edNodes"></div>
  </div>

  <aside class="ed-panel" id="edPanel" hidden></aside>
</div>

<!-- 面板式弹窗：新增成员 / 新建连线 / 确认删除 -->
<div class="ed-mask" id="edMask" hidden>
  <div class="ed-modal" role="dialog" aria-modal="true" aria-labelledby="edModalTitle">
    <div class="ed-modal-h">
      <h3 id="edModalTitle">添加成员</h3>
      <button type="button" class="ed-x" id="edModalX" aria-label="关闭"><?= ed_icon('x') ?></button>
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
