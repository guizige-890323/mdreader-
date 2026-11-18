/* CR-2026-11-18-04 欢迎屏「一屏式功能展示」专项测试
   ⚠️ 历史基线，已被 test-cr20.cjs / test-cr21.cjs 取代（12 → 15 项、圆角 12→16px、
      卡底改 --panel-2、入口搬进侧栏）。保留仅供追溯，不要再当基线跑。
   口径：A 一屏无下滑 / B 结构(截图+进度点，无滚动带) / C 联动交互 /
         D 自动播放与滚轮 / E 减弱动效降级 / F 主题 / G 文档阅读态零回归 / H 零 JS 错误 */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1200);

  /* A 一屏 */
  const A = await p.evaluate(() => {
    const r = document.querySelector('.reader'), w = document.getElementById('welcome');
    const hud = document.querySelector('.wf-hud'), tip = document.querySelector('.w-tip');
    window.scrollTo(0, 999);
    return {
      reader: [r.scrollHeight, r.clientHeight], welcome: [w.scrollHeight, w.clientHeight],
      winY: window.scrollY, hudBottom: hud ? Math.round(hud.getBoundingClientRect().bottom) : 0,
      tipBottom: tip ? Math.round(tip.getBoundingClientRect().bottom) : 0,
      vh: innerHeight,
      logo: !!document.querySelector('#welcome .w-logo'),
      actions: document.querySelectorAll('.w-actions .btn').length
    };
  });
  ok('A reader 无内部滚动', A.reader[0] === A.reader[1], A.reader);
  ok('A welcome 高度正好一屏', A.welcome[0] === A.welcome[1], A.welcome);
  ok('A 窗口无法下滑', A.winY === 0, A.winY);
  ok('A 底部进度点与小提示都在视口内', A.hudBottom <= A.vh && A.tipBottom <= A.vh, [A.hudBottom, A.tipBottom, A.vh]);
  ok('A 核心信息（LOGO + 两个入口）保留', A.logo && A.actions === 2);

  /* B 结构 */
  const B = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('.wf-shot img')];
    return {
      product: document.querySelectorAll('.w-product').length,
      qrInWelcome: document.querySelectorAll('#welcome .w-p-qr').length,
      reel: document.querySelectorAll('.w-reel,.w-reel-track,.w-reel-thumb').length,
      shots: imgs.length, loaded: imgs.filter(i => i.naturalWidth > 0).length,
      dots: document.querySelectorAll('.wf-dot').length,
      count: (document.getElementById('wfCount') || {}).textContent,
      info: document.querySelectorAll('.wf-info').length,
      titles: [...document.querySelectorAll('#gridFeats .w-card b')].map(x => x.textContent),
      cardW: Math.round((document.querySelector('.wf-item') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width)
    };
  });
  ok('B 底部二维码产品卡已移除', B.product === 0 && B.qrInWelcome === 0);
  ok('B 底部滚动缩略图带已移除', B.reel === 0, B.reel);
  ok('B 12 张功能截图全部加载', B.shots === 12 && B.loaded === 12, [B.shots, B.loaded]);
  ok('B 12 张卡都有「截图 + 文案」分栏', B.info === 12);
  ok('B 12 个进度点 + 01 / 12', B.dots === 12 && B.count === '01 / 12', [B.dots, B.count]);
  ok('B 截图区保留足够尺寸（卡宽 ≥ 460）', B.cardW >= 460, B.cardW);
  const gap = await p.evaluate(() => {
    /* 必须量 .w-card：.wf-item 是 height:100% 的定位框，卡片在其内部垂直居中 */
    const cur = document.querySelector('.wf-item[style*="z-index: 100"] .w-card').getBoundingClientRect();
    const nit = [...document.querySelectorAll('.wf-item')].find(e => e.style.zIndex === '99');
    const nb = nit ? nit.querySelector('.w-card').getBoundingClientRect() : null;
    const st = document.querySelector('.wf-stage').getBoundingClientRect();
    return { between: nb ? Math.round(nb.left - cur.right) : null, top: Math.round(cur.top - st.top), bottom: Math.round(st.bottom - cur.bottom) };
  });
  ok('B 相邻卡之间有真实间隙（不叠成一片）', gap.between !== null && gap.between >= 10, gap);
  ok('B 中央卡上下留白 ≥ 32px（不顶满舞台）', gap.top >= 32 && gap.bottom >= 32, [gap.top, gap.bottom]);
  ok('B 12 项功能文案顺序不变', JSON.stringify(B.titles) === JSON.stringify(
    ['文本转流程图','Mermaid 流动美化','纯离线安全','表格可视化','两种排版','最近打开','Obsidian 友好','整库浏览','按块编辑','四格式导出','专注阅读','主题肤色']), B.titles);

  const curIdx = () => p.evaluate(() => [...document.querySelectorAll('.wf-item')].findIndex(x => x.style.zIndex === '100'));
  const hud = () => p.evaluate(() => document.getElementById('wfCount').textContent);

  /* C 联动 */
  await p.evaluate(() => document.querySelectorAll('.wf-dot')[6].click());
  await p.waitForTimeout(600);
  ok('C 点第 7 个进度点 → 第 7 项居中', (await curIdx()) === 6, await curIdx());
  ok('C 点第 7 个进度点 → HUD 同步 07 / 12', (await hud()) === '07 / 12', await hud());
  await p.evaluate(() => document.querySelectorAll('.wf-dot')[2].click());
  await p.waitForTimeout(600);
  ok('C 点第 3 个进度点 → 第 3 项居中', (await curIdx()) === 2, await curIdx());

  /* 当前卡截图 → 大图 / Esc 关闭 */
  await p.locator('.wf-item[style*="z-index: 100"] .wf-shot').first().click();
  await p.waitForTimeout(250);
  ok('C 点当前截图 → 大图浮层打开', await p.evaluate(() => !document.getElementById('wfZoom').hidden));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('C Esc 关闭大图', await p.evaluate(() => document.getElementById('wfZoom').hidden));

  /* D 自动播放（已加速到 2.8s）+ 滚轮 */
  await p.mouse.move(20, 20); await p.waitForTimeout(200);
  const before = await curIdx();
  await p.waitForTimeout(3400);
  const after = await curIdx();
  ok('D 无操作约 2.8s 自动前进一项', after === (before + 1) % 12, [before, after]);
  const wheelBefore = await curIdx();
  await p.mouse.move(900, 400); await p.mouse.wheel(0, 130); await p.waitForTimeout(700);
  const wheelAfter = await curIdx();
  ok('D 滚轮向下 → 向前翻页', wheelAfter !== wheelBefore && wheelAfter <= wheelBefore + 2, [wheelBefore, wheelAfter]);
  const transMs = await p.evaluate(() => {
    const it = document.querySelector('.wf-item');
    return parseFloat(getComputedStyle(it).transitionDuration) * 1000;
  });
  ok('D 切换过渡已加速（≤ 500ms）', transMs > 0 && transMs <= 500, transMs);

  /* F 三套主题 */
  for (const t of ['light', 'sepia', 'dark']) {
    await p.evaluate(x => document.documentElement.setAttribute('data-theme', x), t);
    await p.waitForTimeout(120);
    const s = await p.evaluate(() => ({
      loaded: [...document.querySelectorAll('.wf-shot img')].filter(i => i.naturalWidth > 0).length,
      oneScreen: document.querySelector('.reader').scrollHeight === document.querySelector('.reader').clientHeight
    }));
    ok('F ' + t + ' 主题：12 图加载 + 仍是一屏', s.loaded === 12 && s.oneScreen, s);
  }

  /* E 减弱动效降级 */
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p2.goto(F); await p2.waitForTimeout(900);
  const E = await p2.evaluate(() => ({
    wf: document.querySelectorAll('.wf-item').length,
    shots: document.querySelectorAll('.wf-shot img').length,
    reel: document.querySelectorAll('.w-reel-thumb').length,
    overflow: getComputedStyle(document.getElementById('gridFeats')).overflowX
  }));
  ok('E 减弱动效：不启用 3D，但截图仍在', E.wf === 0 && E.shots === 12, E);
  ok('E 减弱动效：卡片可横向滚动', E.overflow === 'auto' && E.reel === 0, [E.overflow, E.reel]);
  await p2.evaluate(() => document.querySelectorAll('.wf-dot')[4].click());
  await p2.waitForTimeout(700);
  ok('E 降级下点进度点仍能定位', await p2.evaluate(() => document.getElementById('gridFeats').scrollLeft > 0));
  await p2.close();

  /* G 文档阅读态零回归 */
  await p.click('#wDemo'); await p.waitForTimeout(1400);
  const G = await p.evaluate(() => {
    const inner = document.querySelector('.reader-inner');
    const c = document.getElementById('content');
    const r = document.querySelector('.reader');
    return {
      welcomeHidden: document.getElementById('welcome').classList.contains('hidden'),
      innerDisplay: getComputedStyle(inner).display,
      contentShown: !c.classList.contains('hidden'),
      canScroll: r.scrollHeight > r.clientHeight,
      textLen: (c.textContent || '').length
    };
  });
  ok('G 打开示例文档：欢迎屏隐藏、正文容器恢复', G.welcomeHidden && G.innerDisplay !== 'none' && G.contentShown, G);
  ok('G 文档仍可正常滚动（未被一屏样式锁死）', G.canScroll && G.textLen > 1000, [G.canScroll, G.textLen]);

  ok('H 零 JS 错误', errs.length === 0, errs.slice(0, 3));
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
