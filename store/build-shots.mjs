/*
 * 生成 Chrome Web Store 截图（1280x800）。
 * 用法：node store/build-shots.mjs [zh|en]
 *
 * 用真实 newtab.html，只把演示数据换成 store/mock-shop.js（中性书签）。
 * 依赖：本机 Chrome + Node 22（内置 WebSocket / fetch），无第三方包。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = join(root, 'store');
const shotDir = join(storeDir, 'shots');
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const lang = process.argv[2] === 'en' ? 'en' : 'zh';
const PORT = 9333;

if (!existsSync(chrome)) {
  console.error('找不到 Chrome，可用 CHROME 环境变量指定路径');
  process.exit(2);
}
mkdirSync(shotDir, { recursive: true });

const html = readFileSync(join(root, 'newtab.html'), 'utf8')
  .replace('<script src="demo.js"></script>', '<script src="store/mock-shop.js"></script>');
const pagePath = join(root, '_shop.html');
writeFileSync(pagePath, html);

const profile = join(tmpdir(), 'bd-shots-' + Date.now());

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,800'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const target = list.find((t) => t.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 80));
    return r.result.value;
  }
}

const waitReady = `new Promise(r => { if (document.querySelectorAll('#grid .tile').length) return r(1); const t = setInterval(() => { if (document.querySelectorAll('#grid .tile').length) { clearInterval(t); r(1); } }, 100); setTimeout(() => r(0), 6000); })`;

// 截图专用样式：把毛玻璃面板改成实心背景，避免 headless 下背景透出导致文字发虚
const shotCss = `(() => {
  const st = document.createElement('style');
  st.textContent = '.palette-box,.drawer,.finder{background:#fff !important;} .palette-list{max-height:58vh !important;}';
  document.head.appendChild(st);
  return 1;
})()`;

const scenarios = [
  {
    file: '01-main',
    wait: 4200,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 1500));
    `
  },
  {
    file: '02-folder',
    wait: 3800,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 1200));
      const folder = [...document.querySelectorAll('#grid .tile.folder')].find(n => n.textContent.includes('前端'));
      folder && folder.click();
      await new Promise(r => setTimeout(r, 1200));
    `
  },
  {
    file: '03-search',
    wait: 3200,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 900));
      const grid = document.getElementById('grid');
      const r = grid.getBoundingClientRect();
      grid.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 40
      }));
      await new Promise(r => setTimeout(r, 400));
      const items = [...document.querySelectorAll('#menu *')]
        .filter(n => n.children.length === 0 && /搜索书签/.test(n.textContent));
      items[0] && items[0].click();
      await new Promise(r => setTimeout(r, 500));
      const pq = document.getElementById('pq');
      if (pq) { pq.focus(); pq.value = 'git'; pq.dispatchEvent(new Event('input', { bubbles: true })); }
      await new Promise(r => setTimeout(r, 1000));
    `
  },
  {
    file: '04-select',
    wait: 3200,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 1200));
      document.getElementById('selectBtn').click();
      await new Promise(r => setTimeout(r, 400));
      const tiles = [...document.querySelectorAll('#grid .tile')].slice(0, 3);
      for (const t of tiles) { t.click(); await new Promise(r => setTimeout(r, 200)); }
      await new Promise(r => setTimeout(r, 2600));
    `
  },
  {
    file: '05-settings',
    wait: 2200,
    action: `
      document.getElementById('gearBtn').click();
      await new Promise(r => setTimeout(r, 700));
    `
  },
  {
    file: 'preview-menu',
    root: true,
    wait: 3200,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 1400));
      const t = document.querySelector('#grid .tile');
      const r = t.getBoundingClientRect();
      t.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      }));
      await new Promise(r => setTimeout(r, 800));
    `
  },
  {
    file: 'preview-free',
    root: true,
    wait: 3400,
    action: `
      const pages = [...document.querySelectorAll('#pages .page')];
      pages[1] && pages[1].click();
      await new Promise(r => setTimeout(r, 1400));
      document.getElementById('gearBtn').click();
      await new Promise(r => setTimeout(r, 400));
      const free = document.querySelector('[data-layout="free"]');
      free && free.click();
      await new Promise(r => setTimeout(r, 500));
      document.getElementById('closeDrawer').click();
      await new Promise(r => setTimeout(r, 500));
      const grid = document.getElementById('grid');
      const gr = grid.getBoundingClientRect();
      const drag = (el, x, y) => {
        const dt = new DataTransfer();
        el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        grid.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
        grid.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      };
      const tiles = [...grid.querySelectorAll('.tile')];
      if (tiles[0]) { drag(tiles[0], gr.left + 132, gr.top + 300); await new Promise(r => setTimeout(r, 700)); }
      const t2 = [...grid.querySelectorAll('.tile')][1];
      if (t2) { drag(t2, gr.left + 300, gr.top + 210); await new Promise(r => setTimeout(r, 700)); }
      await new Promise(r => setTimeout(r, 800));
    `
  }
];

(async () => {
  let wsUrl;
  try {
    wsUrl = await connect();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });

    for (const sc of scenarios) {
      await cdp.send('Page.navigate', { url: `file:///${pagePath.replace(/\\/g, '/')}?lang=${lang}&engine=local` });
      await sleep(1200);
      await cdp.eval(waitReady);
      await cdp.eval(shotCss);
      await sleep(sc.wait);
      if (sc.action) {
        await cdp.eval(`(async () => { ${sc.action} })()`);
        await sleep(600);
      }
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: false, fromSurface: true
      });
      const out = sc.root
        ? join(root, `${sc.file}.png`)
        : join(shotDir, `${sc.file}-${lang}.png`);
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log('wrote', out);
    }
    ws.close();
  } catch (e) {
    console.error('失败：', e.message);
    process.exitCode = 1;
  } finally {
    proc.kill();
    try { rmSync(pagePath, { force: true }); } catch (e) { /* 忽略 */ }
  }
})();
