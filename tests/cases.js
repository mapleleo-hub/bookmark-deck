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
    let all = tiles();
    ok('渲染当前分页', all.length > 0, 'tile 数量 ' + all.length);

    if (all.length >= 4) {
    // 整组覆盖另一个书签：整组加目标一起收进新文件夹（放在最前，此时页面上有 4 个书签）
    const groupList = tiles().filter((n) => !n.classList.contains('folder'));
    if (groupList.length >= 3) {
      groupList[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      groupList[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      window.__test.log.length = 0;
      const gc = center(groupList[2]);
      const dtG = new DataTransfer();
      groupList[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtG }));
      groupList[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtG, clientX: gc.x, clientY: gc.y }));
      groupList[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtG, clientX: gc.x, clientY: gc.y }));
      await wait(600);
      const moved = window.__test.log.filter((x) => x[0] === 'move').length;
      ok('整组覆盖建组', moved >= 3, '进入新文件夹的条目数=' + moved);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await wait(800);
      all = tiles();
    } else {
      ok('整组覆盖建组', false, '书签只有 ' + groupList.length + ' 个，至少需要 3 个');
    }

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

    // 撤销：整组拖动一次 Ctrl+Z 要回到原样
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(250);
    const beforeUndo = order('116');
    const u1 = tiles();
    u1[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    u1[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    const dtU = new DataTransfer();
    const tgtU = u1[u1.length - 1];
    const cU = center(tgtU);
    u1[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtU }));
    tgtU.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtU, clientX: cU.x + cU.w * 0.5, clientY: cU.y }));
    tgtU.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtU, clientX: cU.x + cU.w * 0.5, clientY: cU.y }));
    await wait(500);
    const afterMove = order('116');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(600);
    const afterUndo = order('116');
    ok('整组拖动一次撤销回原样', afterMove.join(',') !== beforeUndo.join(',') && afterUndo.join(',') === beforeUndo.join(','),
      beforeUndo.join(',') + ' -> ' + afterMove.join(',') + ' -撤销-> ' + afterUndo.join(','));

    // 批量移动：两项都要过去，一次撤销全部回来
    await wait(250);
    const pair = tiles().slice(0, 2).map((n) => n.dataset.id);
    const srcOrder = order('116');
    const dstOrder = order('2');
    await window.__bd.moveManyTo(pair, '2');
    await wait(400);
    const movedDst = order('2');
    const leftSrc = order('116');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(700);
    const backSrc = order('116');
    const backDst = order('2');
    const allMoved = pair.every((id) => movedDst.indexOf(id) >= 0 && leftSrc.indexOf(id) < 0);
    const allBack = pair.every((id) => backDst.indexOf(id) < 0) && backSrc.join(',') === srcOrder.join(',');
    ok('批量移动全部生效且可一次撤销', allMoved && allBack,
      '移动后目标=' + movedDst.join(',') + ' 源=' + leftSrc.join(',') + ' | 撤销后源=' + backSrc.join(',') + ' 期望=' + srcOrder.join(','));

    // 整组拖进已有文件夹：两项都要进去，一次撤销回来
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(350);
    const list6 = tiles();
    const plain = list6.filter((n) => !n.classList.contains('folder'));
    const folderTile = list6.filter((n) => n.classList.contains('folder'))[0];
    if (folderTile && plain.length >= 2) {
      plain[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      plain[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      const beforeKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      const fc = center(folderTile);
      const dtF = new DataTransfer();
      plain[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtF }));
      folderTile.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtF, clientX: fc.x, clientY: fc.y }));
      folderTile.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtF, clientX: fc.x, clientY: fc.y }));
      await wait(700);
      const afterKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      const bothIn = plain.slice(0, 2).every((p) => afterKids.indexOf(p.dataset.id) >= 0);
      ok('整组拖进文件夹', bothIn && afterKids.length === beforeKids.length + 2,
        '前=' + beforeKids.join(',') + ' 后=' + afterKids.join(','));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await wait(800);
      const backKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      ok('整组进文件夹可撤销', backKids.length === beforeKids.length, '撤销后=' + backKids.join(','));
    } else {
      ok('整组拖进文件夹', false, '页面上没有可用的文件夹或书签');
    }

    const box = document.createElement('pre');
    box.id = 'result';
    box.textContent = JSON.stringify(results);
    document.body.appendChild(box);
    return results;
    } catch (err) {
      results.push({ name: '用例执行异常', pass: false, detail: String(err && err.stack || err) });
      // 撤销：整组拖动一次 Ctrl+Z 要回到原样
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(250);
    const beforeUndo = order('116');
    const u1 = tiles();
    u1[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    u1[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    const dtU = new DataTransfer();
    const tgtU = u1[u1.length - 1];
    const cU = center(tgtU);
    u1[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtU }));
    tgtU.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtU, clientX: cU.x + cU.w * 0.5, clientY: cU.y }));
    tgtU.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtU, clientX: cU.x + cU.w * 0.5, clientY: cU.y }));
    await wait(500);
    const afterMove = order('116');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(600);
    const afterUndo = order('116');
    ok('整组拖动一次撤销回原样', afterMove.join(',') !== beforeUndo.join(',') && afterUndo.join(',') === beforeUndo.join(','),
      beforeUndo.join(',') + ' -> ' + afterMove.join(',') + ' -撤销-> ' + afterUndo.join(','));

    // 批量移动：两项都要过去，一次撤销全部回来
    await wait(250);
    const pair = tiles().slice(0, 2).map((n) => n.dataset.id);
    const srcOrder = order('116');
    const dstOrder = order('2');
    await window.__bd.moveManyTo(pair, '2');
    await wait(400);
    const movedDst = order('2');
    const leftSrc = order('116');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await wait(700);
    const backSrc = order('116');
    const backDst = order('2');
    const allMoved = pair.every((id) => movedDst.indexOf(id) >= 0 && leftSrc.indexOf(id) < 0);
    const allBack = pair.every((id) => backDst.indexOf(id) < 0) && backSrc.join(',') === srcOrder.join(',');
    ok('批量移动全部生效且可一次撤销', allMoved && allBack,
      '移动后目标=' + movedDst.join(',') + ' 源=' + leftSrc.join(',') + ' | 撤销后源=' + backSrc.join(',') + ' 期望=' + srcOrder.join(','));

    // 整组拖进已有文件夹：两项都要进去，一次撤销回来
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(250);
    const list6 = tiles();
    const folderTile = list6.filter((n) => n.classList.contains('folder'))[0];
    const plain = list6.filter((n) => !n.classList.contains('folder'));
    if (folderTile && plain.length >= 2) {
      plain[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      plain[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      const beforeKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      const fc = center(folderTile);
      const dtF = new DataTransfer();
      plain[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtF }));
      folderTile.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtF, clientX: fc.x, clientY: fc.y }));
      folderTile.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtF, clientX: fc.x, clientY: fc.y }));
      await wait(600);
      const afterKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      const bothIn = plain.slice(0, 2).every((p) => afterKids.indexOf(p.dataset.id) >= 0);
      ok('整组拖进文件夹', bothIn && afterKids.length === beforeKids.length + 2,
        '前=' + beforeKids.join(',') + ' 后=' + afterKids.join(','));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await wait(700);
      const backKids = (window.__test.find(folderTile.dataset.id).children || []).map((k) => k.id);
      ok('整组进文件夹可撤销', backKids.length === beforeKids.length, '撤销后=' + backKids.join(','));
    } else {
      ok('整组拖进文件夹', false, '页面上没有可用的文件夹或书签');
    }

    // 整组覆盖另一个书签：整组加目标一起收进新文件夹
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(300);
    const list7 = tiles().filter((n) => !n.classList.contains('folder'));
    if (list7.length >= 3) {
      list7[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      list7[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      window.__test.log.length = 0;
      const tc = center(list7[2]);
      const dtG = new DataTransfer();
      list7[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dtG }));
      list7[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtG, clientX: tc.x, clientY: tc.y }));
      list7[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtG, clientX: tc.x, clientY: tc.y }));
      await wait(600);
      const moves = window.__test.log.filter((x) => x[0] === 'move').length;
      ok('整组覆盖建组', moves >= 3, '进入新文件夹的条目数=' + moves);
    } else {
      ok('整组覆盖建组', false, '书签不足 3 个');
    }

    const box = document.createElement('pre');
      box.id = 'result';
      box.textContent = JSON.stringify(results);
      document.body.appendChild(box);
    }
  };

  setTimeout(() => { window.runTests(); }, 700);
})();
