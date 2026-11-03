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
define('LANDS_FILE', DATA_DIR . '/lands.json');               // 土地：地块与流转历史
define('GRAVES_FILE', DATA_DIR . '/graves.json');             // 坟墓：位置、朝向、照片

define('UPLOAD_DIR', APP_ROOT . '/uploads');                  // 本地上传（地块/墓地照片）
define('UPLOAD_MAX_BYTES', 6 * 1024 * 1024);                  // 单张上限 6MB

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

/** 土地状态 */
function zp_land_status() {
    return ['在册', '已分', '已卖', '已征', '撂荒', '其他'];
}

/** 墓葬形制 */
function zp_grave_types() {
    return ['土坟', '石墓', '合葬', '骨灰', '衣冠冢', '其他'];
}

/** 清洗颜色值：只接受 #rgb / #rrggbb，非法则回退 */
function zp_clean_color($c, $fallback = '#cfd3d8') {
    $c = trim((string) $c);
    if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $c)) return strtolower($c);
    if (preg_match('/^([0-9a-f]{3}|[0-9a-f]{6})$/i', $c)) return '#' . strtolower($c);
    return $fallback;
}

/**
 * 连线类型（图例与线的语义都由这里定义，后台可增删改）
 * kind = parent   父/母线（每条父子连线都用它，除非成员指定了别的类型）
 * kind = marriage 姻亲线
 * kind = ''       自定义关系线，在成员表单里可选
 */
function zp_line_types($settings) {
    $types = $settings['line_types'] ?? null;
    if (!is_array($types) || !$types) {
        // 兼容旧数据：从 lines.parent / lines.marriage 迁移
        $lines = $settings['lines'] ?? [];
        $types = [
            ['id' => 'lt1', 'label' => '父子 / 母子', 'color' => $lines['parent'] ?? '#cfd3d8', 'kind' => 'parent'],
            ['id' => 'lt2', 'label' => '两姓结姻', 'color' => $lines['marriage'] ?? '#e5484d', 'kind' => 'marriage'],
        ];
    }
    $out = [];
    foreach ($types as $i => $t) {
        if (!is_array($t)) continue;
        $id = trim((string) ($t['id'] ?? ''));
        if ($id === '') $id = 'lt' . ($i + 1);
        $kind = (string) ($t['kind'] ?? '');
        if (!in_array($kind, ['parent', 'marriage'], true)) $kind = '';
        $out[] = [
            'id'    => preg_replace('/[^\w\-]/', '', $id),
            'label' => trim((string) ($t['label'] ?? '')) ?: '关系线',
            'color' => zp_clean_color($t['color'] ?? '', '#cfd3d8'),
            'kind'  => $kind,
        ];
    }
    if (!$out) {
        $out = [['id' => 'lt1', 'label' => '父子 / 母子', 'color' => '#cfd3d8', 'kind' => 'parent']];
    }
    // 保证一定有 parent / marriage 两种基础线
    $kinds = array_column($out, 'kind');
    $freeId = function () use (&$out) {
        $used = array_column($out, 'id');
        $n = count($out) + 1;
        while (in_array('lt' . $n, $used, true)) $n++;
        return 'lt' . $n;
    };
    if (!in_array('parent', $kinds, true)) {
        array_unshift($out, ['id' => $freeId(), 'label' => '父子 / 母子', 'color' => '#cfd3d8', 'kind' => 'parent']);
    }
    if (!in_array('marriage', $kinds, true)) {
        $out[] = ['id' => $freeId(), 'label' => '两姓结姻', 'color' => '#e5484d', 'kind' => 'marriage'];
    }
    return $out;
}

/** 取某个 kind 的线色（parent / marriage） */
function zp_line_color($settings, $kind, $fallback) {
    foreach (zp_line_types($settings) as $t) {
        if ($t['kind'] === $kind) return $t['color'];
    }
    return $fallback;
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
        // 可自定义的关系线：后台可增删改，前台图例与连线取色都读这里
        'line_types' => [
            ['id' => 'lt1', 'label' => '父子 / 母子', 'color' => '#cfd3d8', 'kind' => 'parent'],
            ['id' => 'lt2', 'label' => '两姓结姻', 'color' => '#e5484d', 'kind' => 'marriage'],
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
