/* 发布前基线校准 2026-11-15：对齐示例文档 v1.4「使用指南与功能导览」、
   MDFlow 事件委托、顶栏柔光开关、role=switch 开关语义与欢迎屏海报图。
   断言强度保持不变，仅更新过期的期望值/选择器/事件模型。 */
/* 浏览器端验证：MDFlow 真实渲染、主题适配、悬停高亮、SVG 导出，并输出对比截图 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9344;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-flow-profile')}`, 'about:blank'
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
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  console.log('  saved', file);
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}
const PROBE = `(()=>{
  const svg=document.querySelector('.mf-svg'), bar=document.querySelector('.mf-bar');
  const wrap=document.querySelector('.mf-wrap');
  const bx=svg?svg.getBoundingClientRect():{width:0,height:0};
  return JSON.stringify({
    wraps:document.querySelectorAll('.mf-wrap').length,
    svgs:document.querySelectorAll('.mf-svg').length,
    nodes:document.querySelectorAll('.mf-node').length,
    edges:document.querySelectorAll('.mf-edge').length,
    labels:document.querySelectorAll('.mf-elabel').length,
    native:document.querySelectorAll('.mermaid').length,
    errs:document.querySelectorAll('.mermaid-err').length,
    viewBox:svg?svg.getAttribute('viewBox'):'',
    barFill:bar?getComputedStyle(bar).fill:'',
    bgFill:svg?getComputedStyle(svg.querySelector('rect')).fill:'',
    boxW:wrap?wrap.getBoundingClientRect().width:0,
    svgW:Math.round(bx.width), svgH:Math.round(bx.height),
    cssVar: getComputedStyle(document.documentElement).getPropertyValue('--mf-a1').trim()
  });
})()`;

try {
  let url;
  for (let i = 0; i < 40; i++) {
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
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.text + ' / ' + (m.params.exceptionDetails.exception?.description || ''));
    }
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(800);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1100);

  console.log('\n[1] 打开内置示例文档');
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1800);
  const a = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify(a));
  ok('MDFlow 接管（1 个图容器）', a.wraps === 1, a.wraps);
  ok('无原生 mermaid 兜底块', a.native === 0, a.native);
  ok('无渲染错误提示', a.errs === 0, a.errs);
  /* 基线校准 2026-11-15：示例文档 v1.4「使用指南与功能导览」内置 Mermaid
     为 A~I 共 9 节点 / 11 连线 / 4 个边标签（旧版 6/7/3 已作废）。 */
  ok('9 个节点', a.nodes === 9, a.nodes);
  ok('11 条连线', a.edges === 11, a.edges);
  ok('4 个边标签胶囊', a.labels === 4, a.labels);
  ok('CSS 变量解析为真实颜色', /^rgb/.test(a.barFill) && a.barFill !== 'rgb(0, 0, 0)', a.barFill);
  ok('图表宽度不溢出容器', a.svgW <= a.boxW + 2, { svgW: a.svgW, boxW: a.boxW });
  ok('viewBox 有效', /^0 0 \d+ \d+$/.test(a.viewBox), a.viewBox);

  await ev(`document.querySelector('.mf-wrap').scrollIntoView({block:'center'})`);
  await sleep(350);
  await shot('_flow-light.png');

  console.log('\n[2] 悬停高亮 / SVG 导出');
  const hov = JSON.parse(await ev(`(()=>{
    const n=document.querySelectorAll('.mf-node')[1];
    /* MDFlow.bind() 用 svg 根节点的 mouseover 委托（编辑状态回放会重建
       svg.innerHTML，监听器不能绑在 .mf-node 上）；mouseenter 不冒泡。 */
    n.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const svg=document.querySelector('.mf-svg');
    return JSON.stringify({focus:svg.classList.contains('has-focus'),hi:svg.querySelectorAll('.is-hi').length,
      dim:svg.querySelectorAll('.mf-edge:not(.is-hi)').length});
  })()`));
  ok('悬停进入焦点态', hov.focus === true, hov);
  ok('高亮节点与关联边', hov.hi >= 4, hov);
  await ev(`document.querySelector('.mf-svg').dispatchEvent(new MouseEvent('mouseleave'))`);
  const ser = JSON.parse(await ev(`(()=>{const t=window.MDFlow.serialize(document.querySelector('.mf-svg'));
    return JSON.stringify({len:t.length,hasVar:t.indexOf('var(')>=0,xmlns:t.indexOf('xmlns=')>=0,xml:t.slice(0,38)})})()`));
  ok('导出独立 SVG', ser.len > 4000 && ser.xmlns, ser);
  ok('导出已固化颜色变量', ser.hasVar === false, ser);

  console.log('\n[3] 深色主题重渲染');
  await ev(`(()=>{const s=document.getElementById('themeSel');s.value='dark';s.dispatchEvent(new Event('change'))})()`);
  await sleep(1600);
  const b = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify(b));
  ok('深色下仍由 MDFlow 接管', b.wraps === 1 && b.svgs === 1, b);
  ok('深色下节点/边数量不变', b.nodes === a.nodes && b.edges === a.edges, b);
  ok('强调色随主题变化', b.barFill !== a.barFill, { light: a.barFill, dark: b.barFill });
  await ev(`document.querySelector('.mf-wrap').scrollIntoView({block:'center'})`);
  await sleep(350);
  await shot('_flow-dark.png');

  console.log('\n[4] 护眼主题 / 纸张排版');
  await ev(`(()=>{let s=document.getElementById('themeSel');s.value='sepia';s.dispatchEvent(new Event('change'));
    s=document.getElementById('layoutSel');s.value='paper';s.dispatchEvent(new Event('change'))})()`);
  await sleep(1800);
  const c = JSON.parse(await ev(PROBE));
  ok('护眼+纸张下正常出图', c.wraps === 1 && c.nodes === a.nodes, c);
  ok('调色板随主题变化', c.barFill !== b.barFill, { dark: b.barFill, sepia: c.barFill });

  console.log('\n[5] 复杂语法回退到原生 Mermaid');
  const fb = await ev(`(()=>{
    const d=document.createElement('div'); d.className='mermaid';
    d.textContent='sequenceDiagram\\n  Alice->>Bob: 你好';
    document.body.appendChild(d);
    const vars=window.MDFlow.themeVars();
    window.mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:'base',themeVariables:vars,flowchart:{htmlLabels:true}});
    return window.mermaid.run({nodes:[d]}).then(()=>JSON.stringify({svg:!!d.querySelector('svg'),bg:(vars.background||'').trim()}))
      .catch(e=>JSON.stringify({err:e.message}));
  })()`);
  const fbr = JSON.parse(fb || '{}');
  ok('时序图由原生 Mermaid 渲染', fbr.svg === true, fbr);
  ok('兜底主题色取自当前皮肤', /^#|^rgb/.test(fbr.bg || ''), fbr);

  console.log('\n[6] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));

  console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) process.exitCode = 1;
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch (_) { }
  edge.kill();
}
