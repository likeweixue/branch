<?php
/**
 * 前台：家族相册（错位照片墙 / 滚轮缩放 / 点击放大）
 * 图片本身放在图床，这里只保存直链，不占本站空间。
 */
require_once __DIR__ . '/core/config.php';
require_once __DIR__ . '/core/storage.php';
require_once __DIR__ . '/core/auth.php';
require_once __DIR__ . '/core/seed.php';
require_once __DIR__ . '/core/layout.php';

zp_ensure_seed();

$cur      = zp_current_user();
$settings = zp_load_json(SETTINGS_FILE, zp_default_settings());
$members  = zp_load_json(MEMBERS_FILE, []);
$photos   = zp_load_json(PHOTOS_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }

/** 取照片年份（用于分组与筛选），没有则空串 */
function zp_photo_year($p) {
    return preg_match('/(\d{4})/', (string) ($p['date'] ?? ''), $m) ? $m[1] : '';
}

// 排序：有年份的按年代正序，无年份的排最后
usort($photos, function ($a, $b) {
    $ya = zp_photo_year($a); $yb = zp_photo_year($b);
    if ($ya === '' && $yb === '') return strcmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? ''));
    if ($ya === '') return 1;
    if ($yb === '') return -1;
    if ($ya !== $yb) return $ya <=> $yb;
    return strcmp((string) ($a['date'] ?? ''), (string) ($b['date'] ?? ''));
});

// 年份分布
$years = [];
foreach ($photos as $p) {
    $y = zp_photo_year($p);
    if ($y !== '') $years[$y] = ($years[$y] ?? 0) + 1;
}
ksort($years);

// 供前端使用：成员名 + 照片（含人物姓名，省得前端再拼）
$memberNames = [];
foreach ($members as $m) { $memberNames[$m['id']] = $m['name']; }
$jsPhotos = [];
foreach ($photos as $p) {
    $who = [];
    foreach ((array) ($p['member_ids'] ?? []) as $mid) {
        if (isset($memberNames[$mid])) $who[] = $memberNames[$mid];
    }
    $jsPhotos[] = [
        'id'    => $p['id'],
        'url'   => $p['url'],
        'title' => $p['title'] ?? '',
        'date'  => $p['date'] ?? '',
        'place' => $p['place'] ?? '',
        'note'  => $p['note'] ?? '',
        'year'  => zp_photo_year($p),
        'who'   => $who,
    ];
}
$zp_album = ['photos' => $jsPhotos, 'isAdmin' => $isAdmin];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 家族相册</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/album.css') ?>">
</head>
<body class="al-body">

<?php zp_render_header($cur, $settings, 'album', ['login' => 'link']); ?>

<main class="al-stage" id="alStage">
  <div class="al-wall" id="alWall"></div>

  <div class="al-blank" id="alBlank"<?= $photos ? ' hidden' : '' ?>>
    <div class="al-blank-ic">▤</div>
    <h3>相册还是空的</h3>
    <p>把老照片传到自己习惯的图床，回到后台「相册管理」贴上直链，就能在这里铺成一面照片墙。</p>
    <?php if ($isAdmin): ?><a class="zp-btn accent" href="admin.php#album">去添加照片</a><?php endif; ?>
  </div>

  <noscript>
    <div class="al-noscript">
      <?php foreach ($photos as $p): ?>
        <figure>
          <img src="<?= zp_h($p['url']) ?>" alt="<?= zp_h($p['title'] ?? '') ?>" loading="lazy" referrerpolicy="no-referrer">
          <?php if (trim($p['title'] ?? '') !== ''): ?><figcaption><?= zp_h($p['title']) ?></figcaption><?php endif; ?>
        </figure>
      <?php endforeach; ?>
    </div>
  </noscript>
</main>

<!-- 左上：相册信息与筛选 -->
<section class="al-hud" id="alHud"<?= $photos ? '' : ' hidden' ?>>
  <div class="al-hud-en">FAMILY ALBUM</div>
  <h1>家族相册</h1>
  <div class="al-hud-meta">
    <span><b><?= count($photos) ?></b> 张照片</span>
    <?php if ($years): ?><span><b><?= count($years) ?></b> 个年代</span><?php endif; ?>
    <span class="al-hud-pct" id="alPct" data-ref="100">100%</span>
  </div>
  <input type="search" class="al-search" id="alSearch" placeholder="搜索标题、地点、人物…" autocomplete="off">
  <div class="al-chips" id="alChips">
    <button class="al-chip on" data-year="">全部 <?= count($photos) ?></button>
    <?php foreach ($years as $y => $n): ?>
      <button class="al-chip" data-year="<?= zp_h($y) ?>"><?= zp_h($y) ?> <?= $n ?></button>
    <?php endforeach; ?>
  </div>
</section>

<!-- 左下：缩放 -->
<div class="al-zoom" id="alZoom"<?= $photos ? '' : ' hidden' ?>>
  <button id="alOut" title="缩小（-）">−</button>
  <button id="alFit" title="适屏（0）">⤢</button>
  <button id="alIn" title="放大（+）">+</button>
</div>

<div class="al-hint" id="alHint"<?= $photos ? '' : ' hidden' ?>>滚轮缩放 · 拖拽平移 · 点击放大</div>

<?php if ($isAdmin): ?>
  <a class="al-admin" href="admin.php#album"<?= $photos ? '' : ' hidden' ?>>＋ 管理照片</a>
<?php endif; ?>

<!-- 灯箱 -->
<div class="al-lb" id="alLb" hidden>
  <div class="al-lb-stage" id="alLbStage">
    <img class="al-lb-img" id="alLbImg" alt="" referrerpolicy="no-referrer">
  </div>
  <div class="al-lb-bar">
    <div class="al-lb-t" id="alLbTitle"></div>
    <div class="al-lb-m" id="alLbMeta"></div>
    <div class="al-lb-n" id="alLbNote"></div>
  </div>
  <div class="al-lb-count" id="alLbCount"></div>
  <button class="al-lb-x" id="alLbX" title="关闭（Esc）">✕</button>
  <button class="al-lb-nav prev" id="alLbPrev" title="上一张（←）">‹</button>
  <button class="al-lb-nav next" id="alLbNext" title="下一张（→）">›</button>
</div>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_ALBUM = <?= json_encode($zp_album, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= zp_asset('assets/js/nav.js') ?>"></script>
<script src="<?= zp_asset('assets/js/album.js') ?>"></script>
</body>
</html>
