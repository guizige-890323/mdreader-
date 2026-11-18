/* ==================================================================
   CR-2026-11-16-08 · 专注菜单图标极简化（一键收起 + 悬停展开）专项测试
   ------------------------------------------------------------------
   需求（桂子哥原话）：
     「改为图标极简菜单，可以一键收取，鼠标移动到菜单，自动展开。
       每一类多选设置合并排序，适当空行。保持一列极简排布」

   五条契约 → 可测口径：
     ① 图标极简：收起态 .fr-label 视觉宽度 0 + opacity 0，.fr-ico 可见；
        文字仍在 DOM（textContent 逐字不变，历史英文断言不破）
     ② 一键收起：#frToggle 点一下 → .fr-min，只剩开关钮；再点还原；写 localStorage
     ③ 悬停展开：pointerenter → .fr-open（108px）；pointerleave → 260ms 后收回
     ④ 同类合并排序：五组 .fr-group（layout/font/lh/toggle/theme），组内固定序
     ⑤ 适当空行 + 一列：组间实测间距 > 组内间距；任何状态 flex-direction=column

   等强度承诺：14 个 data-proxy 一个不删、顺序不动；历史几何硬约束
   （right<120 / innerL>=dockR-1 / 窄屏<=50 / fixed / toast 44px）全部保留，
   并在「收起态 / 展开态」两态分别锁定，不放宽。

   分段：
     A 静态契约（分层 DOM / 五组 / 开关 / 三态样式 / i18n / 降级）
     B 收起态几何（默认态）
     C 悬停展开与延时收回（含不遮正文、防抖）
     D 一键收起 / 还原 / 持久化 / 极简态悬停临时展开
     E 分组归属与排序 + 空行间距 + 恒一列
     F 收起态点图标：14 个代理仍真生效（回写顶栏原控件）
     G CR-06 胶囊两态兼容（fixed / 精确落位 / 多选 / pin 态无脏值）
     H 无障碍与键盘（title / aria-label / aria-pressed / aria-expanded / Tab 展开）
     I 三主题 + 柔光 + 英文 + 窄屏 + 打印降级 + 全程零 JS 错误

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-cr08.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1.2 : tol);

const PROXIES = [
  'layoutSel', 'layoutSel', 'btnFontDown', 'btnFontUp',
  'lhSel', 'lhSel', 'lhSel', 'lhSel', 'btnPaperMatte',
  'btnChartAuto', 'btnFlowAll', 'skinLight', 'skinDark', 'skinSepia'
];
const GROUPS = ['layout', 'font', 'lh', 'toggle', 'theme'];

/* 菜单全量快照：几何 + 三态 class + 分组 + 文字可见性 + 代理状态 */
const SNAP = () => {
  const h = document.getElementById('focusRender');
  if (!h) return null;
  const r = h.getBoundingClientRect();
  const cs = getComputedStyle(h);
  const inner = document.querySelector('.reader-inner').getBoundingClientRect();
  const btns = [...h.querySelectorAll('[data-proxy]')];
  const groups = [...h.querySelectorAll('.fr-group')];
  const seps = [...h.querySelectorAll('.fr-sep')];
  const tg = document.getElementById('frToggle');
  const vis = el => {
    if (!el) return null;
    const c = getComputedStyle(el), b = el.getBoundingClientRect();
    return { w: +b.width.toFixed(2), op: +c.opacity, disp: c.display };
  };
  /* 组内间距 vs 组间间距：取第一组内相邻两钮的垂直间隙，与第一组末钮到第二组首钮的间隙 */
  const gapIn = (() => {
    const g = groups[0]; if (!g) return null;
    const bs = [...g.querySelectorAll('[data-proxy]')];
    if (bs.length < 2) return null;
    return +(bs[1].getBoundingClientRect().top - bs[0].getBoundingClientRect().bottom).toFixed(2);
  })();
  const gapBetween = (() => {
    if (groups.length < 2) return null;
    const a = [...groups[0].querySelectorAll('[data-proxy]')].pop();
    const b = groups[1].querySelector('[data-proxy]');
    if (!a || !b) return null;
    return +(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom).toFixed(2);
  })();
  return {
    cls: h.className,
    min: h.classList.contains('fr-min'),
    open: h.classList.contains('fr-open'),
    disp: cs.display, pos: cs.position, dir: cs.flexDirection,
    w: +r.width.toFixed(2), l: +r.left.toFixed(2), r: +r.right.toFixed(2),
    t: +r.top.toFixed(2), b: +r.bottom.toFixed(2), h: +r.height.toFixed(2),
    innerL: +inner.left.toFixed(2),
    count: btns.length,
    ids: btns.map(x => x.getAttribute('data-proxy')),
    idVals: btns.map(x => x.getAttribute('data-proxy') + (x.getAttribute('data-val') ? ':' + x.getAttribute('data-val') : '')),
    on: btns.map(x => x.classList.contains('on')),
    texts: btns.map(x => x.textContent.trim()),
    btnVisible: btns.filter(x => x.getBoundingClientRect().width > 0).length,
    groupNames: groups.map(g => g.getAttribute('data-fr-group')),
    groupSizes: groups.map(g => g.querySelectorAll('[data-proxy]').length),
    groupDir: groups.map(g => getComputedStyle(g).flexDirection),
    sepCount: seps.length,
    gapIn, gapBetween,
    icoVis: vis(h.querySelector('[data-proxy] .fr-ico')),
    labelVis: vis(h.querySelector('[data-proxy="btnPaperMatte"] .fr-label')),
    toggle: tg ? {
      exists: true, w: +tg.getBoundingClientRect().width.toFixed(2),
      h: +tg.getBoundingClientRect().height.toFixed(2),
      expanded: tg.getAttribute('aria-expanded'), title: tg.getAttribute('title'),
      label: (tg.querySelector('.fr-label') || {}).textContent || '',
      hasProxy: tg.hasAttribute('data-proxy')
    } : { exists: false },
    groupsDisp: (() => { const g = document.getElementById('frGroups'); return g ? getComputedStyle(g).display : null; })(),
    toastBottom: getComputedStyle(document.getElementById('toast')).bottom,
    pill: (() => {
      const p = h.querySelector(':scope > .lp-pill');
      if (!p) return null;
      const pr = p.getBoundingClientRect();
      return { on: p.classList.contains('on'), w: +pr.width.toFixed(2), h: +pr.height.toFixed(2), radius: getComputedStyle(p).borderRadius };
    })(),
    last: h.__lpLast ? (h.__lpLast.dataset.proxy + ':' + (h.__lpLast.dataset.val || '')) : null
  };
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
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
  await p.waitForTimeout(2200);

  /* 鼠标停到正文中央，避免任何悬停态污染基线 */
  const parkMouse = async () => { await p.mouse.move(900, 500); await p.waitForTimeout(420); };
  const enterFocus = async () => {
    const inF = await p.evaluate(() => document.getElementById('app').classList.contains('focus'));
    if (!inF) { await p.keyboard.press('Control+o'); await p.waitForTimeout(500); }
    await parkMouse();
  };
  const exitFocus = async () => {
    const inF = await p.evaluate(() => document.getElementById('app').classList.contains('focus'));
    if (inF) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
  };
  const snap = () => p.evaluate(SNAP);
  const hoverMenu = async () => {
    const r = await p.evaluate(() => {
      const b = document.getElementById('focusRender').getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await p.mouse.move(r.x, r.y);
    await p.waitForTimeout(320);
  };

  /* ================= A. 静态契约 ================= */
  console.log('\n[A] 静态产物契约');
  ok('dist 含 CR-2026-11-16-08 标记', has('CR-2026-11-16-08'));
  ok('dist 含 #frToggle 开关', has('id="frToggle"'));
  ok('开关不带 data-proxy（不进 14 代理集合）',
    /<button class="fr-toggle" id="frToggle"(?![^>]*data-proxy)/.test(HTML));
  ok('dist 含分组外壳 #frGroups', has('id="frGroups"'));
  ok('dist 含五个 .fr-group 语义标记',
    GROUPS.every(g => has('data-fr-group="' + g + '"')));
  ok('dist 含图标层 .fr-ico 样式', has('.fr-ico{flex:0 0 auto'));
  ok('dist 含文字层 .fr-label 收起态零宽透明', has('.fr-label{flex:0 0 auto;max-width:0;opacity:0'));
  ok('dist 含展开态文字淡入', has('.focus-render.fr-open .fr-label{max-width:96px;opacity:1'));
  ok('dist 含收起态基线宽 40px', has('max-height:calc(100vh - 28px);width:40px'));
  ok('dist 含展开态宽 132px', has('.focus-render.fr-open{width:132px'));
  ok('dist 含极简态 .fr-min 隐藏分组', has('.focus-render.fr-min .fr-groups{display:none}'));
  ok('dist 含极简态悬停临时展开', has('.focus-render.fr-min.fr-open .fr-groups{display:flex}'));
  ok('dist 含空行加宽留白', has('.fr-sep{width:auto;height:1px;background:var(--border-2);margin:6px 3px'));
  ok('dist 含窄屏收起态 36px', has('.focus-render{width:36px;padding:5px 3px;left:8px}'));
  ok('dist 含 frSetOpen / frSetMin / frScheduleClose',
    has('function frSetOpen(') && has('function frSetMin(') && has('function frScheduleClose('));
  ok('dist 含 pointerenter / pointerleave 悬停展开',
    has("focusRender.addEventListener('pointerenter'") && has("focusRender.addEventListener('pointerleave'"));
  ok('dist 含 focusin / focusout 键盘展开',
    has("focusRender.addEventListener('focusin'") && has("focusRender.addEventListener('focusout'"));
  ok('dist 含 frMin 偏好持久化', has("save('frMin'") && has("load('frMin', '0')"));
  ok('dist 含胶囊 pin 态跳过（防 0 尺寸脏值）',
    has("host.id === 'focusRender' && host.classList.contains('fr-min')"));
  ok('i18n 新增收起 / 展开词条',
    has("'收起菜单': 'Collapse menu'") && has("'展开菜单': 'Expand menu'") &&
    has("'收起菜单（只留一枚图标）': 'Collapse menu (icon only)'"));
  ok('reduced-motion 下文字不做过渡', has('.fr-label{transition:none}'));
  /* 历史静态字符串一条不改 */
  ok('历史：侧边定位规则原样保留',
    has('.focus-render{position:fixed;left:14px;top:50%;transform:translateY(-50%)'));
  ok('历史：正文让位规则原样保留',
    has('#app.focus .reader-inner{margin-left:112px;margin-right:12px;width:calc(100% - 124px)}'));
  ok('历史：#app.focus .focus-render{display:flex} 保留', has('#app.focus .focus-render{display:flex}'));
  ok('历史：胶囊 fixed 兜底保留', has('#focusRender.lp-host{position:fixed}'));
  ok('历史：打印隐藏 focus-render 保留', has('.focus-render,.focus-exit,.focus-bar'));
  ok('历史：窄屏正文让位保留', has('#app.focus .reader-inner{margin-left:62px;margin-right:8px;width:calc(100% - 70px)}'));

  /* ================= B. 收起态几何（默认态） ================= */
  console.log('\n[B] 收起态几何（进入专注的默认态）');
  await enterFocus();
  let s = await snap();
  ok('进入专注即显示菜单', s.disp === 'flex', s.disp);
  ok('默认是收起态（无 .fr-open / .fr-min）', s.open === false && s.min === false, s.cls);
  ok('收起态宽 40px', near(s.w, 40, 0.6), s.w);
  ok('收起态右缘 < 120（历史硬约束，比原 100 更严）', s.r < 120, s.r);
  ok('收起态完整落在视口内', s.l >= 0 && s.t >= 0 && s.r <= 1400 && s.b <= 900, [s.l, s.t, s.r, s.b]);
  ok('恒一列（flex-direction:column）', s.dir === 'column', s.dir);
  ok('position:fixed 未被打回文档流', s.pos === 'fixed', s.pos);
  ok('正文让位：innerL >= 菜单右缘（历史硬约束）', s.innerL >= s.r - 1, [s.innerL, s.r]);
  ok('toast 仍在底部 44px（历史硬约束）', s.toastBottom === '44px', s.toastBottom);
  ok('14 个代理一个不少', s.count === 14, s.count);
  ok('代理顺序与历史精确一致', eq(s.ids, PROXIES), s.ids);
  ok('14 个代理在收起态全部可见（纯图标）', s.btnVisible === 14, s.btnVisible);
  ok('图标层可见（宽 20 不透明）', s.icoVis && near(s.icoVis.w, 20, 0.6) && s.icoVis.op === 1, s.icoVis);
  ok('伪元素图标也可见（行高/开关/主题三组，宽 20）',
    await p.evaluate(() => ['lhSel', 'btnPaperMatte', 'skinLight'].every(id => {
      const el = document.querySelector('#focusRender [data-proxy="' + id + '"]');
      const cs = getComputedStyle(el, '::before');
      return cs.content !== 'none' && Math.abs(parseFloat(cs.width) - 20) < 1;
    })));
  ok('文字层视觉隐藏（宽 0 + opacity 0）',
    s.labelVis && s.labelVis.w === 0 && s.labelVis.op === 0, s.labelVis);
  ok('文字仍在 DOM（柔光文案未删；图标走 ::before 不进 textContent）', s.texts[8] === '柔光', s.texts);
  ok('行高四档 textContent 是纯文字（图标走 ::before，历史契约）',
    eq(s.texts.slice(4, 8), ['紧凑', '标准', '舒适', '宽松']), s.texts.slice(4, 8));
  ok('开关钮存在且不带 data-proxy', s.toggle.exists === true && s.toggle.hasProxy === false, s.toggle);
  ok('开关初始 aria-expanded=true（菜单是展开可用的）', s.toggle.expanded === 'true', s.toggle);
  ok('菜单不在 #content 内（不污染导出）',
    await p.evaluate(() => !document.getElementById('content').contains(document.getElementById('focusRender'))));

  /* ================= C. 悬停展开 / 延时收回 ================= */
  console.log('\n[C] 鼠标移入自动展开 / 移出延时收回');
  await hoverMenu();
  let o = await snap();
  ok('移入 → .fr-open', o.open === true, o.cls);
  ok('展开态宽 132px（英文最长词 Comfortable 不截断）', near(o.w, 132, 0.6), o.w);
  ok('展开态文字可见（opacity 1 且宽 > 0）',
    o.labelVis && o.labelVis.op === 1 && o.labelVis.w > 0, o.labelVis);
  ok('展开态仍一列', o.dir === 'column', o.dir);
  ok('展开态仍 fixed', o.pos === 'fixed', o.pos);
  ok('展开态完整在视口内', o.l >= 0 && o.t >= 0 && o.r <= 1400 && o.b <= 900, [o.l, o.t, o.r, o.b]);
  ok('展开态不遮正文：右缘 <= 正文左缘（新增硬约束）', o.r <= o.innerL + 1, [o.r, o.innerL]);
  ok('展开态正文二次让位 +58px（浮层变宽同步右移，不遮字）', near(o.innerL, s.innerL + 58, 0.6), [s.innerL, o.innerL]);
  ok('展开态菜单右缘与正文左缘留 ≥16px 呼吸位（不贴纸面）', o.innerL - o.r >= 16, [o.r, o.innerL]);
  ok('展开态 14 代理仍全在', o.count === 14 && o.btnVisible === 14, [o.count, o.btnVisible]);
  ok('展开态 toast 不动', o.toastBottom === '44px', o.toastBottom);

  /* 移出 → 延时收回（260ms） */
  await p.mouse.move(900, 500);
  await p.waitForTimeout(120);
  const mid = await snap();
  ok('移出 120ms 内仍展开（防抖窗口未过）', mid.open === true, mid.cls);
  await p.waitForTimeout(400);
  const back = await snap();
  ok('移出 520ms 后自动收回', back.open === false, back.cls);
  ok('收回后宽度回到 40px', near(back.w, 40, 0.6), back.w);
  ok('收回后文字重新隐藏', back.labelVis && back.labelVis.w === 0 && back.labelVis.op === 0, back.labelVis);

  /* 防抖：延时窗口内重新进入应取消收回 */
  await hoverMenu();
  await p.mouse.move(900, 500);
  await p.waitForTimeout(120);
  await hoverMenu();
  await p.waitForTimeout(400);
  const re = await snap();
  ok('延时窗口内重新进入 → 不收回（无抖动）', re.open === true, re.cls);
  await parkMouse();

  /* ================= D. 一键收起 / 还原 / 持久化 ================= */
  console.log('\n[D] 一键收起（#frToggle）与偏好持久化');
  await p.click('#frToggle');
  await p.waitForTimeout(400);
  /* 点击后鼠标仍在开关上 → 会触发悬停展开，先移开再量纯 pin 态 */
  await parkMouse();
  let m = await snap();
  ok('点开关 → .fr-min', m.min === true, m.cls);
  ok('pin 态分组外壳隐藏', m.groupsDisp === 'none', m.groupsDisp);
  ok('pin 态 14 个代理全部不可见', m.btnVisible === 0, m.btnVisible);
  ok('pin 态代理仍在 DOM（14 个，未删）', m.count === 14, m.count);
  ok('pin 态只剩开关钮（高度 < 60px）', m.h < 60, m.h);
  ok('pin 态宽度仍 40px', near(m.w, 40, 0.6), m.w);
  ok('pin 态开关 aria-expanded=false', m.toggle.expanded === 'false', m.toggle);
  ok('pin 态开关文案改为「展开菜单」', m.toggle.label === '展开菜单', m.toggle.label);
  ok('pin 态开关 title 改为「展开菜单」', m.toggle.title === '展开菜单', m.toggle.title);
  ok('pin 态偏好已写 localStorage',
    await p.evaluate(() => localStorage.getItem('mdreader.frMin')) === '1');
  ok('pin 态正文让位不变', near(m.innerL, s.innerL, 0.6), [s.innerL, m.innerL]);
  ok('pin 态胶囊不产生 0 尺寸脏值', m.pill && m.pill.on === false, m.pill);

  /* pin 态悬停 → 临时展开 */
  await hoverMenu();
  const mo = await snap();
  ok('pin 态悬停 → 临时展开（.fr-min.fr-open）', mo.min === true && mo.open === true, mo.cls);
  ok('pin 态展开后 14 代理重新可见', mo.btnVisible === 14, mo.btnVisible);
  ok('pin 态展开宽 132px', near(mo.w, 132, 0.6), mo.w);
  ok('pin 态展开不遮正文', mo.r <= mo.innerL + 1, [mo.r, mo.innerL]);
  await parkMouse();
  const mb = await snap();
  ok('pin 态移出 → 收回成一颗钮', mb.min === true && mb.open === false && mb.btnVisible === 0, mb.cls);

  /* 再点开关 → 还原 */
  await p.click('#frToggle');
  await p.waitForTimeout(400);
  await parkMouse();
  const rs = await snap();
  ok('再点开关 → 还原收起态', rs.min === false && rs.open === false, rs.cls);
  ok('还原后 14 代理可见', rs.btnVisible === 14, rs.btnVisible);
  ok('还原后 aria-expanded=true', rs.toggle.expanded === 'true', rs.toggle);
  ok('还原后文案回到「收起菜单」', rs.toggle.label === '收起菜单', rs.toggle.label);
  ok('还原后偏好写回 0',
    await p.evaluate(() => localStorage.getItem('mdreader.frMin')) === '0');

  /* 持久化：置 1 后刷新，进专注仍是 pin 态 */
  await p.click('#frToggle');
  await p.waitForTimeout(300);
  await exitFocus();
  await p.reload();
  await p.waitForTimeout(1600);
  await p.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await p.waitForTimeout(2200);
  await enterFocus();
  const persisted = await snap();
  ok('刷新后「一键收起」偏好保持', persisted.min === true, persisted.cls);
  ok('刷新后 pin 态只剩开关', persisted.btnVisible === 0, persisted.btnVisible);
  /* 还原，后续段落在正常收起态下跑 */
  await p.click('#frToggle');
  await p.waitForTimeout(350);
  await parkMouse();
  ok('还原成功（为后续段落准备）', (await snap()).min === false);

  /* ================= E. 分组归属 / 排序 / 空行 / 一列 ================= */
  console.log('\n[E] 同类合并排序 + 适当空行 + 恒一列');
  let g = await snap();
  ok('五组同类分组', eq(g.groupNames, GROUPS), g.groupNames);
  ok('组内成员数 2/2/4/3/3', eq(g.groupSizes, [2, 2, 4, 3, 3]), g.groupSizes);
  ok('每组内部也是竖排一列', g.groupDir.every(d => d === 'column'), g.groupDir);
  ok('四条空行分隔（五组之间）', g.sepCount === 4, g.sepCount);
  ok('组内序固定：排版 → 字号 → 行高 → 开关 → 主题',
    eq(g.idVals, [
      'layoutSel:card', 'layoutSel:paper', 'btnFontDown', 'btnFontUp',
      'lhSel:compact', 'lhSel:standard', 'lhSel:comfort', 'lhSel:loose',
      'btnPaperMatte', 'btnChartAuto', 'btnFlowAll', 'skinLight', 'skinDark', 'skinSepia'
    ]), g.idVals);
  ok('组间空行间距 > 组内间距（适当空行）',
    g.gapBetween !== null && g.gapIn !== null && g.gapBetween > g.gapIn + 6,
    { gapIn: g.gapIn, gapBetween: g.gapBetween });
  ok('组内密排间距 = 3px', near(g.gapIn, 3, 0.6), g.gapIn);
  ok('组间空行间距 ≈ 19px', near(g.gapBetween, 19, 1.5), g.gapBetween);
  /* 展开态同样一列、同样分组 */
  await hoverMenu();
  const go = await snap();
  ok('展开态仍五组同序', eq(go.groupNames, GROUPS) && eq(go.groupSizes, [2, 2, 4, 3, 3]), go.groupNames);
  ok('展开态仍一列', go.dir === 'column' && go.groupDir.every(d => d === 'column'), go.dir);
  ok('展开态组间空行仍大于组内', go.gapBetween > go.gapIn + 6, [go.gapIn, go.gapBetween]);
  ok('展开态所有按钮左缘对齐（真一列，不换行）',
    await p.evaluate(() => {
      const xs = [...document.querySelectorAll('#focusRender [data-proxy]')]
        .map(x => +x.getBoundingClientRect().left.toFixed(1));
      return new Set(xs).size === 1;
    }));
  ok('收起态所有按钮左缘对齐（真一列）',
    await (async () => { await parkMouse(); return p.evaluate(() => {
      const xs = [...document.querySelectorAll('#focusRender [data-proxy]')]
        .map(x => +x.getBoundingClientRect().left.toFixed(1));
      return new Set(xs).size === 1;
    }); })());

  /* ================= F. 收起态点图标：代理仍真生效 ================= */
  console.log('\n[F] 收起态纯图标点击 → 14 个代理真生效');
  await parkMouse();
  const clickProxy = async (sel) => {
    /* 用 DOM click 而非鼠标点击：避免鼠标移入触发展开，
       专测「收起态纯图标」这条路（真实用户点图标也是同一条 handler） */
    await p.evaluate(x => document.querySelector(x).click(), sel);
    await p.waitForTimeout(420);
    await parkMouse();
  };
  await clickProxy('.fr-btn[data-proxy="layoutSel"][data-val="paper"]');
  let f = await snap();
  ok('图标「纸张」→ layoutSel=paper',
    await p.evaluate(() => document.getElementById('layoutSel').value) === 'paper');
  ok('图标「纸张」→ html data-layout=paper',
    await p.evaluate(() => document.documentElement.dataset.layout) === 'paper');
  ok('图标「纸张」呈 .on，「卡片」回落', f.on[1] === true && f.on[0] === false, f.on);
  await clickProxy('.fr-btn[data-proxy="layoutSel"][data-val="card"]');
  f = await snap();
  ok('图标「卡片」→ 回 card 且 .on 互换', f.on[0] === true && f.on[1] === false, f.on);

  const fsBefore = await p.evaluate(() => parseInt(document.getElementById('content').style.getPropertyValue('--fs'), 10));
  await clickProxy('.fr-btn[data-proxy="btnFontUp"]');
  const fsUp = await p.evaluate(() => parseInt(document.getElementById('content').style.getPropertyValue('--fs'), 10));
  ok('图标「A+」字号 +1', fsUp === fsBefore + 1, [fsBefore, fsUp]);
  await clickProxy('.fr-btn[data-proxy="btnFontDown"]');
  const fsDn = await p.evaluate(() => parseInt(document.getElementById('content').style.getPropertyValue('--fs'), 10));
  ok('图标「A−」字号回落', fsDn === fsBefore, [fsBefore, fsDn]);

  await clickProxy('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
  let lh = await p.evaluate(() => ({
    lh: document.getElementById('content').style.getPropertyValue('--lh'),
    sel: document.getElementById('lhSel').value
  }));
  ok('图标「宽松」→ --lh=2.3 且顶栏同步', lh.lh === '2.3' && lh.sel === 'loose', lh);
  ok('图标「宽松」呈 .on（第 8 项）', (await snap()).on[7] === true);
  await clickProxy('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  ok('图标「标准」→ --lh 回落 1.78',
    await p.evaluate(() => document.getElementById('content').style.getPropertyValue('--lh')) === '1.78');

  await clickProxy('.fr-btn[data-proxy="btnChartAuto"]');
  f = await snap();
  ok('图标「数据图表」→ 原开关 aria-checked=true',
    await p.evaluate(() => document.getElementById('btnChartAuto').getAttribute('aria-checked')) === 'true');
  ok('图标「数据图表」呈 .on', f.on[9] === true, f.on);
  await clickProxy('.fr-btn[data-proxy="btnFlowAll"]');
  f = await snap();
  ok('图标「流程图」→ 原开关 aria-checked=true',
    await p.evaluate(() => document.getElementById('btnFlowAll').getAttribute('aria-checked')) === 'true');
  ok('图标「流程图」呈 .on', f.on[10] === true, f.on);
  await clickProxy('.fr-btn[data-proxy="btnPaperMatte"]');
  f = await snap();
  ok('图标「柔光」→ data-pm=on',
    await p.evaluate(() => document.documentElement.getAttribute('data-pm')) === 'on');
  ok('图标「柔光」呈 .on', f.on[8] === true, f.on);
  ok('柔光代理只切换、未误开参数面板',
    await p.evaluate(() => document.getElementById('pmPop').hasAttribute('hidden')) === true);
  await clickProxy('.fr-btn[data-proxy="btnPaperMatte"]');
  ok('图标「柔光」再点 → 关闭（纯状态开关语义）',
    await p.evaluate(() => document.documentElement.getAttribute('data-pm')) === null);

  await clickProxy('.fr-btn[data-proxy="skinDark"]');
  f = await snap();
  ok('图标「深色」→ data-theme=dark',
    await p.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  ok('图标「深色」呈 .on，「浅色」回落', f.on[12] === true && f.on[11] === false, f.on);
  ok('换肤后仍在专注模式且菜单仍显示',
    f.disp === 'flex' && await p.evaluate(() => document.getElementById('app').classList.contains('focus')));
  await clickProxy('.fr-btn[data-proxy="skinLight"]');
  ok('图标「浅色」→ 回 light',
    await p.evaluate(() => document.documentElement.dataset.theme) === 'light');

  /* F2：从顶栏 / 设置面板切总开关，菜单高亮必须同步（单一数据源闭环）。
     这是 CR-08 修掉的既有缺陷：syncToggles 原先只写顶栏 aria-checked，
     不通知侧边菜单，导致顶栏开了图表/流程图而菜单图标不亮。 */
  console.log('\n[F2] 顶栏 / 设置面板切开关 → 菜单高亮同步');
  const topSwitch = async (id, want) => {
    await p.evaluate(([x, w]) => {
      const el = document.getElementById(x);
      const cur = el.getAttribute('aria-checked') === 'true';
      if (cur !== w) el.click();
    }, [id, want]);
    await p.waitForTimeout(650);
    await parkMouse();
  };
  await topSwitch('btnChartAuto', false);
  let sy = await snap();
  ok('顶栏关图表 → 菜单图标回落未 .on', sy.on[9] === false, sy.on);
  await topSwitch('btnChartAuto', true);
  sy = await snap();
  ok('顶栏开图表 → 菜单图标同步 .on（修复既有滞后）', sy.on[9] === true, sy.on);
  await topSwitch('btnFlowAll', false);
  sy = await snap();
  ok('顶栏关流程图 → 菜单图标回落未 .on', sy.on[10] === false, sy.on);
  await topSwitch('btnFlowAll', true);
  sy = await snap();
  ok('顶栏开流程图 → 菜单图标同步 .on（修复既有滞后）', sy.on[10] === true, sy.on);
  /* #btnPaperMatte 是复合控件：点 .sw-track 才是双态切换，点文字只开不关。
     所以柔光走纯状态开关 #setPm（与 test-cr07 同口径），避免误开参数面板。 */
  const setPM = async want => {
    await p.evaluate(w => {
      const cur = document.documentElement.getAttribute('data-pm') === 'on';
      if (cur !== w) document.getElementById('setPm').click();
    }, want);
    await p.waitForTimeout(850); await parkMouse();
  };
  await setPM(true);
  sy = await snap();
  ok('顶栏开柔光 → 菜单图标同步 .on', sy.on[8] === true, sy.on);
  ok('柔光同步未误开参数面板', await p.evaluate(() => document.getElementById('pmPop').hasAttribute('hidden')) === true);
  await setPM(false);
  sy = await snap();
  ok('顶栏关柔光 → 菜单图标回落未 .on', sy.on[8] === false, sy.on);
  /* 设置面板里的纯状态开关 #setPm 同样要同步 */
  await p.evaluate(() => { if (document.documentElement.getAttribute('data-pm') !== 'on') document.getElementById('setPm').click(); });
  await p.waitForTimeout(800); await parkMouse();
  ok('设置面板开柔光 → 菜单图标同步 .on', (await snap()).on[8] === true);
  await p.evaluate(() => { if (document.documentElement.getAttribute('data-pm') === 'on') document.getElementById('setPm').click(); });
  await p.waitForTimeout(800); await parkMouse();
  ok('设置面板关柔光 → 菜单图标回落', (await snap()).on[8] === false);
  /* 设置面板改行高 / 排版也要同步 */
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'comfort'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(600); await parkMouse();
  sy = await snap();
  ok('顶栏下拉改行高 → 菜单对应档 .on', sy.on[6] === true && sy.on[5] === false, sy.on);
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'standard'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(600); await parkMouse();
  ok('行高改回标准 → 菜单 .on 复位', (await snap()).on[5] === true);

  /* F3：主题 / 排版的全路径同步（CR-08 修掉的另两个既有缺陷）。
     setTheme 原先只写顶栏 .active + aria-pressed，applyLayout 原先只回写
     #layoutSel.value，两者都不通知菜单 —— 实测切到深色后菜单仍高亮「浅色」、
     从兼容桥切纸张后菜单仍高亮「卡片」。这里按「数据源真值 vs 菜单实际态」
     逐项比对，覆盖顶栏 / 兼容桥 / 设置面板三条外部路径，防止再退回。 */
  console.log('\n[F3] 主题 / 排版全路径 → 菜单高亮同步');
  const audit = () => p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#focusRender [data-proxy]').forEach(b => {
      const id = b.getAttribute('data-proxy');
      const src = document.getElementById(id);
      if (!src) { out.push({ id: id, want: null, got: null, ok: false }); return; }
      let want = false;
      if (src.tagName === 'SELECT') want = (b.getAttribute('data-val') === src.value);
      else if (src.getAttribute('role') === 'switch') want = src.getAttribute('aria-checked') === 'true';
      else if (src.classList.contains('skin-btn')) want = src.getAttribute('aria-pressed') === 'true';
      else want = src.classList.contains('on');
      const got = b.classList.contains('on');
      out.push({ id: id + (b.getAttribute('data-val') ? ':' + b.getAttribute('data-val') : ''),
        want: want, got: got, ok: want === got,
        aria: b.getAttribute('aria-pressed') === (got ? 'true' : 'false') });
    });
    return out;
  });
  const auditOk = async label => {
    const a = await audit();
    const bad = a.filter(x => !x.ok);
    ok(label + '（14 项 .on 与数据源逐项一致）', bad.length === 0 && a.length === 14,
      bad.length ? bad : a.length);
    ok(label + '（aria-pressed 与 .on 同步）', a.every(x => x.aria), a.filter(x => !x.aria));
    return a;
  };
  const extClick = async id => {
    await p.evaluate(x => document.getElementById(x).click(), id);
    await p.waitForTimeout(850); await parkMouse();
  };
  const extSelect = async (id, v) => {
    await p.evaluate(([x, y]) => {
      const s = document.getElementById(x); s.value = y; s.dispatchEvent(new Event('change'));
    }, [id, v]);
    await p.waitForTimeout(850); await parkMouse();
  };
  await extClick('skinDark');
  sy = await snap();
  ok('顶栏切深色 → 菜单「深色」图标点亮（修复既有滞后）', sy.on[12] === true, sy.on);
  ok('顶栏切深色 → 菜单「浅色」回落', sy.on[11] === false, sy.on);
  await auditOk('顶栏切深色');
  await extClick('skinSepia');
  sy = await snap();
  ok('顶栏切护眼 → 菜单「护眼」图标点亮', sy.on[13] === true, sy.on);
  ok('顶栏切护眼 → 「深色」回落（主题互斥）', sy.on[12] === false, sy.on);
  await auditOk('顶栏切护眼');
  await extSelect('themeSel', 'light');
  sy = await snap();
  ok('兼容桥 themeSel 切浅色 → 菜单「浅色」点亮', sy.on[11] === true, sy.on);
  await auditOk('兼容桥切浅色');
  await extSelect('layoutSel', 'paper');
  sy = await snap();
  ok('兼容桥 layoutSel 切纸张 → 菜单「纸张」点亮（修复既有滞后）', sy.on[1] === true, sy.on);
  ok('兼容桥切纸张 → 「卡片」回落（排版互斥）', sy.on[0] === false, sy.on);
  await auditOk('兼容桥切纸张');
  await p.evaluate(() => {
    const b = document.querySelector('#setLayout button[data-layout="card"]'); if (b) b.click();
  });
  await p.waitForTimeout(850); await parkMouse();
  sy = await snap();
  ok('设置面板切卡片 → 菜单「卡片」点亮', sy.on[0] === true, sy.on);
  await auditOk('设置面板切卡片');
  /* 图标态自身点击后，也要与数据源一致（双向闭环，不只是单向回读） */
  await clickProxy('.fr-btn[data-proxy="skinDark"]');
  await auditOk('菜单点深色图标');
  await clickProxy('.fr-btn[data-proxy="layoutSel"][data-val="paper"]');
  await auditOk('菜单点纸张图标');
  await clickProxy('.fr-btn[data-proxy="skinLight"]');
  await clickProxy('.fr-btn[data-proxy="layoutSel"][data-val="card"]');
  await auditOk('还原浅色 + 卡片');

  /* ================= G. CR-06 胶囊两态兼容 ================= */
  console.log('\n[G] CR-06 液态胶囊：收起 / 展开 / pin 三态');
  await parkMouse();
  let c0 = await snap();
  ok('收起态胶囊存在且可见', c0.pill && c0.pill.on === true, c0.pill);
  ok('收起态胶囊圆角 9px（历史）', c0.pill.radius === '9px', c0.pill);
  ok('收起态仍 fixed（胶囊没打回文档流）', c0.pos === 'fixed', c0.pos);
  ok('收起态多选 ≥2 项点亮（历史）', c0.on.filter(Boolean).length >= 2, c0.on);
  ok('收起态其余选中项保留兜底底色（历史）',
    await p.evaluate(() => [...document.querySelectorAll('#focusRender .fr-btn.on')]
      .some(x => getComputedStyle(x).backgroundColor !== 'rgba(0, 0, 0, 0)')));
  ok('多选宿主不做 lp-ready 透明化（历史）',
    await p.evaluate(() => !document.getElementById('focusRender').classList.contains('lp-ready')));
  const pillFit = async (sel) => p.evaluate(x => {
    const h = document.getElementById('focusRender');
    const pill = h.querySelector(':scope > .lp-pill'), on = h.querySelector(x);
    if (!pill || !on) return null;
    const pr = pill.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dx: +(pr.left - or.left).toFixed(1), dy: +(pr.top - or.top).toFixed(1),
      dw: +(pr.width - or.width).toFixed(1), dh: +(pr.height - or.height).toFixed(1),
      last: h.__lpLast ? h.__lpLast.dataset.val : null };
  }, sel);
  await clickProxy('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
  await p.waitForTimeout(700);
  let fit = await pillFit('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
  ok('收起态胶囊精确落在「紧凑」（分组外壳未漏算偏移）',
    fit && near(fit.dx, 0) && near(fit.dy, 0) && near(fit.dw, 0) && near(fit.dh, 0), fit);
  ok('胶囊只跟最后变化项 __lpLast=compact（历史）', fit && fit.last === 'compact', fit);
  ok('代理回写真生效 --lh=1.5（历史）',
    await p.evaluate(() => document.getElementById('content').style.getPropertyValue('--lh')) === '1.5');

  /* 展开态胶囊同样精确 */
  await hoverMenu();
  await p.waitForTimeout(600);
  fit = await pillFit('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
  ok('展开态胶囊精确落位（宽度切换后已重量）',
    fit && near(fit.dx, 0) && near(fit.dy, 0) && near(fit.dw, 0) && near(fit.dh, 0), fit);
  ok('展开态胶囊宽度跟随按钮变宽（> 收起态 28px）',
    await p.evaluate(() => document.querySelector('#focusRender > .lp-pill').getBoundingClientRect().width) > 40);
  await parkMouse();
  await p.waitForTimeout(600);
  fit = await pillFit('.fr-btn[data-proxy="lhSel"][data-val="compact"]');
  ok('收回后胶囊重新精确落位（无残留展开宽度）',
    fit && near(fit.dx, 0) && near(fit.dy, 0) && near(fit.dw, 0) && near(fit.dh, 0), fit);

  /* 纵向拉伸（历史动效契约） */
  await p.evaluate(() => document.querySelector('.fr-btn[data-proxy="lhSel"][data-val="loose"]').click());
  await p.waitForTimeout(70);
  const stretch = await p.evaluate(() => {
    const pill = document.querySelector('#focusRender > .lp-pill');
    return { stretch: pill.classList.contains('stretch'),
      sy: +pill.style.getPropertyValue('--lp-sy'), sx: +pill.style.getPropertyValue('--lp-sx'),
      oy: pill.style.getPropertyValue('--lp-oy'), ox: pill.style.getPropertyValue('--lp-ox') };
  });
  ok('纵向移动 → 沿 Y 拉长 sy>1.2（历史）', stretch.stretch === true && stretch.sy > 1.2, stretch);
  ok('纵向拉伸上限 ≤1.34（历史）', stretch.sy <= 1.341, stretch.sy);
  ok('横向同步收窄 0.8<sx<1（历史）', stretch.sx < 1 && stretch.sx > 0.8, stretch);
  ok('向下移动 → 原点 oy=0% ox=50%（历史）', stretch.oy === '0%' && stretch.ox === '50%', stretch);
  await p.waitForTimeout(750);
  fit = await pillFit('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
  ok('纵向到位后回弹归 1 且精确落位（历史）',
    await p.evaluate(() => {
      const pill = document.querySelector('#focusRender > .lp-pill');
      return !pill.classList.contains('stretch') && +pill.style.getPropertyValue('--lp-sy') === 1;
    }) && fit && near(fit.dy, 0) && near(fit.dh, 0), fit);
  await clickProxy('.fr-btn[data-proxy="lhSel"][data-val="standard"]');

  /* pin 态胶囊：不脏值，还原后复位 */
  await p.click('#frToggle');
  await p.waitForTimeout(400);
  await parkMouse();
  const cp = await snap();
  ok('pin 态胶囊隐藏（不显示 0 尺寸脏块）', cp.pill && cp.pill.on === false, cp.pill);
  await p.click('#frToggle');
  await p.waitForTimeout(600);
  await parkMouse();
  fit = await pillFit('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  ok('还原后胶囊精确落回当前项',
    fit && near(fit.dx, 0) && near(fit.dy, 0) && near(fit.dw, 0) && near(fit.dh, 0), fit);

  /* ================= H. 无障碍与键盘 ================= */
  console.log('\n[H] 无障碍与键盘可达');
  const a11y = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#focusRender [data-proxy]')];
    return {
      titles: btns.map(x => x.getAttribute('title')),
      labels: btns.map(x => x.getAttribute('aria-label')),
      pressed: btns.map(x => x.getAttribute('aria-pressed')),
      icoHidden: btns.every(x => { const i = x.querySelector('.fr-ico'); return !i || i.getAttribute('aria-hidden') === 'true'; }),
      role: document.getElementById('focusRender').getAttribute('role'),
      ariaLabel: document.getElementById('focusRender').getAttribute('aria-label'),
      controls: document.getElementById('frToggle').getAttribute('aria-controls')
    };
  });
  ok('14 个代理都有 title 提示（图标态可读）', a11y.titles.every(x => x && x.length > 0), a11y.titles);
  ok('14 个代理都有 aria-label（读屏念得出名称）', a11y.labels.every(x => x && x.length > 0), a11y.labels);
  ok('aria-label 与文案一致（柔光）', a11y.labels[8] === '柔光', a11y.labels);
  ok('14 个代理都有 aria-pressed 选中态', a11y.pressed.every(x => x === 'true' || x === 'false'), a11y.pressed);
  ok('图标层 aria-hidden（不重复朗读）', a11y.icoHidden === true);
  ok('容器 role=toolbar + aria-label 保留', a11y.role === 'toolbar' && a11y.ariaLabel === '专注模式 · 渲染快捷菜单', a11y);
  ok('开关 aria-controls 指向分组外壳', a11y.controls === 'frGroups', a11y.controls);

  /* 键盘：焦点进入自动展开，移出收回。
     先 blur：G 段点过开关，焦点可能已在 frToggle 上，
     对已聚焦元素再 focus() 不派发 focusin（浏览器语义），必须先失焦。 */
  await parkMouse();
  await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await p.waitForTimeout(450);
  await p.evaluate(() => document.getElementById('frToggle').focus());
  await p.waitForTimeout(350);
  ok('键盘焦点进入 → 自动展开', (await snap()).open === true);
  /* 专注态下顶栏 display:none，#btnFocus 不可聚焦；把焦点交给正文容器
     （tabindex=-1 可编程聚焦），这才是专注态下真实的「焦点移出菜单」路径 */
  await p.evaluate(() => {
    const r = document.getElementById('reader');
    if (!r.hasAttribute('tabindex')) r.setAttribute('tabindex', '-1');
    r.focus();
  });
  await p.waitForTimeout(550);
  ok('焦点移出菜单 → 延时收回', (await snap()).open === false);
  /* Tab 能走到代理按钮 */
  await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await p.waitForTimeout(450);
  await p.evaluate(() => document.getElementById('frToggle').focus());
  await p.keyboard.press('Tab');
  await p.waitForTimeout(300);
  ok('Tab 从开关走到第一个代理（键盘可达）',
    await p.evaluate(() => {
      const a = document.activeElement;
      return !!(a && a.hasAttribute('data-proxy') && document.getElementById('focusRender').contains(a));
    }));
  await parkMouse();
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.waitForTimeout(450);

  /* ================= I. 三主题 / 柔光 / 英文 / 窄屏 / 打印 ================= */
  console.log('\n[I] 三主题 + 柔光 + 英文 + 窄屏 + 打印降级');
  const setTheme = async t => { await p.evaluate(x => document.getElementById('skin' + x).click(), t); await p.waitForTimeout(800); await parkMouse(); };
  for (const th of ['Dark', 'Sepia', 'Light']) {
    await setTheme(th);
    const ts = await snap();
    ok(th + ' 主题下收起态几何不变（40px / 一列 / fixed）',
      near(ts.w, 40, 0.6) && ts.dir === 'column' && ts.pos === 'fixed', [ts.w, ts.dir, ts.pos]);
    ok(th + ' 主题下正文仍让位', ts.innerL >= ts.r - 1, [ts.innerL, ts.r]);
    ok(th + ' 主题下菜单材质消费 chrome 变量（非写死白）',
      await p.evaluate(() => {
        const h = document.getElementById('focusRender');
        const bg = getComputedStyle(h).backgroundColor;
        const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        return bg !== 'rgba(0, 0, 0, 0)' && panel.length > 0;
      }));
    await hoverMenu();
    const to = await snap();
    ok(th + ' 主题下展开态不遮正文', to.r <= to.innerL + 1, [to.r, to.innerL]);
    await parkMouse();
  }
  /* 柔光：菜单自动跟暖色板 */
  await p.evaluate(() => { if (document.documentElement.getAttribute('data-pm') !== 'on') document.getElementById('setPm').click(); });
  await p.waitForTimeout(900);
  await parkMouse();
  const pmOn = await snap();
  ok('柔光开启后菜单仍 40px 一列', near(pmOn.w, 40, 0.6) && pmOn.dir === 'column', [pmOn.w, pmOn.dir]);
  ok('柔光开启后菜单底色 = 当前 --panel（暖色板接管）',
    await p.evaluate(() => {
      const h = document.getElementById('focusRender');
      const probe = document.createElement('div');
      probe.style.background = 'var(--panel)'; document.body.appendChild(probe);
      const want = getComputedStyle(probe).backgroundColor; probe.remove();
      return getComputedStyle(h).backgroundColor === want;
    }));
  await p.evaluate(() => { if (document.documentElement.getAttribute('data-pm') === 'on') document.getElementById('setPm').click(); });
  await p.waitForTimeout(900);
  await parkMouse();

  /* 窄屏：收起态 ≤50px（历史），展开态仍不遮正文 */
  await p.setViewportSize({ width: 800, height: 900 });
  await p.waitForTimeout(600);
  await parkMouse();
  const nw = await snap();
  ok('窄屏收起态 ≤50px（历史硬约束，实测 36）', nw.w <= 50, nw.w);
  ok('窄屏收起态正文仍让位（历史）', nw.innerL >= nw.r - 1, [nw.innerL, nw.r]);
  ok('窄屏不越界（历史）', nw.b <= 900 && nw.l >= 0, [nw.b, nw.l]);
  ok('窄屏仍一列', nw.dir === 'column', nw.dir);
  await hoverMenu();
  const nwo = await snap();
  ok('窄屏展开态 116px', near(nwo.w, 116, 0.6), nwo.w);
  ok('窄屏展开态不遮正文', nwo.r <= nwo.innerL + 1, [nwo.r, nwo.innerL]);
  ok('窄屏展开态留 ≥14px 呼吸位', nwo.innerL - nwo.r >= 14, [nwo.r, nwo.innerL]);
  ok('窄屏展开态完整在视口内', nwo.l >= 0 && nwo.b <= 900 && nwo.r <= 800, [nwo.l, nwo.b, nwo.r]);
  await parkMouse();
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.waitForTimeout(600);
  await parkMouse();

  /* 英文界面：历史 textContent 精确断言一条不松 */
  await p.evaluate(() => { const sel = document.getElementById('setLang'); sel.value = 'en'; sel.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1800);
  await parkMouse();
  const en = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const q = s => fr.querySelector(s).textContent.trim();
    const tg = document.getElementById('frToggle');
    return {
      lang: document.documentElement.dataset.lang,
      pmBtn: q('[data-proxy="btnPaperMatte"]'),
      chartBtn: q('[data-proxy="btnChartAuto"]'),
      flowBtn: q('[data-proxy="btnFlowAll"]'),
      lightBtn: q('[data-proxy="skinLight"]'),
      cardBtn: q('[data-proxy="layoutSel"][data-val="card"]'),
      paperBtn: q('[data-proxy="layoutSel"][data-val="paper"]'),
      lh: [...fr.querySelectorAll('[data-proxy="lhSel"]')].map(x => x.textContent.trim()),
      ariaLabel: fr.getAttribute('aria-label'),
      toggleLabel: (tg.querySelector('.fr-label') || {}).textContent || '',
      toggleTitle: tg.getAttribute('title'),
      proxyLabel: fr.querySelector('[data-proxy="btnPaperMatte"]').getAttribute('aria-label')
    };
  });
  ok('切换到英文界面', en.lang === 'en', en.lang);
  ok('历史：「柔光」= Soft', en.pmBtn === 'Soft', en.pmBtn);
  ok('历史：「数据图表」= Charts', en.chartBtn === 'Charts', en.chartBtn);
  ok('历史：「流程图」= Flowcharts', en.flowBtn === 'Flowcharts', en.flowBtn);
  ok('历史：「浅色」= Light', en.lightBtn === 'Light', en.lightBtn);
  ok('历史：「卡片」= ▥ Card（图标 + 文字拼回原串）', en.cardBtn === '▥ Card', en.cardBtn);
  ok('历史：「纸张」= ▭ Paper', en.paperBtn === '▭ Paper', en.paperBtn);
  ok('历史：四档行高 = Tight|Standard|Comfortable|Loose',
    en.lh.join('|') === 'Tight|Standard|Comfortable|Loose', en.lh);
  ok('历史：容器 aria-label 已翻译', en.ariaLabel === 'Focus Mode · Render Quick Menu', en.ariaLabel);
  ok('新增：开关文案英文 Collapse menu', en.toggleLabel === 'Collapse menu', en.toggleLabel);
  ok('新增：开关 title 英文', en.toggleTitle === 'Collapse menu (icon only)', en.toggleTitle);
  ok('新增：代理 aria-label 英文', en.proxyLabel === 'Soft', en.proxyLabel);
  /* 英文最长词不撑破轨道 */
  await hoverMenu();
  const enOpen = await snap();
  ok('英文展开态仍 132px（最长词未撑破）', near(enOpen.w, 132, 0.6), enOpen.w);
  ok('英文展开态不遮正文', enOpen.r <= enOpen.innerL + 1, [enOpen.r, enOpen.innerL]);
  ok('英文展开态文字无截断（scrollWidth <= clientWidth）',
    await p.evaluate(() => [...document.querySelectorAll('#focusRender .fr-label')]
      .every(x => x.scrollWidth <= x.clientWidth + 1)));
  ok('英文展开态按钮文字无溢出',
    await p.evaluate(() => [...document.querySelectorAll('#focusRender [data-proxy]')]
      .every(x => x.scrollWidth <= x.clientWidth + 1)));
  await parkMouse();
  /* 英文态 pin 开关文案 */
  await p.click('#frToggle');
  await p.waitForTimeout(400);
  await parkMouse();
  const enMin = await p.evaluate(() => {
    const tg = document.getElementById('frToggle');
    return { label: (tg.querySelector('.fr-label') || {}).textContent || '', title: tg.getAttribute('title') };
  });
  ok('英文 pin 态开关文案 Expand menu', enMin.label === 'Expand menu', enMin);
  ok('英文 pin 态开关 title Expand menu', enMin.title === 'Expand menu', enMin);
  await p.click('#frToggle');
  await p.waitForTimeout(400);
  await parkMouse();
  /* 切回中文，验证文案回滚不错位 */
  await p.evaluate(() => { const sel = document.getElementById('setLang'); sel.value = 'zh-CN'; sel.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1500);
  await parkMouse();
  const zh = await p.evaluate(() => {
    const fr = document.getElementById('focusRender');
    const tg = document.getElementById('frToggle');
    return {
      pm: fr.querySelector('[data-proxy="btnPaperMatte"]').textContent.trim(),
      card: fr.querySelector('[data-proxy="layoutSel"][data-val="card"]').textContent.trim(),
      lh: [...fr.querySelectorAll('[data-proxy="lhSel"]')].map(x => x.textContent.trim()),
      toggle: (tg.querySelector('.fr-label') || {}).textContent || ''
    };
  });
  ok('切回中文：柔光文案复位', zh.pm === '柔光', zh.pm);
  ok('切回中文：卡片文案复位（▥ 卡片）', zh.card === '▥ 卡片', zh.card);
  ok('切回中文：四档行高复位', zh.lh.join('|') === '紧凑|标准|舒适|宽松', zh.lh);
  ok('切回中文：开关文案复位', zh.toggle === '收起菜单', zh.toggle);

  /* 退出专注 → 菜单收起；再进 → 干净收起态 */
  await exitFocus();
  ok('Esc 退出后菜单 display:none（历史）',
    await p.evaluate(() => getComputedStyle(document.getElementById('focusRender')).display) === 'none');
  await enterFocus();
  const reEnter = await snap();
  ok('再进专注是干净收起态（无残留展开）', reEnter.open === false && reEnter.min === false, reEnter.cls);
  ok('再进专注 14 代理可见', reEnter.btnVisible === 14, reEnter.btnVisible);

  /* 打印降级 */
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(300);
  ok('打印媒体下菜单隐藏（历史）',
    await p.evaluate(() => getComputedStyle(document.getElementById('focusRender')).display) === 'none');
  ok('打印媒体下胶囊隐藏（历史）',
    await p.evaluate(() => {
      const pill = document.querySelector('#focusRender > .lp-pill');
      return !pill || getComputedStyle(pill).display === 'none';
    }));
  await p.emulateMedia({ media: 'screen' });
  await p.waitForTimeout(300);

  /* 减弱动效 */
  const ctxR = await b.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  const q = await ctxR.newPage();
  const qerrs = [];
  q.on('pageerror', e => qerrs.push(e.message));
  await q.goto(F);
  await q.waitForTimeout(1400);
  await q.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await q.waitForTimeout(2000);
  await q.keyboard.press('Control+o');
  await q.waitForTimeout(500);
  await q.mouse.move(900, 500);
  await q.waitForTimeout(400);
  ok('减弱动效：收起态仍 40px 一列',
    await q.evaluate(() => {
      const h = document.getElementById('focusRender');
      return Math.abs(h.getBoundingClientRect().width - 40) < 1 && getComputedStyle(h).flexDirection === 'column';
    }));
  ok('减弱动效：文字层不做过渡',
    await q.evaluate(() => getComputedStyle(document.querySelector('#focusRender .fr-label')).transitionDuration === '0s'));
  await q.evaluate(() => {
    const h = document.getElementById('focusRender'), b = h.getBoundingClientRect();
    h.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, clientX: b.left + 10, clientY: b.top + 10 }));
  });
  await q.waitForTimeout(300);
  ok('减弱动效：悬停展开仍生效（只是无动画）',
    await q.evaluate(() => document.getElementById('focusRender').classList.contains('fr-open')));
  ok('减弱动效上下文零 JS 错误', qerrs.length === 0, qerrs.slice(0, 3));
  await ctxR.close();

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 6));

  await b.close();
  console.log('\n============================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('============================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
