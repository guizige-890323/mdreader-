const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of [[1920,1080],[1600,900],[1440,700],[1280,560],[1200,480],[1024,400],[900,360]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1100);
    await p.evaluate(() => document.getElementById('app').classList.add('focus'));
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const fr = document.getElementById('focusRender');
      const rc = fr.getBoundingClientRect();
      const last = fr.querySelector('[data-proxy="skinSepia"]').getBoundingClientRect();
      return { rect: [Math.round(rc.x),Math.round(rc.y),Math.round(rc.width),Math.round(rc.height)],
        scroll: [fr.scrollHeight, fr.clientHeight], lastY: Math.round(last.y+last.height),
        maxH: getComputedStyle(fr).maxHeight, inView: rc.bottom <= innerHeight && last.y+last.height <= innerHeight };
    });
    console.log((w+'x'+h).padEnd(10), JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
