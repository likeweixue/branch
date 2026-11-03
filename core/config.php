<?php
/**
 * 全局配置与常量
 * 纯文件存储（JSON），零数据库依赖，PHP 8.0+ 可运行。
 */
define('APP_ROOT', dirname(__DIR__));
define('DATA_DIR', APP_ROOT . '/data');
define('MEMBERS_FILE', DATA_DIR . '/members.json');
define('USERS_FILE', DATA_DIR . '/users.json');
define('SETTINGS_FILE', DATA_DIR . '/settings.json');
define('QUOTES_FILE', DATA_DIR . '/quotes.json');
define('EVENTS_FILE', DATA_DIR . '/events.json');
define('PHOTOS_FILE', DATA_DIR . '/photos.json');
define('SUBMISSIONS_FILE', DATA_DIR . '/submissions.json');   // 续谱收集表：待审的外部提交

/**
 * 清洗外部图片地址（图床链接）
 * 只接受 http(s) 绝对地址或站内相对路径，拒绝 javascript:/data: 等可执行协议。
 */
function zp_clean_url($u) {
    $u = trim((string) $u);
    if ($u === '') return '';
    if (strlen($u) > 1200) return '';
    // 去掉换行与控制字符，避免 header/HTML 注入
    $u = preg_replace('/[\x00-\x20\x7f]+/u', '', $u);
    if ($u === '') return '';
    if (preg_match('#^https?://#i', $u)) return $u;
    if (preg_match('#^//#', $u)) return 'https:' . $u;          // 协议相对
    if (preg_match('#^/[^/]#', $u)) return $u;                  // 站内绝对路径
    if (preg_match('#^(\.\.?/)?[\w\-.%/]+\.(jpe?g|png|gif|webp|avif|svg)$#i', $u)) return $u;
    return '';
}

/** 家族历史（大事记）可选分类 */
function zp_event_categories() {
    return ['迁徙', '婚嫁', '添丁', '求学', '事业', '家谱', '其他'];
}

// 默认设置（首次运行时写入）
function zp_default_settings() {
    return [
        'zi_bei' => ['仁','德','朝','众','大','从','先','正','子','文','国','安','常','孟','学','永','远','照','光','明'],
        'layout' => 'horizontal', // horizontal 横排(左大字辈/右小字辈) | vertical 竖排(上大字辈/下小字辈)
        'lines' => [
            'parent'  => '#cfd3d8', // 父子/母子（默认浅灰线，后台可改为纯白）
            'marriage'=> '#e5484d', // 两姓结姻（红线）
            'self'    => '#ff7500', // 当前登录者本人高亮
        ],
        'startup' => [
            'enabled' => true,
            'mode'    => 'first',   // first 首次访问 | always 每次 | off 关闭
            'brand1'  => '宗谱',
            'brand2'  => 'CLAN GENEALOGY',
            'brand3'  => 'FAMILY TREE OS',
            'org'     => '家族族谱',
        ],
        'theme' => 'light',
    ];
}

if (!is_dir(DATA_DIR)) {
    @mkdir(DATA_DIR, 0755, true);
}

/**
 * 静态资源 URL（带文件修改时间，改完样式/脚本无需手动清缓存）
 */
function zp_asset($rel) {
    $abs = APP_ROOT . '/' . ltrim($rel, '/');
    $v = @filemtime($abs);
    return htmlspecialchars($rel . '?v=' . ($v ?: '1'));
}
