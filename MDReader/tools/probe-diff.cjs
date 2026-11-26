const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 861 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById('skinDark').click(); });
  await p.waitForTimeout(900);
  await p.screenshot({ path: '_shots/probe-dark-1920.png' });
  // 该区域是什么元素
  const info = await p.evaluate(() => {
    const out = [];
    for (const [x, y] of [[1230, 373], [1150, 373], [1000, 373]]) {
      const el = document.elementFromPoint(x, y);
      out.push({ pt: [x, y], tag: el && el.tagName, id: el && el.id, cls: el && el.className,
        txt: el && (el.textContent || '').trim().slice(0, 40) });
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
