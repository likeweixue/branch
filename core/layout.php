<?php
/**
 * 共享页面骨架：顶栏（品牌 / 导航 / 账号）
 * 所有页面用同一套菜单，避免多处复制导致不一致。
 */
require_once __DIR__ . '/config.php';

function zp_h($s) {
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/** 取字符串首字（兼容未装 mbstring 的环境） */
function zp_first_char($s) {
    $s = (string) $s;
    if ($s === '') return '?';
    if (function_exists('mb_substr')) {
        $c = mb_substr($s, 0, 1, 'UTF-8');
        if ($c !== '') return $c;
    }
    if (preg_match('/^./us', $s, $m)) return $m[0];
    return substr($s, 0, 1);
}

/** 顶部导航项 key => 显示名 */
function zp_nav_items() {
    return [
        'tree'    => '族谱',
        'quotes'  => '语录',
        'album'   => '相册',
        'history' => '历史',
        'submit'  => '续谱',
    ];
}

/**
 * 渲染顶栏
 *
 * @param array|null $cur     当前登录用户（zp_current_user()）
 * @param array      $settings 站点设置
 * @param string     $active   当前导航 key：tree / quotes / history
 * @param array      $opt      sub        副标题（默认 CLAN GENEALOGY）
 *                             login      'button' 弹登录浮层 | 'link' 跳首页
 *                             extra_html 右侧附加按钮（后台用）
 *                             hide_admin_link 隐藏「后台」按钮（后台自身用）
 *                             show_tag   是否显示字辈标签
 */
function zp_render_header($cur, $settings, $active = 'tree', $opt = []) {
    $sub      = $opt['sub'] ?? 'CLAN GENEALOGY';
    $login    = $opt['login'] ?? 'link';
    $extra    = $opt['extra_html'] ?? '';
    $showTag  = array_key_exists('show_tag', $opt) ? $opt['show_tag'] : true;
    $hideAdminLink = !empty($opt['hide_admin_link']);
    $isAdmin  = $cur && ($cur['role'] ?? '') === 'admin';
    $zb       = $settings['zi_bei'] ?? [];
    ?>
<header class="zp-top">
  <a class="zp-brand" href="index.php" style="text-decoration:none;color:inherit"><b>宗谱</b><span><?= zp_h($sub) ?></span></a>
  <nav class="zp-nav">
    <?php foreach (zp_nav_items() as $k => $label): ?>
      <a href="<?= $k === 'tree' ? 'index.php' : zp_h($k . '.php') ?>"<?= $k === $active ? ' class="on"' : '' ?>><?= zp_h($label) ?></a>
    <?php endforeach; ?>
  </nav>
  <div class="spacer"></div>
  <?= $extra ?>
  <?php if ($cur): ?>
    <div class="zp-user"><span class="dot"></span><?= zp_h($cur['username']) ?><?= $isAdmin ? '（管理员）' : '' ?></div>
    <button class="zp-btn ghost" id="zpLogout">退出</button>
    <?php if ($isAdmin && !$hideAdminLink): ?>
      <a class="zp-btn accent" href="admin.php">后台</a>
    <?php endif; ?>
  <?php else: ?>
    <?php if ($login === 'button'): ?>
      <button class="zp-btn accent" data-login-open>登录 / 注册</button>
    <?php else: ?>
      <a class="zp-btn accent" href="index.php">登录 / 注册</a>
    <?php endif; ?>
  <?php endif; ?>
  <?php if ($showTag && $zb): ?>
    <span class="zp-tag">字辈 <?= count($zb) ?> 字 · <?= zp_h($zb[0]) ?>→<?= zp_h(end($zb)) ?></span>
  <?php endif; ?>
</header>
    <?php
}
