/* CR-18 欢迎屏 Cover Flow 截图：默认/悬停/翻页/三主题/窄屏 */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const SHOTS = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1500);
  const shot = async (n, note) => { await p.screenshot({ path: path.join(SHOTS, n) }); console.log(n + '  ' + note); };
  const park = async () => { await p.mouse.move(1300, 820); await p.waitForTimeout(400); };
  const setTheme = async t => { await p.evaluate(x => document.getElementById('skin' + x).click(), t); await p.waitForTimeout(700); await park(); };

  await park();
  await shot('cr18-flow-light.png', '浅色 · 欢迎屏 Cover Flow 默认态');
  await p.click('.wf-nav.r'); await p.waitForTimeout(900); await park();
  await shot('cr18-flow-next.png', '点右箭头 → 下一张居中');
  /* 悬停中心卡：追光 + 3D 共存 */
  await p.evaluate(() => {
    const grid = document.getElementById('gridFeats');
    const it = [...grid.querySelectorAll('.wf-item')].find(x => x.style.zIndex === '100');
    const r = it.getBoundingClientRect();
    window.__hoverPt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const pt = await p.evaluate(() => window.__hoverPt);
  await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(500);
  await shot('cr18-flow-hover.png', '悬停中心卡 · 3D 轮播 + 追光高亮共存');
  await park();

  await setTheme('Dark');
  await shot('cr18-flow-dark.png', '深色 · Cover Flow');
  await setTheme('Sepia');
  await shot('cr18-flow-sepia.png', '护眼 · Cover Flow');
  await setTheme('Light');

  await p.setViewportSize({ width: 820, height: 760 }); await p.waitForTimeout(800); await park();
  await shot('cr18-flow-narrow.png', '窄屏 820 · 卡片缩到 210px');
  await p.setViewportSize({ width: 560, height: 760 }); await p.waitForTimeout(800); await park();
  await shot('cr18-flow-mobile.png', '窄屏 560 · 卡片缩到 188px');

  console.log('JS errors =', errs.length, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
