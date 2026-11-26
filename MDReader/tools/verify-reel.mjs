// 验证欢迎屏轮播 + 顶栏结构 + 无 JS 错误
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'file:///' + path.join(ROOT, 'dist', 'MDReader.html').replace(/\\/g, '/');
const PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1280,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '_shots', 'edge-verify')}`, 'about:blank'], { stdio: 'ignore' });

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
    if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push('CONSOLE: ' + JSON.stringify(m.params.args?.map(a => a.value)));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(1800);

  const struct = await ev(`JSON.stringify({
    h1: document.querySelector('#welcome h1') && document.querySelector('#welcome h1').textContent,
    lead: !!document.querySelector('#welcome p.lead'),
    wfNote: !!document.querySelector('.wf-note'),
    feats: document.querySelectorAll('#reelFeats .w-card:not([data-clone])').length,
    featClones: document.querySelectorAll('#reelFeats .w-card[data-clone]').length,
    featSnap: getComputedStyle(document.getElementById('reelFeats')).scrollSnapType,
    featTrackW: Math.round(document.getElementById('reelFeats').getBoundingClientRect().width),
    mainW: document.querySelector('.main').clientWidth,
    featScrollable: document.getElementById('reelFeats').scrollWidth,
    shots: document.querySelectorAll('#reelShots .shot-card').length,
    dotsF: document.querySelectorAll('#dotsFeats button').length,
    dotsS: document.querySelectorAll('#dotsShots button').length,
    imgsLoaded: Array.from(document.querySelectorAll('#reelShots img')).filter(i=>i.complete&&i.naturalWidth>0).length,
    recentBtn: (function(){
      var b=document.getElementById('btnRecent'), s=b.querySelector('.fi-svg'),
          badge=document.getElementById('recentBadge'), lab=b.querySelector('.tb-label');
      var r=s.getBoundingClientRect(), pi=document.querySelector('.rp-title .feat-ico');
      return {svgW:Math.round(r.width), svgH:Math.round(r.height),
        label:lab?lab.textContent:'', hasBadge:!!badge, badgeHidden:badge?badge.hidden:null,
        panelIconW:pi?Math.round(parseFloat(getComputedStyle(pi).width)):0,
        title:b.title, btnW:Math.round(b.getBoundingClientRect().width)};
    })(),
    toolbarOrder: (function(){
      var c=Array.from(document.querySelector('.toolbar').children);
      var idx=function(sel){return c.findIndex(function(x){return x.matches(sel)})};
      var iDir=idx('#btnOpenDir'), iFind=idx('.searchbox'), iEdit=idx('#btnEdit'),
          iSave=idx('#btnSave'), iLayout=idx('#layoutSel'), iFD=idx('#btnFontDown'), iFU=idx('#btnFontUp');
      var t=document.querySelector('.toolbar');
      return {searchAfterOpenDir:iFind-iDir, editGroupTogether:(iSave-iEdit===1&&iLayout-iSave===1&&iFD-iLayout===1&&iFU-iFD===1),
        spacerAfterFind:idx('.spacer')>iFind, overflow:t.scrollWidth-t.clientWidth,
        order:c.map(function(x){return x.id||x.className}).join('|')};
    })(),
    reelOverflowX: getComputedStyle(document.getElementById('reelFeats')).overflowX,
    scroll0: document.getElementById('reelShots').scrollLeft,
    sideFoot: (function(){
      var e=document.querySelector('.side-foot'); if(!e) return null;
      var r=e.getBoundingClientRect();
      return {x:Math.round(r.left),bottom:Math.round(r.bottom),vh:innerHeight,
        qr:!!e.querySelector('.sf-qr'),mail:!!e.querySelector('a[href^="mailto:"]'),
        text:e.innerText.replace(/\\s+/g,' ').trim(),
        oldWelcomeFooter:!!document.querySelector('.w-foot')};
    })()
  })`);
  console.log('STRUCT =', struct);
  await sleep(1200);
  const after = await ev(`JSON.stringify({shotsScroll:document.getElementById('reelShots').scrollLeft,featsScroll:document.getElementById('reelFeats').scrollLeft,activeDot:Array.from(document.querySelectorAll('#dotsShots button')).findIndex(b=>b.classList.contains('on'))})`);
  console.log('AFTER_AUTOPLAY =', after);
  await sleep(1400);
  const more = await ev(`JSON.stringify({featsScroll:document.getElementById('reelFeats').scrollLeft, maxScroll:document.getElementById('reelFeats').scrollWidth/2, dotOn:Array.from(document.querySelectorAll('#dotsFeats button')).findIndex(b=>b.classList.contains('on'))})`);
  console.log('MARQUEE_MORE =', more);
  const png = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(ROOT, '_shots', 'verify-welcome.png'), Buffer.from(png.result.data, 'base64'));
  // 造一条最近记录并重载，验证徽章数字与动态 title 确实反映「使用情况」
  await ev(`localStorage.setItem('mdreader.recent', JSON.stringify([{name:'示例.md',path:'C:/demo/示例.md',ts:Date.now()}]))`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1300);
  const badge = await ev(`JSON.stringify((function(){
    var b=document.getElementById('recentBadge');
    return {text:b.textContent,hidden:b.hidden,title:document.getElementById('btnRecent').title,
      panelBtnVisible:getComputedStyle(b).display!=='none'};
  })())`);
  console.log('BADGE_WITH_RECORD =', badge);
  const pngBadge = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(ROOT, '_shots', 'verify-welcome-badge.png'), Buffer.from(pngBadge.result.data, 'base64'));
  await ev(`localStorage.removeItem('mdreader.recent')`);
  console.log('JS_ERRORS =', errors.length ? JSON.stringify(errors) : 'none ✅');
} catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch (_) {} edge.kill(); }
