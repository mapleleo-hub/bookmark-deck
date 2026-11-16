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
    try {
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

    // 整组拖动：选中两个，拖其中一个到目标右侧，两个都要跟过去且顺序不变
    await wait(200);
    const g1 = tiles();
    g1[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    g1[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    const beforeGroup = order('116');
    const picked = [g1[0].dataset.id, g1[1].dataset.id];
    const dt = new DataTransfer();
    const target = g1[g1.length - 1];
    const c = center(target);
    g1[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const armed = g1[0].dataset.count || '';
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: c.x + c.w * 0.5, clientY: c.y }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: c.x + c.w * 0.5, clientY: c.y }));
    await wait(420);
    const afterGroup = order('116');
    const tail = afterGroup.slice(afterGroup.indexOf(target.dataset.id) + 1).slice(0, 2);
    ok('整组拖动', armed !== '' && tail.join(',') === picked.join(','),
      '徽标=' + armed + ' picked=' + picked.join(',') + ' ' + beforeGroup.join(',') + ' -> ' + afterGroup.join(',') + ' log=' + JSON.stringify(window.__test.log.slice(-8)));

    // 触屏长按拖拽
    await wait(300);
    const t5 = tiles();
    const src5 = t5[0];
    const dst5 = t5[2];
    const s5 = center(src5);
    const d5 = center(dst5);
    const beforeTouch = order('116');
    const touchAt = (el, type, x, y) => {
      const tp = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [tp],
        targetTouches: type === 'touchend' ? [] : [tp],
        changedTouches: [tp]
      }));
    };
    touchAt(src5, 'touchstart', s5.x, s5.y);
    await wait(440);
    const ghost = document.querySelectorAll('.touch-ghost').length;
    touchAt(src5, 'touchmove', d5.x + d5.w * 0.5, d5.y);
    await wait(60);
    touchAt(src5, 'touchend', d5.x + d5.w * 0.5, d5.y);
    await wait(420);
    const afterTouch = order('116');
    ok('触屏长按拖拽', ghost === 1 && beforeTouch.join(',') !== afterTouch.join(','),
      'ghost=' + ghost + ' ' + beforeTouch.join(',') + ' -> ' + afterTouch.join(','));

    const box = document.createElement('pre');
    box.id = 'result';
    box.textContent = JSON.stringify(results);
    document.body.appendChild(box);
    return results;
    } catch (err) {
      results.push({ name: '用例执行异常', pass: false, detail: String(err && err.stack || err) });
      const box = document.createElement('pre');
      box.id = 'result';
      box.textContent = JSON.stringify(results);
      document.body.appendChild(box);
    }
  };

  setTimeout(() => { window.runTests(); }, 700);
})();
