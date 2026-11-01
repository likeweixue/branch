<?php
/**
 * PHP 内置服务器路由脚本（仅供本地预览使用）。
 * 作用：禁止通过 Web 直接读取 data/ 下的 JSON 数据，
 *      与生产环境 nginx 的 `location ^~ /data/ { deny all; }` 保持一致。
 *
 * 用法：php -S 127.0.0.1:8080 -t . router.php
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if (is_string($path) && preg_match('#^/data(/|$)#i', $path)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "403 Forbidden\n";
    return true;
}

// 其余请求交给内置服务器按静态文件 / PHP 脚本处理
return false;
