(function () {
  'use strict';

  const hasAPI = typeof chrome !== 'undefined' && chrome.bookmarks && chrome.runtime && chrome.runtime.id;
  const t = (key, vars) => (window.I18N ? window.I18N.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  const WALLS = {
    a: { css: 'linear-gradient(140deg,#f2f4f8 0%,#e7ecf5 45%,#eae6f2 100%)', theme: 'light' },
    b: { css: 'linear-gradient(160deg,#101728 0%,#1b2438 45%,#0b1220 100%)', theme: 'dark' },
    c: { css: 'linear-gradient(150deg,#fdf6ec 0%,#f3e3cd 55%,#e6d8c3 100%)', theme: 'light' },
    d: { css: 'linear-gradient(150deg,#e9f5ef 0%,#dbedf1 50%,#e0e7f8 100%)', theme: 'light' },
    e: { css: 'linear-gradient(150deg,#f6eef5 0%,#e7e9f8 55%,#dde9f6 100%)', theme: 'light' }
  };

  const ENGINES = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
    { id: 'bing', name: t('engine.bing'), url: 'https://www.bing.com/search?q=%s' },
    { id: 'baidu', name: t('engine.baidu'), url: 'https://www.baidu.com/s?wd=%s' },
    { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { id: 'sogou', name: t('engine.sogou'), url: 'https://www.sogou.com/web?query=%s' },
    { id: 'zhihu', name: t('engine.zhihu'), url: 'https://www.zhihu.com/search?type=content&q=%s' },
    { id: 'bili', name: t('engine.bili'), url: 'https://search.bilibili.com/all?keyword=%s' }
  ];

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
    formMode: 'bookmark',
    layout: 'grid',
    coords: {},
    theme: 'auto',
    accent: '#3d6cf0',
    history: [],
    engine: 'google',
    customs: [],
    overlay: [],
    selection: new Set(),
    selAnchor: null,
    selecting: false
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
    // 一次取全部偏好。用对象返回，加设置项时不会因为位置变化读错值。
    getAll(defaults) {
      if (hasAPI) {
        return Promise.resolve(chrome.storage.local.get(defaults))
          .then((o) => Object.assign({}, defaults, o))
          .catch(() => Object.assign({}, defaults));
      }
      const out = Object.assign({}, defaults);
      Object.keys(defaults).forEach((k) => {
        try {
          const raw = localStorage.getItem('bd.' + k);
          if (raw !== null) out[k] = JSON.parse(raw);
        } catch (e) { /* 忽略单键损坏 */ }
      });
      return Promise.resolve(out);
    },
    // 返回 Promise<boolean>：写入失败（典型是超配额）时给出可见提示，不再静默吞掉
    set(key, value) {
      const o = {};
      o[key] = value;
      if (hasAPI) {
        return Promise.resolve(chrome.storage.local.set(o))
          .then(() => true)
          .catch((e) => {
            if (typeof toast === 'function') toast(t('toast.saveFail', { msg: (e && e.message) || t('toast.saveFailUnknown') }));
            return false;
          });
      }
      try {
        localStorage.setItem('bd.' + key, JSON.stringify(value));
        return Promise.resolve(true);
      } catch (e) {
        if (typeof toast === 'function') toast(t('toast.storageFull'));
        return Promise.resolve(false);
      }
    }
  };

  /* ---------- 工具 ---------- */
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; } };
  const initial = (name, url) => (name || hostOf(url) || '?').trim().charAt(0).toUpperCase();
  const COLOR_SEED = ['#4f6bed', '#e0592a', '#1f8a70', '#9b5de5', '#d64545', '#2b7cd3', '#c08a1e', '#0f766e'];
  const colorOf = (s) => COLOR_SEED[Math.abs([...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLOR_SEED.length];
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Chrome/Edge 用内置 _favicon，读本地缓存不出网；Firefox 没有这个端点，回落到公共图标服务
  const IS_FIREFOX = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || '');
  function faviconUrl(url, size) {
    if (hasAPI && chrome.runtime.getURL && !IS_FIREFOX) {
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
    if (loose.length) groups.push({ id: root.id, title: t('group.untitled'), virtual: true, node: root });
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
      label.textContent = g.title || t('item.untitled');

      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      const n = childrenOf(g).length;
      cnt.textContent = n ? String(n) : '';

      btn.append(av, label, cnt);
      btn.title = g.title;
      btn.addEventListener('click', () => {
        state.activeId = g.id;
        closeFinder();
        exitSelectMode();
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
        state.drag = null;
        const target = parentIdOf(g);
        if (drag.id === target) return;
        const group = drag.group && drag.group.length > 1 ? drag.group : null;
        if (group) await moveManyTo(group, target);
        else await moveNode(drag.id, target, -1);
      });
      box.appendChild(btn);
    });
  }

  function pageMenu(x, y, group) {
    showMenu(x, y, [
      { label: t('menu.renamePage'), disabled: group.virtual, onClick: () => renamePage(group) },
      { label: t('menu.movePageUp'), disabled: group.virtual, onClick: () => reorderPage(group, -1) },
      { label: t('menu.movePageDown'), disabled: group.virtual, onClick: () => reorderPage(group, 1) },
      { sep: true },
      { label: t('menu.deletePage'), danger: true, disabled: group.virtual, onClick: () => deletePage(group) }
    ]);
  }

  function renamePage(group) {
    const name = prompt(t('page.renamePrompt'), group.title);
    if (name === null) return;
    const t = name.trim();
    if (!t || t === group.title) return;
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    chrome.bookmarks.update(group.id, { title: t });
  }

  function deletePage(group) {
    const n = childrenOf(group).length;
    if (!confirm(t('page.deleteConfirm', { title: group.title, n: n }))) return;
    removeNode(group.id);
  }

  async function reorderPage(group, delta) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    const root = rootNode();
    const folders = (root.children || []).filter((c) => !c.url);
    const idx = folders.findIndex((f) => f.id === group.id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= folders.length) return;
    await placeAt(group.id, root.id, target);
  }

  async function addPage() {
    const name = prompt(t('page.newPrompt'), t('page.newDefault'));
    if (name === null) return;
    const title = name.trim() || t('page.newDefault');
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    const created = await chrome.bookmarks.create({ parentId: rootNode().id, title });
    if (created && created.id) pushUndo(t('undo.newPage', { title: title }), () => chrome.bookmarks.removeTree(created.id));
    await reloadNow();
    state.activeId = created.id;
    render();
  }

  async function addFolder() {
    const name = prompt(t('folder.namePrompt'), t('folder.nameDefault'));
    if (name === null) return;
    const title = name.trim() || t('folder.nameDefault');
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    const created = await chrome.bookmarks.create({ parentId: defaultParentId(), title });
    if (created && created.id) pushUndo(t('undo.newFolder', { title: title }), () => chrome.bookmarks.removeTree(created.id));
  }

  /* ---------- 撤销 ---------- */
  const history = [];
  let undoBusy = false;
  let undoSkip = 0;

  function pushUndo(label, run) {
    if (undoBusy) return;
    history.push({ label: label, run: run });
    if (history.length > 40) history.shift();
  }

  async function undoLast() {
    if (undoBusy) return;
    const item = history.pop();
    if (!item) { toast(t('toast.undoNone')); return; }
    undoBusy = true;
    undoSkip = 0;
    try {
      await item.run();
      if (undoSkip) toast(t('toast.undoPartial', { n: undoSkip }));
      else toast(t('toast.undoOk', { label: item.label }));
    } catch (e) {
      // 失败一次不直接丢掉这步：多半是中途某个 id 变了，再试一次往往能补上；
      // 连试两次都失败才丢，免得坏记录卡住后面所有撤销
      item.fails = (item.fails || 0) + 1;
      if (item.fails < 2) history.push(item);
      toast(t('toast.undoFail', { msg: e.message }));
    } finally {
      undoBusy = false;
    }
    await reloadNow();
  }

  async function recreate(node, parentId, index) {
    const opts = { parentId: parentId, title: node.title || '' };
    if (index != null) {
      // 删除后兄弟数量会变，旧索引可能越界（create 对越界 index 不稳定），先夹一下
      let room = index;
      try { room = (await chrome.bookmarks.getChildren(parentId)).length; } catch (e) { room = index; }
      opts.index = Math.max(0, Math.min(Math.round(index), room));
    }
    if (node.url) { opts.url = node.url; return chrome.bookmarks.create(opts); }
    const folder = await chrome.bookmarks.create(opts);
    let i = 0;
    for (const child of node.children || []) {
      await recreate(child, folder.id, i);
      i += 1;
    }
    return folder;
  }

  async function folderSnapshot(parentId) {
    let order = [];
    try { order = (await chrome.bookmarks.getChildren(parentId)).map((k) => k.id); } catch (e) { order = []; }
    return { parentId: parentId, order: order, board: JSON.parse(JSON.stringify(state.coords[parentId] || {})) };
  }

  async function restoreSnapshot(snap) {
    let cur = [];
    try { cur = (await chrome.bookmarks.getChildren(snap.parentId)).map((k) => k.id); } catch (e) { cur = []; }
    // 快照里有、现在已不在本文件夹的项（被移进子文件夹或被删）不能参与排位，
    // 否则后面每项的目标位次都会错，最后一次 placeAt 还会越界。
    const alive = {};
    for (const id of cur) alive[id] = true;
    const inSnap = {};
    for (const id of snap.order) inSnap[id] = true;
    const want = snap.order.filter((id) => alive[id]);
    for (const id of cur) if (!inSnap[id]) want.push(id);
    const sim = cur.slice();
    for (let i = 0; i < want.length; i += 1) {
      if (sim[i] === want[i]) continue;
      const from = sim.indexOf(want[i]);
      if (from < 0) continue;
      try {
        await placeAt(want[i], snap.parentId, i);
      } catch (e) {
        undoSkip += 1;
        continue; // 单项失败不拖累整步撤销
      }
      sim.splice(from, 1);
      sim.splice(i, 0, want[i]);
    }
    state.coords[snap.parentId] = snap.board;
    saveCoords();
  }

  // 把一批条目按「原始索引」放回各自父级。索引是同一次快照里算的，
  // 乱序放回时靠后的索引会超过当时列表长度，所以必须先按索引升序。
  async function restoreOrigins(origins) {
    const list = origins.slice().sort((a, b) => {
      if (a.parentId !== b.parentId) return 0;
      return a.index - b.index;
    });
    for (const o of list) {
      try {
        await placeAt(o.id, o.parentId, Math.max(o.index, 0));
      } catch (e) {
        undoSkip += 1; /* 已被别处删掉或移走，跳过 */
      }
    }
  }

  // 布局类操作统一走这里：先拍快照，跑完确认真的变了才占用一次撤销位，
  // 免得「拖回原位」也留下一条按了什么都不动的撤销记录
  async function withLayoutUndo(parentId, fn) {
    const snap = await folderSnapshot(parentId);
    const before = snap.order.join(',');
    const boardBefore = JSON.stringify(snap.board);
    await fn();
    let after = before;
    try { after = (await chrome.bookmarks.getChildren(parentId)).map((k) => k.id).join(','); } catch (e) { after = before; }
    const boardAfter = JSON.stringify(state.coords[parentId] || {});
    if (after === before && boardAfter === boardBefore) return false;
    pushUndo(t('undo.layout'), () => restoreSnapshot(snap));
    return true;
  }

  /* ---------- 自由布局 ---------- */
  const PAD_X = 16;
  const PAD_Y = 10;
  let syncing = false;

  function cellSize() {
    const cs = getComputedStyle(document.documentElement);
    const w = parseFloat(cs.getPropertyValue('--tile-w')) || 96;
    const icon = parseFloat(cs.getPropertyValue('--icon')) || 64;
    return { w: w, h: icon + 46, gx: 6, gy: 8 };
  }

  const saveCoords = debounce(() => store.set('coords', state.coords), 400);

  function boardOf(parentId) {
    if (!state.coords[parentId]) state.coords[parentId] = {};
    return state.coords[parentId];
  }

  function columnsFor(container, size) {
    const width = container.clientWidth - PAD_X * 2;
    return Math.max(1, Math.floor((width + size.gx) / (size.w + size.gx)));
  }

  function applyFreeLayout(container, parentId) {
    if (state.layout !== 'free') return;
    const tiles = Array.from(container.children).filter((n) => n.classList.contains('tile'));
    if (!tiles.length) { container.style.height = ''; return; }
    const size = cellSize();
    const cols = columnsFor(container, size);
    const board = boardOf(parentId);
    const ids = tiles.map((t) => t.dataset.id);

    Object.keys(board).forEach((id) => { if (ids.indexOf(id) < 0) delete board[id]; });

    const taken = new Set();
    ids.forEach((id) => {
      const c = board[id];
      if (Array.isArray(c) && c.length === 2) taken.add(c[0] + ',' + c[1]);
      else delete board[id];
    });
    let cursor = 0;
    ids.forEach((id) => {
      if (board[id]) return;
      while (taken.has((cursor % cols) + ',' + Math.floor(cursor / cols))) cursor += 1;
      const col = cursor % cols;
      const row = Math.floor(cursor / cols);
      board[id] = [col, row];
      taken.add(col + ',' + row);
      cursor += 1;
    });

    let maxRow = 0;
    tiles.forEach((t) => {
      const cell = board[t.dataset.id] || [0, 0];
      t.style.left = (PAD_X + cell[0] * (size.w + size.gx)) + 'px';
      t.style.top = (PAD_Y + cell[1] * (size.h + size.gy)) + 'px';
      if (cell[1] > maxRow) maxRow = cell[1];
    });
    container.style.height = (PAD_Y * 2 + (maxRow + 1) * (size.h + size.gy)) + 'px';
    saveCoords();
  }

  // 只认图标方块之间的重叠：落在卡片四周的空白不算"压上去"，避免误建组
  function frameRect(el) {
    const f = el.querySelector('.frame');
    return (f || el).getBoundingClientRect();
  }

  function orderedIds(board) {
    return Object.keys(board).sort((a, b) => {
      const x = board[a];
      const y = board[b];
      return x[1] - y[1] || x[0] - y[0];
    });
  }

  function orderedCells(board) {
    return orderedIds(board).map((id) => board[id]);
  }

  // 视觉得出的顺序写回浏览器书签顺序
  async function applyVisualOrder(parentId) {
    if (!hasAPI) return;
    const board = state.coords[parentId];
    if (!board) return;
    const want = orderedIds(board);
    if (!want.length) return;
    let kids = [];
    try { kids = await chrome.bookmarks.getChildren(parentId); } catch (e) { return; }
    const current = kids.map((k) => k.id).filter((id) => board[id]);
    if (current.join() === want.join()) return;
    syncing = true;
    try {
      for (let i = 0; i < want.length; i += 1) {
        if (current[i] === want[i]) continue;
        await placeAt(want[i], parentId, i);
        const from = current.indexOf(want[i]);
        if (from >= 0) current.splice(from, 1);
        current.splice(i, 0, want[i]);
      }
    } catch (e) {
      toast(t('toast.orderFail', { msg: e.message }));
    } finally {
      syncing = false;
    }
  }

  // 书签顺序变化后，把同一批格子按新顺序重新分配（形状不变，内容跟随顺序）
  function remapCoords(parentId, kids) {
    const board = state.coords[parentId];
    if (!board) return false;
    const cells = orderedCells(board);
    if (!cells.length) return false;
    const ids = (kids || []).map((k) => k.id);
    const next = {};
    ids.forEach((id, i) => { if (cells[i]) next[id] = cells[i]; });
    const same = ids.every((id, i) => board[id] && cells[i] && board[id][0] === cells[i][0] && board[id][1] === cells[i][1]);
    state.coords[parentId] = next;
    if (!same) saveCoords();
    return !same;
  }

  function remapAll() {
    if (state.layout !== 'free') return;
    Object.keys(state.coords).forEach((pid) => {
      const node = findNode(pid, state.roots);
      if (node) remapCoords(pid, node.children || []);
    });
  }

  // 意图判定用位置分区，不再用停留计时：
  // 盖在图标上 = 建组，落在图标左边或右边 = 插入到那一侧。
  // 自由布局：被拖图标跟手，用它的方块与目标方块的重叠比例判定。
  // 网格模式：图标不跟手，用指针相对目标中心的偏移判定。
  const GROUP_OVERLAP = 0.62;   // 自由布局：水平/垂直重叠都超过它才算"盖住"
  const GROUP_ZONE_X = 0.45;    // 网格模式：指针在目标中心水平 ±45% 半宽内算建组
  const GROUP_ZONE_Y = 0.9;     // 网格模式：指针在图标方块垂直范围内（含 10% 余量）
  const NEAR_ZONE_X = 1.6;      // 网格模式：指针水平超出这个范围就不参与

  function intentAt(container, opts) {
    const pointer = opts.pointer || null;
    const excludeId = opts.excludeId || null;
    const dragBox = opts.dragEl ? frameRect(opts.dragEl) : null;
    let best = null;
    let bestScore = -1;

    Array.from(container.children).forEach((n) => {
      if (!n.classList.contains('tile')) return;
      if (n === opts.dragEl || n.dataset.id === excludeId) return;
      const b = frameRect(n);
      const cx = (b.left + b.right) / 2;
      const cy = (b.top + b.bottom) / 2;
      const halfW = Math.max(b.width / 2, 1);
      const halfH = Math.max(b.height / 2, 1);

      if (pointer) {
        const adx = Math.abs(pointer.x - cx) / halfW;
        const ady = Math.abs(pointer.y - cy) / halfH;
        if (adx > NEAR_ZONE_X || ady > 1.5) return;
        const score = 2 - adx - ady * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = { el: n, group: adx <= GROUP_ZONE_X && ady <= GROUP_ZONE_Y, side: pointer.x < cx ? 'left' : 'right' };
        }
        return;
      }

      if (!dragBox) return;
      const w = Math.min(dragBox.right - dragBox.left, b.width);
      const h = Math.min(dragBox.bottom - dragBox.top, b.height);
      if (w <= 0 || h <= 0) return;
      const ox = Math.min(dragBox.right, b.right) - Math.max(dragBox.left, b.left);
      const oy = Math.min(dragBox.bottom, b.bottom) - Math.max(dragBox.top, b.top);
      if (ox <= 0 || oy <= 0) return;
      const rx = ox / w;
      const ry = oy / h;
      if (ry < 0.3) return; // 不在同一行
      const score = Math.min(rx, ry);
      if (score > bestScore) {
        bestScore = score;
        const dcx = (dragBox.left + dragBox.right) / 2;
        best = { el: n, group: rx >= GROUP_OVERLAP && ry >= GROUP_OVERLAP, side: dcx < cx ? 'left' : 'right' };
      }
    });

    if (!best || bestScore < 0.2) return null;
    return { el: best.el, side: best.group ? 'group' : best.side };
  }

  function paintIntent(intent) {
    document.querySelectorAll('.tile.drop-left, .tile.drop-right, .tile.group-arm').forEach((n) => {
      n.classList.remove('drop-left', 'drop-right', 'group-arm');
    });
    if (!intent) return;
    if (intent.side === 'group') intent.el.classList.add('group-arm');
    else intent.el.classList.add(intent.side === 'left' ? 'drop-left' : 'drop-right');
  }

  function clearIntent() { paintIntent(null); }

  // 把一组条目和目标一起收进新建文件夹。ids 是被拖的项（可能多项），targetId 是覆盖到的那个
  async function groupItems(ids, targetId, parentId) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    const members = ids.filter((id) => id !== targetId);
    if (!members.length) return;
    const name = prompt(t('folder.groupPrompt'), t('folder.nameDefault'));
    if (name === null) { render(); return; }
    const title = name.trim() || t('folder.nameDefault');
    const order = [targetId].concat(members);
    const origins = [];
    for (const id of order) {
      try {
        const [node] = await chrome.bookmarks.get(id);
        const sibs = await chrome.bookmarks.getChildren(node.parentId);
        origins.push({ id: id, parentId: node.parentId, index: sibs.findIndex((k) => k.id === id) });
      } catch (e) { /* 已被别处删掉，跳过 */ }
    }
    if (origins.length < 2) { toast(t('toast.groupFail', { msg: 'items missing' })); return; }
    try {
      const folder = await chrome.bookmarks.create({ parentId: parentId, title: title });
      let i = 0;
      for (const o of origins) {
        await placeAt(o.id, folder.id, i);
        i += 1;
      }
      pushUndo(t('undo.group', { title: title }), async () => {
        await restoreOrigins(origins);
        // 还有项没搬出去就别删文件夹，否则 removeTree 会把它们一起带走
        let stuck = 0;
        for (const o of origins) {
          try {
            const [n] = await chrome.bookmarks.get(o.id);
            if (n && n.parentId === folder.id) stuck += 1;
          } catch (e) { /* 已被删掉，不算卡住 */ }
        }
        if (!stuck) await chrome.bookmarks.removeTree(folder.id);
      });
      toast(t('toast.moveInto', { title: title }));
      setTimeout(() => reloadNow(), 60);
    } catch (e) {
      toast(t('toast.groupFail', { msg: e.message }));
      render();
    }
  }

  // 插入位置一律以书签顺序为准。DOM 顺序可能还没跟上上一次 move（重渲染是异步的），
  // 拿 DOM 索引算插入点会在连续拖动时把条目送错方向。
  async function insertBeside(dragId, parentId, targetId, side) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    if (!dragId || !targetId || dragId === targetId) return;
    let kids = [];
    try { kids = await chrome.bookmarks.getChildren(parentId); } catch (e) { return; }
    // 先把源摘掉，得到「移除后」的数组，再算插入位置
    const without = kids.filter((k) => k.id !== dragId);
    const at = without.findIndex((k) => k.id === targetId);
    if (at < 0) return;
    const idx = at + (side === 'right' ? 1 : 0);
    const next = without.slice();
    next.splice(idx, 0, { id: dragId });
    if (next.length === kids.length && next.every((k, i) => k.id === kids[i].id)) return;
    await placeAt(dragId, parentId, idx);
    await reloadNow();
  }

  // 落点执行：鼠标拖放与触屏拖拽共用同一套语义
  async function applyDrop(drag, intent, parentId) {
    const group = drag.group && drag.group.length > 1 ? drag.group : null;

    if (intent && intent.side === 'group') {
      const ids = group || [drag.id];
      clearSelection();
      if (intent.el.classList.contains('folder')) await moveManyTo(ids, intent.el.dataset.id);
      else await groupItems(ids, intent.el.dataset.id, parentId);
      return;
    }

    // 一次拖动只记一条撤销：整组插入会连着调很多次 placeAt，逐条记会让 Ctrl+Z 要按十几次
    // 交给他来判断「真的变了没」，拖回原位不留空撤销
    if (!intent) {
      const ids = group || [drag.id];
      clearSelection();
      await withLayoutUndo(parentId, async () => {
        for (const id of ids) {
          try { await placeAt(id, parentId, -1); } catch (e) { /* 单项失败不中断整组 */ }
        }
        await reloadNow();
      });
      return;
    }
    if (group) {
      clearSelection();
      await withLayoutUndo(parentId, () => insertManyBeside(group, parentId, intent.el.dataset.id, intent.side));
      return;
    }
    await withLayoutUndo(parentId, () => insertBeside(drag.id, parentId, intent.el.dataset.id, intent.side));
  }

  // 整组移到另一个文件夹，一次撤销可回滚全部
  async function moveManyTo(ids, parentId) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    const origins = [];
    for (const id of ids) {
      try {
        const [node] = await chrome.bookmarks.get(id);
        const sibs = await chrome.bookmarks.getChildren(node.parentId);
        origins.push({ id: id, parentId: node.parentId, index: sibs.findIndex((k) => k.id === id) });
      } catch (e) { /* 已被别处删掉，跳过 */ }
    }
    if (!origins.length) return;
    let moved = 0;
    for (const o of origins) {
      try { await placeAt(o.id, parentId, -1); moved += 1; } catch (e) { /* 单个失败不中断整组 */ }
    }
    if (!moved) { render(); return; }
    pushUndo(t('undo.bulkMove', { n: origins.length }), () => restoreOrigins(origins));
    await reloadNow();
  }

  // 整组插入：多选后拖动，按当前顺序把一组条目放到目标的一侧
  async function insertManyBeside(ids, parentId, targetId, side) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    let kids = [];
    try { kids = await chrome.bookmarks.getChildren(parentId); } catch (e) { return; }
    const moving = kids.filter((k) => ids.indexOf(k.id) >= 0).map((k) => k.id);
    if (!moving.length) return;
    const withoutIds = kids.filter((k) => ids.indexOf(k.id) < 0).map((k) => k.id);
    const at = withoutIds.indexOf(targetId);
    if (at < 0) return;
    const idx = at + (side === 'right' ? 1 : 0);
    const desired = withoutIds.slice(0, idx).concat(moving, withoutIds.slice(idx));
    const before = kids.map((k) => k.id).join(',');
    let cur = kids.map((k) => k.id);
    for (let i = 0; i < desired.length; i += 1) {
      const id = desired[i];
      const pos = cur.indexOf(id);
      if (pos === i) continue;
      await placeAt(id, parentId, i);
      cur.splice(pos, 1);
      cur.splice(i, 0, id);
    }
    const after = (await chrome.bookmarks.getChildren(parentId)).map((k) => k.id).join(',');
    if (before !== after) await reloadNow();
  }

  async function finishDrag(tile, parentId, container, intent) {
    const sel = state.selection.has(tile.dataset.id) && state.selection.size > 1
      ? Array.from(state.selection)
      : null;

    if (intent && intent.side === 'group') {
      const ids = sel || [tile.dataset.id];
      clearSelection();
      if (intent.el.classList.contains('folder')) await moveManyTo(ids, intent.el.dataset.id);
      else await groupItems(ids, intent.el.dataset.id, parentId);
      return;
    }

    const snap = await folderSnapshot(parentId);
    const boardBefore = JSON.stringify(snap.board);
    if (intent) {
      if (sel) {
        clearSelection();
        await insertManyBeside(sel, parentId, intent.el.dataset.id, intent.side);
      } else {
        await insertBeside(tile.dataset.id, parentId, intent.el.dataset.id, intent.side);
      }
      if ((await chrome.bookmarks.getChildren(parentId)).map((k) => k.id).join(',') !== snap.order.join(',')) {
        pushUndo(t('undo.layout'), () => restoreSnapshot(snap));
      }
      return;
    }
    const size = cellSize();
    const board = boardOf(parentId);
    const cols = columnsFor(container, size);
    const id = tile.dataset.id;
    const left = parseFloat(tile.style.left) || PAD_X;
    const top = parseFloat(tile.style.top) || PAD_Y;
    let col = Math.round((left - PAD_X) / (size.w + size.gx));
    let row = Math.round((top - PAD_Y) / (size.h + size.gy));
    col = Math.min(Math.max(col, 0), cols - 1);
    row = Math.max(row, 0);
    const occupant = Object.keys(board).find((k) => k !== id && board[k][0] === col && board[k][1] === row);
    if (occupant) board[occupant] = (board[id] || [col, row]).slice();
    board[id] = [col, row];
    applyFreeLayout(container, parentId);
    // 等顺序真的写回书签再记撤销，否则快照里的顺序跟撤销时的现状对不上
    await applyVisualOrder(parentId);
    if (JSON.stringify(board) !== boardBefore) {
      pushUndo(t('undo.layout'), () => restoreSnapshot(snap));
    }
  }

  function enableFreeDrag(tile, parentId, container) {
    tile.draggable = false;
    tile.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = parseFloat(tile.style.left) || 0;
      const oy = parseFloat(tile.style.top) || 0;
      let moved = false;
      let intent = null;
      try { tile.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }

      const onMove = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
        moved = true;
        tile.classList.add('dragging');
        tile.style.left = (ox + dx) + 'px';
        tile.style.top = (oy + dy) + 'px';
        intent = intentAt(container, { dragEl: tile });
        paintIntent(intent);
      };

      const onUp = async () => {
        tile.removeEventListener('pointermove', onMove);
        tile.removeEventListener('pointerup', onUp);
        tile.classList.remove('dragging');
        clearIntent();
        if (!moved) return;
        tile.dataset.dragged = '1';
        await finishDrag(tile, parentId, container, intent);
      };

      tile.addEventListener('pointermove', onMove);
      tile.addEventListener('pointerup', onUp);
    }, true);

    tile.addEventListener('click', (e) => {
      if (tile.dataset.dragged) {
        e.preventDefault();
        e.stopPropagation();
        delete tile.dataset.dragged;
      }
    }, true);
  }

  /* ---------- 网格键盘导航 ---------- */
  function focusTile(el) {
    if (!el) return;
    Array.from(el.parentElement.children).forEach((n) => {
      if (n.classList && n.classList.contains('tile')) n.tabIndex = n === el ? 0 : -1;
    });
    el.focus();
  }

  function neighborOf(cur, all, key) {
    const box = (n) => (n.querySelector('.frame') || n).getBoundingClientRect();
    const r0 = box(cur);
    const cx = (r0.left + r0.right) / 2;
    const cy = (r0.top + r0.bottom) / 2;
    let best = null;
    let bestScore = Infinity;
    all.forEach((t) => {
      if (t === cur) return;
      const r = box(t);
      const dx = (r.left + r.right) / 2 - cx;
      const dy = (r.top + r.bottom) / 2 - cy;
      let ok = false;
      if (key === 'ArrowRight') ok = dx > 4 && Math.abs(dx) > Math.abs(dy) * 0.5;
      if (key === 'ArrowLeft') ok = dx < -4 && Math.abs(dx) > Math.abs(dy) * 0.5;
      if (key === 'ArrowDown') ok = dy > 4 && Math.abs(dy) > Math.abs(dx) * 0.5;
      if (key === 'ArrowUp') ok = dy < -4 && Math.abs(dy) > Math.abs(dx) * 0.5;
      if (!ok) return;
      const score = Math.abs(dx) + Math.abs(dy);
      if (score < bestScore) { bestScore = score; best = t; }
    });
    return best;
  }

  // 方向键在网格里移动焦点，Enter 打开文件夹，F2 改名，Delete 删除
  function initGridKeyboard(grid) {
    const tilesOf = () => Array.from(grid.children).filter((n) => n.classList.contains('tile'));
    const list = tilesOf();
    list.forEach((t, i) => { t.tabIndex = i === 0 ? 0 : -1; });

    grid.onkeydown = (e) => {
      const cur = e.target.closest && e.target.closest('.tile');
      if (!cur || !grid.contains(cur)) return;
      const all = tilesOf();
      const step = (el) => { e.preventDefault(); focusTile(el); };

      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
        if (e.shiftKey) {
          state.selection.add(cur.dataset.id);
          if (!state.selAnchor) state.selAnchor = cur.dataset.id;
          syncSelection();
        }
        const next = neighborOf(cur, all, e.key);
        if (next) step(next);
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        const next = e.key === 'Home' ? all[0] : all[all.length - 1];
        if (next) step(next);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const item = findNode(cur.dataset.id, state.roots);
        if (!item) return;
        if (item.url) return; // 链接交给 <a> 的默认行为
        e.preventDefault();
        openFolder(item);
        return;
      }
      if (e.key === 'F2') {
        const item = findNode(cur.dataset.id, state.roots);
        if (!item) return;
        e.preventDefault();
        openForm(item, { parentId: cur.dataset.parent });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const item = findNode(cur.dataset.id, state.roots);
        if (!item) return;
        e.preventDefault();
        deleteItem(item);
      }
    };
  }

  /* ---------- 首次安装引导 ---------- */
  function showIntro() {
    const box = $('intro');
    if (!box) return;
    box.hidden = false;
    $('introOk').focus();
  }

  function hideIntro() {
    $('intro').hidden = true;
    store.set('seenIntro', true);
  }

  /* ---------- 多选 ---------- */
  function tilesOf(container) {
    return Array.from(container.children).filter((n) => n.classList.contains('tile'));
  }

  function syncSelection() {
    document.querySelectorAll('.tile.selected').forEach((n) => n.classList.remove('selected'));
    state.selection.forEach((id) => {
      const node = document.querySelector('.tile[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (node) node.classList.add('selected');
    });
    updateBulk();
  }

  function updateBulk() {
    const box = $('bulk');
    if (!box) return;
    const n = state.selection.size;
    box.hidden = n === 0;
    if (n) $('bulkCount').textContent = t('bulk.selected', { n: n });
  }

  function clearSelection() {
    state.selection.clear();
    state.selAnchor = null;
    syncSelection();
  }

  // 选择模式：长按图标进入，图标右上角出现待选圆圈，此时点击是选择而不是打开
  function enterSelectMode(tile) {
    if (!state.selecting) {
      state.selecting = true;
      document.body.classList.add('selecting');
    }
    if (tile) {
      state.selection.add(tile.dataset.id);
      state.selAnchor = tile.dataset.id;
    }
    syncSelection();
  }

  function exitSelectMode() {
    state.selecting = false;
    document.body.classList.remove('selecting');
    clearSelection();
  }

  function toggleSelect(tile) {
    const id = tile.dataset.id;
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    state.selAnchor = id;
    syncSelection();
  }

  function selectRange(tile) {
    const list = tilesOf(tile.parentElement).map((n) => n.dataset.id);
    const to = list.indexOf(tile.dataset.id);
    const from = list.indexOf(state.selAnchor || tile.dataset.id);
    if (to < 0) return;
    if (from < 0) { state.selection.add(tile.dataset.id); syncSelection(); return; }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i += 1) state.selection.add(list[i]);
    syncSelection();
  }

  function bulkMoveMenu(anchor) {
    const ids = Array.from(state.selection);
    if (!ids.length) return;
    const here = state.activeId;
    const items = state.groups
      .filter((g) => g.id !== here && !g.virtual)
      .map((g) => ({
        label: g.title,
        onClick: async () => {
          clearSelection();
          await moveManyTo(ids, parentIdOf(g));
        }
      }));
    if (!items.length) { toast(t('toast.noOtherPage')); return; }
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.top - 12, items);
  }

  async function bulkDelete() {
    const ids = Array.from(state.selection);
    if (!ids.length) return;
    if (!confirm(t('bulk.deleteConfirm', { n: ids.length }))) return;
    const snaps = [];
    for (const id of ids) {
      try {
        const [node] = await chrome.bookmarks.getSubTree(id);
        if (node) snaps.push(node);
      } catch (e) { /* 已被别处删掉，跳过 */ }
    }
    for (const id of ids) await removeNode(id, true);
    if (snaps.length) {
      pushUndo(t('undo.bulkDelete', { n: snaps.length }), async () => {
        for (const node of snaps) await recreate(node, node.parentId, node.index);
      });
    }
    clearSelection();
    await reloadNow();
    toast(t('toast.bulkDeleted', { n: snaps.length }));
  }

  /* ---------- 触屏长按拖拽 ---------- */
  // 移动端与触摸屏笔记本上 HTML5 拖放不可用，用 touch 事件补一套：
  // 长按 380ms 进入拖拽，期间手指移动超过 12px 视为滚动，直接放弃。
  function enableTouchDrag(tile, item, ctx, container) {
    let timer = 0;
    let active = false;
    let ghost = null;
    let intent = null;
    let sx = 0;
    let sy = 0;
    let dragged = false;
    let moved = false;

    function cleanup() {
      clearTimeout(timer);
      timer = 0;
      active = false;
      tile.classList.remove('dragging');
      delete tile.dataset.count;
      if (ghost) { ghost.remove(); ghost = null; }
      clearIntent();
    }

    function placeGhost(x, y) {
      if (!ghost) return;
      ghost.style.left = (x - ghost.offsetWidth / 2) + 'px';
      ghost.style.top = (y - ghost.offsetHeight / 2) + 'px';
    }

    tile.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const tp = e.touches[0];
      sx = tp.clientX;
      sy = tp.clientY;
      timer = setTimeout(() => {
        active = true;
        dragged = true;
        moved = false;
        enterSelectMode(tile);
        const n = state.selection.size;
        tile.classList.add('dragging');
        if (n > 1 && state.selection.has(item.id)) tile.dataset.count = t('intro.dragCount', { n });
        ghost = tile.cloneNode(true);
        ghost.classList.add('touch-ghost');
        ghost.removeAttribute('data-count');
        document.body.appendChild(ghost);
        placeGhost(sx, sy);
        if (navigator.vibrate) navigator.vibrate(10);
      }, 380);
    }, { passive: true });

    tile.addEventListener('touchmove', (e) => {
      const tp = e.touches[0];
      if (!tp) return;
      if (!active) {
        if (Math.abs(tp.clientX - sx) + Math.abs(tp.clientY - sy) > 12) {
          clearTimeout(timer);
          timer = 0;
        }
        return;
      }
      e.preventDefault();
      if (Math.abs(tp.clientX - sx) + Math.abs(tp.clientY - sy) > 8) moved = true;
      placeGhost(tp.clientX, tp.clientY);
      intent = intentAt(container, { excludeId: item.id, pointer: { x: tp.clientX, y: tp.clientY } });
      paintIntent(intent);
    }, { passive: false });

    tile.addEventListener('touchend', async () => {
      if (!active) { clearTimeout(timer); return; }
      tile.dataset.suppressClick = '1';
      if (!moved) {
        // 只是长按，进入选择模式并选中它，不做任何移动
        cleanup();
        setTimeout(() => { dragged = false; }, 0);
        return;
      }
      const group = state.selection.size >= 1 && state.selection.has(item.id) ? Array.from(state.selection) : null;
      const drag = { id: item.id, parentId: ctx.parentId, isFolder: !item.url, group: group };
      const hit = intent;
      cleanup();
      await applyDrop(drag, hit, ctx.parentId);
      setTimeout(() => { dragged = false; }, 0);
    });

    tile.addEventListener('touchcancel', () => cleanup());

    tile.addEventListener('click', (e) => {
      if (!dragged) return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
    }, true);
  }

  function bindTouchDrag(grid, parentId) {
    if (state.layout === 'free') return;
    Array.from(grid.children).forEach((t) => {
      if (!t.classList.contains('tile')) return;
      const item = findNode(t.dataset.id, state.roots);
      if (item) enableTouchDrag(t, item, { parentId: parentId }, grid);
    });
  }

  /* ---------- 图标与文件夹 ---------- */
  function makeTile(item, ctx) {
    const isFolder = !item.url;
    const tile = document.createElement(isFolder ? 'div' : 'a');
    tile.className = 'tile' + (isFolder ? ' folder' : '');
    tile.dataset.id = item.id;
    tile.dataset.parent = ctx.parentId;
    tile.draggable = state.layout !== 'free';
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
    label.textContent = item.title || hostOf(item.url) || t('item.untitled');
    if (isFolder) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String((item.children || []).length);
      label.appendChild(n);
    }
    const check = document.createElement('span');
    check.className = 'check';
    check.setAttribute('aria-hidden', 'true');
    tile.append(frame, label, check);

    if (isFolder) tile.addEventListener('click', (e) => { e.preventDefault(); openFolder(item); });

    // 长按进入选择模式（触屏走 enableTouchDrag 里的分支）
    let holdTimer = 0;
    let holdX = 0;
    let holdY = 0;
    const cancelHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    };
    tile.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      delete tile.dataset.suppressClick;
      holdX = e.clientX;
      holdY = e.clientY;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        tile.dataset.suppressClick = '1';
        enterSelectMode(tile);
      }, 480);
    });
    tile.addEventListener('pointermove', (e) => {
      if (!holdTimer) return;
      if (Math.abs(e.clientX - holdX) + Math.abs(e.clientY - holdY) > 8) cancelHold();
    });
    tile.addEventListener('pointerup', cancelHold);
    tile.addEventListener('pointerleave', cancelHold);

    // 多选：Ctrl/Cmd 点击切换，Shift 点击范围选，普通点击清空后照常打开
    tile.addEventListener('click', (e) => {
      if (tile.dataset.suppressClick === '1') {
        delete tile.dataset.suppressClick;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (state.selecting) {
        e.preventDefault();
        e.stopPropagation();
        toggleSelect(tile);
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        selectRange(tile);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleSelect(tile);
        return;
      }
      if (state.selection.size) clearSelection();
    }, true);

    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, item, ctx);
    });

    tile.addEventListener('dragstart', (e) => {
      if (state.layout === 'free') { e.preventDefault(); return; }
      delete tile.dataset.suppressClick;
      const group = state.selection.size > 1 && state.selection.has(item.id)
        ? Array.from(state.selection)
        : null;
      state.drag = { id: item.id, parentId: ctx.parentId, isFolder, group };
      tile.classList.add('dragging');
      if (group) tile.dataset.count = t('intro.dragCount', { n: group.length });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });
    tile.addEventListener('dragend', () => {
      clearIntent();
      tile.classList.remove('dragging');
      delete tile.dataset.count;
      state.drag = null;
    });
    tile.addEventListener('dragover', (e) => {
      if (!state.drag || state.drag.id === item.id) return;
      e.preventDefault();
      paintIntent(intentAt(tile.parentElement, {
        excludeId: state.drag.id,
        pointer: { x: e.clientX, y: e.clientY }
      }));
    });
    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      const drag = state.drag;
      if (!drag || drag.id === item.id) return;
      const intent = intentAt(tile.parentElement, {
        excludeId: drag.id,
        pointer: { x: e.clientX, y: e.clientY }
      });
      clearIntent();
      state.drag = null;
      await applyDrop(drag, intent, ctx.parentId);
    });

    return tile;
  }

  function renderGrid() {
    const grid = $('grid');
    grid.textContent = '';
    grid.classList.toggle('free', state.layout === 'free');
    grid.ondragover = null;
    grid.ondrop = null;

    const group = currentGroup();
    if (!group) {
      grid.innerHTML = '<p class="empty">' + t('empty.root') + '</p>';
      return;
    }
    const kids = childrenOf(group);
    if (!kids.length) {
      grid.style.height = '';
      grid.innerHTML = '<p class="empty">' + t('empty.page') + '</p>';
      return;
    }
    const parentId = parentIdOf(group);
    kids.forEach((k) => grid.appendChild(makeTile(k, { parentId, groupId: group.id })));

    if (state.layout === 'free') {
      applyFreeLayout(grid, parentId);
      Array.from(grid.children).forEach((t) => { if (t.classList.contains('tile')) enableFreeDrag(t, parentId, grid); });
    } else {
      grid.style.height = '';
      bindTouchDrag(grid, parentId);
    }

    grid.ondragover = (e) => {
      if (!state.drag) return;
      e.preventDefault();
      if (e.target === grid) clearIntent();
    };
    grid.ondrop = async (e) => {
      if (!state.drag || e.target !== grid) return;
      e.preventDefault();
      clearIntent();
      // 多选时整组一起追加到末尾，别只搬被按住的那一个
      const drag = state.drag;
      const group = state.selection.has(drag.id) && state.selection.size > 1 ? Array.from(state.selection) : null;
      await applyDrop({ id: drag.id, group: group }, null, parentId);
    };

    initGridKeyboard(grid);
    syncSelection();
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
      b.textContent = node.title || t('item.untitled');
      b.addEventListener('click', () => closeFolder(i + 1));
      crumbs.appendChild(b);
    });

    const top = state.overlay[state.overlay.length - 1];
    const grid = $('subgrid');
    grid.textContent = '';
    const kids = top.children || [];
    if (!kids.length) {
      grid.innerHTML = '<p class="empty">' + t('empty.folder') + '</p>';
      return;
    }
    grid.classList.toggle('free', state.layout === 'free');
    kids.forEach((k) => grid.appendChild(makeTile(k, { parentId: top.id, groupId: state.activeId })));

    if (state.layout === 'free') {
      applyFreeLayout(grid, top.id);
      Array.from(grid.children).forEach((t) => { if (t.classList.contains('tile')) enableFreeDrag(t, top.id, grid); });
    } else {
      grid.style.height = '';
      bindTouchDrag(grid, top.id);
    }

    grid.ondragover = (e) => {
      if (!state.drag) return;
      e.preventDefault();
      if (e.target === grid) clearIntent();
    };
    grid.ondrop = async (e) => {
      if (!state.drag || e.target !== grid) return;
      e.preventDefault();
      clearIntent();
      // 同上：多选时整组搬进这个文件夹，撤销也按整组回滚
      const drag = state.drag;
      const ids = state.selection.has(drag.id) && state.selection.size > 1 ? Array.from(state.selection) : [drag.id];
      clearSelection();
      await moveManyTo(ids, top.id);
    };

    initGridKeyboard(grid);
    syncSelection();
  }

  /* ---------- 写操作 ---------- */
  // chrome.bookmarks.move 的 index 在同父级内是按「移除前」的位置解释的：
  // 目标索引大于源当前索引时，Chrome 内部会自己减一。这里统一用「源移除之后的插入位置」
  // 作为入参，内部转成 Chrome 要的形式，调用方不必再关心这个补偿。
  async function placeAt(id, parentId, afterIndex) {
    let kids = [];
    if (chrome.bookmarks.getChildren) {
      kids = await chrome.bookmarks.getChildren(parentId);
    } else {
      const [dest] = await chrome.bookmarks.getSubTree(parentId);
      kids = (dest && dest.children) || [];
    }
    const self = kids.findIndex((k) => k.id === id);
    // 目标列表的长度：条目本来就在这个父级时，它会被先摘掉，能插的位置少一个
    const room = self >= 0 ? kids.length - 1 : kids.length;
    let base = afterIndex == null || afterIndex < 0 ? room : Math.round(afterIndex);
    if (!isFinite(base)) base = room;
    // 撤销和批量放回用的都是「旧快照里的索引」，列表一旦比当时短就会越界，
    // Chrome 对越界 index 不是报错就是插错位置，统一夹到合法区间再交给它
    base = Math.max(0, Math.min(base, room));
    const index = self >= 0 && base >= self ? base + 1 : base;
    await chrome.bookmarks.move(id, { parentId: parentId, index: index });
    return index;
  }

  async function moveNode(id, parentId, index) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    if (id === parentId || isInside(id, parentId)) {
      toast(t('folder.cannotNest'));
      return;
    }
    let old = null;
    try {
      const [node] = await chrome.bookmarks.get(id);
      const sibs = await chrome.bookmarks.getChildren(node.parentId);
      old = { parentId: node.parentId, index: sibs.findIndex((k) => k.id === id) };
    } catch (e) { old = null; }
    try {
      await placeAt(id, parentId, typeof index === 'number' ? index : -1);
      if (old) {
        pushUndo(t('undo.move'), () => placeAt(id, old.parentId, Math.max(old.index, 0)));
      }
    } catch (e) {
      toast(t('toast.moveFail', { msg: e.message }));
    }
  }

  async function removeNode(id, quiet) {
    if (!hasAPI) { toast(t('toast.demoNoSave')); return; }
    let snap = null;
    try { const [node] = await chrome.bookmarks.getSubTree(id); snap = node; } catch (e) { snap = null; }
    await chrome.bookmarks.removeTree(id).catch(async () => { await chrome.bookmarks.remove(id); });
    if (snap && !quiet) {
      pushUndo(t('undo.delete', { title: snap.title || t('item.untitled') }), () => recreate(snap, snap.parentId, snap.index));
    }
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
    if (!syncing) remapAll();
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
        { label: t('menu.openNewTab'), onClick: () => window.open(item.url, '_blank', 'noopener') },
        { label: t('menu.openHere'), onClick: () => { location.href = item.url; } },
        { label: t('menu.copyUrl'), onClick: () => copyText(item.url) },
        { sep: true },
        { label: t('menu.edit'), onClick: () => openForm(item, ctx) },
        { label: t('menu.moveToPage'), submenu: targets, disabled: !targets.length },
        { sep: true },
        { label: t('menu.deleteBookmark'), danger: true, onClick: () => deleteItem(item) }
      ]);
      return;
    }

    const kids = (item.children || []).filter((c) => c.url);
    const targets = moveTargets(item, ctx);
    showMenu(x, y, [
      { label: t('menu.open'), onClick: () => openFolder(item) },
      { label: t('menu.openAll'), hint: kids.length ? String(kids.length) : '', disabled: !kids.length, onClick: () => openAll(kids) },
      { sep: true },
      { label: t('menu.renamePage'), onClick: () => openForm(item, ctx) },
      { label: t('menu.moveToPage'), submenu: targets, disabled: !targets.length },
      { sep: true },
      { label: t('menu.deleteFolder'), danger: true, onClick: () => deleteItem(item) }
    ]);
  }

  function resetLayout() {
    const id = defaultParentId();
    state.coords[id] = {};
    saveCoords();
    render();
    toast(t('toast.moved'));
  }

  function blankMenu(x, y) {
    showMenu(x, y, [
      { label: t('menu.search'), onClick: openPalette },
      { label: t('menu.undo'), hint: 'Ctrl+Z', onClick: undoLast },
      { sep: true },
      { label: t('menu.addBookmark'), onClick: () => openForm(null, { parentId: defaultParentId() }) },
      { label: t('menu.newFolder'), onClick: addFolder },
      { label: t('menu.newPage'), onClick: addPage },
      { sep: true },
      { label: t('menu.changeWallpaper'), onClick: () => { renderSwatches(); renderRootSeg(); $('drawer').hidden = false; } }
    ].concat(state.layout === 'free' ? [{ sep: true }, { label: t('menu.tidy'), onClick: resetLayout }] : []));
  }

  function deleteItem(item) {
    const label = item.title || t('item.untitled');
    if (!confirm(t('confirm.delete', { title: label }))) return;
    removeNode(item.id);
  }

  function openAll(nodes) {
    const urls = nodes.map((n) => n.url).filter(Boolean);
    if (!urls.length) { toast(t('toast.noLinks')); return; }
    if (urls.length > 12 && !confirm(t('confirm.openAll', { n: urls.length }))) return;
    urls.forEach((u) => {
      if (hasAPI && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: u, active: false });
      else window.open(u, '_blank', 'noopener');
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('menu.copyOk'));
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(t('menu.copyOk')); }
      catch (e2) { toast(t('menu.copyFail')); }
      ta.remove();
    }
  }

  function hideMenu() { $('menu').hidden = true; }

  /* ---------- 搜索源 ---------- */
  function allSources() {
    return [{ id: 'local', name: t('search.local') }].concat(ENGINES).concat(state.customs);
  }

  function currentSource() {
    return allSources().find((s) => s.id === state.engine) || ENGINES[0];
  }

  function renderEngine() {
    const src = currentSource();
    $('engineName').textContent = src.name;
    $('q').placeholder = state.engine === 'local' ? t('search.placeholderLocal') : t('search.placeholderEngine', { name: src.name });
  }

  function setEngine(id) {
    state.engine = id;
    store.set('engine', id);
    renderEngine();
    if (id === 'local') {
      if ($('q').value.trim()) openInlineFinder();
    } else {
      closeFinder();
    }
  }

  function sourceMenu() {
    const rect = $('engineBtn').getBoundingClientRect();
    const items = [{ label: t('search.local'), hint: state.engine === 'local' ? t('menu.current') : '', onClick: () => setEngine('local') }, { sep: true }];
    ENGINES.forEach((e) => items.push({ label: e.name, hint: state.engine === e.id ? t('menu.current') : '', onClick: () => setEngine(e.id) }));
    if (state.customs.length) {
      items.push({ sep: true });
      state.customs.forEach((e) => items.push({
        label: e.name,
        hint: state.engine === e.id ? t('menu.current') : '',
        submenu: [
          { label: t('menu.use'), onClick: () => setEngine(e.id) },
          { label: t('menu.delete'), danger: true, onClick: () => removeEngine(e.id) }
        ]
      }));
    }
    items.push({ sep: true });
    items.push({ label: t('menu.addEngine'), onClick: addEngineForm });
    showMenu(rect.left, rect.bottom + 6, items);
  }

  function removeEngine(id) {
    state.customs = state.customs.filter((e) => e.id !== id);
    store.set('customs', state.customs);
    if (state.engine === id) setEngine('google');
    else renderEngine();
  }

  function addEngineForm() {
    state.formMode = 'engine';
    $('formTitle').textContent = t('form.addEngine');
    $('fName').value = '';
    $('fUrl').value = '';
    $('fUrl').placeholder = 'https://example.com/search?q=%s';
    $('fUrl').parentElement.hidden = false;
    $('fErr').hidden = true;
    $('modal').hidden = false;
    $('fName').focus();
  }

  function runEngineSearch() {
    const q = $('q').value.trim();
    if (!q) return;
    recordSearch(q);
    const src = currentSource();
    if (!src.url) return;
    location.href = src.url.replace('%s', encodeURIComponent(q));
  }

  /* ---------- 统一搜索：标签与书签 ---------- */
  const finder = { items: [], index: 0, where: null, tabs: [], tabTotal: 0, seq: 0 };

  async function loadTabs() {
    if (hasAPI && chrome.tabs) {
      const raw = await chrome.tabs.query({});
      finder.tabTotal = raw.length;
      return raw
        .filter((t) => t.url && !t.url.startsWith('chrome-extension://') && t.url !== 'chrome://newtab/')
        .map((t) => ({ type: 'tab', id: t.id, title: t.title || t.url, url: t.url, windowId: t.windowId, active: !!t.active }));
    }
    const out = [];
    (function walk(nodes) {
      for (const n of nodes || []) {
        if (n.url && out.length < 12) out.push({ type: 'tab', id: out.length + 1, title: n.title || n.url, url: n.url, demo: true });
        if (n.children) walk(n.children);
      }
    })(window.MOCK_TREE ? window.MOCK_TREE.children : []);
    return out;
  }

  function bookmarkIndex() {
    const out = [];
    (function walk(nodes, path) {
      for (const n of nodes || []) {
        const here = n.url ? path : path.concat(n.title || t('item.untitled'));
        if (n.url) out.push({ type: 'book', id: n.id, title: n.title || hostOf(n.url), url: n.url, path: path.join(' / ') });
        if (n.children) walk(n.children, here);
      }
    })(state.roots, []);
    return out;
  }

  function match(item, key) {
    if (!key) return true;
    return (item.title + ' ' + item.url + ' ' + (item.path || '')).toLowerCase().indexOf(key) >= 0;
  }

  async function buildResults(query) {
    const key = query.trim().toLowerCase();
    const tabs = finder.tabs.filter((t) => match(t, key));
    const books = key ? bookmarkIndex().filter((b) => match(b, key)) : [];
    const hist = key ? [] : state.history.map((h) => ({
      type: 'history', id: 'h:' + h.ts, title: h.q, q: h.q, engine: h.engine, url: ''
    }));
    return hist.concat(tabs, books);
  }

  function recordSearch(text) {
    const q = (text || '').trim();
    if (!q) return;
    state.history = [{ q: q, engine: state.engine, ts: Date.now() }]
      .concat(state.history.filter((h) => !(h.q === q && h.engine === state.engine)))
      .slice(0, 20);
    store.set('history', state.history);
  }

  function engineName(id) {
    const hit = allSources().find((s) => s.id === id);
    return hit ? hit.name : t('search.local');
  }

  function clearHistory() {
    state.history = [];
    store.set('history', []);
    refreshFinder(finder.where === 'palette' ? $('pq').value : $('q').value);
  }

  async function refreshFinder(query) {
    const seq = ++finder.seq;
    finder.key = (query || '').trim().toLowerCase();
    const items = await buildResults(query);
    if (seq !== finder.seq) return;
    finder.items = items;
    if (finder.index >= finder.items.length) finder.index = Math.max(finder.items.length - 1, 0);
    paintFinder();
  }

  // 输入时先等 90ms，避免每敲一个字符就遍历一遍书签树
  const refreshFinderSoon = debounce((query) => { refreshFinder(query); }, 90);

  // 把命中片段包进 <mark>，长标题里能直接看出匹配在哪
  function highlightInto(el, text, key) {
    const src = text == null ? '' : String(text);
    if (!key) { el.textContent = src; return; }
    const lower = src.toLowerCase();
    let at = lower.indexOf(key);
    if (at < 0) { el.textContent = src; return; }
    let from = 0;
    while (at >= 0) {
      if (at > from) el.appendChild(document.createTextNode(src.slice(from, at)));
      const mark = document.createElement('mark');
      mark.textContent = src.slice(at, at + key.length);
      el.appendChild(mark);
      from = at + key.length;
      at = lower.indexOf(key, from);
    }
    if (from < src.length) el.appendChild(document.createTextNode(src.slice(from)));
  }

  function finderHost() {
    return finder.where === 'palette' ? $('plist') : $('flist');
  }

  function paintFinder() {
    const host = finderHost();
    if (!host) return;
    host.textContent = '';

    const hist = finder.items.filter((i) => i.type === 'history');
    const tabs = finder.items.filter((i) => i.type === 'tab');
    const books = finder.items.filter((i) => i.type === 'book');
    let i = 0;

    const group = (label, list, withClear) => {
      if (!list.length) return;
      const head = document.createElement('div');
      head.className = 'fgroup';
      const txt = document.createElement('span');
      txt.textContent = label + ' · ' + list.length;
      head.appendChild(txt);
      if (withClear) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'fclear';
        clear.textContent = t('search.clear');
        clear.addEventListener('mousedown', (e) => e.preventDefault());
        clear.addEventListener('click', (e) => { e.stopPropagation(); clearHistory(); });
        head.appendChild(clear);
      }
      host.appendChild(head);
      list.forEach((item) => {
        host.appendChild(finderRow(item, i));
        i += 1;
      });
    };

    if (hasAPI && !tabs.length && finder.tabTotal > 0) {
      const note = document.createElement('div');
      note.className = 'pnote';
      note.textContent = t('search.permissionNote', { n: finder.tabTotal });
      note.addEventListener('click', async () => {
        finder.tabs = await loadTabs();
        refreshFinder(finder.where === 'palette' ? $('pq').value : $('q').value);
      });
      host.appendChild(note);
    }

    if (!finder.items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('search.empty');
      host.appendChild(p);
    } else {
      group(t('search.recent'), hist, true);
      group(t('search.tabs'), tabs, false);
      group(t('search.books'), books, false);
    }

    const count = finder.where === 'palette' ? $('pcount') : $('fcount');
    if (count) count.textContent = t('search.count', { n: finder.items.length });
  }

  function finderRow(item, index) {
    const row = document.createElement('div');
    row.className = 'prow' + (index === finder.index ? ' on' : '');
    const icon = document.createElement('span');
    icon.className = 'picon';
    if (item.type === 'history') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.innerHTML = '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
      icon.style.color = 'var(--text-dim)';
      icon.appendChild(svg);
    } else {
      icon.appendChild(makeIcon(item.url, item.title, 32));
    }
    const main = document.createElement('span');
    main.className = 'pmain';
    const title = document.createElement('span');
    title.className = 'ptitle';
    highlightInto(title, item.title, finder.key);
    const sub = document.createElement('span');
    sub.className = 'purl';
    if (item.type === 'history') sub.textContent = t('search.usedWith', { name: engineName(item.engine) });
    else if (item.type === 'tab') sub.textContent = hostOf(item.url) + (item.active ? ' · ' + t('search.currentTab') : '');
    else sub.textContent = item.path || hostOf(item.url);
    main.append(title, sub);
    row.append(icon, main);
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('click', () => activateItem(item));
    row.addEventListener('mousemove', () => {
      if (finder.index !== index) { finder.index = index; markFinder(); }
    });
    return row;
  }

  function markFinder() {
    const host = finderHost();
    if (!host) return;
    Array.from(host.querySelectorAll('.prow')).forEach((n, i) => n.classList.toggle('on', i === finder.index));
  }

  function activateItem(item) {
    if (item.type === 'history') {
      closeFinder();
      $('q').value = item.q;
      if (item.engine && item.engine !== state.engine) setEngine(item.engine);
      if (state.engine === 'local') openInlineFinder();
      else runEngineSearch();
      return;
    }
    if (state.engine === 'local') recordSearch($('q').value);
    closeFinder();
    if (item.type === 'tab') {
      if (!hasAPI || item.demo) { toast(t('toast.demoNoTab')); return; }
      chrome.tabs.update(item.id, { active: true })
        .then(() => { if (item.windowId != null && chrome.windows) chrome.windows.update(item.windowId, { focused: true }); })
        .catch((e) => toast(t('toast.switchFail', { msg: e.message })));
      return;
    }
    location.href = item.url;
  }

  async function openInlineFinder() {
    const already = finder.where === 'inline' && !$('finder').hidden;
    closePalette();
    finder.where = 'inline';
    if (!already) {
      finder.index = 0;
      finder.tabs = await loadTabs();
    }
    $('finder').hidden = false;
    await refreshFinder($('q').value);
  }

  async function openPalette() {
    finder.where = 'palette';
    finder.index = 0;
    $('pq').value = '';
    finder.tabs = await loadTabs();
    $('palette').hidden = false;
    $('pq').focus();
    await refreshFinder('');
  }

  function closePalette() {
    $('palette').hidden = true;
    if (finder.where === 'palette') finder.where = null;
  }

  function closeFinder() {
    $('finder').hidden = true;
    closePalette();
    finder.where = null;
  }

  function moveFinder(delta) {
    if (!finder.items.length) return;
    finder.index = Math.min(Math.max(finder.index + delta, 0), finder.items.length - 1);
    markFinder();
    const host = finderHost();
    const on = host && host.querySelector('.prow.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function finderKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFinder(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFinder(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = finder.items[finder.index];
      if (item) activateItem(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (finder.where === 'palette') closePalette();
      else { $('q').value = ''; closeFinder(); }
    }
  }

  /* ---------- 表单 ---------- */
  function openForm(item, ctx) {
    state.formMode = 'bookmark';
    state.editing = { item, ctx };
    const isEdit = !!item;
    $('formTitle').textContent = isEdit ? (item.url ? t('form.editBookmark') : t('folder.rename')) : t('menu.addBookmark');
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

    if (state.formMode === 'engine') {
      if (!name) { err.textContent = t('form.errName'); err.hidden = false; return; }
      if (!url || url.indexOf('%s') < 0) { err.textContent = t('form.errEngineTpl'); err.hidden = false; return; }
      if (!/^https?:\/\//i.test(url)) { err.textContent = t('form.errUrlHttp'); err.hidden = false; return; }
      const id = 'c' + Date.now();
      state.customs.push({ id: id, name: name, url: url });
      store.set('customs', state.customs);
      $('modal').hidden = true;
      state.formMode = 'bookmark';
      setEngine(id);
      toast(t('toast.engineAdded'));
      return;
    }

    if (!name) { err.textContent = t('form.errName'); err.hidden = false; return; }
    if (!editing || !editing.item || editing.item.url) {
      if (!url) { err.textContent = t('form.errUrl'); err.hidden = false; return; }
      if (!/^(https?|ftp|file|chrome|edge|about):/i.test(url) && !/^[\w.-]+\.[a-z]{2,}/i.test(url)) {
        err.textContent = t('form.errUrlFormat');
        err.hidden = false;
        return;
      }
    }
    const finalUrl = url && !/^[a-z]+:/i.test(url) ? 'https://' + url : url;

    if (!hasAPI) { toast(t('toast.demoNoSave')); $('modal').hidden = true; return; }

    try {
      if (editing && editing.item) {
        const patch = { title: name };
        if (editing.item.url) patch.url = finalUrl;
        const oldTitle = editing.item.title || '';
        const oldUrl = editing.item.url || '';
        await chrome.bookmarks.update(editing.item.id, patch);
        pushUndo(t('undo.editBookmark', { title: oldTitle || t('item.untitled') }), () => {
          const back = { title: oldTitle };
          if (oldUrl) back.url = oldUrl;
          return chrome.bookmarks.update(editing.item.id, back);
        });
      } else {
        const parentId = (editing && editing.ctx && editing.ctx.parentId) || defaultParentId();
        const created = await chrome.bookmarks.create({ parentId, title: name, url: finalUrl });
        if (created && created.id) pushUndo(t('undo.newBookmark', { title: name }), () => chrome.bookmarks.remove(created.id));
      }
      $('modal').hidden = true;
    } catch (ex) {
      err.textContent = t('toast.saveFail', { msg: ex.message });
      err.hidden = false;
    }
  }

  function defaultParentId() {
    if (state.overlay.length) return state.overlay[state.overlay.length - 1].id;
    const g = currentGroup();
    return g ? parentIdOf(g) : (rootNode() ? rootNode().id : '1');
  }

  /* ---------- 外观 ---------- */
  // 壁纸统一压到最长边 1920、JPEG 0.85。原始 6MB 的截图通常落到 200 到 500KB，
  // 避开 chrome.storage.local 的 10MB 配额（壁纸以 data URL 形式存进去）。
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 1920;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(t('toast.imageUnreadable')));
      };
      img.src = url;
    });
  }

  function applyAccent() {
    const hex = /^#[0-9a-f]{6}$/i.test(state.accent || '') ? state.accent : '#3d6cf0';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const st = document.documentElement.style;
    st.setProperty('--accent', hex);
    st.setProperty('--accent-strong', 'rgb(' + [r, g, b].map((v) => Math.round(v * 0.88)).join(',') + ')');
    st.setProperty('--accent-soft', 'rgba(' + [r, g, b].join(',') + ',0.14)');
  }

  function applyTheme() {
    if (state.theme === 'light' || state.theme === 'dark') {
      document.documentElement.dataset.theme = state.theme;
      return;
    }
    if (state.image) detectTheme(state.image);
    else document.documentElement.dataset.theme = (WALLS[state.wall] || WALLS.a).theme;
  }

  function applyWall() {
    const wall = $('wall');
    if (state.image) {
      wall.style.backgroundImage = 'url("' + state.image + '")';
    } else {
      wall.style.backgroundImage = (WALLS[state.wall] || WALLS.a).css;
    }
    applyTheme();
    applyAccent();
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
      b.title = t('settings.wallpaper');
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

  const ACCENTS = ['#3d6cf0', '#e0592a', '#1f8a70', '#9b5de5', '#d64545', '#c08a1e'];

  function renderAccents() {
    const box = $('accentRow');
    box.textContent = '';
    ACCENTS.forEach((hex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = hex;
      b.title = hex;
      b.setAttribute('aria-pressed', String(state.accent.toLowerCase() === hex.toLowerCase()));
      b.addEventListener('click', () => {
        state.accent = hex;
        store.set('accent', hex);
        applyAccent();
        renderAccents();
      });
      box.appendChild(b);
    });
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = /^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : '#3d6cf0';
    picker.title = t('settings.custom');
    picker.addEventListener('input', (e) => {
      state.accent = e.target.value;
      store.set('accent', state.accent);
      applyAccent();
      Array.from($('accentRow').querySelectorAll('button')).forEach((n) => n.setAttribute('aria-pressed', 'false'));
    });
    box.appendChild(picker);
  }

  function renderRootSeg() {
    const box = $('rootSeg');
    box.textContent = '';
    state.roots.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.title || (t('settings.rootPrefix') + ' ' + (i + 1));
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
  function paintSeg(id, attr, value) {
    Array.from($(id).children).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
  }

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
    s.textContent = t('clock.date', { m: d.getMonth() + 1, d: d.getDate(), w: t('clock.weekdays').split(',')[d.getDay()] });
    el.appendChild(s);
  }

  /* ---------- 事件 ---------- */
  function wire() {
    $('q').addEventListener('focus', () => {
      if (state.engine === 'local') openInlineFinder();
    });
    $('q').addEventListener('input', () => {
      if (state.engine !== 'local') { closeFinder(); return; }
      if (finder.where !== 'inline' || $('finder').hidden) { openInlineFinder(); return; }
      finder.index = 0;
      refreshFinderSoon($('q').value);
    });
    $('q').addEventListener('keydown', (e) => {
      if (state.engine === 'local') { finderKey(e); return; }
      if (e.key === 'Enter') { e.preventDefault(); runEngineSearch(); }
      else if (e.key === 'Escape') { e.preventDefault(); $('q').value = ''; }
    });
    $('engineBtn').addEventListener('click', (e) => { e.stopPropagation(); sourceMenu(); });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'r' && hasAPI) {
        e.preventDefault();
        chrome.runtime.reload();
        return;
      }
      const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        undoLast();
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
        else if (!$('finder').hidden) closeFinder();
        else if (!$('modal').hidden) $('modal').hidden = true;
        else if (!$('drawer').hidden) $('drawer').hidden = true;
        else if (state.selecting || state.selection.size) exitSelectMode();
        else if (state.overlay.length) closeFolder(state.overlay.length - 1);
      }
    });

    $('introOk').addEventListener('click', hideIntro);
    $('intro').addEventListener('click', (e) => { if (e.target === $('intro')) hideIntro(); });

    $('bulkMove').addEventListener('click', (e) => bulkMoveMenu(e.currentTarget));
    $('bulkDelete').addEventListener('click', bulkDelete);
    $('bulkClear').addEventListener('click', exitSelectMode);

    $('pq').addEventListener('input', (e) => {
      finder.index = 0;
      refreshFinderSoon(e.target.value);
    });
    $('pq').addEventListener('keydown', finderKey);
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
    $('gearBtn').addEventListener('click', () => {
      renderSwatches();
      renderAccents();
      renderRootSeg();
      $('drawer').hidden = false;
    });
    $('closeDrawer').addEventListener('click', () => { $('drawer').hidden = true; });
    $('closeOverlay').addEventListener('click', () => closeFolder(0));
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeFolder(0); });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
    $('fCancel').addEventListener('click', () => { $('modal').hidden = true; });
    $('form').addEventListener('submit', submitForm);
    document.addEventListener('click', (e) => {
      if (!$('menu').hidden && !$('menu').contains(e.target)) hideMenu();
      if (!$('finder').hidden && !e.target.closest('.search-wrap')) {
        $('finder').hidden = true;
        if (finder.where === 'inline') finder.where = null;
      }
      // 点空白处退出多选，不然选完没有明显的撤销动作
      if (state.selecting && !e.target.closest('.tile, .bulk, .page, .rail, .fab, .top, .menu, .drawer, .modal, .palette, .overlay')) {
        exitSelectMode();
      }
    });
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tile, .page, .menu, .drawer, .modal, .fab, .top, .sheet-head')) return;
      e.preventDefault();
      blankMenu(e.clientX, e.clientY);
    });

    $('pickImage').addEventListener('click', () => $('fileImage').click());
    $('fileImage').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast(t('toast.wallBadType')); return; }
      if (file.size > 12 * 1024 * 1024) { toast(t('toast.wallTooLarge')); return; }
      try {
        const data = await compressImage(file);
        const ok = await store.set('image', data);
        if (!ok) { toast(t('toast.wallTooBig')); return; }
        state.image = data;
        applyWall();
        renderSwatches();
        toast(t('toast.wallOk'));
      } catch (err) {
        toast(t('toast.wallFail', { msg: (err && err.message) || t('toast.imageUnreadable') }));
      }
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

    $('themeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-theme]');
      if (!b) return;
      state.theme = b.dataset.theme;
      store.set('theme', state.theme);
      paintSeg('themeSeg', 'theme', state.theme);
      applyTheme();
    });

    $('layoutSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-layout]');
      if (!b) return;
      state.layout = b.dataset.layout;
      store.set('layout', state.layout);
      paintSeg('layoutSeg', 'layout', state.layout);
      closeFolder(0);
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
    const prefs = await store.getAll({
      wall: 'a',
      image: null,
      size: 'm',
      rootIdx: 0,
      showEmpty: true,
      railCollapsed: false,
      engine: 'google',
      customs: [],
      layout: 'grid',
      coords: {},
      theme: 'auto',
      accent: '#3d6cf0',
      history: [],
      seenIntro: false
    });
    state.wall = prefs.wall || 'a';
    state.image = prefs.image || null;
    state.size = prefs.size || 'm';
    state.rootIdx = Number(prefs.rootIdx) || 0;
    state.showEmpty = prefs.showEmpty !== false;
    state.railCollapsed = prefs.railCollapsed === true;
    state.engine = prefs.engine || 'google';
    state.customs = Array.isArray(prefs.customs) ? prefs.customs : [];
    state.layout = prefs.layout === 'free' ? 'free' : 'grid';
    state.coords = prefs.coords && typeof prefs.coords === 'object' ? prefs.coords : {};
    state.theme = ['light', 'dark', 'auto'].indexOf(prefs.theme) >= 0 ? prefs.theme : 'auto';
    state.accent = /^#[0-9a-f]{6}$/i.test(prefs.accent || '') ? prefs.accent : '#3d6cf0';
    state.history = Array.isArray(prefs.history) ? prefs.history : [];
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
    if (params.get('engine')) setEngine(params.get('engine'));
    if (params.get('layout') === 'free') { state.layout = 'free'; paintSeg('layoutSeg', 'layout', 'free'); }
    if (['light', 'dark', 'auto'].indexOf(params.get('theme')) >= 0) {
      state.theme = params.get('theme');
      paintSeg('themeSeg', 'theme', state.theme);
    }
    if (/^#[0-9a-f]{6}$/i.test(params.get('accent') || '')) {
      state.accent = params.get('accent');
      applyAccent();
    }
    if (params.get('intro') === '1') showIntro();
    if (params.get('settings')) {
      renderSwatches();
      renderAccents();
      renderRootSeg();
      $('drawer').hidden = false;
    }
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
    renderEngine();
    paintSeg('layoutSeg', 'layout', state.layout);
    paintSeg('themeSeg', 'theme', state.theme);
    render();
    wire();
    Array.from($('sizeSeg').children).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.size === state.size)));
    tick();
    setInterval(tick, 20000);
  }

  window.__bd = { moveNode: moveNode, placeAt: placeAt, insertBeside: insertBeside, insertManyBeside: insertManyBeside, applyDrop: applyDrop, moveManyTo: moveManyTo, intentAt: intentAt, state: state };

  // 把能力交给插件内核，再启动插件。
  // 目前 i18n 是第一个插件，其余功能仍在这个文件里，后续可以按同样方式逐个搬出去。
  if (window.Deck) {
    Object.assign(window.Deck.host, {
      state: state,
      t: t,
      toast: toast,
      store: store,
      reload: reloadNow,
      render: render,
      findNode: (id) => findNode(id, state.roots),
      openFolder: openFolder,
      showMenu: showMenu
    });
    window.Deck.register({ id: 'core-ui' });
    window.Deck.start();
  }

  boot();
})();
