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
    tree: null,
    roots: [],
    rootIdx: 0,
    groups: [],
    activeId: null,
    query: '',
    size: 'm',
    showEmpty: false,
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
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
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
    const root = state.roots[state.rootIdx];
    if (!root) { state.groups = []; return; }
    const kids = root.children || [];
    const loose = kids.filter((c) => c.url);
    const groups = [];
    if (loose.length) groups.push({ id: root.id, title: '未分组', virtual: true, node: root });
    kids.filter((c) => !c.url).forEach((f) => {
      groups.push({ id: f.id, title: f.title || hostOf(f.url), virtual: false, node: f });
    });
    state.groups = groups;
    if (!groups.some((g) => g.id === state.activeId) || state.groups.every((g) => g.id !== state.activeId)) {
      const firstFolder = groups.find((g) => !g.virtual && (g.node.children || []).some((c) => c.url || (c.children || []).length));
      const firstAny = groups.find((g) => (g.node.children || []).length);
      state.activeId = (firstFolder || firstAny || groups[0] || {}).id || null;
    }
  }

  function currentGroup() {
    return state.groups.find((g) => g.id === state.activeId) || null;
  }

  function childrenOf(group) {
    if (!group) return [];
    const node = group.node;
    const kids = node.children || [];
    return group.virtual ? kids.filter((c) => c.url) : kids;
  }

  /* ---------- 渲染 ---------- */
  function visibleGroups() {
    if (state.showEmpty) return state.groups;
    const filled = state.groups.filter((g) => childrenOf(g).length);
    return filled.length ? filled : state.groups;
  }

  function renderTabs() {
    const box = $('tabs');
    box.textContent = '';
    visibleGroups().forEach((g) => {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.type = 'button';
      btn.dataset.gid = g.id;
      btn.setAttribute('aria-selected', String(g.id === state.activeId));
      btn.textContent = g.title;
      const n = childrenOf(g).length;
      if (!n) btn.classList.add('empty');
      if (n) {
        const s = document.createElement('span');
        s.className = 'n';
        s.textContent = String(n);
        btn.appendChild(s);
      }
      btn.addEventListener('click', () => {
        state.activeId = g.id;
        state.query = '';
        $('q').value = '';
        render();
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
        const targetParent = g.virtual ? g.node.id : g.id;
        if (drag.id === targetParent) return;
        await moveNode(drag.id, targetParent, -1);
      });
      box.appendChild(btn);
    });
  }

  function makeTile(item, ctx) {
    const isFolder = !item.url;
    const tile = document.createElement(isFolder ? 'div' : 'a');
    tile.className = 'tile' + (isFolder ? ' folder' : '');
    tile.dataset.id = item.id;
    tile.dataset.parent = ctx.parentId;
    tile.draggable = true;
    tile.title = isFolder ? item.title : item.url;

    if (!isFolder) {
      tile.href = item.url;
      tile.rel = 'noopener';
    }

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
      const badge = document.createElement('span');
      badge.className = 'count';
      badge.textContent = String((item.children || []).length);
      tile.appendChild(badge);
    } else {
      frame.appendChild(makeIcon(item.url, item.title, 64));
    }

    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = item.title || hostOf(item.url) || '未命名';
    tile.append(frame, label);

    if (isFolder) {
      tile.addEventListener('click', (e) => { e.preventDefault(); openFolder(item); });
    }

    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, item, ctx);
    });

    tile.addEventListener('dragstart', (e) => {
      state.drag = { id: item.id, parentId: ctx.parentId, isFolder };
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
      if (isFolder && drag.id !== item.id) { await moveNode(drag.id, item.id, -1); return; }
      const siblings = Array.from(tile.parentElement.children).filter((n) => n.classList.contains('tile'));
      const idx = siblings.indexOf(tile);
      await moveNode(drag.id, ctx.parentId, idx < 0 ? -1 : idx);
    });

    return tile;
  }

  function renderGrid() {
    const grid = $('grid');
    grid.textContent = '';

    if (state.query) {
      renderSearch(grid);
      return;
    }

    const group = currentGroup();
    if (!group) {
      grid.innerHTML = '<p class="empty">这个书签根目录是空的，点右下角加号新增一个。</p>';
      return;
    }
    const kids = childrenOf(group);
    if (!kids.length) {
      grid.innerHTML = '<p class="empty">这个分组还没有书签，点右下角加号新增。</p>';
      return;
    }
    const parentId = group.virtual ? group.node.id : group.id;
    kids.forEach((k) => grid.appendChild(makeTile(k, { parentId, groupId: group.id })));

    grid.ondragover = (e) => { if (state.drag) e.preventDefault(); };
    grid.ondrop = async (e) => {
      if (!state.drag) return;
      if (e.target !== grid) return;
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
      const tile = makeTile(item, { parentId: group.virtual ? group.node.id : group.id, groupId: group.id });
      const tag = document.createElement('span');
      tag.className = 'count';
      tag.textContent = group.title;
      tile.appendChild(tag);
      grid.appendChild(tile);
    });
  }

  function render() {
    renderTabs();
    renderGrid();
  }

  /* ---------- 文件夹弹层 ---------- */
  function openFolder(folder) {
    if (!state.overlay.length) state.overlay = [folder];
    else state.overlay.push(folder);
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
  }

  /* ---------- 写操作 ---------- */
  async function moveNode(id, parentId, index) {
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    try {
      await chrome.bookmarks.move(id, { parentId, index });
    } catch (e) {
      toast('移动失败：' + e.message);
    }
  }

  async function removeNode(id) {
    if (!hasAPI) { toast('演示模式不能保存'); return; }
    await chrome.bookmarks.removeTree(id).catch(async () => { await chrome.bookmarks.remove(id); });
  }

  const reload = debounce(async () => {
    await loadTree();
    if (state.overlay.length) {
      state.overlay = [];
      $('overlay').hidden = true;
    }
    render();
  }, 120);

  /* ---------- 右键菜单 ---------- */
  function openMenu(x, y, item, ctx) {
    const menu = $('menu');
    menu.textContent = '';
    const add = (label, fn, danger) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (danger) b.className = 'danger';
      b.addEventListener('click', () => { hideMenu(); fn(); });
      menu.appendChild(b);
    };
    const sep = () => menu.appendChild(document.createElement('hr'));

    if (item.url) {
      add('新标签页打开', () => window.open(item.url, '_blank', 'noopener'));
      sep();
    }
    add('编辑', () => openForm(item, ctx));
    add(item.url ? '删除书签' : '删除文件夹', async () => {
      if (!confirm('确定删除「' + (item.title || '未命名') + '」？此操作会同步删除浏览器书签。')) return;
      await removeNode(item.id);
    }, true);

    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
  }

  function hideMenu() { $('menu').hidden = true; }

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
        const parentId = editing && editing.ctx ? editing.ctx.parentId : defaultParentId();
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
    if (!g) return state.roots[state.rootIdx].id;
    return g.virtual ? g.node.id : g.id;
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
        const avg = sum / (d.length / 4);
        document.documentElement.dataset.theme = avg < 128 ? 'dark' : 'light';
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

  function toast(msg) { window.alert(msg); }

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('q').focus();
        $('q').select();
      }
      if (e.key === 'Escape') {
        hideMenu();
        if (!$('modal').hidden) $('modal').hidden = true;
        else if (!$('drawer').hidden) $('drawer').hidden = true;
        else if (state.overlay.length) closeFolder(state.overlay.length - 1);
      }
    });

    $('addBtn').addEventListener('click', () => openForm(null, { parentId: defaultParentId() }));
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
    const [wall, image, size, rootIdx] = await Promise.all([
      store.get('wall', 'a'),
      store.get('image', null),
      store.get('size', 'm'),
      store.get('rootIdx', 0)
    ]);
    state.wall = wall || 'a';
    state.image = image || null;
    state.size = size || 'm';
    state.rootIdx = Number(rootIdx) || 0;
    state.showEmpty = !!(await store.get('showEmpty', false));
    $('showEmpty').checked = state.showEmpty;

    await loadTree();
    const wanted = new URLSearchParams(location.search).get('g');
    if (wanted && state.groups.some((g) => g.id === wanted || g.title === wanted)) {
      const hit = state.groups.find((g) => g.id === wanted || g.title === wanted);
      state.activeId = hit.id;
    }
    applyWall();
    renderSwatches();
    renderRootSeg();
    render();
    wire();
    tick();
    setInterval(tick, 1000 * 20);

    if (!hasAPI) document.body.dataset.demo = '1';
  }

  boot();
})();
