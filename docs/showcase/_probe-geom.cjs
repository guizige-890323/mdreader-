const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  await p.goto('file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const cards=[...document.querySelectorAll('.card')].slice(0,5).map(e=>{const b=e.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x),y:Math.round(b.y)};});
    const cw = getComputedStyle(document.documentElement).getPropertyValue('--cw');
    const ch = getComputedStyle(document.documentElement).getPropertyValue('--ch');
    const media = document.querySelector('.card-media');
    const mb = media.getBoundingClientRect();
    return {cards, cw, ch, media:[Math.round(mb.width),Math.round(mb.height)]};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
