const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const probe = () => {
  const fr = document.getElementById('focusRender');
  if (!fr) return { missing: true };
  const rc = fr.getBoundingClientRect();
  const cs = getComputedStyle(fr);
  const visible = rc.width > 0 && rc.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0;
  const bx = rc.left + rc.width / 2, by = rc.top + Math.min(rc.height / 2, 200);
  const el = document.elementFromPoint(bx, by);
  const inside = el ? (fr === el || fr.contains(el)) : false;
  const st = cs;
  return {
    cls: fr.className, disp: cs.display, vis: cs.visibility, op: cs.opacity,
    z: cs.zIndex, pos: cs.position, filter: st.filter,
    rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)],
    visible, hitInside: inside, hitEl: el ? (el.className || el.id || el.tagName) : 'NULL',
    appFilter: getComputedStyle(document.getElementById('app')).filter,
  };
};
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const cases = [
    { n: 'white + 1440', theme: 'light', matte: 0, w: 1440, h: 900, layout: 'card' },
    { n: 'white + matte', theme: 'light', matte: 1, w: 1440, h: 900, layout: 'card' },
    { n: 'dark + matte', theme: 'dark', matte: 1, w: 1440, h: 900, layout: 'card' },
    { n: 'sepia', theme: 'sepia', matte: 0, w: 1440, h: 900, layout: 'paper' },
    { n: 'card-layout', theme: 'light', matte: 0, w: 1440, h: 900, layout: 'card' },
    { n: '1366x768', theme: 'light', matte: 0, w: 1366, h: 768, layout: 'card' },
    { n: '1100x700', theme: 'light', matte: 0, w: 1100, h: 700, layout: 'card' },
    { n: '1000x620', theme: 'light', matte: 0, w: 1000, h: 620, layout: 'card' },
    { n: '860x600', theme: 'light', matte: 0, w: 860, h: 600, layout: 'card' },
  ];
  for (const c of cases) {
    const p = await b.newPage({ viewport: { width: c.w, height: c.h } });
    await p.goto(F); await p.waitForTimeout(1200);
    await p.click('#wDemo'); await p.waitForTimeout(900);
    await p.evaluate(({ theme, matte, layout }) => {
      const s = document.getElementById('skin' + theme[0].toUpperCase() + theme.slice(1));
      if (s) s.click();
      if (matte) { const m = document.getElementById('btnPaperMatte'); const t = m.querySelector('.sw-track') || m; t.click(); }
      const ls = document.getElementById('layoutSel'); if (ls && ls.value !== layout) { ls.value = layout; ls.dispatchEvent(new Event('change')); }
    }, c);
    await p.waitForTimeout(500);
    await p.click('#btnFocus').catch(() => {});
    await p.waitForTimeout(700);
    const r = await p.evaluate(probe);
    console.log(c.n.padEnd(16), JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
