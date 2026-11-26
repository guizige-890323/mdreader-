const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  const f = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
  await p.goto(f);
  await p.waitForTimeout(3500);
  await p.screenshot({ path: path.resolve(__dirname,'_r7-welcome.png') });
  const r = await p.evaluate(()=>{
    const pick=s=>{const e=document.querySelector(s); if(!e)return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)];};
    return {grid:pick('#gridFeats'), stage:pick('.w-board'), doc:document.documentElement.scrollHeight};
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
