const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const t=document.querySelector('[data-theme="dark"],#themeDark,.tt-dark'); if(t) t.click(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: path.resolve(__dirname,'_r7-welcome-dark.png') });
  const r = await p.evaluate(()=>{
    const pick=s=>{const e=document.querySelector(s); if(!e)return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)];};
    const cards=[...document.querySelectorAll('#gridFeats .w-card')].map(e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)];});
    return {cards:cards.slice(0,5), theme:document.documentElement.dataset.theme};
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
