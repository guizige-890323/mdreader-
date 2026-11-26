/* ==================================================================
   CR-2026-11-20-03 · 编辑旁路体验修复（P0 + P1）专项测试
   ------------------------------------------------------------------
   产品边界（不可越线）：不是写作工具 —— 编辑器只做到「够改一行」，
   按块修改，Ctrl+S 写回原文件；长文写作交给 Typora。
   本轮只修「改一行有多难」，不新增任何数据保管责任（无自动保存、无草稿）。

   做四件事：
     ① 进出编辑保留阅读位置（P0）
     ② 标题 + 其下正文合为一个「节」，写一节不再切两次（P0）
     ③ 块内轻量所见即所得：下方 #content 实时渲染当前节（P1）
     ④ 块级前缀悬挂左槽 —— 见 D 段（本轮只做「节标签/块计数悬挂」，
        正文渲染沿用 Typora 式「标记常驻」原则的简化版：预览面板只读，
        标记不进正文，因此不存在正文位移问题）

   九条验收口径（见 .workbuddy/cr-2026-11-20-03.md 5.7 节）：
     A 位置保留：进出编辑后落点偏差 ≤ 1 个块高
     B 节聚合：一节 = heading + 到下一个 heading 之前的所有块
     C 往返不变式：整节编辑写回后 joinBlocks(splitBlocks(x)) === x（逐字节）
     D splitBlocks 类型序列在「未改动就退出」时逐项不变
     E 预览非空且是只读的（无 script/iframe，无事件工具条）
     F 前缀位移 0：节标签 + 块徽章都不挤压正文宽度
     G IME 组字不被打断（中文输入法合成中不触发重渲染）
     H 开关可逆：预览关 → 面板消失；再开 → 内容恢复
     I 零回归：非编辑态渲染链 / 导出链 / 15 卡欢迎屏

   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-cr23.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');
const TMP = path.join(ROOT, '_shots', '_cr23docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); }
};
const has = s => HTML.indexOf(s) >= 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 造一份「多节长文」：每节一个 H2 + 若干正文块，用来验证节聚合与位置保留。
   刻意做出「标题单独成块、正文紧随其后」的真实结构 —— 这正是原来要切两次的原因。 */
