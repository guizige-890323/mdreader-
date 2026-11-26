/* 环形图「按分项百分比精确划分扇区」回归测试
   ------------------------------------------------------------------
   背景：圆角环形图曾用 step = 2π/n 等角均分（8 片各 45°），与右侧图例
   33.0% / 0.3% 完全脱节 —— 数值没有任何几何编码，属于读图误导。
   本脚本锁定修复后的不变量：

     1. 每片 sweep = 分项值 / 总量 × 2π（误差 < 2e-6 rad）
     2. 逐片累计连续：a0[k] === a1[k-1]，总和 === 2π
     3. 角度比例 === 数值比例（33% 的扇区是 0.3% 扇区的 110 倍宽）
     4. 真实 SVG 路径采样：极角落在 [a0, a1] 内、半径落在 [R0, R1] 内
        —— 不只信 data 属性，验证圆角路径本身没被画歪
     5. 缝隙自适应：0.3% 极小扇区仍为正角度，路径不出现 NaN
     6. 边界：单项 100% / 全等值 / 含 0 值 / 含负值 / rose↔pie 切换 / 三主题
     7. 全程零 JS 异常

   运行：NODE_PATH=<node_modules> node tools/test-pie-percent.cjs
   ------------------------------------------------------------------ */
const { chromium } = require('playwright-core');

