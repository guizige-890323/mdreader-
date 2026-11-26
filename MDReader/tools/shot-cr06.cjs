/* ==================================================================
   CR-2026-11-15-06 · 高级感交互 对比截图
   ------------------------------------------------------------------
   cr06-pill-light.png     设置面板 8 组液态胶囊（浅色）
   cr06-pill-dark.png      同上（深色，验证择墨后可读）
   cr06-pill-sepia.png     同上（护眼 + 红色政商风格）
   cr06-stretch.png        切换中途：胶囊沿移动方向拉长
   cr06-settled.png        到位回弹后精确落位
   cr06-card-glow.png      功能卡追光：右上光斑 + 边框提亮 + 3D 倾斜
   cr06-card-glow-dark.png 同上（深色）
   cr06-card-rest.png      移出后平滑复原（无光斑、无倾斜）
   cr06-focus-pill.png     专注侧边竖排胶囊（fixed 未被胶囊打回文档流）
   cr06-toolbar-pill.png   文档内图表/流程图/表格三组胶囊
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/shot-cr06.cjs
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await p.goto('file:///' + F); await p.waitForTimeout(1600);
  const log = [];

  /* ---------- 1. 功能卡追光（欢迎屏） ---------- */
  const gb = await (await p.$('#gridFeats')).boundingBox();
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);   // 暂停 marquee
  await p.waitForTimeout(600);
  const vis = await p.evaluate(() => {
    const g = document.getElementById('gridFeats'), gr = g.getBoundingClientRect();
    return [...g.querySelectorAll('.w-card')].map((c, i) => {
      const r = c.getBoundingClientRect();
      return { i, l: r.left, r: r.right, t: r.top, h: r.height, w: r.width,
        vis: r.left >= gr.left && r.right <= gr.right && r.width > 0 };
    }).filter(x => x.vis);
  });
  const v = vis[1] || vis[0];
  await p.mouse.move(v.l + v.w * 0.78, v.t + v.h * 0.22);
  await p.waitForTimeout(600);
  const gridEl = await p.$('#gridFeats');
  await gridEl.screenshot({ path: SHOTS + '/cr06-card-glow.png' });
  log.push(['追光(浅)', await p.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card.lit');
    return c ? { mx: c.style.getPropertyValue('--mx'), my: c.style.getPropertyValue('--my'),
      rx: c.style.getPropertyValue('--rx'), ry: c.style.getPropertyValue('--ry'),
      before: getComputedStyle(c, '::before').opacity, after: getComputedStyle(c, '::after').opacity } : null;
  })]);

  /* 深色追光 */
  await p.evaluate(() => document.getElementById('skinDark').click());
  await p.waitForTimeout(700);
  await p.mouse.move(8, 8); await p.waitForTimeout(400);
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await p.waitForTimeout(500);
  const vis2 = await p.evaluate(() => {
    const g = document.getElementById('gridFeats'), gr = g.getBoundingClientRect();
    return [...g.querySelectorAll('.w-card')].map(c => {
      const r = c.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, h: r.height, w: r.width,
        vis: r.left >= gr.left && r.right <= gr.right && r.width > 0 };
    }).filter(x => x.vis);
  });
  const v2 = vis2[1] || vis2[0];
  await p.mouse.move(v2.l + v2.w * 0.78, v2.t + v2.h * 0.22);
  await p.waitForTimeout(600);
  await (await p.$('#gridFeats')).screenshot({ path: SHOTS + '/cr06-card-glow-dark.png' });
  log.push(['追光(深)', await p.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card.lit');
    return c ? { rx: c.style.getPropertyValue('--rx'), ry: c.style.getPropertyValue('--ry'),
      glass: getComputedStyle(c).backgroundColor } : null;
  })]);

  /* 移出复原 */
  await p.mouse.move(8, 8); await p.waitForTimeout(800);
  await (await p.$('#gridFeats')).screenshot({ path: SHOTS + '/cr06-card-rest.png' });
  log.push(['移出复原', await p.evaluate(() => ({
    anyLit: document.querySelectorAll('#gridFeats .w-card.lit').length,
    transform: getComputedStyle(document.querySelector('#gridFeats .w-card')).transform
  }))]);
  await p.evaluate(() => document.getElementById('skinLight').click());
  await p.waitForTimeout(600);

  /* ---------- 2. 设置面板胶囊三主题 ---------- */
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById('btnSettings').click());
  await p.waitForTimeout(900);
  const panel = await p.$('.set-panel');
  await panel.screenshot({ path: SHOTS + '/cr06-pill-light.png' });

  /* 拉长中途取证：紧凑 → 宽松。
     拉伸窗口只有 190ms，dsf=2 的元素截图本身要 100ms+，Node 侧轮询也来不及。
     做法：点击前就挂一个「一次性 class MutationObserver」——lpSync 加上
     .stretch 的同一帧立刻把 computed transform 写回内联并停过渡，把这一帧
     冻结住供截图；截完恢复。真实时序下的拉伸断言由 test-cr06 负责，此处仅取证。 */
  /* 取证方向选「宽松 → 紧凑」：拉伸原点在出发侧（右侧 100%），胶囊向左延伸，
     左边有整条轨道的空间；若反过来向右拉长，溢出部分会被 .set-seg 裁掉看不见。 */
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="loose"]').click());
  await p.waitForTimeout(700);
  const lhRow = await p.$('#setLH');
  await p.evaluate(() => {
    window.__shot = null;
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const mo = new MutationObserver(function () {
      if (!pill.classList.contains('stretch')) return;
      mo.disconnect();
      clearTimeout(h.__lpT);
      /* observer 回调跑在渲染前，此刻 computed 还是动画起点（sx=1）。
         要拍到「拉长峰值」，直接把 JS 刚写入的目标形变瞬时应用：
         停过渡 → 强制回流 → 读几何，即为该次切换的最大拉伸帧。 */
      pill.style.transition = 'none';
      void pill.offsetWidth;
      const liveW = pill.getBoundingClientRect().width;
      window.__shot = { froze: true, w: +liveW.toFixed(1),
        sx: pill.style.getPropertyValue('--lp-sx'), sy: pill.style.getPropertyValue('--lp-sy'),
        ox: pill.style.getPropertyValue('--lp-ox') };
    });
    mo.observe(pill, { attributes: true, attributeFilter: ['class'] });
    document.querySelector('#setLH button[data-lh="compact"]').click();
    setTimeout(function () { mo.disconnect(); if (!window.__shot) window.__shot = { froze: false }; }, 600);
  });
  let froze = null;
  for (let i = 0; i < 40; i++) {
    froze = await p.evaluate(() => window.__shot);
    if (froze) break;
    await p.waitForTimeout(15);
  }
  const shotGeo = await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { pillW: +pr.width.toFixed(1), onW: +or.width.toFixed(1),
      overLeft: +(or.left - pr.left).toFixed(1), overRight: +(pr.right - or.right).toFixed(1),
      on: on.dataset.lh };
  });
  await lhRow.screenshot({ path: SHOTS + '/cr06-stretch.png' });
  await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    clearTimeout(h.__lpT);
    pill.style.removeProperty('transition');
    pill.style.removeProperty('transform');
    pill.classList.remove('stretch');
    pill.style.setProperty('--lp-sx', '1'); pill.style.setProperty('--lp-sy', '1');
  });
  log.push(['拉长中途(定格取证)', { ...froze, ...shotGeo }]);
  await p.waitForTimeout(700);
  await (await p.$('#setLH')).screenshot({ path: SHOTS + '/cr06-settled.png' });
  log.push(['到位落位', await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { on: on.dataset.lh, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1),
      sx: pill.style.getPropertyValue('--lp-sx') };
  })]);
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="standard"]').click());
  await p.waitForTimeout(600);

  /* 深色 */
  await p.evaluate(() => document.querySelector('#setTheme button[data-theme="dark"]').click());
  await p.waitForTimeout(800);
  await (await p.$('.set-panel')).screenshot({ path: SHOTS + '/cr06-pill-dark.png' });
  /* 护眼 + 红色政商 */
  await p.evaluate(() => document.querySelector('#setTT button[data-tt="gov"]').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('#setTheme button[data-theme="sepia"]').click());
  await p.waitForTimeout(800);
  await (await p.$('.set-panel')).screenshot({ path: SHOTS + '/cr06-pill-sepia.png' });
  log.push(['护眼+政商胶囊', await p.evaluate(() => {
    const h = document.getElementById('setLH'), on = h.querySelector('button.on');
    return { ink: h.style.getPropertyValue('--lp-ink'), color: getComputedStyle(on).color,
      segBg: getComputedStyle(h).backgroundColor };
  })]);
  await p.evaluate(() => document.querySelector('#setTheme button[data-theme="light"]').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#setTT button[data-tt="mono"]').click());
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);

  /* ---------- 3. 文档内三组工具条胶囊 ---------- */
  await p.evaluate(() => { const x = document.querySelector('.tw-bar button[data-act="chart"]'); if (x) x.click(); });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const box = document.querySelector('.chart-box.show');
    if (box) box.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(500);
  const tw = await p.$('.chart-box.show');
  if (tw) await tw.screenshot({ path: SHOTS + '/cr06-toolbar-pill.png' });
  log.push(['工具条胶囊', await p.evaluate(() => {
    const grab = sel => { const h = document.querySelector(sel); if (!h) return null;
      const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on,.tt-btn.on');
      if (!pill || !on) return null;
      const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
      return { dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1), op: getComputedStyle(pill).opacity }; };
    return { ct: grab('.chart-box.show .chart-types'), tt: grab('.tw-bar .tt-group'), fm: grab('.mf-tools .mf-modes') };
  })]);

  /* ---------- 4. 专注侧边竖排胶囊 ---------- */
  await p.evaluate(() => { const r = document.getElementById('reader'); if (r) r.scrollTop = 0; });
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(800);
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="comfort"]');
  await p.waitForTimeout(800);
  await p.screenshot({ path: SHOTS + '/cr06-focus-pill.png' });
  log.push(['专注竖排', await p.evaluate(() => {
    const h = document.getElementById('focusRender'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('.fr-btn[data-proxy="lhSel"][data-val="comfort"]');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const inner = document.querySelector('.reader-inner').getBoundingClientRect();
    return { pos: getComputedStyle(h).position, top: +hr.top.toFixed(1), bottom: +hr.bottom.toFixed(1),
      vh: window.innerHeight, dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
      dockR: +hr.right.toFixed(1), innerL: +inner.left.toFixed(1) };
  })]);
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  await b.close();
  console.log('=== 截图实测数据 ===');
  for (const [k, v] of log) console.log('  ' + k + ' = ' + JSON.stringify(v));
  console.log('\n截图完成：cr06-card-glow / -dark / -rest / -pill-light / -dark / -sepia / -stretch / -settled / -toolbar-pill / -focus-pill');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
