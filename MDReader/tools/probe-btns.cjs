const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 861 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1500);
  const list = await p.evaluate(() => [...document.querySelectorAll('button,a')].map(e => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { id: e.id || '', cls: e.className, txt: (e.textContent || '').trim().slice(0, 24),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(Boolean).filter(o => o.y > 200 && o.y < 500));
  console.log(JSON.stringify(list, null, 1));
  await b.close();
})();
