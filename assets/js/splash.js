/* ============================================================================
 * ZUPÚ 启动序列控制器（原生 JS，零依赖）
 * 读取 window.ZP_STARTUP 配置：{ enabled, mode, name, brand1, brand2, brand3, org }
 * mode: first(首次) | always(每次) | off(关闭)
 * 结束派发 window 事件 'zp:splash-done'，供主程序接管。
 * ========================================================================== */
(function () {
  'use strict';
  var root = document.getElementById('zp-splash');
  if (!root) { window.dispatchEvent(new Event('zp:splash-done')); return; }
  // 移除首屏黑色兜底遮罩（zp-boot::after），让动画内容可见
  root.classList.remove('zp-boot');

  var cfg = window.ZP_STARTUP || {};
  var enabled = cfg.enabled !== false;
  var mode = cfg.mode || 'first';
  var seen = false;
  try { seen = localStorage.getItem('zp_splash_seen') === '1'; } catch (e) {}

  function done() {
    try { if (mode === 'first') localStorage.setItem('zp_splash_seen', '1'); } catch (e) {}
    if (root && root.parentNode) root.parentNode.removeChild(root);
    window.dispatchEvent(new Event('zp:splash-done'));
  }

  if (!enabled || mode === 'off' || (mode === 'first' && seen)) { done(); return; }

  var name = cfg.name || '访客';
  var $ = function (id) { return document.getElementById(id); };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function typeInto(el, text) {
    return new Promise(function (resolve) {
      el.innerHTML = '';
      el.classList.add('zp-in');
      var i = 0;
      var timer = setInterval(function () {
        if (i >= text.length) { clearInterval(timer); setTimeout(resolve, 140); return; }
        var s = document.createElement('span');
        s.className = 'zp-ch';
        s.textContent = text[i++];
        el.appendChild(s);
      }, 38);
    });
  }

  function setSlats(n) {
    var slats = root.querySelectorAll('.zps-slat');
    slats.forEach(function (el, idx) {
      el.classList.remove('zp-on', 'zp-past');
      if (idx < n) el.classList.add('zp-past');
      else if (idx === n) el.classList.add('zp-on');
    });
  }

  var steps = [
    { zh: '需要访问许可', en: 'ACCESS PERMISSION REQUIRED' },
    { zh: '身份资料确认', en: 'IDENTITY VERIFICATION' },
    { zh: '接收访问需求', en: 'ACCESS REQUEST RECEIVED' },
    { zh: '开始读取权限', en: 'PERMISSION READ STARTED' },
    { zh: '读取完毕 · 核验通过', en: 'READ COMPLETE · VERIFIED' },
    { zh: '欢迎 ' + name + ' 访问', en: 'WELCOME, ' + name.toUpperCase() }
  ];

  // 跳过
  var skipBtn = $('zpsSkip');
  if (skipBtn) { skipBtn.addEventListener('click', finishNow); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') finishNow(); });
  var finished = false;
  function finishNow() { if (!finished) { finished = true; cleanupAndLeave(); } }

  function cleanupAndLeave() {
    try { if (mode === 'first') localStorage.setItem('zp_splash_seen', '1'); } catch (e) {}
    root.classList.add('zp-handoff');
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      window.dispatchEvent(new Event('zp:splash-done'));
    }, 760);
  }

  async function run() {
    // 1) 黑幕
    await sleep(160);
    var bi = root.querySelector('.zps-black-inner');
    if (bi) bi.classList.add('zp-in');
    await sleep(820);
    var be = root.querySelector('.zps-black-en');
    if (be) be.classList.add('zp-tighten');
    await sleep(360);

    // 2) 洗白 → 底板
    var wash = root.querySelector('.zps-wash');
    var flash = root.querySelector('.zps-flash');
    if (wash) { wash.style.transition = 'opacity 420ms ease'; wash.style.opacity = '1'; }
    await sleep(220);
    if (flash) { flash.style.transition = 'opacity 260ms ease'; flash.style.opacity = '1'; }
    await sleep(260);
    if (flash) flash.style.opacity = '0';
    await sleep(120);
    root.querySelector('.zps-black').classList.add('zp-out');
    if (wash) wash.style.opacity = '0';
    var plate = root.querySelector('.zps-plate');
    if (plate) plate.style.opacity = '1';
    await sleep(120);

    // 3) 底板元素就位
    root.querySelector('.zps-brand').classList.add('zp-in');
    root.querySelector('.zps-reticle').classList.add('zp-in');
    root.querySelector('.zps-frame').classList.add('zp-in');
    root.querySelector('.zps-slats').classList.add('zp-in');
    root.querySelector('.zps-foot').classList.add('zp-in');
    root.querySelector('.zps-vignette').classList.add('zp-in');
    var skip = $('zpsSkip'); if (skip) skip.classList.add('zp-in');
    await sleep(700);

    // 4) 状态行序列
    var status = $('zpsStatus');
    var sub = $('zpsSub');
    var rule = root.querySelector('.zps-rule');
    for (var i = 0; i < steps.length; i++) {
      if (finished) return;
      setSlats(i);
      status.classList.remove('zp-zh');
      await typeInto(status, steps[i].zh);
      status.classList.add('zp-zh');
      await typeInto(sub, steps[i].en);
      if (rule) rule.classList.add('zp-in');
      await sleep(620);
      if (i < steps.length - 1) {
        status.classList.remove('zp-in');
        sub.classList.remove('zp-in');
        await sleep(260);
      }
    }

    // 5) 终幕 WELCOME
    if (finished) return;
    setSlats(steps.length);
    root.querySelector('.zps-center').classList.add('zp-off');
    var wel = root.querySelector('.zps-welcome');
    var w2 = $('zpsW2'); if (w2) w2.textContent = name;
    if (w2) w2.setAttribute('data-text', name);
    if (wel) wel.classList.add('zp-in');
    await sleep(420);
    if (wel) { wel.classList.add('zp-glitch'); wel.classList.add('zp-on'); }
    var bloom = root.querySelector('.zps-bloom');
    var streak = root.querySelector('.zps-streak');
    if (bloom) bloom.classList.add('zp-go');
    if (streak) streak.classList.add('zp-go');
    await sleep(1700);
    if (!finished) cleanupAndLeave();
  }

  run().catch(function () { finishNow(); });
})();
