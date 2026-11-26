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
    const rd = document.getElementById('reader');
    const bars = [...document.querySelectorAll('.code-bar')];
    // 滚到第一个代码块
    const bar = bars[0];
    if (bar) rd.scrollTop = bar.getBoundingClientRect().top + rd.scrollTop - 200;
    return new Promise(res => setTimeout(() => {
      const out = bars.slice(0,4).map((b,i) => {
        const br = b.getBoundingClientRect();
        const pre = b.parentElement.querySelector('pre') || b.nextElementSibling;
        const pr = pre ? pre.getBoundingClientRect() : null;
        return { i, bar: [Math.round(br.x),Math.round(br.y),Math.round(br.width),Math.round(br.height)],
          pre: pr ? [Math.round(pr.x),Math.round(pr.y),Math.round(pr.width),Math.round(pr.height)] : null,
          preLines: pre ? (pre.textContent.match(/\n/g)||[]).length + 1 : 0 };
      });
      res({ bars: out, rdTop: rd.scrollTop, vh: innerHeight });
    }, 700));
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
