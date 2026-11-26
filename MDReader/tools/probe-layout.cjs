// 布局体检：重叠 / 横向溢出 / 文本截断 / 图片可见尺寸 / 留白异常
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(URL); await p.waitForTimeout(1500);

  const r = await p.evaluate(() => {
    const out = { hOverflow: [], overlap: [], clipText: [], imgs: [], whitespace: [] };
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.hOverflow.push('doc ' + de.scrollWidth + '>' + de.clientWidth);
    document.querySelectorAll('body *').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > window.innerWidth + 2) out.hOverflow.push((e.className || e.tagName) + ' right=' + Math.round(r.right));
      // 文本被裁
      if (e.children.length === 0 && e.textContent.trim()) {
        if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible')
          out.clipText.push((e.tagName + '.' + e.className).slice(0, 50));
        if (e.scrollHeight > e.clientHeight + 2 && getComputedStyle(e).overflow === 'hidden')
          out.clipText.push('V:' + (e.tagName + '.' + e.className).slice(0, 50));
      }
    });
    // 特征格 / 快捷卡 / 对比表 相互重叠
    const groups = [['.fcard', 8], ['.qgrid > *', 3]];
    for (const [sel, n] of groups) {
      const els = [...document.querySelectorAll(sel)];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 2 && oy > 2) out.overlap.push(sel + ' #' + i + '/#' + j + ' ' + Math.round(ox) + 'x' + Math.round(oy));
      }
    }
    // 卡片内图片实际显示尺寸 & 占位比
    document.querySelectorAll('.card').forEach((c, i) => {
      const img = c.querySelector('img'), box = c.querySelector('.card-media');
      if (!img || !box) return;
      const ri = img.getBoundingClientRect(), rb = box.getBoundingClientRect();
      out.imgs.push({ i, dw: Math.round(ri.width), dh: Math.round(ri.height),
        fill: +(ri.width * ri.height / (rb.width * rb.height)).toFixed(2) });
    });
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });