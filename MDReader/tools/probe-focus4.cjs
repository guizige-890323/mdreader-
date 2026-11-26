const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const VIEWS = [[1440,900],[1366,768],[1280,720],[1024,700],[900,640],[1600,1000]];
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of VIEWS) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.getElementById('app').classList.add('focus'));
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const fr = document.getElementById('focusRender');
      const rc = fr.getBoundingClientRect();
      const cs = getComputedStyle(fr);
      const ico = fr.querySelector('.fr-ico');
      const ics = ico ? getComputedStyle(ico) : null;
      const btn = fr.querySelector('[data-proxy="btnFontDown"]');
      const bb = btn.getBoundingClientRect();
      return {
        cls: fr.className, disp: cs.display, w: Math.round(rc.width), h: Math.round(rc.height),
        y: Math.round(rc.y), overflow: cs.overflowY, maxH: cs.maxHeight,
        scrollH: fr.scrollHeight, clientH: fr.clientHeight,
        icoW: ics ? ics.width : null, icoDisp: ics ? ics.display : null, icoTxt: ico ? ico.textContent : null,
        fontBtn: { w: Math.round(bb.width), h: Math.round(bb.height), x: Math.round(bb.x), y: Math.round(bb.y) },
        innerML: getComputedStyle(document.querySelector('.reader-inner')).marginLeft,
      };
    });
    console.log(w+'x'+h, JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
