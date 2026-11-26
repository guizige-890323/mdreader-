const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const q = s => document.querySelectorAll(s).length;
    const rect = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]; };
    return {
      counts: {
        tw: q('.tw'), twBar: q('.tw-bar'), chartBox: q('.chart-box'), chartShow: q('.chart-box.show'),
        mfWrap: q('.mf-wrap'), mfSvg: q('.mf-svg'), mfNode: q('.mf-node'),
        adWrap: q('.ad-wrap'), adSrc: q('.ad-src'), adWarn: q('.ad-warn'),
        ascii: q('.ascii-art, .ascii-diagram, [data-ascii]'),
        details: q('details'), callout: q('.callout'),
        codeBar: q('.code-bar'), pre: q('#content pre'),
      },
      mfRect: rect('.mf-wrap'), mfSvgRect: rect('.mf-svg'),
      chartRects: [...document.querySelectorAll('.chart-box')].map(e => { const b=e.getBoundingClientRect(); return { show: e.classList.contains('show'), y: Math.round(b.y), h: Math.round(b.height) }; }),
      twRects: [...document.querySelectorAll('.tw')].map(e => { const b=e.getBoundingClientRect(); const t=e.querySelector('table'); return { y: Math.round(b.y), h: Math.round(b.height), rows: t ? t.querySelectorAll('tbody tr').length : 0, ch: t ? t.querySelector('thead th').textContent.trim().slice(0,12) : '' }; }),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
