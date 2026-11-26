/* 展示页专用重拍：深色柔光 + 完整图表可视化 + 流程图 + 图表风格
   产出宽扁比例（约 2.4:1），贴合 Cover Flow 卡片的 media 区，避免 contain 留白与拼接图截断 */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const SHOTS = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1300);
  await p.evaluate(() => document.getElementById('wDemo').click()); await p.waitForTimeout(2300);

  const shot = async (name, note) => {
    await p.screenshot({ path: path.join(SHOTS, name) });
    console.log(name + '  ' + note);
  };
  const park = async () => { await p.mouse.move(1250, 650); await p.waitForTimeout(400); };
  const setTheme = async t => { await p.evaluate(x => document.getElementById('skin' + x).click(), t); await p.waitForTimeout(800); await park(); };
  const setPM = async want => { await p.evaluate(w => {
    const cur = document.documentElement.getAttribute('data-pm') === 'on';
    if (cur !== w) document.getElementById('setPm').click(); }, want); await p.waitForTimeout(900); await park(); };
  /* 把某个 show 的图表滚到视口中部偏上，让「表格 + 图表」同时入镜 */
  const focusChart = async idx => {
    await p.evaluate(i => {
      const els = [...document.querySelectorAll('.chart-box.show')];
      if (els[i]) els[i].scrollIntoView({ block: 'center' });
    }, idx || 0);
    await p.waitForTimeout(700); await park();
  };

  /* 1 图表可视化完整：浅色 · 表格 + 柱状图同屏 */
  await focusChart(0);
  await shot('showcase-chart-full.png', '表格 + 柱状图完整同屏，图表切换按钮可见');

  /* 2 图表风格：点表格工具条里的「蓝色科技」，四套配色切换器同屏 */
  await p.evaluate(() => {
    const b = document.querySelector('.tw-bar .tt-btn[data-tt="tech"]');
    if (b) b.click();
  });
  await p.waitForTimeout(700); await park();
  await shot('showcase-chart-style.png', '图表/表格蓝色科技配色，四套风格切换按钮可见');

  /* 3 柔光深色：深色主题 + 云晰柔光，表格图表区同屏 */
  await setTheme('Dark');
  await setPM(true);
  await focusChart(0);
  await shot('showcase-pm-dark.png', '深色主题 + 云晰柔光 · 表格与图表完整同屏，整体暖深色');
  const st = await p.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), pm: document.documentElement.getAttribute('data-pm') }));
  console.log('柔光态 =', JSON.stringify(st));
  await setPM(false);
  await setTheme('Light');

  /* 4 流程图完整：滚到 MDFlow 图区 */
  await p.evaluate(() => { const m = document.querySelector('.mf-wrap'); if (m) m.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(700); await park();
  await shot('showcase-flow-full.png', 'MDFlow 流程图完整可见（节点 + 连线 + 工具条）');

  /* 5 导出：打开导出下拉，露出 HTML/Word/PDF/SVG 菜单 */
  await p.evaluate(() => {
    const b = document.getElementById('btnExport');
    if (b) b.click();
  });
  await p.waitForTimeout(500); await park();
  await shot('showcase-export-menu.png', '导出菜单展开 · HTML / Word / PDF / 源码多格式');

  console.log('JS errors =', errs.length, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
