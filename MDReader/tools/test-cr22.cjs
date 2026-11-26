/* CR-2026-11-20-02 欢迎屏 15 卡展板 · 国际化专项测试
   ----------------------------------------------------------------
   背景：切到 English 后产品滚动展板仍是中文（用户截图反馈）。根因不是「没翻」，
   而是「翻坏了」——字典里的短词（护眼→Sepia、图表→Chart、复制→Copy、
   第→Row ）把长句逐字蚕食，得到「Sepia是低蓝光暖米黄」「第 1 feature」。

   本测试锁三件事：
   A 英文界面零中文（文本 + 属性）
   B 零中英混杂（比「零中文」更严：查中西文直接相邻，如「Sepia是」）
   C 双语往返可逆 + 切语言后卡片几何不错乱（英文更长，必须重跑 fitCard）

   ⚠ 空数组会让 .every() 恒真：所有集合型断言都同时断言 length === N。
*/
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* 默认测国内版（dist）。传 --intl 测国际版（dist-intl，默认界面就是英文）——
   国际版省掉了「切语言」这一步，但卡片文案、aria、几何的判据完全一样。 */
const INTL = process.argv.includes('--intl');
const TARGET = INTL ? ['dist-intl', 'MDReader.html'] : ['dist', 'MDReader.html'];
const F = ('file:///' + path.join(ROOT, ...TARGET)).replace(/\\/g, '/');
const BASE_LANG = INTL ? 'en' : 'zh-CN';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const N = 15;
/* 中英混排的判定：中西文/数字直接相邻（中间无空格、无标点）。
   「Ctrl+V 也能成文」这类正常中英混写在整句译文里已消除；若出现即说明
   又被短词蚕食了。允许的例外：单位与专名紧贴（md / v / P0）。 */
const MIXED = /[A-Za-z]{2,}[\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z]{2,}/;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

/* 抓取 15 卡的六段信息。刻意逐字段取，不用 innerText —— 后者会把
   徽章「01 / 15」与标题粘在一起，掩盖真实的字段边界。 */
