/*
 * 冒烟用例：在真实的 newtab.html 结构上跑，结果写到 #result 供 run.mjs 读取。
 * 每个用例输出 { name, pass, detail }。
 */
(function () {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || '' });

  const grid = () => document.getElementById('grid');
  const tiles = () => Array.from(grid().children).filter((n) => n.classList.contains('tile'));
  const order = (id) => window.__test.order(id);

  function fire(el, type, opts) {
    el.dispatchEvent(new DragEvent(type, Object.assign({
      bubbles: true, cancelable: true, dataTransfer: new DataTransfer()
    }, opts)));
  }

  function center(el) {
    const f = el.querySelector('.frame') || el;
    const r = f.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width };
  }

  function dragGrid(src, target, shift) {
    const c = center(target);
    const x = c.x + shift * c.w;
    fire(src, 'dragstart', { clientX: x, clientY: c.y });
    fire(target, 'dragover', { clientX: x, clientY: c.y });
    const hint = Array.from(document.querySelectorAll('.tile.drop-left, .tile.drop-right, .tile.group-arm'))
      .map((n) => n.dataset.id + ':' + (n.classList.contains('group-arm') ? 'group' : n.classList.contains('drop-left') ? 'left' : 'right'));
    fire(target, 'drop', { clientX: x, clientY: c.y });
    return hint;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  window.runTests = async function () {
    const all = tiles();
    ok('渲染当前分页', all.length > 0, 'tile 数量 ' + all.length);

    if (all.length >= 4) {
      // 相邻插入：首项拖到第 2 项右侧
      const before = order('116');
      const hint = dragGrid(all[0], all[1], 0.5);
      await wait(260);
      const after = order('116');
      const expect = before.slice();
      const moved = expect.shift();
      expect.splice(expect.indexOf(before[1]) + 1, 0, moved);
      ok('拖到右侧插到右边', after.join(',') === expect.join(','),
        '提示=' + JSON.stringify(hint) + ' ' + before.join(',') + ' -> ' + after.join(',') + ' 期望 ' + expect.join(','));

      // 覆盖建组
      await wait(200);
      const t2 = tiles();
      window.__test.log.length = 0;
      const hint2 = dragGrid(t2[t2.length - 1], t2[1], 0);
      await wait(300);
      const created = window.__test.log.filter((x) => x[0] === 'create').length;
      ok('覆盖另一个图标建组', hint2.some((h) => h.endsWith(':group')) && created === 1,
        '提示=' + JSON.stringify(hint2) + ' create=' + created);
    }

    // 搜索高亮
    const q = document.getElementById('q');
    q.focus();
    q.value = 'git';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(300);
    const marks = document.querySelectorAll('#flist mark').length;
    ok('搜索命中高亮', marks > 0, 'mark 数量 ' + marks);

    // 键盘导航
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(120);
    const list = tiles();
    list[0].focus();
    list[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : '';
    ok('方向键移动焦点', !!focused && focused !== list[0].dataset.id, '焦点 ' + focused);

    // 多选
    list[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    list[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    const sel = document.querySelectorAll('.tile.selected').length;
    ok('Ctrl 点击多选', sel === 2, '选中 ' + sel);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(80);
    ok('Esc 清空选择', document.querySelectorAll('.tile.selected').length === 0);

    const box = document.createElement('pre');
    box.id = 'result';
    box.textContent = JSON.stringify(results);
    document.body.appendChild(box);
    return results;
  };

  setTimeout(() => { window.runTests(); }, 700);
})();
