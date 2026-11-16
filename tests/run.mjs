#!/usr/bin/env node
/*
 * 冒烟测试入口：用无头 Chrome 打开真实页面结构，跑 tests/cases.js，按退出码报告。
 *
 * 用法：
 *   node tests/run.mjs
 *   CHROME="/path/to/chrome" node tests/run.mjs
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
if (!existsSync(join(root, 'dev/mock.js'))) {
  console.error('缺少 dev/mock.js（演示数据）。生成方式见 README。');
  process.exit(2);
}

// 用真实页面结构，只把数据来源换成桩
const html = readFileSync(join(root, 'newtab.html'), 'utf8')
  .replace('<script src="demo.js"></script>', '<script src="dev/mock.js"></script>\n<script src="tests/stub.js"></script>')
  .replace('<script src="app.js"></script>', '<script src="app.js"></script>\n<script src="tests/cases.js"></script>');
const page = join(root, '_smoke.html');
writeFileSync(page, html);

const run = spawnSync(chrome, [
  '--headless=new', '--disable-gpu', '--window-size=1400,900',
  '--virtual-time-budget=8000', '--dump-dom',
  'file:///' + page.replace(/\\/g, '/') + '?g=116&engine=local'
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

try { unlinkSync(page); } catch (e) { /* 忽略 */ }

const out = run.stdout || '';
const m = out.match(/<pre id="result">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('没有拿到测试结果，页面可能报错。原始输出片段：');
  console.error(out.slice(0, 1200));
  process.exit(1);
}

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

let results;
try {
  results = JSON.parse(decode(m[1]));
} catch (e) {
  console.error('结果不是合法 JSON：', m[1].slice(0, 400));
  process.exit(1);
}

let failed = 0;
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) failed += 1;
  console.log(`${mark}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
