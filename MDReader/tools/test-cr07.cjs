/* ==================================================================
   CR-2026-11-16-07 · 多标签页批量关闭菜单 专项测试
   ------------------------------------------------------------------
   需求（桂子哥原话）：「多标签页支持关闭所有，关闭其他，关闭右侧、关闭左侧菜单」

   核心语义契约：
     · 一切以「右键的那一个标签」为基准，不是当前激活标签（VS Code / Chrome 口径）
     · 关闭其他 / 左侧 / 右侧执行后激活基准标签，即便它原本不是当前项
     · 关闭 / 关闭所有沿用邻居规则：优先右侧邻居 → 左侧邻居 → 欢迎屏
     · 未保存保护：待关集合含 dirty / isNew 时弹一次确认，取消则整批不动（原子）
     · 关标签只关视图：S.files / 最近记录保留，chartState 按 key 回收

   分段：
     A 静态产物契约（容器 / 样式 / 六项 / i18n / 降级槽位）
     B 菜单几何：弹出位置 / 视口内 / 双向翻转 / z-index
     C 禁用态：首 / 尾 / 中间 / 单标签 / 空白处 五种基准
     D 关闭语义：剩余 key 序列 + 激活项（含右击非激活项这一关键分支）
     E 未保存保护：取消不动 / 确认执行 / 新建未落盘同样受保护
     F 状态回收：chartState 清桶 / 文件树与最近记录不受影响
     G 硬约束：.tabbar / .tab.active 底色几何不变 + 柔光联动 + CR-06 胶囊仍落位
     H 无障碍与键盘：Shift+F10 / ↑↓ / Home End / Enter / Esc / 焦点归还 / aria
     I 英文界面 + 打印与减弱动效降级 + 全程零 JS 错误

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-cr07.cjs
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
const TMP = path.join(SHOTS, '_cr07docs');
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

/* ---- WCAG 对比度（与 app.js / test-cr06 同口径） ---- */
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

