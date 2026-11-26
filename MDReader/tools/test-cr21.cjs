/* CR-2026-11-18-07 专项测试：口号放大 / 入口进侧栏 / 翻页位姿对齐展示页
   口径：
     A 入口位置（在 aside 内、可点、欢迎屏中央已无按钮、收起侧栏有兜底）
     B 口号放大（宽度与高度较 CR-20 的 360x53 显著增大、英文副标常显可读）
     C 位姿对齐展示页（scale/opacity/rotateY/步进 与 #showcase 同档、无变灰滤镜）
     D 一屏无滚动（四视口）+ 主题 + 零 JS 错误
     E 文档阅读态零回归
*/
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const N = 15;
const VPS = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
             { width: 1366, height: 768 }, { width: 1156, height: 560 }];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1500);

  /* ---------- A 入口位置 ---------- */
  const A = await p.evaluate(() => {
    const sb = document.getElementById('sidebar');
    const demo = document.getElementById('wDemo'), nw = document.getElementById('wNew');
    const eb = document.querySelector('.side-entry');
    return {
      inSidebar: !!(sb && demo && nw && sb.contains(demo) && sb.contains(nw)),
      /* 必须排在 .side-tabs 之前 = 菜单栏最顶部 */
      aboveTabs: !!(eb && eb.nextElementSibling &&
        eb.nextElementSibling.classList.contains('side-tabs')),
      welcomeActions: document.querySelectorAll('#welcome .w-actions').length,
      welcomeBtns: [...document.querySelectorAll('#welcome .w-actions .btn')].length,
      txt: [demo && demo.textContent.trim(), nw && nw.textContent.trim()],
      w: Math.round((demo || {}).getBoundingClientRect ? demo.getBoundingClientRect().width : 0),
      h: Math.round((demo || {}).getBoundingClientRect ? demo.getBoundingClientRect().height : 0),
      fallbackDisplay: (() => {
        const f = document.querySelector('#welcome .w-fallback');
        return f ? getComputedStyle(f).display : 'missing';
      })()
    };
  });
  ok('A 两个入口都在左侧菜单栏内', A.inSidebar);
  ok('A 入口位于菜单栏最顶部（在 文件/大纲/段落 之上）', A.aboveTabs);
  ok('A 欢迎屏中央已无 .w-actions 按钮组', A.welcomeActions === 0 && A.welcomeBtns === 0, A.welcomeBtns);
  ok('A 两键文案不变', A.txt[0] === '✨ 查看示例文档' && A.txt[1] === '＋ 创建 MD', A.txt);
  ok('A 侧栏两键占满侧栏宽度（≥220）', A.w >= 220, [A.w, A.h]);
  ok('A 侧栏未收起时兜底入口隐藏', A.fallbackDisplay === 'none', A.fallbackDisplay);

  /* 侧栏按钮真实可点：点「查看示例文档」应进入文档态 */
  await p.click('#sidebar #wDemo');
  await p.waitForTimeout(1500);
  const A2 = await p.evaluate(() => ({
    hidden: document.getElementById('welcome').classList.contains('hidden'),
    len: (document.getElementById('content').textContent || '').length
  }));
  ok('A 点侧栏「查看示例文档」→ 正常载入示例', A2.hidden && A2.len > 1000, A2);

  /* 回首页后再测「创建 MD」 */
  await p.evaluate(() => document.getElementById('brandHome').click());
  await p.waitForTimeout(900);
  await p.click('#sidebar #wNew');
  await p.waitForTimeout(900);
  const A3 = await p.evaluate(() => ({
    hidden: document.getElementById('welcome').classList.contains('hidden'),
    tab: document.querySelectorAll('#tabbar .tab, .tabbar .tab').length
  }));
  ok('A 点侧栏「创建 MD」→ 进入新建文档态', A3.hidden, A3);

  /* 收起侧栏 → 兜底入口必须出现且能转发点击 */
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('#btnSide');
  await p.waitForTimeout(600);
  const A4 = await p.evaluate(() => {
    const f = document.querySelector('#welcome .w-fallback');
    const r = document.querySelector('.reader'), w = document.getElementById('welcome');
    return { display: f ? getComputedStyle(f).display : 'missing',
             btns: document.querySelectorAll('#welcome .w-fallback [data-proxy]').length,
             one: r.scrollHeight === r.clientHeight && w.scrollHeight === w.clientHeight,
             gap: [r.scrollHeight, r.clientHeight] };
  });
  ok('A 收起侧栏 → 兜底入口出现且仍是一屏', A4.display === 'flex' && A4.one, A4);
  ok('A 兜底入口含两个转发按钮', A4.btns === 2, A4.btns);
  await p.click('#welcome .w-fallback [data-proxy="wDemo"]');
  await p.waitForTimeout(1500);
  ok('A 点兜底「查看示例文档」→ 转发成功',
     await p.evaluate(() => document.getElementById('welcome').classList.contains('hidden')));
  /* 复位：重新加载并打开侧栏，后续测试都在干净状态上做 */
  await p.reload(); await p.waitForTimeout(1500);

  /* ---------- B 口号放大 ---------- */
  const B = await p.evaluate(() => {
    const img = document.querySelector('.w-slogan-img');
    const r = img.getBoundingClientRect();
    const en = document.querySelector('.w-slogan-en');
    const er = en.getBoundingClientRect();
    const h1 = document.querySelector('#welcome h1.w-slogan').getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      enVisible: er.height > 0, enFs: parseFloat(getComputedStyle(en).fontSize),
      enText: en.textContent.trim(),
      h1H: Math.round(h1.height)
    };
  });
  /* CR-20 基线：min(360px,62%) → 360 宽、53 高 */
  ok('B 口号宽度 ≥ 560px（原 360px）', B.w >= 560, B.w);
  ok('B 口号高度 ≥ 80px（原 53px）', B.h >= 80, B.h);
  ok('B 中文界面英文副标常显且 ≥10px', B.enVisible && B.enFs >= 10, [B.enVisible, B.enFs]);
  ok('B 英文副标文案正确', B.enText === 'Make Markdown reading a pleasure', B.enText);

  /* 副标是 10–13px 的小字，WCAG 要求 ≥4.5:1。这里逐主题实算，
     不能只看颜色变量——半透明叠在背景上会二次打折。 */
  const cr = async () => p.evaluate(() => {
    const parse = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const relL = c => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
    const en = document.querySelector('.w-slogan-en');
    let el = document.querySelector('#welcome'), bg = 'rgba(0, 0, 0, 0)';
    while (el && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bg = getComputedStyle(el).backgroundColor; el = el.parentElement;
    }
    const fg = parse(getComputedStyle(en).color), bgc = parse(bg);
    const l1 = relL(fg), l2 = relL(bgc);
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2);
  });
  for (const t of ['light', 'sepia', 'dark']) {
    await p.evaluate(x => document.documentElement.setAttribute('data-theme', x), t);
    await p.waitForTimeout(200);
    const v = await cr();
    ok('B ' + t + ' 主题英文副标对比度 ≥4.5:1', v >= 4.5, v);
  }
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await p.waitForTimeout(200);

  /* 英文界面：英文必须回到主口号字号（不能被副标样式压扁） */
  await p.evaluate(() => document.documentElement.setAttribute('data-lang', 'en'));
  await p.waitForTimeout(260);
  const B2 = await p.evaluate(() => {
    const en = document.querySelector('.w-slogan-en');
    return { fs: parseFloat(getComputedStyle(en).fontSize),
             imgHidden: getComputedStyle(document.querySelector('.w-slogan-img')).display === 'none' };
  });
  ok('B 英文界面：中文海报隐藏、英文回到主口号字号 ≥18px', B2.imgHidden && B2.fs >= 18, B2);
  await p.evaluate(() => document.documentElement.removeAttribute('data-lang'));
  await p.waitForTimeout(260);

  /* ---------- C 位姿对齐展示页 ---------- */
  /* 以「当前居中项」为起点按相对距离取样：自播放会把 cur 推到任意项，
     直接取 items[0..3] 会量成倒序。另外宽高一律用 offsetWidth（getBoundingClientRect 含 scale）。 */
  await p.mouse.move(20, 20);
  await p.evaluate(() => document.querySelectorAll('.wf-dot')[0].click());
  await p.waitForTimeout(700);
  const C = await p.evaluate(() => {
    const its = [...document.querySelectorAll('.wf-item')];
    const n = its.length;
    const cur = its.findIndex(e => e.style.zIndex === '100');
    const num = (el, re) => { const m = el.style.transform.match(re); return m ? +m[1] : null; };
    const at = k => {
      const el = its[(cur + k) % n];
      return {
        sc: num(el, /scale\(([\d.]+)\)/),
        ry: num(el, /rotateY\((-?[\d.]+)deg\)/),
        op: +el.style.opacity,
        filter: el.style.filter || 'none'
      };
    };
    return [0, 1, 2, 3].map(at);
  });
  /* 展示页 #showcase：scale=[1,.81,.62,.45] op=[1,.9,.62,0] ry=[0,24,30] */
  ok('C scale 与展示页一致 [1,.81,.62,.45]', JSON.stringify(C.map(x => x.sc)) === '[1,0.81,0.62,0.45]', C.map(x => x.sc));
  ok('C 副卡倾角 24deg / 30deg（与展示页一致）', Math.abs(C[1].ry) === 24 && Math.abs(C[2].ry) === 30, [C[1].ry, C[2].ry]);
  ok('C opacity 与展示页一致 [1,.9,.62,0]', JSON.stringify(C.map(x => x.op)) === '[1,0.9,0.62,0]', C.map(x => x.op));
  ok('C 副卡不再套 brightness/saturate 变灰滤镜', C.every(x => x.filter === 'none' || x.filter === ''), C.map(x => x.filter));

  /* 步进：展示页公式 stepBase=(halfW - cw*.31 - 10)/1.62，且 120≤v≤360 */
  const step = await p.evaluate(() => {
    const st = document.querySelector('.wf-stage');
    const its = [...document.querySelectorAll('.wf-item')];
    const cur = its.findIndex(e => e.style.zIndex === '100');
    /* 卡片基准宽（未缩放） */
    const cw = its[cur].querySelector('.w-card').offsetWidth;
    const sw = st.clientWidth;
    const exp = Math.max(120, Math.min(360, (sw / 2 - cw * 0.31 - 10) / 1.62));
    const nx = its[(cur + 1) % its.length];
    const m = nx.style.transform.match(/translate3d\((-?[\d.]+)px/);
    return { exp: +exp.toFixed(1), act: m ? +Math.abs(+m[1]).toFixed(1) : null, sw, cw };
  });
  ok('C 一档步进 = 展示页公式值（误差 ≤1px）',
     step.act !== null && Math.abs(step.act - step.exp) <= 1, step);

  /* ---------- D 四视口一屏 ---------- */
  for (const vp of VPS) {
    const q = await b.newPage({ viewport: vp });
    const e2 = []; q.on('pageerror', e => e2.push(e.message));
    await q.goto(F); await q.waitForTimeout(1300);
    const d = await q.evaluate(() => {
      const r = document.querySelector('.reader'), w = document.getElementById('welcome');
      scrollTo(0, 999);
      const hud = document.querySelector('.wf-hud').getBoundingClientRect();
      return {
        one: r.scrollHeight === r.clientHeight && w.scrollHeight === w.clientHeight,
        winY: window.scrollY,
        hudIn: hud.bottom <= innerHeight,
        loaded: [...document.querySelectorAll('.wf-shot img')].filter(i => i.naturalWidth > 0).length,
        demoInSide: !!document.querySelector('#sidebar #wDemo')
      };
    });
    ok('D ' + vp.width + 'x' + vp.height + ' 一屏无滚动 + 15 图 + 入口在侧栏',
       d.one && d.winY === 0 && d.hudIn && d.loaded === N && d.demoInSide, d);
    ok('D ' + vp.width + 'x' + vp.height + ' 零 JS 错误', e2.length === 0, e2.slice(0, 2));
    await q.close();
  }

  /* 主题（每个主题独立取一次，避免前序操作残留标签页干扰一屏判定） */
  for (const t of ['light', 'sepia', 'dark']) {
    await p.reload(); await p.waitForTimeout(1400);
    await p.evaluate(x => document.documentElement.setAttribute('data-theme', x), t);
    await p.waitForTimeout(200);
    const s = await p.evaluate(() => ({
      one: document.querySelector('.reader').scrollHeight === document.querySelector('.reader').clientHeight,
      slogan: Math.round(document.querySelector('.w-slogan-img').getBoundingClientRect().width)
    }));
    ok('D ' + t + ' 主题：仍是一屏且口号维持放大', s.one && s.slogan >= 560, s);
  }
  await p.reload(); await p.waitForTimeout(1400);

  /* ---------- E 文档阅读态零回归 ---------- */
  await p.click('#sidebar #wDemo'); await p.waitForTimeout(1500);
  const E = await p.evaluate(() => {
    const r = document.querySelector('.reader'), c = document.getElementById('content');
    return { canScroll: r.scrollHeight > r.clientHeight, len: (c.textContent || '').length,
             innerDisplay: getComputedStyle(document.querySelector('.reader-inner')).display };
  });
  ok('E 文档可正常滚动（一屏样式不泄漏）', E.canScroll && E.len > 1000, E);
  ok('E 正文容器恢复显示', E.innerDisplay !== 'none', E.innerDisplay);

  ok('Z 零 JS 错误', errs.length === 0, errs.slice(0, 3));
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });