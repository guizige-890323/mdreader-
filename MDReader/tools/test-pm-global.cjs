/* ==================================================================
   CR-2026-11-15-02  云晰柔光「全应用适配」专项测试
   ------------------------------------------------------------------
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-pm-global.cjs

   断言口径：
   1) 开启柔光后，顶栏/侧栏/标签栏/活动页签/状态栏/设置面板/柔光弹层/
      更多菜单/搜索框/画布/边框 的 computed 底色精确等于三套暖色目标值；
   2) 三主题(light/sepia/dark) × 三排版(card/paper/plain) 交叉验证；
   3) 隔离感量化：开启后 chrome 中「冷色(R-B<=0)」元素归零；
   4) position:fixed 浮层不被 filter 破坏；颗粒层仍全屏固定；
   5) 正交性：--accent / --tt-accent / --syn-kw 不随柔光改变；
   6) 关闭柔光完全回退到原冷色；
   7) 导出 HTML 同构页（无 JS）自动暖化，body / .paper 与屏幕一致。
   ================================================================== */
const { chromium } = require('playwright-core');

const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); }
};

/* 三套主题下 chrome 的精确目标色（由 template.html --pmu-* 定义） */
const EXP = {
  light: {
    panel: 'rgb(251, 248, 238)', panel2: 'rgb(246, 241, 227)',
    border: 'rgb(227, 217, 196)', setLine: 'rgb(229, 220, 200)',
    bg: 'rgb(241, 237, 224)', setCanvas: 'rgb(239, 234, 221)',
    setFill: 'rgb(241, 235, 221)', paper: 'rgb(253, 251, 244)'
  },
  sepia: {
    panel: 'rgb(251, 245, 231)', panel2: 'rgb(245, 237, 218)',
    border: 'rgb(219, 205, 175)', setLine: 'rgb(223, 210, 180)',
    bg: 'rgb(237, 228, 207)', setCanvas: 'rgb(234, 224, 201)',
    setFill: 'rgb(239, 229, 206)', paper: 'rgb(248, 241, 223)'
  },
  dark: {
    panel: 'rgb(29, 29, 27)', panel2: 'rgb(35, 35, 33)',
    border: 'rgb(52, 51, 46)', setLine: 'rgb(41, 40, 36)',
    bg: 'rgb(16, 16, 16)', setCanvas: 'rgb(14, 14, 13)',
    setFill: 'rgb(30, 30, 28)', paper: 'rgb(26, 26, 24)'
  }
};
const rgb = s => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
const coldCount = arr => arr.filter(x => { const c = rgb(x); return c && c[0] - c[2] <= 0; }).length;
const chromeOf = s => [s.toolbarBg, s.sidebarBg, s.statusBg, s.tabbarBg, s.bodyBg,
  s.pTabActive, s.pMore, s.pPop, s.pSetPanel, s.pSetCard, s.pSetSeg,
  s.pSideInput, s.toolbarBorder, s.setCardBorder].filter(Boolean);

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  const IGNORE = /_autoload\.js|ERR_FILE_NOT_FOUND.*_autoload/;
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.test(t) || /Failed to load resource/.test(t)) return;
    errs.push('console: ' + t);
  });
  await p.goto(F);
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await p.waitForTimeout(1700);

  /* 注入探针：覆盖真实 DOM 里不一定出现的 chrome 组件（活动页签 / 更多菜单 /
     柔光弹层 / 设置面板 / 搜索框 / 纸面）。量的是真实 CSS 计算结果。 */
  await p.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'pmProbe';
    d.style.cssText = 'position:fixed;left:-9999px;top:0;width:240px;visibility:hidden';
    d.innerHTML =
      '<div class="toolbar"></div><div class="sidebar"></div><div class="statusbar"></div>' +
      '<div class="tabbar"></div><div class="tab active"></div>' +
      '<div class="tb-more-menu"></div><div class="pm-pop"></div>' +
      '<div class="set-panel"><div class="set-card"><div class="set-seg"></div></div></div>' +
      '<div class="side-search"><input></div><div class="paper"></div>';
    document.body.appendChild(d);
  });

  const SAMPLE = () => p.evaluate(() => {
    const rt = document.documentElement;
    const q = s => document.querySelector(s);
    const c = s => { const e = q(s); return e ? getComputedStyle(e) : null; };
    const bg = s => { const x = c(s); return x ? x.backgroundColor : null; };
    const v = k => getComputedStyle(rt).getPropertyValue(k).trim();
    const after = getComputedStyle(rt, '::after');
    const mask = q('#setMask');
    const mr = mask ? mask.getBoundingClientRect() : null;
    return {
      pm: rt.getAttribute('data-pm'), theme: rt.getAttribute('data-theme'),
      layout: rt.getAttribute('data-layout'),
      /* 真实元素 */
      bodyBg: bg('body'), appBg: bg('#app'),
      toolbarBg: bg('#app .toolbar'), sidebarBg: bg('#app .sidebar'),
      statusBg: bg('#app .statusbar'), tabbarBg: bg('#app .tabbar'),
      paperBg: bg('#content .paper') || bg('#pmProbe .paper'),
      contentFilter: (() => { const x = c('#content'); return x ? x.filter : null; })(),
      /* 探针 */
      pToolbar: bg('#pmProbe .toolbar'), pSidebar: bg('#pmProbe .sidebar'),
      pStatus: bg('#pmProbe .statusbar'), pTabbar: bg('#pmProbe .tabbar'),
      pTabActive: bg('#pmProbe .tab.active'), pMore: bg('#pmProbe .tb-more-menu'),
      pPop: bg('#pmProbe .pm-pop'), pSetPanel: bg('#pmProbe .set-panel'),
      pSetCard: bg('#pmProbe .set-card'), pSetSeg: bg('#pmProbe .set-seg'),
      pSideInput: bg('#pmProbe .side-search input'), pPaper: bg('#pmProbe .paper'),
      /* 边框 */
      toolbarBorder: (() => { const x = c('#app .toolbar'); return x ? x.borderBottomColor : null; })(),
      setCardBorder: (() => { const x = c('#pmProbe .set-card'); return x ? x.borderTopColor : null; })(),
      /* 变量与正交性 */
      vPanel: v('--panel'), vPanel2: v('--panel-2'), vBorder: v('--border'),
      vAccent: v('--accent'), vTtAccent: v('--tt-accent'), vSynKw: v('--syn-kw'),
      vPmPaper: v('--pm-paper'),
      /* 颗粒层 */
      noisePos: after.position, noisePE: after.pointerEvents, noiseZ: after.zIndex,
      noiseOpacity: after.opacity, noiseBlend: after.mixBlendMode,
      /* fixed 浮层 */
      maskRect: mr ? { l: Math.round(mr.left), t: Math.round(mr.top), w: Math.round(mr.width), h: Math.round(mr.height) } : null,
      vw: innerWidth, vh: innerHeight
    };
  });

  const setPM = on => p.evaluate(on => {
    const rt = document.documentElement;
    if (on) rt.setAttribute('data-pm', 'on'); else rt.removeAttribute('data-pm');
  }, on);

  console.log('\n=== A 基线：柔光关闭（冷色 chrome） ===');
  const off = await SAMPLE();
  ok('初始 data-pm 不存在', off.pm === null, off.pm);
  ok('正文无滤镜', off.contentFilter === 'none', off.contentFilter);
  const coldOff = coldCount(chromeOf(off));
  console.log('  冷色(R-B<=0) chrome 元素数 =', coldOff, '/', chromeOf(off).length);
  ok('基线存在冷白/冷灰 chrome（隔离感来源）', coldOff >= 3, coldOff);

  console.log('\n=== B 开启柔光：全应用暖色板精确匹配（light / card） ===');
  await setPM(true);
  await p.waitForTimeout(250);
  const on = await SAMPLE();
  const E = EXP.light;
  ok('data-pm=on', on.pm === 'on', on.pm);
  ok('顶栏 -> 暖象牙', on.toolbarBg === E.panel, on.toolbarBg);
  ok('侧栏 -> 暖象牙', on.sidebarBg === E.panel, on.sidebarBg);
  ok('状态栏 -> 暖象牙', on.statusBg === E.panel, on.statusBg);
  ok('标签栏 -> 暖米', on.tabbarBg === E.panel2, on.tabbarBg);
  ok('应用画布 -> 暖米', on.appBg === E.bg, on.appBg);
  ok('body 背景 -> 暖米', on.bodyBg === E.bg, on.bodyBg);
  ok('纸面仍为精确纸色', on.paperBg === E.paper, on.paperBg);
  ok('探针纸面 -> 精确纸色', on.pPaper === E.paper, on.pPaper);
  ok('活动页签 -> 暖象牙', on.pTabActive === E.panel, on.pTabActive);
  ok('更多菜单 -> 暖象牙', on.pMore === E.panel, on.pMore);
  ok('柔光弹层 -> 暖象牙', on.pPop === E.panel, on.pPop);
  ok('设置面板画布 -> 暖', on.pSetPanel === E.setCanvas, on.pSetPanel);
  ok('设置分组卡片 -> 暖象牙', on.pSetCard === E.panel, on.pSetCard);
  ok('设置分段轨道 -> 暖', on.pSetSeg === E.setFill, on.pSetSeg);
  ok('侧栏搜索框 -> 暖米', on.pSideInput === E.panel2, on.pSideInput);
  ok('顶栏下边框 -> 暖褐', on.toolbarBorder === E.border, on.toolbarBorder);
  ok('设置卡片边框 -> 暖线', on.setCardBorder === E.setLine, on.setCardBorder);
  ok('探针顶栏/侧栏/状态栏与真实一致',
    on.pToolbar === on.toolbarBg && on.pSidebar === on.sidebarBg && on.pStatus === on.statusBg,
    [on.pToolbar, on.toolbarBg, on.pSidebar, on.pStatus]);
  ok('正文滤镜仍在（sepia/brightness）',
    /sepia\(/.test(on.contentFilter) && /brightness\(/.test(on.contentFilter), on.contentFilter);
  ok('纸面变量 --pm-paper 未被映射污染', on.vPmPaper === '#FDFBF4', on.vPmPaper);

  const coldOn = coldCount(chromeOf(on));
  console.log('  冷色(R-B<=0) chrome 元素数 =', coldOn, '/', chromeOf(on).length);
  ok('★ 开启后 chrome 冷色元素归零（隔离感消失）', coldOn === 0,
    { coldOn, warm: chromeOf(on).map(x => [x, (rgb(x) || [0, 0, 0])[0] - (rgb(x) || [0, 0, 0])[2]]) });

  console.log('\n=== C 颗粒层与 fixed 浮层（历史 filter 陷阱回归） ===');
  ok('颗粒层 position:fixed', on.noisePos === 'fixed', on.noisePos);
  ok('颗粒层 pointer-events:none', on.noisePE === 'none', on.noisePE);
  ok('颗粒层 z-index=9000', on.noiseZ === '9000', on.noiseZ);
  ok('颗粒层 opacity=0.028', on.noiseOpacity === '0.028', on.noiseOpacity);
  ok('浅色颗粒 multiply', on.noiseBlend === 'multiply', on.noiseBlend);
  await p.evaluate(() => { const m = document.getElementById('setMask'); if (m) m.removeAttribute('hidden'); });
  await p.waitForTimeout(200);
  const mask = await SAMPLE();
  ok('设置遮罩仍铺满视口', mask.maskRect &&
    Math.abs(mask.maskRect.w - mask.vw) <= 2 && Math.abs(mask.maskRect.h - mask.vh) <= 2, mask.maskRect);
  ok('设置遮罩左上角 0,0', mask.maskRect && mask.maskRect.l === 0 && mask.maskRect.t === 0, mask.maskRect);
  await p.evaluate(() => { const m = document.getElementById('setMask'); if (m) m.setAttribute('hidden', ''); });

  console.log('\n=== D 正交性：柔光不碰三条轴的色 ===');
  ok('--accent 未变', on.vAccent === off.vAccent, [on.vAccent, off.vAccent]);
  ok('--tt-accent（统一文档风格）未变', on.vTtAccent === off.vTtAccent, [on.vTtAccent, off.vTtAccent]);
  ok('--syn-kw（代码高亮）未变', on.vSynKw === off.vSynKw, [on.vSynKw, off.vSynKw]);

  console.log('\n=== E 三主题 × 三排版交叉（9 组） ===');
  for (const t of ['light', 'sepia', 'dark']) {
    for (const L of ['card', 'paper', 'plain']) {
      const tag = t + '/' + L;
      await p.evaluate(([t, L]) => {
        const rt = document.documentElement;
        rt.setAttribute('data-theme', t); rt.setAttribute('data-layout', L);
        rt.removeAttribute('data-pm');
      }, [t, L]);
      await p.waitForTimeout(90);
      const base = await SAMPLE();
      await setPM(true);
      await p.waitForTimeout(90);
      const s = await SAMPLE();
      const X = EXP[t];
      ok(tag + ' 顶栏=' + X.panel, s.toolbarBg === X.panel, s.toolbarBg);
      ok(tag + ' 标签栏=' + X.panel2, s.tabbarBg === X.panel2, s.tabbarBg);
      ok(tag + ' 边框=' + X.border, s.toolbarBorder === X.border, s.toolbarBorder);
      ok(tag + ' body=' + X.bg, s.bodyBg === X.bg, s.bodyBg);
      ok(tag + ' 设置画布=' + X.setCanvas, s.pSetPanel === X.setCanvas, s.pSetPanel);
      ok(tag + ' 纸面=' + X.paper, s.pPaper === X.paper, s.pPaper);
      ok(tag + ' --accent 正交', s.vAccent === base.vAccent, [s.vAccent, base.vAccent]);
      ok(tag + ' 正文仍有滤镜', /sepia\(/.test(s.contentFilter), s.contentFilter);
    }
  }

  console.log('\n=== F 关闭柔光完全回退 ===');
  await p.evaluate(() => {
    const rt = document.documentElement;
    rt.setAttribute('data-theme', 'light'); rt.setAttribute('data-layout', 'card');
    rt.removeAttribute('data-pm');
  });
  await p.waitForTimeout(180);
  const back = await SAMPLE();
  ok('data-pm 已移除', back.pm === null, back.pm);
  ok('顶栏回退到基线冷色', back.toolbarBg === off.toolbarBg, [back.toolbarBg, off.toolbarBg]);
  ok('标签栏回退到基线冷色', back.tabbarBg === off.tabbarBg, [back.tabbarBg, off.tabbarBg]);
  ok('边框回退到基线冷色', back.toolbarBorder === off.toolbarBorder, [back.toolbarBorder, off.toolbarBorder]);
  ok('body 回退到基线冷色', back.bodyBg === off.bodyBg, [back.bodyBg, off.bodyBg]);
  ok('正文滤镜消失', back.contentFilter === 'none', back.contentFilter);
  ok('冷色元素数回到基线', coldCount(chromeOf(back)) === coldOff,
    [coldCount(chromeOf(back)), coldOff]);

  console.log('\n=== G 导出 HTML 同构页（无 JS，样式自动生效） ===');
  const css = await p.evaluate(() => document.querySelector('style').textContent);
  const exp = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const html = '<!DOCTYPE html><html lang="zh-CN" data-theme="light" data-layout="card"' +
    ' data-pm="on" style="--pm-sepia:12%;--pm-sat:78%;--pm-con:89%;--pm-bri:97%;--pm-noise:0.028">' +
    '<head><meta charset="UTF-8"><style>' + css +
    '\nbody{overflow:auto;height:auto}#app{display:block}.toolbar,.sidebar,.statusbar{display:none!important}' +
    '.reader-inner{max-width:980px;margin:0 auto;padding:24px 36px 60px}</style></head><body>' +
    '<div class="reader-inner"><article id="content"><div class="paper">export</div></article></div></body></html>';
  await exp.setContent(html, { waitUntil: 'load' });
  await exp.waitForTimeout(200);
  const ex = await exp.evaluate(() => {
    const cs = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    return {
      pm: document.documentElement.getAttribute('data-pm'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      paperBg: cs('.paper') ? cs('.paper').backgroundColor : null,
      filter: cs('#content') ? cs('#content').filter : null,
      panelVar: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()
    };
  });
  ok('导出页 data-pm=on', ex.pm === 'on', ex.pm);
  ok('导出页 body 背景为暖米', ex.bodyBg === EXP.light.bg, ex.bodyBg);
  ok('导出页纸面为精确纸色', ex.paperBg === EXP.light.paper, ex.paperBg);
  ok('导出页正文仍有柔光滤镜', /sepia\(/.test(ex.filter), ex.filter);
  ok('导出页 --panel 已解析为暖象牙', ex.panelVar === '#FBF8EE', ex.panelVar);
  await exp.close();

  console.log('\n=== H JS 错误 ===');
  ok('无未预期 JS 错误', errs.length === 0, errs.slice(0, 5));

  console.log('\n==========================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('==========================================');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
