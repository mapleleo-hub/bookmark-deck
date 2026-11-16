/*
 * 后台服务：处理工具栏图标的点击、首次安装时打开一次引导。
 * MV3 要求 service worker 不能依赖页面上下文，所以这里只做最轻的三件事。
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html?intro=1') });
  }
});
