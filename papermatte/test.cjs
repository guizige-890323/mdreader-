const { chromium } = require('playwright-core');
const D = 'D:/WorkBuddy/2026-11-08-21-28-36/papermatte/';
const F = D + 'index.html';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); }
};

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file:///' + F);
  await p.waitForTimeout(900);

  const st = () => p.evaluate(() => {
    const rt = document.documentElement;
    const q = (s) => document.querySelector(s);
    const g = (s, prop) => getComputedStyle(q(s)).getPropertyValue(prop).trim();
    return {
      theme: rt.getAttribute('data-theme'),
      pm: rt.getAttribute('data-pm'),
      font: rt.getAttribute('data-font'),
      paper: getComputedStyle(rt).backgroundColor,
      filter: getComputedStyle(q('.pm-sheet')).filter,
      ink: getComputedStyle(document.body).color,
      noise: getComputedStyle(rt, '::after').opacity,
      blend: getComputedStyle(rt, '::after').mixBlendMode,
      h1: parseFloat(g('h1', 'font-size')),
      h2: parseFloat(g('h2', 'font-size')),
      h3: parseFloat(g('h3', 'font-size')),
      p: parseFloat(g('.pm-read p', 'font-size')),
      family: getComputedStyle(document.body).fontFamily,
      hint: document.getElementById('hintBox').textContent.trim(),
      swLbl: document.getElementById('swLabel').textContent,
      themeName: document.getElementById('themeName').textContent,
      disabled: document.getElementById('rSepia').disabled,
    };
  });

  console.log('\n=== A 初始状态 ===');
  const a = await st();
  ok('主题 light', a.theme === 'light', a.theme);
  ok('柔光 on', a.pm === 'on', a.pm);
  ok('字体 serif', a.font === 'serif', a.font);
  ok('纸色 rgb(253,251,244)', a.paper === 'rgb(253, 251, 244)', a.paper);
  ok('滤镜 12/78/89/97', a.filter === 'sepia(0.12) saturate(0.78) contrast(0.89) brightness(0.97)', a.filter);

  console.log('\n=== B 字阶层级（核心修复） ===');
  ok('h1 > h2', a.h1 > a.h2, [a.h1, a.h2]);
  ok('h2 > h3', a.h2 > a.h3, [a.h2, a.h3]);
  ok('h3 > 正文（旧版这里是反的）', a.h3 > a.p, [a.h3, a.p]);
  // h1 = h2倍数 × 1.36 = 1.42 × 1.36 = 1.9312（早期断言误写成 1.84，是我算错）
  ok('h1/正文 ≈ 1.93×', Math.abs(a.h1 / a.p - 1.931) < 0.03, a.h1 / a.p);
  ok('h3/正文 ≈ 1.09×', Math.abs(a.h3 / a.p - 1.089) < 0.06, a.h3 / a.p);

  console.log('\n=== C 柔光开关 ===');
  await p.click('#pmSwitch .track'); await p.waitForTimeout(600);
  const off = await st();
  ok('开关关闭 → data-pm=off', off.pm === 'off', off.pm);
  ok('滤镜被强制归零', off.filter === 'none', off.filter);
  ok('颗粒 opacity 归零', off.noise === '0', off.noise);
  ok('纸底色不变（柔光不影响主题）', off.paper === a.paper, off.paper);
  ok('文字颜色不变', off.ink === a.ink, off.ink);
  ok('字号不变（柔光不影响排印）', off.p === a.p, [off.p, a.p]);
  ok('柔光滑杆被禁用', off.disabled === true, off.disabled);
  ok('开关文字变「柔光关闭」', /关闭/.test(off.swLbl), off.swLbl);
  ok('提示说明已关闭', /柔光已关闭|主题原始色值/.test(off.hint), off.hint);

  await p.click('#pmSwitch .track'); await p.waitForTimeout(600);
  const re = await st();
  ok('再开恢复滤镜', re.filter === 'sepia(0.12) saturate(0.78) contrast(0.89) brightness(0.97)', re.filter);
  ok('再开恢复颗粒', re.noise === '0.028', re.noise);
  ok('滑杆重新可用', re.disabled === false, re.disabled);

  console.log('\n=== D 主题切换 ===');
  const themes = [
    ['sepia', 'rgb(244, 236, 216)', '旧书本'],
    ['ink', 'rgb(242, 243, 240)', '墨绿纸'],
    ['night', 'rgb(24, 24, 24)', '夜间'],
    ['light', 'rgb(253, 251, 244)', '米黄纸'],
  ];
  for (const [t, bg, nm] of themes) {
    await p.click('#btnTheme'); await p.waitForTimeout(220);
    await p.click(`#themeDrop button[data-theme="${t}"]`); await p.waitForTimeout(500);
    const s = await st();
    ok(`主题 ${t} 纸色正确`, s.paper === bg, s.paper);
    ok(`主题 ${t} 名称显示「${nm}」`, s.themeName === nm, s.themeName);
    ok(`主题 ${t} 不改变排印`, Math.abs(s.p - a.p) < 0.1 && Math.abs(s.h1 - a.h1) < 0.1, [s.p, s.h1]);
  }

  await p.click('#btnTheme'); await p.waitForTimeout(200);
  await p.click('#themeDrop button[data-theme="night"]'); await p.waitForTimeout(500);
  const nightSt = await st();
  ok('夜间颗粒改 screen（深底避免脏斑）', nightSt.blend === 'screen', nightSt.blend);
  await p.click('#btnTheme'); await p.waitForTimeout(200);
  await p.click('#themeDrop button[data-theme="light"]'); await p.waitForTimeout(500);
  ok('浅色主题颗粒回 multiply', (await st()).blend === 'multiply');

  console.log('\n=== E 字族切换 ===');
  for (const [f, kw] of [['sans', 'YaHei'], ['kai', 'KaiTi'], ['hei', 'SimHei'], ['serif', 'Source Serif']]) {
    await p.click(`#fontPick button[data-f="${f}"]`); await p.waitForTimeout(320);
    const s = await st();
    ok(`字族 ${f} 生效`, s.family.includes(kw), s.family.slice(0, 50));
    ok(`字族 ${f} 不改字号`, Math.abs(s.p - a.p) < 0.1, s.p);
  }

  console.log('\n=== F 字阶联动 ===');
  const setR = async (id, v) => {
    await p.evaluate(([id, v]) => {
      const r = document.getElementById(id);
      r.value = v; r.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
    await p.waitForTimeout(400);
  };
  await setR('rFs', 130);
  const big = await st();
  ok('字号拉到 130 → 正文 20.8px', Math.abs(big.p - 20.8) < 0.25, big.p);
  ok('标题等比放大（h1 也变大）', big.h1 > a.h1 * 1.2, [big.h1, a.h1]);
  ok('放大后层级仍成立 h1>h2>h3>正文',
     big.h1 > big.h2 && big.h2 > big.h3 && big.h3 > big.p, [big.h1, big.h2, big.h3, big.p]);

  await setR('rFs', 85);
  const small = await st();
  ok('字号拉到 85 → 正文 13.6px', Math.abs(small.p - 13.6) < 0.25, small.p);
  ok('缩小后层级仍成立', small.h1 > small.h2 && small.h2 > small.h3 && small.h3 > small.p,
     [small.h1, small.h2, small.h3, small.p]);

  await setR('rFs', 105);
  await setR('rScale', 145);
  const steep = await st();
  ok('标题比例 1.45 → h2 变陡', steep.h2 / steep.p > 1.44, steep.h2 / steep.p);
  ok('标题比例拉满 h3 仍 > 正文', steep.h3 > steep.p, [steep.h3, steep.p]);
  await setR('rScale', 115);
  const flat = await st();
  ok('标题比例 1.15 → h2 变缓', flat.h2 / flat.p < 1.16, flat.h2 / flat.p);
  ok('标题比例压到最低 h3 仍 > 正文（不塌陷）', flat.h3 > flat.p, [flat.h3, flat.p]);
  await setR('rScale', 142);

  console.log('\n=== G 恢复推荐值 ===');
  await setR('rFs', 125);
  await p.click('#fontPick button[data-f="kai"]'); await p.waitForTimeout(300);
  await p.click('#pmSwitch .track'); await p.waitForTimeout(500);
  await p.click('#btnReset'); await p.waitForTimeout(600);
  const rs = await st();
  ok('恢复后柔光重新开启', rs.pm === 'on', rs.pm);
  ok('恢复后字族 serif', rs.font === 'serif', rs.font);
  ok('恢复后字号 1.05rem', Math.abs(rs.p - 16.8) < 0.25, rs.p);
  ok('恢复后滤镜回到推荐值', rs.filter === 'sepia(0.12) saturate(0.78) contrast(0.89) brightness(0.97)', rs.filter);

  console.log('\n=== H 复制参数 ===');
  await p.click('#btnCopy'); await p.waitForTimeout(500);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('含主题', /data-theme: light/.test(clip), clip.slice(0, 50));
  ok('含柔光开关态', /data-pm: on/.test(clip));
  ok('含字阶三条', /--pm-h1/.test(clip) && /--pm-h2/.test(clip) && /--pm-h3/.test(clip));
  ok('含字族', /data-font: serif/.test(clip));

  console.log('\n=== I 结构 ===');
  const struct = await p.evaluate(() => ({
    h2: document.querySelectorAll('h2').length,
    h3: document.querySelectorAll('h3').length,
    tables: document.querySelectorAll('table').length,
    blurInContent: [...document.querySelectorAll('.pm-read *')].some(e => /blur\(/.test(getComputedStyle(e).filter)),
    panelFixed: getComputedStyle(document.getElementById('panel')).position,
  }));
  ok('七节正文', struct.h2 === 7, struct.h2);
  ok('三处三级标题', struct.h3 === 3, struct.h3);
  ok('四张表格', struct.tables === 4, struct.tables);
  ok('正文零 blur', struct.blurInContent === false);
  ok('面板仍 fixed', struct.panelFixed === 'fixed', struct.panelFixed);

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 3));

  console.log(`\n${'='.repeat(46)}`);
  console.log(`结果：${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 项`);
  console.log('='.repeat(46));
  await b.close();
  process.exit(fail ? 1 : 0);
})();