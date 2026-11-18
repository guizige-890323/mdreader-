/* 发布前基线校准 2026-11-15：对齐示例文档 v1.4「使用指南与功能导览」、
   MDFlow 事件委托、顶栏柔光开关、role=switch 开关语义与欢迎屏海报图。
   断言强度保持不变，仅更新过期的期望值/选择器/事件模型。 */
/* 浏览器端验证：MD FLOW 连线流水动效（动画在跑、层级配色、主题、hover、导出、减弱动效、打印）
   并连续抓帧输出 _flow-frames/*.png，供 gen_flow_gif.py 合成预览 GIF */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const FRAMES = path.join(OUT, '_flow-frames');
const PORT = 9352;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-flow-motion-profile')}`, 'about:blank'
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
    return null;
  }
  return r.result?.result?.value;
}
async function png(file, clip) {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = clip;
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const PROBE = `(()=>{
  const svg=document.querySelector('.mf-svg'); if(!svg) return JSON.stringify({none:true});
  const flows=[...svg.querySelectorAll('.mf-flow')];
  const halos=[...svg.querySelectorAll('.mf-flow-halo')];
  const st=getComputedStyle(flows[0]);
  const sty=svg.querySelector('style');
  return JSON.stringify({
    flows:flows.length, halos:halos.length,
    lines:svg.querySelectorAll('.mf-line').length,
    edges:svg.querySelectorAll('.mf-edge').length,
    anim:st.animationName, dur:st.animationDuration, dash:st.strokeDasharray,
    delays:[...new Set(flows.map(f=>getComputedStyle(f).animationDelay))],
    colors:[...new Set(flows.map(f=>getComputedStyle(f).stroke))],
    keyframes:!!sty && sty.textContent.indexOf('@keyframes mf-stream')>=0,
    animCount:flows[0].getAnimations().length
  })
})()`;
const CLOCK = `(()=>{const f=document.querySelector('.mf-flow');const a=f.getAnimations()[0];
  return JSON.stringify({t:a?a.currentTime:null,off:getComputedStyle(f).strokeDashoffset})})()`;

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
  await sleep(1100);
  await ev(`document.getElementById('wDemo').click()`);
  await sleep(1800);
  await ev(`document.querySelector('.mf-wrap').scrollIntoView({block:'center'})`);
  await sleep(350);

  console.log('\n[1] 流水层结构');
  const a = JSON.parse(await ev(PROBE));
  console.log('  probe =', JSON.stringify(a));
  ok('每条边 1 亮线 + 1 光晕', a.flows === a.edges && a.halos === a.edges && a.lines === a.edges,
    { flows: a.flows, halos: a.halos, lines: a.lines, edges: a.edges });
  ok('SVG 内嵌 @keyframes mf-stream', a.keyframes === true);
  ok('动画名 / 周期 / 虚线正确', a.anim === 'mf-stream' && a.dur === '1.6s' && /11/.test(a.dash),
    { anim: a.anim, dur: a.dur, dash: a.dash });
  ok('各边相位错开（不同步闪动）', a.delays.length >= 4, a.delays);
  ok('流水色按层级分色', a.colors.length >= 3 && a.colors.every(c => /^rgb/.test(c)), a.colors);

  console.log('\n[2] 动画确实在跑');
  const t1 = JSON.parse(await ev(CLOCK));
  await sleep(320);
  const t2 = JSON.parse(await ev(CLOCK));
  console.log('  clock =', JSON.stringify({ t1, t2 }));
  ok('Web Animation 实例存在', a.animCount >= 1, a.animCount);
  ok('currentTime 持续推进', typeof t1.t === 'number' && typeof t2.t === 'number' && t2.t > t1.t, { t1, t2 });
  ok('stroke-dashoffset 逐帧变化', t1.off !== t2.off, { t1, t2 });

  console.log('\n[3] 悬停高亮与流水协同');
  /* 同上：bind() 为 svg 根节点 mouseover 委托，mouseenter 不冒泡。 */
  await ev(`document.querySelectorAll('.mf-node')[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  await sleep(260);
  const hov = JSON.parse(await ev(`(()=>{
    const hi=document.querySelector('.mf-edge.is-hi .mf-flow');
    const lo=document.querySelector('.mf-svg.has-focus .mf-edge:not(.is-hi)');
    return JSON.stringify({hiOp:hi?getComputedStyle(hi).opacity:'',hiW:hi?getComputedStyle(hi).strokeWidth:'',
      loOp:lo?getComputedStyle(lo).opacity:''});
  })()`));
  ok('关联边流水加亮加粗', hov.hiOp === '1' && parseFloat(hov.hiW) > 2.5, hov);
  ok('非关联边整体淡出', parseFloat(hov.loOp) < 0.2, hov);
  await ev(`document.querySelector('.mf-svg').dispatchEvent(new MouseEvent('mouseleave'))`);

  console.log('\n[4] 三主题配色');
  const themeColors = { light: a.colors };
  for (const t of ['dark', 'sepia']) {
    await ev(`(()=>{const s=document.getElementById('themeSel');s.value='${t}';s.dispatchEvent(new Event('change'))})()`);
    await sleep(1700);
    await ev(`document.querySelector('.mf-wrap').scrollIntoView({block:'center'})`);
    const p = JSON.parse(await ev(PROBE));
    themeColors[t] = p.colors;
    ok(`${t}：流水层仍完整且动画在`, p.flows === a.edges && p.anim === 'mf-stream', p);
    ok(`${t}：颜色解析为真实色值`, p.colors.every(c => /^rgb/.test(c)), p.colors);
  }
  ok('深色主题下流水色随之调整',
    JSON.stringify(themeColors.dark) !== JSON.stringify(themeColors.light),
    { light: themeColors.light, dark: themeColors.dark });

  console.log('\n[5] 导出与静态场景');
  const ser = JSON.parse(await ev(`(()=>{const t=window.MDFlow.serialize(document.querySelector('.mf-svg'));
    return JSON.stringify({len:t.length,kf:t.indexOf('@keyframes mf-stream')>=0,
      vars:(t.match(/var\\(/g)||[]).length,xmlns:t.indexOf('xmlns=')>=0,
      flows:(t.match(/class="mf-flow"/g)||[]).length})})()`));
  ok('下载 SVG 自带流水动效', ser.kf && ser.flows === a.edges, ser);
  ok('导出已固化 CSS 变量', ser.vars === 0 && ser.xmlns, ser);

  await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(220);
  const rm = await ev(`getComputedStyle(document.querySelector('.mf-flow')).display`);
  ok('系统「减少动态效果」时关闭流水', rm === 'none', rm);

  await send('Emulation.setEmulatedMedia', { media: 'print', features: [] });
  await sleep(220);
  const pr = await ev(`getComputedStyle(document.querySelector('.mf-flow')).display`);
  ok('打印 / PDF 只保留静态连线', pr === 'none', pr);

  await send('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
  await ev(`(()=>{const s=document.getElementById('themeSel');s.value='light';s.dispatchEvent(new Event('change'))})()`);
  await sleep(1700);
  await ev(`document.querySelector('.mf-wrap').scrollIntoView({block:'center'})`);
  await sleep(300);
  ok('恢复常规媒体后流水重启',
    (await ev(`getComputedStyle(document.querySelector('.mf-flow')).display`)) !== 'none');

  console.log('\n[6] 抓取动效帧');
  const rect = JSON.parse(await ev(`(()=>{const r=document.querySelector('.mf-wrap').getBoundingClientRect();
    return JSON.stringify({x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),
      w:Math.round(r.width),h:Math.round(r.height)})})()`));
  const clip = { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1.5 };
  mkdirSync(FRAMES, { recursive: true });
  const N = 10;
  for (let i = 0; i < N; i++) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
    const buf = Buffer.from(r.result.data, 'base64');
    writeFileSync(path.join(FRAMES, 'f' + String(i).padStart(2, '0') + '.png'), buf);
    if (i === 0) writeFileSync(path.join(OUT, '_flow-stream-still.png'), buf);
    await sleep(135);
  }
  const first = (await import('node:fs')).readFileSync(path.join(FRAMES, 'f00.png'));
  const last = (await import('node:fs')).readFileSync(path.join(FRAMES, 'f09.png'));
  ok('连续两帧画面不同（视觉上确实在流动）', !first.equals(last));
  console.log('  saved', N, 'frames ->', FRAMES);

  console.log('\n[7] 运行时错误');
  ok('JS 异常 0 条', errors.length === 0, errors.slice(0, 4));

  console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
  ws.close();
  edge.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
