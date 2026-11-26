const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('app').classList.add('focus'));
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const rect = fr.getBoundingClientRect();
    const probePts = [
      [rect.left + 20, rect.top + 60],
      [rect.left + 20, rect.top + rect.height / 2],
      [rect.left + 20, rect.top + rect.height - 30],
    ];
    const hits = probePts.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'NULL';
      const chain = [];
      let n = el;
      for (let i = 0; i < 4 && n; i++) { chain.push(n.id || n.className || n.tagName); n = n.parentElement; }
      return chain.join(' < ');
    });
    // 各按钮可见性
    const btns = [...fr.querySelectorAll('[data-proxy]')].map(b => {
      const bb = b.getBoundingClientRect();
      return { p: b.getAttribute('data-proxy'), w: Math.round(bb.width), h: Math.round(bb.height), x: Math.round(bb.x), y: Math.round(bb.y) };
    });
    // localStorage
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    return {
      frClass: fr.className,
      frRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      hits, btns, ls,
      groupsDisplay: getComputedStyle(document.querySelector('.fr-groups')).display,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
