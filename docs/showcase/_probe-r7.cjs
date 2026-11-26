const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  await p.goto('file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2600);
  await p.screenshot({ path: path.resolve(__dirname, '_r7-top.png') });
  const r = await p.evaluate(() => {
    const pick = s => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.height)]; };
    return { header:pick('header'), hero:pick('.hero'), gif:pick('.hero-demo'), showcase:pick('#showcase'), stage:pick('#stage'), chips:pick('#chips'), tracks:pick('#tracks'), compare:pick('#compare'), quick:pick('#quickstart'), docH:document.documentElement.scrollHeight };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
