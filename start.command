#!/bin/bash
# ============================================================================
# 宗谱 ZUPÚ · 本地一键启动（macOS）
# 双击本文件即可；首次运行会自动下载免安装的静态 PHP（约 30MB）。
# 关闭窗口或按 Ctrl+C 即停止服务。
# ============================================================================
set -e
cd "$(dirname "$0")"

PHP_BIN=".runtime/php"
PHP_VER="8.4.8"
PKG="php-${PHP_VER}-cli-macos-aarch64.tar.gz"
BASE_URL="https://dl.static-php.dev/static-php-cli/common"

# ---- 1. 准备 PHP ----
if [ ! -x "$PHP_BIN" ]; then
  echo "首次运行：正在下载免安装 PHP ${PHP_VER} ..."
  mkdir -p .runtime
  if ! curl -fL --progress-bar -o ".runtime/php.tar.gz" "$BASE_URL/$PKG"; then
    echo ""
    echo "下载失败。请检查网络，或手动安装 PHP 8+ 后运行：php -S 127.0.0.1:8080 -t . router.php"
    read -r -p "按回车键退出..." _
    exit 1
  fi
  tar xzf ".runtime/php.tar.gz" -C .runtime
  rm -f ".runtime/php.tar.gz"
  chmod +x "$PHP_BIN"
fi

# ---- 2. 选一个空闲端口（8080 起） ----
PORT=8080
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8100 ]; then
    echo "8080-8100 端口都被占用了，请先关掉占用的程序。"
    read -r -p "按回车键退出..." _
    exit 1
  fi
done

URL="http://127.0.0.1:${PORT}/"

# ---- 3. 启动并打开浏览器 ----
echo ""
echo "  宗谱 ZUPÚ 已启动"
echo "  ────────────────────────────────────────────"
echo "  族谱首页    ${URL}"
echo "  管理后台    ${URL}admin.php     （admin / admin123）"
echo "  画布编辑器  ${URL}editor.php"
echo ""
echo "  按 Ctrl+C 或关闭本窗口即可停止"
echo "  ────────────────────────────────────────────"
echo ""

( sleep 1; open "$URL" ) >/dev/null 2>&1 &

exec "$PHP_BIN" -S "127.0.0.1:${PORT}" -t . router.php
