const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 861 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1600);
  const pts = [[1230, 373], [1160, 373], [1300, 373]];
  for (const [x, y] of pts) {
    const r = await p.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'NULL';
      const rc = el.getBoundingClientRect();
      return { tag: el.tagName, id: el.id, cls: el.className, txt: (el.textContent || '').trim().slice(0, 30),
        rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)] };
    }, [x, y]);
    console.log(x, y, JSON.stringify(r));
  }
  // 欢迎页按钮几何
  const btn = await p.evaluate(() => ['wDemo', 'wNew'].map(id => {
    const e = document.getElementById(id); const r = e.getBoundingClientRect();
    return { id, txt: e.textContent.trim(), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  }));
  console.log(JSON.stringify(btn, null, 1));
  await b.close();
})();
