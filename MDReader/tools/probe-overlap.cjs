// 滚动遮挡诊断：stage 内卡片是否被 overflow:hidden 裁切、滚动各位置是否有元素互相压盖
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(URL); await p.waitForTimeout(2200);

  // 1) stage 裁切检测：比较卡片视觉包围盒 vs stage 边界
  const clipTest = await p.evaluate(() => {
    const stage = document.querySelector('.stage');
    const sr = stage.getBoundingClientRect();
    const out = { stage: { y: Math.round(sr.y), h: Math.round(sr.height), w: Math.round(sr.width) }, cards: [] };
    document.querySelectorAll('.card').forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.width === 0) return;
      const vis = getComputedStyle(c).visibility;
      if (vis === 'hidden') return;
      const overTop = Math.round(sr.top - r.top);
      const overBot = Math.round(r.bottom - sr.bottom);
      const overL = Math.round(sr.left - r.left);
      const overR = Math.round(r.right - sr.right);
      out.cards.push({
        i, cls: c.className,
        vis: vis,
        w: Math.round(r.width), h: Math.round(r.height),
        over: { top: overTop, bottom: overBot, left: overL, right: overR },
        clipped: overTop > 0 || overBot > 0 || overL > 0 || overR > 0
      });
    });
    return out;
  });
  console.log('--- stage 裁切 ---');
  console.log('stage ' + JSON.stringify(clipTest.stage));
  clipTest.cards.forEach(c => {
    console.log('  card' + c.i + ' ' + c.cls.padEnd(12) + ' ' + c.w + 'x' + c.h +
      ' over=' + JSON.stringify(c.over) + (c.clipped ? '  <== 被裁' : ''));
  });

  // 2) 滚动过程中检测：任意滚动位置，是否有视觉元素互相盖住（含 fixed/sticky）
  console.log('\n--- 滚动遮挡扫描 ---');
  const scrollH = await p.evaluate(() => document.documentElement.scrollHeight);
  for (const y of [0, 200, 400, 600, 800, 1000, 1400, 1800, 2200, 2600]) {
    if (y > scrollH - 900) break;
    await p.evaluate(v => scrollTo(0, v), y);
    await p.waitForTimeout(220);
    const r = await p.evaluate(() => {
      const vh = window.innerHeight;
      const issues = [];
      // 找出覆盖视口的 fixed/sticky 元素
      document.querySelectorAll('body *').forEach(e => {
        const cs = getComputedStyle(e);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
        const b = e.getBoundingClientRect();
        if (b.width > 200 && b.height > 20 && cs.pointerEvents !== 'none' && cs.opacity !== '0')
          issues.push('固定层: ' + (e.className || e.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' @' + Math.round(b.y));
      });
      // 中心点上真正命中的元素（看是否被别的层压住）
      const cx = window.innerWidth / 2;
      for (const yy of [80, 300, 600, vh - 80]) {
        const el = document.elementFromPoint(cx, yy);
        if (el) issues.push('中心(' + yy + '): ' + (el.className || el.tagName).toString().slice(0, 40));
      }
      // 横向溢出
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) issues.push('横向溢出 ' + de.scrollWidth + '>' + de.clientWidth);
      return issues;
    });
    console.log('y=' + String(y).padStart(4) + ' ' + JSON.stringify(r));
  }

  // 3) 上下区块间距
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const gaps = await p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bot: Math.round(r.bottom + scrollY) }; };
    const hero = g('.hero'), stage = g('.stage'), feat = g('.fgrid'), cmp = g('.ctable'), quick = g('.qgrid');
    return { hero, stage, feat, cmp, quick,
      gapHeroStage: stage.top - hero.bot, gapStageFeat: feat.top - stage.bot,
      gapFeatCmp: cmp.top - feat.bot, gapCmpQuick: quick.top - cmp.bot };
  });
  console.log('\n--- 区块间距 ---');
  console.log(JSON.stringify(gaps, null, 1));

  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });