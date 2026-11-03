<?php
/**
 * 前台：家族土地
 * 记录家里有哪些地块、面积、位置，以及这块地的「流转史」——什么时候、因为什么、分给了谁。
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
$lands    = zp_load_json(LANDS_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }

$totalMu = 0.0; $withCoord = 0; $activeCount = 0;
foreach ($lands as $l) {
    if (($l['unit'] ?? '亩') === '亩' && is_numeric($l['area'] ?? '')) $totalMu += (float) $l['area'];
    if (!empty($l['lat']) && !empty($l['lng'])) $withCoord++;
    if (($l['status'] ?? '在册') === '在册') $activeCount++;
}

$js = [];
foreach ($lands as $l) {
    $owners = [];
    foreach ((array) ($l['owner_ids'] ?? []) as $mid) {
        if (isset($byId[$mid])) $owners[] = $byId[$mid]['name'];
    }
    $hist = [];
    foreach ((array) ($l['history'] ?? []) as $h) {
        $to = [];
        foreach ((array) ($h['to_ids'] ?? []) as $mid) {
            if (isset($byId[$mid])) $to[] = $byId[$mid]['name'];
        }
        $hist[] = [
            'date'  => (string) ($h['date'] ?? ''),
            'event' => (string) ($h['event'] ?? ''),
            'note'  => (string) ($h['note'] ?? ''),
            'to'    => $to,
        ];
    }
    $js[] = [
        'id'       => $l['id'],
        'name'     => $l['name'] ?? '',
        'area'     => $l['area'] ?? '',
        'unit'     => $l['unit'] ?? '亩',
        'location' => $l['location'] ?? '',
        'lat'      => $l['lat'] ?? null,
        'lng'      => $l['lng'] ?? null,
        'status'   => $l['status'] ?? '在册',
        'owners'   => $owners,
        'photos'   => $l['photos'] ?? [],
        'history'  => $hist,
    ];
}
$zp_land = ['lands' => $js, 'isAdmin' => $isAdmin];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 家族土地</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/pages.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/zmap.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/places.css') ?>">
</head>
<body>

<?php zp_render_header($cur, $settings, 'land', ['login' => 'link']); ?>

<main class="pg-wrap pl-wrap">
  <header class="pg-hero">
    <div class="pg-hero-en">FAMILY LAND</div>
    <h1>家族土地</h1>
    <p>哪几块地、从哪来、又分给了谁。每一块地都留着一份自己的账——面积、四至、缘由，都在下面。</p>
    <div class="pg-hero-meta">
      <span><b><?= count($lands) ?></b> 块地</span>
      <?php if ($totalMu > 0): ?><span><b><?= rtrim(rtrim(number_format($totalMu, 2, '.', ''), '0'), '.') ?></b> 亩合计</span><?php endif; ?>
      <span><b><?= $activeCount ?></b> 块在册</span>
      <?php if ($withCoord): ?><span><b><?= $withCoord ?></b> 块已标点</span><?php endif; ?>
    </div>
    <?php if ($isAdmin): ?><a class="zp-btn accent pg-hero-act" href="admin.php#land">＋ 录入地块</a><?php endif; ?>
  </header>

  <?php if (!$lands): ?>
    <div class="pg-blank">
      <div class="pg-blank-ic">田</div>
      <h3>还没有记录任何土地</h3>
      <p>把家里的地块录进后台，写上面积、位置，再补一条「哪年分给谁、为什么分」的来历，<br>以后翻起来就知道每块地的去向。</p>
      <?php if ($isAdmin): ?><a class="zp-btn accent" href="admin.php#land">去录入第一块地</a><?php endif; ?>
    </div>
  <?php else: ?>
  <div class="pl-grid">
    <section class="pl-list" id="plList">
      <?php foreach ($js as $i => $l): ?>
        <article class="pl-card" id="land-<?= zp_h($l['id']) ?>" data-land="<?= zp_h($l['id']) ?>">
          <header class="pl-head">
            <h3><?= zp_h($l['name']) ?></h3>
            <span class="pl-status" data-status="<?= zp_h($l['status']) ?>"><?= zp_h($l['status']) ?></span>
          </header>

          <div class="pl-meta">
            <?php if ($l['area'] !== ''): ?>
              <span><b><?= zp_h($l['area']) ?></b> <?= zp_h($l['unit']) ?></span>
            <?php endif; ?>
            <?php if ($l['location'] !== ''): ?>
              <span>位置 <b><?= zp_h($l['location']) ?></b></span>
            <?php endif; ?>
            <?php if ($l['owners']): ?>
              <span>现归 <b><?= zp_h(implode('、', $l['owners'])) ?></b></span>
            <?php endif; ?>
            <?php if ($l['lat'] !== null && $l['lng'] !== null): ?>
              <span class="pl-geo"><?= zp_h(number_format((float) $l['lat'], 5, '.', '')) ?>, <?= zp_h(number_format((float) $l['lng'], 5, '.', '')) ?></span>
              <button class="pl-locate" data-locate="<?= zp_h($l['id']) ?>" type="button">定位 ↗</button>
            <?php endif; ?>
          </div>

          <?php if (!empty($l['photos'])): ?>
            <div class="pl-photos">
              <?php foreach (array_slice($l['photos'], 0, 6) as $p): ?>
                <a href="<?= zp_h($p) ?>" target="_blank" rel="noopener" class="pl-photo">
                  <img src="<?= zp_h($p) ?>" alt="" loading="lazy" referrerpolicy="no-referrer">
                </a>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>

          <?php if ($l['history']): ?>
            <div class="pl-hist">
              <div class="pl-hist-t">流转</div>
              <ol>
                <?php foreach ($l['history'] as $h): ?>
                  <li>
                    <span class="pl-h-date"><?= $h['date'] !== '' ? zp_h($h['date']) : '待考' ?></span>
                    <div class="pl-h-body">
                      <b><?= zp_h($h['event'] !== '' ? $h['event'] : '变更') ?></b>
                      <?php if ($h['to']): ?><span class="pl-h-to">→ <?= zp_h(implode('、', $h['to'])) ?></span><?php endif; ?>
                      <?php if ($h['note'] !== ''): ?><p><?= zp_h($h['note']) ?></p><?php endif; ?>
                    </div>
                  </li>
                <?php endforeach; ?>
              </ol>
            </div>
          <?php endif; ?>
        </article>
      <?php endforeach; ?>
    </section>

    <aside class="pl-side">
      <div class="pl-map" id="plMap"></div>
      <div class="pl-map-foot">
        <span id="plMapStat"><?= $withCoord ? $withCoord . ' 块地已标点' : '暂无地块标了坐标' ?></span>
        <div class="pl-tiles" id="plTiles">
          <button data-tile="osm" class="on">标准</button>
          <button data-tile="gaode">高德</button>
          <button data-tile="none">无底图</button>
        </div>
      </div>
      <?php if (!$withCoord && $isAdmin): ?>
        <p class="pl-tip">在后台填上经纬度（手机地图长按即可复制），地块就会出现在地图上。</p>
      <?php endif; ?>
    </aside>
  </div>
  <?php endif; ?>
</main>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_LAND = <?= json_encode($zp_land, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= zp_asset('assets/js/nav.js') ?>"></script>
<script src="<?= zp_asset('assets/js/zmap.js') ?>"></script>
<script src="<?= zp_asset('assets/js/land.js') ?>"></script>
</body>
</html>
