const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 861 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => { document.getElementById('skinDark').click(); document.getElementById('wDemo').click(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: '_shots/probe-dark-doc.png' });
  // 是否有 table toolbar
  const info = await p.evaluate(() => {
    const el = document.elementFromPoint(1230, 373);
    const out = { el: el && (el.id || el.className || el.tagName) };
    const tw = document.querySelector('.tw-bar');
    if (tw) { const r = tw.getBoundingClientRect(); out.twBar = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }
    return out;
  });
  console.log(JSON.stringify(info));
  await b.close();
})();
