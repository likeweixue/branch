<?php
/**
 * 前台：坟茔
 * 两种看法：
 *   星空 —— 每座坟是一颗星，越多说明走得人越多；越亮，说明与你越近。
 *   地图 —— 标出确切位置，免得「哭错坟」。
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
$graves   = zp_load_json(GRAVES_FILE, []);
$isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';
$me       = $cur['member_id'] ?? null;

$byId = [];
foreach ($members as $m) { $byId[$m['id']] = $m; }

/* 亲属邻接表：父/母/配偶/子女 都算一条边 */
$adj = [];
foreach ($members as $m) {
    $id = $m['id'];
    if (!isset($adj[$id])) $adj[$id] = [];
    foreach (['father_id', 'mother_id'] as $k) {
        $p = $m[$k] ?? null;
        if ($p && isset($byId[$p])) {
            $adj[$id][] = $p;
            $adj[$p][] = $id;
        }
    }
    foreach ((array) ($m['spouse_ids'] ?? []) as $s) {
        if ($s && isset($byId[$s])) {
            $adj[$id][] = $s;
            $adj[$s][] = $id;
        }
    }
}

/** 亲属距离（BFS 跳数）：null 表示没有亲属路径 */
function zp_rel_dist($adj, $from, $to) {
    if (!$from || !$to || !isset($adj[$from])) return null;
    if ($from === $to) return 0;
    $dist = [$from => 0];
    $q = [$from];
    $guard = 0;
    while ($q && $guard++ < 4000) {
        $cur = array_shift($q);
        $d = $dist[$cur];
        foreach ($adj[$cur] ?? [] as $n) {
            if (isset($dist[$n])) continue;
            $dist[$n] = $d + 1;
            if ($n === $to) return $dist[$n];
            $q[] = $n;
        }
    }
    return null;
}

/** 是否直系（祖→自己，或自己→后代），只看父/母连线，配偶不算 */
function zp_is_lineal($byId, $from, $to) {
    if (!$from || !$to) return false;
    $q = [$from];
    $seen = [];
    $guard = 0;
    while ($q && $guard++ < 3000) {
        $c = array_shift($q);
        if ($c === $to) return true;
        if (isset($seen[$c])) continue;
        $seen[$c] = true;
        $m = $byId[$c] ?? null;
        if (!$m) continue;
        foreach (['father_id', 'mother_id'] as $k) {
            if (!empty($m[$k]) && isset($byId[$m[$k]])) $q[] = $m[$k];
        }
    }
    return false;
}

/** 距离 → 亮度：1 跳（父母/子女/配偶）最亮，隔一层暗一档；直系血脉再加一点 */
function zp_rel_score($d, $lineal = false) {
    if ($d === null) return $lineal ? 0.5 : 0.22;
    if ($d <= 0) return 1.0;
    $s = max(0.34, 1 / (1 + 0.5 * ($d - 1)));
    if ($lineal) $s = min(1.0, $s + 0.14);
    return $s;
}

$js = [];
$withGeo = 0;
$earliest = '';
foreach ($graves as $g) {
    $who = [];
    $best = null;          // 该坟里与你最近的一位
    $lineal = false;       // 其中是否有直系血脉
    foreach ((array) ($g['member_ids'] ?? []) as $mid) {
        if (!isset($byId[$mid])) continue;
        $who[] = ['id' => $mid, 'name' => $byId[$mid]['name'], 'zi_bei' => $byId[$mid]['zi_bei'] ?? ''];
        if ($me) {
            $d = zp_rel_dist($adj, $me, $mid);
            if ($d !== null && ($best === null || $d < $best)) $best = $d;
            if (zp_is_lineal($byId, $me, $mid) || zp_is_lineal($byId, $mid, $me)) $lineal = true;
        }
    }
    if (!empty($g['lat']) && !empty($g['lng'])) $withGeo++;
    if (trim((string) ($g['date'] ?? '')) !== '') {
        if (preg_match('/(\d{4})/', (string) $g['date'], $mm)) {
            if ($earliest === '' || $mm[1] < $earliest) $earliest = $mm[1];
        }
    }
    $js[] = [
        'id'       => $g['id'],
        'name'     => $g['name'] ?? '',
        'who'      => $who,
        'place'    => $g['place'] ?? '',
        'address'  => $g['address'] ?? '',
        'lat'      => $g['lat'] ?? null,
        'lng'      => $g['lng'] ?? null,
        'facing'   => $g['facing'] ?? '',
        'type'     => $g['type'] ?? '',
        'date'     => $g['date'] ?? '',
        'visited'  => $g['visited'] ?? '',
        'note'     => $g['note'] ?? '',
        'photos'   => $g['photos'] ?? [],
        'dist'     => $best,
        'lineal'   => $lineal,
        // 没登录就统一给个中等亮度：让人先看见星星，登录后才按亲疏分亮暗
        'score'    => $me ? zp_rel_score($best, $lineal) : 0.66,
    ];
}

