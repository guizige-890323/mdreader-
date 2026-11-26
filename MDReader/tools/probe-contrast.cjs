const { chromium } = require('playwright-core');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark', 'sepia']) {
    for (const pm of [false, true]) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      await p.goto(F); await p.waitForTimeout(1300);
      await p.evaluate(T => document.getElementById('skin' + T).click(), theme[0].toUpperCase() + theme.slice(1));
      await p.waitForTimeout(400);
      if (pm) { await p.evaluate(() => { const m = document.getElementById('btnPaperMatte'); (m.querySelector('.sw-track') || m).click(); }); await p.waitForTimeout(600); }
      await p.evaluate(() => document.getElementById('app').classList.add('focus'));
      await p.waitForTimeout(600);
      const fr = await p.$('#focusRender');
      const box = await fr.boundingBox();
      await p.screenshot({ path: `_shots/rail-${theme}-${pm ? 'pm' : 'n'}.png`, clip: box });
      const s = await p.evaluate(() => {
        const fr = document.getElementById('focusRender');
        const cs = getComputedStyle(fr);
        const ico = fr.querySelector('[data-proxy] .fr-ico');
        return { bg: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow.slice(0, 40),
          icoColor: ico ? getComputedStyle(ico).color : null,
          appBg: getComputedStyle(document.getElementById('app')).backgroundColor };
      });
      console.log(theme, pm ? 'pm' : '--', JSON.stringify(s));
      await p.close();
    }
  }
  await b.close();
})();
