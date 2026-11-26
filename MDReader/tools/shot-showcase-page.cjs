// 展示页视觉自检：分段截图 + 结构化探针
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html';
const OUT = 'D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/_page-';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForTimeout(1800);

  const probe = await p.evaluate(() => {
    const box = s => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cnt = s => document.querySelectorAll(s).length;
    const txt = s => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : null; };
    return {
      docH: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      sections: {
        hero: box('.hero'), stage: box('.stage'), features: box('.fgrid'),
        compare: box('.ctable'), quick: box('.qgrid'), footer: box('footer')
      },
      counts: {
        card: cnt('.card'), dot: cnt('.dot'), fcard: cnt('.fcard'),
        badge: cnt('.hero .badges a, .hero .badges span, .badges img'),
        cta: cnt('.hero .btn'),
        cth: cnt('.ctable th'), ctr: cnt('.ctable tbody tr'),
        qcard: cnt('.qgrid > *'), img: cnt('.card img')
      },
      heroTitle: txt('.hero h1'),
      heroSub: txt('.hero .sub'),
      badges: [...document.querySelectorAll('.badges > *')].map(e => (e.textContent || e.alt || '').trim()).filter(Boolean),
      ctas: [...document.querySelectorAll('.hero .btn')].map(e => e.textContent.trim()),
      featTitles: [...document.querySelectorAll('.fcard')].map(e => {
        const h = e.querySelector('h3, h4, b, strong'); const d = e.querySelector('p');
        return { t: h ? h.textContent.trim() : null, d: d ? d.textContent.trim() : null };
      }),
      ctableHead: [...document.querySelectorAll('.ctable thead th')].map(e => e.textContent.trim()),
      ctableRows: [...document.querySelectorAll('.ctable tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
      quickTitles: [...document.querySelectorAll('.qgrid > *')].map(e => {
        const h = e.querySelector('h3,h4,b,strong,.qt'); return h ? h.textContent.trim() : e.textContent.trim().slice(0, 40);
      }),
      footerText: txt('footer')
    };
  });

  console.log(JSON.stringify(probe, null, 1));

  // 分段截图
  await p.screenshot({ path: OUT + 'hero.png' });
  for (const [name, sel] of [['stage', '.stage'], ['features', '.fgrid'], ['compare', '.ctable'], ['quick', '.qgrid']]) {
    const ok = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return false;
      e.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }, sel);
    if (!ok) { console.log('MISS ' + name); continue; }
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + name + '.png' });
  }
  // 整页长图
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + 'full.png', fullPage: true });

  console.log('ERRS ' + JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });