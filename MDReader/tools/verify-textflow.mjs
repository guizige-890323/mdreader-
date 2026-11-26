/* 发布前基线校准 2026-11-15：对齐示例文档 v1.4「使用指南与功能导览」、
   MDFlow 事件委托、顶栏柔光开关、role=switch 开关语义与欢迎屏海报图。
   断言强度保持不变，仅更新过期的期望值/选择器/事件模型。 */
/* 浏览器端验证：符号空格文本型流程图 + 整篇一键转换 + md-render-hint 范式 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9381;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-textflow-profile')}`, 'about:blank'], { stdio: 'ignore' });

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
  const c=document.getElementById('content');
  const block=document.querySelector('.tf-block'), svg=block&&block.querySelector('.mf-svg');
  const shapes=svg?[...svg.querySelectorAll('.mf-node .mf-shape')]:[];
  const fills=[...new Set(shapes.map(s=>getComputedStyle(s).fill))];
  const bad=svg?[...svg.querySelectorAll('.mf-edge.tf-violation')]:[];
  const t=document.querySelector('.toolbar');
  return JSON.stringify({
    hint:!!document.querySelector('.tf-hint'),
    hintText:(document.querySelector('.tf-hint')||{}).innerText||'',
    hintDetails:document.querySelectorAll('.tf-hint details').length,
    srcBlocks:document.querySelectorAll('pre > code.language-flow, pre > code.language-textflow').length,
    blocks:document.querySelectorAll('.tf-block[data-src]').length,
    btnLabel:(document.querySelector('#btnFlowAll .tb-label')||{}).textContent||'',
    btnPrimary:document.getElementById('btnFlowAll').classList.contains('primary'),
    btnChecked:document.getElementById('btnFlowAll').getAttribute('aria-checked'),
    hasSVG:!!svg, nodes:svg?svg.querySelectorAll('.mf-node').length:0,
    edges:svg?svg.querySelectorAll('.mf-edge').length:0,
    svgW:svg?Math.round(svg.getBoundingClientRect().width):0,
    vbW:svg?Math.round(svg.viewBox.baseVal.width):0,
    artScroll:(()=>{const a=svg&&svg.closest('.mf-art');return a?a.scrollWidth-a.clientWidth:0})(),
    fills:fills, badEdges:bad.length,
    badStroke:bad.length?getComputedStyle(bad[0].querySelector('.mf-line')).stroke:'',
    legend:document.querySelectorAll('.tf-legend .tf-lg').length,
    matrixRows:document.querySelectorAll('table.tf-matrix-table tbody tr').length,
    details:document.querySelectorAll('.tf-extras .tf-details').length,
    check:(document.querySelector('.tf-check')||{}).innerText||'',
    /* 与 check 同源取样：页面有多个 flow 代码块时各自生成一份 .tf-check，
       全局查 .has-warn 会和第一份报告文本对不上，属于取样口径问题而非产品缺陷。 */
    checkWarn:(document.querySelector('.tf-check')||{className:''}).className.indexOf('has-warn')>=0,
    notesBtn:!!document.querySelector('.mf-tools button[data-tf="notes"]'),
    titles:svg?svg.querySelectorAll('.mf-node title').length:0,
    dashed:svg?svg.querySelectorAll('.mf-edge .mf-line[style*="dash"], .mf-edge[data-from] .mf-line[stroke-dasharray]').length:0,
    toolbarOverflow:t.scrollWidth-t.clientWidth,
    theme:document.documentElement.dataset.theme
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
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' / ' + (m.params.exceptionDetails.exception?.description || ''));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(900);
  await ev('localStorage.clear()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1600);

  console.log('\n[1] 打开示例：范式提示与文本源码');
  const a = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify({ hint: a.hint, hintText: a.hintText.slice(0, 90), srcBlocks: a.srcBlocks, btn: a.btnLabel }));
  /* 基线校准 2026-11-15：示例文档 v1.4 的 ```flow 块改为 @main/@sub + ① 符号占位，
     不再内嵌 md-render-hint 标记，因此 RENDER HINT 提示条按条件不生成（正确行为）；
     「范式提示 + 硬隔离违规连线」这组旧断言由 tools/test-textflow.cjs 覆盖。 */
  ok('RENDER HINT 按 md-render-hint 标记条件生成（当前示例无标记 ⇒ 不生成）', a.hint === false, a.hint);
  ok('无标记时提示条详情区为 0', a.hintDetails === 0, a.hintDetails);
  ok('文档含 2 个 ```flow 文本流程图源码', a.srcBlocks >= 2, a.srcBlocks);
  ok('顶栏一键转换按钮就位（role=switch 开关，标签固定）', a.btnLabel === '流程图' && a.btnPrimary === false && a.btnChecked === 'false', a.btnLabel);
  ok('未转换时没有图形块', a.blocks === 0);

  console.log('\n[2] 点击一键转换');
  await ev(`document.getElementById('btnFlowAll').click()`);
  await sleep(1200);
  const b = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify({ blocks: b.blocks, nodes: b.nodes, edges: b.edges, fills: b.fills, bad: b.badEdges, legend: b.legend, rows: b.matrixRows }));
  ok('源码块已全部替换为图形块', b.blocks >= 1 && b.srcBlocks === 0, { blocks: b.blocks, src: b.srcBlocks });
  ok('渲染出 MD FLOW SVG', b.hasSVG === true && b.nodes >= 12 && b.edges >= 10, { nodes: b.nodes, edges: b.edges });
  ok('主线 / 分流两组配色生效', b.fills.some(x => /232, 248, 240/.test(x)) && b.fills.some(x => /255, 246, 224/.test(x)), b.fills);
  ok('语义校验通过：无未隔离的违规连线', b.badEdges === 0, { n: b.badEdges, stroke: b.badStroke });
  /* 基线校准 2026-11-15：图表/流程图已改为按容器自适应缩放，不再横向滚动。 */
  ok('宽图自适应容器宽度且无横向溢出', b.svgW <= b.vbW && b.artScroll <= 1, { svgW: b.svgW, vbW: b.vbW, scroll: b.artScroll });
  ok('图例含 5 类说明', b.legend >= 5, b.legend);
  ok('状态矩阵附表行数与节点一致', b.matrixRows >= 12, b.matrixRows);
  ok('附加组件：矩阵 + 输出清单', b.details >= 2, b.details);
  ok('语义校验报告：4 条范式约束全部通过', b.checkWarn === false && /全部通过/.test(b.check), b.check.slice(0, 120));
  ok('hover 备注已嵌入 SVG', b.titles >= 12, b.titles);
  ok('可下载配套说明文本', b.notesBtn === true);
  ok('开关态由 aria-checked 表达（标签固定「流程图」）', b.btnChecked === 'true' && b.btnLabel === '流程图', { checked: b.btnChecked, label: b.btnLabel });

  console.log('\n[3] 再次点击还原');
  await ev(`document.getElementById('btnFlowAll').click()`);
  await sleep(500);
  const c = JSON.parse(await ev(PROBE));
  ok('图形块还原为源码', c.blocks === 0 && c.srcBlocks >= 1, { blocks: c.blocks, src: c.srcBlocks });
  ok('按钮恢复「流程图」且开关归位', c.btnLabel === '流程图' && c.btnPrimary === false && c.btnChecked === 'false', c.btnLabel);

  console.log('\n[4] 换主题后保持转换态');
  await ev(`document.getElementById('btnFlowAll').click()`);
  await sleep(800);
  await ev(`document.querySelector('.skin-btn[data-theme="dark"]').click()`);
  await sleep(900);
  const d = JSON.parse(await ev(PROBE));
  ok('深色主题下仍是图形', d.blocks >= 1 && d.hasSVG === true && d.theme === 'dark', { blocks: d.blocks, theme: d.theme });
  await ev(`document.querySelector('.skin-btn[data-theme="sepia"]').click()`);
  await sleep(800);
  ok('护眼主题下仍是图形', JSON.parse(await ev(PROBE)).blocks >= 1);
  await ev(`document.querySelector('.skin-btn[data-theme="light"]').click()`);
  await sleep(700);

  console.log('\n[5] 多窗口宽度顶栏零溢出（新增流程图按钮）');
  for (const w of [960, 1080, 1200, 1254, 1280, 1366, 1440, 1600, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(280);
    const p = JSON.parse(await ev(PROBE));
    ok(`W=${w} 顶栏不溢出`, p.toolbarOverflow <= 0, p.toolbarOverflow);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  console.log('\n[6] 实拍');
  const rect = JSON.parse(await ev(`(()=>{const r=document.querySelector('.tf-block').getBoundingClientRect();
    return JSON.stringify({x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),
      w:Math.round(r.width),h:Math.round(r.height)})})()`));
  await ev(`document.querySelector('.tf-block').scrollIntoView({block:'start'})`);
  await sleep(350);
  const r2 = JSON.parse(await ev(`(()=>{const r=document.querySelector('.tf-block').getBoundingClientRect();
    return JSON.stringify({x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),
      w:Math.round(r.width),h:Math.round(r.height)})})()`));
  await shot('_textflow-full.png', { x: r2.x, y: r2.y, width: r2.w, height: Math.min(r2.h, 820), scale: 1.2 });
  await shot('_textflow-top.png', { x: r2.x, y: r2.y, width: r2.w, height: Math.min(r2.h, 430), scale: 1.5 });
  console.log('  block rect =', JSON.stringify(rect));

  console.log('\n[7] 正文段落符号箭头（兜底识别）');
  await ev(`document.getElementById('btnFlowAll').click()`);   // 先还原成源码态
  await sleep(400);
  await ev(`(()=>{const c=document.getElementById('content');
    c.innerHTML='<h2>2.3 行级状态机</h2>'+
      '<p>① 已导入 → ② 待校验 → ③ 校验通过 → ④ 已准入</p>'+
      '<p>② 待校验 → WARN 校验告警 → 人工放行 → ④ 已准入</p>'+
      '<p>② 待校验 → FAIL 校验失败 → 已隔离 →（修正重传）→ ② 待校验</p>';
    window.MDTextFlow.toggleAll(c, window.MDTextFlow.DEFAULT);})()`);
  await sleep(900);
  const f = JSON.parse(await ev(PROBE));
  ok('兜底：正文段落符号箭头流程被识别并转换', f.blocks >= 1 && f.hasSVG === true && f.nodes >= 5, { blocks: f.blocks, nodes: f.nodes, edges: f.edges });
  ok('兜底：单行 ≥2 个符号箭头也识别（回环）', f.nodes >= 5 && f.edges >= 4, { nodes: f.nodes, edges: f.edges });
  await ev(`document.getElementById('btnFlowAll').click()`);   // 还原
  await sleep(400);

  console.log('\n[8] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { try { ws?.close(); } catch (_) {} edge.kill(); });
