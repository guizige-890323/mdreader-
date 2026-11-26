const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1500);
  // 真实流程：点「查看示例文档」→ 点专注
  await p.click('#wDemo'); await p.waitForTimeout(1500);
  await p.click('#btnFocus'); await p.waitForTimeout(900);
  const r1 = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const rc = fr.getBoundingClientRect();
    const el = document.elementFromPoint(rc.left + 20, rc.top + 100);
    return { cls: fr.className, display: getComputedStyle(fr).display,
      rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)],
      hitAtRail: el ? (el.id || el.className || el.tagName) : 'NULL',
      appCls: document.getElementById('app').className,
      paper: !!document.querySelector('.paper'),
      matte: document.getElementById('app').className };
  });
  console.log('after btnFocus:', JSON.stringify(r1));
  await p.screenshot({ path: '_shots/probe-focus-real.png' });

  // 再测纸张模式 + 柔光
  await p.evaluate(() => { const m = document.getElementById('btnPaperMatte'); const t = m && m.querySelector('.sw-track'); if (t) t.click(); });
  await p.waitForTimeout(600);
  const r2 = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const rc = fr.getBoundingClientRect();
    const el = document.elementFromPoint(rc.left + 20, rc.top + 100);
    return { display: getComputedStyle(fr).display, zIndex: getComputedStyle(fr).zIndex,
      hitAtRail: el ? (el.id || el.className || el.tagName) : 'NULL',
      rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)] };
  });
  console.log('with matte:', JSON.stringify(r2));
  await p.screenshot({ path: '_shots/probe-focus-matte.png' });
  await b.close();
})();
