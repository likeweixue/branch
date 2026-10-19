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
