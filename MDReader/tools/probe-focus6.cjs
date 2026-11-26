const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.click('#wDemo'); await p.waitForTimeout(1200);
  await p.click('#btnFocus'); await p.waitForTimeout(800);
  const fr = await p.$('#focusRender');
  const box = await fr.boundingBox();
  console.log('rail box', JSON.stringify(box));
  await p.screenshot({ path: '_shots/probe-rail.png', clip: box });
  // 每个按钮单独裁
  const btns = await p.$$('#focusRender [data-proxy]');
  const info = [];
  for (let i = 0; i < btns.length; i++) {
    const bb = await btns[i].boundingBox();
    const name = await btns[i].getAttribute('data-proxy') + '/' + (await btns[i].getAttribute('data-val') || '');
    await p.screenshot({ path: `_shots/rail-b${String(i).padStart(2,'0')}.png`, clip: bb });
    info.push({ i, name, w: Math.round(bb.width), h: Math.round(bb.height) });
  }
  console.log(JSON.stringify(info));
  await b.close();
})();
