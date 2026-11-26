/* 浏览器端验证：顶栏新分组（导出/打印/Word 接在最近打开后）+ 三枚 MD LOGO 换肤图标 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9361;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-skin-profile')}`, 'about:blank'
], { stdio: 'ignore' });

let seq = 0, ws;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise(resolve => pending.set(id, resolve));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    errors.push('EVAL: ' + r.result.exceptionDetails.text);
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
  const t=document.querySelector('.toolbar'), cs=Array.from(t.children);
  const ix=s=>cs.findIndex(x=>x.matches(s));
  const skins=Array.from(document.querySelectorAll('.skin-btn'));
  const sel=document.getElementById('themeSel');
  const sr=sel.getBoundingClientRect();
  return JSON.stringify({
    theme:document.documentElement.dataset.theme,
    seq:[ix('#btnRecent'),ix('.exp-wrap'),ix('#btnPrint'),ix('#btnWord')],
    lastChild:cs[cs.length-1].id,
    skinCount:skins.length,
    skinIds:skins.map(b=>b.id),
    skinThemes:skins.map(b=>b.dataset.theme),
    active:skins.filter(b=>b.classList.contains('active')).map(b=>b.dataset.theme),
    pressed:skins.map(b=>b.getAttribute('aria-pressed')),
    titles:skins.map(b=>b.title),
    logos:skins.map(b=>getComputedStyle(b.querySelector('.skin-logo')).backgroundImage.slice(0,30)),
    switchRect:(()=>{const r=document.getElementById('skinSwitch').getBoundingClientRect();
      return {x:Math.round(r.x),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)}})(),
    toolbarRight:Math.round(t.getBoundingClientRect().right),
    overflow:t.scrollWidth-t.clientWidth,
    compat:{exists:!!sel,w:Math.round(sr.width),opacity:getComputedStyle(sel).opacity,
      position:getComputedStyle(sel).position,value:sel.value},
    bg:getComputedStyle(document.body).backgroundColor,
    panel:getComputedStyle(document.querySelector('.toolbar')).backgroundColor,
    savedTheme:localStorage.getItem('mdreader.theme'),
    toast:(()=>{const e=document.getElementById('toast');return {text:e.textContent,shown:e.classList.contains('show')}})()
  })
})()`;

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
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(900);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1300);

  console.log('\n[1] 顶栏分组与换肤控件');
  const a = JSON.parse(await ev(PROBE));
  /* 导出下拉里已包含 Word / 打印，不再有独立的 btnPrint / btnWord；
     这里只校验「导出」在「最近打开」右侧（seq 里 -1 表示元素不存在）。 */
  ok('导出位于最近打开右侧',
    a.seq[0] >= 0 && a.seq[1] > a.seq[0], a.seq);
  /* 换肤三色卡现在是顶栏倒数第二个（最后一个是窄窗口的「更多」入口） */
  ok('换肤控件在顶栏右端（其后仅「更多」入口）',
    a.lastChild === 'skinSwitch' || a.lastChild === 'tbMoreWrap', a.lastChild);
  ok('三枚皮肤按钮齐全且顺序为浅/深/护眼',
    a.skinCount === 3 && a.skinThemes.join(',') === 'light,dark,sepia', a.skinThemes);
  /* 换肤控件贴右端：允许「更多」入口占位（窄窗口下它是最后一项） */
  ok('换肤控件贴近右端', a.toolbarRight - a.switchRect.right <= 60,
    { gap: Math.round(a.toolbarRight - a.switchRect.right), bar: a.toolbarRight });
  ok('顶栏无横向溢出', a.overflow <= 0, a.overflow);
  ok('隐藏兼容 select 仍可被调用',
    a.compat.exists && a.compat.opacity === '0' && a.compat.position === 'absolute' && a.compat.w <= 1, a.compat);

  console.log('\n[2] 三枚 MD LOGO 图标（真实 PNG，配色互异）');
  const icons = JSON.parse(await ev(`(async()=>{
    const urls=Array.from(document.querySelectorAll('.skin-logo')).map(e=>{
      const m=getComputedStyle(e).backgroundImage.match(/url\\(["']?(data:image\\/png;base64,[^"')]+)["']?\\)/);
      return m?m[1]:'';
    });
    const dims=await Promise.all(urls.map(u=>new Promise(res=>{
      if(!u) return res([0,0]);
      const im=new Image(); im.onload=()=>res([im.naturalWidth,im.naturalHeight]); im.onerror=()=>res([0,0]); im.src=u;
    })));
    return JSON.stringify({prefixes:urls.map(u=>u.slice(0,36)),lens:urls.map(u=>u.length),
      unique:new Set(urls).size, dims:dims});
  })()`));
  ok('三枚图标均为内嵌 base64 PNG', icons.prefixes.every(p => p.startsWith('data:image/png;base64,')), icons.prefixes);
  ok('三张图片互不相同（三种配色）', icons.unique === 3, icons.unique);
  ok('三张图片均可解码为 64×64', icons.dims.every(d => d[0] === 64 && d[1] === 64), icons.dims);
  ok('按钮含中文主题提示', a.titles.every(t => /主题/.test(t)), a.titles);

  console.log('\n[3] 点击换肤：主题、选中态、记忆');
  const seen = {};
  for (const t of ['light', 'dark', 'sepia']) {
    await ev(`document.querySelector('.skin-btn[data-theme="${t}"]').click()`);
    await sleep(420);
    const s = JSON.parse(await ev(PROBE));
    seen[t] = s;
    ok(`点击「${t}」→ data-theme=${t}`, s.theme === t, s.theme);
    ok(`「${t}」唯一选中且 aria-pressed 正确`,
      s.active.length === 1 && s.active[0] === t && s.pressed.filter(p => p === 'true').length === 1,
      { active: s.active, pressed: s.pressed });
    ok(`「${t}」兼容 select 同步`, s.compat.value === t, s.compat.value);
    ok(`「${t}」写入本地存储`, s.savedTheme === t, s.savedTheme);
    ok(`「${t}」弹出切换提示`, /已切换/.test(s.toast.text), s.toast);
  }
  ok('三套皮肤背景色互异',
    new Set([seen.light.bg, seen.dark.bg, seen.sepia.bg]).size === 3,
    [seen.light.bg, seen.dark.bg, seen.sepia.bg]);
  ok('三套皮肤面板色互异',
    new Set([seen.light.panel, seen.dark.panel, seen.sepia.panel]).size === 3,
    [seen.light.panel, seen.dark.panel, seen.sepia.panel]);

  console.log('\n[4] 刷新记忆与兼容入口');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1100);
  const r = JSON.parse(await ev(PROBE));
  ok('刷新后仍是护眼主题', r.theme === 'sepia', r.theme);
  ok('刷新后护眼按钮仍选中', r.active.length === 1 && r.active[0] === 'sepia', r.active);
  await ev(`(()=>{const s=document.getElementById('themeSel');s.value='dark';s.dispatchEvent(new Event('change'))})()`);
  await sleep(350);
  const c = JSON.parse(await ev(PROBE));
  ok('兼容 select 触发 change 可换肤', c.theme === 'dark' && c.active[0] === 'dark',
    { theme: c.theme, active: c.active });

  console.log('\n[5] 多窗口宽度零溢出');
  for (const w of [960, 1080, 1200, 1254, 1280, 1366, 1440, 1600, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(260);
    const s = JSON.parse(await ev(PROBE));
    ok(`W=${w} 顶栏不溢出且换肤控件贴右`,
      s.overflow <= 0 && s.switchRect.right <= s.toolbarRight + 1 && s.skinCount === 3,
      { overflow: s.overflow, right: s.switchRect.right, bar: s.toolbarRight });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(260);

  console.log('\n[6] 三态实拍');
  const clip = { x: 1240, y: 0, width: 200, height: 52, scale: 4 };
  for (const [t, file] of [['light', '_skin-light.png'], ['dark', '_skin-dark.png'], ['sepia', '_skin-sepia.png']]) {
    await ev(`document.querySelector('.skin-btn[data-theme="${t}"]').click()`);
    await sleep(420);
    await shot(file, clip);
  }
  await ev(`document.querySelector('.skin-btn[data-theme="light"]').click()`);
  await sleep(380);
  await shot('_toolbar-new.png', { x: 0, y: 0, width: 1440, height: 52, scale: 2 });

  console.log('\n[7] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { try { ws?.close(); } catch (_) {} edge.kill(); });
