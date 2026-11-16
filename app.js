(function () {
  'use strict';

  const hasAPI = typeof chrome !== 'undefined' && chrome.bookmarks && chrome.runtime && chrome.runtime.id;
  const $ = (id) => document.getElementById(id);

  const WALLS = {
    a: { css: 'linear-gradient(140deg,#f2f4f8 0%,#e7ecf5 45%,#eae6f2 100%)', theme: 'light' },
    b: { css: 'linear-gradient(160deg,#101728 0%,#1b2438 45%,#0b1220 100%)', theme: 'dark' },
    c: { css: 'linear-gradient(150deg,#fdf6ec 0%,#f3e3cd 55%,#e6d8c3 100%)', theme: 'light' },
    d: { css: 'linear-gradient(150deg,#e9f5ef 0%,#dbedf1 50%,#e0e7f8 100%)', theme: 'light' },
    e: { css: 'linear-gradient(150deg,#f6eef5 0%,#e7e9f8 55%,#dde9f6 100%)', theme: 'light' }
  };

  const state = {
    roots: [],
    rootIdx: 0,
    groups: [],
    activeId: null,
    query: '',
    size: 'm',
    showEmpty: true,
    railCollapsed: false,
    wall: 'a',
    image: null,
    drag: null,
    editing: null,
    overlay: []
  };

  /* ---------- 存储 ---------- */
  const store = {
    get(key, fallback) {
      try {
        if (hasAPI) return Promise.resolve(chrome.storage.local.get(key)).then((o) => (key in o ? o[key] : fallback));
        const raw = localStorage.getItem('bd.' + key);
        return Promise.resolve(raw ? JSON.parse(raw) : fallback);
      } catch (e) { return Promise.resolve(fallback); }
    },
    set(key, value) {
      try {
        if (hasAPI) { const o = {}; o[key] = value; chrome.storage.local.set(o); }
        else localStorage.setItem('bd.' + key, JSON.stringify(value));
      } catch (e) { /* 忽略写入失败 */ }
    }
  };

  /* ---------- 工具 ---------- */
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; } };
  const initial = (name, url) => (name || hostOf(url) || '?').trim().charAt(0).toUpperCase();
  const COLOR_SEED = ['#4f6bed', '#e0592a', '#1f8a70', '#9b5de5', '#d64545', '#2b7cd3', '#c08a1e', '#0f766e'];
  const colorOf = (s) => COLOR_SEED[Math.abs([...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLOR_SEED.length];
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function faviconUrl(url, size) {
    if (hasAPI && chrome.runtime.getURL) {
      return chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=' + (size || 64));
    }
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(hostOf(url)) + '&sz=' + (size || 64);
  }

  function makeIcon(url, name, size) {
    const img = document.createElement('img');
    img.src = faviconUrl(url, size);
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const box = img.parentElement;
      if (!box) return;
      box.textContent = '';
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = initial(name, url);
      span.style.background = colorOf(name || url);
      box.appendChild(span);
    };
    return img;
  }

  /* ---------- 数据 ---------- */
  function rootNode() { return state.roots[state.rootIdx]; }

  async function loadTree() {
    if (hasAPI) {
      const tree = await chrome.bookmarks.getTree();
      state.roots = tree[0].children;
    } else {
      state.roots = (window.MOCK_TREE || { children: [] }).children;
    }
    if (state.rootIdx >= state.roots.length) state.rootIdx = 0;
    buildGroups();
  }

  function buildGroups() {
    const root = rootNode();
    if (!root) { state.groups = []; return; }
    const kids = root.children || [];
    const loose = kids.filter((c) => c.url);
    const groups = [];
    if (loose.length) groups.push({ id: root.id, title: '未分组', virtual: true, node: root });
    kids.filter((c) => !c.url).forEach((f) => groups.push({ id: f.id, title: f.title || hostOf(f.url), virtual: false, node: f }));
    state.groups = groups;
    if (!groups.some((g) => g.id === state.activeId)) {
      const firstFilled = groups.find((g) => !g.virtual && childrenOf(g).length);
      const firstAny = groups.find((g) => childrenOf(g).length);
      state.activeId = (firstFilled || firstAny || groups[0] || {}).id || null;
    }
  }

  function currentGroup() { return state.groups.find((g) => g.id === state.activeId) || null; }

  function findPath(id, nodes, acc) {
    const path = acc || [];
    for (const n of nodes || []) {
      if (n.id === id) return path.concat(n.id);
      const hit = findPath(id, n.children, path.concat(n.id));
      if (hit) return hit;
    }
    return null;
  }

  function isInside(ancestorId, nodeId) {
    const path = findPath(nodeId, state.roots);
    return !!(path && path.includes(ancestorId));
  }

  function findNode(id, nodes) {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const hit = findNode(id, n.children);
      if (hit) return hit;
    }
    return null;
  }
  function childrenOf(group) { return group ? (group.node.children || []).filter((c) => (group.virtual ? c.url : true)) : []; }
  function parentIdOf(group) { return group.virtual ? group.node.id : group.id; }

  /* ---------- 左侧分页 ---------- */
  function visibleGroups() {
    if (state.showEmpty) return state.groups;
    const filled = state.groups.filter((g) => childrenOf(g).length || g.id === state.activeId);
    return filled.length ? filled : state.groups;
  }

  function renderPages() {
    const box = $('pages');
    box.textContent = '';
    visibleGroups().forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'page';
      btn.dataset.gid = g.id;
      btn.setAttribute('aria-selected', String(g.id === state.activeId));

      const av = document.createElement('span');
      av.className = 'av';
      av.textContent = (g.title || '?').trim().charAt(0).toUpperCase();
      const c = colorOf(g.title);
      av.style.background = c + '24';
      av.style.color = c;

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = g.title || '未命名';

      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      const n = childrenOf(g).length;
      cnt.textContent = n ? String(n) : '';

      btn.append(av, label, cnt);
      btn.title = g.title;
      btn.addEventListener('click', () => {
        state.activeId = g.id;
        state.query = '';
        $('q').value = '';
        render();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        pageMenu(e.clientX, e.clientY, g);
      });
      btn.addEventListener('dragover', (e) => {
        if (!state.drag) return;
        e.preventDefault();
        btn.classList.add('drop-hint');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drop-hint'));
      btn.addEventListener('drop', async (e) => {
        e.preventDefault();
        btn.classList.remove('drop-hint');
        const drag = state.drag;
        if (!drag) return;
        const target = parentIdOf(g);
        if (drag.id === target) return;
        await moveNode(drag.id, target, -1);
      });
      box.appendChild(btn);
    });
  }

  function pageMenu(x, y, group) {
    showMenu(x, y, [
      { label: '重命名', disabled: group.virtual, onClick: () => renamePage(group) },
      { label: '上移', disabled: group.virtual, onClick: () => reorderPage(group, -1) },
      { label: '下移', disabled: group.virtual, onClick: () => reorderPage(group, 1) },
      { sep: true },
      { label: '删除分页', danger: true, disabled: group.virtual, onClick: () => deletePage(group) }
    ]);
  }

  function renamePage(group) {
    const name = prompt('分页名称', group.title);
    if (name === null) return;
    const t = name.trim();
    if (!t || t === group.title) return;
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    chrome.bookmarks.update(group.id, { title: t });
  }

  function deletePage(group) {
    const n = childrenOf(group).length;
    if (!confirm('删除「' + group.title + '」以及里面的 ' + n + ' 项？会同步删除浏览器书签。')) return;
    removeNode(group.id);
  }

  async function reorderPage(group, delta) {
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    const root = rootNode();
    const folders = (root.children || []).filter((c) => !c.url);
    const idx = folders.findIndex((f) => f.id === group.id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= folders.length) return;
    await chrome.bookmarks.move(group.id, { parentId: root.id, index: target });
  }

  async function addPage() {
    const name = prompt('新分页名称', '新分页');
    if (name === null) return;
    const title = name.trim() || '新分页';
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    const created = await chrome.bookmarks.create({ parentId: rootNode().id, title });
    await reloadNow();
    state.activeId = created.id;
    render();
  }

  async function addFolder() {
    const name = prompt('新建文件夹名称', '新文件夹');
    if (name === null) return;
    const title = name.trim() || '新文件夹';
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    await chrome.bookmarks.create({ parentId: defaultParentId(), title });
  }

  /* ---------- 图标与文件夹 ---------- */
  function makeTile(item, ctx) {
    const isFolder = !item.url;
    const tile = document.createElement(isFolder ? 'div' : 'a');
    tile.className = 'tile' + (isFolder ? ' folder' : '');
    tile.dataset.id = item.id;
    tile.dataset.parent = ctx.parentId;
    tile.draggable = true;
    tile.title = isFolder ? item.title : item.url;

    if (!isFolder) { tile.href = item.url; tile.rel = 'noopener'; }

    const frame = document.createElement('div');
    frame.className = 'frame';

    if (isFolder) {
      const kids = (item.children || []).slice(0, 4);
      for (let i = 0; i < 4; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'mini';
        const kid = kids[i];
        if (kid && kid.url) cell.appendChild(makeIcon(kid.url, kid.title, 32));
        else if (kid) cell.textContent = '·';
        frame.appendChild(cell);
      }
    } else {
      frame.appendChild(makeIcon(item.url, item.title, 64));
    }

    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = item.title || hostOf(item.url) || '未命名';
    if (isFolder) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String((item.children || []).length);
      label.appendChild(n);
    }
    tile.append(frame, label);

    if (isFolder) tile.addEventListener('click', (e) => { e.preventDefault(); openFolder(item); });

    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, item, ctx);
    });

    tile.addEventListener('dragstart', (e) => {
      const siblings0 = Array.from(tile.parentElement.children).filter((n) => n.classList.contains('tile'));
      state.drag = { id: item.id, parentId: ctx.parentId, isFolder, index: siblings0.indexOf(tile) };
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      document.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
      state.drag = null;
    });
    tile.addEventListener('dragover', (e) => {
      if (!state.drag || state.drag.id === item.id) return;
      e.preventDefault();
      tile.classList.add('drop-before');
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('drop-before'));
    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      tile.classList.remove('drop-before');
      const drag = state.drag;
      if (!drag || drag.id === item.id) return;
      if (isFolder) { await moveNode(drag.id, item.id, -1); return; }
      const siblings = Array.from(tile.parentElement.children).filter((n) => n.classList.contains('tile'));
      const raw = siblings.indexOf(tile);
      await moveNode(drag.id, ctx.parentId, raw < 0 ? -1 : resolveDropIndex(drag, ctx.parentId, raw));
    });

    return tile;
  }

  function renderGrid() {
    const grid = $('grid');
    grid.textContent = '';
    grid.ondragover = null;
    grid.ondrop = null;

    if (state.query) { renderSearch(grid); return; }

    const group = currentGroup();
    if (!group) {
      grid.innerHTML = '<p class="empty">这个书签根目录是空的，点侧栏的新建分页开始。</p>';
      return;
    }
    const kids = childrenOf(group);
    if (!kids.length) {
      grid.innerHTML = '<p class="empty">这一页还没有书签，点右下角加号新增。</p>';
      return;
    }
    const parentId = parentIdOf(group);
    kids.forEach((k) => grid.appendChild(makeTile(k, { parentId, groupId: group.id })));

    grid.ondragover = (e) => { if (state.drag) e.preventDefault(); };
    grid.ondrop = async (e) => {
      if (!state.drag || e.target !== grid) return;
      e.preventDefault();
      await moveNode(state.drag.id, parentId, -1);
    };
  }

  function renderSearch(grid) {
    const q = state.query.toLowerCase();
    const hits = [];
    for (const g of state.groups) {
      for (const k of childrenOf(g)) {
        const hay = ((k.title || '') + ' ' + (k.url || '')).toLowerCase();
        if (hay.indexOf(q) >= 0) hits.push({ item: k, group: g });
        if (hits.length > 300) break;
      }
    }
    if (!hits.length) {
      grid.innerHTML = '<p class="empty">没有匹配的书签。</p>';
      return;
    }
    hits.forEach(({ item, group }) => {
      const tile = makeTile(item, { parentId: parentIdOf(group), groupId: group.id });
      const nameEl = tile.querySelector('.name');
      if (nameEl) {
        const tag = document.createElement('span');
        tag.className = 'n';
        tag.textContent = group.title;
        nameEl.appendChild(tag);
      }
      grid.appendChild(tile);
    });
  }

  function render() {
    renderPages();
    renderGrid();
  }

  /* ---------- 文件夹弹层 ---------- */
  function openFolder(folder) {
    state.overlay.push(folder);
    renderOverlay();
    $('overlay').hidden = false;
  }

  function closeFolder(depth) {
    state.overlay = depth ? state.overlay.slice(0, depth) : [];
    if (!state.overlay.length) $('overlay').hidden = true;
    else renderOverlay();
  }

  function renderOverlay() {
    const crumbs = $('crumbs');
    crumbs.textContent = '';
    state.overlay.forEach((node, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '/';
        crumbs.appendChild(sep);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = node.title || '未命名';
      b.addEventListener('click', () => closeFolder(i + 1));
      crumbs.appendChild(b);
    });

    const top = state.overlay[state.overlay.length - 1];
    const grid = $('subgrid');
    grid.textContent = '';
    const kids = top.children || [];
    if (!kids.length) {
      grid.innerHTML = '<p class="empty">空文件夹。</p>';
      return;
    }
    kids.forEach((k) => grid.appendChild(makeTile(k, { parentId: top.id, groupId: state.activeId })));

    grid.ondragover = (e) => { if (state.drag) e.preventDefault(); };
    grid.ondrop = async (e) => {
      if (!state.drag || e.target !== grid) return;
      e.preventDefault();
      await moveNode(state.drag.id, top.id, -1);
    };
  }

  /* ---------- 写操作 ---------- */
  function resolveDropIndex(drag, parentId, targetIdx) {
    let idx = targetIdx;
    if (drag.parentId === parentId && typeof drag.index === 'number' && drag.index < targetIdx) idx -= 1;
    return Math.max(idx, 0);
  }

  // Chrome 的 bookmarks.move 不接受负 index，追加要显式算成目标子项数
  async function appendIndex(id, parentId) {
    let kids = [];
    if (chrome.bookmarks.getChildren) {
      kids = await chrome.bookmarks.getChildren(parentId);
    } else {
      const [dest] = await chrome.bookmarks.getSubTree(parentId);
      kids = (dest && dest.children) || [];
    }
    const same = kids.some((k) => k.id === id);
    return same ? Math.max(kids.length - 1, 0) : kids.length;
  }

  async function moveNode(id, parentId, index) {
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    if (id === parentId || isInside(id, parentId)) {
      toast('不能把文件夹移动到它自己或它的子文件夹里');
      return;
    }
    try {
      let target = typeof index === 'number' ? index : -1;
      if (target < 0) target = await appendIndex(id, parentId);
      await chrome.bookmarks.move(id, { parentId, index: target });
    } catch (e) {
      toast('移动失败：' + e.message);
    }
  }

  async function removeNode(id) {
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    await chrome.bookmarks.removeTree(id).catch(async () => { await chrome.bookmarks.remove(id); });
  }

  const reload = debounce(() => reloadNow(), 120);

  async function reloadNow() {
    const ids = state.overlay.map((n) => n.id);
    await loadTree();
    if (ids.length) {
      const path = ids.map((id) => findNode(id, state.roots));
      if (path.every(Boolean)) {
        state.overlay = path;
        renderOverlay();
        $('overlay').hidden = false;
      } else {
        state.overlay = [];
        $('overlay').hidden = true;
      }
    }
    render();
  }

  /* ---------- 右键菜单 ---------- */
  function menuNode(items, isSub) {
    const box = document.createElement('div');
    box.className = isSub ? 'sub' : 'group';
    items.forEach((it) => {
      if (it.sep) { box.appendChild(document.createElement('hr')); return; }
      const row = document.createElement('div');
      row.className = 'item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
      row.setAttribute('role', 'menuitem');
      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = it.label;
      row.appendChild(txt);

      if (it.hint) {
        const hint = document.createElement('span');
        hint.className = 'meta';
        hint.textContent = it.hint;
        row.appendChild(hint);
      }
      if (it.submenu && it.submenu.length) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '›';
        row.appendChild(arrow);
        row.appendChild(menuNode(it.submenu, true));
        row.addEventListener('click', (e) => {
          if (it.disabled) return;
          e.stopPropagation();
          const wasOpen = row.classList.contains('open');
          document.querySelectorAll('.menu .item.open').forEach((n) => n.classList.remove('open'));
          if (!wasOpen) row.classList.add('open');
        });
      } else if (!it.disabled) {
        row.addEventListener('click', () => { hideMenu(); it.onClick && it.onClick(); });
      }
      box.appendChild(row);
    });
    return box;
  }

  function showMenu(x, y, items) {
    const host = $('menu');
    host.textContent = '';
    host.className = 'menu';
    host.appendChild(menuNode(items, false));
    host.hidden = false;

    const w = host.offsetWidth;
    const h = host.offsetHeight;
    let left = x;
    let top = y;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    host.style.left = left + 'px';
    host.style.top = top + 'px';
    if (left + w + 170 > window.innerWidth) host.classList.add('flip');
  }

  function moveTargets(item, ctx) {
    return state.groups
      .filter((g) => parentIdOf(g) !== ctx.parentId)
      .map((g) => ({ label: g.title, onClick: () => moveNode(item.id, parentIdOf(g), -1) }));
  }

  function openMenu(x, y, item, ctx) {
    if (item.url) {
      const targets = moveTargets(item, ctx);
      showMenu(x, y, [
        { label: '在新标签页打开', onClick: () => window.open(item.url, '_blank', 'noopener') },
        { label: '在当前页打开', onClick: () => { location.href = item.url; } },
        { label: '复制网址', onClick: () => copyText(item.url) },
        { sep: true },
        { label: '编辑', onClick: () => openForm(item, ctx) },
        { label: '移动到分页', submenu: targets, disabled: !targets.length },
        { sep: true },
        { label: '删除书签', danger: true, onClick: () => deleteItem(item) }
      ]);
      return;
    }

    const kids = (item.children || []).filter((c) => c.url);
    const targets = moveTargets(item, ctx);
    showMenu(x, y, [
      { label: '打开', onClick: () => openFolder(item) },
      { label: '在新标签页打开全部', hint: kids.length ? String(kids.length) : '', disabled: !kids.length, onClick: () => openAll(kids) },
      { sep: true },
      { label: '重命名', onClick: () => openForm(item, ctx) },
      { label: '移动到分页', submenu: targets, disabled: !targets.length },
      { sep: true },
      { label: '删除文件夹', danger: true, onClick: () => deleteItem(item) }
    ]);
  }

  function blankMenu(x, y) {
    showMenu(x, y, [
      { label: '搜索标签页', onClick: openPalette },
      { sep: true },
      { label: '添加书签', onClick: () => openForm(null, { parentId: defaultParentId() }) },
      { label: '新建文件夹', onClick: addFolder },
      { label: '新建分页', onClick: addPage },
      { sep: true },
      { label: '更换壁纸', onClick: () => { renderSwatches(); renderRootSeg(); $('drawer').hidden = false; } }
    ]);
  }

  function deleteItem(item) {
    const label = item.title || '未命名';
    if (!confirm('确定删除「' + label + '」？此操作会同步删除浏览器书签。')) return;
    removeNode(item.id);
  }

  function openAll(nodes) {
    const urls = nodes.map((n) => n.url).filter(Boolean);
    if (!urls.length) { toast('这里面没有链接'); return; }
    if (urls.length > 12 && !confirm('一次打开 ' + urls.length + ' 个标签页？')) return;
    urls.forEach((u) => {
      if (hasAPI && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: u, active: false });
      else window.open(u, '_blank', 'noopener');
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制网址');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制网址'); }
      catch (e2) { toast('复制失败，请手动复制'); }
      ta.remove();
    }
  }

  function hideMenu() { $('menu').hidden = true; }

  /* ---------- 搜索打开着的标签页 ---------- */
  const palette = { tabs: [], list: [], index: 0 };

  async function listOpenTabs() {
    if (hasAPI && chrome.tabs) {
      const tabs = await chrome.tabs.query({});
      return tabs
        .filter((t) => t.url && !t.url.startsWith('chrome-extension://') && t.url !== 'chrome://newtab/')
        .map((t) => ({ id: t.id, title: t.title || t.url, url: t.url, windowId: t.windowId, active: !!t.active }));
    }
    const out = [];
    (function walk(nodes) {
      for (const n of nodes || []) {
        if (n.url && out.length < 12) out.push({ id: out.length + 1, title: n.title || n.url, url: n.url, demo: true });
        if (n.children) walk(n.children);
      }
    })(window.MOCK_TREE ? window.MOCK_TREE.children : []);
    return out;
  }

  async function openPalette() {
    palette.tabs = await listOpenTabs();
    palette.index = 0;
    $('pq').value = '';
    renderPalette('');
    $('palette').hidden = false;
    $('pq').focus();
  }

  function closePalette() { $('palette').hidden = true; }

  function renderPalette(q) {
    const key = (q || '').trim().toLowerCase();
    palette.list = palette.tabs.filter((t) => !key || (t.title + ' ' + t.url).toLowerCase().indexOf(key) >= 0);
    if (palette.index >= palette.list.length) palette.index = Math.max(palette.list.length - 1, 0);
    const box = $('plist');
    box.textContent = '';
    if (!palette.list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '没有匹配的标签页';
      box.appendChild(p);
    } else {
      palette.list.forEach((t, i) => box.appendChild(paletteRow(t, i)));
    }
    $('pcount').textContent = palette.list.length + ' / ' + palette.tabs.length;
  }

  function paletteRow(tab, i) {
    const row = document.createElement('div');
    row.className = 'prow' + (i === palette.index ? ' on' : '');
    const icon = document.createElement('span');
    icon.className = 'picon';
    icon.appendChild(makeIcon(tab.url, tab.title, 32));
    const main = document.createElement('span');
    main.className = 'pmain';
    const title = document.createElement('span');
    title.className = 'ptitle';
    title.textContent = tab.title;
    const url = document.createElement('span');
    url.className = 'purl';
    url.textContent = hostOf(tab.url) + (tab.active ? ' · 当前标签' : '');
    main.append(title, url);
    row.append(icon, main);
    row.addEventListener('click', () => activateTab(tab));
    row.addEventListener('mousemove', () => {
      if (palette.index !== i) { palette.index = i; markPalette(); }
    });
    return row;
  }

  function markPalette() {
    Array.from($('plist').children).forEach((n, i) => n.classList.toggle('on', i === palette.index));
  }

  async function activateTab(tab) {
    closePalette();
    if (!hasAPI || tab.demo) { toast('演示模式不能切换标签页'); return; }
    try {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null && chrome.windows) await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      toast('切换失败：' + e.message);
    }
  }

  /* ---------- 表单 ---------- */
  function openForm(item, ctx) {
    state.editing = { item, ctx };
    const isEdit = !!item;
    $('formTitle').textContent = isEdit ? (item.url ? '编辑书签' : '重命名文件夹') : '添加书签';
    $('fName').value = isEdit ? item.title || '' : '';
    $('fUrl').value = isEdit ? item.url || '' : '';
    $('fUrl').parentElement.hidden = !!(isEdit && !item.url);
    $('fErr').hidden = true;
    $('modal').hidden = false;
    $('fName').focus();
  }

  async function submitForm(e) {
    e.preventDefault();
    const name = $('fName').value.trim();
    const url = $('fUrl').value.trim();
    const editing = state.editing;
    const err = $('fErr');
    err.hidden = true;

    if (!name) { err.textContent = '名称不能为空'; err.hidden = false; return; }
    if (!editing || !editing.item || editing.item.url) {
      if (!url) { err.textContent = '网址不能为空'; err.hidden = false; return; }
      if (!/^(https?|ftp|file|chrome|edge|about):/i.test(url) && !/^[\w.-]+\.[a-z]{2,}/i.test(url)) {
        err.textContent = '网址格式不对';
        err.hidden = false;
        return;
      }
    }
    const finalUrl = url && !/^[a-z]+:/i.test(url) ? 'https://' + url : url;

    if (!hasAPI) { toast('演示模式不能保存'); $('modal').hidden = true; return; }

    try {
      if (editing && editing.item) {
        const patch = { title: name };
        if (editing.item.url) patch.url = finalUrl;
        await chrome.bookmarks.update(editing.item.id, patch);
      } else {
        const parentId = (editing && editing.ctx && editing.ctx.parentId) || defaultParentId();
        await chrome.bookmarks.create({ parentId, title: name, url: finalUrl });
      }
      $('modal').hidden = true;
    } catch (ex) {
      err.textContent = '保存失败：' + ex.message;
      err.hidden = false;
    }
  }

  function defaultParentId() {
    if (state.overlay.length) return state.overlay[state.overlay.length - 1].id;
    const g = currentGroup();
    return g ? parentIdOf(g) : (rootNode() ? rootNode().id : '1');
  }

  /* ---------- 外观 ---------- */
  function applyWall() {
    const wall = $('wall');
    if (state.image) {
      wall.style.backgroundImage = 'url("' + state.image + '")';
      detectTheme(state.image);
    } else {
      const w = WALLS[state.wall] || WALLS.a;
      wall.style.backgroundImage = w.css;
      document.documentElement.dataset.theme = w.theme;
    }
    document.documentElement.dataset.size = state.size;
    $('rail').classList.toggle('collapsed', state.railCollapsed);
    $('railToggle').textContent = state.railCollapsed ? '›' : '‹';
  }

  function detectTheme(dataUrl) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        const w = (c.width = 32);
        const h = (c.height = 32);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        document.documentElement.dataset.theme = (sum / (d.length / 4)) < 128 ? 'dark' : 'light';
      } catch (e) {
        document.documentElement.dataset.theme = 'light';
      }
    };
    img.onerror = () => { document.documentElement.dataset.theme = 'light'; };
    img.src = dataUrl;
  }

  function renderSwatches() {
    const box = $('swatches');
    box.textContent = '';
    Object.entries(WALLS).forEach(([k, w]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.backgroundImage = w.css;
      b.setAttribute('aria-pressed', String(!state.image && state.wall === k));
      b.title = '预设壁纸';
      b.addEventListener('click', () => {
        state.wall = k;
        state.image = null;
        store.set('wall', k);
        store.set('image', null);
        applyWall();
        renderSwatches();
      });
      box.appendChild(b);
    });
  }

  function renderRootSeg() {
    const box = $('rootSeg');
    box.textContent = '';
    state.roots.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.title || ('根 ' + (i + 1));
      b.setAttribute('aria-pressed', String(i === state.rootIdx));
      b.addEventListener('click', () => {
        state.rootIdx = i;
        state.activeId = null;
        store.set('rootIdx', i);
        buildGroups();
        render();
        renderRootSeg();
      });
      box.appendChild(b);
    });
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    if (!el) { window.alert(msg); return; }
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 200);
    }, 2200);
  }

  /* ---------- 时钟 ---------- */
  function tick() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const el = $('clock');
    el.textContent = '';
    el.append(pad(d.getHours()) + ':' + pad(d.getMinutes()));
    const s = document.createElement('small');
    s.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + '日一二三四五六'[d.getDay()];
    el.appendChild(s);
  }

  /* ---------- 事件 ---------- */
  function wire() {
    $('q').addEventListener('input', (e) => {
      state.query = e.target.value.trim();
      renderGrid();
    });
    $('q').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.target.value = ''; state.query = ''; renderGrid(); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'r' && hasAPI) {
        e.preventDefault();
        chrome.runtime.reload();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('q').focus();
        $('q').select();
      }
      if (e.key === 'Escape') {
        hideMenu();
        if (!$('palette').hidden) closePalette();
        else if (!$('modal').hidden) $('modal').hidden = true;
        else if (!$('drawer').hidden) $('drawer').hidden = true;
        else if (state.overlay.length) closeFolder(state.overlay.length - 1);
      }
    });

    $('pq').addEventListener('input', (e) => { palette.index = 0; renderPalette(e.target.value); });
    $('pq').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        palette.index = Math.min(palette.index + 1, palette.list.length - 1);
        markPalette();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        palette.index = Math.max(palette.index - 1, 0);
        markPalette();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const tab = palette.list[palette.index];
        if (tab) activateTab(tab);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    });
    $('closePalette').addEventListener('click', closePalette);
    $('palette').addEventListener('click', (e) => { if (e.target === $('palette')) closePalette(); });

    $('addPage').addEventListener('click', addPage);
    if (hasAPI) {
      $('devBlock').hidden = false;
      $('reloadExt').addEventListener('click', () => chrome.runtime.reload());
    }
    $('railToggle').addEventListener('click', () => {
      state.railCollapsed = !state.railCollapsed;
      store.set('railCollapsed', state.railCollapsed);
      applyWall();
    });

    $('addBtn').addEventListener('click', () => openForm(null, { parentId: defaultParentId() }));
    $('addFolderBtn').addEventListener('click', addFolder);
    $('gearBtn').addEventListener('click', () => { renderSwatches(); renderRootSeg(); $('drawer').hidden = false; });
    $('closeDrawer').addEventListener('click', () => { $('drawer').hidden = true; });
    $('closeOverlay').addEventListener('click', () => closeFolder(0));
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeFolder(0); });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
    $('fCancel').addEventListener('click', () => { $('modal').hidden = true; });
    $('form').addEventListener('submit', submitForm);
    document.addEventListener('click', (e) => {
      if (!$('menu').hidden && !$('menu').contains(e.target)) hideMenu();
    });
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tile, .page, .menu, .drawer, .modal, .fab, .top, .sheet-head')) return;
      e.preventDefault();
      blankMenu(e.clientX, e.clientY);
    });

    $('pickImage').addEventListener('click', () => $('fileImage').click());
    $('fileImage').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) { toast('图片太大，请选 6MB 以内的'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        state.image = reader.result;
        store.set('image', state.image);
        applyWall();
        renderSwatches();
      };
      reader.readAsDataURL(file);
    });
    $('clearImage').addEventListener('click', () => {
      state.image = null;
      store.set('image', null);
      applyWall();
      renderSwatches();
    });

    $('showEmpty').addEventListener('change', (e) => {
      state.showEmpty = e.target.checked;
      store.set('showEmpty', state.showEmpty);
      render();
    });

    $('sizeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-size]');
      if (!b) return;
      state.size = b.dataset.size;
      store.set('size', state.size);
      applyWall();
      Array.from($('sizeSeg').children).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });

    if (hasAPI) {
      ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'].forEach((ev) => {
        const fn = chrome.bookmarks[ev];
        if (fn && fn.addListener) fn.addListener(reload);
      });
    }
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    const prefs = await Promise.all([
      store.get('wall', 'a'),
      store.get('image', null),
      store.get('size', 'm'),
      store.get('rootIdx', 0),
      store.get('showEmpty', true),
      store.get('railCollapsed', false)
    ]);
    state.wall = prefs[0] || 'a';
    state.image = prefs[1] || null;
    state.size = prefs[2] || 'm';
    state.rootIdx = Number(prefs[3]) || 0;
    state.showEmpty = prefs[4] !== false;
    state.railCollapsed = prefs[5] === true;
    $('showEmpty').checked = state.showEmpty;

    await loadTree();
    const params = new URLSearchParams(location.search);
    if (params.get('rail') === '0') state.railCollapsed = true;
    const wanted = params.get('g');
    if (wanted) {
      const hit = state.groups.find((g) => g.id === wanted || g.title === wanted);
      if (hit) state.activeId = hit.id;
    }
    if (params.get('palette')) openPalette();
    const openIds = (params.get('open') || '').split(',').filter(Boolean);
    if (openIds.length) {
      const path = openIds.map((id) => findNode(id, state.roots));
      if (path.every(Boolean)) {
        state.overlay = path;
        renderOverlay();
        $('overlay').hidden = false;
      }
    }

    applyWall();
    renderSwatches();
    renderRootSeg();
    render();
    wire();
    Array.from($('sizeSeg').children).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.size === state.size)));
    tick();
    setInterval(tick, 20000);
  }

  window.__bd = { moveNode: moveNode, appendIndex: appendIndex, resolveDropIndex: resolveDropIndex, state: state };
  boot();
})();
