const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 861 }, deviceScaleFactor: 2 });
  await p.goto(F); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('skinDark').click());
  await p.waitForTimeout(700);
  // 欢迎页按 Ctrl+O
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const rc = fr.getBoundingClientRect();
    const welcome = document.getElementById('welcome');
    const wc = welcome ? welcome.getBoundingClientRect() : null;
    const wcs = welcome ? getComputedStyle(welcome) : null;
    // 沿菜单中心线逐点采样，看谁在最上层
    const hits = [];
    for (let y = rc.top + 10; y < rc.bottom; y += 40) {
      const el = document.elementFromPoint(rc.left + 20, y);
      hits.push({ y: Math.round(y), el: el ? (el.id || (typeof el.className === 'string' ? el.className : el.tagName)) : 'NULL' });
    }
    return {
      frCls: fr.className, frRect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)],
      frZ: getComputedStyle(fr).zIndex,
      welcomeRect: wc ? [Math.round(wc.x), Math.round(wc.y), Math.round(wc.width), Math.round(wc.height)] : null,
      welcomeDisp: wcs ? wcs.display : null, welcomeZ: wcs ? wcs.zIndex : null, welcomeBg: wcs ? wcs.backgroundColor : null,
      hits: hits.filter(h => !/fr-|focusRender/.test(String(h.el))),
      docOpen: !!document.querySelector('#content h1, #content .md-body'),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: '_shots/probe-welcome-focus-dark.png' });
  await b.close();
})();
