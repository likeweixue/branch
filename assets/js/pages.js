/* ============================================================================
 * 内容页交互：筛选（分类 / 讲述人）、搜索、时间正倒序
 * 只做增强——内容由 PHP 服务端渲染，禁用 JS 也能完整阅读。
 * ========================================================================== */
(function () {
  'use strict';
  var list = document.getElementById('pgList');
  if (!list) return;

  var isQuote = !!list.querySelector('.q-card');
  var key = isQuote ? 'speaker' : 'cat';
  var items = Array.prototype.slice.call(list.children);
  var chips = Array.prototype.slice.call(document.querySelectorAll('#pgChips .pg-chip'));
  var search = document.getElementById('pgSearch');
  var none = document.getElementById('pgNone');
  var sortBtn = document.getElementById('pgSort');
  var activeChip = chips.filter(function (c) { return c.classList.contains('on'); })[0] || null;

  function chipVal(el) { return el ? (el.getAttribute('data-' + key) || '') : ''; }
  function apply() {
    var q = (search && search.value ? search.value : '').trim().toLowerCase();
    var cv = chipVal(activeChip);
    var visible = 0;
    items.forEach(function (it) {
      var okChip = !cv || (it.getAttribute('data-' + key) || '') === cv;
      var okText = !q || it.textContent.toLowerCase().indexOf(q) !== -1;
      var show = okChip && okText;
      it.hidden = !show;
      if (show) visible++;
    });
    if (none) none.hidden = visible !== 0;
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      activeChip = c;
      apply();
    });
  });

  if (search) search.addEventListener('input', apply);

  if (sortBtn) {
    sortBtn.addEventListener('click', function () {
      var dir = sortBtn.getAttribute('data-dir') === 'asc' ? 'desc' : 'asc';
      sortBtn.setAttribute('data-dir', dir);
      sortBtn.textContent = dir === 'asc' ? '时间：正序 ↑' : '时间：倒序 ↓';
      var frag = document.createDocumentFragment();
      items.slice().reverse().forEach(function (it) { frag.appendChild(it); });
      list.appendChild(frag);
      items.reverse();
    });
  }

  apply();
})();
