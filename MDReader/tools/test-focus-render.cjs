/* ==================================================================
   CR-2026-11-15-03   Ctrl+O 改专注模式 + 保留渲染快捷菜单  专项测试
   ------------------------------------------------------------------
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-focus-render.cjs
   跑之前先 python MDReader/src/build.py

   验证口径：
   1) 静态产物：focus-render DOM/CSS/代理逻辑/文案/示例文档快捷键表全部落地；
   2) 快捷键：Ctrl+O 进入/再按退出专注；Ctrl+Shift+O 才打开文件；Esc 退出；
      顶栏按钮 #btnFocus / #focusExit 两个历史入口仍可用；
   3) 专注态：顶栏/侧栏/标签栏/状态栏隐藏，浮动渲染快捷菜单与进度条显示，
      且它不在 #content 里（不会污染导出 / 打印 / 用户正文翻译）；
   4) 内容内渲染工具条（.tw-bar/.chart-types/.mf-tools/.code-bar…）不被隐藏；
   5) 代理按钮「真生效」：排版、字号、柔光、数据图表、流程图、主题换肤
      的状态都回写到顶栏原控件，快捷菜单 .on 态与之一致；
      柔光代理只切换、不误开参数面板；
   6) 英文界面：新增词条全部翻译，快捷键文案一致；
   7) 打印媒体隐藏 focus-render；全程零 JS 错误。
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); }
};
const has = s => HTML.indexOf(s) >= 0;

async function state(p) {
  return p.evaluate(() => {
    const g = s => document.querySelector(s);
    const disp = s => { const e = g(s); return e ? getComputedStyle(e).display : 'MISSING'; };
    const attr = (s, a) => { const e = g(s); return e ? e.getAttribute(a) : null; };
    const fr = g('#focusRender');
    const btns = fr ? Array.prototype.slice.call(fr.querySelectorAll('[data-proxy]')) : [];
    const bars = Array.prototype.slice.call(document.querySelectorAll(
      '.tw-bar,.chart-types,.mf-tools,.mf-modes,.code-bar,.tf-block-bar'));
    return {
      focus: document.getElementById('app').classList.contains('focus'),
      frDisplay: disp('#focusRender'),
      toolbar: disp('.toolbar'), sidebar: disp('.sidebar'),
      statusbar: disp('.statusbar'), tabbar: disp('.tabbar'),
      frExit: disp('#focusExit'), frBar: disp('.focus-bar'),
      frCount: btns.length,
      proxyIds: btns.map(b => b.getAttribute('data-proxy')),
      proxyOn: btns.map(b => b.classList.contains('on')),
      frPos: fr ? getComputedStyle(fr).position : null,
      toastTop: g('#toast') ? getComputedStyle(g('#toast')).top : null,
      toastBottom: g('#toast') ? getComputedStyle(g('#toast')).bottom : null,
      toastRect: g('#toast') ? (() => { const r = g('#toast').getBoundingClientRect(); return { t: r.top, b: r.bottom }; })() : null,
      frRect: fr ? (() => { const r = fr.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })() : null,
      frInContent: fr ? g('#content').contains(fr) : null,
      barsCount: bars.length,
      barsHidden: bars.filter(e => getComputedStyle(e).display === 'none').length,
      spied: window.__spied || 0,
      theme: document.documentElement.dataset.theme,
      layout: document.documentElement.dataset.layout,
      pm: document.documentElement.dataset.pm || '',
      layoutSel: attr('#layoutSel', 'value') || (g('#layoutSel') || {}).value,
      chart: attr('#btnChartAuto', 'aria-checked'),
      flow: attr('#btnFlowAll', 'aria-checked'),
      pmSwitch: attr('#btnPaperMatte', 'aria-checked'),
      skinDark: attr('#skinDark', 'aria-pressed'),
      pmPopHidden: g('#pmPop') ? g('#pmPop').hasAttribute('hidden') : null,
      fsVar: g('#content') ? g('#content').style.getPropertyValue('--fs') : '',
      openTitle: attr('#btnOpenFile', 'title'),
      focusTitle: attr('#btnFocus', 'title'),
      exitTitle: attr('#focusExit', 'title'),
      frLabel: fr ? fr.getAttribute('aria-label') : null,
      tip: g('.w-tip') ? g('.w-tip').textContent : ''
    };
  });
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  const IGNORE = /_autoload\.js|ERR_FILE_NOT_FOUND.*_autoload|Failed to load resource/;
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    if (IGNORE.test(m.text())) return;
    errs.push('console: ' + m.text());
  });
  await p.goto(F);
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await p.waitForTimeout(2000);

  /* ---------------- 1. 静态产物 ---------------- */
  console.log('\n[1] 静态产物 / 文案 / 示例文档');
  ok('dist 含 #focusRender 容器', has('id="focusRender"'));
  ok('dist 含 CR-2026-11-15-03 标记', has('CR-2026-11-15-03'));
  ok('dist 含 Ctrl+Shift+O 打开文件分支', has("if (e.shiftKey) $('#filePicker').click();"));
  ok('dist 含 Ctrl+O 切专注分支', has("else setFocus(!focusApp.classList.contains('focus'));"));
  ok('dist 含 syncFocusRender()', has('function syncFocusRender()'));
  ok('dist 含 focusRender 点击代理', has("focusRender.addEventListener('click'"));
  ok('dist 含 .focus-render CSS', has('#app.focus .focus-render{display:flex}'));
  ok('dist 含专注态正文左侧让位（CR-05d 侧边菜单）', has('#app.focus .reader-inner{margin-left:112px;margin-right:12px;width:calc(100% - 124px)}'));
  ok('dist 含侧边竖排定位（CR-05d）', has('.focus-render{position:fixed;left:14px;top:50%;transform:translateY(-50%)'));
  ok('旧底部横条 / toast 上移规则已清零（CR-05d）',
    !has('bottom:18px;left:50%;transform:translateX(-50%)') && !has('html:has(#app.focus) #toast{bottom:auto;top:18px}'));
  ok('打印媒体隐藏 focus-render', has('.focus-render,.focus-exit,.focus-bar'));
  ok('专注模式隐藏规则不含内容内工具条',
    !/#app\.focus[^{]*\.tw-bar/.test(HTML) && !/#app\.focus[^{]*\.mf-tools/.test(HTML));
  ok('#btnOpenFile 标题改为 Ctrl+Shift+O', has('title="打开一个或多个 .md 文件 (Ctrl+Shift+O)"'));
  ok('旧 Ctrl+O 打开文件标题已清零', !has('title="打开一个或多个 .md 文件 (Ctrl+O)"'));
  ok('#btnFocus 标题标注 Ctrl+O', has('专注阅读模式 (Ctrl+O)'));
  ok('#focusExit 标题标注 Ctrl+O', has('title="退出专注阅读（Esc 或 Ctrl+O）"'));
  ok('欢迎屏提示改为 Ctrl+O 专注模式', has('Ctrl+O 专注模式 · Ctrl+Shift+O 打开文件'));
  ok('i18n 新增渲染快捷菜单词条', has("'专注模式 · 渲染快捷菜单': 'Focus Mode · Render Quick Menu'"));
  ok('i18n 打开文件词条同步', has("'打开一个或多个 .md 文件 (Ctrl+Shift+O)'"));
  ok('中文示例快捷键表新增专注模式', has('专注模式 | `Ctrl+O`'));
  ok('中文示例打开文件改为 Ctrl+Shift+O', has('打开文件 | `Ctrl+Shift+O`'));
  ok('英文示例新增 Focus mode 行', has('Focus mode | `Ctrl+O`'));
  ok('英文示例打开文件改为 Ctrl+Shift+O', has('Open file | `Ctrl+Shift+O`'));
  ok('英文示例三步开始同步', has('Ctrl+Shift+O` to open a file'));
  ok('dist/示例文档.md 同步单一数据源',
    fs.readFileSync(path.join(ROOT, 'dist', '示例文档.md'), 'utf8').indexOf('打开文件 | `Ctrl+Shift+O`') >= 0);

  /* ---------------- 2. 初始态 ---------------- */
  console.log('\n[2] 初始态 / 快捷键映射');
  await p.evaluate(() => {
    window.__spied = 0;
    const fp = document.getElementById('filePicker');
    fp.click = function () { window.__spied++; };
  });
  let s = await state(p);
  ok('初始不在专注模式', s.focus === false);
  ok('初始渲染快捷菜单隐藏', s.frDisplay === 'none', s.frDisplay);
  ok('快捷菜单共 14 个代理按钮（CR-05b 加 4 行高）', s.frCount === 14, s.frCount);
  ok('代理按钮集合正确', JSON.stringify(s.proxyIds) === JSON.stringify([
    'layoutSel', 'layoutSel', 'btnFontDown', 'btnFontUp',
    'lhSel', 'lhSel', 'lhSel', 'lhSel', 'btnPaperMatte',
    'btnChartAuto', 'btnFlowAll', 'skinLight', 'skinDark', 'skinSepia'
  ]), s.proxyIds);
  ok('快捷菜单为 fixed 定位', s.frPos === 'fixed', s.frPos);
  ok('快捷菜单不在 #content 内（不污染导出）', s.frInContent === false);
  ok('打开文件标题含 Ctrl+Shift+O', /Ctrl\+Shift\+O/.test(s.openTitle || ''), s.openTitle);
  ok('专注按钮标题含 Ctrl+O', /Ctrl\+O/.test(s.focusTitle || ''), s.focusTitle);
  ok('退出按钮标题含 Ctrl+O', /Ctrl\+O/.test(s.exitTitle || ''), s.exitTitle);
  ok('欢迎屏提示含两条新快捷键', /Ctrl\+O 专注模式/.test(s.tip) && /Ctrl\+Shift\+O 打开文件/.test(s.tip), s.tip);
  ok('示例文档正文已含 Ctrl+Shift+O',
    await p.evaluate(() => document.getElementById('content').textContent.indexOf('Ctrl+Shift+O') >= 0));
  ok('示例文档正文已含 Ctrl+O（专注模式行）',
    await p.evaluate(() => document.getElementById('content').textContent.indexOf('Ctrl+O') >= 0));

  /* ---------------- 3. Ctrl+O / Ctrl+Shift+O / Esc ---------------- */
  console.log('\n[3] 快捷键行为');
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(250);
  s = await state(p);
  ok('Ctrl+O 进入专注模式', s.focus === true);
  ok('Ctrl+O 不触发打开文件', s.spied === 0, s.spied);
  ok('专注下顶栏隐藏', s.toolbar === 'none', s.toolbar);
  ok('专注下侧栏隐藏', s.sidebar === 'none', s.sidebar);
  ok('专注下状态栏隐藏', s.statusbar === 'none', s.statusbar);
  ok('专注下标签栏隐藏', s.tabbar === 'none', s.tabbar);
  ok('专注下渲染快捷菜单显示', s.frDisplay === 'flex', s.frDisplay);
  ok('专注下退出按钮显示', s.frExit !== 'none' && s.frExit !== 'MISSING', s.frExit);
  ok('专注下顶部进度条显示', s.frBar !== 'none' && s.frBar !== 'MISSING', s.frBar);
  ok('快捷菜单完整落在视口内',
    s.frRect && s.frRect.l >= 0 && s.frRect.t >= 0 && s.frRect.r <= 1400 && s.frRect.b <= 900, s.frRect);
  ok('CR-05d 侧边菜单不占底部：toast 保持默认底部居中',
    s.toastBottom === '44px', { bottom: s.toastBottom, top: s.toastTop, toast: s.toastRect });
  ok('CR-05d 侧边菜单落在正文左留白（不遮正文）',
    s.frRect && s.frRect.r < 120 && s.frRect.l >= 0, s.frRect);
  ok('内容内渲染工具条存在', s.barsCount > 0, s.barsCount);
  ok('内容内渲染工具条未被专注模式隐藏', s.barsHidden === 0, s.barsHidden);

  await p.keyboard.press('Control+Shift+o');
  await p.waitForTimeout(200);
  s = await state(p);
  ok('Ctrl+Shift+O 触发打开文件一次', s.spied === 1, s.spied);
  ok('Ctrl+Shift+O 不改变专注状态', s.focus === true);

  await p.keyboard.press('Control+o');
  await p.waitForTimeout(200);
  s = await state(p);
  ok('再按 Ctrl+O 退出专注模式', s.focus === false);
  ok('退出后渲染快捷菜单收起', s.frDisplay === 'none', s.frDisplay);
  ok('退出后顶栏恢复', s.toolbar !== 'none', s.toolbar);
  ok('退出过程未触发打开文件', s.spied === 1, s.spied);

  await p.keyboard.press('Control+o');
  await p.waitForTimeout(200);
  ok('Ctrl+O 可再次进入', (await state(p)).focus === true);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok('Esc 退出专注模式', (await state(p)).focus === false);

  await p.click('#btnFocus');
  await p.waitForTimeout(200);
  ok('历史入口 #btnFocus 仍可进入', (await state(p)).focus === true);
  await p.click('#focusExit');
  await p.waitForTimeout(200);
  ok('历史入口 #focusExit 仍可退出', (await state(p)).focus === false);

  /* ---------------- 4. 代理按钮真生效 ---------------- */
  console.log('\n[4] 渲染快捷菜单 · 代理按钮真生效');
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(250);

  await p.click('.fr-btn[data-proxy="layoutSel"][data-val="paper"]');
  await p.waitForTimeout(500);
  s = await state(p);
  ok('代理「纸张」→ layoutSel=paper', s.layoutSel === 'paper', s.layoutSel);
  ok('代理「纸张」→ html data-layout=paper', s.layout === 'paper', s.layout);
  ok('代理「纸张」按钮呈 .on', s.proxyOn[1] === true, s.proxyOn);
  ok('代理「卡片」按钮未 .on', s.proxyOn[0] === false, s.proxyOn);

  await p.click('.fr-btn[data-proxy="layoutSel"][data-val="card"]');
  await p.waitForTimeout(500);
  s = await state(p);
  ok('代理「卡片」→ layoutSel=card', s.layoutSel === 'card', s.layoutSel);
  ok('代理「卡片」→ html data-layout=card', s.layout === 'card', s.layout);
  ok('代理「卡片」按钮呈 .on', s.proxyOn[0] === true, s.proxyOn);
  ok('代理「纸张」按钮回落未 .on', s.proxyOn[1] === false, s.proxyOn);

  const fsBefore = parseInt((await state(p)).fsVar, 10);
  await p.click('.fr-btn[data-proxy="btnFontUp"]');
  await p.waitForTimeout(200);
  const fsUp = parseInt((await state(p)).fsVar, 10);
  ok('代理「A+」字号 +1', fsUp === fsBefore + 1, { fsBefore, fsUp });
  await p.click('.fr-btn[data-proxy="btnFontDown"]');
  await p.waitForTimeout(200);
  const fsDown = parseInt((await state(p)).fsVar, 10);
  ok('代理「A−」字号回落', fsDown === fsBefore, { fsBefore, fsDown });

  /* CR-2026-11-15-05b 行高代理真生效 */
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
  await p.waitForTimeout(250);
  const lhLoose = await p.evaluate(() => ({
    lh: document.getElementById('content').style.getPropertyValue('--lh'),
    sel: document.getElementById('lhSel').value
  }));
  ok('代理「宽松」→ --lh=2.3 且顶栏下拉同步', lhLoose.lh === '2.3' && lhLoose.sel === 'loose', lhLoose);
  ok('代理「宽松」按钮呈 .on', (await state(p)).proxyOn[7] === true);
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  await p.waitForTimeout(250);
  const lhStd = await p.evaluate(() => document.getElementById('content').style.getPropertyValue('--lh'));
  ok('代理「标准」→ --lh 回落 1.78', lhStd === '1.78', lhStd);

  await p.click('.fr-btn[data-proxy="btnChartAuto"]');
  await p.waitForTimeout(300);
  s = await state(p);
  ok('代理「数据图表」→ 原开关 aria-checked=true', s.chart === 'true', s.chart);
  ok('代理「数据图表」按钮呈 .on', s.proxyOn[9] === true, s.proxyOn);

  await p.click('.fr-btn[data-proxy="btnFlowAll"]');
  await p.waitForTimeout(300);
  s = await state(p);
  ok('代理「流程图」→ 原开关 aria-checked=true', s.flow === 'true', s.flow);
  ok('代理「流程图」按钮呈 .on', s.proxyOn[10] === true, s.proxyOn);

  await p.click('.fr-btn[data-proxy="btnPaperMatte"]');
  await p.waitForTimeout(400);
  s = await state(p);
  ok('代理「柔光」→ data-pm=on', s.pm === 'on', s.pm);
  ok('代理「柔光」→ 原开关 aria-checked=true', s.pmSwitch === 'true', s.pmSwitch);
  ok('代理「柔光」按钮呈 .on', s.proxyOn[8] === true, s.proxyOn);
  ok('柔光代理只切换、未误开参数面板', s.pmPopHidden === true, s.pmPopHidden);

  await p.click('.fr-btn[data-proxy="skinDark"]');
  await p.waitForTimeout(600);
  s = await state(p);
  ok('代理「深色」→ html data-theme=dark', s.theme === 'dark', s.theme);
  ok('代理「深色」→ 原皮肤按钮 aria-pressed=true', s.skinDark === 'true', s.skinDark);
  ok('代理「深色」按钮呈 .on', s.proxyOn[12] === true, s.proxyOn);
  ok('代理「浅色」按钮未 .on', s.proxyOn[11] === false, s.proxyOn);
  ok('主题切换后仍处于专注模式', s.focus === true);
  ok('主题切换后快捷菜单仍显示', s.frDisplay === 'flex', s.frDisplay);

  await p.click('.fr-btn[data-proxy="skinLight"]');
  await p.waitForTimeout(600);
  s = await state(p);
  ok('代理「浅色」→ 回到 light', s.theme === 'light', s.theme);
  ok('代理「深色」按钮回落未 .on', s.proxyOn[12] === false, s.proxyOn);

  console.log('\n[5] 英文界面 / 零错误');
  await p.evaluate(() => {
    const sel = document.getElementById('setLang');
    if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
  });
  await p.waitForTimeout(1400);
  const en = await p.evaluate(() => {
    const g = s => document.querySelector(s);
    const fr = g('#focusRender');
    return {
      lang: document.documentElement.dataset.lang,
      frLabel: fr ? fr.getAttribute('aria-label') : null,
      openTitle: g('#btnOpenFile').getAttribute('title'),
      exitTitle: g('#focusExit').getAttribute('title'),
      pmBtn: fr.querySelector('[data-proxy="btnPaperMatte"]').textContent.trim(),
      chartBtn: fr.querySelector('[data-proxy="btnChartAuto"]').textContent.trim(),
      flowBtn: fr.querySelector('[data-proxy="btnFlowAll"]').textContent.trim(),
      lightBtn: fr.querySelector('[data-proxy="skinLight"]').textContent.trim(),
      cardBtn: fr.querySelector('[data-proxy="layoutSel"][data-val="card"]').textContent.trim(),
      tip: g('.w-tip') ? g('.w-tip').textContent : ''
    };
  });
  ok('切换到英文界面', en.lang === 'en', en.lang);
  ok('快捷菜单 aria-label 已翻译', en.frLabel === 'Focus Mode · Render Quick Menu', en.frLabel);
  ok('打开文件标题英文且快捷键正确', en.openTitle === 'Open one or more .md files (Ctrl+Shift+O)', en.openTitle);
  ok('退出专注标题英文且快捷键正确', en.exitTitle === 'Exit Focus Mode (Esc or Ctrl+O)', en.exitTitle);
  ok('「柔光」按钮翻译', en.pmBtn === 'Soft', en.pmBtn);
  ok('「数据图表」按钮翻译', en.chartBtn === 'Charts', en.chartBtn);
  ok('「流程图」按钮翻译', en.flowBtn === 'Flowcharts', en.flowBtn);
  ok('「浅色」按钮翻译', en.lightBtn === 'Light', en.lightBtn);
  ok('「卡片」按钮翻译', en.cardBtn === '▥ Card', en.cardBtn);
  ok('欢迎屏提示英文快捷键一致', /Ctrl\+O focus mode/.test(en.tip) && /Ctrl\+Shift\+O open/.test(en.tip), en.tip);

  await p.waitForTimeout(200);
  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 5));

  await b.close();
  console.log('\n============================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('============================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