/* 造 N 个真实 .md 文件，用 #filePicker 走完整 ingest 管线（不伪造内部状态） */
function makeDocs(n) {
  fs.mkdirSync(TMP, { recursive: true });
  const out = [];
  for (let i = 1; i <= n; i++) {
    const f = path.join(TMP, 'doc' + i + '.md');
    fs.writeFileSync(f, '# 文档 ' + i + '\n\n正文段落 ' + i + '。\n\n| 项 | 值 |\n| --- | --- |\n| A | ' + (i * 10) + ' |\n| B | ' + (i * 20) + ' |\n', 'utf8');
    out.push(f);
  }
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  const IGNORE = /_autoload\.js|ERR_FILE_NOT_FOUND.*_autoload|Failed to load resource/;
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error' || IGNORE.test(m.text())) return;
    errs.push('console: ' + m.text());
  });
  /* confirm 默认放行；E 段会临时改成取消 */
  let confirmLog = [];
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.accept(); });

  await p.goto(F);
  await p.waitForTimeout(1300);

  /* ---------------- A. 静态契约 ---------------- */
  console.log('\n[A] 静态产物契约');
  ok('dist 含 #tabMenu 容器', has('<div class="tab-menu" id="tabMenu" role="menu" aria-label="标签页操作" hidden>'));
  ok('#tabMenu 在 #app 之外（柔光 filter 不改其 fixed 包含块）',
    HTML.indexOf('id="tabMenu"') > HTML.indexOf('id="filePicker"'));
  ok('菜单样式段存在', has('.tab-menu{') && has('.tab-menu[hidden]{display:none}'));
  ok('菜单 z-index=96（高于更多菜单 95 / 新建弹层 90，低于设置遮罩 200）',
    has('position:fixed;z-index:96;min-width:196px'));
  ok('菜单材质全部消费 chrome 变量（柔光自动联动）',
    has('background:var(--panel);border:1px solid var(--border);border-radius:11px;') &&
    has('box-shadow:var(--shadow);padding:5px'));
  ok('菜单项 hover/focus 用 --accent-2 / --accent',
    has('.tab-menu .tm-item:hover:not([disabled]),') &&
    has('.tab-menu .tm-item:focus-visible{background:var(--accent-2);color:var(--accent);outline:none}'));
  ok('危险项（关闭所有）hover 用 --err', has('.tab-menu .tm-item.danger:hover:not([disabled]),'));
  ok('禁用态样式存在', has('.tab-menu .tm-item[disabled]{opacity:.42;cursor:not-allowed;color:var(--muted)}'));
  ok('分隔线用 --border-2', has('.tab-menu .tm-sep{height:1px;background:var(--border-2);margin:4px 2px}'));
  ok('标签键盘描边只加 outline，不改底色尺寸',
    has('.tab:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}'));
  ok('减弱动效降级：菜单无入场动画', has('@media (prefers-reduced-motion: reduce){\n  .tab-menu{animation:none}\n}'));
  ok('打印降级：菜单隐藏', has('@media print{\n  .tab-menu{display:none!important}\n}'));
  ok('六项动作定义齐全', has("{ act: 'one', ico: '✕', label: '关闭' }") &&
    has("{ act: 'others', ico: '◫', label: '关闭其他' }") &&
    has("{ act: 'right', ico: '⇥', label: '关闭右侧' }") &&
    has("{ act: 'left', ico: '⇤', label: '关闭左侧' }") &&
    has("{ act: 'all', ico: '⊗', label: '关闭所有', danger: true }"));
  ok('批量关闭核心 closeTabs 存在', has('function closeTabs(keys, keepKey)'));
  ok('状态回收 dropTabState 存在', has('function dropTabState(tab)'));
  ok('未保存判定 tabsAtRisk 存在', has('function tabsAtRisk(list)'));
  ok('保护提示用整句模板而非碎片词典 key',
    has("t('「{name}」尚未保存，关闭后修改会丢失。确定关闭吗？')") &&
    !has("t('「')") && !has("t(' 个')"));
  ok('i18n 六项菜单词条', has("'关闭其他': 'Close Others'") && has("'关闭右侧': 'Close to the Right'") &&
    has("'关闭左侧': 'Close to the Left'") && has("'关闭所有': 'Close All'") && has("'关闭': 'Close'"));
  ok('i18n 保护提示整句词条', has("'「{name}」尚未保存，关闭后修改会丢失。确定关闭吗？': '\"{name}\" has unsaved changes."));
  ok('i18n 结果 toast 词条', has("'已关闭其他标签': 'Other tabs closed'") && has("'已关闭全部标签': 'All tabs closed'"));
  ok('标签补 role=tab / tabindex / aria-selected / aria-haspopup',
    has('role="tab" tabindex="0"') && has('aria-haspopup="menu"'));
  ok('标签栏补 role=tablist', has("bar.setAttribute('role', 'tablist')"));
  ok('右键仅在标签栏内接管（正文原生菜单不受影响）',
    has("tabbarEl.addEventListener('contextmenu'"));
  ok('✕ 按钮 tabindex=-1（不抢 tab 序，焦点停在标签本体）', has('class="tab-x" type="button" tabindex="-1"'));

  /* ---------------- 造 6 个标签 ---------------- */
  const docs = makeDocs(6);
  await p.setInputFiles('#filePicker', docs);
  await p.waitForTimeout(2400);

  const snap = () => p.evaluate(() => {
    const act = document.querySelector('#tabbar .tab.active');
    return {
      keys: [...document.querySelectorAll('#tabbar .tab')].map(t => t.getAttribute('data-key')),
      active: act ? act.getAttribute('data-key') : null,
      barHidden: document.getElementById('tabbar').classList.contains('hidden'),
      welcome: !document.getElementById('welcome').classList.contains('hidden'),
      treeCount: document.querySelectorAll('#sideFiles .tree-item').length,
      stFile: document.getElementById('stFile').textContent
    };
  });
  const menuState = () => p.evaluate(() => {
    const m = document.getElementById('tabMenu');
    const r = m.getBoundingClientRect();
    return {
      hidden: m.hasAttribute('hidden'), base: m.getAttribute('data-base'),
      rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
      w: Math.round(r.width), h: Math.round(r.height),
      items: [...m.querySelectorAll('.tm-item')].map(x => ({
        act: x.getAttribute('data-act'),
        label: x.querySelector('.tm-label').textContent,
        count: x.querySelector('.tm-count').textContent,
        dis: x.disabled
      })),
      seps: m.querySelectorAll('.tm-sep').length,
      focus: document.activeElement ? document.activeElement.getAttribute('data-act') : null,
      z: getComputedStyle(m).zIndex, pos: getComputedStyle(m).position
    };
  });
  const rightClick = async i => {
    const ts = await p.$$('#tabbar .tab');
    await ts[i].click({ button: 'right' });
    await p.waitForTimeout(220);
  };
  const runAct = async act => {
    await p.click('#tabMenu .tm-item[data-act="' + act + '"]');
    await p.waitForTimeout(950);
  };
  /* 每段前把 6 个标签恢复原状。
     必须走真实 UI 路径「右键 → 关闭所有」，不能直接改 hidden 或伪造状态：
     菜单收起由 renderTabbar 负责，手工塞 hidden 会让内部基准悬空。
     若有脏标签，dialog 监听器已默认 accept，保护提示会被放行。 */
  const reset6 = async () => {
    for (let guard = 0; guard < 4; guard++) {
      const n = await p.evaluate(() => document.querySelectorAll('#tabbar .tab').length);
      if (!n) break;
      const ts = await p.$$('#tabbar .tab');
      await ts[0].click({ button: 'right' });
      await p.waitForTimeout(220);
      const btn = await p.$('#tabMenu .tm-item[data-act="all"]');
      if (!btn) break;
      await btn.click();
      await p.waitForTimeout(950);
    }
    await p.setInputFiles('#filePicker', docs);
    await p.waitForTimeout(2200);
  };

  let s = await snap();
  ok('导入后 6 个标签', s.keys.length === 6, s.keys);
  ok('默认激活第一个', s.active === 'doc1.md', s.active);
  ok('文件树 6 条', s.treeCount === 6, s.treeCount);

  /* ---------------- B. 菜单几何 ---------------- */
  console.log('\n[B] 菜单几何 / 弹出位置 / 边界翻转');
  await rightClick(2);
  let m = await menuState();
  ok('右键弹出菜单', m.hidden === false);
  ok('基准 = 右击的第 3 个标签（不是激活的 doc1）', m.base === 'doc3.md', m.base);
  ok('菜单为 fixed 定位', m.pos === 'fixed', m.pos);
  ok('z-index = 96', m.z === '96', m.z);
  ok('六项中五项可点 + 一条分隔线', m.items.length === 5 && m.seps === 1, [m.items.length, m.seps]);
  ok('项顺序：关闭 / 其他 / 右侧 / 左侧 / 所有',
    eq(m.items.map(x => x.act), ['one', 'others', 'right', 'left', 'all']), m.items.map(x => x.act));
  ok('中文标签正确', eq(m.items.map(x => x.label), ['关闭', '关闭其他', '关闭右侧', '关闭左侧', '关闭所有']),
    m.items.map(x => x.label));
  ok('计数正确：其他 5 / 右侧 3 / 左侧 2 / 所有 6',
    eq(m.items.map(x => x.count), ['', '5', '3', '2', '6']), m.items.map(x => x.count));
  ok('菜单完整落在视口内', m.rect.l >= 0 && m.rect.t >= 0 && m.rect.r <= 1400 && m.rect.b <= 900, m.rect);
  ok('弹出点贴近光标（在标签下方一带）', m.rect.t >= 40 && m.rect.t <= 200, m.rect.t);
  ok('首项自动获得焦点', m.focus === 'one', m.focus);
  ok('菜单不在 #content 内（不污染导出）',
    await p.evaluate(() => !document.getElementById('content').contains(document.getElementById('tabMenu'))));
  ok('菜单不在 #app 内（柔光 filter 不影响其定位）',
    await p.evaluate(() => !document.getElementById('app').contains(document.getElementById('tabMenu'))));

  /* 右边界翻转：把标签栏滚到最右，右键最后一个标签 */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  const flip = await p.evaluate(() => {
    /* 直接把菜单请求到贴近右边缘的坐标，验证翻转逻辑本身 */
    const tb = document.querySelectorAll('#tabbar .tab')[5];
    const r = tb.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1392, clientY: 860 });
    tb.dispatchEvent(ev);
    const mm = document.getElementById('tabMenu').getBoundingClientRect();
    return { l: Math.round(mm.left), t: Math.round(mm.top), r: Math.round(mm.right), b: Math.round(mm.bottom) };
  });
  await p.waitForTimeout(200);
  ok('右下角唤出时向左向上翻转，完整在视口内',
    flip.l >= 0 && flip.t >= 0 && flip.r <= 1400 && flip.b <= 900, flip);
  ok('右翻转确实生效（右边缘 ≤ 1392）', flip.r <= 1392, flip.r);
  ok('下翻转确实生效（下边缘 ≤ 860）', flip.b <= 860, flip.b);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);

  /* ---------------- C. 禁用态 ---------------- */
  console.log('\n[C] 五种基准下的禁用态');
  const disOf = mm => mm.items.filter(x => x.dis).map(x => x.act);
  await rightClick(0);
  m = await menuState();
  ok('首标签：仅「关闭左侧」禁用', eq(disOf(m), ['left']), disOf(m));
  ok('首标签：右侧计数 5', m.items.find(x => x.act === 'right').count === '5');
  await p.keyboard.press('Escape'); await p.waitForTimeout(140);
  await rightClick(5);
  m = await menuState();
  ok('尾标签：仅「关闭右侧」禁用', eq(disOf(m), ['right']), disOf(m));
  ok('尾标签：左侧计数 5', m.items.find(x => x.act === 'left').count === '5');
  await p.keyboard.press('Escape'); await p.waitForTimeout(140);
  await rightClick(3);
  m = await menuState();
  ok('中间标签：无禁用项', disOf(m).length === 0, disOf(m));
  await p.keyboard.press('Escape'); await p.waitForTimeout(140);
  /* 标签栏空白处右键 */
  await p.evaluate(() => {
    const bar = document.getElementById('tabbar');
    const r = bar.getBoundingClientRect();
    bar.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.right - 12, clientY: r.top + 10 }));
  });
  await p.waitForTimeout(220);
  m = await menuState();
  ok('空白处右键也能唤出', m.hidden === false);
  ok('空白处基准为空', m.base === '', m.base);
  ok('空白处：仅「关闭所有」可用', eq(disOf(m), ['one', 'others', 'right', 'left']), disOf(m));
  await p.keyboard.press('Escape'); await p.waitForTimeout(140);
  /* 单标签 */
  await reset6();
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[1].querySelector('.tab-x').click());
    await p.waitForTimeout(320);
  }
  s = await snap();
  ok('削到单标签', s.keys.length === 1, s.keys);
  await rightClick(0);
  m = await menuState();
  ok('单标签：其他/右侧/左侧全禁用', eq(disOf(m), ['others', 'right', 'left']), disOf(m));
  ok('单标签：关闭与关闭所有仍可用',
    !m.items.find(x => x.act === 'one').dis && !m.items.find(x => x.act === 'all').dis);
  await p.keyboard.press('Escape'); await p.waitForTimeout(140);

  /* ---------------- D. 关闭语义 ---------------- */
  console.log('\n[D] 关闭语义：剩余序列 + 激活项');
  await reset6();
  /* D1 关闭右侧，基准 doc3，当前激活 doc1 —— 关键分支 */
  await rightClick(2);
  await runAct('right');
  s = await snap();
  ok('关闭右侧：剩 doc1/2/3', eq(s.keys, ['doc1.md', 'doc2.md', 'doc3.md']), s.keys);
  ok('关闭右侧后激活基准 doc3（原本激活 doc1）', s.active === 'doc3.md', s.active);
  ok('状态栏跟着切到 doc3', /doc3\.md/.test(s.stFile), s.stFile);
  ok('文件树仍是 6 条（关标签不删文件）', s.treeCount === 6, s.treeCount);

  /* D2 关闭左侧，基准 doc2（当前激活 doc3） */
  await rightClick(1);
  await runAct('left');
  s = await snap();
  ok('关闭左侧：剩 doc2/3', eq(s.keys, ['doc2.md', 'doc3.md']), s.keys);
  ok('关闭左侧后激活基准 doc2', s.active === 'doc2.md', s.active);

  /* D3 关闭其他，基准 doc3（当前激活 doc2） */
  await rightClick(1);
  await runAct('others');
  s = await snap();
  ok('关闭其他：只剩 doc3', eq(s.keys, ['doc3.md']), s.keys);
  ok('关闭其他后激活基准 doc3', s.active === 'doc3.md', s.active);
  ok('关闭其他不隐藏标签栏', s.barHidden === false);

  /* D4 关闭所有 */
  await reset6();
  await rightClick(4);
  await runAct('all');
  s = await snap();
  ok('关闭所有：标签清空', s.keys.length === 0, s.keys);
  ok('关闭所有：标签栏隐藏', s.barHidden === true);
  ok('关闭所有：回欢迎屏', s.welcome === true);
  ok('关闭所有：无激活项', s.active === null, s.active);
  ok('关闭所有：文件树 6 条完整保留', s.treeCount === 6, s.treeCount);
  ok('关闭所有后菜单已收起', (await menuState()).hidden === true);

  /* D5 关闭单个：非激活项 → 激活项不变 */
  await reset6();
  await rightClick(4);
  await runAct('one');
  s = await snap();
  ok('关闭非激活的 doc5：剩 5 个且不含 doc5',
    eq(s.keys, ['doc1.md', 'doc2.md', 'doc3.md', 'doc4.md', 'doc6.md']), s.keys);
  ok('关闭非激活项不改变当前激活', s.active === 'doc1.md', s.active);

  /* D6 关闭单个：激活项 → 优先右侧邻居 */
  await rightClick(0);
  await runAct('one');
  s = await snap();
  ok('关闭激活的 doc1：激活右邻 doc2', s.active === 'doc2.md', s.active);

  /* D7 关闭最后一个激活项 → 回落左邻 */
  await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[3].click());
  await p.waitForTimeout(700);
  s = await snap();
  ok('先激活末位 doc6', s.active === 'doc6.md', s.active);
  await rightClick(3);
  await runAct('one');
  s = await snap();
  ok('关闭末位激活项：回落左邻 doc4', s.active === 'doc4.md', s.active);

  /* D8 关闭右侧时基准就是激活项 → 保持不动 */
  await reset6();
  await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[2].click());
  await p.waitForTimeout(700);
  await rightClick(2);
  await runAct('right');
  s = await snap();
  ok('基准即激活项时关闭右侧：激活仍是 doc3', s.active === 'doc3.md', s.active);
  ok('剩余序列正确', eq(s.keys, ['doc1.md', 'doc2.md', 'doc3.md']), s.keys);

  /* ---------------- E. 未保存保护 ---------------- */
  console.log('\n[E] 未保存保护（原子性）');
  await reset6();
  /* 让 doc1 进入编辑态并改脏 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = ed.value + '\n\n未保存的新内容';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  ok('已进入脏态', await p.evaluate(() => /未保存/.test(document.getElementById('stDirty').textContent)));

  /* E1 取消 → 整批不动 */
  confirmLog = [];
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.dismiss(); });
  await rightClick(0);
  await runAct('all');
  s = await snap();
  ok('脏标签触发确认弹窗', confirmLog.length === 1, confirmLog);
  ok('确认文案点名文档', /doc1\.md/.test(confirmLog[0] || ''), confirmLog[0]);
  ok('取消后 6 个标签一个不少（原子）', s.keys.length === 6, s.keys);
  ok('取消后激活项不变', s.active === 'doc1.md', s.active);
  ok('取消后仍在编辑态', await p.evaluate(() => document.documentElement.dataset.editing === '1'));

  /* E2 待关集合不含脏标签 → 不弹窗，直接执行 */
  confirmLog = [];
  await rightClick(0);           // 基准 doc1（脏），关闭右侧不含 doc1
  await runAct('right');
  s = await snap();
  ok('待关集合不含脏标签时不打断', confirmLog.length === 0, confirmLog);
  ok('关闭右侧成功：只剩脏的 doc1', eq(s.keys, ['doc1.md']), s.keys);
  ok('脏标签本体保留', s.active === 'doc1.md', s.active);

  /* E3 确认放行 → 按语义关闭 */
  confirmLog = [];
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.accept(); });
  await rightClick(0);
  await runAct('all');
  s = await snap();
  ok('确认后弹出一次保护提示', confirmLog.length === 1, confirmLog);
  ok('确认后全部关闭', s.keys.length === 0 && s.welcome === true, s);
  ok('关闭后编辑态已复位', await p.evaluate(() => document.documentElement.dataset.editing === undefined));
  ok('关闭后未保存标记清空', await p.evaluate(() => document.getElementById('stDirty').textContent === ''));
  /* 防回归：退出编辑态时「段落」页签被藏，选中态必须交还「文件」，
     否则侧栏三个页签全未选中、面板空白、CR-06 胶囊停在 display:none 元素上 */
  const sideAfter = await p.evaluate(() => {
    const ts = [...document.querySelectorAll('.side-tabs .side-tab')];
    const on = ts.filter(x => x.classList.contains('active'));
    return {
      activeCount: on.length,
      activeTab: on[0] ? on[0].getAttribute('data-tab') : null,
      activeVisible: on[0] ? !on[0].classList.contains('hidden') : false,
      filesVisible: !document.getElementById('sideFiles').classList.contains('hidden'),
      sectionsHidden: document.getElementById('tabSections').classList.contains('hidden')
    };
  });
  ok('关闭后侧栏仍有且仅有一个选中页签', sideAfter.activeCount === 1, sideAfter);
  ok('选中页签交还给「文件」', sideAfter.activeTab === 'files', sideAfter);
  ok('选中页签可见（不是 display:none）', sideAfter.activeVisible === true, sideAfter);
  ok('文件面板可见（侧栏不空白）', sideAfter.filesVisible === true, sideAfter);
  ok('段落页签已隐藏', sideAfter.sectionsHidden === true, sideAfter);

  /* E4 新建未落盘文档同样受保护 */
  await reset6();
  await p.evaluate(() => document.getElementById('wNew') && document.getElementById('btnNew') && document.getElementById('btnNew').click());
  await p.waitForTimeout(400);
  const hasNew = await p.evaluate(() => {
    const b = document.getElementById('btnNew');
    if (b) { b.click(); return true; }
    return false;
  });
  await p.waitForTimeout(1200);
  const newKey = await p.evaluate(() => {
    const a = document.querySelector('#tabbar .tab.active');
    return a ? a.getAttribute('data-key') : null;
  });
  ok('新建文档已开成标签', !!newKey && /\.md$/.test(newKey), newKey);
  confirmLog = [];
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.dismiss(); });
  const beforeNew = await snap();
  await rightClick(beforeNew.keys.indexOf(newKey));
  await runAct('all');
  s = await snap();
  ok('新建未落盘触发保护', confirmLog.length >= 1, confirmLog);
  ok('取消后新建标签仍在', s.keys.indexOf(newKey) >= 0, s.keys);
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.accept(); });

  /* ---------------- F. 状态回收 ---------------- */
  console.log('\n[F] 状态回收 / 不串味');
  await reset6();
  /* 在 doc1 展开一张图表，制造 chartState 桶 */
  await p.evaluate(() => {
    const btn = document.querySelector('#content .tw-bar button[data-act="chart"]');
    if (btn) btn.click();
  });
  await p.waitForTimeout(700);
  const chartKeyMade = await p.evaluate(() => {
    /* 直接从 DOM 侧确认图表展开态存在；内部桶由下一步的行为验证 */
    return !!document.querySelector('#content .chart-box.show');
  });
  ok('doc1 已展开图表（用于验证回收）', chartKeyMade === true, chartKeyMade);
  /* 切到 doc2 让 doc1 的态落桶，再关掉 doc1 */
  await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[1].click());
  await p.waitForTimeout(900);
  await rightClick(0);
  await runAct('one');
  await p.waitForTimeout(500);
  s = await snap();
  ok('doc1 已关闭', s.keys.indexOf('doc1.md') < 0, s.keys);
  ok('文件树仍保留 doc1（可再点开）',
    await p.evaluate(() => [...document.querySelectorAll('#sideFiles .tree-item .fn')].some(x => x.textContent === 'doc1.md')));
  /* 重新点开 doc1，图表应从干净态开始（桶已回收） */
  await p.evaluate(() => {
    const it = [...document.querySelectorAll('#sideFiles .tree-item')].find(x => x.querySelector('.fn').textContent === 'doc1.md');
    if (it) it.click();
  });
  await p.waitForTimeout(1400);
  ok('重新打开 doc1 图表回到收起态（桶已回收，不串旧态）',
    await p.evaluate(() => !document.querySelector('#content .chart-box.show')));
  ok('重新打开后标签数 +1', (await snap()).keys.length === 6, (await snap()).keys);
  /* 最近记录不受批量关闭影响 */
  const recentN = await p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('mdreader.recent') || '[]').length; } catch (e) { return -1; }
  });
  ok('最近记录未被批量关闭清空', recentN > 0, recentN);

  /* ---------------- G. 硬约束 ---------------- */
  console.log('\n[G] 既有硬约束未被破坏');
  await reset6();
  const geom = () => p.evaluate(() => {
    const bar = document.getElementById('tabbar');
    const act = document.querySelector('#tabbar .tab.active');
    const cs = getComputedStyle(bar), as = act ? getComputedStyle(act) : null;
    const r = act ? act.getBoundingClientRect() : null;
    return {
      barBg: cs.backgroundColor, barPos: cs.position, barZ: cs.zIndex,
      barPad: cs.padding, barGap: cs.gap, barH: Math.round(bar.getBoundingClientRect().height),
      actBg: as ? as.backgroundColor : null, actBorder: as ? as.borderTopColor : null,
      actShadow: as ? as.boxShadow : null,
      actPad: as ? as.padding : null, actRadius: as ? as.borderTopLeftRadius : null,
      actW: r ? Math.round(r.width) : null, actH: r ? Math.round(r.height) : null,
      hasPill: !!bar.querySelector('.lp-pill'), isLpHost: bar.classList.contains('lp-host')
    };
  });
  /* 基线口径说明：皮肤块 html[data-layout="card"] 会把 --panel-2 覆写为 #f4f4f5，
     所以标签栏真实基线是 rgb(244,244,245) 而非 :root 的 #fafbfc。
     这里同时锁「= 当前 --panel-2 计算值」与「= 皮肤精确色值」两条，强度不降。 */
  const vNow = await p.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:-9999px;background:var(--panel-2)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor; d.remove(); return c;
  });
  const g0 = await geom();
  ok('标签栏底色 = 当前 --panel-2 计算值', g0.barBg === vNow, [g0.barBg, vNow]);
  ok('标签栏底色 = card 皮肤精确基线 rgb(244,244,245)', g0.barBg === 'rgb(244, 244, 245)', g0.barBg);
  ok('标签栏仍是 sticky / z-index 6', g0.barPos === 'sticky' && g0.barZ === '6', [g0.barPos, g0.barZ]);
  ok('标签栏内边距未变', g0.barPad === '4px 6px 0px', g0.barPad);
  ok('活动标签底色仍为 --panel 白', g0.actBg === 'rgb(255, 255, 255)', g0.actBg);
  /* Chromium 把 inset 关键字序列化到末尾，按分量断言而非字面前缀 */
  ok('活动标签顶部强调线仍在（2px inset 强调色）',
    /0px 2px 0px 0px inset/.test(g0.actShadow || '') && /rgb\(37, 99, 235\)/.test(g0.actShadow || ''), g0.actShadow);
  ok('活动标签内边距未变', g0.actPad === '6px 6px 6px 11px', g0.actPad);
  ok('活动标签圆角未变（9px 9px 0 0）', g0.actRadius === '9px', g0.actRadius);
  ok('标签栏没有被塞进胶囊宿主', g0.hasPill === false && g0.isLpHost === false, [g0.hasPill, g0.isLpHost]);

  /* 开关菜单前后几何完全一致 */
  await rightClick(2);
  const g1 = await geom();
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const g2 = await geom();
  ok('弹出菜单不改标签栏/活动标签任何几何',
    eq([g1.barH, g1.actW, g1.actH, g1.actPad], [g0.barH, g0.actW, g0.actH, g0.actPad]), [g0, g1]);
  ok('收起菜单后几何复原', eq([g2.barH, g2.actW, g2.actH], [g0.barH, g0.actW, g0.actH]), [g0, g2]);

  /* CR-06 胶囊仍精确落位（侧栏页签宿主） */
  const pill = await p.evaluate(() => {
    const h = document.querySelector('.side-tabs'), p = h && h.querySelector(':scope > .lp-pill');
    const on = h && h.querySelector('.side-tab.active');
    if (!p || !on) return null;
    const pr = p.getBoundingClientRect(), or = on.getBoundingClientRect();
    return { dw: +(pr.width - or.width).toFixed(1), dl: +(pr.left - or.left).toFixed(1), on: p.classList.contains('on') };
  });
  ok('CR-06 侧栏胶囊仍精确落位', pill && pill.on && Math.abs(pill.dw) <= 1 && Math.abs(pill.dl) <= 1, pill);

  /* 三主题 × 柔光：菜单材质跟着 chrome 变量走 */
  console.log('\n[G2] 三主题 × 柔光 菜单材质联动 + 可读性');
  const menuInk = () => p.evaluate(() => {
    const m = document.getElementById('tabMenu');
    const it = m.querySelector('.tm-item:not([disabled])');
    const dz = m.querySelector('.tm-item.danger');
    const cs = getComputedStyle(m), is = getComputedStyle(it);
    /* 用一个只消费 --panel 的探针元素读出变量的真实计算色，
       避免手写 hex→rgb 转换（变量可能是 hex / rgb / 渐变，格式不统一） */
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;background:var(--panel);border-color:var(--border)';
    document.body.appendChild(probe);
    const pc = getComputedStyle(probe);
    const want = { panel: pc.backgroundColor, border: pc.borderTopColor };
    probe.remove();
    return {
      bg: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow,
      fg: is.color, dangerFg: dz ? getComputedStyle(dz).color : null,
      wantPanel: want.panel, wantBorder: want.border,
      pm: document.documentElement.getAttribute('data-pm'),
      theme: document.documentElement.getAttribute('data-theme')
    };
  });
  const setTheme = async th => { await p.evaluate(t => document.getElementById('skin' + t).click(), th); await p.waitForTimeout(650); };
  for (const th of ['Light', 'Dark', 'Sepia']) {
    await setTheme(th);
    await rightClick(2);
    const mi = await menuInk();
    const bg = parseRgb(mi.bg), fg = parseRgb(mi.fg);
    const cr = bg && fg ? contrast(over(fg.c, fg.a, bg.c), bg.c) : 0;
    ok(th + ' 菜单底色 = 当前 --panel', mi.bg === mi.wantPanel, [mi.bg, mi.wantPanel]);
    ok(th + ' 菜单描边 = 当前 --border', mi.border === mi.wantBorder, [mi.border, mi.wantBorder]);
    ok(th + ' 菜单文字对比度 ≥ 4.5:1', cr >= 4.5, { cr, bg: mi.bg, fg: mi.fg });
    await p.keyboard.press('Escape'); await p.waitForTimeout(160);
  }
  /* 柔光开关口径：#btnPaperMatte 是「开关 + 参数面板」复合控件 ——
     点文字只会开启并弹面板，不会关闭。真正的双态开关是 .sw-track 与设置面板的 #setPm。
     这里用 #setPm（纯状态切换，不弹面板），避免面板遮挡影响后续取样。 */
  const setPM = async on => {
    await p.evaluate(want => {
      const cur = document.documentElement.getAttribute('data-pm') === 'on';
      if (cur !== want) document.getElementById('setPm').click();
    }, on);
    await p.waitForTimeout(850);
  };
  await setTheme('Light');
  const coldMenu = await (async () => { await rightClick(2); const x = await menuInk(); await p.keyboard.press('Escape'); await p.waitForTimeout(160); return x; })();
  await setPM(true);
  await rightClick(2);
  const warmMenu = await menuInk();
  ok('柔光已开启', warmMenu.pm === 'on', warmMenu.pm);
  ok('柔光下菜单底色切到暖色板', warmMenu.bg !== coldMenu.bg, [coldMenu.bg, warmMenu.bg]);
  const wb = parseRgb(warmMenu.bg);
  ok('柔光下菜单底色偏暖（R > B）', wb && wb.c[0] > wb.c[2], wb && wb.c);
  const wfg = parseRgb(warmMenu.fg);
  ok('柔光下菜单文字对比度 ≥ 4.5:1', wb && wfg ? contrast(over(wfg.c, wfg.a, wb.c), wb.c) >= 4.5 : false,
    { bg: warmMenu.bg, fg: warmMenu.fg });
  ok('柔光下菜单定位仍是 fixed 且落在视口内',
    await p.evaluate(() => {
      const m = document.getElementById('tabMenu'), r = m.getBoundingClientRect();
      return getComputedStyle(m).position === 'fixed' && r.left >= 0 && r.top >= 0 && r.right <= 1400 && r.bottom <= 900;
    }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(160);
  await setPM(false);
  ok('柔光已关闭', await p.evaluate(() => document.documentElement.getAttribute('data-pm') === null));
  const backMenu = await (async () => { await rightClick(2); const x = await menuInk(); await p.keyboard.press('Escape'); await p.waitForTimeout(160); return x; })();
  ok('关柔光后菜单底色回退到冷色基线', backMenu.bg === coldMenu.bg, [backMenu.bg, coldMenu.bg]);

  /* ---------------- H. 无障碍与键盘 ---------------- */
  console.log('\n[H] 键盘可达性 / aria / 焦点归还');
  await reset6();
  const aria = await p.evaluate(() => {
    const bar = document.getElementById('tabbar');
    const ts = [...bar.querySelectorAll('.tab')];
    return {
      barRole: bar.getAttribute('role'),
      roles: ts.map(t => t.getAttribute('role')),
      tabindex: ts.map(t => t.getAttribute('tabindex')),
      selected: ts.map(t => t.getAttribute('aria-selected')),
      haspopup: ts.map(t => t.getAttribute('aria-haspopup')),
      xTab: ts.map(t => t.querySelector('.tab-x').getAttribute('tabindex')),
      menuRole: document.getElementById('tabMenu').getAttribute('role'),
      menuLabel: document.getElementById('tabMenu').getAttribute('aria-label')
    };
  });
  ok('标签栏 role=tablist', aria.barRole === 'tablist', aria.barRole);
  ok('每个标签 role=tab', aria.roles.every(r => r === 'tab'), aria.roles);
  ok('每个标签 tabindex=0', aria.tabindex.every(r => r === '0'), aria.tabindex);
  ok('aria-selected 只有一项 true', aria.selected.filter(x => x === 'true').length === 1, aria.selected);
  ok('选中标记落在激活标签上', aria.selected[0] === 'true', aria.selected);
  ok('每个标签 aria-haspopup=menu', aria.haspopup.every(r => r === 'menu'), aria.haspopup);
  ok('✕ 按钮 tabindex=-1', aria.xTab.every(r => r === '-1'), aria.xTab);
  ok('菜单 role=menu + aria-label', aria.menuRole === 'menu' && aria.menuLabel === '标签页操作', [aria.menuRole, aria.menuLabel]);

  /* Shift+F10 唤出 */
  await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[2].focus());
  await p.waitForTimeout(150);
  await p.keyboard.press('Shift+F10');
  await p.waitForTimeout(260);
  m = await menuState();
  ok('Shift+F10 唤出菜单', m.hidden === false);
  ok('键盘唤出基准 = 聚焦的 doc3', m.base === 'doc3.md', m.base);
  ok('菜单项 role=menuitem',
    await p.evaluate(() => [...document.querySelectorAll('#tabMenu .tm-item')].every(x => x.getAttribute('role') === 'menuitem')));
  ok('分隔线 role=separator',
    await p.evaluate(() => document.querySelector('#tabMenu .tm-sep').getAttribute('role') === 'separator'));
  ok('首项获焦', m.focus === 'one', m.focus);
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(120);
  ok('↓ 移到「关闭其他」', (await menuState()).focus === 'others', (await menuState()).focus);
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);
  ok('↓ 移到「关闭右侧」', (await menuState()).focus === 'right');
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
  ok('↑ 回到「关闭其他」', (await menuState()).focus === 'others');
  await p.keyboard.press('End'); await p.waitForTimeout(120);
  ok('End 跳到末项「关闭所有」', (await menuState()).focus === 'all');
  await p.keyboard.press('Home'); await p.waitForTimeout(120);
  ok('Home 跳到首项「关闭」', (await menuState()).focus === 'one');
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
  ok('首项再 ↑ 循环到末项', (await menuState()).focus === 'all');
  await p.keyboard.press('Escape'); await p.waitForTimeout(220);
  ok('Esc 收起菜单', (await menuState()).hidden === true);
  ok('Esc 后焦点归还标签本体',
    await p.evaluate(() => document.activeElement === document.querySelectorAll('#tabbar .tab')[2]));
  /* Tab 也应收起并归还焦点 */
  await p.keyboard.press('Shift+F10'); await p.waitForTimeout(240);
  await p.keyboard.press('Tab'); await p.waitForTimeout(220);
  ok('Tab 收起菜单', (await menuState()).hidden === true);
  ok('Tab 后焦点归还标签',
    await p.evaluate(() => document.activeElement === document.querySelectorAll('#tabbar .tab')[2]));
  /* Enter 执行 */
  await p.keyboard.press('Shift+F10'); await p.waitForTimeout(240);
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);   // others
  await p.keyboard.press('Enter'); await p.waitForTimeout(950);
  s = await snap();
  ok('Enter 执行「关闭其他」', eq(s.keys, ['doc3.md']) && s.active === 'doc3.md', s);
  /* 标签间左右方向键 */
  await reset6();
  await p.evaluate(() => document.querySelectorAll('#tabbar .tab')[1].focus());
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  ok('→ 焦点移到下一个标签',
    await p.evaluate(() => document.activeElement === document.querySelectorAll('#tabbar .tab')[2]));
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  ok('← 焦点移回上一个标签',
    await p.evaluate(() => document.activeElement === document.querySelectorAll('#tabbar .tab')[1]));
  await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  ok('Enter 激活聚焦标签', (await snap()).active === 'doc2.md', (await snap()).active);
  /* 点别处收起 */
  await rightClick(2);
  await p.mouse.click(700, 600); await p.waitForTimeout(220);
  ok('点击正文区收起菜单', (await menuState()).hidden === true);
  /* 正文右键保持原生（未被 preventDefault） */
  const nativeCtx = await p.evaluate(() => {
    const el = document.querySelector('#content p') || document.getElementById('content');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 700, clientY: 500 });
    el.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, menuHidden: document.getElementById('tabMenu').hasAttribute('hidden') };
  });
  ok('正文右键未被接管（原生菜单可用）', nativeCtx.prevented === false, nativeCtx);
  ok('正文右键不弹标签菜单', nativeCtx.menuHidden === true);

  /* ---------------- I. 英文界面 + 降级 ---------------- */
  console.log('\n[I] 英文界面 / 打印 / 减弱动效 / 零错误');
  await reset6();
  await p.evaluate(() => {
    const sel = document.getElementById('setLang');
    sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1600);
  await rightClick(2);
  m = await menuState();
  ok('英文界面菜单项全英文',
    eq(m.items.map(x => x.label), ['Close', 'Close Others', 'Close to the Right', 'Close to the Left', 'Close All']),
    m.items.map(x => x.label));
  ok('英文菜单无残留中文', m.items.every(x => !/[\u4e00-\u9fff]/.test(x.label)), m.items.map(x => x.label));
  ok('英文菜单仍完整在视口内', m.rect.l >= 0 && m.rect.t >= 0 && m.rect.r <= 1400 && m.rect.b <= 900, m.rect);
  ok('英文菜单宽度自适应（不溢出容器）',
    await p.evaluate(() => {
      const m = document.getElementById('tabMenu');
      return [...m.querySelectorAll('.tm-item')].every(x => x.scrollWidth <= x.clientWidth + 1);
    }));
  const enInk = await menuInk();
  const eb = parseRgb(enInk.bg), ef = parseRgb(enInk.fg);
  ok('英文界面对比度 ≥ 4.5:1', eb && ef ? contrast(over(ef.c, ef.a, eb.c), eb.c) >= 4.5 : false, enInk);
  /* 英文态执行一次，确认 toast 也是英文 */
  await runAct('right');
  const enToast = await p.evaluate(() => document.getElementById('toast').textContent);
  ok('英文 toast 无中文', !/[\u4e00-\u9fff]/.test(enToast), enToast);
  ok('英文 toast 语义正确', /Tabs to the right closed/.test(enToast), enToast);
  s = await snap();
  ok('英文界面关闭语义一致', eq(s.keys, ['doc1.md', 'doc2.md', 'doc3.md']) && s.active === 'doc3.md', s);
  /* 英文保护提示 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value += '\n\ndirty'; ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(250);
  confirmLog = [];
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.dismiss(); });
  await rightClick(2);
  await runAct('all');
  ok('英文保护提示无中文', confirmLog.length === 1 && !/[\u4e00-\u9fff]/.test(confirmLog[0]), confirmLog);
  ok('英文保护提示点名文档', /doc3\.md/.test(confirmLog[0] || ''), confirmLog[0]);
  ok('英文态取消同样原子', (await snap()).keys.length === 3, (await snap()).keys);
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { confirmLog.push(d.message()); await d.accept(); });
  /* 切回中文 */
  await p.evaluate(() => {
    const sel = document.getElementById('setLang');
    sel.value = 'zh-CN'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1500);
  await rightClick(1);
  m = await menuState();
  ok('切回中文菜单恢复中文', eq(m.items.map(x => x.label), ['关闭', '关闭其他', '关闭右侧', '关闭左侧', '关闭所有']),
    m.items.map(x => x.label));
  await p.keyboard.press('Escape'); await p.waitForTimeout(160);

  /* 打印降级 */
  await p.emulateMedia({ media: 'print' });
  await rightClick(1);
  ok('打印媒介下菜单隐藏',
    await p.evaluate(() => getComputedStyle(document.getElementById('tabMenu')).display === 'none'));
  await p.emulateMedia({ media: 'screen' });
  await p.waitForTimeout(200);
  /* 减弱动效 */
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await rightClick(1);
  ok('减弱动效下菜单无动画',
    await p.evaluate(() => getComputedStyle(document.getElementById('tabMenu')).animationName === 'none'));
  ok('减弱动效下菜单功能仍正常', (await menuState()).hidden === false);
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  /* 收尾：关闭所有回到干净态 */
  await reset6();
  await rightClick(0);
  await runAct('all');
  s = await snap();
  ok('收尾关闭所有成功', s.keys.length === 0 && s.welcome === true, s);

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 5));

  console.log('\n============================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('============================================');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });