const { chromium } = require('playwright-core');
/* 系统设置面板设计回归（分组卡片式）

   改造前的问题（量化）：
     · 12 行设置的控件左边缘从 631px 漂到 937px，落差 306px
     · 控件宽度从 34px（开关）到 340px（六按钮组）不等，全挤在右侧各自为政
     · 分组用虚线，组标题是 11px 大写字距 .6px，与正文层级糊在一起
     · 面板 540px 宽、投影 0 26px 70px（过重）

   改造后必须守住：
     1. 每组一张卡片，行内「标签 + 控件」两栏，控件右边缘统一到卡片内距
     2. 行间分隔线是 1px 实线，只在相邻行之间，首行上方没有
     3. 三套主题（浅色/深色/护眼）下卡片与画布都必须是两个可辨的层次
     4. 任何视口都不横向溢出；窄屏控件换行但仍对齐
     5. 原有交互全部可用（分段切换真生效、开关可点、Esc 可关）

   跑之前先 python src/build.py。 */
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); }
};

async function open(b, { theme = 'light', vw = 1440, vh = 1000 } = {}) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(F);
  await p.waitForTimeout(700);
  await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await p.waitForTimeout(200);
  /* 窄视口下工具栏会把设置按钮收进「更多」，直接点会 timeout。
     先看按钮是否可见，不可见就走更多菜单。 */
  const visible = await p.evaluate(() => {
    const btn = document.querySelector('#btnSettings');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(btn).visibility !== 'hidden';
  });
  if (visible) {
    await p.click('#btnSettings');
  } else {
    await p.click('#btnMore');
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const menu = document.querySelector('.tb-more-menu');
      const target = [...(menu ? menu.querySelectorAll('button') : [])]
        .find(b => (b.textContent || '').includes('系统设置') || b.dataset.for === 'btnSettings');
      if (target) target.click();
    });
  }
  await p.waitForTimeout(500);
  return { p, errs };
}

