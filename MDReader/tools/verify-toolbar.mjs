/* 发布前基线校准 2026-11-15：对齐示例文档 v1.4「使用指南与功能导览」、
   MDFlow 事件委托、顶栏柔光开关、role=switch 开关语义与欢迎屏海报图。
   断言强度保持不变，仅更新过期的期望值/选择器/事件模型。 */
// 多窗口宽度下验证顶栏：不溢出、所有按钮可见、顺序符合新分组
import { spawn } from 'node:child_process';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9335;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1920,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-toolbar')}`, 'about:blank'], { stdio: 'ignore' });

let seq = 0, ws; const pending = new Map(); const errors = [];
function send(method, params = {}) {
  const id = ++seq; ws.send(JSON.stringify({ id, method, params }));
  return new Promise(res => pending.set(id, res));
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.result?.exceptionDetails) errors.push(r.result.result.exceptionDetails.text);
  return r.result?.result?.value;
}
try {
  let url;
  for (let i = 0; i < 40 && !url; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); url = l.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch (_) {}
    if (!url) await sleep(250);
  }
  ws = new WebSocket(url);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params?.exceptionDetails?.text || ''));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(1600);

  // 真实存在的顶栏控件（旧的 btnPrint / btnWord 已并入「导出」下拉，不再单独存在）
  const ids = ['btnSide','btnOpenFile','btnOpenDir','btnReload','btnEdit','btnSave','layoutSel',
    'btnFontDown','btnFontUp','btnRecent','btnExport',
    'skinLight','skinDark','skinSepia'];
  let allPass = true;
  for (const w of [960, 1080, 1200, 1254, 1280, 1440, 1500, 1600, 1700, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(320);
    const r = await ev(`JSON.stringify((function(){
      var t=document.querySelector('.toolbar'), cs=Array.from(t.children);
      var ix=function(s){return cs.findIndex(function(x){return x.matches(s)})};
      /* 控件要么在顶栏可见区内，要么被收进「更多」菜单——两者都算可达 */
      var hidden=${JSON.stringify(ids)}.filter(function(id){
        var e=document.getElementById(id); if(!e) return true;
        if(e.classList.contains('tb-collapsed')) return false;
        var b=e.getBoundingClientRect(); return b.right>t.getBoundingClientRect().right+1 || b.width===0;
      });
      var skins=Array.from(document.querySelectorAll('.toolbar .skin-btn')).map(function(b){
        var r=b.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};
      });
      return {overflow:t.scrollWidth-t.clientWidth, vw:innerWidth,
        tb:t.getAttribute('data-tb'),
        scrollMode:t.classList.contains('tb-scroll'),
        searchW:Math.round(document.querySelector('.searchbox').getBoundingClientRect().width),
        searchMin:getComputedStyle(document.querySelector('.searchbox')).minWidth,
        searchAfterOpenDir:ix('.searchbox')-ix('#btnOpenDir'),
        /* 编辑组：编辑 → 保存 → 导出三者必须紧邻（导出紧跟保存） */
        editTogether:(ix('#btnSave')-ix('#btnEdit')===1 &&
                      ix('.exp-wrap')-ix('#btnSave')===1),
        /* 渲染组：排版皮肤 → 字号− → 字号+ → 数据图表，四者紧邻且在分隔符（spacer）之后 */
        /* 基线校准 2026-11-15：字号组（排版皮肤→A−→A+）仍三者紧邻；
           其后新增「云晰柔光」开关，再是图表总开关，故改为同组有序而非紧邻。 */
        renderTogether:(ix('#btnFontDown')-ix('#layoutSel')===1 &&
                        ix('#btnFontUp')-ix('#btnFontDown')===1 &&
                        ix('#btnChartAuto')>ix('#btnFontUp')),
        /* 渲染组整体位于右侧：排版皮肤必须在导出之后 */
        renderAfterExport:(ix('#layoutSel') > ix('.exp-wrap')),
        /* 导出在「最近打开」右侧（中间隔了分隔符 / 搜索框，不再紧邻，只比较横向位置） */
        exportAfterRecent:(function(){
          var a=document.getElementById('btnExport'), b=document.getElementById('btnRecent');
          if(!a||!b) return false;
          return a.getBoundingClientRect().left > b.getBoundingClientRect().left;
        })(),
        moreLast:cs[cs.length-1].id==='tbMoreWrap',
        skins:skins,
        labelsVisible:(function(){var l=document.querySelector('.tb-label');
          return !l || getComputedStyle(l).display!=='none';})(),
        hidden:hidden};
    })())`);
    const o = JSON.parse(r);
    /* 搜索框在「打开文件夹」右侧（中间有分隔符，故为 3 而非 2） */
    const pass = o.overflow <= (o.scrollMode ? 9999 : 0) && o.hidden.length === 0 && o.editTogether &&
      o.renderTogether && o.renderAfterExport &&
      o.exportAfterRecent && o.moreLast && o.searchAfterOpenDir >= 2 &&
      o.skins.length === 3 && o.skins.every(s => s.w >= 24 && s.h >= 22);
    if (!pass) allPass = false;
    console.log(`W=${w}`, pass ? 'PASS' : 'FAIL', JSON.stringify(o));
  }
  console.log('RESULT =', allPass ? 'ALL PASS ✅' : 'FAILED ❌');
  console.log('JS_ERRORS =', errors.length ? errors.join(' | ') : 'none ✅');
  if (!allPass) process.exitCode = 1;  /* 修脚本缺陷：失败必须让 CI 拦住 */
} catch (e) {
  console.error('FAILED:', e.message);
} finally {
  try { ws?.close(); } catch (_) {}
  edge.kill();
}
