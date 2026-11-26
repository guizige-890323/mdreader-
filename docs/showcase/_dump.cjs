const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1035, height: 900 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
  await p.waitForTimeout(900);
  const rows = await p.evaluate(() => {
    const out = [];
    const walk = el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const y = r.y + scrollY;
      if (y > 250 && y < 560) {
        const txt = Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ');
        const cs = getComputedStyle(el);
        out.push({ y: Math.round(y), h: Math.round(r.height), x: Math.round(r.x), w: Math.round(r.width),
          tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
          fs: cs.fontSize, bg: cs.backgroundColor, t: txt.slice(0, 50) });
      }
      for (const c of el.children) walk(c);
    };
    walk(document.body);
    return out.sort((a,b)=>a.y-b.y);
  });
  rows.forEach(o => console.log(`y=${String(o.y).padStart(4)} h=${String(o.h).padStart(3)} x=${String(o.x).padStart(4)} w=${String(o.w).padStart(4)} fs=${o.fs.padEnd(6)} ${o.bg.padEnd(20)} ${o.tag.padEnd(22)} ${o.t}`));
  await b.close();
})();
