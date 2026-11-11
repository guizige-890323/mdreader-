/* 浏览器端验证：欢迎屏极简口号 + LOGO 艺术字 M/D + 完整头戴式耳机（M 与 D 各一枚红色耳罩） */
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
const isRed = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return !!m && +m[1] > 150 && +m[1] > +m[2] * 1.6 && +m[1] > +m[3] * 1.4; };

const PROBE = `(()=>{
  const h=document.querySelector('.w-slogan');
  if(!h) return JSON.stringify({exists:false});
  const art=h.querySelector('.sl-art'), wire=h.querySelector('.sl-wire');
  const m=h.querySelector('.sl-m'), d=h.querySelector('.sl-d');
  const hr=h.getBoundingClientRect(), ar=art.getBoundingClientRect(), wr=wire.getBoundingClientRect();
  const mr=m.getBoundingClientRect(), dr=d.getBoundingClientRect();
  const cups=[...h.querySelectorAll('.sl-cup')];
  const cl=h.querySelector('.sl-cup-l'), cr=h.querySelector('.sl-cup-r');
  const clr=cl?cl.getBoundingClientRect():null, crr=cr?cr.getBoundingClientRect():null;
  const cs=getComputedStyle(h);
  return JSON.stringify({
    exists:true, label:h.getAttribute('aria-label'), text:h.textContent.replace(/\\s+/g,' ').trim(),
    oldText:/把 Markdown|读成享受|交得出去|单文件|文件永不上传|开源免费/.test(document.getElementById('welcome').textContent),
    badges:document.querySelectorAll('.w-badges').length,
    hasM:!!m, hasD:!!d, hasWire:!!wire,
    dots:d?d.querySelectorAll('.sl-dot').length:0,
    mW:Math.round(mr.width), dW:Math.round(dr.width), artW:Math.round(ar.width),
    wireW:Math.round(wr.width), wireTop:Math.round(wr.top), artTop:Math.round(ar.top),
    wireCoversMD:(wr.left<=mr.left+2 && wr.right>=dr.right-2),
    artColor:cs.color, strokeColor:m?getComputedStyle(m.querySelector('.sl-ink')).stroke:'',
    dotColor:d?getComputedStyle(d.querySelector('.sl-dot')).fill:'',
    cups:cups.length, oldPad:h.querySelectorAll('.sl-pad').length,
    cupColor:cups.length?getComputedStyle(cups[0].querySelector('.cup-body')).fill:'',
    padColor:cups.length?getComputedStyle(cups[0].querySelector('.cup-pad')).fill:'',
    cupL:clr?{cx:Math.round((clr.left+clr.right)/2),top:Math.round(clr.top),bottom:Math.round(clr.bottom)}:null,
    cupR:crr?{cx:Math.round((crr.left+crr.right)/2),top:Math.round(crr.top),bottom:Math.round(crr.bottom)}:null,
    mL:Math.round(mr.left), mR:Math.round(mr.right), dL:Math.round(dr.left), dR:Math.round(dr.right),
    wireBottom:Math.round(wr.bottom), earWidth:wire?parseFloat(getComputedStyle(wire.querySelector('.sl-ear')).strokeWidth):0,
    earPath:wire?wire.querySelector('path').getAttribute('d'):'',
    fontSize:cs.fontSize, h:Math.round(hr.height),
    overflow:document.getElementById('welcome').scrollWidth-document.getElementById('welcome').clientWidth
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
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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
  const a = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify(a));
  ok('欢迎屏口号存在', a.exists === true);
  ok('极简口号文案正确', a.label === '让 Markdown 阅读成为一种享受', a.label);
  ok('旧标题与 5 行特性清单已清零', a.oldText === false && a.badges === 0, { old: a.oldText, badges: a.badges });
  ok('单句口号不折行', a.h < 90 && a.fontSize === '27px', { h: a.h, fontSize: a.fontSize });

  console.log('\n[2] LOGO 艺术字与耳机弧线');
  ok('M / D 两枚艺术字母 SVG 齐全', a.hasM && a.hasD && a.mW > 12 && a.dW > 12, { mW: a.mW, dW: a.dW });
  ok('D 内含 LOGO 的双圆点', a.dots === 2, a.dots);
  ok('耳机弧线从 D 横跨延伸到 M', a.hasWire && a.wireCoversMD && a.wireW >= a.artW - 2,
    { wireW: a.wireW, artW: a.artW, covers: a.wireCoversMD });
  ok('弧线位于字母上方', a.wireTop < a.artTop + 8, { wireTop: a.wireTop, artTop: a.artTop });
  ok('艺术字随正文色（主题自适应）', a.strokeColor === a.artColor, { stroke: a.strokeColor, text: a.artColor });
  ok('双圆点使用品牌强调色', a.dotColor && a.dotColor !== a.artColor, a.dotColor);

  console.log('\n[2b] 完整头戴式耳机：M 与 D 各一枚红色耳罩');
  ok('两枚耳罩齐全，旧同色单耳罩已移除', a.cups === 2 && a.oldPad === 0, { cups: a.cups, oldPad: a.oldPad });
  ok('耳罩主体为红色，内侧带浅色耳垫', isRed(a.cupColor) && a.padColor !== a.cupColor,
    { body: a.cupColor, pad: a.padColor });
  ok('左耳罩戴在 M 左侧、右耳罩戴在 D 右侧', !!a.cupL && !!a.cupR
    && a.cupL.cx >= a.mL - 6 && a.cupL.cx <= a.mL + 10
    && a.cupR.cx >= a.dR - 10 && a.cupR.cx <= a.dR + 6,
    { l: a.cupL, r: a.cupR, mL: a.mL, dR: a.dR });
  ok('头梁两端垂直下探并插入耳罩', /M 96 30/.test(a.earPath) && /4 30/.test(a.earPath)
    && a.wireBottom >= a.cupL.top - 3 && a.wireBottom <= a.cupL.top + 9,
    { path: a.earPath, wireBottom: a.wireBottom, cupTop: a.cupL && a.cupL.top });
  ok('头梁加粗，不再是一根悬空细线', a.earWidth >= 2.4, a.earWidth);

  console.log('\n[3] 三主题实拍');
  const cupColors = {};
  for (const [t, file] of [['light', '_slogan-light.png'], ['dark', '_slogan-dark.png'], ['sepia', '_slogan-sepia.png']]) {
    await ev(`document.querySelector('.skin-btn[data-theme="${t}"]').click()`);
    await sleep(360);
    cupColors[t] = await ev(`getComputedStyle(document.querySelector('.cup-body')).fill`);
    await shot(file, { x: 272, y: 60, width: 1168, height: 290, scale: 1.5 });
  }
  ok('三主题下耳罩都保持红色系', Object.values(cupColors).every(isRed), cupColors);
  await ev(`document.querySelector('.skin-btn[data-theme="light"]').click()`);
  await sleep(320);
  await shot('_slogan-zoom.png', { x: 380, y: 212, width: 900, height: 96, scale: 3 });

  console.log('\n[4] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { try { ws?.close(); } catch (_) {} edge.kill(); });
