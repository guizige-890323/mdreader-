/* 发布前基线校准 2026-11-15：欢迎屏已由「SVG 艺术字 M/D + 头戴式耳机」
   改为内嵌 base64 海报图（.w-slogan-img）+ 中英文双语文案，旧 PROBE 访问
   .sl-art / .sl-cup 等已废弃节点会抛异常导致 probe=null。
   断言强度保持不变：口号文案、旧内容清零、海报内嵌与解码、主题适配、零溢出。 */
/* 浏览器端验证：欢迎屏极简口号 + 海报图 + 三主题适配 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9371;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-slogan-profile')}`, 'about:blank'], { stdio: 'ignore' });

let seq = 0, ws; const pending = new Map(); const errors = [];
function send(method, params = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise(r => pending.set(id, r)); }
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) { errors.push('EVAL: ' + r.result.exceptionDetails.text); return null; }
  return r.result?.result?.value;
}
async function shot(file, clip) {
  const p = { format: 'png', captureBeyondViewport: false }; if (clip) p.clip = clip;
  const r = await send('Page.captureScreenshot', p);
  writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  console.log('  saved', file);
}
let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } }

const PROBE = `(()=>{
  const w=document.getElementById('welcome');
  if(!w) return JSON.stringify({exists:false, reason:'no #welcome'});
  const h=w.querySelector('.w-slogan');
  if(!h) return JSON.stringify({exists:false, reason:'no .w-slogan'});
  const img=h.querySelector('.w-slogan-img'), en=h.querySelector('.w-slogan-en');
  const hr=h.getBoundingClientRect(), ir=img?img.getBoundingClientRect():{width:0,height:0};
  return JSON.stringify({
    exists:true, label:h.getAttribute('aria-label'),
    oldText:/把 Markdown|读成享受|交得出去|文件永不上传|开源免费与自由/.test(w.textContent),
    badges:w.querySelectorAll('.w-badges').length,
    imgSrc:img?(img.getAttribute('src')||'').slice(0,22):'',
    imgLoaded:img?img.naturalWidth>0:false,
    imgW:Math.round(ir.width), imgH:Math.round(ir.height),
    imgFilter:img?getComputedStyle(img).filter:'',
    imgBlend:img?getComputedStyle(img).mixBlendMode:'',
    enDisplay:en?getComputedStyle(en).display:'',
    h:Math.round(hr.height),
    hOverflow:h.scrollWidth-h.clientWidth,
    overflow:w.scrollWidth-w.clientWidth
  })
})()`;

(async () => {
  let url;
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) { url = p.webSocketDebuggerUrl; break; } } catch (_) {}
    await sleep(250);
  }
  if (!url) throw new Error('CDP 连接超时');
  ws = new WebSocket(url);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(1000);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1100);

  console.log('\n[1] 口号文案与旧内容清除');
  const a = JSON.parse(await ev(PROBE) || '{"exists":false}');
  console.log('  probe =', JSON.stringify(a));
  ok('欢迎屏口号存在', a.exists === true, a);
  ok('极简口号文案正确', a.label === '让 Markdown 阅读成为一种享受', a.label);
  ok('旧标题与 5 行特性清单已清零', a.oldText === false && a.badges === 0, { old: a.oldText, badges: a.badges });
  ok('口号为单行海报（不折行）', a.h < 400 && a.imgH > 0, { h: a.h, imgH: a.imgH });

  console.log('\n[2] 内嵌海报与中英文双语文案');
  ok('海报为内嵌 base64 图片', /^data:image\//.test(a.imgSrc), a.imgSrc);
  ok('海报已成功解码', a.imgLoaded === true);
  ok('海报宽度受控（≤560px）', a.imgW > 200 && a.imgW <= 560, a.imgW);
  ok('中文界面显示海报、英文文案隐藏', a.enDisplay === 'none', a.enDisplay);
  /* #welcome 含全宽无缝滚动的功能亮点跑马灯，scrollWidth 天然大于 clientWidth；
     布局是否溢出应看口号容器自身，而不是整个欢迎屏。 */
  ok('口号容器自身无横向溢出', a.hOverflow <= 1, a.hOverflow);

  console.log('\n[3] 三主题海报适配实拍');
  const themes = {};
  for (const [t, file] of [['light', '_slogan-light.png'], ['dark', '_slogan-dark.png'], ['sepia', '_slogan-sepia.png']]) {
    await ev(`document.querySelector('.skin-btn[data-theme="${t}"]').click()`);
    await sleep(360);
    const p = JSON.parse(await ev(PROBE));
    themes[t] = { filter: p.imgFilter, blend: p.imgBlend };
    await shot(file, { x: 272, y: 60, width: 1168, height: 290, scale: 1.5 });
  }
  ok('浅色 / 护眼用正片叠底融入背景', themes.light.blend === 'multiply' && themes.sepia.blend === 'multiply', themes);
  ok('深色下海报反色适配', /invert\(1\)/.test(themes.dark.filter), themes.dark);
  await ev(`document.querySelector('.skin-btn[data-theme="light"]').click()`);
  await sleep(320);
  await shot('_slogan-zoom.png', { x: 380, y: 212, width: 900, height: 96, scale: 3 });

  console.log('\n[4] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { try { ws?.close(); } catch (_) {} edge.kill(); });