const HTML = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const TAU = Math.PI * 2;
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name +
    (cond ? '' : '  ' + JSON.stringify(extra)));
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 2e-6 : eps);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));

  await page.goto(HTML);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#wDemo').click());
  await page.waitForTimeout(2200);

  /* 用示例文档的表格容器注入自定义数据，再切到指定图表类型 */
  async function draw(rows, ct) {
    return page.evaluate(({ rows, ct }) => {
      const tw = Array.prototype.slice.call(document.querySelectorAll('#content .tw'))
        .find(w => w.querySelector('button[data-act="chart"]'));
      if (!tw) return { err: 'no table wrapper' };
      const tb = tw.querySelector('table tbody');
      tb.innerHTML = rows.map(r => '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>').join('');
      const box = tw.querySelector('.chart-box'), btn = tw.querySelector('button[data-act="chart"]');
      if (box.classList.contains('show')) btn.click();   // 先收起，保证是全新绘制
      btn.click();
      if (!box.classList.contains('show')) return { err: 'chart not shown' };
      const b = box.querySelector('.chart-types button[data-ct="' + ct + '"]');
      if (!b) return { err: 'no ct button ' + ct };
      b.click();
      return { ok: true };
    }, { rows, ct });
  }

  /* 读取环形图几何 + 对真实 path 做 48 点采样 */
  async function read() {
    await page.waitForTimeout(430);
    return page.evaluate(() => {
      /* 只认带 data-frac 的环形图切片：玫瑰图的 .pie-slice 没有该属性，
         工具栏图标 svg 也不会被误取 */
      const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
        .find(b => b.querySelector('.pie-slice[data-frac]'));
      if (!box) return { err: 'no pie box' };
      const svg = Array.prototype.slice.call(box.querySelectorAll('svg'))
        .find(s => s.querySelector('.pie-slice[data-frac]'));
      if (!svg) return { err: 'no svg' };
      const CX = 232, CY = 180, R0 = 72, R1 = 132;
      const slices = Array.prototype.slice.call(svg.querySelectorAll('.pie-slice')).map(s => {
        const a0 = +s.dataset.a0, a1 = +s.dataset.a1, frac = +s.dataset.frac;
        const d = s.getAttribute('d') || '';
        let amin = Infinity, amax = -Infinity, rmin = Infinity, rmax = -Infinity;
        try {
          const L = s.getTotalLength();
          for (let i = 0; i <= 48; i++) {
            const p = s.getPointAtLength(L * i / 48);
            const dx = p.x - CX, dy = p.y - CY;
            let ang = Math.atan2(dy, dx);
            /* 以该片起始角为基准展开，避免 atan2 在 ±π 处跳变 */
            while (ang < a0 - 0.3) ang += Math.PI * 2;
            while (ang > a0 + Math.PI * 2 + 0.3) ang -= Math.PI * 2;
            amin = Math.min(amin, ang); amax = Math.max(amax, ang);
            const r = Math.hypot(dx, dy);
            rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
          }
        } catch (e) { /* 退化路径（0 值片）采样失败可容忍 */ }
        return {
          a0: a0, a1: a1, frac: frac, sweep: a1 - a0, d: d,
          amin: amin, amax: amax, rmin: rmin, rmax: rmax,
          p: s.dataset.p, v: s.dataset.v, t: s.dataset.t,
          nan: /NaN|undefined|Infinity/.test(d), closed: /Z\s*$/.test(d.trim())
        };
      });
      return {
        slices: slices,
        vb: svg.getAttribute('viewBox'),
        pcts: Array.prototype.slice.call(svg.querySelectorAll('.pie-pct')).map(e => e.textContent.trim()),
        ct: box.dataset.ct, rt: box.dataset.rt
      };
    });
  }

  /* ---------- [1] 截图同款数据：33.0% → 0.3%，总量 1000 ---------- */
  console.log('\n[1] 截图同款 8 项数据：角度必须逐项精确匹配百分比');
  const DATA = [
    ['渠道A', 330], ['渠道B', 265], ['渠道C', 130], ['渠道D', 119],
    ['渠道E', 90], ['渠道F', 47], ['渠道G', 16], ['渠道H', 3]
  ];
  const TOTAL = 1000;
  const EXPECT = DATA.map(r => r[1] / TOTAL);
  let r = await draw(DATA, 'pie');
  ok('能绘制环形图', r.ok === true, r);
  const d1 = await read();
  ok('读到 8 个扇区', d1.slices && d1.slices.length === 8, d1.err || (d1.slices || []).length);
  ok('画布仍为环形图尺寸 780×360', d1.vb === '0 0 780 360', d1.vb);
  ok('图表类型确认为 pie', d1.ct === 'pie' && d1.rt === 'pie', { ct: d1.ct, rt: d1.rt });

  const S = d1.slices || [];
  ok('每片 data-frac 与 值/总量 一致',
    S.every((s, i) => near(s.frac, EXPECT[i], 1e-6)), S.map(s => s.frac));
  ok('每片 sweep === frac × 2π（精确划分）',
    S.every(s => near(s.sweep, s.frac * TAU)), S.map(s => ({ sweep: s.sweep, want: s.frac * TAU })));
  ok('逐片累计连续：a0[k] === a1[k-1]',
    S.every((s, i) => i === 0 || near(s.a0, S[i - 1].a1)), S.map(s => [s.a0, s.a1]));
  ok('累计总和 === 2π（无缺口无重叠）',
    S.length && near(S[S.length - 1].a1 - S[0].a0, TAU),
    S.length ? S[S.length - 1].a1 - S[0].a0 : null);
  ok('非等角均分：最大片与最小片角度差 110 倍',
    S.length === 8 && near(S[0].sweep / S[7].sweep, 110, 0.01),
    { max: S[0] && S[0].sweep, min: S[7] && S[7].sweep, ratio: S[0] && S[0].sweep / S[7].sweep });
  ok('角度比例 === 数值比例（任意两片）',
    S.every((a, i) => S.every((b, j) => {
      if (b.sweep === 0) return true;
      const want = DATA[i][1] / DATA[j][1];
      return Math.abs(a.sweep / b.sweep - want) / want < 1e-4;   // 比值量级大，必须用相对误差
    })), S.map(s => +s.sweep.toFixed(4)));
  ok('角度随数值单调递减',
    S.every((s, i) => i === 0 || s.sweep <= S[i - 1].sweep + 1e-9), S.map(s => +s.sweep.toFixed(4)));
  ok('扇区 data-p 与占比一致（data-p 为纯数字，不带 %）',
    S.every((s, i) => s.p === (EXPECT[i] * 100).toFixed(1)), S.map(s => s.p));
  ok('右侧图例百分比文字与扇区一致',
    d1.pcts.length === 8 && d1.pcts.every((p, i) => p === (EXPECT[i] * 100).toFixed(1) + '%'), d1.pcts);

  /* ---------- [2] 真实 SVG 路径采样（不只信 data 属性） ---------- */
  console.log('\n[2] 真实路径几何采样');
  ok('所有 path 无 NaN / undefined / Infinity', S.every(s => !s.nan), S.filter(s => s.nan).map(s => s.d.slice(0, 80)));
  ok('所有 path 闭合', S.every(s => s.closed), S.filter(s => !s.closed).length);
  ok('采样极角不越过该片精确边界 [a0, a1]',
    S.every(s => s.amin >= s.a0 - 0.02 && s.amax <= s.a1 + 0.02),
    S.map(s => [+s.a0.toFixed(3), +s.amin.toFixed(3), +s.amax.toFixed(3), +s.a1.toFixed(3)]));
  ok('采样覆盖该片 ≥70% 角度（未被缝隙或圆角吃掉）',
    S.every(s => (s.amax - s.amin) >= s.sweep * 0.7),
    S.map(s => [+(s.amax - s.amin).toFixed(4), +s.sweep.toFixed(4)]));
  ok('采样半径落在环形壁厚 [R0-2, R1+2] 内',
    S.every(s => s.rmin >= 70 && s.rmax <= 134),
    S.map(s => [+s.rmin.toFixed(1), +s.rmax.toFixed(1)]));
  ok('0.3% 极小扇区仍为正角度且路径有效',
    S.length === 8 && S[7].sweep > 0 && !S[7].nan && S[7].closed,
    { sweep: S[7] && S[7].sweep, d: S[7] && S[7].d.slice(0, 100) });

  /* ---------- [3] 与旧「等角均分」行为显式对照 ---------- */
  console.log('\n[3] 旧等角行为已被消除');
  ok('没有任何一片等于 2π/8（45°）',
    S.every(s => !near(s.sweep, TAU / 8, 1e-4)), S.map(s => +s.sweep.toFixed(4)));
  ok('最大片约 118.8°（33.0% × 360°）',
    S.length === 8 && near(S[0].sweep * 180 / Math.PI, 118.8, 0.05),
    S[0] && S[0].sweep * 180 / Math.PI);
  ok('最小片约 1.08°（0.3% × 360°）',
    S.length === 8 && near(S[7].sweep * 180 / Math.PI, 1.08, 0.05),
    S[7] && S[7].sweep * 180 / Math.PI);

  /* ---------- [4] 边界数据 ---------- */
  console.log('\n[4] 边界数据');
  const cases = [
    { name: '单项 100%', rows: [['唯一', 100]], pos: [100], total: 100 },
    { name: '全等 8 项（此时等分是正确行为）', rows: Array.from({ length: 8 }, (_, i) => ['项' + i, 100]), pos: Array(8).fill(100), total: 800 },
    { name: '含 0 值', rows: [['A', 50], ['B', 0], ['C', 50]], pos: [50, 0, 50], total: 100 },
    { name: '含负值（按 max(0,v) 处理）', rows: [['A', -5], ['B', 30], ['C', 70]], pos: [0, 30, 70], total: 100 },
    { name: '2 项极悬殊 99.7% / 0.3%', rows: [['大', 997], ['小', 3]], pos: [997, 3], total: 1000 }
  ];
  for (const c of cases) {
    const dr = await draw(c.rows, 'pie');
    const rd = await read();
    const ss = rd.slices || [];
    ok(c.name + '：绘制成功且片数正确', dr.ok === true && ss.length === c.pos.length,
      { dr: dr, n: ss.length, want: c.pos.length });
    ok(c.name + '：sweep === pos/total × 2π',
      ss.length === c.pos.length && ss.every((s, i) => near(s.sweep, c.pos[i] / c.total * TAU)),
      ss.map(s => +s.sweep.toFixed(5)));
    ok(c.name + '：累计闭合到 2π',
      ss.length && near(ss[ss.length - 1].a1 - ss[0].a0, TAU),
      ss.length ? ss[ss.length - 1].a1 - ss[0].a0 : null);
    ok(c.name + '：路径无 NaN', ss.every(s => !s.nan), ss.filter(s => s.nan).length);
  }
  /* 全等数据下应恰好等分（这是正确语义，不是 bug） */
  const eqRead = await (async () => { await draw(cases[1].rows, 'pie'); return read(); })();
  ok('全等 8 项时每片恰为 45°（等分仅在数值相等时成立）',
    (eqRead.slices || []).every(s => near(s.sweep, TAU / 8, 2e-6)),
    (eqRead.slices || []).map(s => +s.sweep.toFixed(6)));

  /* ---------- [5] rose ↔ pie 切换后仍精确 ---------- */
  console.log('\n[5] 图表类型切换');
  await draw(DATA, 'rose');
  const roseVb = await page.evaluate(() => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(b => b.querySelector('.rose-item'));
    if (!box) return null;
    const svg = Array.prototype.slice.call(box.querySelectorAll('svg'))
      .find(s => s.querySelector('.rose-item'));
    return svg ? svg.getAttribute('viewBox') : null;
  });
  ok('切到玫瑰图仍是独立 800×400 画布（等角变径语义未破坏）', roseVb === '0 0 800 400', roseVb);
  await page.evaluate(() => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(b => b.querySelector('.rose-item'));
    box.querySelector('.chart-types button[data-ct="pie"]').click();
  });
  const back = await read();
  ok('切回环形图后角度仍逐项精确',
    (back.slices || []).length === 8 && back.slices.every((s, i) => near(s.sweep, EXPECT[i] * TAU)),
    (back.slices || []).map(s => +s.sweep.toFixed(4)));

  /* ---------- [6] 三主题 ---------- */
  console.log('\n[6] 三主题');
  for (const th of ['light', 'dark', 'sepia']) {
    await page.evaluate((t) => {
      const el = document.querySelector('#skin' + t.charAt(0).toUpperCase() + t.slice(1));
      if (el) el.click();
    }, th);
    await page.waitForTimeout(320);
    /* 切换主题会重绘正文（注入的表格被还原），因此每轮重新注入数据再验证 */
    await draw(DATA, 'pie');
    const rd = await read();
    ok(th + ' 主题下角度仍精确',
      (rd.slices || []).length === 8 && rd.slices.every((s, i) => near(s.sweep, EXPECT[i] * TAU)),
      (rd.slices || []).map(s => +s.sweep.toFixed(4)));
  }

  /* ---------- [7] 运行时 ---------- */
  console.log('\n[7] 运行时');
  ok('全程无 JS 异常', jsErrors.length === 0, jsErrors);

  console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) console.log('失败项:\n  ' + fails.join('\n  '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
