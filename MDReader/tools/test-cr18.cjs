/* CR-2026-11-18-01/06 欢迎屏 Cover Flow 轮播专项测试（基线已随 CR-20 升到 15 项）
   口径：A 结构保留 / B 几何逐级 / C 翻页交互 / D 循环 / E 降级 / F i18n / G 追光共存 */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const N = 15;   /* CR-20：12 → 15 项 */
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1500);

  /* A 结构 */
  const base = await p.evaluate(() => {
    const grid = document.getElementById('gridFeats');
    const items = [...document.querySelectorAll('.wf-item')];
    const cards = [...grid.querySelectorAll('.w-card')];
    return {
      grid: !!grid, wfMode: grid.classList.contains('wf-mode'),
      stage: document.querySelectorAll('.wf-stage').length,
      items: items.length, cards: cards.length,
      titles: cards.map(c => (c.querySelector('b') || {}).textContent),
      navs: document.querySelectorAll('.wf-nav').length,
      stageInsideGrid: !!grid.querySelector('.wf-stage'),
      cardInsideGrid: cards.every(c => grid.contains(c)),
      cardInsideItem: cards.every(c => c.parentElement.classList.contains('wf-item')),
      legacyTrack: document.querySelectorAll('#gridFeats .w-track').length
    };
  });
  ok('A 欢迎屏 #gridFeats 存在', base.grid);
  ok('A 已切 wf-mode', base.wfMode);
  ok('A 一个 3D 舞台', base.stage === 1, base.stage);
  ok('A 15 个包裹层', base.items === N, base.items);
  ok('A 15 张卡片数量不变', base.cards === N, base.cards);
  ok('A 卡片在包裹层内、包裹层在 grid 内', base.cardInsideItem && base.stageInsideGrid && base.cardInsideGrid);
  ok('A 左右导航按钮', base.navs === 2, base.navs);
  ok('A 旧 marquee 克隆轨道已移除', base.legacyTrack === 0, base.legacyTrack);
  const expectTitles = ['MD 复制即创建','表格秒变六种图表','双引擎流程图','一套令牌五处同频','知识库原生双链',
    '导出仍是活页面','MCP 连接器','大纲与块编辑','两套经典排版','最近，重读磁盘',
    '15 项偏好全记住','专注模式','原创云晰柔光','爱护你的双眼','国际化版本'];
  ok('A 15 项功能文案与顺序逐字不变', JSON.stringify(base.titles) === JSON.stringify(expectTitles), base.titles);

  /* B 几何：CR-21 起与展示页 #showcase 对齐，缩放档位 1/.81/.62/.45 */
  const snap = () => p.evaluate(() => [...document.querySelectorAll('.wf-item')].map(el => {
    const m = el.style.transform.match(/scale\(([\d.]+)\)/);
    return { sc: m ? +m[1] : null, op: +el.style.opacity, z: +el.style.zIndex, vis: el.style.visibility, aria: el.getAttribute('aria-hidden') };
  }));
  let s = await snap();
  ok('B 中间 scale=1', s[0].sc === 1, s[0]);
  ok('B 两侧依次缩小 .81/.62/.45', s[1].sc === .81 && s[2].sc === .62 && s[3].sc === .45, s.slice(0,4).map(x=>x.sc));
  ok('B 环形另一侧对称', s[N-1].sc === .81 && s[N-2].sc === .62 && s[N-3].sc === .45, [s[N-1].sc,s[N-2].sc,s[N-3].sc]);
  ok('B 副卡透明度 1/.9/.62/0（与展示页同档）', s[0].op === 1 && s[1].op === .9 && s[2].op === .62 && s[3].op === 0,
     s.slice(0,4).map(x=>x.op));
  ok('B z-index 按距离递减', s[0].z === 100 && s[1].z === 99 && s[2].z === 98, s.slice(0,3).map(x=>x.z));
  ok('B 超出 3 步隐藏（15-7=8 张）', s.filter(x => x.vis === 'hidden').length === N - 7, s.filter(x=>x.vis==='hidden').length);
  ok('B 仅中间项 aria-hidden=false', s.filter(x => x.aria === 'false').length === 1, s.filter(x=>x.aria==='false').length);

  /* C 翻页交互 */
  await p.click('.wf-nav.r'); await p.waitForTimeout(900);
  s = await snap();
  ok('C 点右箭头 → 第 2 项居中', s[1].sc === 1 && s[0].sc === .81, [s[0].sc, s[1].sc]);
  await p.click('.wf-nav.l'); await p.waitForTimeout(900);
  s = await snap();
  ok('C 点左箭头 → 回第 1 项', s[0].sc === 1);
  await p.evaluate(() => document.querySelectorAll('.wf-item')[5].click()); await p.waitForTimeout(900);
  s = await snap();
  ok('C 点第 6 项卡片 → 直达居中', s[5].sc === 1, s[5].sc);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  ok('C → 键前进', (await snap())[6].sc === 1);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(900);
  ok('C ← 键后退', (await snap())[5].sc === 1);

  /* D 循环 */
  /* 环形验证与项数解耦：直接跳到末项，再前进一次必须回到第 1 项 */
  await p.evaluate(() => { for (let i=0;i<6;i++) document.querySelector('.wf-nav.r').click(); });
  await p.waitForTimeout(1000);
  ok('D 从第 6 项前进 6 步 → 停在第 12 项', (await snap())[11].sc === 1, (await snap()).findIndex(x => x.sc === 1));
  await p.evaluate(n => { for (let i = 11; i < n - 1; i++) document.querySelector('.wf-nav.r').click(); }, N);
  await p.waitForTimeout(1200);
  ok('D 直达末项（第 ' + N + ' 项）居中', (await snap())[N-1].sc === 1, (await snap()).findIndex(x => x.sc === 1));
  await p.click('.wf-nav.r'); await p.waitForTimeout(900);
  ok('D 末项再前进 → 环形回第 1 项', (await snap())[0].sc === 1, (await snap()).findIndex(x => x.sc === 1));
  /* 自动播放：模拟无操作 */
  await p.evaluate(() => {
    const grid = document.getElementById('gridFeats');
    // lastAct 是闭包变量，无法直接改；改为等待真实 4.2s 后观察是否换项
  });
  const before = (await snap()).findIndex(x => x.sc === 1);
  await p.mouse.move(20, 20);  // 光标移出欢迎卡区，停止 pointermove 重置
  /* CR-19 已把 AUTO 从 4200 加速到 2800，等待窗口随之收紧 */
  await p.waitForTimeout(3400);
  const after = (await snap()).findIndex(x => x.sc === 1);
  ok('D 无操作约 2.8s 后自动前进一项', after === (before + 1) % N, [before, after]);

  /* F 追光共存：把光标移到中心卡内部真实触发 pointermove（先移开再进入，确保派发） */
  await p.mouse.move(20, 20); await p.waitForTimeout(200);
  const cpt = await p.evaluate(() => {
    const it = [...document.querySelectorAll('.wf-item')].find(x => x.style.zIndex === '100');
    const b = it.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  });
  await p.mouse.move(cpt.x, cpt.y); await p.waitForTimeout(350);
  const lit = await p.evaluate(() => ({
    n: document.querySelectorAll('.w-card.lit').length,
    insideWf: !!document.querySelector('.wf-item .w-card.lit'),
    transform: (document.querySelector('.wf-item[style*="z-index: 100"]') || {}).style?.transform || ''
  }));
  ok('F CR-06 追光在 Cover Flow 卡片上仍生效', lit.n === 1 && lit.insideWf, lit);
  ok('F 追光与 3D 变换共存（卡片仍有 scale）', /scale\(1\)/.test(lit.transform), lit.transform.slice(0, 60));

  /* E 降级：减弱动效 */
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p2.goto(F); await p2.waitForTimeout(1200);
  const deg = await p2.evaluate(() => ({
    wf: document.querySelectorAll('.wf-item').length,
    track: document.querySelectorAll('#gridFeats .w-track').length,
    scroll: getComputedStyle(document.getElementById('gridFeats')).overflowX
  }));
  ok('E 减弱动效不启用 3D', deg.wf === 0, deg.wf);
  ok('E 减弱动效保留横向可滚动', deg.scroll === 'auto', deg.scroll);
  await p2.close();

  ok('零 JS 错误', errs.length === 0, errs.slice(0, 3));
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