const GRAB = () => [...document.querySelectorAll('#gridFeats .w-card')].map((card) => {
  const info = card.querySelector('.wf-info');
  const head = info.querySelector('.wc-head');
  const dsc = info.querySelector('span:not([class])');
  const tagsBox = info.querySelector('.tags');
  return {
    title: head && head.querySelector('b') ? head.querySelector('b').textContent.trim() : '',
    tag: head && head.querySelector('.w-tag') ? head.querySelector('.w-tag').textContent.trim() : '',
    prio: info.querySelector('.prio') ? info.querySelector('.prio').textContent.trim() : '',
    en: info.querySelector('.en') ? info.querySelector('.en').textContent.trim() : '',
    desc: dsc ? dsc.textContent.trim() : '',
    them: info.querySelector('.them') ? info.querySelector('.them').textContent.trim() : '',
    us: info.querySelector('.us') ? info.querySelector('.us').textContent.trim() : '',
    tags: tagsBox ? [...tagsBox.children].map((e) => e.textContent.trim()) : []
  };
});

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1600);

  const switchLang = (v) => p.evaluate((lang) => {
    const s = document.getElementById('setLang');
    if (!s) return false;
    s.value = lang; s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, v);
  const grab = () => p.evaluate(GRAB);

  /* ---------- 基线：国内版是中文，国际版默认已是英文 ---------- */
  const defLang = await p.evaluate(() => document.documentElement.dataset.lang);
  ok('基线：默认语言符合版本预期（国内 zh-CN / 国际 en）', defLang === BASE_LANG, [defLang, BASE_LANG]);
  /* 国际版默认英文，取中文基线要先切回 zh-CN —— 否则 ZH/EN 两份快照相同，
     E4「标题都变过」与 Z1「往返还原」都会变成恒真/恒假的空断言。 */
  if (INTL) { await switchLang('zh-CN'); await p.waitForTimeout(1100); }
  const ZH = await grab();
  ok('基线：15 张卡都能取到六段信息', ZH.length === N && ZH.every((c) => c.title && c.desc && c.tags.length === 3),
     [ZH.length, ZH.map((c) => c.tags.length).join('')]);
  ok('基线：中文基线上确实拿到中文文案（防止空断言）',
     ZH.length === N && ZH.every((c) => /[\u4e00-\u9fff]/.test(c.title)), ZH[0] && ZH[0].title);

  /* ---------- 切英文 ---------- */
  ok('切语言：设置项 #setLang 存在且可触发', await switchLang('en'));
  await p.waitForTimeout(1200);

  const langAttr = await p.evaluate(() => ({ d: document.documentElement.dataset.lang, l: document.documentElement.lang }));
  ok('E1 <html data-lang> 与 lang 属性都是 en', langAttr.d === 'en' && langAttr.l === 'en', langAttr);

  const EN = await grab();
  ok('E2 仍是 15 张卡（翻译不得丢卡）', EN.length === N, EN.length);

  /* 逐字段零中文 */
  const chinese = /[\u4e00-\u9fff]/;
  const leak = [];
  EN.forEach((c, i) => {
    ['title', 'tag', 'prio', 'en', 'desc', 'them', 'us'].forEach((k) => {
      if (chinese.test(c[k])) leak.push([i + 1, k, c[k].slice(0, 50)]);
    });
    c.tags.forEach((t, j) => { if (chinese.test(t)) leak.push([i + 1, 'tags[' + j + ']', t]); });
  });
  ok('E3 15 卡六段信息零残留中文', leak.length === 0 && EN.length === N, leak.slice(0, 6));
  /* 反向断言：确实翻了（不是原地不动） */
  ok('E4 15 卡标题全部与中文不同（真的翻译了）',
     EN.every((c, i) => c.title && c.title !== ZH[i].title), EN.map((c) => c.title).slice(0, 3));

  /* 中英混杂 */
  const mixed = [];
  EN.forEach((c, i) => {
    ['title', 'tag', 'prio', 'en', 'desc', 'them', 'us'].forEach((k) => {
      if (MIXED.test(c[k])) mixed.push([i + 1, k, c[k].slice(0, 60)]);
    });
    c.tags.forEach((t, j) => { if (MIXED.test(t)) mixed.push([i + 1, 'tags[' + j + ']', t]); });
  });
  ok('E5 卡片文案零中英混杂（如「Sepia是」）', mixed.length === 0 && EN.length === N, mixed.slice(0, 6));

  /* 欢迎屏非卡片区（口号 / HUD / 提示 / 兜底入口 / 大图弹层）零中文 */
  const rest = await p.evaluate(() => {
    const w = document.getElementById('welcome');
    const skip = new Set([...document.querySelectorAll('#gridFeats .w-card')]);
    const bad = [];
    const walk = document.createTreeWalker(w, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walk.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (!t || !/[\u4e00-\u9fff]/.test(t)) continue;
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
      if ([...skip].some((c) => c.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      bad.push({ cls: el.className || el.tagName, txt: t.slice(0, 60) });
    }
    const attrs = [];
    w.querySelectorAll('[title],[aria-label],[alt],[placeholder]').forEach((el) => {
      ['title', 'aria-label', 'alt', 'placeholder'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && /[\u4e00-\u9fff]/.test(v)) attrs.push({ a, cls: el.className || el.tagName, v: v.slice(0, 40) });
      });
    });
    return { text: bad, attrs, cards: document.querySelectorAll('#gridFeats .w-card').length };
  });
  ok('E6 欢迎屏卡片之外零中文（口号 / HUD / 小提示 / 兜底入口）',
     rest.text.length === 0 && rest.cards === N, rest.text.slice(0, 6));
  ok('E7 欢迎屏零中文属性型文案（aria-label / title / alt）', rest.attrs.length === 0, rest.attrs.slice(0, 6));

  /* aria 分组细致到点：15 个进度点 + 2 个翻页按钮 + 口号 */
  const aria = await p.evaluate(() => ({
    dots: [...document.querySelectorAll('.wf-dot')].map((b) => b.getAttribute('aria-label')),
    nav: [...document.querySelectorAll('.wf-nav')].map((b) => b.getAttribute('aria-label')),
    slogan: document.querySelector('.w-slogan') ? document.querySelector('.w-slogan').getAttribute('aria-label') : null
  }));
  ok('E8 15 个进度点 aria-label 全英文且逐点编号', aria.dots.length === N &&
     aria.dots.every((v, i) => v === 'Feature ' + (i + 1)), aria.dots.slice(0, 3));
  ok('E9 左右翻页按钮 aria-label 全英文', aria.nav.length === 2 &&
     aria.nav[0] === 'Previous feature' && aria.nav[1] === 'Next feature', aria.nav);
  ok('E10 口号 aria-label 全英文', typeof aria.slogan === 'string' && !chinese.test(aria.slogan), aria.slogan);

  /* 英文文案不得为空（翻译缺失会得到空串，比残留中文更隐蔽） */
  const empty = [];
  EN.forEach((c, i) => {
    ['title', 'prio', 'en', 'desc', 'them', 'us'].forEach((k) => { if (!c[k]) empty.push([i + 1, k]); });
    if (c.tags.length !== 3 || c.tags.some((t) => !t)) empty.push([i + 1, 'tags']);
  });
  ok('E11 英文下六段信息不得为空（含 3 个标签）', empty.length === 0 && EN.length === N, empty.slice(0, 6));

  /* 英文身份字段（en / prio / 编号）保持不变 —— 它们是产品代号，不该被翻。
     ⚠ 不能用 /^[A-Z0-9 ·→\/&+.\-]+$/i 判：加了 /i 后 [A-Z] 等价于 [A-Za-z]，
     但 `,`（ONE PALETTE, EVERYWHERE）不在类里会假失败。这里只判「无中日韩字符」。 */
  const cjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
  ok('E12 15 卡的英文代号 en 中英一致（产品代号不翻译，且不含中日韩字符）',
     EN.every((c, i) => c.en === ZH[i].en) && EN.every((c) => c.en.length > 0 && !cjk.test(c.en)),
     EN.filter((c, i) => c.en !== ZH[i].en).map((c) => c.en));

  /* ---------- 几何：英文更长，卡宽必须重算 ---------- */
  const geo = await p.evaluate(() => {
    const st = document.querySelector('.wf-stage');
    const w = document.getElementById('welcome');
    const grid = document.getElementById('gridFeats');
    const card = document.querySelector('#gridFeats .w-card');
    return {
      stageW: st ? st.clientWidth : 0, stageH: st ? st.clientHeight : 0,
      cardW: card ? card.offsetWidth : 0, cardH: card ? card.offsetHeight : 0,
      wfW: parseInt(getComputedStyle(grid).getPropertyValue('--wf-w'), 10),
      welcome: [w.scrollHeight, w.clientHeight],
      winY: window.scrollY, vh: innerHeight,
      hudBottom: Math.round(document.querySelector('.wf-hud').getBoundingClientRect().bottom),
      tipBottom: Math.round(document.querySelector('.w-tip').getBoundingClientRect().bottom)
    };
  });
  ok('E13 英文下一屏无溢出（welcome 高度 = 客户区）', geo.welcome[0] === geo.welcome[1], geo.welcome);
  ok('E14 英文下窗口不可下滑', geo.winY === 0, geo.winY);
  ok('E15 英文下卡宽按新文案高度重算（--wf-w 与实测卡宽一致）',
     geo.wfW === geo.cardW && geo.cardW > 0, [geo.wfW, geo.cardW]);
  ok('E16 英文下卡片不超出舞台宽度一半（左右副卡要留位）',
     geo.cardW <= geo.stageW * 0.55, [geo.cardW, geo.stageW]);
  ok('E17 英文下卡片高度不超舞台（截图区不被切）',
     geo.cardH <= geo.stageH, [geo.cardH, geo.stageH]);
  ok('E18 英文下 HUD 与小提示仍在视口内', geo.hudBottom <= geo.vh && geo.tipBottom <= geo.vh,
     [geo.hudBottom, geo.tipBottom, geo.vh]);

  /* 描述行数：clamp 上限 3 行，短文案自然落 2 行 —— 行数不要求绝对一致，
     但必须「都取到、都不超 3 行、且每条都完整未被夹断」。真正需要一致的是
     信息区总高（见 E20b），因为 fitCard 是按它反推卡宽的。 */
  const clamp = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#gridFeats .w-card .wf-info > span:not([class])').forEach((s) => {
      const lh = parseFloat(getComputedStyle(s).lineHeight) || 0;
      out.push({ h: s.clientHeight, lines: lh ? Math.round(s.clientHeight / lh) : 0,
                 clip: getComputedStyle(s).webkitLineClamp,
                 cut: s.scrollHeight > s.clientHeight + 1 });
    });
    return out;
  });
  ok('E19 15 条描述都取到、行数 2~3 行且未被夹断',
     clamp.length === N && clamp.every((c) => c.lines >= 2 && c.lines <= 3) &&
     clamp.every((c) => c.cut === false),
     [clamp.length, clamp.map((c) => c.lines).join(''), clamp.filter((c) => c.cut).length]);
  ok('E20 描述使用 line-clamp 锁死行数上限', clamp.length === N &&
     clamp.every((c) => c.clip !== 'none' && c.clip !== '' && Number(c.clip) <= 3),
     [clamp.length, clamp[0]]);
  /* 关键：15 张卡的信息区必须等高，否则 fitCard 按最大值算出的卡宽会让
     其余卡空出多余高度，卡片高矮不齐一眼可见，翻页时还会上下跳。 */
  const eqH = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('#gridFeats .w-card .wf-info')].map((e) => e.offsetHeight);
    const cards = [...document.querySelectorAll('#gridFeats .w-card')].map((e) => e.offsetHeight);
    return { info: [...new Set(hs)], card: [...new Set(cards)], n: hs.length,
             varH: getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-info-h').trim() };
  });
  ok('E20b 英文下 15 张卡信息区等高（fitCard 取最大高度并回写 --wf-info-h）',
     eqH.n === N && eqH.info.length === 1 && eqH.card.length === 1 &&
     eqH.varH === eqH.info[0] + 'px',
     [eqH.n, eqH.info, eqH.card.length, eqH.varH]);

  /* 五个视口逐一验：一屏 + 卡几何 + 描述不被夹断。
     最后一条是英文适配最严的判据 —— 英文比中文长，窄屏（1280/1366）下行数预算
     最紧。曾出现 #1/#2 需要 4 行而被 clamp 夹成 3 行（文字被吃掉半句），
     正确修法是压缩译文而不是放宽 clamp：放宽 → infoH 变高 → 卡变窄 → 需要更多行，
     是正反馈。这里同时锁「所需行数 == 实际行数」。 */
  const VIEWS = [[1280, 720], [1366, 768], [1440, 900], [1600, 900], [1920, 1080]];
  const bad = [];
  for (const [vw, vh] of VIEWS) {
    await p.setViewportSize({ width: vw, height: vh });
    await p.waitForTimeout(420);
    const m = await p.evaluate(() => {
      const w = document.getElementById('welcome');
      const grid = document.getElementById('gridFeats');
      const card = document.querySelector('#gridFeats .w-card');
      const st = document.querySelector('.wf-stage');
      const d = document.querySelector('#gridFeats .w-card .wf-info > span:not([class])');
      const lh = d ? parseFloat(getComputedStyle(d).lineHeight) || 1 : 1;
      /* 全 15 条都要查：只查第一条会漏掉更啰嗦的译文 */
      const cut = [...document.querySelectorAll('#gridFeats .w-card .wf-info > span:not([class])')]
        .map((s, i) => ({ i: i + 1, need: Math.round(s.scrollHeight / lh), got: Math.round(s.clientHeight / lh) }))
        .filter((x) => x.need > x.got);
      return {
        w: [w.scrollHeight, w.clientHeight], y: window.scrollY,
        cardW: card ? card.offsetWidth : 0, cardH: card ? card.offsetHeight : 0,
        wfW: parseInt(getComputedStyle(grid).getPropertyValue('--wf-w'), 10),
        infos: [...new Set([...document.querySelectorAll('#gridFeats .w-card .wf-info')].map((e) => e.offsetHeight))],
        stageW: st ? st.clientWidth : 0, stageH: st ? st.clientHeight : 0,
        hud: Math.round(document.querySelector('.wf-hud').getBoundingClientRect().bottom),
        tip: Math.round(document.querySelector('.w-tip').getBoundingClientRect().bottom),
        vh: innerHeight, cut
      };
    });
    const good = m.w[0] === m.w[1] && m.y === 0 && m.wfW === m.cardW &&
                 m.cardH <= m.stageH && m.hud <= m.vh && m.tip <= m.vh &&
                 m.infos.length === 1 && m.cut.length === 0;
    if (!good) bad.push([vw + 'x' + vh, m]);
  }
  ok('E21 英文下五个视口全部一屏、卡高不超舞台、15 卡等高、HUD 在视口内',
     bad.length === 0 && VIEWS.length === 5, bad.map((b) => b[0]));
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(400);

  /* ---------- 切回中文必须逐字段还原 ---------- */
  ok('切回中文：设置项可触发', await switchLang('zh-CN'));
  await p.waitForTimeout(1100);
  const BACK = await grab();
  const diff = [];
  ZH.forEach((z, i) => Object.keys(z).forEach((k) => {
    if (JSON.stringify(z[k]) !== JSON.stringify(BACK[i][k])) diff.push([i + 1, k, z[k], BACK[i][k]]);
  }));
  ok('Z1 中→英→中，15 卡六段信息逐字段还原', diff.length === 0 && BACK.length === N, diff.slice(0, 6));

  const backAttr = await p.evaluate(() => ({
    dots: [...document.querySelectorAll('.wf-dot')].map((b) => b.getAttribute('aria-label')),
    nav: [...document.querySelectorAll('.wf-nav')].map((b) => b.getAttribute('aria-label')),
    d: document.documentElement.dataset.lang,
    wfW: parseInt(getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-w'), 10),
    cardW: document.querySelector('#gridFeats .w-card').offsetWidth,
    infoH: document.querySelector('#gridFeats .w-card .wf-info').offsetHeight
  }));
  ok('Z2 切回中文后 aria-label 还原为中文', backAttr.d === 'zh-CN' &&
     backAttr.dots.length === N && backAttr.dots.every((v, i) => v === '第 ' + (i + 1) + ' 项功能') &&
     backAttr.nav[0] === '上一个功能亮点' && backAttr.nav[1] === '下一个功能亮点',
     backAttr.dots.slice(0, 2));
  ok('Z3 切回中文后卡宽随之回缩（不是停在英文的宽卡上）',
     backAttr.wfW === backAttr.cardW, [backAttr.wfW, backAttr.cardW, backAttr.infoH]);

  /* ---------- 阅读态不得被翻译破坏 ---------- */
  await p.evaluate(() => { const z = document.querySelector('.wf-zoom'); if (z) z.hidden = true; });
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(700);
  await p.click('#wDemo'); await p.waitForTimeout(1600);
  const read = await p.evaluate(() => {
    const r = document.querySelector('.reader');
    const c = document.getElementById('content');
    return { hidden: document.getElementById('welcome').classList.contains('hidden'),
      canScroll: r.scrollHeight > r.clientHeight,
      len: (c.textContent || '').length,
      chinese: /[\u4e00-\u9fff]/.test((c.textContent || '').slice(0, 4000)) };
  });
  ok('R1 英文界面打开示例文档：欢迎屏隐藏、正文可滚', read.hidden && read.canScroll && read.len > 1000, read);
  ok('R2 示例文档正文按界面语言渲染（英文界面无大段中文）', read.chinese === false, read.chinese);

  ok('X 零 JS 错误', errs.length === 0, errs.slice(0, 3));

  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });