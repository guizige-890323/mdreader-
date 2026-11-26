const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const g = s => { const e=document.querySelector(s); if(!e) return 'MISSING';
      const b=e.getBoundingClientRect(); return `y=${Math.round(b.y+scrollY)} ${Math.round(b.width)}x${Math.round(b.height)} "${(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,60)}"`; };
    return { hint: g('#showcase .hint'), chips: g('#chips'), chipsN: document.querySelectorAll('#chips > *').length,
             stage: g('#stage'), edgeL: g('#edgeL'), edgeR: g('#edgeR'),
             ariaShowcase: document.querySelector('#showcase').getAttribute('aria-label') };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
