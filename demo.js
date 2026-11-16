/*
 * 演示模式的引导脚本。
 *
 * 扩展环境下 chrome.bookmarks 可用，页面直接用真实书签，这里什么都不做。
 * 直接用 file:// 双击打开 newtab.html 时没有浏览器 API，才同步加载 mock.js
 * （本机书签快照），让页面能渲染出来。
 *
 * 之所以单独放一个文件：MV3 扩展页面的 CSP 是 script-src 'self'，
 * 写在 HTML 里的内联 <script> 会被拒绝执行并在控制台报错。
 */
(function () {
  'use strict';
  var live = typeof chrome !== 'undefined' && chrome.bookmarks && chrome.runtime && chrome.runtime.id;
  if (live) return;
  window.__DEMO__ = true;
  document.write('<script src="mock.js"><\/script>');
})();
