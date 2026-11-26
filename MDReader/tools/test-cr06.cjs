/* ==================================================================
   CR-2026-11-15-06 · 菜单液态胶囊 + 功能卡追光玻璃 专项测试
   ------------------------------------------------------------------
   提示词契约（两张参考图逐字口径）：
   01 LIQUID PILL  「菜单当前项用半透明玻璃胶囊底，切换时胶囊滑向新位置，
                    移动中沿移动方向拉长，到位弹性回弹；胶囊边缘带一圈细高光。」
   02 LIGHT FOLLOW 「卡片为磨砂玻璃材质；悬停时在卡片内部跟随光标显示一团柔和
                    径向光斑，靠近光标的边框局部提亮；卡片随光标位置轻微 3D
                    倾斜，不超过 4 度；移出后平滑复原。」

   分段：
     A 静态产物契约（CSS/JS 槽位）
     B 胶囊几何：7 类宿主全部精确落位 + 玻璃材质 + 细高光
     C 拉长 → 滑动 → 弹性回弹（横向 / 纵向）
     D 功能卡追光：光斑 / 边框环 / ≤4° 倾斜 / 移出复原 / marquee 克隆卡
     E 无障碍与打印降级（prefers-reduced-motion / print）
     F 可读性：3 主题 × 4 文档风格 对比度 ≥ 4.5:1
     G 三条硬约束未被破坏（圆角 / 底色 / 顶栏分档 / 专注让位）
     H 导出页同款胶囊 + 预置携带 --lp-ink
     I 英文界面按翻译后宽度对齐 + 全程零 JS 错误

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-cr06.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');
const SHOTS = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); }
};
const has = s => HTML.indexOf(s) >= 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.6 : tol);

/* ---- WCAG 对比度（与 app.js 的 srgbLum / contrast 同口径） ---- */
const parseRgb = s => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(String(s || ''));
  return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
};
const srgbLum = c => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a, b) => {
  const l1 = srgbLum(a), l2 = srgbLum(b);
  return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2);
};
const over = (fg, a, bg) => [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a)));

