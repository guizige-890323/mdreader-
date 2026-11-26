const { chromium } = require('playwright-core');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('app').classList.add('focus'));
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    if (!fr) return { missing: true };
    const cs = getComputedStyle(fr);
    const rect = fr.getBoundingClientRect();
    const inner = document.querySelector('.reader-inner');
    return {
      cls: fr.className,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      zIndex: cs.zIndex, left: cs.left, top: cs.top, width: cs.width,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      btns: fr.querySelectorAll('[data-proxy]').length,
      appCls: document.getElementById('app').className,
      parentId: fr.parentElement ? (fr.parentElement.id || fr.parentElement.className) : null,
      parentDisplay: fr.parentElement ? getComputedStyle(fr.parentElement).display : null,
      innerMarginLeft: inner ? getComputedStyle(inner).marginLeft : null,
      vsb: window.innerHeight,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  console.log('errors:', errs);
  await p.screenshot({ path: '_shots/probe-focus.png' });
  await b.close();
})();
