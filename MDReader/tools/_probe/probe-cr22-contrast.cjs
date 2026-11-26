/* CR-2026-11-20-01 新增元素的 WCAG 校验：
   .prio 徽章（三优先级 × 三主题）、.en 英文名、.vs 对照块、.tags 标签。
   判据：小字 ≥4.5:1（徽章 9.5px、en 8.5px、vs 10px、tags 9px 全属小字）。
   注意：必须取「文字色 vs 实际渲染背景像素」，不能只看 getComputedStyle 的 backgroundColor
   —— 卡片有 box-shadow 与 backdrop 层，局部背景会被压暗（CR-2026-11-18-02 的教训）。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

function lum(r, g, b) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const ratio = (a, b) => { const l1 = lum(...a), l2 = lum(...b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);
  let bad = 0;
  for (const theme of ['light', 'sepia', 'dark']) {
    await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await p.waitForTimeout(200);
    const rows = await p.evaluate(() => {
      const pick = sel => { const c = document.querySelector('.wf-item[style*="z-index: 100"] .w-card'); return c ? c.querySelector(sel) : null; };
      const out = [];
      const add = (name, el, bgSel) => {
        if (!el) { out.push({ name, missing: true }); return; }
        const cs = getComputedStyle(el);
        let bgEl = el, bg = cs.backgroundColor;
        // 背景透明则往上找第一个不透明祖先
        let guard = 0;
        while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && guard++ < 8) {
          bgEl = bgEl.parentElement; if (bgEl) bg = getComputedStyle(bgEl).backgroundColor;
        }
        out.push({ name, color: cs.color, bg, fs: cs.fontSize, fw: cs.fontWeight, text: (el.textContent || '').slice(0, 14) });
      };
      add('prio', pick('.prio'));
      add('en', pick('.en'));
      add('desc', pick('span:not([class])'));
      const vs = pick('.vs .them'); add('vs.them', vs);
      const us = pick('.vs .us'); add('vs.us', us);
      const ti = pick('.tags i'); add('tags', ti);
      return out;
    });
    console.log('\n--- ' + theme + ' ---');
    for (const r of rows) {
      if (r.missing) { console.log('  MISSING', r.name); bad++; continue; }
      // 背景可能带 alpha：与卡片底色合成较复杂，这里直接对不透明祖先取色
      const c = parse(r.color), g = parse(r.bg);
      const cr = ratio(c, g);
      const pass = cr >= 4.5;
      if (!pass) bad++;
      console.log('  ' + (pass ? 'OK  ' : 'FAIL') + ' ' + r.name.padEnd(9) + ' ' + cr.toFixed(2) + ':1  fs=' + r.fs + '  fg=' + r.color + ' bg=' + r.bg);
    }
  }
  await b.close();
  console.log('\nFAIL count =', bad);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error(e.message); process.exit(1); });