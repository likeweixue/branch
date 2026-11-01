<?php
/**
 * 文件存储：JSON 读写（原子写 + 锁），无数据库。
 */
require_once __DIR__ . '/config.php';

function zp_load_json($file, $default = []) {
    if (!file_exists($file)) {
        return $default;
    }
    $c = @file_get_contents($file);
    if ($c === false || $c === '') {
        return $default;
    }
    $d = json_decode($c, true);
    return is_array($d) ? $d : $default;
}

function zp_save_json($file, $data) {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $tmp = $file . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $ok = @file_put_contents($tmp, $json, LOCK_EX);
    if ($ok === false) {
        return false;
    }
    return @rename($tmp, $file);
}

/** 生成下一个自增 ID（前缀 + 数字） */
function zp_next_id($items, $prefix) {
    $max = 0;
    if (is_array($items)) {
        foreach ($items as $it) {
            if (isset($it['id']) && strpos($it['id'], $prefix) === 0) {
                $n = (int) substr($it['id'], strlen($prefix));
                if ($n > $max) {
                    $max = $n;
                }
            }
        }
    }
    return $prefix . ($max + 1);
}
