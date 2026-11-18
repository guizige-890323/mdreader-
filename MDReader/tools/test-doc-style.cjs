/* CR-2026-11-15-01 专项验证
   A. 单图结构：每张流程图右上角的按钮组、单图覆盖隔离、持久化、全局默认不覆盖
   B. 统一文档风格：四套色板联动分段背景 / 图表 / 流程图 / 代码高亮；明暗派生；皮肤显式覆盖
   C. 导出 HTML 固化内联变量；SVG 无残留 var()
   D. 截图对比；E. 零 JS 异常
   跑之前先 python src/build.py；需 NODE_PATH 指向含 playwright-core 的 node_modules。 */
const { chromium } = require('playwright-core');
const { spawnSync } = require('child_process');
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const FIX = path.join(__dirname, '_fixtures', 'doc-style.md').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
/* 浏览器关闭时 playwright 内部可能有 pending navigation reject，与断言无关 */
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/_autoload\.js$/.test(u)) return;
    if (/Failed to load resource/.test(m.text()) && !u) return;
    errs.push('c: ' + m.text() + ' @' + u);
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
  await p.waitForTimeout(1500);
  await p.setInputFiles('#filePicker', FIX);
  await p.waitForTimeout(2800);

  /* ---------- 读取两张流程图的状态 ---------- */
  const wraps = () => p.evaluate(() => {
    return [...document.querySelectorAll('.mf-wrap')].map(w => {
      const svg = w.querySelector('.mf-svg'), tools = w.querySelector('.mf-tools');
      const on = w.querySelector('.mf-modes button.on');
      const sp = tools && tools.querySelector('.mf-sp'), md = tools && tools.querySelector('.mf-modes');
      return {
        head: (svg && svg.querySelector('.mf-head text') || {}).textContent || '',
        on: on ? on.dataset.mode : null,
        modeCount: w.querySelectorAll('.mf-modes button').length,
        hasAxis: !!(svg && svg.querySelector('.mf-axis')),
        elbow: svg ? [...svg.querySelectorAll('.mf-line')].some(q => /[VH]/.test(q.getAttribute('d') || '')) : false,
        vb: svg ? svg.getAttribute('viewBox') : null,
        /* 结构按钮组必须排在弹性占位之后 = 工具条右上角 */
        modesAfterSpacer: !!(sp && md && (sp.compareDocumentPosition(md) & Node.DOCUMENT_POSITION_FOLLOWING)),
        modesBeforeCopy: !!(md && tools && (() => {
          const cp = [...tools.querySelectorAll('button[data-act]')].find(x => x.dataset.act === 'copy');
          return cp && (md.compareDocumentPosition(cp) & Node.DOCUMENT_POSITION_FOLLOWING);
        })())
      };
    });
  });
  const clickMode = (idx, mode) => p.evaluate(a => {
    const w = document.querySelectorAll('.mf-wrap')[a[0]];
    const btn = w && w.querySelector('.mf-modes button[data-mode="' + a[1] + '"]');
    if (btn) btn.click();
  }, [idx, mode]);
  const clickSeg = (sel, attr, v) => p.evaluate(a => {
    const btn = document.querySelector(a[0] + ' button[' + a[1] + '="' + a[2] + '"]');
    if (btn) btn.click();
  }, [sel, attr, v]);

  /* ==================== A. 单图结构 ==================== */
  console.log('\n=== A. 单图结构选择（右上角按钮组 / 隔离 / 持久化） ===');
  let w = await wraps();
  ok('渲染出 2 张流程图', w.length === 2, w.length);
  if (w.length === 2) {
    ok('每张图都有 5 个结构按钮', w[0].modeCount === 5 && w[1].modeCount === 5, [w[0].modeCount, w[1].modeCount]);
    ok('按钮组位于工具条右上角（占位之后）', w[0].modesAfterSpacer && w[1].modesAfterSpacer, [w[0].modesAfterSpacer, w[1].modesAfterSpacer]);
    ok('按钮组在「复制源码」之前', w[0].modesBeforeCopy && w[1].modesBeforeCopy, [w[0].modesBeforeCopy, w[1].modesBeforeCopy]);
    ok('两图初始都选中 auto', w[0].on === 'auto' && w[1].on === 'auto', [w[0].on, w[1].on]);
  }

  const beforeB = w[1] ? { vb: w[1].vb, head: w[1].head, on: w[1].on } : null;
  await clickMode(0, 'org');
  await p.waitForTimeout(800);
  w = await wraps();
  ok('图 A 切到组织结构图', w[0] && w[0].on === 'org' && /ORG/.test(w[0].head), w[0] && { on: w[0].on, head: w[0].head });
  ok('组织图使用肘形连线', w[0] && w[0].elbow === true, w[0] && w[0].elbow);
  /* auto 会按图形态自动选型（浅树也会判 org），所以不能用「眉题是否含 ORG」判断隔离；
     正确口径是「切换前后图 B 的画布 / 眉题 / 选中态三者完全不变」。 */
  ok('图 B 未被影响（画布 / 眉题 / 选中态均不变）',
    !!beforeB && !!w[1] && w[1].vb === beforeB.vb && w[1].head === beforeB.head && w[1].on === beforeB.on,
    { before: beforeB, after: w[1] && { vb: w[1].vb, head: w[1].head, on: w[1].on } });

  await clickMode(1, 'timeline');
  await p.waitForTimeout(800);
  w = await wraps();
  ok('图 B 切到时间图', w[1] && w[1].on === 'timeline' && /TIMELINE/.test(w[1].head), w[1] && { on: w[1].on, head: w[1].head });
  ok('时间图有中轴', w[1] && w[1].hasAxis === true, w[1] && w[1].hasAxis);
  ok('图 A 仍为组织结构图', w[0] && w[0].on === 'org' && /ORG/.test(w[0].head), w[0] && { on: w[0].on, head: w[0].head });
  ok('两图画布确实不同', w[0] && w[1] && w[0].vb !== w[1].vb, [w[0] && w[0].vb, w[1] && w[1].vb]);

  const keys = await p.evaluate(() => Object.keys(localStorage)
    .filter(k => k.indexOf('mdreader-mdflow-mode-') === 0)
    .map(k => [k, localStorage.getItem(k)]));
  ok('按源码 hash 持久化 2 条单图覆盖', keys.length === 2, keys);
  ok('持久化值为 org / timeline', keys.map(x => x[1]).sort().join(',') === 'org,timeline', keys.map(x => x[1]));

  await p.reload();
  await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', FIX);
  await p.waitForTimeout(2800);
  w = await wraps();
  ok('刷新后图 A 恢复 org', w[0] && w[0].on === 'org' && /ORG/.test(w[0].head), w[0] && { on: w[0].on, head: w[0].head });
  ok('刷新后图 B 恢复 timeline', w[1] && w[1].on === 'timeline' && /TIMELINE/.test(w[1].head), w[1] && { on: w[1].on, head: w[1].head });

  await clickSeg('#setFlowMode', 'data-fm', 'mindmap');
  await p.waitForTimeout(1400);
  w = await wraps();
  ok('全局默认改为导图后，已单图选过的 A 仍是 org', w[0] && w[0].on === 'org', w[0] && w[0].on);
  ok('全局默认改为导图后，已单图选过的 B 仍是 timeline', w[1] && w[1].on === 'timeline', w[1] && w[1].on);
  await clickSeg('#setFlowMode', 'data-fm', 'auto');
  await p.waitForTimeout(1000);

  /* ==================== B. 统一文档风格 ==================== */
  console.log('\n=== B. 统一文档风格（四套色板 × 四个模块联动） ===');
  const vars = () => p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement), st = document.documentElement.style;
    const g = k => (cs.getPropertyValue(k) || '').trim();
    const inl = k => (st.getPropertyValue(k) || '').trim();
    const kw = document.querySelector('.hljs-keyword');
    const head = document.querySelector('.doc-card > .card-head');
    return {
      accent: g('--tt-accent'), bar: g('--tt-bar'), mf1: g('--mf-a1'), mf1s: g('--mf-a1s'), synKw: g('--syn-kw'),
      inlineAccent: inl('--tt-accent'), inlineMf1: inl('--mf-a1'), inlineSynKw: inl('--syn-kw'),
      kwColor: kw ? getComputedStyle(kw).color : '',
      headBg: head ? getComputedStyle(head).backgroundImage : '',
      docStyle: document.documentElement.dataset.docStyle,
      tableTheme: document.documentElement.dataset.tableTheme,
      flowStyle: document.documentElement.dataset.flowStyle,
      theme: document.documentElement.dataset.theme
    };
  });

  await clickSeg('#setTT', 'data-tt', 'mono');
  await p.waitForTimeout(500);
  const vMono = await vars();
  ok('派生变量已注入 <html> 内联样式', !!vMono.inlineAccent && !!vMono.inlineMf1 && !!vMono.inlineSynKw,
    { a: vMono.inlineAccent, m: vMono.inlineMf1, s: vMono.inlineSynKw });
  ok('mono 分段强调色 = #111111', vMono.accent === '#111111', vMono.accent);
  ok('mono 流程图主色 = 灰阶 #374151', vMono.mf1 === '#374151', vMono.mf1);
  ok('docStyle 与 tableTheme 同步', vMono.docStyle === 'mono' && vMono.tableTheme === 'mono', [vMono.docStyle, vMono.tableTheme]);

  /* 展开图表，后续切风格应自动重绘 */
  await p.evaluate(() => { const b = document.querySelector('.tw-bar button[data-act="chart"]'); if (b) b.click(); });
  await p.waitForTimeout(900);
  const chartOf = () => p.evaluate(() => {
    const box = document.querySelector('.chart-box.show');
    /* 盒内第一个 svg 是 .chart-types 的按钮图标，必须取整盒 HTML 才能看到图表色板 */
    return { show: !!box, txt: box ? box.innerHTML.slice(0, 20000) : '' };
  });
  const cMono = await chartOf();
  ok('图表已展开', cMono.show === true, cMono.show);

  const acc = {}, syn = {}, mf = {};
  acc.mono = vMono.accent; syn.mono = vMono.synKw; mf.mono = vMono.mf1;
  for (const s of ['tech', 'gov', 'cute']) {
    await clickSeg('#setTT', 'data-tt', s);
    await p.waitForTimeout(650);
    const v = await vars();
    acc[s] = v.accent; syn[s] = v.synKw; mf[s] = v.mf1;
    ok(s + ' 文档风格属性已同步', v.docStyle === s && v.tableTheme === s, [v.docStyle, v.tableTheme]);
    if (s === 'tech') {
      ok('tech 分段强调色 = #2563eb', v.accent === '#2563eb', v.accent);
      ok('tech 流程图主色与分段同源 = #2563eb', v.mf1 === '#2563eb', v.mf1);
      const cTech = await chartOf();
      ok('tech 图表色板同源（含 #2563eb）', /#2563eb/i.test(cTech.txt), cTech.txt.slice(0, 160));
      ok('代码高亮随风格变化', !!vMono.kwColor && v.kwColor !== vMono.kwColor, [vMono.kwColor, v.kwColor]);
      ok('分段背景随风格变化', !!vMono.headBg && v.headBg !== vMono.headBg, [vMono.headBg, v.headBg]);
      ok('mono 与 tech 代码关键字色不同', vMono.synKw !== v.synKw, [vMono.synKw, v.synKw]);
    }
    if (s === 'gov') ok('gov 分段强调色 = #9b1c1c', v.accent === '#9b1c1c', v.accent);
    if (s === 'cute') ok('cute 分段强调色 = #e0417f', v.accent === '#e0417f', v.accent);
  }
  ok('四套风格分段色互不相同', new Set(Object.values(acc)).size === 4, acc);
  ok('四套风格流程图主色互不相同', new Set(Object.values(mf)).size === 4, mf);
  ok('四套风格代码关键字色互不相同', new Set(Object.values(syn)).size === 4, syn);

  /* 导出 SVG 的 CSS 变量必须已固化为真实色 */
  const inlineSvg = await p.evaluate(() => {
    const s = document.querySelector('.mf-svg');
    return (s && window.MDFlow && window.MDFlow.inlineVars) ? window.MDFlow.inlineVars(s.outerHTML) : '';
  });
  ok('导出 SVG 无残留 var(--mf-)', inlineSvg.length > 1000 && !/var\(--mf-/.test(inlineSvg),
    (inlineSvg.match(/var\(--mf-[^)]*\)/g) || []).slice(0, 6));
  ok('导出 SVG 含当前文档风格真实色', /#e0417f/i.test(inlineSvg), inlineSvg.slice(0, 160));

  /* 明暗主题：派生色按主题重算 */
  const vLight = await vars();
  await clickSeg('#setTheme', 'data-theme', 'dark');
  await p.waitForTimeout(700);
  const vDark = await vars();
  ok('深色主题下 --mf-a1s 重算为深色底', vDark.mf1s !== vLight.mf1s, [vLight.mf1s, vDark.mf1s]);
  ok('深色主题下 --syn-kw 重算为亮色', vDark.synKw !== vLight.synKw, [vLight.synKw, vDark.synKw]);
  ok('深色主题下 --mf-a1 内联值已重算', vDark.inlineMf1 !== vLight.inlineMf1, [vLight.inlineMf1, vDark.inlineMf1]);
  await clickSeg('#setTheme', 'data-theme', 'light');
  await p.waitForTimeout(600);

  /* 流程图皮肤是显式覆盖，不被内联盖掉；切回 classic 恢复统一 */
  await clickSeg('#setFlowStyle', 'data-fs', 'business');
  await p.waitForTimeout(500);
  const vBiz = await vars();
  ok('显式 business 皮肤清掉 --mf-a1 内联', vBiz.inlineMf1 === '', vBiz.inlineMf1);
  ok('显式 business 皮肤取 CSS 值 #1d4ed8', vBiz.mf1 === '#1d4ed8', vBiz.mf1);
  await clickSeg('#setFlowStyle', 'data-fs', 'classic');
  await p.waitForTimeout(500);
  const vCls = await vars();
  ok('切回 classic 恢复文档风格统一色', vCls.inlineMf1 !== '' && vCls.mf1 === vCls.accent, [vCls.inlineMf1, vCls.mf1, vCls.accent]);

  /* ==================== C. 导出固化 ==================== */
  console.log('\n=== C. 导出 HTML 固化内联变量 ===');
  await clickSeg('#setTT', 'data-tt', 'tech');
  await p.waitForTimeout(600);
  await p.evaluate(() => { const b = document.querySelector('#expMenu button[data-fmt="html"]'); if (b) b.click(); });
  await p.waitForTimeout(1000);
  const exp = await p.evaluate(async () => {
    const x = window.__dl.filter(v => /html/.test(v.type)).pop();
    return x ? await x.p : '';
  });
  ok('导出 HTML 生成', exp.length > 10000, exp.length);
  ok('导出含 data-doc-style="tech"', /data-doc-style="tech"/.test(exp));
  ok('导出 <html style> 固化 --tt-accent', /style="[^"]*--tt-accent:/.test(exp));
  ok('导出固化 --mf-a1 / --mf-a1s / --mf-a1b', /--mf-a1:/.test(exp) && /--mf-a1s:/.test(exp) && /--mf-a1b:/.test(exp));
  ok('导出固化 --syn-kw', /--syn-kw:/.test(exp));
  /* 导出 HTML 里可能先出现图表 svg，取最长的一段（流程图）才测得到 inlineVars 结果 */
  const svgPart = (() => {
    const all = exp.match(/<svg[\s\S]*?<\/svg>/g) || [];
    return all.sort((a, b) => b.length - a.length)[0] || '';
  })();
  /* CR-2026-11-15-04：导出 HTML 升级为「可交互页」，SVG 必须保留 CSS 变量，
     换主题 / 文档风格时流程图与代码高亮才能即时跟着变色。
     Word / PDF 静态分支仍调 inlineVars() 固化（见 test-export-runtime.cjs E 段）。 */
  ok('导出 HTML（交互页）保留 var(--mf-) 供换色', svgPart.length > 1000 && /var\(--mf-/.test(svgPart),
    (svgPart.match(/var\(--mf-[^)]*\)/g) || []).slice(0, 6));
  ok('导出 HTML 带交互运行时 / 预置库 / 风格预设',
    /data-mdx-export/.test(exp) && /window\.MDExport/.test(exp) &&
    /id="mdx-store"/.test(exp) && /id="mdx-presets"/.test(exp));
  ok('导出 HTML 保留 .mf-modes 供单图切结构', /mf-modes/.test(exp));
  ok('导出 HTML 隐藏编辑动作按钮', /\.mf-tools>button[^}]*display:none!important/.test(exp));

  /* ==================== D. 截图 ==================== */
  console.log('\n=== D. 截图对比 ===');
  const styleShots = [];
  for (const s of ['mono', 'tech', 'gov', 'cute']) {
    await clickSeg('#setTT', 'data-tt', s);
    await p.waitForTimeout(650);
    const fp = path.join(SHOTS, 'doc-style-' + s + '.png');
    const box = await p.locator('#content').boundingBox();
    const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1200), height: Math.min(box.height, 880) };
    await p.screenshot({ path: fp, clip });
    styleShots.push(fp);
  }
  await clickSeg('#setTT', 'data-tt', 'tech');
  await p.waitForTimeout(600);
  const aP = path.join(SHOTS, 'flow-mode-A.png'), bP = path.join(SHOTS, 'flow-mode-B.png');
  await p.locator('.mf-wrap').nth(0).screenshot({ path: aP });
  await p.locator('.mf-wrap').nth(1).screenshot({ path: bP });
  const py = [
    'from PIL import Image, ImageDraw',
    'S = ' + JSON.stringify(styleShots),
    'ims = [Image.open(p).convert("RGB") for p in S]',
    'w = max(i.width for i in ims); h = max(i.height for i in ims)',
    'o = Image.new("RGB", (w * 2 + 18, h * 2 + 76), (245, 246, 248)); d = ImageDraw.Draw(o)',
    'labels = ["MONO", "TECH", "GOV", "CUTE"]',
    'for k, im in enumerate(ims):',
    '    x = (k % 2) * (w + 18); y = (k // 2) * (h + 38) + 38',
    '    o.paste(im, (x, y)); d.text((x + 8, y - 20), labels[k] + "  |  unified document style", fill=(70, 70, 70))',
    'o.save(r"' + path.join(SHOTS, 'doc-style-compare.png') + '")',
    'a = Image.open(r"' + aP + '").convert("RGB"); b = Image.open(r"' + bP + '").convert("RGB")',
    'W = max(a.width, b.width); H = a.height + b.height + 64',
    'o2 = Image.new("RGB", (W, H), (245, 246, 248)); d2 = ImageDraw.Draw(o2)',
    'o2.paste(a, (0, 30)); o2.paste(b, (0, a.height + 64))',
    'd2.text((8, 9), "DIAGRAM A  ->  ORG CHART (per-diagram override)", fill=(70, 70, 70))',
    'd2.text((8, a.height + 43), "DIAGRAM B  ->  TIMELINE (per-diagram override)", fill=(70, 70, 70))',
    'o2.save(r"' + path.join(SHOTS, 'flow-mode-per-diagram.png') + '")',
    'print("shots ok", o.size, o2.size)'
  ].join('\n');
  const r = spawnSync('python', ['-c', py], { encoding: 'utf8' });
  ok('生成风格 / 单图结构对比图', /shots ok/.test(r.stdout || ''), (r.stderr || '').slice(0, 240));

  /* ==================== E. 零 JS 异常 ==================== */
  console.log('\n=== E. 零 JS 异常 ===');
  ok('全流程零 JS 异常', errs.length === 0, errs.slice(0, 5));

  await b.close();
  console.log('\n' + '='.repeat(46) + '\n  ' + pass + ' PASS / ' + fail + ' FAIL\n' + '='.repeat(46));
  process.exit(fail ? 1 : 0);
})();
