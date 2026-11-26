const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  await p.goto('file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2200);
  // tracks block geometry
  const g = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('.track').forEach((e,i)=>{const b=e.getBoundingClientRect(); out['track'+i]=[Math.round(b.x),Math.round(b.width),Math.round(b.height)];});
    document.querySelectorAll('.qcard').forEach((e,i)=>{const b=e.getBoundingClientRect(); out['q'+i]=[Math.round(b.x),Math.round(b.width),Math.round(b.height)];});
    return out;
  });
  console.log(JSON.stringify(g));
  for (const [name, sel] of [['tracks','#tracks'],['compare','#compare'],['quick','#quickstart']]) {
    await p.evaluate(s=>{const e=document.querySelector(s); scrollTo(0, e.getBoundingClientRect().top+scrollY-20);}, sel);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.resolve(__dirname, '_r7-'+name+'.png') });
  }
  await b.close();
})();