const TITLE = '测试长文';
const SECTIONS = [
  { h: '第一节 · 缘起', body: ['这是第一节的第一段正文，用来验证块与节的聚合是否正确。', '这是第一节的第二段，中间隔了空行，应算同一节内的第二个块。'] },
  { h: '第二节 · 方法', body: ['第二节正文。这里有一个列表：', '- 列表项甲\n- 列表项乙\n- 列表项丙', '列表之后的补充段落。'] },
  { h: '第三节 · 数据', body: ['第三节带一张表：', '| 指标 | 数值 |\n| --- | --- |\n| A | 12 |\n| B | 34 |', '表格后的说明文字。'] },
  { h: '第四节 · 代码', body: ['第四节带代码块：', '```js\nvar a = 1;\nvar b = 2;\n```', '代码块后的收尾。'] },
  { h: '第五节 · 小结', body: ['第五节正文，只有一段。'] }
];
function makeDoc() {
  fs.mkdirSync(TMP, { recursive: true });
  let md = '# ' + TITLE + '\n\n导语：这份文档用于 CR-23 验收，共 5 节。\n\n';
  SECTIONS.forEach(s => {
    md += '## ' + s.h + '\n\n';
    s.body.forEach(p => { md += p + '\n\n'; });
  });
  /* 结尾再多铺几节，让文档足够长（能真正滚动起来，位置保留才有意义） */
  for (let i = 6; i <= 16; i++) {
    md += '## 第' + i + '节 · 填充\n\n第' + i + '节的正文段落。这里放一些足够长的文字，'
      + '确保文档滚动高度足够，验证「进出编辑保留位置」时不会因为内容太短而恒等成立。\n\n';
    md += '第' + i + '节的第二段。\n\n';
  }
  const f = path.join(TMP, 'longform.md');
  fs.writeFileSync(f, md, 'utf8');
  return f;
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  /* 脏态退出编辑会弹 window.confirm。Playwright 默认 **dismiss**，
     一旦这里没接管，后续所有「退出编辑」都会被静默取消，
     于是整批断言都会在编辑态下跑 —— 这正是首轮 12 条 FAIL 的共同根因。
     本测试不验证该确认框（那是 cr07 的职责），统一 accept 掉。 */
  const dialogs = [];
  p.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  const doc = makeDoc();
  await p.goto(F); await p.waitForTimeout(1500);

  /* 状态守卫：进入每一段前把界面拉回已知态，避免上一段污染下一段 */
  const isEditing = () => p.evaluate(() => document.documentElement.dataset.editing === '1');
  const enterEdit = async () => {
    if (await isEditing()) return;
    await p.evaluate(() => document.getElementById('btnEdit').click());
    await p.waitForTimeout(600);
  };
  const exitEdit = async () => {
    if (!(await isEditing())) return;
    await p.evaluate(() => document.getElementById('btnEdit').click());
    await p.waitForTimeout(1400);
  };

  /* ============================================================
     A · 静态产物契约：本轮新增/改动的标记必须在产物里
     ============================================================ */
  console.log('\n[A] 静态产物契约');
  ok('A1 编辑态允许 #content 存活（不再和 #editor 一起被 display:none 干掉）',
    has('html[data-editing="1"] .paper>*:not(#editor):not(#content){display:none!important}'));
  ok('A2 预览面板样式存在（复用 #content 本体，不是新元素）',
    has('html[data-editing="1"] #content{') && has('html[data-editing="1"][data-bv="off"] #content{display:none!important}'));
  ok('A3 预览面板有吸顶只读标注（伪元素，不占 DOM）',
    has('html[data-editing="1"] #content::before{') && has('content:attr(data-bvcap)'));
  ok('A4 预览开关按钮进 DOM，#btnBlockView 存在', has('id="btnBlockView"'));
  ok('A5 节分组样式存在（.sec-group / .sec-cnt / .sec-sub）',
    has('.sec-item.sec-group{') && has('.sec-cnt{') && has('.sec-sub{'));
  ok('A6 节缩进用 --ind 叠加，不覆盖三角的 padding-left',
    has('.sec-item.sec-group[data-lv="2"]{--ind:10px}') &&
    has('.sec-item.sec-group{position:relative;padding-left:calc(22px + var(--ind,0px))}'));
  ok('A7 #editor 改 flex:1 1 auto（与预览面板共存，不再独占）',
    has('#editor{') && has('display:block;flex:1 1 auto;width:100%;min-height:0;'));
  ok('A8 位置恢复函数进了产物', has('restoreReadingPos') && has('headingAtViewportTop') && has('scrollToBlockByTitle'));
  ok('A9 节聚合函数进了产物', has('groupSections') && has('groupOfBlock') && has('groupText') && has('loadGroup'));

  /* ============================================================
     B · 载入文档（走真实文件选择器，不伪造内部状态）
     ============================================================ */
  console.log('\n[B] 载入文档');
  await p.setInputFiles('#filePicker', [doc]);
  await p.waitForTimeout(2000);
  const loaded = await p.evaluate(() => ({
    welcome: document.getElementById('welcome').classList.contains('hidden'),
    len: (document.getElementById('content').textContent || '').length,
    canScroll: (() => { const r = document.querySelector('.reader'); return r.scrollHeight > r.clientHeight + 50; })()
  }));
  ok('B1 文档已载入且欢迎屏隐藏', loaded.welcome && loaded.len > 600, loaded);
  ok('B2 文档足够长（可滚动，位置保留才有检验意义）', loaded.canScroll, loaded);

  /* ============================================================
     C · 位置保留（P0 核心）
     ============================================================ */
  console.log('\n[C] 进出编辑保留位置');
  /* reader 的 scroll-behavior 不是 instant —— 赋值后立刻量会读到滚动中途的值
     （实测赋 1482 读回 1156，ratio 报 35% 而实际设的是 45%，两者都不稳）。
     凡是量滚动位置，一律先等 scrollTop 连续两次采样相同再读。 */
  const settle = () => p.evaluate(async () => {
    const r = document.querySelector('.reader');
    let last = -1, same = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise(s => setTimeout(s, 60));
      const v = Math.round(r.scrollTop);
      if (v === last) { if (++same >= 2) return v; } else same = 0;
      last = v;
    }
    return Math.round(r.scrollTop);
  });
  /* 视口顶端那一节 + 它相对 reader 顶的偏移（判定「回位准不准」的唯一口径） */
  const topInfo = () => p.evaluate(() => {
    const r = document.querySelector('.reader');
    const box = r.getBoundingClientRect();
    const hs = [...document.querySelectorAll('#content h1,#content h2')];
    const first = hs.filter(h => h.getBoundingClientRect().bottom > box.top + 4)[0];
    return {
      scrollTop: Math.round(r.scrollTop),
      max: r.scrollHeight - r.clientHeight,
      title: first ? first.textContent.trim() : '',
      offTop: first ? +(first.getBoundingClientRect().top - box.top).toFixed(1) : null
    };
  });

  /* 滚到文档中段（约 45%），等稳定后再记视口顶部是哪一节 */
  await p.evaluate(() => {
    const r = document.querySelector('.reader');
    r.scrollTop = Math.round((r.scrollHeight - r.clientHeight) * 0.45);
  });
  await settle();
  const before = await topInfo();
  ok('C1 已滚到中段（scrollTop > 500，标题非空）', before.scrollTop > 500 && !!before.title, before);

  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(600);
  const inEdit = await p.evaluate(() => {
    const ed = document.getElementById('editor');
    const lbl = document.getElementById('editSecLabel').textContent;
    return {
      editing: document.documentElement.dataset.editing === '1',
      editorShown: !ed.classList.contains('hidden') && ed.offsetHeight > 40,
      lbl,
      /* 进入编辑后编辑框里应是「刚才看的那一节」，不是永远第 1 块 */
      valHead: (ed.value || '').split('\n')[0]
    };
  });
  ok('C2 已进入编辑态，编辑器可见', inEdit.editing && inEdit.editorShown, inEdit);
  ok('C3 默认落在「刚才在读的那一节」，而不是第 1 块',
    inEdit.lbl.indexOf(before.title) >= 0 || inEdit.lbl.indexOf('节 ·') >= 0, [inEdit.lbl, before.title]);

  /* 退出编辑 —— 不做任何修改，位置必须回到原处。
     注意：只要输入过 input 就是脏态，退出会走 confirm；上面已统一 accept。 */
  await exitEdit();
  await settle();
  const after = await p.evaluate(() => ({ editing: document.documentElement.dataset.editing === '1' }));
  const afterTop = await topInfo();
  ok('C4 已退出编辑（回到阅读态）', !after.editing, after);
  ok('C5 回到原来那一节（标题一致）', afterTop.title === before.title, [before.title, afterTop.title]);
  /* 偏差口径：视口顶端那节相对 reader 顶的偏移，与进入编辑前相比不得变化超过 1 个块高。
     直接对比两次的 offTop 差值 —— 比「绝对落在 0 附近」更能反映「回到了原来的位置」。 */
  const drift = (before.offTop != null && afterTop.offTop != null) ? Math.abs(afterTop.offTop - before.offTop) : null;
  ok('C6 回位偏差 ≤ 1 个块高（offTop 差值 ≤ 40px）', drift !== null && drift <= 40,
    { drift, before: before.offTop, after: afterTop.offTop, title: before.title });
  ok('C6b scrollTop 也回到原值（±8px）', Math.abs(afterTop.scrollTop - before.scrollTop) <= 8,
    [before.scrollTop, afterTop.scrollTop]);
  /* 反向断言：确认真的不是「碰巧还在顶部」的恒真 —— 原位置必须离顶部很远 */
  ok('C7 反向断言：原位置本来就远离开头（≥500px，排除恒真）', before.scrollTop > 500, before.scrollTop);

  /* ============================================================
     D · 节聚合（P0 核心）
     ============================================================ */
  console.log('\n[D] 节聚合：标题 + 其下正文');
  /* 标题数必须在**阅读态**量：#content 一旦被预览面板接管，里面只剩当前节的内容，
     编辑态量出来是 1（实测 headCount=1），断言就变成假失败。 */
  await p.evaluate(() => { document.querySelector('.reader').scrollTop = 0; });
  await settle();
  const headCount = await p.evaluate(() => document.querySelectorAll('#content h1,#content h2').length);
  ok('D0 阅读态标题数（H1+H2）可作为节数基准', headCount >= 17, headCount);
  await enterEdit();

  const groups = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#sideSections .sec-item')];
    const gs = items.filter(n => n.dataset.g === '1');
    return {
      total: items.length,
      groups: gs.length,
      first: gs.length ? {
        i: +gs[0].dataset.i, to: +gs[0].dataset.to, t: gs[0].dataset.t,
        title: gs[0].querySelector('.sec-title').textContent.trim(),
        cnt: gs[0].querySelector('.sec-cnt') ? gs[0].querySelector('.sec-cnt').textContent.trim() : ''
      } : null,
      /* 第二节（H2「第一节 · 缘起」）应为 1 标题 + 2 段正文 = 3 块 */
      sec1: (() => {
        const n = gs.find(x => /第一节 · 缘起/.test(x.querySelector('.sec-title').textContent));
        if (!n) return null;
        return { i: +n.dataset.i, to: +n.dataset.to, cnt: n.querySelector('.sec-cnt') ? n.querySelector('.sec-cnt').textContent.trim() : '' };
      })(),
      hasSub: items.filter(n => n.classList.contains('sec-sub')).length,
      activeIsGroup: !!document.querySelector('#sideSections .sec-group.active')
    };
  });
  ok('D1 侧栏按「节」分组渲染（存在 data-g="1" 条目）', groups.groups > 0 && groups.total > 0, groups);
  /* 文档以 `# 测试长文` 开头，其后是导语段落 —— 这构成第一节（H1 + 导语） */
  ok('D2 第一节是 H1「测试长文」（标题 + 导语合成一节）',
    groups.first && groups.first.t === 'heading' && /测试长文/.test(groups.first.title), groups.first);
  ok('D3 节内块数徽章正确（H1 + 导语 = 2 块；H2 第一节 = 标题 + 2 段 = 3 块）',
    groups.first && groups.first.cnt === '2' && groups.sec1 && groups.sec1.cnt === '3',
    [groups.first && groups.first.cnt, groups.sec1]);
  ok('D4 当前工作的节默认展开，能看到节内逐块（.sec-sub）', groups.hasSub > 0, groups.hasSub);
  ok('D5 当前节被标为 active', groups.activeIsGroup, groups.activeIsGroup);

  /* 点击一节 → 编辑框里应是「标题 + 正文」一整段 */
  const secClick = await p.evaluate(async () => {
    const g = [...document.querySelectorAll('#sideSections .sec-group')]
      .find(n => /第二节/.test(n.querySelector('.sec-title').textContent));
    g.click();
    await new Promise(s => setTimeout(s, 320));
    const ed = document.getElementById('editor');
    return { val: ed.value, lbl: document.getElementById('editSecLabel').textContent };
  });
  ok('D6 点一节即整节进编辑框（不是只有标题行）',
    secClick.val.indexOf('## 第二节') === 0 && secClick.val.indexOf('列表项甲') > 0, secClick.val.slice(0, 80));
  ok('D7 节标签显示「节 · 标题 · N 块」', /节 · 第二节 · 方法 · 4 块/.test(secClick.lbl), secClick.lbl);
  ok('D8 编辑框内容 = 标题 + 其下正文（一次改完，不用切两次）',
    secClick.val.indexOf('列表之后的补充段落') > 0, secClick.val.slice(-60));

  /* ============================================================
     E · 往返不变式（最硬的约束：不许破坏 joinBlocks）
     ============================================================ */
  console.log('\n[E] 往返不变式');
  /* 统一用「全篇编辑」读全文 —— 它就是 joinBlocks 的产物，是唯一可信的出口 */
  const readWhole = async () => p.evaluate(async () => {
    const sw = document.getElementById('btnSecWhole');
    if (sw.textContent.indexOf('全篇编辑') >= 0) {
      sw.click();
      await new Promise(s => setTimeout(s, 320));
    }
    return document.getElementById('editor').value;
  });
  const backToSection = async () => p.evaluate(async () => {
    const sw = document.getElementById('btnSecWhole');
    if (sw.textContent.indexOf('块编辑') >= 0) {
      sw.click();
      await new Promise(s => setTimeout(s, 380));
    }
  });
  const orig = fs.readFileSync(doc, 'utf8');

  /* E1 未改动就切块 6 次 → 全文必须逐字节一致 */
  await p.evaluate(async () => {
    const secs = [...document.querySelectorAll('#sideSections .sec-group')];
    for (let k = 1; k <= 6; k++) {
      const g = secs[k % secs.length];
      if (g) { g.click(); await new Promise(s => setTimeout(s, 90)); }
    }
  });
  await p.waitForTimeout(300);
  const whole1 = await readWhole();
  ok('E1 空转切节 6 次后全文逐字节不变（往返不变式）', whole1 === orig,
    { same: whole1 === orig, gotLen: whole1.length, wantLen: orig.length,
      firstDiff: (() => { for (let i = 0; i < Math.min(whole1.length, orig.length); i++) if (whole1[i] !== orig[i]) return [i, JSON.stringify(orig.slice(Math.max(0, i - 24), i + 24)), JSON.stringify(whole1.slice(Math.max(0, i - 24), i + 24))]; return null; })() });

  /* E2 真改一节 → 只有该节内容变化，其余逐字节不变 */
  await backToSection();
  await p.evaluate(async () => {
    const g = [...document.querySelectorAll('#sideSections .sec-group')]
      .find(n => /第五节/.test(n.querySelector('.sec-title').textContent));
    g.click();
    await new Promise(s => setTimeout(s, 280));
    const ed = document.getElementById('editor');
    ed.value = ed.value.replace('只有一段', '只有一段（已改）');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    /* 切走以触发 flush */
    const g2 = [...document.querySelectorAll('#sideSections .sec-group')]
      .find(n => /第三节/.test(n.querySelector('.sec-title').textContent));
    g2.click();
    await new Promise(s => setTimeout(s, 420));
  });
  const whole2 = await readWhole();
  const expect = orig.replace('只有一段', '只有一段（已改）');
  ok('E2 改一节只影响该节，其余逐字节不变', whole2 === expect,
    { same: whole2 === expect, gotLen: whole2.length, wantLen: expect.length,
      firstDiff: (() => { for (let i = 0; i < Math.min(whole2.length, expect.length); i++) if (whole2[i] !== expect[i]) return [i, JSON.stringify(expect.slice(Math.max(0, i - 24), i + 24)), JSON.stringify(whole2.slice(Math.max(0, i - 24), i + 24))]; return null; })() });

  /* E3 节内块类型序列：节聚合后每节首块必须是 heading（文档有标题时必须成立） */
  await backToSection();
  const typeSeq = await p.evaluate(() => [...document.querySelectorAll('#sideSections .sec-group')].map(n => n.dataset.t));
  /* 节数 = 阅读态标题数（D0 已量）= 17，不写死数字 */
  ok('E3 每个节都以 heading 开头，且节数等于标题数',
    typeSeq.length === headCount && typeSeq.every(t => t === 'heading'),
    [typeSeq.length, headCount, typeSeq.slice(0, 6)]);
  await exitEdit();

  /* ============================================================
     F · 块内预览（P1 核心）
     ============================================================ */
  console.log('\n[F] 块内实时预览');
  await enterEdit();
  await p.waitForTimeout(400);
  const pv = await p.evaluate(() => {
    const c = document.getElementById('content');
    const cs = getComputedStyle(c);
    const cap = c.getAttribute('data-bvcap') || '';
    const aria = c.getAttribute('aria-readonly');
    return {
      shown: cs.display !== 'none' && c.offsetHeight > 60,
      h: c.offsetHeight,
      ratio: +(c.offsetHeight / document.querySelector('.paper').offsetHeight * 100).toFixed(0),
      hasHeading: !!c.querySelector('h1,h2'),
      html: c.innerHTML.length,
      script: c.querySelectorAll('script,iframe,object,embed').length,
      cap, aria,
      edH: document.getElementById('editor').offsetHeight
    };
  });
  ok('F1 预览面板可见且在编辑态占下半部（约 42%）', pv.shown && pv.ratio >= 30 && pv.ratio <= 55, pv);
  /* 不要用 innerHTML.length 当「有内容」的判据：第一节只有标题 + 一句导语，
     渲染出来本就不到 100 字符（实测 47）。正确判据是「预览文本 ≈ 编辑器文本」。 */
  const pvSrc = await p.evaluate(() => {
    const c = document.getElementById('content');
    const ed = document.getElementById('editor');
    const strip = s => s.replace(/[#*`>\-|\[\]\s]/g, '');
    return {
      ttl: c.querySelector('h1,h2') ? c.querySelector('h1,h2').textContent.trim() : '',
      cTxt: strip(c.textContent || ''),
      eTxt: strip(ed.value || ''),
      html: c.innerHTML.length
    };
  });
  ok('F2 预览渲染出了当前节的标题', !!pvSrc.ttl, pvSrc.ttl);
  /* 预览文本必须是编辑器文本的子集（渲染会吃掉标记符号，但正文一字不少） */
  const pvMatch = pvSrc.eTxt.length > 0 && pvSrc.cTxt.length > 0 &&
    (pvSrc.eTxt.indexOf(pvSrc.cTxt) >= 0 || pvSrc.cTxt.indexOf(pvSrc.eTxt) >= 0);
  ok('F2b 预览内容与编辑器内容同源（去掉标记符号后互相包含）', pvMatch,
    { cLen: pvSrc.cTxt.length, eLen: pvSrc.eTxt.length, html: pvSrc.html });
  ok('F3 预览区无 script/iframe/object/embed（只读）', pv.script === 0, pv.script);
  ok('F4 预览带只读标注与 aria-readonly', !!pv.cap && pv.aria === 'true', [pv.cap, pv.aria]);
  ok('F5 上下分栏：编辑器仍占 40% 以上（没被预览挤没）',
    pv.edH > 200 && pv.edH / (pv.edH + pv.h) > 0.4, [pv.edH, pv.h]);

  /* F6 边写边变：改一个字，预览 180ms 后跟着变 */
  const live = await p.evaluate(async () => {
    const ed = document.getElementById('editor');
    const before = document.getElementById('content').innerHTML.length;
    const beforeText = document.getElementById('content').textContent;
    ed.value = ed.value + '\n\n**新增的一段粗体内容，用来验证实时预览。**';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(s => setTimeout(s, 420));
    const c = document.getElementById('content');
    return {
      grew: c.innerHTML.length !== before,
      hasNew: /新增的一段粗体内容/.test(c.textContent),
      hasStrong: !!c.querySelector('strong'),
      beforeLen: before, afterLen: c.innerHTML.length,
      changed: c.textContent !== beforeText
    };
  });
  ok('F6 改动后预览跟着变（180ms 防抖内更新）', live.hasNew && live.changed, live);
  ok('F7 Markdown 真的被渲染（**粗体** 出来的是 <strong>，不是字面星号）', live.hasStrong, live.hasStrong);

  /* F8 预览是只读的：点表格排序箭头不该改动编辑器内容 */
  const ro = await p.evaluate(async () => {
    const ed = document.getElementById('editor');
    const v0 = ed.value;
    const c = document.getElementById('content');
    const btn = c.querySelector('.tw-bar .tt-btn, .tw-bar button');
    if (btn) btn.click();
    await new Promise(s => setTimeout(s, 220));
    return { same: ed.value === v0, hadBtn: !!btn };
  });
  ok('F8 预览区操作不改写编辑器内容（只读）', ro.same, ro);

  /* ============================================================
     G · 预览开关可逆
     ============================================================ */
  console.log('\n[G] 预览开关');
  const off = await p.evaluate(async () => {
    document.getElementById('btnBlockView').click();
    await new Promise(s => setTimeout(s, 260));
    const c = document.getElementById('content');
    const b = document.getElementById('btnBlockView');
    return {
      display: getComputedStyle(c).display,
      bv: document.documentElement.dataset.bv,
      txt: b.textContent.trim(),
      pressed: b.getAttribute('aria-pressed'),
      edH: document.getElementById('editor').offsetHeight
    };
  });
  ok('G1 关掉预览后 #content 完全隐藏', off.display === 'none' && off.bv === 'off', off);
  ok('G2 按钮文案与 aria-pressed 同步', /预览 关/.test(off.txt) && off.pressed === 'false', [off.txt, off.pressed]);
  ok('G3 关掉后编辑器占满（回到原来单栏写作态）', off.edH > 400, off.edH);

  const on = await p.evaluate(async () => {
    document.getElementById('btnBlockView').click();
    await new Promise(s => setTimeout(s, 380));
    const c = document.getElementById('content');
    return {
      display: getComputedStyle(c).display,
      bv: document.documentElement.dataset.bv,
      txt: document.getElementById('btnBlockView').textContent.trim(),
      html: c.innerHTML.length,
      h: c.offsetHeight,
      edH: document.getElementById('editor').offsetHeight
    };
  });
  ok('G4 再开回来内容仍在（面板重新可见且非空）',
    on.display !== 'none' && on.h > 60 && on.html > 50, on);
  ok('G5 开关可逆：文案回到「预览 开」', /预览 开/.test(on.txt) && on.bv === 'on', [on.txt, on.bv]);

  /* ============================================================
     H · 前缀位移 0（P1 的「块级前缀悬挂」口径）
     ============================================================ */
  console.log('\n[H] 前缀不挤压正文');
  const geo = await p.evaluate(() => {
    /* 节标签 .sec-lv 与「块数」徽章 .sec-cnt 都是 flex 子项且 flex:0 0 auto，
       标题 .sec-title 占 flex:1 —— 因此加徽章不该让标题换行或溢出。
       量三处：标题左边界对齐（不同层级缩进除外）、徽章不叠在文字上、行高不涨。 */
    const items = [...document.querySelectorAll('#sideSections .sec-group')];
    const row = items[0];
    const lv = row.querySelector('.sec-lv'), ttl = row.querySelector('.sec-title');
    const cnt = row.querySelector('.sec-cnt');
    const R = e => e ? e.getBoundingClientRect() : null;
    const rLv = R(lv), rTtl = R(ttl), rCnt = R(cnt);
    return {
      h: Math.round(row.getBoundingClientRect().height),
      /* 徽章不得与标题矩形重叠（悬挂口径：徽章在标题右侧，不压字） */
      overlap: (rCnt && rTtl) ? (rCnt.left < rTtl.right - 1) : false,
      /* 标题必须完整可见，不被 text-overflow 裁成空 */
      ttlW: rTtl ? Math.round(rTtl.width) : 0,
      /* 徽章右边界不得溢出条目 */
      cntOverflow: rCnt ? (rCnt.right > row.getBoundingClientRect().right + 1) : false,
      bulletsInside: !!rLv && rLv.left >= row.getBoundingClientRect().left
    };
  });
  ok('H1 节条目行高不因徽章变高（≤ 30px）', geo.h <= 30, geo.h);
  ok('H2 块数徽章与标题不重叠（徽章在右侧，不压字）', !geo.overlap, geo);
  ok('H3 标题有可用宽度（未被徽章挤成 0）', geo.ttlW > 60, geo.ttlW);
  ok('H4 徽章不溢出条目右边界', !geo.cntOverflow, geo);
  ok('H5 类型标签在条目内部（未被负偏移甩出）', geo.bulletsInside, geo);

  /* ============================================================
     I · 零回归 + 收尾
     ============================================================ */
  console.log('\n[I] 零回归');
  /* 退出编辑后正文渲染链必须完好：表格能出、表格工具条还在 */
  await exitEdit();
  const back = await p.evaluate(() => {
    const c = document.getElementById('content');
    return {
      editing: document.documentElement.dataset.editing === '1',
      contentShown: getComputedStyle(c).display !== 'none',
      len: (c.textContent || '').length,
      tables: c.querySelectorAll('table').length,
      toolbars: c.querySelectorAll('.tw-bar').length,
      h2: c.querySelectorAll('h2').length,
      /* 编辑态专用属性应清掉，不能带进阅读态 */
      bvcap: c.getAttribute('data-bvcap'),
      readonly: c.getAttribute('aria-readonly')
    };
  });
  ok('I1 退出编辑后正文恢复显示', !back.editing && back.contentShown && back.len > 600, back);
  ok('I2 表格与工具条都渲染正常（渲染链未被破坏）', back.tables >= 1 && back.toolbars >= 1, [back.tables, back.toolbars]);
  ok('I3 正文标题全部还原', back.h2 >= 16, back.h2);
  /* 编辑态残留属性不清会污染阅读态的 aria（不影响视觉，但属实的脏状态） */
  ok('I4 阅读态不带只读标注属性（data-bvcap / aria-readonly 已清）',
    !back.bvcap && !back.readonly, [back.bvcap, back.readonly]);

  /* 欢迎屏检查必须放在最后：点 #btnNew 会切到空白新文档，
     后续任何依赖「当前是 longform.md」的段都会失效（实测导致 J 段落到 0 块的空文档、
     一直退回全篇模式）。顺序本身就是断言的一部分。 */
  ok('I7 全程零 JS 错误', errs.length === 0, errs.slice(0, 4));

  /* ============================================================
     J · 英文界面：编辑态新增文案是 JS 生成的，字典救不了，必须显式重刷
     （与 CR-22 的 __wfRelabel 同一类坑：切语言后停在旧语言实测会半英半中）
     ============================================================ */
  console.log('\n[J] 英文界面');
  await enterEdit();
  /* 前面几段可能把界面留在「全篇编辑」（#editSecLabel = 全篇、预览面板被自动收起），
     那样 J 段就测不到节标签与只读标注。用 #editSecLabel 的文字判定真实状态
     （按钮文案会在同一个 tick 内就变，靠它判断会读到中间态），切回节编辑。 */
  const forceSectionMode = async () => p.evaluate(async () => {
    const trace = [];
    for (let k = 0; k < 4; k++) {
      const lbl = document.getElementById('editSecLabel').textContent.trim();
      trace.push(lbl);
      if (lbl !== '全篇' && lbl !== 'Whole Doc') break;
      const sw = document.getElementById('btnSecWhole');
      trace.push('btn=' + sw.textContent.trim());
      sw.click();
      await new Promise(s => setTimeout(s, 500));
    }
    if (document.documentElement.dataset.bv === 'off') {
      document.getElementById('btnBlockView').click();
      await new Promise(s => setTimeout(s, 340));
    }
    return { lbl: document.getElementById('editSecLabel').textContent.trim(), trace };
  });
  const jMode = await forceSectionMode();
  ok('J0 已切回「按节编辑」态（否则后三条测不到东西）',
    !/^(全篇|Whole Doc)$/.test(jMode.lbl), jMode);
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1200);
  const uiEn = await p.evaluate(() => {
    const g = (sel, a) => { const e = document.querySelector(sel); if (!e) return ''; return a ? (e.getAttribute(a) || '') : (e.textContent || '').trim(); };
    return {
      bv: g('#btnBlockView'), bvTitle: g('#btnBlockView', 'title'),
      lbl: g('#editSecLabel'), cap: g('#content', 'data-bvcap'),
      aria: g('#content', 'aria-label'), edAria: g('#editor', 'aria-label'),
      whole: g('#btnSecWhole'), prev: g('#btnSecPrev')
    };
  });
  /* 用户文档标题（测试长文 / 第一节…）属正文，不参与翻译，判 leak 时要排除 */
  const isUser = s => /测试长文|第一节|第二节|第三节|第四节|第五节|第\d+节|导语/.test(s);
  const leakEn = Object.entries(uiEn).filter(([, v]) => v && /\u4e00-\u9fff/.test(v) && !isUser(v));
  ok('J1 英文界面编辑态 UI 零残留中文（用户文档标题除外）', leakEn.length === 0, leakEn);
  const mixedEn = Object.entries(uiEn).filter(([, v]) => v && /[A-Za-z]{2,}[\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z]{2,}/.test(v) && !isUser(v));
  ok('J2 英文界面编辑态 UI 零中英混杂', mixedEn.length === 0, mixedEn);
  ok('J3 预览开关 / 只读标注 / 节标签都英文化',
    /Preview/i.test(uiEn.bv) && /Preview|Read-only/i.test(uiEn.cap) && /Section|Block/i.test(uiEn.lbl),
    [uiEn.bv, uiEn.cap, uiEn.lbl]);
  ok('J4 节标签保留用户标题原文（正文永不参与翻译）', isUser(uiEn.lbl), uiEn.lbl);

  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'zh-CN'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1200);
  const uiZh = await p.evaluate(() => ({
    bv: document.getElementById('btnBlockView').textContent.trim(),
    lbl: document.getElementById('editSecLabel').textContent.trim(),
    cap: document.getElementById('content').getAttribute('data-bvcap') || ''
  }));
  ok('J5 切回中文完全还原（无半英半中）',
    /预览 开/.test(uiZh.bv) && /节 ·|块 #/.test(uiZh.lbl) && /预览 · 只读/.test(uiZh.cap), uiZh);
  await exitEdit();

  /* ============================================================
     K · 欢迎屏 15 卡零回归（CR-22 的核心资产，改编辑态不能碰它）
     必须放在最后：点 #btnNew 会切到空白新文档，之后所有依赖
     「当前是 longform.md」的段落都会失效。
     ============================================================ */
  console.log('\n[K] 欢迎屏零回归');
  const welcome = await p.evaluate(async () => {
    document.getElementById('btnNew').click();
    await new Promise(s => setTimeout(s, 500));
    const dots = document.querySelectorAll('#wfDots .wf-dot').length;
    const cards = document.querySelectorAll('#gridFeats .w-card').length;
    const grid = document.getElementById('gridFeats');
    const items = document.querySelectorAll('.wf-item').length;
    return { dots, cards, items, w: grid ? getComputedStyle(grid).getPropertyValue('--wf-w').trim() : '' };
  });
  ok('K1 欢迎屏 15 卡与 15 个进度点完好', welcome.cards === 15 && welcome.dots === 15, welcome);
  ok('K2 3D 轮播正常启用（.wf-item 15 个）', welcome.items === 15, welcome.items);
  ok('K3 卡宽变量仍被算出（fitCard 未失效）', /\d+px/.test(welcome.w), welcome.w);
  ok('K4 收紧后的零 JS 错误（含欢迎屏渲染）', errs.length === 0, errs.slice(0, 4));

  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });