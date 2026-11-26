const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  for (const [w,h,tag] of [[1440,900,'1440'],[1035,900,'1035'],[820,900,'820']]) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.resolve(__dirname, `_cr07-${tag}-first.png`) });
    const m = await p.evaluate(() => ({
      H: document.documentElement.scrollHeight,
      stageTop: Math.round(document.getElementById('stage').getBoundingClientRect().top + scrollY),
      ctaBottom: Math.round(document.querySelector('.cta').getBoundingClientRect().bottom + scrollY),
      overflowX: document.documentElement.scrollWidth > innerWidth,
      firstCardTop: Math.round(document.querySelector('.card').getBoundingClientRect().top)
    }));
    console.log(tag, JSON.stringify(m));
    await p.close();
  }
  await b.close();
})();