// 星空里最亮的排前面，方便图例与列表
usort($js, function ($a, $b) { return $b['score'] <=> $a['score']; });

$zp_grave = [
    'graves'   => $js,
    'me'       => $me,
    'hasUser'  => !empty($cur),
    'isAdmin'  => $isAdmin,
    'stat'     => ['total' => count($graves), 'geo' => $withGeo, 'earliest' => $earliest],
];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宗谱 · 坟茔</title>
<link rel="stylesheet" href="<?= zp_asset('assets/css/app.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/pages.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/zmap.css') ?>">
<link rel="stylesheet" href="<?= zp_asset('assets/css/places.css') ?>">
</head>
<body class="gv-body">

<?php zp_render_header($cur, $settings, 'grave', ['login' => 'link']); ?>

<main class="gv-wrap">
  <header class="gv-hero">
    <div class="pg-hero-en">RESTING PLACES</div>
    <h1>坟茔</h1>
    <p>小时候听老人说，人走了会变成天上的星。这里的每一颗，都是家里走过的一位。</p>
    <div class="pg-hero-meta">
      <span><b><?= count($graves) ?></b> 座坟</span>
      <span><b><?= $withGeo ?></b> 座已标点</span>
      <?php if ($earliest): ?><span>最早 <b><?= zp_h($earliest) ?></b> 年</span><?php endif; ?>
    </div>
    <?php if ($isAdmin): ?><a class="zp-btn accent pg-hero-act" href="admin.php#grave">＋ 录入坟茔</a><?php endif; ?>
  </header>

  <?php if (!$graves): ?>
    <div class="pg-blank gv-blank">
      <div class="pg-blank-ic">星</div>
      <h3>天上还没有星</h3>
      <p>在后台录入家里的坟茔，写上地名、朝向、经纬度，<br>这里就会亮起第一颗。</p>
      <?php if ($isAdmin): ?><a class="zp-btn accent" href="admin.php#grave">去录入第一座坟</a><?php endif; ?>
    </div>
  <?php else: ?>

  <?php $initView = (($_GET['view'] ?? '') === 'map') ? 'map' : 'sky'; ?>
  <div class="gv-bar">
    <div class="gv-tabs" id="gvTabs">
      <button data-view="sky" class="<?= $initView === 'sky' ? 'on' : '' ?>">星空</button>
      <button data-view="map" class="<?= $initView === 'map' ? 'on' : '' ?>">地图</button>
    </div>
    <div class="gv-legend">
      <span class="gv-lg-title">亮度 = 与你的距离</span>
      <i class="gv-dot" style="--s:1"></i><span>父母 / 子女</span>
      <i class="gv-dot" style="--s:.62"></i><span>祖辈 · 兄弟</span>
      <i class="gv-dot" style="--s:.4"></i><span>旁系</span>
      <i class="gv-dot" style="--s:.22"></i><span>无血缘</span>
    </div>
  </div>

  <!-- 星空 -->
  <section class="gv-sky" id="gvSky"<?= $initView === 'map' ? ' hidden' : '' ?>>
    <canvas id="gvCanvas"></canvas>
    <button class="gv-exit" id="gvExit" type="button" hidden>✕ 退出星空 <kbd>ESC</kbd></button>
    <div class="gv-sky-hud">
      <div class="gv-sky-en">MEMORIA · <?= count($graves) ?> STARS</div>
      <div class="gv-sky-tip" id="gvSkyTip">把鼠标移到星上，看看是哪一位</div>
      <div class="gv-sky-lg">
        <span>亮度 = 与你的距离</span>
        <i class="gv-dot" style="--s:1"></i>父母 / 子女
        <i class="gv-dot" style="--s:.62"></i>祖辈 · 兄弟
        <i class="gv-dot" style="--s:.4"></i>旁系
        <i class="gv-dot" style="--s:.22"></i>无血缘
      </div>
    </div>
    <div class="gv-tip" id="gvTip"></div>
    <div class="gv-detail" id="gvDetail" hidden></div>
  </section>

  <!-- 地图 -->
  <section class="gv-mapview" id="gvMapView"<?= $initView === 'map' ? '' : ' hidden' ?>>
    <div class="gv-map" id="gvMap"></div>
    <div class="gv-map-foot">
      <span><?= $withGeo ? $withGeo . ' 座坟标了坐标' : '还没有坟标了坐标' ?></span>
      <div class="pl-tiles" id="gvTiles">
        <button data-tile="plain" class="on" title="夜色极简底图">素白</button>
        <button data-tile="gaode" title="高德原色瓦片，信息最全，但色块偏多">高德</button>
        <button data-tile="atlas" title="离线底图，不联网也能用">离线</button>
      </div>
    </div>
  </section>

  <!-- 名册 -->
  <section class="gv-list" id="gvList">
    <h2 class="gv-list-t">名册 <span>按与你的亲疏排序</span></h2>
    <div class="gv-cards">
      <?php foreach ($js as $g): ?>
        <article class="gv-card" id="grave-<?= zp_h($g['id']) ?>" data-grave="<?= zp_h($g['id']) ?>">
          <div class="gv-card-glow" style="opacity:<?= number_format($g['score'], 2, '.', '') ?>"></div>
          <header>
            <h3><?= zp_h($g['name']) ?></h3>
            <?php if ($g['type']): ?><span class="gv-type"><?= zp_h($g['type']) ?></span><?php endif; ?>
          </header>
          <?php if ($g['who']): ?>
            <div class="gv-who"><?php foreach ($g['who'] as $w): ?><span><?= zp_h($w['name']) ?><?= $w['zi_bei'] ? '（' . zp_h($w['zi_bei']) . '）' : '' ?></span><?php endforeach; ?></div>
          <?php endif; ?>
          <div class="gv-meta">
            <?php if ($g['place']): ?><span>地名 <b><?= zp_h($g['place']) ?></b></span><?php endif; ?>
            <?php if ($g['facing']): ?><span>朝向 <b><?= zp_h($g['facing']) ?></b></span><?php endif; ?>
            <?php if ($g['date']): ?><span>立碑 <b><?= zp_h($g['date']) ?></b></span><?php endif; ?>
            <?php if ($g['visited']): ?><span>祭扫 <b><?= zp_h($g['visited']) ?></b></span><?php endif; ?>
          </div>
          <?php if ($g['address']): ?><p class="gv-addr"><?= zp_h($g['address']) ?></p><?php endif; ?>
          <?php if ($g['lat'] !== null && $g['lng'] !== null): ?>
            <button class="gv-locate" type="button" data-locate="<?= zp_h($g['id']) ?>">
              地图定位 · <?= zp_h(number_format((float) $g['lat'], 4, '.', '')) ?>, <?= zp_h(number_format((float) $g['lng'], 4, '.', '')) ?>
            </button>
          <?php endif; ?>
          <?php if (!empty($g['photos'])): ?>
            <div class="gv-photos">
              <?php foreach (array_slice($g['photos'], 0, 4) as $p): ?>
                <a href="<?= zp_h($p) ?>" target="_blank" rel="noopener"><img src="<?= zp_h($p) ?>" alt="" loading="lazy" referrerpolicy="no-referrer"></a>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
          <?php if ($g['note']): ?><p class="gv-note"><?= zp_h($g['note']) ?></p><?php endif; ?>
        </article>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
</main>

<div class="zp-toast" id="zpToast"></div>

<script>window.ZP_GRAVE = <?= json_encode($zp_grave, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= zp_asset('assets/js/nav.js') ?>"></script>
<script src="<?= zp_asset('assets/data/world-land.js') ?>"></script>
<script src="<?= zp_asset('assets/js/zmap.js') ?>"></script>
<script src="<?= zp_asset('assets/js/grave.js') ?>"></script>
</body>
</html>
