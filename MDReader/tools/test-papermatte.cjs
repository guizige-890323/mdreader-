const { chromium } = require('playwright-core');
const D = 'D:/WorkBuddy/2026-11-08-21-28-36/MDReader/';
const F = D + 'dist/MDReader.html';
const MD = D + 'dist/示例文档.md';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  /* _autoload.js 只在「右键用 MDReader 打开文件」时由 bat 临时生成，便携版单文件里
     本来就不存在，它的 404 是预期行为，不计入 JS 错误。 */
  const IGNORE = /_autoload\.js|ERR_FILE_NOT_FOUND.*_autoload/;
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.test(t)) return;
    if (/Failed to load resource/.test(t) && m.location() && /_autoload/.test(m.location().url || '')) return;
    errs.push('console: ' + t);
  });
  p.on('requestfailed', r => {
    if (/_autoload\.js$/.test(r.url())) return;
    errs.push('requestfailed: ' + r.url());
  });
  await p.goto('file:///' + F);
  await p.waitForTimeout(1500);

  const st = () => p.evaluate(() => {
    const rt = document.documentElement, q = s => document.querySelector(s);
    const g = (s, prop) => { const e = q(s); return e ? getComputedStyle(e).getPropertyValue(prop).trim() : null; };
    const box = s => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    return {
      pm: rt.getAttribute('data-pm'),
      theme: rt.getAttribute('data-theme'),
      layout: rt.getAttribute('data-layout'),
      contentFilter: g('#content', 'filter'),
      paperBg: g('.paper', 'background-color'),
      appBg: g('#app', 'background-color'),
      noiseOpacity: getComputedStyle(rt, '::after').opacity,
      noiseBlend: getComputedStyle(rt, '::after').mixBlendMode,
      h1: g('#content h1', 'font-size'),
      h2: g('#content h2', 'font-size'),
      h3: g('#content h3', 'font-size'),
      h6: g('#content h6', 'font-size'),
      p: g('#content p', 'font-size'),
      popHidden: q('#pmPop') ? q('#pmPop').hasAttribute('hidden') : 'no #pmPop',
      popBox: box('#pmPop'),
      btnChecked: q('#btnPaperMatte') ? q('#btnPaperMatte').getAttribute('aria-checked') : 'no btn',
      setMaskPos: g('#setMask', 'position'),
      vars: {
        sepia: rt.style.getPropertyValue('--pm-sepia'),
        con: rt.style.getPropertyValue('--pm-con'),
        noise: rt.style.getPropertyValue('--pm-noise'),
      },
    };
  });

  console.log('\n=== A 初始状态（柔光默认关） ===');
  const a = await st();
  ok('data-pm 不存在（默认关）', a.pm === null, a.pm);
  ok('#content 无滤镜', a.contentFilter === 'none', a.contentFilter);
  ok('开关 aria-checked=false', a.btnChecked === 'false', a.btnChecked);
  ok('参数面板默认隐藏', a.popHidden === true, a.popHidden);
  ok('变量已初始化 sepia=12%', a.vars.sepia === '12%', a.vars.sepia);

  // 载入示例文档看层级
  await p.evaluate(() => {
    const now = document.querySelector('#pmPop');
    if (now) now.setAttribute('hidden', '');
  });
  // 用内置示例：点欢迎页的示例按钮或直接注入
  const loaded = await p.evaluate(async () => {
    // 找内置示例入口
    const btns = [...document.querySelectorAll('button, a')].map(b => b.textContent.trim());
    return btns.filter(t => /示例|sample|指南|导览/i.test(t)).slice(0, 5);
  });
  console.log('  示例入口:', JSON.stringify(loaded));
  /* 真正载入示例文档，否则 G 段字阶层级无从测量 */
  const demoHit = await p.evaluate(() => {
    const b = document.getElementById('wDemo');
    if (!b) return false;
    b.click();
    return true;
  });
  if (demoHit) {
    await p.waitForTimeout(1400);
    const loadedOk = await p.evaluate(() => {
      const c = document.getElementById('content');
      return { h1: !!c.querySelector('h1'), n: c.querySelectorAll('h1,h2,h3,h4,h5,h6').length };
    });
    console.log('  载入示例后标题数:', JSON.stringify(loadedOk));
  }

  console.log('\n=== B 开启柔光 ===');
  await p.click('#btnPaperMatte .sw-track');
  await p.waitForTimeout(600);
  const on = await st();
  ok('data-pm=on', on.pm === 'on', on.pm);
  ok('#content 吃滤镜 sepia(0.12)', /sepia\(0\.12\)/.test(on.contentFilter), on.contentFilter);
  ok('#content 吃 contrast(0.89)', /contrast\(0\.89\)/.test(on.contentFilter), on.contentFilter);
  ok('颗粒层 opacity=0.028', on.noiseOpacity === '0.028', on.noiseOpacity);
  ok('浅色主题颗粒 multiply', on.noiseBlend === 'multiply', on.noiseBlend);
  ok('纸面色被覆写为 #FDFBF4', on.paperBg === 'rgb(253, 251, 244)', on.paperBg);
  ok('开关 aria-checked=true', on.btnChecked === 'true', on.btnChecked);

  console.log('\n=== C 关键：fixed 弹层不能被 filter 破坏 ===');
  await p.evaluate(() => { document.getElementById('setMask').removeAttribute('hidden'); });
  await p.waitForTimeout(400);
  const maskBox = await p.evaluate(() => {
    const r = document.getElementById('setMask').getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
  });
  ok('设置遮罩仍铺满视口（未被 filter 困住）',
     Math.abs(maskBox.w - maskBox.vw) <= 2 && Math.abs(maskBox.h - maskBox.vh) <= 2, maskBox);
  ok('遮罩左上角在 0,0', maskBox.l === 0 && maskBox.t === 0, maskBox);
  await p.evaluate(() => { document.getElementById('setMask').setAttribute('hidden', ''); });
  await p.waitForTimeout(300);

  console.log('\n=== D 参数面板 ===');
  /* 说明：工具栏可能处于 icon / mini 模式，此时 .tb-label 被 CSS 隐藏（正常响应式行为）。
     点图标（非 .sw-track）等同于「点文字」，是打开参数面板的入口。 */
  await p.click('#btnPaperMatte .sw-ico');
  await p.waitForTimeout(500);
  const pop = await st();
  ok('点图标打开面板', pop.popHidden === false, pop.popHidden);
  ok('面板在视口内', pop.popBox && pop.popBox.l >= 0 && pop.popBox.r <= 1400 && pop.popBox.t >= 0, pop.popBox);
  await p.click('#pmClose'); await p.waitForTimeout(400);
  ok('关闭按钮生效', (await st()).popHidden === true);

  console.log('\n=== E 参数调节 ===');
  await p.click('#btnPaperMatte .sw-ico'); await p.waitForTimeout(400);
  await p.evaluate(() => {
    const r = document.getElementById('pmCon');
    r.value = 85; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(500);
  const tuned = await st();
  ok('拖 contrast 生效 → 0.85', /contrast\(0\.85\)/.test(tuned.contentFilter), tuned.contentFilter);
  ok('变量同步 --pm-con=85%', tuned.vars.con === '85%', tuned.vars.con);
  // 越界值应被 clamp
  await p.evaluate(() => {
    const r = document.getElementById('pmCon');
    r.value = 200; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(400);
  ok('越界值被钳到 105%', (await st()).vars.con === '105%', (await st()).vars.con);

  // 恢复推荐值
  await p.click('#pmReset'); await p.waitForTimeout(500);
  const reset = await st();
  ok('恢复推荐值 contrast 回到 89%', reset.vars.con === '89%', reset.vars.con);

  console.log('\n=== F 柔光 × 主题 叠加（正交性） ===');
  const themes = [['dark', 'rgb(26, 26, 24)'], ['sepia', 'rgb(248, 241, 223)'], ['light', 'rgb(253, 251, 244)']];
  await p.click('#pmClose'); await p.waitForTimeout(300);
  for (const [t, expectBg] of themes) {
    await p.evaluate((t) => {
      const btn = document.querySelector(`#skinSwitch button[data-theme="${t}"]`) ||
                  document.querySelector(`#setTheme button[data-theme="${t}"]`);
      if (btn) btn.click();
    }, t);
    await p.waitForTimeout(600);
    const s = await st();
    ok(`主题 ${t} 仍保持柔光开启`, s.pm === 'on', s.pm);
    ok(`主题 ${t} 纸面色跟随主题 ${expectBg}`, s.paperBg === expectBg, s.paperBg);
    ok(`主题 ${t} 正文仍有滤镜`, /sepia/.test(s.contentFilter), s.contentFilter);
  }
  const darkSt = await st();
  // 回到浅色
  await p.evaluate(() => {
    const btn = document.querySelector('#skinSwitch button[data-theme="light"]');
    if (btn) btn.click();
  });
  await p.waitForTimeout(500);

  console.log('\n=== G 标题字阶层级（需求 2） ===');
  /* 卡片皮肤会把每个 h2 提升成「卡头标题」，卡体里只剩 h3 及以下。
     所以要分别量卡头与卡体，并交叉比较 —— 卡头 h2 必须大于卡体 h3，
     否则读者看到的就是「节标题比子标题还小」。 */
  const hs = await p.evaluate(() => {
    /* 示例文档未必含 h4~h6。临时注入一整套 h1~h6 到真实卡体里量完即删，
       量的是真实 CSS 计算结果，不是硬编码期望值。 */
    const body = document.querySelector('#content .card-body');
    if (body) {
      ['h1', 'h4', 'h5', 'h6'].forEach((t) => {
        if (!body.querySelector(t)) {
          const e = document.createElement(t);
          e.className = '__probe';
          e.textContent = 'probe ' + t;
          body.appendChild(e);
        }
      });
    }
    const px = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
    const r = {
      layout: document.documentElement.getAttribute('data-layout'),
      head: { h1: px('#content .card-head h1'), h2: px('#content .card-head h2'), h3: px('#content .card-head h3') },
      body: { h1: px('#content .card-body h1'), h2: px('#content .card-body h2'),
              h3: px('#content .card-body h3'), h4: px('#content .card-body h4'),
              h5: px('#content .card-body h5'), h6: px('#content .card-body h6'),
              p: px('#content .card-body p') },
    };
    document.querySelectorAll('.__probe').forEach((e) => e.remove());
    return r;
  });
  const H = hs.head, B = hs.body, n = (v) => (v === null ? 'null' : v.toFixed(2));
  console.log('  layout =', hs.layout);
  console.log('  卡头 h1/h2/h3 =', n(H.h1), n(H.h2), n(H.h3));
  console.log('  卡体 h1~h6/正文 =', n(B.h1), n(B.h2), n(B.h3), n(B.h4), n(B.h5), n(B.h6), n(B.p));
  if (B.h3 && B.p) {
    ok('卡体 h3 > h4', B.h3 > B.h4, [B.h3, B.h4]);
    ok('卡体 h4 > h5', B.h4 > B.h5, [B.h4, B.h5]);
    ok('卡体 h5 >= h6（允许相等但不得倒挂）', B.h5 >= B.h6, [B.h5, B.h6]);
    ok('卡体 h6 > 正文（旧版 .98em 比正文小）', B.h6 > B.p, [B.h6, B.p]);
    ok('卡体 h3 ≥ 正文×1.1（不能和正文糊在一起）', B.h3 >= B.p * 1.1, [B.h3, B.p, B.h3 / B.p]);
  } else {
    console.log('  （无卡体标题，跳过卡体断言）');
  }
  if (H.h2 && B.h3) {
    ok('★ 卡头 h2 > 卡体 h3（修复层级倒挂）', H.h2 > B.h3, [H.h2, B.h3, (H.h2 / B.h3).toFixed(2)]);
    ok('★ 卡头 h2 相对卡体 h3 落差 ≥1.1 倍', H.h2 >= B.h3 * 1.1, [(H.h2 / B.h3).toFixed(2)]);
    ok('卡头 h2 ≥ 正文×1.25（不能是元信息级小字）', H.h2 >= B.p * 1.25, [H.h2, B.p]);
  } else {
    console.log('  （无卡头 h2，跳过交叉断言）');
  }

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 3));

  console.log(`\n${'='.repeat(46)}`);
  console.log(`结果：${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 项`);
  console.log('='.repeat(46));
  await b.close();
  process.exit(fail ? 1 : 0);
})();