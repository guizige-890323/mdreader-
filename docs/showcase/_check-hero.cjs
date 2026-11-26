const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const g = document.getElementById('heroGif');
    return { hasGif: !!g, loaded: g ? (g.naturalWidth>0) : false,
             nat: g ? [g.naturalWidth, g.naturalHeight] : null,
             box: g ? [Math.round(g.getBoundingClientRect().width), Math.round(g.getBoundingClientRect().height)] : null,
             overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  console.log(JSON.stringify(r), 'errs:', errs);
  await p.evaluate(() => { const g=document.getElementById('heroGif'); scrollTo(0, g.getBoundingClientRect().top+scrollY-40); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.resolve(__dirname, '_v5-hero-gif.png') });
  await b.close();
})();
