#!/usr/bin/env node
/*
 * 容量验证：造 3200 条书签（8 个分组 × 400），确认页面能渲染当前分页且不报错。
 * 只验证"能跑通"，headless 的虚拟时间不适合用来报告首屏耗时。
 *
 * 用法：node tests/stress.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chrome)) {
  console.error('找不到 Chrome，可用 CHROME 环境变量指定路径');
  process.exit(2);
}

function group(idx, n) {
  const kids = [];
  for (let i = 0; i < n; i += 1) {
    kids.push({ id: `P${idx}_${i}`, title: `压测条目 ${idx}-${i}`, url: `https://example${idx}.com/p/${i}`, children: [] });
  }
  return { id: `PG${idx}`, title: `压测分组 ${idx}`, children: kids };
}

const tree = {
  id: '0', title: '', children: [
    { id: '1', title: '书签栏', children: Array.from({ length: 8 }, (_, i) => group(i, 400)) },
    { id: '2', title: '其他书签', children: [] }
  ]
};

const stressJs = join(root, '_stress-data.js');
writeFileSync(stressJs, 'window.MOCK_TREE=' + JSON.stringify(tree) + ';');

const html = readFileSync(join(root, 'newtab.html'), 'utf8')
  .replace('<script src="demo.js"></script>',
    '<script src="_stress-data.js"></script>\n<script src="tests/stub.js"></script>')
  .replace('<script src="app.js"></script>', `<script src="app.js"></script>
<script>
setTimeout(function () {
  var n = document.querySelectorAll('#grid .tile').length;
  var pages = document.querySelectorAll('#pages .page').length;
  var box = document.createElement('pre');
  box.id = 'result';
  box.textContent = JSON.stringify({ tiles: n, pages: pages });
  document.body.appendChild(box);
}, 1200);
</script>`);
const page = join(root, '_stress.html');
writeFileSync(page, html);

const run = spawnSync(chrome, [
  '--headless=new', '--disable-gpu', '--window-size=1400,900',
  '--virtual-time-budget=9000', '--dump-dom',
  'file:///' + page.replace(/\\/g, '/')
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

for (const f of [stressJs, page]) { try { unlinkSync(f); } catch (e) { /* 忽略 */ } }

const m = (run.stdout || '').match(/<pre id="result">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('没有结果，页面可能报错');
  process.exit(1);
}
const data = JSON.parse(m[1].replace(/&quot;/g, '"'));
const pass = data.tiles === 400 && data.pages === 8;
console.log(`${pass ? 'PASS' : 'FAIL'}  3200 条书签：分页 ${data.pages}，当前页渲染 ${data.tiles} 个图标`);
process.exit(pass ? 0 : 1);
