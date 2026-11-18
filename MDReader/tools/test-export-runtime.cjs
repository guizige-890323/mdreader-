/* ==================================================================
   CR-2026-11-15-04 专项验证 · 导出 HTML 支持渲染菜单
   ------------------------------------------------------------------
   链路：打开主应用 → 载入 fixture → 导出 HTML（拦截 Blob 写盘）
         → 以 file:// 打开导出页 → 逐项断言 9 类菜单真生效
         → 断言离线 / 零 JS 错误 / 打印隐藏菜单
         → 断言主应用未被导出预置污染、Word 导出不受影响

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-export-runtime.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const FIX = path.join(__dirname, '_fixtures', 'doc-style.md').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const OUT = path.join(SHOTS, 'export-sample.html').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/_autoload\.js$/.test(u)) return;
    if (/Failed to load resource/.test(m.text()) && !u) return;
    errs.push('console: ' + m.text() + ' @' + u);
  });
  await p.addInitScript(() => {
    window.__dl = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      try { if (/html|msword|svg/.test(blob.type || '')) window.__dl.push({ type: blob.type, p: blob.text() }); } catch (e) { }
      return orig(blob);
    };
  });
  await p.goto('file:///' + F);
  await p.waitForTimeout(1400);

  /* ---------- 运行时源码槽完整性 ---------- */
  console.log('\n=== A. 主应用：导出页运行时已内联且未被转义污染 ===');
  const slot = await p.evaluate(() => {
    const n = document.getElementById('mdx-runtime');
    const t = n ? n.textContent : '';
    return { exists: !!n, type: n ? n.type : '', len: t.length,
      hasGuard: t.indexOf('data-mdx-export') >= 0,
      hasMDExport: t.indexOf('window.MDExport') >= 0,
      escaped: t.indexOf('<\\/script') >= 0 || t.indexOf('<\\/SCRIPT') >= 0 };
  });
  ok('#mdx-runtime 脚本槽存在', slot.exists === true, slot);
  ok('type=text/plain（主应用不执行）', slot.type === 'text/plain', slot.type);
  ok('运行时源码完整（>12KB）', slot.len > 12000, slot.len);
  ok('含 data-mdx-export 启动守卫', slot.hasGuard === true);
  ok('含 window.MDExport 测试钩子', slot.hasMDExport === true);
  ok('源码未被 </script 转义污染', slot.escaped === false, slot);

  /* ---------- 载入 fixture，展开图表 ---------- */
  await p.setInputFiles('#filePicker', FIX);
  await p.waitForTimeout(2400);
  const before = await p.evaluate(() => ({
    style: document.documentElement.getAttribute('style') || '',
    modes: (() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('mdreader-mdflow-mode-') === 0) o[k] = localStorage.getItem(k); } return o; })(),
    charts: document.querySelectorAll('#content .chart-box').length,
    flows: document.querySelectorAll('#content .mf-wrap').length,
    mfSrc: document.querySelectorAll('#content .md-flow-box[data-mf-src]').length
  }));
  await p.evaluate(() => {
    document.querySelectorAll('#content .tw').forEach(tw => {
      const btn = tw.querySelector('button[data-act="chart"]');
      const box = tw.querySelector('.chart-box');
      if (btn && box && !box.classList.contains('show')) btn.click();
    });
  });
  await p.waitForTimeout(500);
  const shown = await p.evaluate(() => document.querySelectorAll('#content .chart-box.show').length);
  ok('fixture 渲染出 1 张可出图表格', before.charts === 1, before.charts);
  ok('fixture 渲染出 2 张流程图', before.flows === 2, before.flows);
  ok('两张流程图都留存 data-mf-src', before.mfSrc === 2, before.mfSrc);
  ok('图表已展开', shown === 1, shown);

  /* ---------- 导出 HTML ---------- */
  console.log('\n=== B. 导出页生成：Blob 内容 / 预置完整性 ===');
  await p.evaluate(() => { document.getElementById('btnExport').click(); });
  await p.evaluate(() => { const x = document.querySelector('#expMenu button[data-fmt="html"]'); if (x) x.click(); });
  await p.waitForTimeout(1600);
  const html = await p.evaluate(async () => {
    for (const d of window.__dl) if (/html/.test(d.type)) return await d.p;
    return '';
  });
  ok('导出 HTML Blob 已生成', html.length > 100000, html.length);
  fs.writeFileSync(OUT, html, 'utf8');
  ok('导出页已写盘', fs.existsSync(OUT) && fs.statSync(OUT).size > 100000);
  ok('带 data-mdx-export 启动标记', /<html[^>]*data-mdx-export/.test(html));
  ok('内联合法运行时源码', html.indexOf('window.MDExport') > 0);
  ok('含 #mdx-presets 预置数据', html.indexOf('id="mdx-presets"') > 0);
  ok('含 #mdx-store 预置模板', html.indexOf('id="mdx-store"') > 0);
  const tplCt = (html.match(/data-kind="ct"/g) || []).length;
  const tplFm = (html.match(/data-kind="fm"/g) || []).length;
  ok('图表预置 6 种类型', tplCt === 6, tplCt);
  ok('流程图预置 2×5=10 种结构', tplFm === 10, tplFm);
  ok('导出 HTML 保留 var(--mf-)（未固化）', html.indexOf('var(--mf-') > 0);
  ok('导出 HTML 无外部 CDN 引用', !/(src|href)\s*=\s*["']https?:/i.test(html));

  /* 主应用未被 buildStylePresets 污染 */
  const after = await p.evaluate(() => ({
    style: document.documentElement.getAttribute('style') || '',
    modes: (() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('mdreader-mdflow-mode-') === 0) o[k] = localStorage.getItem(k); } return o; })()
  }));
  ok('导出后主应用 <html style> 未变', after.style === before.style, [before.style.slice(0, 60), after.style.slice(0, 60)]);
  ok('导出预置未污染单图结构持久化', JSON.stringify(after.modes) === JSON.stringify(before.modes), [before.modes, after.modes]);

  /* ---------- 以 file:// 打开导出页 ---------- */
  console.log('\n=== C. 导出页离线打开：菜单 / 运行时 / 零错误 ===');
  const q = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const qerrs = [], net = [];
  q.on('pageerror', e => qerrs.push('pageerror: ' + e.message));
  q.on('console', m => { if (m.type() === 'error') qerrs.push('console: ' + m.text()); });
  q.on('request', r => { if (/^https?:/i.test(r.url())) net.push(r.url()); });
  await q.goto('file:///' + OUT);
  await q.waitForTimeout(900);
  const boot = await q.evaluate(() => ({
    mark: document.documentElement.hasAttribute('data-mdx-export'),
    bar: !!document.getElementById('mdx-bar'),
    css: !!document.getElementById('mdx-css'),
    store: !!document.getElementById('mdx-store'),
    presets: (() => { try { return JSON.parse(document.getElementById('mdx-presets').textContent); } catch (e) { return null; } })(),
    rt: !!(window.MDExport && window.MDExport.version),
    ver: window.MDExport && window.MDExport.version,
    charts: document.querySelectorAll('.chart-box[data-mdx-i]').length,
    flows: document.querySelectorAll('.mf-wrap[data-mdx-i]').length,
    vars: document.querySelector('.mf-svg') ? document.querySelector('.mf-svg').outerHTML.indexOf('var(--mf-') : -1,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    docStyle: document.documentElement.getAttribute('data-doc-style')
  }));
  ok('导出页带启动标记', boot.mark === true);
  ok('#mdx-bar 浮动渲染菜单已生成', boot.bar === true);
  ok('#mdx-css 菜单样式已自注入', boot.css === true);
  ok('#mdx-store 预置库存在', boot.store === true);
  ok('#mdx-presets 可解析', !!boot.presets, boot.presets && Object.keys(boot.presets));
  ok('预置数据含 12 组风格 CSS', boot.presets && Object.keys(boot.presets.styleCss || {}).length === 12,
    boot.presets && Object.keys(boot.presets.styleCss || {}).length);
  ok('预置统计 charts=1 / flows=2', boot.presets && boot.presets.charts === 1 && boot.presets.flows === 2, boot.presets && [boot.presets.charts, boot.presets.flows]);
  ok('轻量运行时已启动（window.MDExport）', boot.rt === true, boot.ver);
  ok('运行时版本 = CR-2026-11-15-06', boot.ver === 'CR-2026-11-15-06', boot.ver);
  ok('导出页 1 张可切图表', boot.charts === 1, boot.charts);
  ok('导出页 2 张可切流程图', boot.flows === 2, boot.flows);
  ok('导出页 SVG 保留 var(--mf-)', boot.vars >= 0, boot.vars);
  ok('初始主题 = light', boot.dataTheme === 'light', boot.dataTheme);
  ok('初始文档风格 = mono', boot.docStyle === 'mono', boot.docStyle);
  ok('离线：零 http(s) 外部请求', net.length === 0, net.slice(0, 3));
  ok('离线：零 JS 错误', qerrs.length === 0, qerrs.slice(0, 3));

  /* ---------- D. 九类菜单逐项断言 ---------- */
  console.log('\n=== D. 九类渲染菜单 ===');
  const ctl = await q.evaluate(() => ({
    findInput: !!document.getElementById('mdx-q'),
    findCount: !!document.getElementById('mdx-count'),
    findBtns: document.querySelectorAll('#mdx-bar button[data-find]').length,
    fontBtns: document.querySelectorAll('#mdx-bar button[data-font]').length,
    segs: [...document.querySelectorAll('#mdx-bar .mdx-seg')].map(g => ({ k: g.dataset.seg, n: g.querySelectorAll('button').length })),
    pm: !!document.querySelector('#mdx-bar [data-toggle="pm"]'),
    ctAll: !!document.getElementById('mdx-ct-all'),
    fmAll: !!document.getElementById('mdx-fm-all'),
    ctOpts: document.getElementById('mdx-ct-all') ? document.getElementById('mdx-ct-all').options.length : 0,
    fmOpts: document.getElementById('mdx-fm-all') ? document.getElementById('mdx-fm-all').options.length : 0,
    print: !!document.getElementById('mdx-print'),
    fold: !!document.getElementById('mdx-fold'),
    meta: (document.querySelector('#mdx-bar .mdx-meta') || {}).textContent || ''
  }));
  ok('① 查询：输入框', ctl.findInput === true);
  ok('① 查询：计数显示', ctl.findCount === true);
  ok('① 查询：上一条/下一条/清除 3 按钮', ctl.findBtns === 3, ctl.findBtns);
  ok('② 字体：A−/A+/重置 3 按钮', ctl.fontBtns === 3, ctl.fontBtns);
  ok('③ 主题：3 档分段', ctl.segs.some(s => s.k === 'theme' && s.n === 3), ctl.segs);
  ok('④ 文档风格：4 档分段', ctl.segs.some(s => s.k === 'style' && s.n === 4), ctl.segs);
  ok('⑥ 排版：2 档分段', ctl.segs.some(s => s.k === 'layout' && s.n === 2), ctl.segs);
  ok('⑤ 云晰柔光开关', ctl.pm === true);
  ok('⑦ 图表批量下拉（6 种 + 不改）', ctl.ctOpts === 7, ctl.ctOpts);
  ok('⑧ 流程图批量下拉（5 种 + 不改）', ctl.fmOpts === 6, ctl.fmOpts);
  ok('⑨ 打印按钮', ctl.print === true);
  ok('菜单体积提示可见', /KB/.test(ctl.meta), ctl.meta);

  /* ① 查询 */
  await q.fill('#mdx-q', '流程图');
  await q.waitForTimeout(420);
  let f1 = await q.evaluate(() => ({
    hits: document.querySelectorAll('mark.mdx-hit').length,
    count: document.getElementById('mdx-count').textContent,
    cur: document.querySelector('mark.mdx-cur') ? [...document.querySelectorAll('mark.mdx-hit')].indexOf(document.querySelector('mark.mdx-cur')) : -1
  }));
  ok('① 查询命中 >0 条', f1.hits > 0, f1);
  ok('① 计数格式 1/N', /^1\/\d+$/.test(f1.count), f1.count);
  ok('① 当前命中高亮 mdx-cur', f1.cur === 0, f1);
  await q.click('#mdx-bar button[data-find="next"]');
  let f2 = await q.evaluate(() => ({
    count: document.getElementById('mdx-count').textContent,
    cur: document.querySelector('mark.mdx-cur') ? [...document.querySelectorAll('mark.mdx-hit')].indexOf(document.querySelector('mark.mdx-cur')) : -1
  }));
  ok('① 下一条切换高亮索引', f2.cur !== f1.cur && f2.cur >= 0, [f1.cur, f2.cur]);
  ok('① 下一条计数同步', f2.count !== f1.count || f1.hits === 1, [f1.count, f2.count]);
  await q.click('#mdx-bar button[data-find="clear"]');
  let f3 = await q.evaluate(() => document.querySelectorAll('mark.mdx-hit').length);
  ok('① 清除后无高亮残留', f3 === 0, f3);

  /* ② 字体 */
  const fs0 = await q.evaluate(() => document.getElementById('content').style.fontSize);
  await q.click('#mdx-bar button[data-font="+"]');
  const fs1 = await q.evaluate(() => document.getElementById('content').style.fontSize);
  await q.click('#mdx-bar button[data-font="-"]');
  const fs2 = await q.evaluate(() => document.getElementById('content').style.fontSize);
  await q.click('#mdx-bar button[data-font="0"]');
  const fs3 = await q.evaluate(() => document.getElementById('content').style.fontSize);
  ok('② A+ 字号增大', parseInt(fs1, 10) === parseInt(fs0, 10) + 1, [fs0, fs1]);
  ok('② A− 字号减小', parseInt(fs2, 10) === parseInt(fs1, 10) - 1, [fs1, fs2]);
  ok('② ↺ 重置回初值', fs3 === fs0, [fs0, fs3]);

  /* ③ 主题 */
  const textLight = await q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim());
  await q.click('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="dark"]');
  const th = await q.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    on: (document.querySelector('#mdx-bar .mdx-seg[data-seg="theme"] button.on') || {}).dataset
      ? document.querySelector('#mdx-bar .mdx-seg[data-seg="theme"] button.on').dataset.v : null
  }));
  ok('③ 主题切到 dark', th.theme === 'dark', th.theme);
  ok('③ 深色下 --text 真实变化', th.text !== textLight && /^#/.test(th.text), [textLight, th.text]);
  ok('③ 分段选中态同步', th.on === 'dark', th.on);
  await q.click('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="sepia"]');
  const th2 = await q.evaluate(() => document.documentElement.getAttribute('data-theme'));
  ok('③ 主题切到护眼', th2 === 'sepia', th2);
  await q.click('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="light"]');

  /* ④ 文档风格 */
  const acc0 = await q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tt-accent').trim());
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="gov"]');
  const sty = await q.evaluate(() => ({
    ds: document.documentElement.getAttribute('data-doc-style'),
    tt: document.documentElement.getAttribute('data-table-theme'),
    acc: getComputedStyle(document.documentElement).getPropertyValue('--tt-accent').trim(),
    mf: getComputedStyle(document.documentElement).getPropertyValue('--mf-a1').trim(),
    syn: getComputedStyle(document.documentElement).getPropertyValue('--syn-kw').trim(),
    svgVarStill: (document.querySelector('.mf-svg') || {}).outerHTML
      ? document.querySelector('.mf-svg').outerHTML.indexOf('var(--mf-') : -1
  }));
  ok('④ 文档风格切到 gov', sty.ds === 'gov' && sty.tt === 'gov', [sty.ds, sty.tt]);
  ok('④ --tt-accent 随风格变化', sty.acc !== acc0 && /^#/.test(sty.acc), [acc0, sty.acc]);
  ok('④ --mf-a1 流程图主色同步', /^#/.test(sty.mf), sty.mf);
  /* tint() 对语法色可能返回 rgb(...) 串，getComputedStyle 也会把部分 hex 规范化；
     只要是非空合法颜色即可，不限定 # 开头。 */
  ok('④ --syn-kw 代码关键字同步', /^(#|rgba?\()/i.test(sty.syn), sty.syn);
  ok('④ 切风格后 SVG 仍是变量（能跟着变色）', sty.svgVarStill >= 0, sty.svgVarStill);
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="tech"]');
  const sty2 = await q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tt-accent').trim());
  ok('④ 再切 tech 色板继续变化', sty2 !== sty.acc && /^#/.test(sty2), [sty.acc, sty2]);
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="mono"]');

  /* ⑤ 柔光 */
  await q.click('#mdx-bar [data-toggle="pm"]');
  const pm1 = await q.evaluate(() => document.documentElement.getAttribute('data-pm'));
  await q.click('#mdx-bar [data-toggle="pm"]');
  const pm2 = await q.evaluate(() => document.documentElement.getAttribute('data-pm'));
  ok('⑤ 柔光开启 data-pm=on', pm1 === 'on', pm1);
  ok('⑤ 柔光可关闭', pm2 === null, pm2);

  /* ⑥ 排版 */
  await q.click('#mdx-bar .mdx-seg[data-seg="layout"] button[data-v="paper"]');
  const lay = await q.evaluate(() => document.documentElement.getAttribute('data-layout'));
  ok('⑥ 排版切到纸张', lay === 'paper', lay);
  await q.click('#mdx-bar .mdx-seg[data-seg="layout"] button[data-v="card"]');

  /* ⑦ 单图图表类型 */
  const chartBefore = await q.evaluate(() => {
    const b = document.querySelector('.chart-box[data-mdx-i]');
    return b ? { ct: b.dataset.ct, html: b.innerHTML.length, paths: b.querySelectorAll('svg path').length } : null;
  });
  await q.evaluate(() => {
    const b = document.querySelector('.chart-box[data-mdx-i]');
    const x = b && b.querySelector('.chart-types button[data-ct="pie"]');
    if (x) x.click();
  });
  const chartPie = await q.evaluate(() => {
    const b = document.querySelector('.chart-box[data-mdx-i]');
    return { ct: b.dataset.ct, html: b.innerHTML.length, paths: b.querySelectorAll('svg path').length,
      on: (b.querySelector('.chart-types button.on') || {}).dataset ? b.querySelector('.chart-types button.on').dataset.ct : null,
      tplLeft: document.querySelectorAll('#mdx-store template[data-kind="ct"]').length };
  });
  ok('⑦ 单图切到环形图（data-ct）', chartPie.ct === 'pie', chartPie.ct);
  ok('⑦ 单图按钮选中态同步', chartPie.on === 'pie', chartPie.on);
  ok('⑦ 图形内容真的重绘', chartPie.html !== chartBefore.html || chartPie.paths !== chartBefore.paths, [chartBefore, chartPie]);
  ok('⑦ 切换不破坏预置库', chartPie.tplLeft === 6, chartPie.tplLeft);
  await q.evaluate(() => {
    const b = document.querySelector('.chart-box[data-mdx-i]');
    const x = b && b.querySelector('.chart-types button[data-ct="bar"]');
    if (x) x.click();
  });
  const chartBar = await q.evaluate(() => document.querySelector('.chart-box[data-mdx-i]').dataset.ct);
  ok('⑦ 可再切回柱状图', chartBar === 'bar', chartBar);

  /* ⑧ 单图流程图结构 */
  const flowBefore = await q.evaluate(() => {
    const w = document.querySelector('.mf-wrap[data-mdx-i]');
    const svg = w && w.querySelector('svg.mf-svg');
    const n = svg && svg.querySelector('.mf-node');
    return { mode: w.dataset.mdxMode || '', svg: svg ? svg.innerHTML.length : 0,
      first: n ? (n.getAttribute('transform') || n.getAttribute('x') || '') : '' };
  });
  await q.evaluate(() => {
    const w = document.querySelector('.mf-wrap[data-mdx-i]');
    const x = w && w.querySelector('.mf-modes button[data-mode="org"]');
    if (x) x.click();
  });
  const flowOrg = await q.evaluate(() => {
    const w = document.querySelector('.mf-wrap[data-mdx-i]');
    const svg = w.querySelector('svg.mf-svg');
    const n = svg && svg.querySelector('.mf-node');
    return { mode: w.dataset.mdxMode, svg: svg ? svg.innerHTML.length : 0,
      first: n ? (n.getAttribute('transform') || n.getAttribute('x') || '') : '',
      on: (w.querySelector('.mf-modes button.on') || {}).dataset ? w.querySelector('.mf-modes button.on').dataset.mode : null,
      tplLeft: document.querySelectorAll('#mdx-store template[data-kind="fm"]').length,
      varLeft: svg ? svg.outerHTML.indexOf('var(--mf-') : -1 };
  });
  ok('⑧ 单图结构切到组织结构图', flowOrg.mode === 'org', flowOrg.mode);
  ok('⑧ 结构按钮选中态同步', flowOrg.on === 'org', flowOrg.on);
  ok('⑧ SVG 几何真的重排', flowOrg.svg !== flowBefore.svg || flowOrg.first !== flowBefore.first, [flowBefore, flowOrg]);
  ok('⑧ 切结构不破坏预置库', flowOrg.tplLeft === 10, flowOrg.tplLeft);
  ok('⑧ 切结构后仍保留 CSS 变量', flowOrg.varLeft >= 0, flowOrg.varLeft);
  await q.evaluate(() => {
    const w = document.querySelector('.mf-wrap[data-mdx-i]');
    const x = w && w.querySelector('.mf-modes button[data-mode="timeline"]');
    if (x) x.click();
  });
  const flowTl = await q.evaluate(() => document.querySelector('.mf-wrap[data-mdx-i]').dataset.mdxMode);
  ok('⑧ 可再切到时间图', flowTl === 'timeline', flowTl);

  /* 批量切换 */
  await q.selectOption('#mdx-ct-all', 'line');
  const batchCt = await q.evaluate(() => [...document.querySelectorAll('.chart-box[data-mdx-i]')].map(b => b.dataset.ct));
  ok('⑦ 批量：所有图表切到 line', batchCt.length === 1 && batchCt.every(v => v === 'line'), batchCt);
  await q.selectOption('#mdx-fm-all', 'pipeline');
  const batchFm = await q.evaluate(() => [...document.querySelectorAll('.mf-wrap[data-mdx-i]')].map(w => w.dataset.mdxMode));
  ok('⑧ 批量：所有流程图切到 pipeline', batchFm.length === 2 && batchFm.every(v => v === 'pipeline'), batchFm);

  /* ⑨ 打印隐藏 + 折叠 */
  await q.emulateMedia({ media: 'print' });
  const printHide = await q.evaluate(() => ({
    bar: getComputedStyle(document.getElementById('mdx-bar')).display,
    store: getComputedStyle(document.getElementById('mdx-store')).display,
    tools: (() => { const n = document.querySelector('.mf-tools'); return n ? getComputedStyle(n).display : 'none'; })()
  }));
  ok('⑨ 打印媒体隐藏浮动菜单', printHide.bar === 'none', printHide);
  ok('⑨ 打印媒体隐藏预置库', printHide.store === 'none', printHide);
  ok('⑨ 打印媒体隐藏流程图工具条', printHide.tools === 'none', printHide);
  await q.emulateMedia({ media: 'screen' });
  await q.click('#mdx-fold');
  const folded = await q.evaluate(() => ({ cls: document.body.classList.contains('mdx-folded'), txt: document.getElementById('mdx-fold').textContent }));
  ok('菜单可折叠', folded.cls === true && folded.txt === '+', folded);
  await q.click('#mdx-fold');

  /* ---------- E. Word 导出不受影响 ---------- */
  console.log('\n=== E. 回归：Word 导出仍固化颜色、不受交互导出影响 ===');
  await p.evaluate(() => { document.getElementById('btnExport').click(); });
  await p.evaluate(() => { const x = document.querySelector('#expMenu button[data-fmt="word"]'); if (x) x.click(); });
  await p.waitForTimeout(2600);
  const word = await p.evaluate(async () => {
    for (let i = window.__dl.length - 1; i >= 0; i--) if (/msword/.test(window.__dl[i].type)) return await window.__dl[i].p;
    return '';
  });
  ok('Word 导出 Blob 已生成', word.length > 20000, word.length);
  ok('Word 内容含 HTML 包装', /<html/i.test(word));
  ok('Word 内 SVG 颜色已固化（无 var(--mf-)）', word.indexOf('var(--mf-') < 0, word.indexOf('var(--mf-'));
  ok('主应用零 JS 错误', errs.length === 0, errs.slice(0, 3));
  ok('导出页零 JS 错误（全程）', qerrs.length === 0, qerrs.slice(0, 3));

  console.log('\n==================================================');
  console.log('  PASS = ' + pass + '   FAIL = ' + fail);
  console.log('==================================================');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
