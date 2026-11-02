<?php
/**
 * 前台：家族历史（大事记时间线）
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
$events   = zp_load_json(EVENTS_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }

// 按年代正序（无年份的排在最后）
usort($events, function ($a, $b) {
    $ya = preg_match('/(\d{4})/', (string) ($a['date'] ?? ''), $ma) ? (int) $ma[1] : PHP_INT_MAX;
    $yb = preg_match('/(\d{4})/', (string) ($b['date'] ?? ''), $mb) ? (int) $mb[1] : PHP_INT_MAX;
    if ($ya === $yb) return strcmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? ''));
    return $ya <=> $yb;
});

// 实际出现的分类
$catsPresent = [];
foreach ($events as $e) {
    $c = trim($e['category'] ?? '');
    if ($c !== '') $catsPresent[$c] = ($catsPresent[$c] ?? 0) + 1;
}
$catsOrdered = [];
foreach (zp_event_categories() as $c) {
    if (isset($catsPresent[$c])) $catsOrdered[$c] = $catsPresent[$c];
}
foreach ($catsPresent as $c => $n) {
    if (!isset($catsOrdered[$c])) $catsOrdered[$c] = $n;
}

$years = array_filter(array_map(function ($e) {
    return preg_match('/\d{4}/', (string) ($e['date'] ?? '')) ? (string) $e['date'] : '';
}, $events));
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 家族历史</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/pages.css') ?>">
</head>
<body>

<?php zp_render_header($cur, $settings, 'history', ['login' => 'link']); ?>

<main class="pg-wrap">
  <section class="pg-hero">
    <div class="pg-hero-en">FAMILY CHRONICLE</div>
    <h1>家族历史</h1>
    <p>把迁徙、婚嫁、求学、创业一件件记下来，家就有了来处。</p>
    <div class="pg-hero-meta">
      <span>共 <b><?= count($events) ?></b> 件大事</span>
      <?php if ($years): ?><span>最早 <b><?= zp_h(min($years)) ?></b></span><?php endif; ?>
    </div>
    <?php if ($isAdmin): ?>
      <a class="zp-btn accent pg-hero-act" href="admin.php#history">＋ 记录一件大事</a>
    <?php endif; ?>
  </section>

  <?php if ($events): ?>
  <div class="pg-filter">
    <input type="search" id="pgSearch" class="pg-search" placeholder="搜索事件标题、内容…" autocomplete="off">
    <div class="pg-chips" id="pgChips">
      <button class="pg-chip on" data-cat="">全部 <?= count($events) ?></button>
      <?php foreach ($catsOrdered as $c => $n): ?>
        <button class="pg-chip" data-cat="<?= zp_h($c) ?>"><?= zp_h($c) ?> <?= $n ?></button>
      <?php endforeach; ?>
    </div>
    <button class="pg-sort" id="pgSort" data-dir="asc" title="切换时间顺序">时间：正序 ↑</button>
  </div>

  <div class="tl" id="pgList">
    <?php foreach ($events as $e):
      $date = trim($e['date'] ?? '');
      $cat  = trim($e['category'] ?? '');
      $ids  = is_array($e['member_ids'] ?? null) ? $e['member_ids'] : [];
    ?>
    <article class="tl-item" data-cat="<?= zp_h($cat) ?>">
      <div class="tl-year"><?= $date !== '' ? zp_h($date) : '待考' ?></div>
      <div class="tl-rail"><span class="tl-dot"></span></div>
      <div class="tl-card">
        <div class="tl-head">
          <?php if ($cat !== ''): ?><span class="tl-cat"><?= zp_h($cat) ?></span><?php endif; ?>
          <h3><?= zp_h($e['title'] ?? '') ?></h3>
        </div>
        <?php if (trim($e['text'] ?? '') !== ''): ?>
          <p class="tl-text"><?= nl2br(zp_h($e['text'])) ?></p>
        <?php endif; ?>
        <?php if ($ids): ?>
          <div class="tl-members">
            <?php foreach ($ids as $mid): if (!isset($byId[$mid])) continue; ?>
              <span class="tl-mem"><?= zp_h($byId[$mid]['name']) ?></span>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>
    </article>
    <?php endforeach; ?>
  </div>
  <p class="pg-none" id="pgNone" hidden>没有匹配的事件</p>
  <?php else: ?>
  <div class="pg-blank">
    <div class="pg-blank-ic">⌛</div>
    <h3>还没有历史记录</h3>
    <p>祖辈从哪里迁来、哪一年成家、谁第一个外出求学，都值得记一笔。<?= $isAdmin ? '从后台「历史管理」开始添加。' : '请联系家族管理员添加。' ?></p>
    <?php if ($isAdmin): ?><a class="zp-btn accent" href="admin.php#history">去记录</a><?php endif; ?>
  </div>
  <?php endif; ?>
</main>

<script src="<?= zp_asset('assets/js/nav.js') ?>"></script>
<script src="<?= zp_asset('assets/js/pages.js') ?>"></script>
</body>
</html>
