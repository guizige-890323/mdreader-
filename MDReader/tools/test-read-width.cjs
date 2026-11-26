const { chromium } = require('playwright-core');
/* 阅读区宽度回归：两侧留白 ≈ 1/5，正文宽度最大化

   背景：旧方案把 .reader-inner 钉死在 max-width:980/1024px。
   1920 屏下两侧各空 448px、留白占 47%，正文被压在一千里。
   改成比例留白后要守住的四条不变量：

     1. 宽屏（≥1280）两侧留白各 = 10%，合计 20% = 1/5
     2. 宽屏阅读区宽度确实随窗口增长（不是又一个固定上限）
     3. 窄屏（窗口不够）留白自动收到 0，正文拿满主区
        —— 不能出现「硬留 20% 反而比原来更窄」的回退
     4. 左右留白必须对称；任何视口都不能横向溢出

   跑之前先 python src/build.py。 */
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SAMPLE = path.join(D, 'dist', '示例文档.md').replace(/\\/g, '/');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); }
};

/* 主区宽度 = 视口 - 侧边栏(272) - 竖向滚动条。用主区做分母才是有意义的「留白占比」。 */
async function measure(p) {
  return p.evaluate(() => {
    const main = document.querySelector('.main');
    const inner = document.querySelector('.reader-inner');
    const paper = document.querySelector('.reader-inner > .paper');
    const content = document.querySelector('#content');
    const para = content && content.querySelector('p');
    const mr = main.getBoundingClientRect();
    const ir = inner.getBoundingClientRect();
    const pr = paper ? paper.getBoundingClientRect() : null;
    return {
      mainW: Math.round(mr.width),
      innerW: Math.round(ir.width),
      gapL: Math.round(ir.left - mr.left),
      gapR: Math.round(mr.right - ir.right),
      paperW: pr ? Math.round(pr.width) : 0,
      paraW: para ? Math.round(para.getBoundingClientRect().width) : 0,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
}

async function openDoc(b, vw, layout) {
  const p = await b.newPage({ viewport: { width: vw, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(F);
  await p.waitForTimeout(600);
  if (layout) {
    await p.selectOption('#layoutSel', layout).catch(() => {});
    await p.waitForTimeout(400);
  }
  await p.setInputFiles('#filePicker', SAMPLE);
  await p.waitForTimeout(2200);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });

  /* ============ 1. 宽屏留白 = 1/5 ============ */
  console.log('\n[1] 宽屏两侧留白各 10%（合计 1/5）');
  const wide = [];
  for (const vw of [2560, 1920, 1600, 1440, 1280]) {
    const { p, errs } = await openDoc(b, vw);
    const m = await measure(p);
    m.vw = vw;
    wide.push(m);
    const pct = m.gapL / m.mainW * 100;
    /* 2560 这类超宽屏会先撞到 --read-max:1800 的上限，
       此时阅读区被 1800 钉住，留白占比自然 >10%。属于设计内，放宽到 11%。 */
    ok(`${vw}px 留白占比 ≈10%`, pct >= 9.4 && pct <= 11, { got: pct.toFixed(2) + '%', mainW: m.mainW, gapL: m.gapL, innerW: m.innerW });
    ok(`${vw}px 左右对称`, Math.abs(m.gapL - m.gapR) <= 1, { L: m.gapL, R: m.gapR });
    ok(`${vw}px 无横向溢出`, !m.overflowX);
    ok(`${vw}px 零 JS 错误`, errs.length === 0, errs.slice(0, 2));
    await p.close();
  }

  /* ============ 2. 正文随窗口增长 ============ */
  console.log('\n[2] 阅读区宽度随窗口增长（不是固定上限）');
  for (let i = 1; i < wide.length; i++) {
    const a = wide[i], bb = wide[i - 1];   // wide 是降序，bb 更宽
    ok(`${bb.vw} > ${a.vw} 时阅读区更宽`, bb.innerW > a.innerW, { wide: bb.innerW, narrow: a.innerW });
  }
  const w1920 = wide.find(x => x.vw === 1920);
  ok('1920px 下正文段 > 1100px（旧方案约 972）', w1920.paraW > 1100, { paraW: w1920.paraW });

  /* ============ 3. 窄屏留白收窄，正文不被挤压 ============ */
  console.log('\n[3] 窄屏留白自动收窄（正文不被挤压）');
  const narrow = [];
  for (const vw of [1100, 1024, 900, 768]) {
    const { p } = await openDoc(b, vw);
    const m = await measure(p);
    m.vw = vw;
    narrow.push(m);
    /* 1100 是过渡档：--read-min 780 还有余量，留白只剩 24px 而不是 0，
       所以断言「留白 ≤ 3%」比「留白 = 0」准确。 */
    const pct = m.gapL / m.mainW * 100;
    ok(`${vw}px 留白已收到 ≤3%`, pct <= 3.01, { got: pct.toFixed(2) + '%', inner: m.innerW, main: m.mainW });
    ok(`${vw}px 正文拿满剩余宽度`, m.innerW >= Math.min(m.mainW, 780) - 2, { inner: m.innerW, main: m.mainW });
    ok(`${vw}px 左右对称`, Math.abs(m.gapL - m.gapR) <= 1, { L: m.gapL, R: m.gapR });
    ok(`${vw}px 无横向溢出`, !m.overflowX);
    await p.close();
  }
  /* 关键回归：1024 不能比改动前（正文 619）更窄 */
  const n1024 = narrow.find(x => x.vw === 1024);
  ok('1024px 正文段 ≥ 600px（不比旧方案窄）', n1024.paraW >= 600, { paraW: n1024.paraW });

  /* ============ 4. 两套皮肤都遵守 ============ */
  console.log('\n[4] 两套皮肤宽度一致');
  for (const layout of ['card', 'paper', 'plain']) {
    const { p, errs } = await openDoc(b, 1920, layout);
    const m = await measure(p);
    ok(`${layout} 阅读区 1318px`, Math.abs(m.innerW - 1318) <= 3, { got: m.innerW });
    ok(`${layout} 留白对称`, Math.abs(m.gapL - m.gapR) <= 1, { L: m.gapL, R: m.gapR });
    ok(`${layout} 无横向溢出`, !m.overflowX);
    ok(`${layout} 零 JS 错误`, errs.length === 0, errs.slice(0, 2));
    await p.close();
  }

  /* ============ 5. 拉伸窗口是连续的，不是跳档 ============ */
  console.log('\n[5] 拖动窗口宽度：阅读区单调增长，无跳变');
  const { p } = await openDoc(b, 1280);
  const seq = [];
  for (const vw of [1280, 1360, 1440, 1520, 1600, 1760, 1920]) {
    await p.setViewportSize({ width: vw, height: 950 });
    await p.waitForTimeout(260);
    const m = await measure(p);
    seq.push({ vw, innerW: m.innerW, gapL: m.gapL });
  }
  let mono = true, jump = 0;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].innerW <= seq[i - 1].innerW) mono = false;
    jump = Math.max(jump, seq[i].innerW - seq[i - 1].innerW);
  }
  ok('逐级放大时阅读区单调变宽', mono, seq);
  ok('相邻档位增幅连续（无跳变）', jump < 160, { maxJump: jump, seq: seq.map(x => x.innerW) });
  await p.close();

  console.log('\n' + '='.repeat(44));
  console.log(`${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(44));
  await b.close();
  process.exit(fail ? 1 : 0);
})();