async function probe(p) {
  return p.evaluate(() => {
    const panel = document.querySelector('.set-panel');
    const cards = [...panel.querySelectorAll('.set-card')];
    const rows = [...panel.querySelectorAll('.set-row')];
    const pads = [];
    let sepOK = true, firstRowSep = false;
    for (const row of rows) {
      const card = row.closest('.set-card');
      const ctrl = row.querySelector('.set-ctrl');
      if (card && ctrl) {
        pads.push(Math.round(card.getBoundingClientRect().right - ctrl.getBoundingClientRect().right));
      }
      const before = getComputedStyle(row, '::before');
      const isFirst = row.parentElement.querySelector('.set-row') === row;
      const hasLine = before.content !== 'none' && parseFloat(before.height) >= 1;
      if (isFirst && hasLine) firstRowSep = true;
      if (!isFirst && !hasLine) sepOK = false;
    }
    // 卡片与画布是否两层次
    const canvas = getComputedStyle(panel).backgroundColor;
    const cardBg = cards.length ? getComputedStyle(cards[0]).backgroundColor : '';
    const rowH = rows.map(r => Math.round(r.getBoundingClientRect().height));
    return {
      panelW: Math.round(panel.getBoundingClientRect().width),
      cardCount: cards.length,
      rowCount: rows.length,
      pads: [...new Set(pads)],
      sepOK, firstRowSep,
      canvas, cardBg, layersDiffer: canvas !== cardBg,
      rowH,
      overflowX: panel.scrollWidth > panel.clientWidth + 1,
      docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      radius: getComputedStyle(panel).borderRadius,
      cardRadius: cards.length ? getComputedStyle(cards[0]).borderRadius : ''
    };
  });
}

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });

  /* ============ 1. 结构与对齐 ============ */
  console.log('\n[1] 分组卡片结构 / 控件右对齐');
  {
    const { p, errs } = await open(b, { vw: 1440 });
    const r = await probe(p);
    ok('每组一张卡片（3 个分组）', r.cardCount === 3, r.cardCount);
    ok('13 行设置全部在卡片内（CR-05b 加行高行）', r.rowCount === 13, r.rowCount);
    ok('控件右边缘唯一值（全部对齐）', r.pads.length === 1, r.pads);
    ok('对齐内距在 12–18px 合理区间', r.pads[0] >= 12 && r.pads[0] <= 18, r.pads);
    ok('行间分隔线齐备（非首行）', r.sepOK);
    ok('首行上方无分隔线', !r.firstRowSep);
    ok('面板圆角 16px（大圆角）', r.radius.startsWith('16'), r.radius);
    ok('卡片圆角 12px', r.cardRadius.startsWith('12'), r.cardRadius);
    ok('无横向溢出', !r.overflowX && !r.docOverflow);
    ok('零 JS 错误', errs.length === 0, errs.slice(0, 2));
    await p.close();
  }

  /* ============ 2. 三套主题的层次 ============ */
  console.log('\n[2] 三套主题：卡片与画布是两个可辨层次');
  for (const theme of ['light', 'dark', 'sepia']) {
    const { p } = await open(b, { theme });
    const r = await probe(p);
    ok(`${theme} 卡片与画布不同色`, r.layersDiffer, { canvas: r.canvas, card: r.cardBg });
    ok(`${theme} 右边缘仍统一`, r.pads.length === 1, r.pads);
    ok(`${theme} 无横向溢出`, !r.overflowX && !r.docOverflow);
    await p.close();
  }

  /* ============ 3. 行高一致（不再有的行 98px 有的 53px） ============ */
  console.log('\n[3] 行高整齐');
  {
    const { p } = await open(b, { vw: 1440 });
    const r = await probe(p);
    const uniq = [...new Set(r.rowH)];
    ok('行高只有两种（普通行 / 多按钮换行行）', uniq.length <= 2, { rowH: r.rowH });
    ok('普通行 ≥46px 且 ≤56px（舒适可点）', r.rowH.filter(h => h < 60).every(h => h >= 46 && h <= 56), r.rowH);
    await p.close();
  }

  /* ============ 4. 窄屏 ============ */
  console.log('\n[4] 窄屏不横向溢出');
  for (const vw of [768, 560, 420, 360]) {
    const { p, errs } = await open(b, { vw, vh: 900 });
    const r = await probe(p);
    ok(`${vw}px 面板无横向溢出`, !r.overflowX, { panelW: r.panelW });
    ok(`${vw}px 页面无横向溢出`, !r.docOverflow);
    ok(`${vw}px 右边缘仍统一`, r.pads.length === 1, r.pads);
    ok(`${vw}px 零 JS 错误`, errs.length === 0, errs.slice(0, 2));
    await p.close();
  }

  /* ============ 5. 交互未被样式改动破坏 ============ */
  console.log('\n[5] 交互回归');
  {
    const { p } = await open(b, { vw: 1440 });
    /* 分段控件：点「纸张」应当真的改掉 data-layout */
    await p.click('#setLayout button[data-layout="paper"]');
    await p.waitForTimeout(400);
    const layout = await p.evaluate(() => document.documentElement.dataset.layout);
    ok('点「纸张」排版真生效', layout === 'paper', layout);
    const onCls = await p.evaluate(() => document.querySelector('#setLayout button[data-layout="paper"]').classList.contains('on'));
    ok('选中态类名正确', onCls);

    /* 开关：点柔光应切换 aria-checked */
    const before = await p.getAttribute('#setPm', 'aria-checked');
    await p.click('#setPm');
    await p.waitForTimeout(400);
    const after = await p.getAttribute('#setPm', 'aria-checked');
    ok('点开关切换状态', before !== after, { before, after });

    /* 流程图结构：点导图 */
    await p.click('#setFlowMode button[data-fm="mindmap"]');
    await p.waitForTimeout(400);
    const mode = await p.evaluate(() => window.MDFlow && window.MDFlow.getMode && window.MDFlow.getMode());
    ok('点「导图」结构真切换', mode === 'mindmap', mode);

    /* Esc 关闭 */
    await p.keyboard.press('Escape');
    await p.waitForTimeout(350);
    const hidden = await p.evaluate(() => document.querySelector('#setMask').hasAttribute('hidden'));
    ok('Esc 可关闭面板', hidden);
    await p.close();
  }

  /* ============ 6. 设置项没漏 ============ */
  console.log('\n[6] 设置项完整性（改造前后不丢项）');
  {
    const { p } = await open(b, { vw: 1440 });
    const ids = await p.evaluate(() =>
      ['#setLang', '#setLayout', '#setFs', '#setLH', '#setTheme', '#setPm', '#setLogo',
       '#setChart', '#setTT', '#setCT', '#setFlow', '#setFlowMode', '#setFlowStyle']
        .map(s => [s, !!document.querySelector(s)])
    );
    for (const [s, exists] of ids) ok(`控件存在 ${s}`, exists);
    const heads = await p.evaluate(() => [...document.querySelectorAll('.set-gh')].map(e => e.textContent.trim()));
    ok('三个组标题齐备', heads.length === 3, heads);
    await p.close();
  }

  console.log('\n' + '='.repeat(44));
  console.log(`${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(44));
  await b.close();
  process.exit(fail ? 1 : 0);
})();