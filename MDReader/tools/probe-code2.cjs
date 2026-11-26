const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1300);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2400);
  const r = await p.evaluate(() => {
    const bars = [...document.querySelectorAll('.code-bar')];
    const b0 = bars[0];
    return { outer: b0.outerHTML.slice(0, 300),
      parentCls: b0.parentElement.className,
      parentHTML: b0.parentElement.outerHTML.slice(0, 400),
      grandCls: b0.parentElement.parentElement.className,
      preCount: document.querySelectorAll('pre').length,
      preWrapper: [...document.querySelectorAll('pre')].slice(0,3).map(x => ({ cls: x.className, parent: x.parentElement.className, h: Math.round(x.getBoundingClientRect().height) })),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
