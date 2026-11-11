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

  const ids = ['btnSide','btnOpenFile','btnOpenDir','btnReload','btnEdit','btnSave','layoutSel',
    'btnFontDown','btnFontUp','btnRecent','btnExport','btnPrint','btnWord',
    'skinLight','skinDark','skinSepia'];
  let allPass = true;
  for (const w of [960, 1080, 1200, 1254, 1280, 1440, 1500, 1600, 1700, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(320);
    const r = await ev(`JSON.stringify((function(){
      var t=document.querySelector('.toolbar'), cs=Array.from(t.children);
      var ix=function(s){return cs.findIndex(function(x){return x.matches(s)})};
      var hidden=${JSON.stringify(ids)}.filter(function(id){
        var e=document.getElementById(id); if(!e) return true;
        var b=e.getBoundingClientRect(); return b.right>t.getBoundingClientRect().right+1 || b.width===0;
      });
      var skins=Array.from(document.querySelectorAll('.skin-btn')).map(function(b){
        var r=b.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};
      });
      return {overflow:t.scrollWidth-t.clientWidth, vw:innerWidth,
        searchW:Math.round(document.querySelector('.searchbox').getBoundingClientRect().width),
        searchMin:getComputedStyle(document.querySelector('.searchbox')).minWidth,
        searchAfterOpenDir:ix('.searchbox')-ix('#btnOpenDir'),
        editTogether:(ix('#btnSave')-ix('#btnEdit')===1 && ix('#layoutSel')-ix('#btnSave')===1 &&
                      ix('#btnFontDown')-ix('#layoutSel')===1 && ix('#btnFontUp')-ix('#btnFontDown')===1),
        exportAfterRecent:(ix('#btnExport')-ix('#btnRecent')===1 && ix('#btnPrint')-ix('#btnExport')===1 &&
                           ix('#btnWord')-ix('#btnPrint')===1),
        skinLast:cs[cs.length-1].id==='skinSwitch',
        skins:skins,
        labelsVisible:getComputedStyle(document.querySelector('.tb-label')).display!=='none',
        hidden:hidden};
    })())`);
    const o = JSON.parse(r);
    const pass = o.overflow <= 0 && o.hidden.length === 0 && o.editTogether &&
      o.exportAfterRecent && o.skinLast && o.searchAfterOpenDir === 2 &&
      o.skins.length === 3 && o.skins.every(s => s.w >= 24 && s.h >= 22);
    if (!pass) allPass = false;
    console.log(`W=${w}`, pass ? 'PASS' : 'FAIL', JSON.stringify(o));
  }
  console.log('RESULT =', allPass ? 'ALL PASS ✅' : 'FAILED ❌');
  console.log('JS_ERRORS =', errors.length ? errors.join(' | ') : 'none ✅');
} catch (e) {
  console.error('FAILED:', e.message);
} finally {
  try { ws?.close(); } catch (_) {}
  edge.kill();
}
