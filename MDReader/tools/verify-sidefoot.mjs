/* 发布前基线校准 2026-11-15：对齐示例文档 v1.4「使用指南与功能导览」、
   MDFlow 事件委托、顶栏柔光开关、role=switch 开关语义与欢迎屏海报图。
   断言强度保持不变，仅更新过期的期望值/选择器/事件模型。 */
/* 浏览器端验证：侧栏左下角「个人介绍」文案顺序、二维码与三主题排版 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9351;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-sidefoot-profile')}`, 'about:blank'
], { stdio: 'ignore' });

let seq = 0, ws;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    errors.push('EVAL: ' + r.result.exceptionDetails.text);
    console.log('  JS ERR:', r.result.exceptionDetails.text);
    return null;
  }
  return r.result?.result?.value;
}
async function shot(file, clip) {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = clip;
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  console.log('  saved', file);
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const PROBE = `(()=>{
  const f=document.querySelector('.side-foot');
  if(!f) return JSON.stringify({exists:false});
  const brand=f.querySelector('.sf-brand'), lines=f.querySelector('.sf-lines');
  const qr=f.querySelector('.sf-qr'), mail=f.querySelector('a[href^="mailto:"]');
  const r=f.getBoundingClientRect(), qrR=qr.getBoundingClientRect();
  const tag=f.querySelector('.sf-tagline'), note=f.querySelector('.sf-note');
  return JSON.stringify({
    exists:true,
    left:Math.round(r.left), bottom:Math.round(r.bottom), vh:innerHeight,
    footH:Math.round(r.height),
    qrSrc:(qr.getAttribute('src')||'').slice(0,22), qrLoaded:qr.naturalWidth>0,
    qrW:Math.round(qrR.width), qrH:Math.round(qrR.height),
    text:f.innerText.replace(/\\s+/g,' ').trim(),
    mail:mail?mail.getAttribute('href'):'',
    overflowBrand:brand.scrollWidth-brand.clientWidth,
    overflowLines:lines.scrollWidth-lines.clientWidth,
    overflowFoot:f.scrollWidth-f.clientWidth,
    tagColor:getComputedStyle(tag).color,
    tagNbColor:getComputedStyle(tag.querySelector('.sf-nb')).color,
    tagSize:getComputedStyle(tag).fontSize,
    mailH:Math.round(f.querySelector('.sf-lines > span').getBoundingClientRect().height),
    noteH:Math.round(note.getBoundingClientRect().height)
  })
})()`;

async function setTheme(t) {
  await ev(`document.documentElement.setAttribute('data-theme','${t}')`);
  await sleep(220);
}

(async () => {
  let url;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(x => x.type === 'page');
      if (page) { url = page.webSocketDebuggerUrl; break; }
    } catch (_) { }
    await sleep(250);
  }
  if (!url) throw new Error('CDP 连接超时');
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails.text + ' / ' + (m.params.exceptionDetails.exception?.description || ''));
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(800);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1400);

  console.log('\n[1] 个人介绍文案与位置');
  const a = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify(a));
  ok('侧栏信息块存在', a.exists === true);
  ok('固定在左下角（状态栏之上）', a.left === 0 && a.bottom >= a.vh - 40 && a.bottom <= a.vh,
    { left: a.left, bottom: a.bottom, vh: a.vh });
  const parts = ['MD Reader', '免费开源', '让 Markdown 阅读成为一种享受',
    'AI builder：桂子哥', 'Bug 与建议', '527400412@qq.com',
    '扫码关注公众号「晨曦AI研习」', '回复「MDReader」', '第一时间获取更新、源码与技术分享'];
  const pos = parts.map(p => a.text.indexOf(p));
  ok('新文案 9 个要点齐全', pos.every(i => i >= 0), { missing: parts.filter((p, i) => pos[i] < 0) });
  ok('文案顺序与给定一致', pos.every((v, i) => i === 0 || v > pos[i - 1]), pos);
  ok('旧文案已清除', !/问题反馈：|技术交流：|获取更新与源码/.test(a.text.replace('获取更新、源码与技术分享', '')), a.text);
  ok('邮箱可点击发信', a.mail === 'mailto:527400412@qq.com', a.mail);
  ok('tagline 无颜色断层', a.tagNbColor === a.tagColor, { tag: a.tagColor, nb: a.tagNbColor });

  console.log('\n[2] 公众号分享码');
  ok('二维码为内嵌 base64 图片', /^data:image\//.test(a.qrSrc), a.qrSrc);
  ok('二维码已成功解码', a.qrLoaded === true);
  ok('二维码尺寸 76×76', a.qrW === 76 && a.qrH === 76, { w: a.qrW, h: a.qrH });
  await send('Page.bringToFront');
  /* headless 下 :focus 不可靠，用真实鼠标悬停触发 :hover */
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 50, y: a.bottom - a.footH + 49 });
  await sleep(340);                       /* 等 .16s 的放大过渡走完 */
  const zoom = JSON.parse(await ev(`(()=>{
    const q=document.querySelector('.sf-qr');
    const r=q.getBoundingClientRect();
    const t=getComputedStyle(q).transform;
    return JSON.stringify({hover:q.matches(':hover'),transform:t,
      top:Math.round(r.top), left:Math.round(r.left),
      right:Math.round(r.right), bottom:Math.round(r.bottom), vw:innerWidth, vh:innerHeight});
  })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 300 });
  await sleep(220);
  ok('悬停/聚焦可放大二维码', zoom.hover === true && /matrix\(2\.6/.test(zoom.transform), zoom);
  ok('放大后未超出窗口', zoom.top >= 0 && zoom.left >= 0 && zoom.right <= zoom.vw && zoom.bottom <= zoom.vh, zoom);

  console.log('\n[3] 三主题排版');
  const colors = {};
  for (const t of ['light', 'dark', 'sepia']) {
    await setTheme(t);
    const p = JSON.parse(await ev(PROBE));
    colors[t] = p.tagColor;
    ok(`${t}：无横向溢出`, p.overflowBrand <= 1 && p.overflowLines <= 1 && p.overflowFoot <= 1,
      { brand: p.overflowBrand, lines: p.overflowLines, foot: p.overflowFoot });
    ok(`${t}：邮箱单行不折断`, p.mailH < 22, p.mailH);
    ok(`${t}：tagline 有可读颜色`, /^rgb/.test(p.tagColor) && p.tagColor !== 'rgb(0, 0, 0)', p.tagColor);
  }
  ok('三主题强调色有区分', new Set(Object.values(colors)).size >= 2, colors);

  const clipY = a.bottom - a.footH - 8;
  const clip = { x: 0, y: clipY, width: 290, height: a.footH + 8, scale: 3 };
  await setTheme('light');
  await shot('_sidefoot-light.png');
  await shot('_sidefoot-zoom.png', clip);
  await setTheme('dark');
  await shot('_sidefoot-dark.png', clip);

  console.log('\n[4] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));

  console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
  ws.close();
  edge.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
