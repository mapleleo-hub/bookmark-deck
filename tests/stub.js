/*
 * 测试桩：按真实 Chrome 的行为模拟 chrome.bookmarks / chrome.storage。
 *
 * 关键点是 move 的索引语义：同父级内、目标索引大于源当前索引时，
 * Chrome 会自己减一。桩里必须复刻这一点，否则测出来的结果全是假绿。
 */
(function () {
  const tree = window.MOCK_TREE;
  const log = [];
  let seq = 0;

  function find(id, nodes) {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const hit = find(id, n.children);
      if (hit) return hit;
    }
    return null;
  }

  function parentOf(id) {
    let hit = null;
    (function walk(nodes) {
      for (const n of nodes || []) {
        if ((n.children || []).some((c) => c.id === id)) { hit = n.id; return; }
        walk(n.children || []);
        if (hit) return;
      }
    })([tree]);
    return hit;
  }

  function detach(id) {
    return (function walk(nodes) {
      for (let i = 0; i < (nodes || []).length; i += 1) {
        if (nodes[i].id === id) return nodes.splice(i, 1)[0];
        const hit = walk(nodes[i].children || []);
        if (hit) return hit;
      }
      return null;
    })([tree]);
  }

  window.__test = {
    log: log,
    order: (id) => ((find(id, [tree]) || {}).children || []).map((k) => k.id),
    find: (id) => find(id, [tree])
  };

  window.alert = () => {};
  window.prompt = (msg, def) => def || 'test';

  window.chrome = {
    runtime: {
      id: 'test',
      getURL: (p) => 'about:blank#' + p
    },
    storage: {
      local: {
        get: (keys) => {
          if (typeof keys === 'string') return Promise.resolve({});
          return Promise.resolve(Object.assign({}, keys));
        },
        set: () => Promise.resolve()
      }
    },
    tabs: {
      query: () => Promise.resolve([]),
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({})
    },
    bookmarks: {
      getTree: () => Promise.resolve([tree]),
      getChildren: (id) => {
        const n = find(id, [tree]);
        return Promise.resolve(n ? (n.children || []).slice() : []);
      },
      get: (id) => {
        const n = find(id, [tree]);
        if (!n) return Promise.reject(new Error('not found: ' + id));
        return Promise.resolve([Object.assign({}, n, { parentId: parentOf(id) })]);
      },
      getSubTree: (id) => {
        const n = find(id, [tree]);
        if (!n) return Promise.reject(new Error('not found: ' + id));
        return Promise.resolve([Object.assign({}, n, { parentId: parentOf(id) })]);
      },
      create: (o) => {
        const node = o.url
          ? { id: 'B' + (++seq), title: o.title, url: o.url }
          : { id: 'F' + (++seq), title: o.title, children: [] };
        const p = find(o.parentId, [tree]);
        if (!p) return Promise.reject(new Error('no parent ' + o.parentId));
        const kids = p.children || (p.children = []);
        kids.splice(o.index == null ? kids.length : o.index, 0, node);
        log.push(['create', node.id, o.title]);
        return Promise.resolve(node);
      },
      move: (id, dest) => {
        if (dest.index == null || dest.index < 0) {
          throw new Error("Error at property 'index': Value must be at least 0.");
        }
        const p = find(dest.parentId, [tree]);
        if (!p) return Promise.reject(new Error('no parent'));
        const kids = p.children || (p.children = []);
        if (dest.index > kids.length) throw new Error('index out of range');
        const self = kids.findIndex((k) => k.id === id);
        let idx = dest.index;
        if (self >= 0 && idx > self) idx -= 1; // 真实 Chrome 的同父级补偿
        const node = detach(id);
        if (!node) return Promise.reject(new Error('not found ' + id));
        kids.splice(idx, 0, node);
        log.push(['move', id, 'req', dest.index, 'real', idx]);
        return Promise.resolve({});
      },
      update: () => Promise.resolve({}),
      remove: (id) => { detach(id); return Promise.resolve(); },
      removeTree: (id) => { detach(id); return Promise.resolve(); },
      onCreated: { addListener() {} },
      onRemoved: { addListener() {} },
      onChanged: { addListener() {} },
      onMoved: { addListener() {} },
      onChildrenReordered: { addListener() {} },
      onImportEnded: { addListener() {} }
    }
  };
})();
