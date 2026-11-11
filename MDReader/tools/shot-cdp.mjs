// 用 Chrome DevTools Protocol 驱动无头 Edge，真实等待界面渲染后截图。
// Node 22 自带全局 WebSocket / fetch，无需第三方依赖。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9333;
const TMP = path.join(ROOT, '_shots');
mkdirSync(TMP, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1280,800', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(TMP, 'edge-profile')}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(x => x.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) { /* 等 Edge 起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 连接超时');
}

let seq = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.log('  JS ERR:', r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

const SCENES = [
  { name: '01-welcome', h: 900, steps: [] },
  { name: '02-read', h: 800, steps: [{ act: `document.getElementById('wDemo').click()`, wait: 1600 }] },
  { name: '03-chart', h: 800, steps: [
      { act: `document.getElementById('wDemo').click()`, wait: 1600 },
      { act: `document.querySelector('[data-act="chart"]').click()`, wait: 900 },
      { act: `document.querySelector('.tw').scrollIntoView({block:'center'})`, wait: 500 },
  ]},
  { name: '04-blockedit', h: 800, steps: [
      { act: `document.getElementById('wDemo').click()`, wait: 1600 },
      { act: `document.getElementById('btnEdit').click()`, wait: 900 },
  ]},
  { name: '05-paper', h: 800, steps: [
      { act: `document.getElementById('wDemo').click()`, wait: 1600 },
      { act: `(()=>{const s=document.getElementById('layoutSel');s.value='paper';s.dispatchEvent(new Event('change'))})()`, wait: 900 },
  ]},
  { name: '06-dark', h: 800, steps: [
      { act: `document.getElementById('wDemo').click()`, wait: 1600 },
      { act: `(()=>{const s=document.getElementById('themeSel');s.value='dark';s.dispatchEvent(new Event('change'))})()`, wait: 1200 },
  ]},
];

try {
  const url = await connect();
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  // 截图时禁用动效：轮播不自动播放、滚动不带 smooth，保证截到稳定首帧
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  for (const sc of SCENES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: sc.h, deviceScaleFactor: 1, mobile: false
    });
    await send('Page.navigate', { url: BASE });
    await sleep(700);
    // 每个场景独立：清掉上一场残留的主题 / 排版持久化，再重载
    await evaluate(`localStorage.clear()`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(900);                       // 等单文件 HTML 解析 + app.js boot()
    for (const st of sc.steps) {
      console.log(`  ${sc.name}: ${st.act.slice(0, 60)}`);
      await evaluate(st.act);
      await sleep(st.wait);
    }
    const state = await evaluate(`JSON.stringify({welcome:document.getElementById('welcome').className,content:document.getElementById('content').className,len:document.getElementById('content').innerHTML.length,theme:document.documentElement.dataset.theme})`);
    console.log('  state =', state);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path.join(TMP, sc.name + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('  saved', sc.name + '.png');
  }
  console.log('CDP_SHOTS_DONE');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch (_) {}
  edge.kill();
}
