/* CR-2026-11-16-08 验证截图：
   收起态三主题 + 柔光 / 悬停展开 / 一键收起 / pin 态悬停 / 英文 / 窄屏 / 分组空行特写 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const SHOTS = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click()); await p.waitForTimeout(2400);
  const log = [];
  const shot = async (name, note) => { await p.screenshot({ path: path.join(SHOTS, name) }); log.push([name, note]); };
  const park = async () => { await p.mouse.move(950, 500); await p.waitForTimeout(450); };
  const hover = async () => {
    const r = await p.evaluate(() => { const b = document.getElementById('focusRender').getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await p.mouse.move(r.x, r.y); await p.waitForTimeout(400);
  };
  const geo = () => p.evaluate(() => {
    const h = document.getElementById('focusRender').getBoundingClientRect();
    const i = document.querySelector('.reader-inner').getBoundingClientRect();
    return { cls: document.getElementById('focusRender').className.replace('focus-render ', ''),
      dockW: +h.width.toFixed(1), dockR: +h.right.toFixed(1), innerL: +i.left.toFixed(1) };
  });
  const setTheme = async t => { await p.evaluate(x => document.getElementById('skin' + x).click(), t); await p.waitForTimeout(850); await park(); };
  const setPM = async want => { await p.evaluate(w => {
    const cur = document.documentElement.getAttribute('data-pm') === 'on';
    if (cur !== w) document.getElementById('setPm').click(); }, want); await p.waitForTimeout(950); await park(); };

  await p.keyboard.press('Control+o'); await p.waitForTimeout(600); await park();

  /* 1 浅色 · 收起态（默认）：40px 纯图标窄轨 */
  await shot('cr08-min-light.png', '浅色 · 收起态默认 40px 纯图标窄轨，五组 + 空行，正文让位 112px');
  console.log('1 收起态浅色 =', JSON.stringify(await geo()));

  /* 2 浅色 · 悬停展开：132px 图标 + 文字，正文二次让位 170px（菜单右缘 146 + 24px 呼吸位） */
  await hover();
  await shot('cr08-open-light.png', '浅色 · 鼠标移入自动展开 132px，图标+文字，正文同步让位 170px（留 24px 呼吸位）不遮字');
  console.log('2 展开态浅色 =', JSON.stringify(await geo()));
  await park();

  /* 3 分组空行特写（收起态，裁切菜单区域放大看） */
  const clip = await p.evaluate(() => {
    const r = document.getElementById('focusRender').getBoundingClientRect();
    return { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: r.width + 24, height: r.height + 24 };
  });
  await p.screenshot({ path: path.join(SHOTS, 'cr08-groups-zoom.png'), clip });
  log.push(['cr08-groups-zoom.png', '收起态菜单特写 · 五组同类合并（排版/字号/行高/开关/主题）+ 组间空行']);

  /* 4 深色 · 收起态 */
  await setTheme('Dark');
  await shot('cr08-min-dark.png', '深色 · 收起态材质跟随 --panel/--border，图标清晰');
  /* 5 深色 · 展开态 */
  await hover();
  await shot('cr08-open-dark.png', '深色 · 展开态文字可读，胶囊高亮跟随');
  await park();

  /* 6 护眼 · 收起态 */
  await setTheme('Sepia');
  await shot('cr08-min-sepia.png', '护眼 · 暖米底窄轨');
  /* 7 护眼 · 展开态 */
  await hover();
  await shot('cr08-open-sepia.png', '护眼 · 展开态暖色板');
  await park();

  /* 8 柔光 · 收起态 + 展开态 */
  await setTheme('Light');
  await setPM(true);
  await shot('cr08-min-pm.png', '云晰柔光 · 菜单自动切暖色板，与顶栏/侧栏同源');
  await hover();
  await shot('cr08-open-pm.png', '云晰柔光 · 展开态');
  await park();
  await setPM(false);

  /* 9 一键收起：只剩一颗开关钮 */
  await p.click('#frToggle'); await p.waitForTimeout(450); await park();
  await shot('cr08-pinned.png', '一键收起 · 整条只剩顶部一枚开关钮（40×约36），正文让位不变');
  console.log('9 pin 态 =', JSON.stringify(await geo()));

  /* 10 pin 态悬停 → 临时展开 */
  await hover();
  await shot('cr08-pinned-hover.png', 'pin 态鼠标移入 → 临时展开全菜单，移出自动缩回一颗钮');
  console.log('10 pin+hover =', JSON.stringify(await geo()));
  await park();
  await shot('cr08-pinned-back.png', 'pin 态移出后 → 自动缩回一颗钮');

  /* 还原 */
  await p.click('#frToggle'); await p.waitForTimeout(450); await park();

  /* 11 英文 · 收起态 */
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1900); await park();
  await shot('cr08-min-en.png', '英文 · 收起态纯图标（与中文完全一致，图标无语言依赖）');
  /* 12 英文 · 展开态：Comfortable / Flowcharts 最长词不截断 */
  await hover();
  await shot('cr08-open-en.png', '英文 · 展开态 Tight/Standard/Comfortable/Loose、Soft/Charts/Flowcharts 全不截断');
  console.log('12 英文展开 =', JSON.stringify(await geo()));
  await park();
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'zh-CN'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1600); await park();

  /* 13 窄屏 800 · 收起态 36px */
  await p.setViewportSize({ width: 800, height: 900 }); await p.waitForTimeout(650); await park();
  await shot('cr08-narrow-min.png', '窄屏 800 · 收起态 36px 窄轨，正文让位 62px');
  console.log('13 窄屏收起 =', JSON.stringify(await geo()));
  /* 14 窄屏 · 展开态 116px，正文让位 142px（菜单右缘 124 + 18px 呼吸位） */
  await hover();
  await shot('cr08-narrow-open.png', '窄屏 800 · 展开态 116px，正文同步让位 142px（留 18px 呼吸位）仍不遮字');
  console.log('14 窄屏展开 =', JSON.stringify(await geo()));
  await park();
  await p.setViewportSize({ width: 1400, height: 900 }); await p.waitForTimeout(650); await park();

  /* 15 选中态一览：把排版/行高/开关/主题都点亮，看多选胶囊与兜底底色 */
  await p.evaluate(() => {
    document.querySelector('.fr-btn[data-proxy="lhSel"][data-val="comfort"]').click();
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('btnChartAuto').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('btnFlowAll').click());
  await p.waitForTimeout(700); await park();
  await shot('cr08-multi-on.png', '多选点亮 · 排版/行高/图表/流程图/主题同时 .on，胶囊跟最后变化项，其余保留兜底底色');
  await hover();
  await shot('cr08-multi-on-open.png', '多选点亮 · 展开态逐项名称 + 选中态一目了然');
  await park();

  /* 16 退出专注 → 菜单消失，正文复位 */
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await shot('cr08-exit.png', '退出专注 · 菜单收起，顶栏/侧栏/标签栏恢复，正文回到常规宽度');

  console.log('\n零 JS 错误 =', errs.length === 0, errs.slice(0, 3));
  fs.writeFileSync(path.join(SHOTS, 'shot-cr08.log'),
    log.map(x => x[0] + '  —  ' + x[1]).join('\n') + '\n\nJS errors: ' + JSON.stringify(errs) + '\n', 'utf8');
  log.forEach(x => console.log('  ' + x[0] + '  —  ' + x[1]));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
