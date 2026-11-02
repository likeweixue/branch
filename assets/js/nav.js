/* ============================================================================
 * 内容页（语录 / 历史）通用小脚本：只负责退出登录
 * 数据本身由 PHP 直出，JS 失效也不影响阅读。
 * ========================================================================== */
(function () {
  'use strict';
  var btn = document.getElementById('zpLogout');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    fetch('api.php?action=logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function () {
      location.href = 'index.php';
    }).catch(function () {
      location.href = 'index.php';
    });
  });
})();
