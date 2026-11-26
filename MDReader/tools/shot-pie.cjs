/* 环形图「等角 vs 按占比精确划分」对比截图
   - pie-after.png      : 修复后的真实渲染
   - pie-before-sim.png : 在同一张 DOM 上把 path 换回等角 2π/n 路径，模拟旧版外观
   右侧图例百分比保持不动，正好凸显「扇区一样宽、百分比却差 110 倍」的矛盾。

   运行：NODE_PATH=<node_modules> node tools/shot-pie.cjs
   ------------------------------------------------------------------ */
const { chromium } = require('playwright-core');

const HTML = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const SHOTS = 'D:/WorkBuddy/2026-11-08-21-28-36/MDReader/_shots';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(HTML);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#wDemo').click());
  await page.waitForTimeout(2200);

  await page.evaluate(() => {
    const DATA = [
      ['渠道A', 330], ['渠道B', 265], ['渠道C', 130], ['渠道D', 119],
      ['渠道E', 90], ['渠道F', 47], ['渠道G', 16], ['渠道H', 3]
    ];
    const tw = Array.prototype.slice.call(document.querySelectorAll('#content .tw'))
      .find(w => w.querySelector('button[data-act="chart"]'));
    tw.querySelector('table tbody').innerHTML = DATA.map(r =>
      '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>').join('');
    const box = tw.querySelector('.chart-box'), btn = tw.querySelector('button[data-act="chart"]');
    if (box.classList.contains('show')) btn.click();
    btn.click();
    box.querySelector('.chart-types button[data-ct="pie"]').click();
    /* 打标记，便于后续精确选中这一个图表容器 */
    Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .filter(b => b.querySelector('.pie-slice[data-frac]'))
      .forEach(b => b.setAttribute('data-shot', '1'));
  });
  await page.waitForTimeout(1100);

  const box = await page.$('.chart-box[data-shot="1"]');
  await box.screenshot({ path: SHOTS + '/pie-after.png' });
  console.log('saved pie-after.png');

  /* 把扇区路径换回旧版等角 2π/n（无圆角，但等分特征一致） */
  await page.evaluate(() => {
    const box = document.querySelector('.chart-box[data-shot="1"]');
    const svg = Array.prototype.slice.call(box.querySelectorAll('svg'))
      .find(s => s.querySelector('.pie-slice[data-frac]'));
    const slices = Array.prototype.slice.call(svg.querySelectorAll('.pie-slice[data-frac]'));
    const CX = 232, CY = 180, R0 = 72, R1 = 132, TAU = Math.PI * 2, n = slices.length;
    const A = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)].map(v => v.toFixed(2)).join(' ');
    const pad = 0.022;
    slices.forEach((s, k) => {
      const a1 = -Math.PI / 2 + k * TAU / n + pad / 2;
      const a2 = -Math.PI / 2 + (k + 1) * TAU / n - pad / 2;
      const lg = (a2 - a1) > Math.PI ? 1 : 0;
      s.setAttribute('d',
        'M' + A(R1, a1) + ' A' + R1.toFixed(2) + ' ' + R1.toFixed(2) + ' 0 ' + lg + ' 1 ' + A(R1, a2) +
        ' L' + A(R0, a2) + ' A' + R0.toFixed(2) + ' ' + R0.toFixed(2) + ' 0 ' + lg + ' 0 ' + A(R0, a1) + ' Z');
    });
  });
  await page.waitForTimeout(200);
  await box.screenshot({ path: SHOTS + '/pie-before-sim.png' });
  console.log('saved pie-before-sim.png');

  await browser.close();
})();
