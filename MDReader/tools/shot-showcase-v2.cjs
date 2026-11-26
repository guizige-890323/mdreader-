/* CR-2026-11-18-02 展示页截图 v2
   弃用 mono（黑白极简）；统一 card 布局 + tech(蓝)/cute(粉) 双配色。
   取景口径：不用整窗截图，而是按 DOM 实测矩形 clip 出「主体 + 上下文」，
   比例锁 16:10，确保 Cover Flow 卡位 object-fit:contain 下无裁切、无大片留白。
   每条都自检：目标元素必须真实可见且落在裁剪区内，否则 SKIP 而非静默出空白图。 */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const SHOTS = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 1500, H = 1000;
const RATIO = 16 / 10;

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1400);

  const park = async () => { await p.mouse.move(W - 30, H - 30); await p.waitForTimeout(300); };

  /* 把 sel 滚到视口中部，再把多个 sel 的并集裁成 16:10 */
  /* 取景：每个选择器取「可见面积最大」的实例，再把这些可见矩形并集裁成 16:10。
     这样既能拍页面深处的目标，也能容纳超高的流程图（只取可见部分）。 */
  const frameOf = async (sels, pad = 26) => p.evaluate(([sels, pad, vw, vh, ratio]) => {
    const picks = [];
    for (const s of sels) {
      let best = null, bestArea = 0;
      for (const e of document.querySelectorAll(s)) {
        const r = e.getBoundingClientRect();
        const top = Math.max(0, r.y), bot = Math.min(vh, r.y + r.height);
        const left = Math.max(0, r.x), right = Math.min(vw, r.x + r.width);
        const w = right - left, h = bot - top;
        if (w < 40 || h < 30) continue;
        if (w * h > bestArea) { bestArea = w * h; best = { x: left, y: top, w, h }; }
      }
      if (best) picks.push(best);
    }
    if (!picks.length) return null;
    let x0 = Math.min(...picks.map(r => r.x)), y0 = Math.min(...picks.map(r => r.y));
    let x1 = Math.max(...picks.map(r => r.x + r.w)), y1 = Math.max(...picks.map(r => r.y + r.h));
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    /* 先夹进视口，再按 16:10 补边 */
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vw, x1); y1 = Math.min(vh, y1);
    let w = x1 - x0, h = y1 - y0;
    if (w / h < ratio) { const nw = Math.min(vw, h * ratio); x0 -= (nw - w) / 2; w = nw; }
    else { const nh = Math.min(vh, w / ratio); y0 -= (nh - h) / 2; h = nh; }
    x0 = Math.max(0, Math.min(x0, vw - w)); y0 = Math.max(0, Math.min(y0, vh - h));
    return { x: Math.round(x0), y: Math.round(y0), width: Math.round(w), height: Math.round(h) };
  }, [sels, pad, W, H, RATIO]);

  const shot = async (name, sels, note, pad) => {
    const clip = await frameOf(sels, pad);
    if (!clip) { console.log('SKIP ' + name.padEnd(28) + '目标不存在 ' + sels.join(',')); return false; }
    await p.screenshot({ path: path.join(SHOTS, name), clip });
    console.log('OK   ' + name.padEnd(28) + note + '  ' + clip.width + 'x' + clip.height);
    return true;
  };

  const setup = async ({ theme = 'light', matte = false, style = 'tech' } = {}) => {
    await p.evaluate(({ theme, matte, style }) => {
      const l = document.getElementById('layoutSel');
      if (l && l.value !== 'card') { l.value = 'card'; l.dispatchEvent(new Event('change')); }
      const s = document.getElementById('skin' + theme[0].toUpperCase() + theme.slice(1)); if (s) s.click();
      const cur = document.documentElement.getAttribute('data-pm') === 'on';
      if (cur !== matte) { const m = document.getElementById('btnPaperMatte'); (m.querySelector('.sw-track') || m).click(); }
      document.querySelectorAll('.tt-btn[data-tt="' + style + '"]').forEach(x => { if (!x.classList.contains('on')) x.click(); });
    }, { theme, matte, style });
    await p.waitForTimeout(950); await park();
  };
  const center = async sel => {
    await p.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await p.waitForTimeout(750); await park();
  };

  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2500);

  /* ===== A 表格 → 图表（蓝）：把「第 3 张表 + 它的柱状图」一起入镜 ===== */
  await setup({ style: 'tech' });
  await center('.chart-box.show');
  await shot('showcase2-chart-bar.png', ['.chart-box.show'], '蓝色科技 · 柱状图 + 切换器');

  /* ===== B 同一位置换粉色 ===== */
  await setup({ style: 'cute' });
  await center('.chart-box.show');
  await shot('showcase2-chart-cute.png', ['.chart-box.show'], '粉色卡通 · 配色即换装');

  /* ===== C 环形图（粉）===== */
  await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('.chart-box')].filter(x => x.classList.contains('show'));
    if (boxes[boxes.length - 1]) boxes[boxes.length - 1].scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(850); await park();
  await shot('showcase2-chart-donut.png', ['.chart-box.show'], '粉色卡通 · 环形图', 20);

  /* ===== D 表格 + 四套配色切换器 ===== */
  await setup({ style: 'tech' });
  await p.evaluate(() => { const t = document.querySelectorAll('.tw')[2]; if (t) t.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const t = document.querySelectorAll('.tw')[2]; if (t) { const r = t.getBoundingClientRect(); window.scrollBy(0, r.y - 120); } });
  await p.waitForTimeout(500); await park();
  await shot('showcase2-table-style.png', ['.tw'], '四套配色切换器 + 蓝色表头', 18);

  /* ===== E 流程图（蓝）===== */
  /* 真正的滚动容器是 #reader（overflow:auto），window 不滚 */
  await p.evaluate(() => {
    const rd = document.getElementById('reader');
    const e = document.querySelector('.mf-wrap');
    if (rd && e) rd.scrollTop = e.getBoundingClientRect().top + rd.scrollTop - 70;
  });
  await p.waitForTimeout(900); await park();
  await shot('showcase2-flow-tech.png', ['.mf-wrap'], 'MDFlow 流程图 · 蓝色科技', 16);

  /* ===== F Callout ===== */
  await center('.callout');
  await shot('showcase2-callout.png', ['.callout'], 'Callout 提示块', 22);

  /* ===== G 代码高亮 ===== */
  /* code-bar 是塞在 <pre> 内部的 82x21 小工具条，不能单独取景；
     改为按「第 2 个 pre（第一个非隐藏的真实代码块）」取景 */
  await p.evaluate(() => {
    const rd = document.getElementById('reader');
    const pres = [...document.querySelectorAll('pre')].filter(x => x.getBoundingClientRect().height > 40);
    if (rd && pres[0]) rd.scrollTop = pres[0].getBoundingClientRect().top + rd.scrollTop - 220;
  });
  await p.waitForTimeout(850); await park();
  await shot('showcase2-code.png', ['#content pre'], '代码高亮 + 复制按钮', 20);

  /* ===== H 深色 + 柔光 ===== */
  await setup({ theme: 'dark', matte: true, style: 'tech' });
  await center('.chart-box.show');
  await shot('showcase2-pm-dark.png', ['.chart-box.show'], '深色 + 云晰柔光');

  await setup({ theme: 'light', matte: false, style: 'tech' });

  /* ===== I 导出菜单 ===== */
  await p.evaluate(() => { const b = document.getElementById('btnExport'); if (b) b.click(); });
  await p.waitForTimeout(700); await park();
  const expOpen = await p.evaluate(() => { const m = document.getElementById('expMenu'); return !!m && !m.hidden; });
  if (expOpen) await shot('showcase2-export.png', ['#expMenu'], '导出菜单展开', 18);
  else console.log('SKIP showcase2-export.png  菜单未展开');

  /* ===== J 欢迎页（卡片模式 + 蓝）===== */
  await p.evaluate(() => { const b = document.getElementById('btnExport'); if (b) b.click(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.tab')].find(x => /欢迎|Welcome|示例|使用指南/i.test(x.textContent));
    if (t) t.click(); else window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const r = document.getElementById('reader'); if (r) r.scrollTop = 0; });
  await p.waitForTimeout(600); await park();
  await p.evaluate(() => { const r = document.getElementById('reader'); if (r) r.scrollTop = 0; const c = document.getElementById('content'); if (c) c.scrollTop = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(500); await park();
  await shot('showcase2-doc-top.png', ['.paper'], '文档首屏 · 卡片分节', 10);

  console.log('JS errors =', errs.length, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
