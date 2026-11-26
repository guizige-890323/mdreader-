const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  for (const vw of [1440]) {
    const p = await b.newPage({ viewport: { width: vw, height: 900 } });
    await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const out = {};
      const h2 = document.querySelector('#showcase .sec-head h2');
      const pp = document.querySelector('#showcase .sec-head p');
      const cta = document.querySelector('.cta');
      const cs = getComputedStyle(h2);
      // 用 Range 量文字实际宽度（等于选中高亮矩形宽度）
      const tw = el => { const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect(); return { x:+b.x.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1), y:+(b.y+scrollY).toFixed(1) }; };
      out.h2 = { ...tw(h2), fs: cs.fontSize, lh: cs.lineHeight };
      out.p  = { ...tw(pp), fs: getComputedStyle(pp).fontSize, lh: getComputedStyle(pp).lineHeight };
      out.ctaBottom = +(cta.getBoundingClientRect().bottom + scrollY).toFixed(1);
      out.h2Gap = +(out.h2.y - out.ctaBottom).toFixed(1);
      out.h2pGap = +(out.p.y - (out.h2.y + out.h2.h)).toFixed(1);
      return out;
    });
    console.log('viewport', vw, JSON.stringify(r, null, 1));
    // 换算：以 p 文字宽度 810 / h2 文字宽度 503 作为目标，求 dpr
    const dprP = 810 / r.p.w, dprH = 503 / r.h2.w;
    console.log('目标 dpr: 由 p 推 =', dprP.toFixed(3), ' 由 h2 推 =', dprH.toFixed(3));
    console.log('目标 h2 高度 49 / lh =', (49 / r.h2.h * 1).toFixed(3), ' 目标 p 高度 30 / lh =', (30 / r.p.h).toFixed(3));
    console.log('目标 段落前后间距: cta→h2 =', (144 - 69), '/dpr =', (75/dprP).toFixed(1), '实际', r.h2Gap);
    console.log('目标 h2→p =', (204 - 192), '/dpr =', (12/dprP).toFixed(1), '实际', r.h2pGap);
    await p.close();
  }
  await b.close();
})();
