const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of [[1100,860],[900,860],[820,860],[760,860],[700,860],[640,860],[560,860],[480,860]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1000);
    await p.evaluate(() => document.getElementById('app').classList.add('focus'));
    await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const fr = document.getElementById('focusRender');
      const cs = getComputedStyle(fr); const rc = fr.getBoundingClientRect();
      const btn = fr.querySelector('[data-proxy="btnFontDown"]'); const bb = btn.getBoundingClientRect();
      const inner = document.querySelector('.reader-inner').getBoundingClientRect();
      return { disp: cs.display, rect:[Math.round(rc.x),Math.round(rc.y),Math.round(rc.width),Math.round(rc.height)],
        btn:[Math.round(bb.x),Math.round(bb.y),Math.round(bb.width)],
        innerL: Math.round(inner.x), overlap: Math.round(rc.right) > Math.round(inner.x) };
    });
    console.log((w+'x'+h).padEnd(10), JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
