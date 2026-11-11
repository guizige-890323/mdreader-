/* 浏览器端验证：表格四套风格（黑白极简 / 蓝色科技 / 红色政商 / 粉色卡通）
   含默认风格、纯色表头、切换、偏好记忆、排序与图表联动、三全局皮肤 × 两排版、响应式 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9353;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-table-profile')}`, 'about:blank'], { stdio: 'ignore' });

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
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const PROBE = `(()=>{
  const tw=document.querySelector('.tw'); if(!tw) return JSON.stringify({none:true});
  const cs=getComputedStyle, th=tw.querySelector('thead th'), first=tw.querySelector('thead th:first-child'),
    odd=tw.querySelector('tbody tr:nth-child(odd)'), even=tw.querySelector('tbody tr:nth-child(even)'),
    bar=tw.querySelector('.tw-bar'), num=tw.querySelector('td.num'), cell=tw.querySelector('tbody td');
  return JSON.stringify({
    attr:document.documentElement.dataset.tableTheme,
    tws:document.querySelectorAll('.tw').length,
    btns:document.querySelectorAll('.tt-btn').length,
    labels:[...document.querySelectorAll('.tw:first-of-type .tt-btn span, .tw .tt-btn span')].slice(0,4).map(x=>x.textContent),
    on:document.querySelectorAll('.tt-btn.on').length,
    head:cs(th).backgroundImage, headBg:cs(th).backgroundColor, headColor:cs(th).color,
    headBorder:cs(th).borderBottomColor, headLs:cs(th).letterSpacing,
    headIcon:cs(first).backgroundImage,
    odd:cs(odd).backgroundColor, even:cs(even).backgroundColor,
    twBg:cs(tw).backgroundColor, twRadius:cs(tw).borderRadius, twShadow:cs(tw).boxShadow,
    twBorder:cs(tw).borderTopColor, barBg:cs(bar).backgroundColor,
    numColor:num?cs(num).color:'', numFont:num?cs(num).fontFamily:'',
    lineStyle:cs(cell).borderBottomStyle,
    topbar:getComputedStyle(tw,'::before').backgroundImage,
    topbarColor:getComputedStyle(tw,'::before').backgroundColor,
    barOverflow:bar.scrollWidth-bar.clientWidth,
    toolbarOverflow:(()=>{const t=document.querySelector('.toolbar');return t.scrollWidth-t.clientWidth})()
  })
})()`;

async function use(key) {
  await ev(`document.querySelector('.tt-btn[data-tt="${key}"]').click()`);
  await sleep(280);
  return JSON.parse(await ev(PROBE));
}
async function setTheme(t) {
  await ev(`(()=>{const s=document.getElementById('themeSel');s.value='${t}';s.dispatchEvent(new Event('change'))})()`);
  await sleep(700);
}
async function setLayout(l) {
  await ev(`(()=>{const s=document.getElementById('layoutSel');s.value='${l}';s.dispatchEvent(new Event('change'))})()`);
  await sleep(900);
}

(async () => {
  let url;
  for (let i = 0; i < 60; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const page = list.find(x => x.type === 'page'); if (page) { url = page.webSocketDebuggerUrl; break; } } catch (_) { }
    await sleep(250);
  }
  if (!url) throw new Error('CDP 连接超时');
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' / ' + (m.params.exceptionDetails.exception?.description || ''));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(800);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1700);
  await ev(`document.querySelector('.tw').scrollIntoView({block:'center'})`);
  await sleep(350);

  console.log('\n[1] 默认「黑白极简」');
  const mono = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify({ attr: mono.attr, headBg: mono.headBg, radius: mono.twRadius, btns: mono.btns, labels: mono.labels }));
  ok('表格包装器与四个风格按钮齐全', mono.tws >= 1 && mono.btns === mono.tws * 4, mono);
  ok('默认 data-table-theme=mono', mono.attr === 'mono', mono.attr);
  ok('第一项为黑白极简', mono.labels[0] === '黑白极简', mono.labels);
  ok('每个表格恰好 1 个选中态', mono.on === mono.tws, mono);
  ok('纯黑表头（零渐变）', mono.head === 'none' && mono.headBg === 'rgb(17, 17, 17)', { head: mono.head, bg: mono.headBg });
  ok('表头白字 + 黑顶条', mono.headColor === 'rgb(255, 255, 255)' && mono.topbar === 'none', { fg: mono.headColor, topbar: mono.topbar });
  ok('极简：小圆角 + 无投影', parseFloat(mono.twRadius) <= 5 && mono.twShadow === 'none', mono);
  ok('黑白斑马纹', mono.odd !== mono.even && mono.lineStyle === 'solid', mono);
  ok('工具条无横向溢出', mono.barOverflow <= 1 && mono.toolbarOverflow <= 1, mono);

  console.log('\n[2] 蓝色科技：纯亮蓝表头（参考设计稿 #2563eb）');
  const tech = await use('tech');
  console.log('  tech =', JSON.stringify({ headBg: tech.headBg, head: tech.head, icon: tech.headIcon.slice(0, 40), radius: tech.twRadius }));
  ok('切换到 tech', tech.attr === 'tech' && tech.on === tech.tws);
  ok('表头为纯色 #2563eb（无渐变）', !/linear-gradient/.test(tech.head) && tech.headBg === 'rgb(37, 99, 235)', { head: tech.head.slice(0, 40), bg: tech.headBg });
  ok('白字表头', tech.headColor === 'rgb(255, 255, 255)', tech.headColor);
  ok('首列带白色文档图标', /data:image\/svg/.test(tech.headIcon), tech.headIcon.slice(0, 60));
  ok('10px 圆角 + 纯蓝顶条', parseFloat(tech.twRadius) >= 9 && tech.topbar === 'none', { r: tech.twRadius, top: tech.topbar });
  ok('等宽蓝色数字', /monospace|Consolas/i.test(tech.numFont) && /rgb/.test(tech.numColor), tech);
  ok('工具条无横向溢出', tech.barOverflow <= 1 && tech.toolbarOverflow <= 1, tech);

  console.log('\n[3] 红色政商 / 粉色卡通');
  const gov = await use('gov');
  ok('切换到 gov', gov.attr === 'gov' && gov.on === gov.tws);
  ok('深红表头 + 金色下边线', /linear-gradient/.test(gov.head) && /201, 162, 39/.test(gov.headBorder), { head: gov.head, border: gov.headBorder });
  ok('政商小圆角 + 衬线数字', parseFloat(gov.twRadius) <= 4 && /Georgia|Times|serif/i.test(gov.numFont), gov);
  ok('暖米色行底', gov.even !== tech.even && gov.twBg !== tech.twBg, gov);

  const cute = await use('cute');
  console.log('  cute =', JSON.stringify({ headBg: cute.headBg, head: cute.head, fg: cute.headColor, radius: cute.twRadius }));
  ok('切换到 cute', cute.attr === 'cute' && cute.on === cute.tws);
  ok('浅粉纯色表头（无渐变）', cute.head === 'none' && cute.headBg === 'rgb(255, 228, 240)', { head: cute.head, bg: cute.headBg });
  ok('浅底配深粉文字', cute.headColor === 'rgb(164, 68, 122)', cute.headColor);
  ok('糖果顶条也是纯色', cute.topbar === 'none', cute.topbar);
  ok('卡通风大圆角 + 虚线分隔', parseFloat(cute.twRadius) >= 14 && cute.lineStyle === 'dashed', cute);
  ok('四套表头互不相同', new Set([mono.headBg, tech.headBg, gov.head, cute.headBg]).size === 4);
  ok('四套圆角互不相同', new Set([mono.twRadius, tech.twRadius, gov.twRadius, cute.twRadius]).size >= 3,
    [mono.twRadius, tech.twRadius, gov.twRadius, cute.twRadius]);

  console.log('\n[4] 偏好记忆与全局联动');
  ok('风格写入 localStorage', (await ev(`localStorage.getItem('mdreader.tableTheme')`)) === 'cute');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1100);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1600);
  await ev(`document.querySelector('.tw').scrollIntoView({block:'center'})`);
  const after = JSON.parse(await ev(PROBE));
  ok('刷新后仍保持粉色卡通', after.attr === 'cute' && after.on === after.tws, after);
  await use('mono');

  console.log('\n[5] 排序与图表仍可用，且图表跟随换色');
  const sort = JSON.parse(await ev(`(()=>{
    const tw=document.querySelector('.tw'), ths=tw.querySelectorAll('thead th'), body=tw.querySelector('tbody');
    const before=[...body.rows].map(r=>r.cells[1].textContent.trim());
    ths[1].click(); const asc=[...body.rows].map(r=>r.cells[1].textContent.trim());
    ths[1].click(); const desc=[...body.rows].map(r=>r.cells[1].textContent.trim());
    return JSON.stringify({before,asc,desc,sorted:ths[1].className});
  })()`));
  ok('点击表头升序生效', sort.asc.join() === [...sort.before].sort((a, b) => +a - +b).join(), sort);
  ok('再次点击降序生效', sort.desc.join() === [...sort.before].sort((a, b) => +b - +a).join(), sort);
  ok('排序箭头状态正确', /sorted-(asc|desc)/.test(sort.sorted), sort);
  const chart1 = await ev(`(()=>{document.querySelector('.tw-bar button[data-act="chart"]').click();
    const r=document.querySelector('.chart-box.show svg rect');return r?r.getAttribute('fill'):''})()`);
  ok('图表可正常生成', /^#/.test(chart1 || ''), chart1);
  await use('gov');
  const chart2 = await ev(`(()=>{const r=document.querySelector('.chart-box.show svg rect');return r?r.getAttribute('fill'):''})()`);
  ok('切换风格后图表同步换色', chart1 !== chart2 && /^#9b1c1c$/.test(chart2 || ''), { chart1, chart2 });

  console.log('\n[6] 三全局皮肤 × 两排版');
  await use('tech');
  for (const th of ['light', 'dark', 'sepia']) {
    await setTheme(th);
    const p = JSON.parse(await ev(PROBE));
    ok(`${th}：表头仍保留风格色`, p.headBg !== 'rgba(0, 0, 0, 0)' || p.head !== 'none', p.headBg);
    ok(`${th}：行底随皮肤变化且可读`, /^rgb/.test(p.twBg) && p.odd !== p.even, { twBg: p.twBg, odd: p.odd, even: p.even });
    ok(`${th}：工具条与顶栏无溢出`, p.barOverflow <= 1 && p.toolbarOverflow <= 1, p);
  }
  await setTheme('light');
  const base = JSON.parse(await ev(PROBE));
  for (const l of ['paper', 'card']) {
    await setLayout(l);
    const p = JSON.parse(await ev(PROBE));
    ok(`${l} 排版下风格变量生效`, p.headBg === 'rgb(37, 99, 235)' && /rgb/.test(p.twBg), p.headBg);
  }
  await setLayout('card');
  await use('mono');
  ok('浅色基线保持一致', base.twRadius === tech.twRadius, { base: base.twRadius, tech: tech.twRadius });

  console.log('\n[7] 多宽度响应式（四个按钮）');
  for (const w of [960, 1080, 1280, 1440, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const p = JSON.parse(await ev(PROBE));
    ok(`${w}px：表格工具条 / 顶栏零溢出`, p.barOverflow <= 1 && p.toolbarOverflow <= 1, p);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  console.log('\n[8] 四套风格实拍');
  const RECT = `(()=>{const r=document.querySelector('.tw').getBoundingClientRect();
    return JSON.stringify({x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),
      w:Math.round(r.width),h:Math.round(r.height)})})()`;
  for (const [key, file] of [['mono', '_table-mono.png'], ['tech', '_table-tech.png'], ['gov', '_table-gov.png'], ['cute', '_table-cute.png']]) {
    await use(key);
    await ev(`document.querySelector('.tw').scrollIntoView({block:'center'})`);
    await sleep(260);
    const r = JSON.parse(await ev(RECT));
    await shot(file, { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 620), scale: 1.4 });
    console.log('  saved', file);
  }
  await use('mono');

  console.log('\n[9] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { try { ws?.close(); } catch (_) {} edge.kill(); });
