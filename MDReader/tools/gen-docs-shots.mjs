// 用 CDP 驱动无头 Edge，基于当前 dist/MDReader.html 重截 README 引用的 6 张介绍截图。
// 与 shot-cdp.mjs（欢迎屏内嵌轮播素材）的场景不同，这里严格复刻 docs/screenshots
// 的 6 个语义：卡片浅色 / 纸张浅色 / 卡片深色 / 纸张深色 / 最近打开 / 欢迎页。
//
// 运行：node tools/gen-docs-shots.mjs
// 输出：docs/screenshots/*.png（尺寸与原图一致）
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9335;
const OUT = path.join(ROOT, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1600,1000', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'docs-edge-profile')}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
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

// 主题走隐藏兼容桥 themeSel 的 change —— app.js 里它直接调用唯一汇聚点 setTheme()，
// 与顶栏三颗 skin-btn / 设置面板是同一条路径，不会只改了 HTML 属性却没同步 UI。
const setTheme = t => `(()=>{const s=document.getElementById('themeSel');s.value='${t}';s.dispatchEvent(new Event('change'))})()`;
const setLayout = v => `(()=>{const s=document.getElementById('layoutSel');s.value='${v}';s.dispatchEvent(new Event('change'))})()`;
const openDemo = `document.getElementById('wDemo').click()`;
const toTop = `window.scrollTo(0,0)`;

const SCENES = [
  { name: '01-card-light', w: 1360, h: 900, want: { theme: 'light', layout: 'card' }, steps: [
    { act: openDemo, wait: 2200 }, { act: toTop, wait: 400 },
  ]},
  { name: '02-paper-light', w: 1360, h: 900, want: { theme: 'light', layout: 'paper' }, steps: [
    { act: openDemo, wait: 2200 }, { act: setLayout('paper'), wait: 900 }, { act: toTop, wait: 400 },
  ]},
  { name: '03-card-dark', w: 1360, h: 900, want: { theme: 'dark', layout: 'card' }, steps: [
    { act: openDemo, wait: 2200 }, { act: setTheme('dark'), wait: 1100 }, { act: toTop, wait: 400 },
  ]},
  { name: '04-paper-dark', w: 1360, h: 900, want: { theme: 'dark', layout: 'paper' }, steps: [
    { act: openDemo, wait: 2200 }, { act: setLayout('paper'), wait: 700 },
    { act: setTheme('dark'), wait: 1100 }, { act: toTop, wait: 400 },
  ]},
  { name: '05-recent-files', w: 1440, h: 920, want: { recent: true }, steps: [
    { act: openDemo, wait: 2200 },                       // 先产生一条最近打开记录
    { act: `document.getElementById('btnRecent').click()`, wait: 900 },
  ]},
  { name: '06-welcome', w: 1440, h: 920, want: { welcome: true }, steps: [
    { act: toTop, wait: 500 },
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
  // 截图时关掉动效：欢迎屏 3D 轮播不自动翻页，保证每次截到稳定首帧
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  let bad = 0;
  for (const sc of SCENES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: sc.w, height: sc.h, deviceScaleFactor: 1, mobile: false
    });
    await send('Page.navigate', { url: BASE });
    await sleep(700);
    await evaluate(`localStorage.clear()`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1100);
    for (const st of sc.steps) {
      await evaluate(st.act);
      await sleep(st.wait);
    }
    const state = JSON.parse(await evaluate(`JSON.stringify({
      build: (document.getElementById('stBuild')||{}).textContent || '',
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      layout: document.documentElement.getAttribute('data-layout') || '',
      len: (document.getElementById('content')||{}).innerHTML ? document.getElementById('content').innerHTML.length : 0,
      recent: !!document.querySelector('.recent-wrap'),
      welcome: !document.getElementById('welcome').classList.contains('hidden')
    })`));
    const problems = [];
    if (!/v1\.7/.test(state.build)) problems.push('状态栏版本=' + state.build);
    if (sc.want.theme && state.theme !== sc.want.theme) problems.push('主题=' + state.theme);
    if (sc.want.layout && state.layout !== sc.want.layout) problems.push('排版=' + state.layout);
    if (sc.want.recent && !state.recent) problems.push('最近打开面板未出现');
    if (sc.want.welcome && !state.welcome) problems.push('欢迎页未显示');
    if (!sc.want.welcome && state.len < 5000) problems.push('正文未渲染 len=' + state.len);
    if (problems.length) { bad++; console.log('  ⚠ ' + sc.name + ': ' + problems.join(' / ')); }
    else console.log('  ✓ ' + sc.name + '  ' + state.build + ' | ' + state.theme + '/' + state.layout);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, sc.name + '.png');
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(bad === 0 ? 'DOCS_SHOTS_OK' : `DOCS_SHOTS_WARN ${bad}`);
  if (bad) process.exitCode = 2;
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch (_) {}
  edge.kill();
}