/* 浏览器内取样：宿主真实不透明祖先底色 + tint/fill alpha 合成 + 选中项文字色 */
const INK_PROBE = () => {
  const baseOf = el => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n).backgroundColor;
      const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(c || '');
      if (m && (m[4] === undefined || +m[4] > 0.98)) return [+m[1], +m[2], +m[3]];
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const grab = (sel, onSel) => {
    const h = document.querySelector(sel); if (!h) return null;
    const on = h.querySelector(onSel), pill = h.querySelector(':scope > .lp-pill');
    if (!on || !pill) return null;
    const rt = getComputedStyle(document.documentElement);
    return {
      color: getComputedStyle(on).color,
      base: baseOf(h),
      fill: rt.getPropertyValue('--lp-fill').trim(),
      tint: rt.getPropertyValue('--lp-tint').trim(),
      ready: h.classList.contains('lp-ready'),
      ink: h.style.getPropertyValue('--lp-ink').trim()
    };
  };
  return {
    seg: grab('#setLH', 'button.on'),
    side: grab('.side-tabs', '.side-tab.active'),
    skin: grab('.skin-switch', '.skin-btn.active'),
    ct: grab('.chart-box.show .chart-types', 'button.on'),
    tt: grab('.tw-bar .tt-group', '.tt-btn.on'),
    fm: grab('.mf-tools .mf-modes', 'button.on')
  };
};
const inkRatio = x => {
  if (!x) return null;
  const fg = parseRgb(x.color); if (!fg) return null;
  let eff = x.base;
  const tint = parseRgb(x.tint), fill = parseRgb(x.fill);
  if (tint) eff = over(tint.c, tint.a, eff);
  if (fill) eff = over(fill.c, fill.a, eff);
  return contrast(fg.c, eff);
};

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errs = [];
  const IGNORE = /_autoload\.js|ERR_FILE_NOT_FOUND.*_autoload|Failed to load resource/;
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/_autoload\.js$/.test(u)) return;
    if (IGNORE.test(m.text()) && !u) return;
    errs.push('console: ' + m.text() + ' @' + u);
  });
  await p.goto(F);
  await p.waitForTimeout(1600);

  /* ================= A. 静态产物契约 ================= */
  console.log('\n[A] 静态产物契约');
  ok('dist 含胶囊本体规则', has('.lp-pill{'));
  ok('胶囊绝对定位 + 不挡点击', has('position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;'));
  ok('胶囊玻璃底 = 双层渐变 + 淡彩', has('background:linear-gradient(160deg,var(--lp-fill),var(--lp-fill-2)),var(--lp-tint);'));
  ok('胶囊一圈细高光（内描边顶亮底暗）',
    has('box-shadow:inset 0 0 0 .5px var(--lp-rim),') && has('inset 0 1px 0 var(--lp-rim),') && has('inset 0 -1px 0 var(--lp-rim-2),'));
  ok('胶囊磨砂 backdrop-filter', has('backdrop-filter:blur(6px) saturate(1.25)'));
  ok('位移用带 overshoot 的弹性曲线', has('transition:transform .42s cubic-bezier(.34,1.42,.44,1)'));
  ok('拉伸脉冲用短促曲线', has('.lp-pill.stretch{transition:transform .19s cubic-bezier(.3,.7,.2,1)'));
  ok('胶囊在文字之下（z-index:0 / 内容抬到 1）',
    has('border-radius:8px;opacity:0;z-index:0;') && has('.lp-host > *:not(.lp-pill){position:relative;z-index:1}'));
  ok('transform 由 --lp-x/y + --lp-sx/sy 驱动',
    has('transform:translate3d(var(--lp-x,0px),var(--lp-y,0px),0) scale(var(--lp-sx,1),var(--lp-sy,1));'));
  ok('拉伸原点可切出发侧', has('transform-origin:var(--lp-ox,50%) var(--lp-oy,50%);'));
  ok('7 类宿主全部补 position:relative',
    ['.side-tabs{position:relative}', '.set-seg{position:relative}', '.skin-switch{position:relative}',
     '.chart-box .chart-types{position:relative}', '.mf-tools .mf-modes{position:relative}',
     '.tw-bar .tt-group{position:relative}'].every(has) && has('.lp-host{position:relative}'));
  ok('三主题各有一套 --lp-* / --wc-* 变量',
    (HTML.match(/--lp-fill:/g) || []).length >= 5 && (HTML.match(/--wc-glass:/g) || []).length >= 5);
  ok('柔光开启时胶囊改暖白（不动 --panel/--set-fill）',
    has('html[data-pm="on"]{') && has('--lp-fill:rgba(255,252,242,.68);'));
  ok('胶囊兜底定位不得覆盖专注菜单的 fixed', has('#focusRender.lp-host{position:fixed}'));
  ok('侧栏页签旧下划线退场', has('.side-tab{border-bottom:0!important;border-radius:8px'));
  ok('选中项文字改吃 --lp-ink', (HTML.match(/var\(--lp-ink,/g) || []).length >= 6);
  ok('JS 含 LP_HOSTS 七宿主表', has('var LP_HOSTS = [') && has("{ sel: '.tw-bar .tt-group', on: '.tt-btn.on', axis: 'x' }"));
  ok('JS 用 offset* 累加而非 getBoundingClientRect 定位', has('while (n && n !== host && guard++ < 12) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }'));
  ok('JS 拉伸上限 34%', has('var k = Math.min(0.34, 0.10 + dist / 420);'));
  ok('JS 190ms 后撤拉伸交回弹性曲线', has('}, 190);') && has("pill.style.setProperty('--lp-sx', '1');"));
  ok('JS 择墨：实测底色 + 18 轮二分', has('function lpEffectiveBase(host)') && has('for (var i = 0; i < 18; i++)'));
  ok('JS 择墨阈值 4.5:1', has('if (contrast(at(0), base) >= 4.5) return at(0);'));
  ok('JS 监听 <html> 属性统一失效重算', has("attributeFilter: ['data-theme', 'data-pm', 'data-layout', 'data-doc-style', 'data-table-theme', 'style']"));
  ok('JS 在 i18n 之后启动胶囊与追光', has('lpInit(); lpWatch(); wcInit();'));

  ok('功能卡磨砂玻璃材质', has('background:var(--wc-glass);min-height:108px;position:relative;') &&
    has('backdrop-filter:blur(10px) saturate(1.18)'));
  ok('追光层 1：卡内跟随光标的径向光斑',
    has('background:radial-gradient(190px circle at var(--mx,50%) var(--my,50%),') && has('var(--wc-glow),transparent 68%)'));
  ok('追光层 2：边框局部提亮（双层 mask 相减留 1px 环）',
    has('background:radial-gradient(150px circle at var(--mx,50%) var(--my,50%),') &&
    has('-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);') &&
    has('mask-composite:exclude}'));
  /* ::before 是 z-index:0;opacity:0;…，::after 中间多一段 padding:1px（边框环），
     故按各自完整前缀断言，而不是要求两处字面完全相同。 */
  ok('追光伪元素用 z-index:0（不是 -1，避免被 backdrop 层叠上下文压住）',
    has("pointer-events:none;\n  z-index:0;opacity:0;transition:opacity .3s ease;") &&
    has("pointer-events:none;\n  z-index:0;padding:1px;opacity:0;transition:opacity .3s ease;"));
  ok('3D 倾斜只在有光标时生效', has('.w-card.lit{transform:perspective(760px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}'));
  ok('轨道容器给出透视 + 倾斜余量', has('.w-grid{perspective:900px;padding-top:10px;padding-bottom:12px;margin-top:-8px}'));
  ok('倾斜上限硬夹 ±4°', has('var WC_MAX = 4;') && has('Math.max(-WC_MAX, Math.min(WC_MAX, rx))') && has('Math.max(-WC_MAX, Math.min(WC_MAX, ry))'));
  ok('追光走 #gridFeats 事件委托（兼容 marquee 克隆）',
    has("grid.addEventListener('pointermove'") && has("grid.addEventListener('pointerleave'") &&
    has("grid.addEventListener('focusin'") && has("grid.addEventListener('focusout'"));
  ok('pointermove 用 rAF 节流', has('if (!raf) raf = requestAnimationFrame(flush);'));
  ok('减弱动效降级规则齐备',
    has('.lp-pill{transition:opacity .12s linear!important}') &&
    has('.w-card.lit{transform:none!important}') && has('.w-card.lit .feat-ico{transform:none!important}'));
  ok('打印降级：胶囊与追光隐去 + 选中态恢复实底',
    has('.lp-pill{display:none!important}') && has('.w-card::before,.w-card::after{display:none!important}') &&
    has('.set-seg.lp-ready button.on{background:var(--panel)!important'));

  /* ================= D. 功能卡追光（欢迎屏阶段先测，避免 wDemo 隐藏 welcome） ================= */
  console.log('\n[D] 功能卡追光玻璃 + ≤4° 倾斜 + 移出复原');
  const gridInfo = await p.evaluate(() => {
    const g = document.getElementById('gridFeats');
    const st = g.querySelector('.wf-stage');
    return {
      cards: g.querySelectorAll('.w-card').length, hasStage: !!st,
      perspective: st ? parseFloat(getComputedStyle(st).perspective) : 0,
      wfMode: g.classList.contains('wf-mode'),
      stageH: st ? Math.round(st.getBoundingClientRect().height) : 0,
      cardH: (() => { const c = g.querySelector('.w-card'); return c ? Math.round(c.getBoundingClientRect().height) : 0; })()
    };
  });
  /* CR-18：marquee 换成 Cover Flow，原「克隆卡 >12」改为「原卡不克隆、套 3D 舞台」——
     事件委托追光的收益并未减弱：真实卡在任意翻页位置都要能被点亮（D2/D5 继续验）。
     CR-20：项数 12 → 15。 */
  ok('Cover Flow：15 张原卡不克隆', gridInfo.cards === 15, gridInfo.cards);
  ok('3D 舞台存在且有透视', gridInfo.hasStage === true && gridInfo.wfMode === true && gridInfo.perspective > 0, gridInfo);
  ok('3D 舞台留出倾斜余量（stage 高于卡片）', gridInfo.stageH > gridInfo.cardH + 20, gridInfo);

  /* 先 mouseenter 暂停 marquee，再逐张试 —— 否则卡片在移动，落点会偏 */
  const gb = await (await p.$('#gridFeats')).boundingBox();
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await p.waitForTimeout(500);
  const visible = await p.evaluate(() => {
    const gr = document.getElementById('gridFeats').getBoundingClientRect();
    return [...document.querySelectorAll('#gridFeats .w-card')].map((c, i) => {
      const r = c.getBoundingClientRect();
      return { i, l: r.left, r: r.right, t: r.top, h: r.height, w: r.width,
        vis: r.left >= gr.left && r.right <= gr.right && r.width > 0 };
    }).filter(x => x.vis);
  });
  ok('视口内至少 3 张卡可试', visible.length >= 3, visible.length);

  const cardProbe = () => p.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card.lit');
    if (!c) return { lit: false };
    const cs = getComputedStyle(c);
    const bf = getComputedStyle(c, '::before'), af = getComputedStyle(c, '::after');
    const idx = [...document.querySelectorAll('#gridFeats .w-card')].indexOf(c);
    return {
      lit: true, idx,
      mx: c.style.getPropertyValue('--mx'), my: c.style.getPropertyValue('--my'),
      rx: parseFloat(c.style.getPropertyValue('--rx') || '0'),
      ry: parseFloat(c.style.getPropertyValue('--ry') || '0'),
      transform: cs.transform, bg: cs.backgroundColor, backdrop: cs.backdropFilter,
      radius: cs.borderRadius,
      beforeOp: bf.opacity, beforeBg: bf.backgroundImage,
      afterOp: af.opacity, afterMask: af.maskComposite || af.webkitMaskComposite,
      afterBg: af.backgroundImage, afterPad: af.paddingTop,
      icoTransform: getComputedStyle(c.querySelector('.feat-ico') || c).transform
    };
  });

  /* D1 右上角：ry 正 / rx 正（光标右上 → 卡片向左下倾） */
  const v0 = visible[0];
  await p.mouse.move(v0.l + v0.w * 0.8, v0.t + v0.h * 0.25);
  await p.waitForTimeout(420);
  const c1 = await cardProbe();
  ok('悬停点亮 .lit', c1.lit === true, c1);
  ok('光标坐标写进 --mx/--my（px）', /px$/.test(c1.mx) && /px$/.test(c1.my), [c1.mx, c1.my]);
  ok('--mx ≈ 卡宽 80%', near(parseFloat(c1.mx), v0.w * 0.8, 3), [c1.mx, v0.w * 0.8]);
  ok('--my ≈ 卡高 25%', near(parseFloat(c1.my), v0.h * 0.25, 3), [c1.my, v0.h * 0.25]);
  /* CR-21 基线更新：
     · track 卡的圆角/卡底已被 #gridFeats.wf-mode .w-card 覆盖（16px / --panel-2）；
     · 浏览器把 radial-gradient 里的 px 值四舍五入到整数，
       所以 --mx 与 gradient 里的数值不能字面比对，必须按数值容差比。 */
  const numClose = (grad, v, tol = 1.5) => {
    const m = grad.match(/at\s+([\d.]+)px\s+([\d.]+)px/);
    if (!m) return false;
    const want = parseFloat(v);
    return Math.abs(parseFloat(m[1]) - want) <= tol || Math.abs(parseFloat(m[2]) - want) <= tol;
  };
  ok('磨砂玻璃：底 + backdrop blur（wf-mode 下卡底由 --wc-glass 换 --panel-2）',
     (/^rgba\(/.test(c1.bg) || /^rgb\(/.test(c1.bg)) && /blur\(10px\)/.test(c1.backdrop), [c1.bg, c1.backdrop]);
  ok('卡片圆角符合基线（wf-mode 16px，未进 wf-mode 时 12px）',
     c1.radius === '16px' || c1.radius === '12px', c1.radius);
  ok('光斑层 opacity=1 且圆心跟随光标',
     c1.beforeOp === '1' && c1.beforeBg.indexOf('radial-gradient') === 0 && numClose(c1.beforeBg, c1.mx),
     [c1.beforeOp, c1.beforeBg.slice(0, 80)]);
  ok('边框环层 opacity=1 + mask 相减 + 1px padding',
    c1.afterOp === '1' && /exclude|xor/.test(c1.afterMask) && parseFloat(c1.afterPad) === 1, [c1.afterOp, c1.afterMask, c1.afterPad]);
  ok('边框环圆心同样跟随光标', numClose(c1.afterBg, c1.mx), c1.afterBg.slice(0, 80));
  ok('3D 倾斜真生效（matrix3d）', /^matrix3d\(/.test(c1.transform), c1.transform);
  ok('右上光标 → rx>0 且 ry>0', c1.rx > 0 && c1.ry > 0, [c1.rx, c1.ry]);
  ok('倾斜 ≤ 4°', Math.abs(c1.rx) <= 4 && Math.abs(c1.ry) <= 4, [c1.rx, c1.ry]);
  ok('图标轻微放大（材质呼应）', c1.icoTransform !== 'none', c1.icoTransform);

  /* D2 左下角：符号翻转 */
  await p.mouse.move(v0.l + v0.w * 0.15, v0.t + v0.h * 0.85);
  await p.waitForTimeout(420);
  const c2 = await cardProbe();
  ok('左下光标 → rx<0 且 ry<0（方向随光标翻转）', c2.rx < 0 && c2.ry < 0, [c2.rx, c2.ry]);
  ok('左下倾斜同样 ≤ 4°', Math.abs(c2.rx) <= 4 && Math.abs(c2.ry) <= 4, [c2.rx, c2.ry]);

  /* D3 九宫格扫一遍，全程不得越界 4°。
     取样口径：卡片自身在倾斜，用「未变换的布局框」算落点 —— 否则 0.02/0.98
     这种贴边落点会因上一帧的倾斜把卡片边缘推离光标而落到卡外（实测 9→8）。
     每步先把光标移到容器空白处让卡片复原，再按静态框取落点。 */
  const staticBox = await p.evaluate(() => {
    const g = document.getElementById('gridFeats');
    const gr = g.getBoundingClientRect();
    /* 取样框必须取「卡片」本身，不能取 .wf-item：
       .wf-item 是 height:100% 的定位框（恒等于舞台高 562），
       卡片在其中垂直居中只有 373 高 —— 按 .wf-item 算 fy=0.04/0.96 会落到卡片外面，
       实测只剩 3 个落点能点亮。居中卡 scale=1 且无位移，getBoundingClientRect 即真实框。 */
    const it = [...g.querySelectorAll('.wf-item')].find(x => x.style.zIndex === '100') || g.querySelector('.wf-item');
    const c = it.querySelector('.w-card');
    const r = c.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height, gl: gr.left, gt: gr.top };
  });
  let maxTilt = 0, tiltSamples = 0;
  for (const fx of [0.04, 0.5, 0.96]) {
    for (const fy of [0.04, 0.5, 0.96]) {
      await p.mouse.move(staticBox.gl + 4, staticBox.gt + 2);   // 先离开卡片，等复原
      await p.waitForTimeout(120);
      await p.mouse.move(staticBox.l + staticBox.w * fx, staticBox.t + staticBox.h * fy);
      await p.waitForTimeout(200);
      const c = await cardProbe();
      if (!c.lit) continue;
      maxTilt = Math.max(maxTilt, Math.abs(c.rx), Math.abs(c.ry));
      tiltSamples++;
    }
  }
  ok('9 个落点全部采样成功', tiltSamples === 9, tiltSamples);
  ok('全程倾斜峰值 ≤ 4°（提示词硬上限）', maxTilt <= 4, maxTilt);
  ok('倾斜确实被用起来（峰值 > 2°，不是形同虚设）', maxTilt > 2, maxTilt);

  /* D4 移出平滑复原 */
  await p.mouse.move(8, 8);
  await p.waitForTimeout(700);
  const cOff = await p.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card');
    return {
      anyLit: document.querySelectorAll('#gridFeats .w-card.lit').length,
      transform: getComputedStyle(c).transform,
      rx: c.style.getPropertyValue('--rx'), mx: c.style.getPropertyValue('--mx'),
      beforeOp: getComputedStyle(c, '::before').opacity,
      afterOp: getComputedStyle(c, '::after').opacity,
      transition: getComputedStyle(c).transition
    };
  });
  ok('移出后无卡片残留 .lit', cOff.anyLit === 0, cOff.anyLit);
  ok('移出后 transform 归零', cOff.transform === 'none', cOff.transform);
  ok('移出后清空 --rx/--mx 内联变量', cOff.rx === '' && cOff.mx === '', [cOff.rx, cOff.mx]);
  ok('移出后光斑与边框环淡出', cOff.beforeOp === '0' && cOff.afterOp === '0', [cOff.beforeOp, cOff.afterOp]);
  ok('复原走 transition（平滑而非瞬切）', /transform/.test(cOff.transition) && /\.42s/.test(cOff.transition), cOff.transition);

  /* D5 Cover Flow 远端卡同样生效（事件委托的关键收益）。
     CR-18：原 marquee 用克隆卡验证委托；现改为翻页到第 7~10 项（初始不可见的远端卡），
     逐张点亮。验收强度不变：逐张命中、索引一致、光斑圆心≈半宽、光斑与边框点亮。 */
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await p.waitForTimeout(500);
  /* D5 Cover Flow 远端卡同样生效（事件委托的关键收益）。
     CR-18：原 marquee 用克隆卡验证委托；现逐张把 4 张远端卡（索引 6~9）翻到居中位再测追光。
     为什么不直接测侧卡：3D rotateY 后侧卡部分被中间卡按 z-index 遮挡，rect 中心可能落在
     上层卡之下 —— 那是预期的视觉层叠，不是追光失效。翻到居中再测才是「每张卡都能被委托命中」。
     验收强度不变：逐张命中、索引一致、光斑圆心≈半宽、光斑与边框点亮。 */
  const cloneHits = [];
  for (const target of [6, 7, 8, 9]) {
    await p.mouse.move(8, 8); await p.waitForTimeout(120);   // 移开清掉上一轮 .lit
    await p.evaluate(i => {
      const it = document.querySelectorAll('#gridFeats .wf-item')[i];
      if (it) it.click();
    }, target);
    await p.waitForTimeout(1000);   // 等 .72s transform 过渡收敛
    const box = await p.evaluate(i => {
      const it = document.querySelectorAll('#gridFeats .wf-item')[i];
      const r = it.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, h: r.height, w: r.width };
    }, target);
    await p.mouse.move((box.l + box.r) / 2, box.t + box.h * 0.4);
    await p.waitForTimeout(320);
    const r = await p.evaluate(() => [...document.querySelectorAll('#gridFeats .w-card.lit')]
      .map(c => {
        const it = c.closest('.wf-item');
        const all = [...document.querySelectorAll('#gridFeats .wf-item')];
        return { idx: all.indexOf(it),
          mx: c.style.getPropertyValue('--mx'), w: c.offsetWidth,
          op: getComputedStyle(c, '::before').opacity, after: getComputedStyle(c, '::after').opacity };
      }));
    cloneHits.push({ target, w: box.w, lit: r });
  }
  ok('远端卡逐张试全部点亮', cloneHits.every(x => x.lit.length === 1), cloneHits);
  ok('命中的正是光标所在远端卡（索引一致）', cloneHits.every(x => x.lit[0] && x.lit[0].idx === x.target), cloneHits);
  ok('全部命中卡都是远端卡（索引 ≥ 6）', cloneHits.every(x => x.target >= 6), cloneHits.map(x => x.target));
  ok('远端卡光斑圆心 ≈ 卡宽一半（按实测卡宽，不硬编码）',
    cloneHits.every(x => x.lit[0] && near(parseFloat(x.lit[0].mx), x.w / 2, 6)), cloneHits.map(x => [x.lit[0] && x.lit[0].mx, x.w / 2]));
  /* opacity 过渡尾帧可能是 0.999999（浏览器插值精度），按 ≥0.99 判定点亮完成 */
  ok('远端卡光斑与边框环同样点亮', cloneHits.every(x => x.lit[0] && +x.lit[0].op >= 0.99 && +x.lit[0].after >= 0.99),
    cloneHits.map(x => x.lit[0] && [x.lit[0].op, x.lit[0].after]));

  /* D6 键盘可达性：focusin 点亮中心光斑。
     光斑有 .3s 淡入过渡，必须等过渡走完再取 opacity（立即取样只会拿到 0）。 */
  await p.mouse.move(8, 8); await p.waitForTimeout(400);
  /* 先清掉 D5 鼠标残留的 .lit（否则会取到上一张带 px 光斑的卡，误判键盘态） */
  await p.evaluate(() => {
    document.querySelectorAll('#gridFeats .w-card.lit').forEach(c => {
      c.classList.remove('lit');
      ['--rx','--ry','--mx','--my'].forEach(k => c.style.removeProperty(k));
    });
  });
  await p.waitForTimeout(100);
  const kbTarget = await p.evaluate(() => {
    /* 挑当前居中卡（z-index=100）聚焦，避免远端 aria-hidden 卡的焦点竞争 */
    const it = [...document.querySelectorAll('#gridFeats .wf-item')].find(x => x.style.zIndex === '100')
      || document.querySelector('#gridFeats .wf-item');
    const b = it.querySelector('.w-card b');
    if (!b) return false;
    b.setAttribute('tabindex', '0'); b.focus();
    return true;
  });
  ok('键盘聚焦目标就绪', kbTarget === true);
  await p.waitForTimeout(450);
  const kb = await p.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card.lit');
    if (!c) return { lit: false };
    const cs = getComputedStyle(c);
    /* .lit 规则自带 perspective(760px)，即使 rotateX/Y 都是 0deg，computed 也会是
       matrix3d(... m34=-1/760=-0.00131579 ...)。所以「有没有倾斜」要看旋转分量
       （m13/m23/m31/m32），不能拿 transform==='none' 判。 */
    const m = new DOMMatrixReadOnly(cs.transform);
    return { lit: true, mx: c.style.getPropertyValue('--mx'), my: c.style.getPropertyValue('--my'),
      rx: c.style.getPropertyValue('--rx'), ry: c.style.getPropertyValue('--ry'),
      op: cs.opacity, beforeOp: getComputedStyle(c, '::before').opacity,
      after: getComputedStyle(c, '::after').opacity, transform: cs.transform,
      rot: Math.max(Math.abs(m.m13), Math.abs(m.m23), Math.abs(m.m31), Math.abs(m.m32)) };
  });
  ok('键盘聚焦也点亮光斑（可达性）', kb.lit === true && +kb.beforeOp >= 0.99 && +kb.after >= 0.99, kb);
  ok('键盘态光斑落在中心 50%', kb.mx === '50%' && kb.my === '50%', [kb.mx, kb.my]);
  ok('键盘态不做倾斜（无光标坐标，旋转分量为 0）', kb.rx === '' && kb.ry === '' && kb.rot < 1e-6, [kb.rx, kb.ry, kb.rot]);
  await p.evaluate(() => { const b = document.querySelector('#gridFeats .w-card b[tabindex]'); if (b) { b.blur(); b.removeAttribute('tabindex'); } });
  await p.waitForTimeout(400);
  ok('失焦后复原', await p.evaluate(() => document.querySelectorAll('#gridFeats .w-card.lit').length === 0));

  /* ================= B. 胶囊几何 ================= */
  console.log('\n[B] 液态胶囊：7 类宿主精确落位 + 玻璃材质 + 细高光');
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2400);

  const geomProbe = () => p.evaluate(() => {
    const grab = (name, sel, onSel) => {
      const h = document.querySelector(sel);
      if (!h) return { name, missing: true };
      const pill = h.querySelector(':scope > .lp-pill');
      const on = h.querySelector(onSel);
      if (!pill) return { name, pill: false };
      if (!on) return { name, pill: true, on: false };
      const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
      const cs = getComputedStyle(pill);
      return {
        name, pill: true, ready: h.classList.contains('lp-ready'), op: cs.opacity,
        dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
        dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1),
        radius: cs.borderRadius, shadow: cs.boxShadow, backdrop: cs.backdropFilter,
        pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position,
        onBg: getComputedStyle(on).backgroundColor,
        hostPos: getComputedStyle(h).position,
        ariaHidden: pill.getAttribute('aria-hidden')
      };
    };
    return [
      grab('侧栏页签', '.side-tabs', '.side-tab.active'),
      grab('换肤三色卡', '.skin-switch', '.skin-btn.active'),
      grab('表格风格组', '.tw-bar .tt-group', '.tt-btn.on')
    ];
  });
  const g0 = await geomProbe();
  for (const x of g0) {
    ok(`${x.name}：胶囊已生成`, x.pill === true, x);
    ok(`${x.name}：宿主是定位元素`, x.hostPos === 'relative', x.hostPos);
    ok(`${x.name}：胶囊可见 opacity=1`, x.op === '1', x.op);
    ok(`${x.name}：几何精确落位 dx/dy/dw/dh ≈ 0`,
      near(x.dx, 0) && near(x.dy, 0) && near(x.dw, 0) && near(x.dh, 0), x);
    ok(`${x.name}：pointer-events:none 永不挡点击`, x.pe === 'none', x.pe);
    ok(`${x.name}：胶囊在文字之下 z-index:0`, x.z === '0', x.z);
    ok(`${x.name}：aria-hidden 不进无障碍树`, x.ariaHidden === 'true', x.ariaHidden);
    ok(`${x.name}：边缘细高光（≥3 层 inset）`, (x.shadow.match(/inset/g) || []).length >= 3, x.shadow);
    ok(`${x.name}：玻璃磨砂 backdrop-filter`, /blur\(6px\)/.test(x.backdrop), x.backdrop);
    ok(`${x.name}：选中项兜底底色已透明化（避免双层白底）`, x.onBg === 'rgba(0, 0, 0, 0)', x.onBg);
  }
  ok('侧栏页签胶囊圆角 8px', g0[0].radius === '8px', g0[0].radius);
  ok('换肤卡胶囊圆角 7px', g0[1].radius === '7px', g0[1].radius);
  ok('表格风格组胶囊圆角 6px', g0[2].radius === '6px', g0[2].radius);

  /* 设置面板 8 组分段 */
  await p.evaluate(() => document.getElementById('btnSettings').click());
  await p.waitForTimeout(800);
  const segs = await p.evaluate(() => [...document.querySelectorAll('.set-seg')].map(h => {
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    if (!pill || !on) return { id: h.id, pill: !!pill, on: !!on };
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return {
      id: h.id, ready: h.classList.contains('lp-ready'), op: getComputedStyle(pill).opacity,
      dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
      dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1),
      radius: getComputedStyle(pill).borderRadius,
      onBg: getComputedStyle(on).backgroundColor, segBg: getComputedStyle(h).backgroundColor,
      hostPos: getComputedStyle(h).position
    };
  }));
  ok('设置面板 8 组分段全部有胶囊', segs.length === 8 && segs.every(s => s.pill !== false && s.on !== false), segs.map(s => s.id));
  ok('8 组分段全部 lp-ready', segs.every(s => s.ready === true), segs.map(s => [s.id, s.ready]));
  ok('8 组分段几何全部精确落位', segs.every(s => near(s.dx, 0) && near(s.dy, 0) && near(s.dw, 0) && near(s.dh, 0)),
    segs.filter(s => !near(s.dx, 0) || !near(s.dw, 0)));
  ok('8 组分段选中项底色透明化', segs.every(s => s.onBg === 'rgba(0, 0, 0, 0)'), segs.map(s => [s.id, s.onBg]));
  ok('分段轨道底色仍是 --set-fill（硬约束未动）', segs.every(s => s.segBg === 'rgb(241, 243, 245)'), segs.map(s => s.segBg));
  ok('分段胶囊圆角 7px', segs.every(s => s.radius === '7px'), segs.map(s => s.radius));

  /* ================= C. 拉长 → 滑动 → 弹性回弹 ================= */
  console.log('\n[C] 拉长 → 滑动 → 弹性回弹');
  /* 横向：行高 紧凑 → 宽松（距离最远，拉伸最明显） */
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="compact"]').click());
  await p.waitForTimeout(700);
  const stretchSamples = [];
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="loose"]').click());
  for (const t of [30, 30, 40, 60, 100, 240]) {
    await p.waitForTimeout(t);
    stretchSamples.push(await p.evaluate(() => {
      const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
      const cs = getComputedStyle(pill);
      return {
        stretch: pill.classList.contains('stretch'),
        sx: +pill.style.getPropertyValue('--lp-sx'), sy: +pill.style.getPropertyValue('--lp-sy'),
        ox: pill.style.getPropertyValue('--lp-ox'), oy: pill.style.getPropertyValue('--lp-oy'),
        w: +pill.getBoundingClientRect().width.toFixed(1), h: +pill.getBoundingClientRect().height.toFixed(1),
        dur: cs.transitionDuration, ease: cs.transitionTimingFunction
      };
    }));
  }
  const mid = stretchSamples.filter(s => s.stretch);
  const end = stretchSamples[stretchSamples.length - 1];
  ok('切换中途进入 .stretch 拉伸态', mid.length >= 2, stretchSamples.map(s => s.stretch));
  ok('横向移动 → 沿 X 拉长（sx > 1.2）', mid.every(s => s.sx > 1.2), mid.map(s => s.sx));
  ok('横向拉伸上限 ≤ 1.34（34%）', mid.every(s => s.sx <= 1.341), mid.map(s => s.sx));
  ok('纵向同步收窄保面积感（sy < 1）', mid.every(s => s.sy < 1 && s.sy > 0.8), mid.map(s => s.sy));
  ok('拉伸原点设在出发侧（向右移动 → ox=0%）', mid.every(s => s.ox === '0%' && s.oy === '50%'), mid.map(s => [s.ox, s.oy]));
  ok('拉伸期用短促曲线 .19s', mid.every(s => /^0\.19s/.test(s.dur)), mid.map(s => s.dur));
  ok('拉伸期真实几何被拉宽（w 大于终态）', Math.max(...mid.map(s => s.w)) > end.w + 4, [mid.map(s => s.w), end.w]);
  ok('190ms 后撤 .stretch', end.stretch === false, end);
  ok('到位后 sx/sy 归 1（弹性回弹接管）', end.sx === 1 && end.sy === 1, [end.sx, end.sy]);
  ok('回弹交回带 overshoot 的 .42s 曲线', /\.42s|0\.42s/.test(end.dur) && /1\.42/.test(end.ease), [end.dur, end.ease]);
  await p.waitForTimeout(500);
  const settled = await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { on: on.dataset.lh, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1),
      stretch: pill.classList.contains('stretch') };
  });
  ok('终态精确落在新当前项（宽松）', settled.on === 'loose' && near(settled.dx, 0) && near(settled.dw, 0), settled);

  /* 反向移动：原点应翻到 100% */
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="compact"]').click());
  await p.waitForTimeout(70);
  const back = await p.evaluate(() => {
    const pill = document.querySelector('#setLH > .lp-pill');
    return { stretch: pill.classList.contains('stretch'), ox: pill.style.getPropertyValue('--lp-ox'), sx: +pill.style.getPropertyValue('--lp-sx') };
  });
  ok('向左移动 → 拉伸原点翻到 100%', back.stretch === true && back.ox === '100%', back);
  ok('反向同样拉长', back.sx > 1.2, back.sx);
  await p.waitForTimeout(700);

  /* 点击胶囊覆盖区不得吞掉事件（pointer-events:none 的真实收益） */
  const clickThrough = await p.evaluate(() => {
    const h = document.getElementById('setLH');
    const pill = h.querySelector(':scope > .lp-pill');
    const pr = pill.getBoundingClientRect();
    const el = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
    return { tag: el ? el.tagName : null, isPill: !!(el && el.classList.contains('lp-pill')),
      inHost: !!(el && h.contains(el)) };
  });
  ok('胶囊中心命中的是真实按钮而非胶囊', clickThrough.isPill === false && clickThrough.tag === 'BUTTON', clickThrough);

  /* ================= G. 硬约束（设置面板开着时量） ================= */
  console.log('\n[G] 三条硬约束未被破坏');
  const hard = await p.evaluate(() => ({
    panelRadius: getComputedStyle(document.querySelector('.set-panel')).borderRadius,
    cardRadius: getComputedStyle(document.querySelector('.set-card')).borderRadius,
    rows: document.querySelectorAll('.set-row').length,
    segBg: getComputedStyle(document.querySelector('.set-seg')).backgroundColor,
    panelBg: getComputedStyle(document.querySelector('.set-panel')).backgroundColor
  }));
  ok('设置面板圆角仍 16px', hard.panelRadius === '16px', hard.panelRadius);
  ok('设置卡片圆角仍 12px', hard.cardRadius === '12px', hard.cardRadius);
  ok('设置面板仍 13 行（未增删）', hard.rows === 13, hard.rows);
  ok('分段轨道底色仍 rgb(241,243,245)', hard.segBg === 'rgb(241, 243, 245)', hard.segBg);

  /* ================= F. 可读性：3 主题 × 4 风格 ================= */
  console.log('\n[F] 胶囊文字可读性：3 主题 × 4 文档风格 ≥ 4.5:1');
  const inkRows = [];
  for (const st of ['mono', 'tech', 'gov', 'cute']) {
    await p.evaluate(s => document.querySelector('#setTT button[data-tt="' + s + '"]').click(), st);
    await p.waitForTimeout(550);
    for (const th of ['light', 'dark', 'sepia']) {
      await p.evaluate(t => document.querySelector('#setTheme button[data-theme="' + t + '"]').click(), th);
      await p.waitForTimeout(600);
      const r = await p.evaluate(INK_PROBE);
      const line = {};
      for (const k of ['seg', 'side', 'skin']) line[k] = inkRatio(r[k]);
      inkRows.push({ st, th, ...line });
      ok(`${st}/${th} 设置分段文字 ≥ 4.5:1`, line.seg !== null && line.seg >= 4.5, line.seg);
      ok(`${st}/${th} 侧栏页签文字 ≥ 4.5:1`, line.side !== null && line.side >= 4.5, line.side);
      ok(`${st}/${th} 换肤卡文字 ≥ 4.5:1`, line.skin !== null && line.skin >= 4.5, line.skin);
      ok(`${st}/${th} 宿主级 --lp-ink 已实测写入`, !!(r.seg && r.seg.ink) && !!(r.side && r.side.ink), [r.seg && r.seg.ink, r.side && r.side.ink]);
    }
  }
  const minInk = Math.min(...inkRows.flatMap(r => [r.seg, r.side, r.skin]).filter(v => v !== null));
  ok('12 组 chrome 对比度最小值 ≥ 4.5', minInk >= 4.5, minInk);
  console.log('       对比度矩阵 = ' + JSON.stringify(inkRows));

  /* 柔光开启后仍达标（暖白胶囊换底） */
  await p.evaluate(() => document.querySelector('#setTT button[data-tt="mono"]').click());
  await p.waitForTimeout(450);
  await p.evaluate(() => document.querySelector('#setTheme button[data-theme="dark"]').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('setPm').click());
  await p.waitForTimeout(700);
  const pmInk = await p.evaluate(INK_PROBE);
  ok('柔光 + 深色：分段文字仍 ≥ 4.5:1', inkRatio(pmInk.seg) >= 4.5, inkRatio(pmInk.seg));
  ok('柔光 + 深色：侧栏文字仍 ≥ 4.5:1', inkRatio(pmInk.side) >= 4.5, inkRatio(pmInk.side));
  ok('柔光下胶囊改暖白（--lp-fill 已换）', /255,\s*246,\s*230/.test(pmInk.seg.fill), pmInk.seg.fill);
  await p.evaluate(() => document.getElementById('setPm').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#setTheme button[data-theme="light"]').click());
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);

  /* 文档内三组工具条：4 风格 × 3 主题 */
  await p.evaluate(() => { const x = document.querySelector('.tw-bar button[data-act="chart"]'); if (x) x.click(); });
  await p.waitForTimeout(900);
  const docGeom = await p.evaluate(() => {
    const grab = (name, sel, onSel) => {
      const h = document.querySelector(sel); if (!h) return { name, missing: true };
      const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector(onSel);
      if (!pill || !on) return { name, pill: !!pill, on: !!on };
      const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
      return { name, ready: h.classList.contains('lp-ready'), op: getComputedStyle(pill).opacity,
        dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
        dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1),
        radius: getComputedStyle(pill).borderRadius, hostPos: getComputedStyle(h).position,
        onBg: getComputedStyle(on).backgroundColor };
    };
    return [grab('图表类型组', '.chart-box.show .chart-types', 'button.on'),
      grab('流程图结构组', '.mf-tools .mf-modes', 'button.on'),
      grab('表格风格组', '.tw-bar .tt-group', '.tt-btn.on')];
  });
  for (const x of docGeom) {
    ok(`${x.name}：胶囊就绪且可见`, x.ready === true && x.op === '1', x);
    ok(`${x.name}：几何精确落位`, near(x.dx, 0) && near(x.dy, 0) && near(x.dw, 0) && near(x.dh, 0), x);
    ok(`${x.name}：宿主定位 + 选中底透明化`, x.hostPos === 'relative' && x.onBg === 'rgba(0, 0, 0, 0)', x);
  }
  ok('图表/流程图组胶囊圆角 6px', docGeom[0].radius === '6px' && docGeom[1].radius === '6px', [docGeom[0].radius, docGeom[1].radius]);

  /* 图表类型切换后胶囊必须重新对齐（innerHTML 整段重写） */
  await p.evaluate(() => document.querySelector('.chart-box.show .chart-types button[data-ct="rose"]').click());
  await p.waitForTimeout(800);
  const ctSwitch = await p.evaluate(() => {
    const h = document.querySelector('.chart-box.show .chart-types');
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { on: on.dataset.ct, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1),
      pills: h.querySelectorAll('.lp-pill').length };
  });
  ok('切玫瑰图后当前项同步', ctSwitch.on === 'rose', ctSwitch.on);
  ok('innerHTML 重写后胶囊重新精确对齐', near(ctSwitch.dx, 0) && near(ctSwitch.dw, 0), ctSwitch);
  ok('胶囊不重复插入（仍只 1 枚）', ctSwitch.pills === 1, ctSwitch.pills);

  const docInk = [];
  for (const st of ['mono', 'tech', 'gov', 'cute']) {
    await p.evaluate(s => document.querySelector('.tw-bar .tt-btn[data-tt="' + s + '"]').click(), st);
    await p.waitForTimeout(600);
    for (const th of ['light', 'dark', 'sepia']) {
      await p.evaluate(t => document.querySelector('#skinSwitch button[data-theme="' + t + '"]').click(), th);
      await p.waitForTimeout(600);
      const r = await p.evaluate(INK_PROBE);
      const line = { ct: inkRatio(r.ct), tt: inkRatio(r.tt), fm: inkRatio(r.fm) };
      docInk.push({ st, th, ...line });
      ok(`${st}/${th} 图表类型组文字 ≥ 4.5:1`, line.ct !== null && line.ct >= 4.5, line.ct);
      ok(`${st}/${th} 表格风格组文字 ≥ 4.5:1`, line.tt !== null && line.tt >= 4.5, line.tt);
      ok(`${st}/${th} 流程图结构组文字 ≥ 4.5:1`, line.fm !== null && line.fm >= 4.5, line.fm);
    }
  }
  const minDoc = Math.min(...docInk.flatMap(r => [r.ct, r.tt, r.fm]).filter(v => v !== null));
  ok('12 组文档工具条对比度最小值 ≥ 4.5', minDoc >= 4.5, minDoc);
  console.log('       工具条对比度矩阵 = ' + JSON.stringify(docInk));
  await p.evaluate(() => document.querySelector('.tw-bar .tt-btn[data-tt="mono"]').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('skinLight').click());
  await p.waitForTimeout(500);

  /* ================= B2. 专注竖排多选宿主 ================= */
  console.log('\n[B2] 专注侧边竖排胶囊（多选宿主）');
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(800);
  const fr0 = await p.evaluate(() => {
    const h = document.getElementById('focusRender'), pill = h.querySelector(':scope > .lp-pill');
    return {
      pill: !!pill, ready: h.classList.contains('lp-ready'), op: getComputedStyle(pill).opacity,
      radius: getComputedStyle(pill).borderRadius, dir: getComputedStyle(h).flexDirection,
      pos: getComputedStyle(h).position,
      rectT: +h.getBoundingClientRect().top.toFixed(1), rectB: +h.getBoundingClientRect().bottom.toFixed(1),
      onCount: h.querySelectorAll('.fr-btn.on').length,
      last: h.__lpLast ? (h.__lpLast.dataset.proxy + ':' + (h.__lpLast.dataset.val || '')) : null,
      dockR: +h.getBoundingClientRect().right.toFixed(1),
      innerL: +document.querySelector('.reader-inner').getBoundingClientRect().left.toFixed(1),
      onBgs: [...h.querySelectorAll('.fr-btn.on')].map(x => getComputedStyle(x).backgroundColor)
    };
  });
  ok('专注菜单有胶囊且可见', fr0.pill === true && fr0.op === '1', fr0);
  ok('专注菜单竖排（axis=y）', fr0.dir === 'column', fr0.dir);
  /* .lp-host{position:relative} 不得把 .focus-render 的 fixed 打回文档流
     （实测回退：菜单底边 1097px 越出 900px 视口）。CR-05d 的视口约束必须保住。 */
  ok('专注菜单仍是 position:fixed（胶囊没打回文档流）', fr0.pos === 'fixed', fr0.pos);
  ok('专注菜单完整落在视口内', fr0.rectT >= 0 && fr0.rectB <= 1000, [fr0.rectT, fr0.rectB]);
  ok('多选宿主不做 lp-ready 透明化（其余 .on 指示不丢）', fr0.ready === false, fr0.ready);
  ok('多选宿主同时点亮 ≥ 2 项', fr0.onCount >= 2, fr0.onCount);
  ok('其余选中项保留兜底底色', fr0.onBgs.some(c => c !== 'rgba(0, 0, 0, 0)'), fr0.onBgs);
  ok('专注胶囊圆角 9px', fr0.radius === '9px', fr0.radius);
  ok('正文仍让位不遮挡（CR-05d 硬约束）', fr0.innerL >= fr0.dockR - 1, [fr0.innerL, fr0.dockR]);

  await p.click('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
  await p.waitForTimeout(750);
  const fr1 = await p.evaluate(() => {
    const h = document.getElementById('focusRender'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
      dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1),
      last: h.__lpLast.dataset.val, onCount: h.querySelectorAll('.fr-btn.on').length,
      lh: document.getElementById('content').style.getPropertyValue('--lh') };
  });
  ok('竖排胶囊精确落在「紧凑」', near(fr1.dx, 0) && near(fr1.dy, 0) && near(fr1.dw, 0) && near(fr1.dh, 0), fr1);
  ok('胶囊只跟最后变化项（__lpLast=compact）', fr1.last === 'compact', fr1.last);
  ok('代理回写真生效（--lh=1.5）', fr1.lh === '1.5', fr1.lh);

  /* 纵向拉伸 */
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
  await p.waitForTimeout(70);
  const frStretch = await p.evaluate(() => {
    const pill = document.querySelector('#focusRender > .lp-pill');
    return { stretch: pill.classList.contains('stretch'), sy: +pill.style.getPropertyValue('--lp-sy'),
      sx: +pill.style.getPropertyValue('--lp-sx'), oy: pill.style.getPropertyValue('--lp-oy'), ox: pill.style.getPropertyValue('--lp-ox') };
  });
  ok('纵向移动 → 沿 Y 拉长（sy > 1.2）', frStretch.stretch === true && frStretch.sy > 1.2, frStretch);
  ok('纵向拉伸上限 ≤ 1.34', frStretch.sy <= 1.341, frStretch.sy);
  ok('横向同步收窄（sx < 1）', frStretch.sx < 1 && frStretch.sx > 0.8, frStretch.sx);
  ok('向下移动 → 拉伸原点 oy=0%（出发侧在上）', frStretch.oy === '0%' && frStretch.ox === '50%', [frStretch.oy, frStretch.ox]);
  await p.waitForTimeout(700);
  const frEnd = await p.evaluate(() => {
    const h = document.getElementById('focusRender'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { stretch: pill.classList.contains('stretch'), sy: +pill.style.getPropertyValue('--lp-sy'),
      dy: +(pr.top - or.top).toFixed(1), dh: +(pr.height - or.height).toFixed(1) };
  });
  ok('纵向到位后回弹归 1 且精确落位', frEnd.stretch === false && frEnd.sy === 1 && near(frEnd.dy, 0) && near(frEnd.dh, 0), frEnd);
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  await p.waitForTimeout(600);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  ok('Esc 退出专注后菜单收起', await p.evaluate(() => getComputedStyle(document.getElementById('focusRender')).display === 'none'));

  /* ================= G2. 顶栏 1920 full 档 ================= */
  console.log('\n[G2] 顶栏分档几何未被胶囊改变');
  await p.setViewportSize({ width: 1920, height: 1000 });
  await p.waitForTimeout(700);
  const tb = await p.evaluate(() => {
    const t = document.querySelector('.toolbar');
    return { tb: t.dataset.tb, over: t.scrollWidth - t.clientWidth,
      collapsed: t.querySelectorAll('.tb-collapsed').length,
      skinPill: !!document.querySelector('.skin-switch > .lp-pill'),
      skinHostW: +document.querySelector('.skin-switch').getBoundingClientRect().width.toFixed(1) };
  });
  ok('1920 仍是 full 档', tb.tb === 'full', tb.tb);
  ok('顶栏零溢出（胶囊不占布局空间）', tb.over === 0, tb.over);
  ok('无控件被折叠', tb.collapsed === 0, tb.collapsed);
  ok('换肤组仍有胶囊', tb.skinPill === true, tb);
  /* resize 后胶囊必须补量对齐 */
  const tbGeom = await p.evaluate(() => {
    const h = document.querySelector('.skin-switch'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('.skin-btn.active');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1) };
  });
  ok('resize 后胶囊重新对齐', near(tbGeom.dx, 0) && near(tbGeom.dw, 0), tbGeom);
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.waitForTimeout(600);

  /* ================= E. 无障碍与打印降级 ================= */
  console.log('\n[E] 减弱动效 / 打印降级');
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(300);
  const pr = await p.evaluate(() => {
    const pill = document.querySelector('.set-seg > .lp-pill') || document.querySelector('.skin-switch > .lp-pill');
    const seg = document.querySelector('.tw-bar .tt-group');
    const on = seg ? seg.querySelector('.tt-btn.on') : null;
    const card = document.querySelector('#gridFeats .w-card');
    return {
      pillDisplay: pill ? getComputedStyle(pill).display : 'NONE',
      onBg: on ? getComputedStyle(on).backgroundColor : null,
      cardBefore: card ? getComputedStyle(card, '::before').display : null,
      cardAfter: card ? getComputedStyle(card, '::after').display : null,
      cardTransform: card ? getComputedStyle(card).transform : null,
      cardBackdrop: card ? getComputedStyle(card).backdropFilter : null
    };
  });
  ok('打印：胶囊 display:none', pr.pillDisplay === 'none', pr.pillDisplay);
  ok('打印：追光双伪元素隐去', pr.cardBefore === 'none' && pr.cardAfter === 'none', pr);
  ok('打印：卡片不做倾斜 / 不做磨砂', pr.cardTransform === 'none' && pr.cardBackdrop === 'none', pr);
  await p.emulateMedia({ media: 'screen' });
  await p.waitForTimeout(300);
  ok('回到屏幕媒体胶囊恢复', await p.evaluate(() => {
    const pill = document.querySelector('.skin-switch > .lp-pill');
    return getComputedStyle(pill).display !== 'none' && getComputedStyle(pill).opacity === '1';
  }));

  /* 减弱动效：新 context 让 matchMedia 在启动时即为 reduce */
  const ctxR = await b.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const rp = await ctxR.newPage();
  const rerrs = [];
  rp.on('pageerror', e => rerrs.push(e.message));
  await rp.goto(F);
  await rp.waitForTimeout(1600);
  ok('减弱动效环境识别成功', await rp.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const rGrid = await rp.evaluate(() => {
    const g = document.getElementById('gridFeats');
    return { cards: g.querySelectorAll('.w-card').length, track: !!g.querySelector('.w-track'), overflowX: getComputedStyle(g).overflowX };
  });
  ok('减弱动效：marquee 退化为静态可横滚', rGrid.track === false && rGrid.overflowX === 'auto', rGrid);
  const rCardBox = await (await rp.$('#gridFeats .w-card')).boundingBox();
  await rp.mouse.move(rCardBox.x + rCardBox.width * 0.8, rCardBox.y + rCardBox.height * 0.25);
  await rp.waitForTimeout(400);
  const rCard = await rp.evaluate(() => {
    const c = document.querySelector('#gridFeats .w-card.lit');
    if (!c) return { lit: false };
    return { lit: true, transform: getComputedStyle(c).transform, rx: c.style.getPropertyValue('--rx'),
      mx: c.style.getPropertyValue('--mx'), beforeOp: getComputedStyle(c, '::before').opacity,
      afterOp: getComputedStyle(c, '::after').opacity, ico: getComputedStyle(c.querySelector('.feat-ico') || c).transform };
  });
  ok('减弱动效：仍点亮静态光斑（材质保留）', rCard.lit === true && rCard.beforeOp === '1' && rCard.afterOp === '1', rCard);
  ok('减弱动效：光斑仍跟随光标', /px$/.test(rCard.mx), rCard.mx);
  ok('减弱动效：不做 3D 倾斜', rCard.transform === 'none' && rCard.rx === '', [rCard.transform, rCard.rx]);
  ok('减弱动效：图标不放大', rCard.ico === 'none', rCard.ico);
  await rp.evaluate(() => document.getElementById('wDemo').click());
  await rp.waitForTimeout(2200);
  await rp.evaluate(() => document.getElementById('btnSettings').click());
  await rp.waitForTimeout(700);
  await rp.evaluate(() => document.querySelector('#setLH button[data-lh="loose"]').click());
  await rp.waitForTimeout(80);
  const rPill = await rp.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { stretch: pill.classList.contains('stretch'), sx: pill.style.getPropertyValue('--lp-sx'),
      dur: getComputedStyle(pill).transitionDuration, op: getComputedStyle(pill).opacity,
      dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1), on: on.dataset.lh };
  });
  ok('减弱动效：不进入拉伸态', rPill.stretch === false && rPill.sx === '', rPill);
  ok('减弱动效：胶囊 transition 只剩 opacity', /^0\.12s/.test(rPill.dur) && !/0\.42s/.test(rPill.dur), rPill.dur);
  ok('减弱动效：胶囊仍瞬时精确落位（指示不丢）', rPill.op === '1' && rPill.on === 'loose' && near(rPill.dx, 0) && near(rPill.dw, 0), rPill);
  ok('减弱动效环境零 JS 错误', rerrs.length === 0, rerrs.slice(0, 3));
  await ctxR.close();

  /* ================= I. 英文界面 ================= */
  console.log('\n[I] 英文界面按翻译后真实宽度对齐');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('btnSettings').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1600);
  const enSegs = await p.evaluate(() => [...document.querySelectorAll('.set-seg')].map(h => {
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    if (!pill || !on) return { id: h.id, ok: false };
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { id: h.id, ok: true, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1),
      label: on.textContent.trim() };
  }));
  ok('英文界面 8 组分段胶囊全部精确对齐', enSegs.every(s => s.ok && near(s.dx, 0) && near(s.dw, 0)),
    enSegs.filter(s => !s.ok || !near(s.dx, 0) || !near(s.dw, 0)));
  ok('英文标签确已翻译（非中文）', enSegs.some(s => /^[A-Za-z]/.test(s.label || '')), enSegs.map(s => s.label));
  const enSide = await p.evaluate(() => {
    const h = document.querySelector('.side-tabs'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('.side-tab.active');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1), label: on.textContent.trim() };
  });
  ok('英文侧栏页签胶囊对齐', near(enSide.dx, 0) && near(enSide.dw, 0), enSide);
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="compact"]').click());
  await p.waitForTimeout(700);
  const enSwitch = await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { on: on.dataset.lh, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1) };
  });
  ok('英文界面切换后仍精确落位', enSwitch.on === 'compact' && near(enSwitch.dx, 0) && near(enSwitch.dw, 0), enSwitch);
  await p.evaluate(() => document.querySelector('#setLH button[data-lh="standard"]').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'zh-CN'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1400);
  const zhBack = await p.evaluate(() => {
    const h = document.getElementById('setLH'), pill = h.querySelector(':scope > .lp-pill');
    const on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1) };
  });
  ok('切回中文后胶囊重新按中文宽度对齐', near(zhBack.dx, 0) && near(zhBack.dw, 0), zhBack);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  /* ================= H. 导出页同款胶囊 ================= */
  console.log('\n[H] 导出页液态胶囊 + 预置携带 --lp-ink');
  await p.evaluate(() => {
    window.__dl = [];
    const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (x) { try { if (/html/.test(x.type || '')) window.__dl.push(x.text()); } catch (e) { } return o(x); };
  });
  await p.evaluate(() => { document.getElementById('btnExport').click(); const x = document.querySelector('#expMenu button[data-fmt="html"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  const expHtml = await p.evaluate(async () => window.__dl.length ? await window.__dl[window.__dl.length - 1] : '');
  ok('导出 HTML 捕获成功', expHtml.length > 100000, expHtml.length);
  const OUT = path.join(SHOTS, 'cr06-export.html');
  fs.writeFileSync(OUT, expHtml, 'utf8');
  ok('导出页内联胶囊 CSS', expHtml.indexOf('.lp-pill{position:absolute') > 0);
  ok('导出页胶囊 CSS 自包含（带 var 兜底）', expHtml.indexOf('var(--lp-fill,rgba(255,255,255,.66))') > 0);
  ok('导出页含胶囊运行时', expHtml.indexOf('var LP_SEL =') > 0 && expHtml.indexOf('liquid: lpAll') > 0);
  ok('导出页运行时版本推进到 CR-06', expHtml.indexOf("version: 'CR-2026-11-15-06'") > 0);
  ok('导出预置 12 组风格 CSS 均携带 --lp-ink', (expHtml.match(/--lp-ink:/g) || []).length >= 12,
    (expHtml.match(/--lp-ink:/g) || []).length);
  ok('导出页变量清理正则含 lp-', expHtml.indexOf('/^--(tt|mf|syn|lp)-/') > 0);

  const q = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const qerrs = [];
  q.on('pageerror', e => qerrs.push('pageerror: ' + e.message));
  q.on('console', m => { if (m.type() === 'error') qerrs.push('console: ' + m.text()); });
  await q.goto(('file:///' + OUT).replace(/\\/g, '/'));
  await q.waitForTimeout(1200);
  const eBoot = await q.evaluate(() => ({
    ver: window.MDExport && window.MDExport.version,
    liquid: !!(window.MDExport && window.MDExport.liquid),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--lp-ink').trim(),
    hosts: document.querySelectorAll('.lp-host').length,
    pills: document.querySelectorAll('.lp-pill').length
  }));
  ok('导出页运行时版本 = CR-2026-11-15-06', eBoot.ver === 'CR-2026-11-15-06', eBoot.ver);
  ok('导出页暴露 liquid 钩子', eBoot.liquid === true, eBoot);
  ok('导出页 <html> 已固化 --lp-ink', /^rgb/.test(eBoot.ink), eBoot.ink);
  ok('导出页胶囊宿主数 = 预置分段 + 图表 + 流程图', eBoot.hosts >= 6 && eBoot.pills === eBoot.hosts, eBoot);
  const eGeom = await q.evaluate(() => {
    const out = [];
    document.querySelectorAll('.lp-host').forEach(h => {
      const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
      if (!pill || !on) { out.push({ cls: h.className, ok: false }); return; }
      const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
      out.push({ cls: h.className.slice(0, 30), ok: true, op: getComputedStyle(pill).opacity,
        dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
        dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1) });
    });
    return out;
  });
  ok('导出页全部胶囊精确落位', eGeom.every(x => x.ok && x.op === '1' && near(x.dx, 0) && near(x.dy, 0) && near(x.dw, 0) && near(x.dh, 0)),
    eGeom.filter(x => !x.ok || !near(x.dx, 0) || !near(x.dw, 0)));
  /* 切主题后胶囊仍对齐 + 择墨跟着换 */
  const eInk0 = eBoot.ink;
  await q.click('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="dark"]');
  await q.waitForTimeout(700);
  const eDark = await q.evaluate(() => {
    const h = document.querySelector('#mdx-bar .mdx-seg[data-seg="theme"]');
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { theme: document.documentElement.getAttribute('data-theme'),
      ink: getComputedStyle(document.documentElement).getPropertyValue('--lp-ink').trim(),
      on: on.dataset.v, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1),
      color: getComputedStyle(on).color };
  });
  ok('导出页切深色后分段选中态同步', eDark.theme === 'dark' && eDark.on === 'dark', eDark);
  ok('导出页切主题后胶囊重新对齐', near(eDark.dx, 0) && near(eDark.dw, 0), eDark);
  ok('导出页 --lp-ink 随主题重算（不是死值）', eDark.ink !== eInk0 && /^rgb/.test(eDark.ink), [eInk0, eDark.ink]);
  /* 导出页深色对比度 */
  const eRatio = await q.evaluate(() => {
    const baseOf = el => { let n = el;
      while (n && n.nodeType === 1) { const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(getComputedStyle(n).backgroundColor || '');
        if (m && (m[4] === undefined || +m[4] > 0.98)) return [+m[1], +m[2], +m[3]]; n = n.parentElement; }
      return [255, 255, 255]; };
    const h = document.querySelector('#mdx-bar .mdx-seg[data-seg="theme"]');
    const on = h.querySelector('button.on');
    const rt = getComputedStyle(document.documentElement);
    return { color: getComputedStyle(on).color, base: baseOf(h),
      fill: rt.getPropertyValue('--lp-fill').trim(), tint: rt.getPropertyValue('--lp-tint').trim() };
  });
  /* 导出页 CSS 未内联 --lp-fill/--lp-tint（自包含兜底在 var() 里），按兜底值合成 */
  const eFill = parseRgb(eRatio.fill) || parseRgb('rgba(255,255,255,.66)');
  const eTint = parseRgb(eRatio.tint) || parseRgb('rgba(37,99,235,.10)');
  let eEff = eRatio.base;
  eEff = over(eTint.c, eTint.a, eEff);
  eEff = over(eFill.c, eFill.a, eEff);
  const eCt = contrast(parseRgb(eRatio.color).c, eEff);
  ok('导出页深色胶囊文字 ≥ 4.5:1', eCt >= 4.5, [eCt, eRatio.color, eEff]);
  await q.click('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="light"]');
  await q.waitForTimeout(500);
  /* 图表类型切换（innerHTML 重写）后胶囊重新对齐 */
  await q.evaluate(() => { const x = document.querySelector('.chart-box .chart-types button[data-ct="rose"]'); if (x) x.click(); });
  await q.waitForTimeout(800);
  const eCt2 = await q.evaluate(() => {
    const h = document.querySelector('.chart-box .chart-types');
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    if (!pill || !on) return { ok: false };
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { ok: true, on: on.dataset.ct, pills: h.querySelectorAll('.lp-pill').length,
      dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1) };
  });
  ok('导出页切玫瑰图后胶囊重新对齐且不重复', eCt2.ok && eCt2.on === 'rose' && eCt2.pills === 1 && near(eCt2.dx, 0) && near(eCt2.dw, 0), eCt2);
  /* 图表宿主被 switchChart 整段 innerHTML 重建（新宿主无「上一个位置」可滑），
     属预期行为：新胶囊直接落位。拉伸契约应在持久宿主 #mdx-bar .mdx-seg 上验证。 */
  const eRebuild = await q.evaluate(() => {
    const h = document.querySelector('.chart-box .chart-types');
    return { hasRect: !!h.__lpRect, op: getComputedStyle(h.querySelector(':scope > .lp-pill')).opacity };
  });
  ok('重建后的图表宿主胶囊直接落位可见', eRebuild.op === '1', eRebuild);
  /* 拉伸脉冲：持久的风格分段 mono → cute（距离最远） */
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="mono"]');
  await q.waitForTimeout(700);
  const eSamples = [];
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="cute"]');
  for (let i = 0; i < 8; i++) {
    eSamples.push(await q.evaluate(() => {
      const pill = document.querySelector('#mdx-bar .mdx-seg[data-seg="style"] > .lp-pill');
      return { st: pill.classList.contains('stretch'), sx: +pill.style.getPropertyValue('--lp-sx'),
        sy: +pill.style.getPropertyValue('--lp-sy'), ox: pill.style.getPropertyValue('--lp-ox') };
    }));
    await q.waitForTimeout(25);
  }
  const eMid = eSamples.filter(s => s.st);
  ok('导出页持久宿主同样播放拉伸脉冲', eMid.length >= 2, eSamples.map(s => s.st));
  ok('导出页拉伸沿 X 且 ≤ 1.34', eMid.every(s => s.sx > 1.2 && s.sx <= 1.341), eMid.map(s => s.sx));
  ok('导出页拉伸纵向收窄保面积感', eMid.every(s => s.sy < 1 && s.sy > 0.8), eMid.map(s => s.sy));
  ok('导出页拉伸原点在出发侧', eMid.every(s => s.ox === '0%'), eMid.map(s => s.ox));
  await q.waitForTimeout(700);
  const eEnd = await q.evaluate(() => {
    const h = document.querySelector('#mdx-bar .mdx-seg[data-seg="style"]');
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector('button.on');
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { st: pill.classList.contains('stretch'), sx: pill.style.getPropertyValue('--lp-sx'),
      on: on.dataset.v, dx: +(pr.left - or.left).toFixed(1), dw: +(pr.width - or.width).toFixed(1) };
  });
  ok('导出页拉伸后归 1 且精确落位', eEnd.st === false && eEnd.sx === '1' && eEnd.on === 'cute' && near(eEnd.dx, 0) && near(eEnd.dw, 0), eEnd);
  await q.click('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="mono"]');
  await q.waitForTimeout(600);
  await q.emulateMedia({ media: 'print' });
  await q.waitForTimeout(300);
  ok('导出页打印隐藏胶囊', await q.evaluate(() => {
    const pill = document.querySelector('.lp-pill');
    return !pill || getComputedStyle(pill).display === 'none';
  }));
  await q.emulateMedia({ media: 'screen' });
  ok('导出页零 JS 错误', qerrs.length === 0, qerrs.slice(0, 3));
  await q.close();

  ok('主应用全程零 JS 错误', errs.length === 0, errs.slice(0, 5));
  await b.close();
  console.log('\n============================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('============================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
