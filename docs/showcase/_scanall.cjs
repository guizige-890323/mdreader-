const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1035, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
  await p.waitForTimeout(800);
  const out = await p.evaluate(() => {
    const res = [];
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const a=m[1].split(',').map(Number); return a; };
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      const c = parse(cs.backgroundColor);
      if (!c || (c.length>3 && c[3]===0)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 12) return;
      const [R,G,B] = c;
      const isBlue = B>150 && B-R>60;
      const isDark = R<80 && G<80 && B<100;
      if (!isBlue && !isDark) return;
      res.push({ tag: el.tagName+'.'+(el.className||'').toString().slice(0,40), bg: `${R},${G},${B}`,
        x: Math.round(r.x), y: Math.round(r.y+scrollY), w: Math.round(r.width), h: Math.round(r.height) });
    });
    return res;
  });
  out.forEach(o => console.log(`${o.tag.padEnd(34)} ${o.bg.padEnd(14)} x=${String(o.x).padStart(4)} y=${String(o.y).padStart(5)} ${String(o.w).padStart(4)}x${String(o.h).padStart(3)}`));
  console.log('total', out.length);
  await b.close();
})();
