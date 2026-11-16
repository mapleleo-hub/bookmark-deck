/*
 * 界面文案。
 *
 * 只有中英两套，按浏览器界面语言选（chrome.i18n.getUILanguage，退化到 navigator.language）。
 * 查不到 key 时回退中文，再回退 key 本身并打一条 warn，避免整块界面变空白。
 *
 * HTML 用 data-i18n / data-i18n-title / data-i18n-placeholder / data-i18n-html 声明，
 * JS 直接调 window.I18N.t('key') 或模块内的 t()。
 */
(function () {
  'use strict';

  var ZH = {
    'app.title': '新标签页',
    'app.brand': '书签',

    'rail.collapse': '收起侧栏',
    'rail.expand': '展开侧栏',
    'rail.addPage': '新建分页',
    'page.rename': '重命名',
    'page.up': '上移',
    'page.down': '下移',
    'page.delete': '删除分页',
    'page.renamePrompt': '分页名称',
    'page.newPrompt': '新分页名称',
    'page.newDefault': '新分页',
    'page.deleteConfirm': '删除「{title}」以及里面的 {n} 项？会同步删除浏览器书签。',
    'page.created': '新建分页「{title}」',

    'empty.root': '这个书签根目录是空的，点侧栏的新建分页开始。',
    'empty.page': '这一页还没有书签，点右下角加号新增。',
    'empty.folder': '空文件夹。',
    'group.untitled': '未分组',
    'item.untitled': '未命名',

    'menu.openNewTab': '在新标签页打开',
    'menu.openHere': '在当前页打开',
    'menu.copyUrl': '复制网址',
    'menu.copyOk': '已复制网址',
    'menu.copyFail': '复制失败，请手动复制',
    'menu.edit': '编辑',
    'menu.moveToPage': '移动到分页',
    'menu.deleteBookmark': '删除书签',
    'menu.open': '打开',
    'menu.openAll': '在新标签页打开全部',
    'menu.deleteFolder': '删除文件夹',
    'menu.renamePage': '重命名',
    'menu.movePageUp': '上移',
    'menu.movePageDown': '下移',
    'menu.deletePage': '删除分页',
    'menu.search': '搜索书签和标签',
    'menu.undo': '撤销上一步',
    'menu.addBookmark': '添加书签',
    'menu.newFolder': '新建文件夹',
    'menu.newPage': '新建分页',
    'menu.changeWallpaper': '更换壁纸',
    'menu.tidy': '整理布局',
    'menu.current': '当前',
    'menu.use': '使用',
    'menu.delete': '删除',
    'menu.addEngine': '添加自定义搜索引擎…',

    'confirm.delete': '确定删除「{title}」？此操作会同步删除浏览器书签。',
    'confirm.openAll': '一次打开 {n} 个标签页？',
    'toast.noLinks': '这里面没有链接',
    'toast.demoNoSave': '演示模式不能保存',
    'toast.demoNoTab': '演示模式不能切换标签页',
    'toast.moved': '已按顺序重排',
    'toast.switchFail': '切换失败：{msg}',
    'toast.moveFail': '移动失败：{msg}',
    'toast.orderFail': '顺序同步失败：{msg}',
    'toast.undoNone': '没有可撤销的操作',
    'toast.undoOk': '已撤销：{label}',
    'toast.undoFail': '撤销失败：{msg}',
    'toast.undoPartial': '已撤销，但有 {n} 项已不存在',
    'toast.moveInto': '已收进「{title}」',
    'toast.groupFail': '建组失败：{msg}',
    'toast.saveFail': '保存失败：{msg}',
    'toast.saveFailUnknown': '浏览器存储拒绝写入',
    'toast.storageFull': '保存失败：本地存储已满',
    'toast.wallOk': '壁纸已更新',
    'toast.wallTooBig': '壁纸存不进去，换一张小一点的',
    'toast.wallFail': '壁纸处理失败：{msg}',
    'toast.wallBadType': '请选择图片文件',
    'toast.wallTooLarge': '图片太大，请选 12MB 以内的',
    'toast.imageUnreadable': '无法读取这张图片',
    'toast.engineAdded': '已添加并切换',
    'toast.noOtherPage': '没有其他分页可移动',
    'toast.bulkDeleted': '已删除 {n} 项',

    'undo.move': '移动',
    'undo.layout': '布局调整',
    'undo.delete': '删除「{title}」',
    'undo.group': '建组「{title}」',
    'undo.bulkDelete': '批量删除 {n} 项',
    'undo.bulkMove': '移动 {n} 项',
    'undo.moveOut': '移出文件夹 {n} 项',
    'undo.newBookmark': '新增「{title}」',
    'undo.editBookmark': '修改「{title}」',
    'undo.newFolder': '新建文件夹「{title}」',
    'undo.newPage': '新建分页「{title}」',

    'folder.rename': '重命名文件夹',
    'folder.namePrompt': '新建文件夹名称',
    'folder.nameDefault': '新文件夹',
    'folder.groupPrompt': '把这两项放进新文件夹，取个名字',
    'folder.cannotNest': '不能把文件夹移动到它自己或它的子文件夹里',
    'crumbs.dropOut': '拖到这里移出到「{title}」',

    'form.addBookmark': '添加书签',
    'form.editBookmark': '编辑书签',
    'form.name': '名称',
    'form.url': '网址',
    'form.cancel': '取消',
    'form.save': '保存',
    'form.errName': '名称不能为空',
    'form.errUrl': '网址不能为空',
    'form.errUrlFormat': '网址格式不对',
    'form.errUrlHttp': '地址需要以 http 开头',
    'form.errEngineTpl': '地址里要用 %s 表示关键词位置',
    'form.addEngine': '添加搜索引擎',
    'form.namePlaceholder': '例如 站内搜索',
    'form.engineUrlPlaceholder': 'https://example.com/search?q=%s',
    'form.urlPlaceholder': 'https://example.com',

    'search.local': '书签与标签',
    'search.placeholderLocal': '搜索书签与标签，Ctrl+K',
    'search.placeholderEngine': '在 {name} 搜索，Ctrl+K',
    'search.foot': '↑↓ 选择 · Enter 打开 · Esc 关闭',
    'search.placeholder': '搜索，Ctrl+K',
    'search.recent': '最近搜索',
    'search.tabs': '标签',
    'search.books': '书签',
    'search.clear': '清空',
    'search.empty': '没有匹配的标签或书签',
    'search.count': '{n} 项',
    'search.usedWith': '用 {name} 搜索',
    'search.currentTab': '当前标签',
    'search.permissionNote': '读到 {n} 个标签，但拿不到标题和网址：tabs 权限未生效。到扩展页点一次「重新加载」，若提示新权限要确认启用。点这里重试。',
    'search.close': '关闭',
    'search.engineTitle': '选择搜索源',

    'engine.google': 'Google',
    'engine.bing': '必应',
    'engine.baidu': '百度',
    'engine.ddg': 'DuckDuckGo',
    'engine.sogou': '搜狗',
    'engine.zhihu': '知乎',
    'engine.bili': '哔哩哔哩',

    'settings.title': '设置',
    'settings.theme': '主题',
    'settings.themeAuto': '跟随壁纸',
    'settings.themeLight': '浅色',
    'settings.themeDark': '深色',
    'settings.accent': '主题色',
    'settings.wallpaper': '壁纸',
    'settings.pickImage': '选本地图片',
    'settings.clear': '清除',
    'settings.layout': '布局',
    'settings.layoutGrid': '网格',
    'settings.layoutFree': '自由摆放',
    'settings.layoutNote': '自由摆放的坐标存在本机，不随书签同步；拖一个图标压到另一个图标上会新建文件夹把两者收进去。',
    'settings.size': '图标大小',
    'settings.sizeS': '小',
    'settings.sizeM': '中',
    'settings.sizeL': '大',
    'settings.showEmpty': '显示空分页',
    'settings.dev': '开发',
    'settings.reload': '重载扩展',
    'settings.reloadNote': '改完代码点它，再按 F5',
    'settings.root': '书签来源',
    'settings.rootNote': '换源后仍读写同一份书签，只是显示哪个根目录。',
    'settings.rootPrefix': '根',
    'settings.custom': '自定义',

    'bulk.selected': '已选 {n} 项',
    'bulk.move': '移动到分页',
    'bulk.delete': '删除',
    'bulk.cancel': '取消选择',
    'bulk.deleteConfirm': '删除选中的 {n} 项？会同步删除浏览器书签。',

    'intro.title': '欢迎使用 Bookmark Deck',
    'intro.sub': '它直接读写浏览器书签，没有第二份数据，所以不存在两套内容不一致的问题。',
    'intro.p1': '<b>左侧分页</b>就是书签栏的一级文件夹。底部「新建分页」等于新建文件夹，删除分页也会连同里面的书签一起删。',
    'intro.p2': '<b>拖到另一个图标上</b>会新建文件夹把两者收进去；<b>拖到它的左右两侧</b>只是调整顺序，两种情况提示框不一样。',
    'intro.p3': '<b>Ctrl+K</b> 搜书签和标签，<b>Ctrl+Z</b> 撤销上一步，方向键在网格里移动，<b>Ctrl/Shift 点击</b>可以多选。',
    'intro.ok': '开始使用',
    'intro.dragCount': '{n} 项',

    'clock.weekdays': '周日,周一,周二,周三,周四,周五,周六',
    'clock.date': '{m}月{d}日 {w}'
  };

  var EN = {
    'app.title': 'New Tab',
    'app.brand': 'Bookmarks',

    'rail.collapse': 'Collapse sidebar',
    'rail.expand': 'Expand sidebar',
    'rail.addPage': 'New page',
    'page.rename': 'Rename',
    'page.up': 'Move up',
    'page.down': 'Move down',
    'page.delete': 'Delete page',
    'page.renamePrompt': 'Page name',
    'page.newPrompt': 'New page name',
    'page.newDefault': 'New page',
    'page.deleteConfirm': 'Delete "{title}" and the {n} items inside? The bookmarks will be removed too.',
    'page.created': 'New page "{title}"',

    'empty.root': 'This bookmark root is empty. Create a page from the sidebar to start.',
    'empty.page': 'No bookmarks on this page yet. Use the + button at the bottom right.',
    'empty.folder': 'Empty folder.',
    'group.untitled': 'Ungrouped',
    'item.untitled': 'Untitled',

    'menu.openNewTab': 'Open in new tab',
    'menu.openHere': 'Open here',
    'menu.copyUrl': 'Copy link',
    'menu.copyOk': 'Link copied',
    'menu.copyFail': 'Copy failed, please copy manually',
    'menu.edit': 'Edit',
    'menu.moveToPage': 'Move to page',
    'menu.deleteBookmark': 'Delete bookmark',
    'menu.open': 'Open',
    'menu.openAll': 'Open all in new tabs',
    'menu.deleteFolder': 'Delete folder',
    'menu.renamePage': 'Rename',
    'menu.movePageUp': 'Move up',
    'menu.movePageDown': 'Move down',
    'menu.deletePage': 'Delete page',
    'menu.search': 'Search bookmarks and tabs',
    'menu.undo': 'Undo',
    'menu.addBookmark': 'Add bookmark',
    'menu.newFolder': 'New folder',
    'menu.newPage': 'New page',
    'menu.changeWallpaper': 'Change wallpaper',
    'menu.tidy': 'Tidy layout',
    'menu.current': 'current',
    'menu.use': 'Use',
    'menu.delete': 'Delete',
    'menu.addEngine': 'Add custom search engine…',

    'confirm.delete': 'Delete "{title}"? This also removes the bookmark.',
    'confirm.openAll': 'Open {n} tabs at once?',
    'toast.noLinks': 'No links inside',
    'toast.demoNoSave': 'Cannot save in demo mode',
    'toast.demoNoTab': 'Cannot switch tabs in demo mode',
    'toast.moved': 'Reordered',
    'toast.switchFail': 'Switch failed: {msg}',
    'toast.moveFail': 'Move failed: {msg}',
    'toast.orderFail': 'Order sync failed: {msg}',
    'toast.undoNone': 'Nothing to undo',
    'toast.undoOk': 'Undone: {label}',
    'toast.undoFail': 'Undo failed: {msg}',
    'toast.undoPartial': 'Undone, but {n} item(s) no longer exist',
    'toast.moveInto': 'Moved into "{title}"',
    'toast.groupFail': 'Group failed: {msg}',
    'toast.saveFail': 'Save failed: {msg}',
    'toast.saveFailUnknown': 'storage refused the write',
    'toast.storageFull': 'Save failed: local storage is full',
    'toast.wallOk': 'Wallpaper updated',
    'toast.wallTooBig': 'Wallpaper will not fit, try a smaller image',
    'toast.wallFail': 'Wallpaper failed: {msg}',
    'toast.wallBadType': 'Please choose an image file',
    'toast.wallTooLarge': 'Image too large, please pick one under 12MB',
    'toast.imageUnreadable': 'Cannot read this image',
    'toast.engineAdded': 'Added and switched',
    'toast.noOtherPage': 'No other page to move to',
    'toast.bulkDeleted': 'Deleted {n} items',

    'undo.move': 'Move',
    'undo.layout': 'Layout change',
    'undo.delete': 'Delete "{title}"',
    'undo.group': 'Group "{title}"',
    'undo.bulkDelete': 'Delete {n} items',
    'undo.bulkMove': 'Move {n} items',
    'undo.moveOut': 'Move {n} item(s) out of the folder',
    'undo.newBookmark': 'Add "{title}"',
    'undo.editBookmark': 'Edit "{title}"',
    'undo.newFolder': 'New folder "{title}"',
    'undo.newPage': 'New page "{title}"',

    'folder.rename': 'Rename folder',
    'folder.namePrompt': 'Folder name',
    'folder.nameDefault': 'New folder',
    'folder.groupPrompt': 'Put these two into a new folder. Name it:',
    'folder.cannotNest': 'Cannot move a folder into itself or its subfolder',
    'crumbs.dropOut': 'Drop here to move out to "{title}"',

    'form.addBookmark': 'Add bookmark',
    'form.editBookmark': 'Edit bookmark',
    'form.name': 'Name',
    'form.url': 'URL',
    'form.cancel': 'Cancel',
    'form.save': 'Save',
    'form.errName': 'Name cannot be empty',
    'form.errUrl': 'URL cannot be empty',
    'form.errUrlFormat': 'Invalid URL',
    'form.errUrlHttp': 'URL must start with http',
    'form.errEngineTpl': 'Use %s where the keyword goes',
    'form.addEngine': 'Add search engine',
    'form.namePlaceholder': 'e.g. Site search',
    'form.engineUrlPlaceholder': 'https://example.com/search?q=%s',
    'form.urlPlaceholder': 'https://example.com',

    'search.local': 'Bookmarks & tabs',
    'search.placeholderLocal': 'Search bookmarks and tabs, Ctrl+K',
    'search.placeholderEngine': 'Search {name}, Ctrl+K',
    'search.foot': '↑↓ select · Enter open · Esc close',
    'search.placeholder': 'Search, Ctrl+K',
    'search.recent': 'Recent',
    'search.tabs': 'Tabs',
    'search.books': 'Bookmarks',
    'search.clear': 'Clear',
    'search.empty': 'No matching tabs or bookmarks',
    'search.count': '{n} items',
    'search.usedWith': 'Searched with {name}',
    'search.currentTab': 'current tab',
    'search.permissionNote': '{n} tabs found but titles and URLs are hidden: the tabs permission is not active. Reload the extension from chrome://extensions and confirm the new permission. Click here to retry.',
    'search.close': 'Close',
    'search.engineTitle': 'Choose search source',

    'engine.google': 'Google',
    'engine.bing': 'Bing',
    'engine.baidu': 'Baidu',
    'engine.ddg': 'DuckDuckGo',
    'engine.sogou': 'Sogou',
    'engine.zhihu': 'Zhihu',
    'engine.bili': 'Bilibili',

    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.themeAuto': 'Follow wallpaper',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.accent': 'Accent',
    'settings.wallpaper': 'Wallpaper',
    'settings.pickImage': 'Choose image',
    'settings.clear': 'Clear',
    'settings.layout': 'Layout',
    'settings.layoutGrid': 'Grid',
    'settings.layoutFree': 'Free',
    'settings.layoutNote': 'Free layout coordinates stay on this device and do not sync with bookmarks. Drop one icon onto another to create a folder holding both.',
    'settings.size': 'Icon size',
    'settings.sizeS': 'S',
    'settings.sizeM': 'M',
    'settings.sizeL': 'L',
    'settings.showEmpty': 'Show empty pages',
    'settings.dev': 'Development',
    'settings.reload': 'Reload extension',
    'settings.reloadNote': 'After editing code, click then press F5',
    'settings.root': 'Bookmark root',
    'settings.rootNote': 'Switching the root still reads and writes the same bookmarks, only which folder is shown changes.',
    'settings.rootPrefix': 'Root',
    'settings.custom': 'Custom',

    'bulk.selected': '{n} selected',
    'bulk.move': 'Move to page',
    'bulk.delete': 'Delete',
    'bulk.cancel': 'Clear selection',
    'bulk.deleteConfirm': 'Delete the {n} selected items? This also removes the bookmarks.',

    'intro.title': 'Welcome to Bookmark Deck',
    'intro.sub': 'It reads and writes your browser bookmarks directly. There is no second copy, so the two can never drift apart.',
    'intro.p1': '<b>The page rail</b> is your bookmark bar: each page is a top-level folder. "New page" creates a folder, and deleting a page deletes its bookmarks too.',
    'intro.p2': '<b>Drop onto another icon</b> creates a folder holding both. <b>Drop to its left or right</b> just reorders. The two gestures show different outlines.',
    'intro.p3': '<b>Ctrl+K</b> searches bookmarks and tabs, <b>Ctrl+Z</b> undoes, arrow keys move across the grid, <b>Ctrl/Shift click</b> selects multiple.',
    'intro.ok': 'Get started',
    'intro.dragCount': '{n} items',

    'clock.weekdays': 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
    'clock.date': '{m}/{d} {w}'
  };

  var DICTS = { zh: ZH, en: EN };

  var lang = (function () {
    var raw = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) raw = chrome.i18n.getUILanguage();
      else if (typeof navigator !== 'undefined') raw = navigator.language || '';
    } catch (e) { raw = ''; }
    var forced = '';
    try { forced = new URLSearchParams(location.search).get('lang') || ''; } catch (e) { forced = ''; }
    if (forced) return /^zh/i.test(forced) ? 'zh' : 'en';
    return /^zh/i.test(raw) ? 'zh' : (raw ? 'en' : 'zh');
  })();

  function format(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] == null ? m : String(vars[k]);
    });
  }

  function t(key, vars) {
    var pack = DICTS[lang] || ZH;
    var out = pack[key];
    if (out == null) out = ZH[key];
    if (out == null) {
      if (typeof console !== 'undefined') console.warn('[i18n] missing key:', key);
      return key;
    }
    return format(out, vars);
  }

  function applyDom(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.dataset.i18nHtml); });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.title = t(el.dataset.i18nTitle); });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  window.I18N = { t: t, apply: applyDom, lang: lang, dicts: DICTS };
  if (window.Deck) {
    window.Deck.register({
      id: 'i18n',
      init: function (host) {
        host.t = t;
        host.lang = lang;
        host.i18n = window.I18N;
      }
    });
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyDom(document);
  }
})();
