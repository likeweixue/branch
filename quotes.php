<?php
/**
 * 前台：家族语录（长辈的话 / 嘱托）
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
$quotes   = zp_load_json(QUOTES_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }

/** 语录的讲述人显示名 */
function zp_q_speaker($q, $byId) {
    if (!empty($q['member_id']) && isset($byId[$q['member_id']])) {
        return $byId[$q['member_id']]['name'];
    }
    return trim($q['speaker'] ?? '') !== '' ? $q['speaker'] : '佚名';
}

// 讲述人去重（用于筛选）
$speakers = [];
foreach ($quotes as $q) {
    $n = zp_q_speaker($q, $byId);
    $speakers[$n] = ($speakers[$n] ?? 0) + 1;
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 家族语录</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/pages.css') ?>">
</head>
<body>

<?php zp_render_header($cur, $settings, 'quotes', ['login' => 'link']); ?>

<main class="pg-wrap">
  <section class="pg-hero">
    <div class="pg-hero-en">ELDER WORDS</div>
    <h1>家族语录</h1>
    <p>长辈说过的话，是家里最轻、也最久的家训。</p>
    <div class="pg-hero-meta">
      <span>共 <b><?= count($quotes) ?></b> 条</span>
      <span>出自 <b><?= count($speakers) ?></b> 位长辈</span>
    </div>
    <?php if ($isAdmin): ?>
      <a class="zp-btn accent pg-hero-act" href="admin.php#quotes">＋ 添加 / 管理语录</a>
    <?php endif; ?>
  </section>

  <?php if ($quotes): ?>
  <div class="pg-filter">
    <input type="search" id="pgSearch" class="pg-search" placeholder="搜索语录内容、讲述人…" autocomplete="off">
    <div class="pg-chips" id="pgChips">
      <button class="pg-chip on" data-speaker="">全部 <?= count($quotes) ?></button>
      <?php foreach ($speakers as $name => $cnt): ?>
        <button class="pg-chip" data-speaker="<?= zp_h($name) ?>"><?= zp_h($name) ?> <?= $cnt ?></button>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="q-grid" id="pgList">
    <?php foreach ($quotes as $q):
      $sp   = zp_q_speaker($q, $byId);
      $meta = [];
      if (!empty($q['relation'])) $meta[] = $q['relation'];
      if (!empty($q['year']))     $meta[] = $q['year'];
      if (!empty($q['context']))  $meta[] = $q['context'];
      $ini  = zp_first_char($sp);
    ?>
    <article class="q-card" data-speaker="<?= zp_h($sp) ?>">
      <div class="q-mark" aria-hidden="true">“</div>
      <blockquote class="q-text"><?= nl2br(zp_h($q['text'] ?? '')) ?></blockquote>
      <div class="q-foot">
        <div class="q-ava"><?= zp_h($ini) ?></div>
        <div class="q-who">
          <b><?= zp_h($sp) ?></b>
          <?php if ($meta): ?><span><?= zp_h(implode(' · ', $meta)) ?></span><?php endif; ?>
        </div>
      </div>
    </article>
    <?php endforeach; ?>
  </div>
  <p class="pg-none" id="pgNone" hidden>没有匹配的语录</p>
  <?php else: ?>
  <div class="pg-blank">
    <div class="pg-blank-ic">“</div>
    <h3>还没有收录语录</h3>
    <p>长辈的一句嘱托、一次训诫，都可以记在这里。<?= $isAdmin ? '从后台「语录管理」开始添加。' : '请联系家族管理员添加。' ?></p>
    <?php if ($isAdmin): ?><a class="zp-btn accent" href="admin.php#quotes">去添加</a><?php endif; ?>
  </div>
  <?php endif; ?>
</main>

<script src="<?= zp_asset('assets/js/nav.js') ?>"></script>
<script src="<?= zp_asset('assets/js/pages.js') ?>"></script>
</body>
</html>
