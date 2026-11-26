/* CR-2026-11-18-06 欢迎屏「15 卡滚动展板」专项测试
   承继 CR-19 口径，并把项数从 12 升到 15：
   A 一屏无下滑 / B 结构（15 卡 · 15 截图 · 15 点）/ C 联动 / D 自动播放+滚轮+加速
   E 减弱动效降级 / F 主题 / G 文档阅读态零回归 / H 零 JS 错误 / I 新能力文案在场
*/
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const N = 15;
const TITLES = ['MD 复制即创建', '表格秒变六种图表', '双引擎流程图', '一套令牌五处同频', '知识库原生双链',
  '导出仍是活页面', 'MCP 连接器', '大纲与块编辑', '两套经典排版', '最近，重读磁盘',
  '15 项偏好全记住', '专注模式', '原创云晰柔光', '爱护你的双眼', '国际化版本'];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1400);

  /* A 一屏 */
  const A = await p.evaluate(() => {
    const r = document.querySelector('.reader'), w = document.getElementById('welcome');
    const hud = document.querySelector('.wf-hud'), tip = document.querySelector('.w-tip');
    window.scrollTo(0, 999);
    return {
      reader: [r.scrollHeight, r.clientHeight], welcome: [w.scrollHeight, w.clientHeight],
      winY: window.scrollY, hudBottom: Math.round(hud.getBoundingClientRect().bottom),
      tipBottom: Math.round(tip.getBoundingClientRect().bottom), vh: innerHeight,
      logo: !!document.querySelector('#welcome .w-logo'),
      /* CR-21：两个入口已搬进侧栏，欢迎屏中央不再有 .w-actions */
      actions: document.querySelectorAll('.w-actions .btn').length,
      sideEntry: document.querySelectorAll('#sidebar .side-entry .btn').length
    };
  });
  ok('A reader 无内部滚动', A.reader[0] === A.reader[1], A.reader);
  ok('A welcome 高度正好一屏', A.welcome[0] === A.welcome[1], A.welcome);
  ok('A 窗口无法下滑', A.winY === 0, A.winY);
  ok('A 底部进度点与小提示都在视口内', A.hudBottom <= A.vh && A.tipBottom <= A.vh, [A.hudBottom, A.tipBottom, A.vh]);
  ok('A 核心信息（LOGO + 两个入口）保留', A.logo && A.sideEntry === 2 && A.actions === 0,
     [A.logo, A.sideEntry, A.actions]);

  /* B 结构 */
  const B = await p.evaluate((n) => {
    const imgs = [...document.querySelectorAll('.wf-shot img')];
    return {
      product: document.querySelectorAll('.w-product').length,
      reel: document.querySelectorAll('.w-reel,.w-reel-track,.w-reel-thumb').length,
      shots: imgs.length, loaded: imgs.filter(i => i.naturalWidth > 0).length,
      dots: document.querySelectorAll('.wf-dot').length,
      count: (document.getElementById('wfCount') || {}).textContent,
      info: document.querySelectorAll('.wf-info').length,
      titles: [...document.querySelectorAll('#gridFeats .w-card b')].map(x => x.textContent),
      descs: [...document.querySelectorAll('#gridFeats .w-card .wf-info > span')].map(x => x.textContent.length),
      /* 描述完整显示：scrollHeight 超过 clientHeight 说明被 -webkit-line-clamp 截断。
         同时要求非空 —— 空数组 every() 恒真是本次要防的坑。 */
      descDetail: [...document.querySelectorAll('#gridFeats .w-card .wf-info > span')].map(x => ({
        n: x.textContent.length, clipped: x.scrollHeight > x.clientHeight + 1 })),
      descOk: (() => {
        const s = [...document.querySelectorAll('#gridFeats .w-card .wf-info > span')];
        return s.length === n && s.every(x => x.textContent.length > 10 && x.scrollHeight <= x.clientHeight + 1) ? n : -1;
      })(),
      icons: document.querySelectorAll('#gridFeats .feat-ico svg').length,
      cardW: Math.round(document.querySelector('.wf-item .w-card').getBoundingClientRect().width),
      // 截图填充率：1.0 = 素材正好铺满截图区
      fill: (() => {
        const s = document.querySelector('.wf-shot'), i = s.querySelector('img');
        const sb = s.getBoundingClientRect(), ib = i.getBoundingClientRect();
        const nf = i.naturalWidth / i.naturalHeight, br = ib.width / ib.height;
        return +(br > nf ? nf / br : br / nf).toFixed(3);
      })()
    };
  }, N);
  ok('B 底部二维码产品卡已移除', B.product === 0);
  ok('B 底部滚动缩略图带已移除', B.reel === 0, B.reel);
  ok('B 15 张功能截图全部加载', B.shots === N && B.loaded === N, [B.shots, B.loaded]);
  ok('B 15 张卡都有「截图 + 文案」分栏', B.info === N, B.info);
  ok('B 15 个进度点 + 01 / 15', B.dots === N && B.count === '01 / 15', [B.dots, B.count]);
  ok('B 15 张卡各有专属图标', B.icons === N, B.icons);
  ok('B 截图区保留足够尺寸（卡宽 ≥ 440）', B.cardW >= 440, B.cardW);
  ok('B 截图无裁切（填充率 ≥ 0.97）', B.fill >= 0.97, B.fill);
  /* CR-2026-11-20-01 起卡片换成展示页的完整产品文案，46 字上限不再成立。
     原断言的选择器 `#gridFeats .w-card > span` 已选不到元素（描述被收进 .wf-info），
     every() 对空数组恒真 —— 那是一条会伪装成通过的死断言。
     改为约束新设计真正在意的事：描述能完整显示、不被 clamp 截断。 */
  ok('B 每卡描述都取到且完整不被截断', B.descOk === N, B.descDetail);
  ok('B 15 项文案顺序与总览文档一致', JSON.stringify(B.titles) === JSON.stringify(TITLES), B.titles);

  /* CR-2026-11-20-01：把展示页那套产品介绍卡的五段信息搬进欢迎屏。
     这是本次改动的全部意义，必须逐项钉死 —— 少任何一段都退回「功能清单」的观感。 */
  const P = await p.evaluate(n => {
    const cs = [...document.querySelectorAll('#gridFeats .w-card')];
    const one = k => cs.every(c => c.querySelector(k));
    const txt = k => [...document.querySelectorAll('#gridFeats ' + k)].map(e => e.textContent.trim());
    return {
      prio: one('.wf-info .prio'), num: one('.wf-info .num'), en: one('.wf-info .en'),
      vs: one('.wf-info .vs .them') && one('.wf-info .vs .us'),
      tags: one('.wf-info .tags i'),
      prioN: document.querySelectorAll('#gridFeats .wf-info .prio').length,
      enN: document.querySelectorAll('#gridFeats .wf-info .en').length,
      vsN: document.querySelectorAll('#gridFeats .wf-info .vs').length,
      tagN: document.querySelectorAll('#gridFeats .wf-info .tags i').length,
      // 优先级三档都要出现：P0 七张、P1 七张、P2 一张
      p0: document.querySelectorAll('#gridFeats .w-card.p0').length,
      p1: document.querySelectorAll('#gridFeats .w-card.p1').length,
      p2: document.querySelectorAll('#gridFeats .w-card.p2').length,
      prios: txt('.prio'), enTexts: txt('.en'),
      // DOM 顺序：徽章行必须在 info 最前，标题行紧随其后
      firstIsTop: cs.every(c => c.querySelector('.wf-info').firstElementChild.className === 'card-top'),
      headAfterTop: cs.every(c => {
        const i = c.querySelector('.wf-info');
        return i.children[0].className === 'card-top' && i.children[1].className === 'wc-head';
      }),
      descLong: cs.every(c => (c.querySelector('span:not([class])') || {}).textContent.length >= 20),
    };
  }, N);
  ok('B 每卡都有优先级徽章 + 序号', P.prio && P.num && P.prioN === N, [P.prioN, P.num]);
  ok('B 每卡都有英文名', P.en && P.enN === N, P.enN);
  ok('B 每卡都有「旧做法 → 本产品」对照块', P.vs && P.vsN === N, P.vsN);
  ok('B 每卡都有标签（共 ≥45 个）', P.tags && P.tagN >= N * 3, P.tagN);
  ok('B 优先级分布 P0=7 / P1=7 / P2=1', P.p0 === 7 && P.p1 === 7 && P.p2 === 1, [P.p0, P.p1, P.p2]);
  ok('B 信息区顺序：徽章行 → 标题行（英文名不得插到标题之上）', P.firstIsTop && P.headAfterTop);
  ok('B 描述已换成完整产品文案（每卡 ≥20 字）', P.descLong);

  /* 英文名必须与展示页逐条一致（数据源 = docs/showcase/build_showcase.py 的 CARDS）。 */
  const EN = ['CLIPBOARD → DOC', 'SIX CHART TYPES', 'DUAL-ENGINE FLOW', 'ONE PALETTE, EVERYWHERE',
    'NATIVE WIKI LINKS', 'EXPORT THAT LIVES', 'MCP READY', 'OUTLINE & BLOCK EDIT',
    'TWO TYPOGRAPHIC SKINS', 'RECENT, RE-READ FROM DISK', 'GRANULAR SETTINGS', 'FOCUS MODE',
    'SOFT LIGHT', 'EYE CARE', 'I18N'];
  ok('B 15 个英文名与展示页逐条一致', JSON.stringify(P.enTexts) === JSON.stringify(EN), P.enTexts);

  const gap = await p.evaluate(() => {
    /* 必须量 .w-card：.wf-item 是 height:100% 的定位框，卡片在其内部垂直居中 */
    const cur = document.querySelector('.wf-item[style*="z-index: 100"] .w-card').getBoundingClientRect();
    const nit = [...document.querySelectorAll('.wf-item')].find(e => e.style.zIndex === '99');
    const nb = nit ? nit.querySelector('.w-card').getBoundingClientRect() : null;
    const st = document.querySelector('.wf-stage').getBoundingClientRect();
    return { between: nb ? Math.round(nb.left - cur.right) : null,
             top: Math.round(cur.top - st.top), bottom: Math.round(st.bottom - cur.bottom) };
  });
  /* CR-21 起副卡按展示页的设计改为「叠压」：不再追求留缝，
     改量「副卡露在中央卡外侧的宽度占比」——露够比例才看得出层次，
     全被压住就成了一块实心色（这才是原先那条断言真正要防的事）。 */
  const cover = await p.evaluate(() => {
    const cur = document.querySelector('.wf-item[style*="z-index: 100"] .w-card').getBoundingClientRect();
    return [...document.querySelectorAll('.wf-item')]
      .filter(e => e.style.zIndex === '99' && e.style.visibility !== 'hidden')
      .map(e => {
        const nb = e.querySelector('.w-card').getBoundingClientRect();
        const leftSide = (nb.left + nb.width / 2) < (cur.left + cur.width / 2);
        const shown = leftSide ? cur.left - nb.left : nb.right - cur.right;
        return +(Math.max(0, shown) / nb.width).toFixed(3);
      });
  });
  ok('B 副卡露在中央卡外侧 ≥38%（层次不被压平）',
     cover.length === 2 && cover.every(v => v >= 0.38), cover);
  ok('B 中央卡上下留白 ≥ 32px（不顶满舞台）', gap.top >= 32 && gap.bottom >= 32, [gap.top, gap.bottom]);

  const curIdx = () => p.evaluate(() => [...document.querySelectorAll('.wf-item')].findIndex(x => x.style.zIndex === '100'));
  const hud = () => p.evaluate(() => document.getElementById('wfCount').textContent);

  /* C 联动 */
  await p.evaluate(() => document.querySelectorAll('.wf-dot')[13].click());
  await p.waitForTimeout(650);
  ok('C 点第 14 个进度点 → 第 14 项居中', (await curIdx()) === 13, await curIdx());
  ok('C 点第 14 个进度点 → HUD 同步 14 / 15', (await hud()) === '14 / 15', await hud());
  await p.evaluate(() => document.querySelectorAll('.wf-dot')[0].click());
  await p.waitForTimeout(650);
  ok('C 点第 1 个进度点 → 第 1 项居中', (await curIdx()) === 0, await curIdx());

  /* 当前卡截图 → 大图 / Esc 关闭 */
  await p.locator('.wf-item[style*="z-index: 100"] .wf-shot').first().click();
  await p.waitForTimeout(250);
  ok('C 点当前截图 → 大图浮层打开', await p.evaluate(() => !document.getElementById('wfZoom').hidden));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('C Esc 关闭大图', await p.evaluate(() => document.getElementById('wfZoom').hidden));

  /* D 自动播放（2.8s）+ 滚轮 + 加速 */
  await p.mouse.move(20, 20); await p.waitForTimeout(200);
  const before = await curIdx();
  await p.waitForTimeout(3400);
  const after = await curIdx();
  ok('D 无操作约 2.8s 自动前进一项', after === (before + 1) % N, [before, after]);
  const wheelBefore = await curIdx();
  await p.mouse.move(900, 400); await p.mouse.wheel(0, 130); await p.waitForTimeout(700);
  const wheelAfter = await curIdx();
  ok('D 滚轮向下 → 向前翻页', wheelAfter !== wheelBefore && wheelAfter <= wheelBefore + 2, [wheelBefore, wheelAfter]);
  const transMs = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.wf-item')).transitionDuration) * 1000);
  ok('D 切换过渡已加速（≤ 500ms）', transMs > 0 && transMs <= 500, transMs);

  /* F 三套主题 */
  for (const t of ['light', 'sepia', 'dark']) {
    await p.evaluate(x => document.documentElement.setAttribute('data-theme', x), t);
    await p.waitForTimeout(140);
    const s = await p.evaluate(() => ({
      loaded: [...document.querySelectorAll('.wf-shot img')].filter(i => i.naturalWidth > 0).length,
      oneScreen: document.querySelector('.reader').scrollHeight === document.querySelector('.reader').clientHeight
    }));
    ok('F ' + t + ' 主题：15 图加载 + 仍是一屏', s.loaded === N && s.oneScreen, s);
  }
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  /* I 新能力文案在场（15 项各自的关键词，防止文案串行） */
  const kw = await p.evaluate(() => {
    const t = document.getElementById('gridFeats').textContent;
/* 关键词取自「每卡必有」的信息位：标题 / 中文描述 / 对照块 / 标签。
       换文案时同步换这里，别让它退化成「凑不齐也算过」。
       '按块编辑' → '块级编辑'：完整描述里用的是「块级改动 / 块级编辑」。 */
    return ['Markdown', '柱状', 'Mermaid', '令牌', '双链', 'HTML', 'MCP', '块级编辑', '纸张',
            '磁盘', '12–22px', '专注', '柔光', '暖米黄', 'English'].map(k => [k, t.includes(k)]);
  });
  ok('I 15 项关键信息全部出现在展板上', kw.every(([, v]) => v), kw.filter(([, v]) => !v));

  /* E 减弱动效降级 */
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p2.goto(F); await p2.waitForTimeout(1000);
  const E = await p2.evaluate(() => ({
    wf: document.querySelectorAll('.wf-item').length,
    shots: document.querySelectorAll('.wf-shot img').length,
    reel: document.querySelectorAll('.w-reel-thumb').length,
    overflow: getComputedStyle(document.getElementById('gridFeats')).overflowX
  }));
  ok('E 减弱动效：不启用 3D，但 15 张截图仍在', E.wf === 0 && E.shots === N, E);
  ok('E 减弱动效：卡片可横向滚动', E.overflow === 'auto' && E.reel === 0, [E.overflow, E.reel]);
  await p2.evaluate(() => document.querySelectorAll('.wf-dot')[9].click());
  await p2.waitForTimeout(750);
  ok('E 降级下点第 10 个进度点仍能定位', await p2.evaluate(() => document.getElementById('gridFeats').scrollLeft > 0));
  await p2.close();

  /* G 文档阅读态零回归 */
  await p.evaluate(() => { if (document.querySelector('.wf-zoom')) document.querySelector('.wf-zoom').hidden = true; });
  await p.click('#wDemo'); await p.waitForTimeout(1500);
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