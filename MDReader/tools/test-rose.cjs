/* 玫瑰图（外标签 + 同色引导线）回归测试
   ------------------------------------------------------------------
   背景：玫瑰图从「左侧环形图 + 右侧图例列表」改为参考 ECharts labelLine 的
   「每片一根同色折线牵到图外标签」。本脚本锁定这次改造的关键不变量：

     1. 结构：每片有 1 个扇区 / 1 条引导线 / 1 个名称 / 1 个数值，数量恒等
     2. 配色：引导线 stroke 必须与所属扇区 fill 完全一致（否则"同色指认"失效）
     3. 排版：任意类别数（3~12）下标签互不重叠、不越出画布
     4. 几何：等角变径 —— 半径随数值单调不减，且最小瓣仍可见
     5. 交互：悬停扇区或标签都能点亮整组并改写中心数值；移出后精确复位

   为什么用 DOM 几何断言而不是看图：标签重叠/越界这类问题肉眼在窄屏下
   极难发现，但用 getBBox() 做两两求交是确定性的。

   运行：NODE_PATH=<node_modules> node tools/test-rose.cjs
   ------------------------------------------------------------------ */
const { chromium } = require('playwright-core');

const HTML = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name +
    (cond ? '' : '  ' + JSON.stringify(extra)));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));

  await page.goto(HTML);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#wDemo').click());
  await page.waitForTimeout(2200);

  /* ---------- [1] 结构与配色（示例文档 5 类） ---------- */
  console.log('\n[1] 结构与配色');
  const setup = await page.evaluate(() => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(b => !!b.querySelector('.pie-slice'));
    if (!box) return { err: 'no pie box' };
    const rb = box.querySelector('.chart-types button[data-ct="rose"]');
    if (!rb) return { err: 'no rose btn' };
    rb.click();
    return { ok: true };
  });
  await page.waitForTimeout(900);
  ok('示例文档中存在饼图容器', setup.ok === true, setup);

  const base = await page.evaluate(() => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(b => !!b.querySelector('.rose-item'));
    if (!box) return { err: 'no rose box' };
    const items = Array.from(box.querySelectorAll('.rose-item'));
    const slices = items.map(g => g.querySelector('.pie-slice'));
    const leads = items.map(g => g.querySelector('path.pie-lead'));
    const names = items.map(g => g.querySelector('.rose-name'));
    const vals = items.map(g => g.querySelector('.rose-val'));
    const svg = Array.from(box.querySelectorAll('svg')).find(s => s.querySelector('.rose-item'));
    return {
      items: items.length,
      slices: slices.filter(Boolean).length,
      leads: leads.filter(Boolean).length,
      names: names.filter(Boolean).length,
      vals: vals.filter(Boolean).length,
      sliceFills: slices.map(s => s && s.getAttribute('fill')),
      leadStrokes: leads.map(l => l && l.getAttribute('stroke')),
      vb: svg.getAttribute('viewBox'),
      total: box.querySelector('[data-role="total"]').textContent,
      series: box.querySelector('[data-role="series"]').textContent,
      circles: box.querySelectorAll('circle.pie-lead').length,
    };
  });
  ok('扇区数 = 组数', base.slices === base.items && base.items > 0, base);
  ok('引导线数与扇区相等', base.leads === base.slices, { leads: base.leads, slices: base.slices });
  ok('名称数与数值数相等', base.names === base.slices && base.vals === base.slices, base);
  ok('每条引导线都有起点圆点', base.circles === base.slices, { circles: base.circles });
  ok('引导线颜色与扇区颜色逐一同色',
    base.sliceFills.every((f, i) => f && f === base.leadStrokes[i]),
    { fills: base.sliceFills, strokes: base.leadStrokes });
  ok('扇区用纯色填充（非渐变，保证同色指认成立）',
    base.sliceFills.every(f => /^#[0-9a-f]{6}$/i.test(f)), base.sliceFills);
  ok('画布为独立玫瑰图尺寸（非环形图的 780×360）',
    base.vb === '0 0 800 400', base.vb);
  ok('中心显示总量与系列名', !!base.total && !!base.series, { t: base.total, s: base.series });

  /* ---------- [2] 排版：不重叠 / 不越界 ---------- */
  console.log('\n[2] 标签排版（多类别）');
  for (const N of [3, 4, 5, 6, 8, 10, 12]) {
    const r = await page.evaluate((N) => {
      const tw = Array.prototype.slice.call(document.querySelectorAll('#content .tw'))
        .find(w => !!w.querySelector('button[data-act="chart"]'));
      const tbl = tw.querySelector('table');
      const tb = tbl.querySelector('tbody');
      const words = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑'];
      tb.innerHTML = Array.from({ length: N }, (_, i) =>
        '<tr><td>' + words[i % 12] + '类</td><td class="num">' + ((N - i) * 7 + 3) + '</td></tr>').join('');
      const box = tw.querySelector('.chart-box');
      const btn = tw.querySelector('button[data-act="chart"]');
      if (box.classList.contains('show')) btn.click();   // 先收起，保证是全新绘制
      btn.click();
      if (!box.classList.contains('show')) return { err: 'not shown' };
      box.querySelector('.chart-types button[data-ct="rose"]').click();

      const gs = Array.from(box.querySelectorAll('.rose-item'));
      const svg = Array.from(box.querySelectorAll('svg')).find(s => s.querySelector('.rose-item'));
      const VB = svg.getAttribute('viewBox').split(' ').map(Number);
      const texts = [];
      gs.forEach(g => {
        const n = g.querySelector('.rose-name'), v = g.querySelector('.rose-val');
        if (n) texts.push({ s: n.textContent, bb: n.getBBox() });
        if (v) texts.push({ s: v.textContent, bb: v.getBBox() });
      });
      const ovl = [];
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const A = texts[i].bb, B = texts[j].bb;
          if (A.x < B.x + B.width - 1 && B.x < A.x + A.width - 1 &&
              A.y < B.y + B.height - 1 && B.y < A.y + A.height - 1) ovl.push([texts[i].s, texts[j].s]);
        }
      }
      const over = texts.filter(t => t.bb.x < -1 || t.bb.y < -1 ||
        t.bb.x + t.bb.width > VB[2] + 1 || t.bb.y + t.bb.height > VB[3] + 1).map(t => t.s);
      const sides = gs.map(g => {
        const n = g.querySelector('.rose-name');
        return n.getAttribute('text-anchor') === 'end' ? 'L' : 'R';
      }).join('');
      /* 等角变径：半径应随数值单调不减 */
      const radii = gs.map(g => {
        const d = g.querySelector('.pie-slice').getAttribute('d');
        const m = d.match(/A([\d.]+) [\d.]+ 0/);
        return m ? +m[1] : 0;
      });
      return { N, ovl: ovl.length, ovlSample: ovl.slice(0, 3), over: over.length, overSample: over.slice(0, 3), sides, radii };
    }, N);
    await page.waitForTimeout(420);
    if (r.err) { ok(`N=${N} 能正常绘制`, false, r); continue; }
    ok(`N=${N} 标签零重叠`, r.ovl === 0, r.ovlSample);
    ok(`N=${N} 标签零越界`, r.over === 0, r.overSample);
    /* 左右分列：不应出现某一侧为空（除 N=1 这种退化情况，本测试 N>=3） */
    ok(`N=${N} 左右两侧都有标签`, r.sides.includes('L') && r.sides.includes('R'), r.sides);
    /* CR-2026-11-15-05c：数值降序输入 → 升序排序后绘制，半径应随绘制序非减（向外辐射） */
    const nonDecreasing = r.radii.every((v, i) => i === 0 || v >= r.radii[i - 1] - 0.6);
    ok(`N=${N} 半径随绘制序单调非减（升序辐射生效）`, nonDecreasing, r.radii);
    ok(`N=${N} 最小瓣仍可见（半径 > 内孔）`, Math.min.apply(null, r.radii) > 46, r.radii);
  }

  /* ---------- [3] 交互：悬停整组联动 ---------- */
  console.log('\n[3] 交互联动');
  const inter = await page.evaluate(async () => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(b => !!b.querySelector('.rose-item'));
    const total = box.querySelector('[data-role="total"]');
    const series = box.querySelector('[data-role="series"]');
    const orig = { t: total.textContent, s: series.textContent };
    const sl = box.querySelector('.pie-slice');
    const fire = (el, type, related) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related || null }));
    fire(sl, 'mouseover');
    const onSlice = { t: total.textContent, s: series.textContent,
      sliceOn: box.querySelectorAll('.pie-slice.on').length,
      itemOn: box.querySelectorAll('.rose-item.on').length };
    fire(sl, 'mouseout');
    const reset = { t: total.textContent, s: series.textContent,
      itemOn: box.querySelectorAll('.rose-item.on').length };
    /* 悬停标签也应联动 */
    const nm = box.querySelector('.rose-name');
    fire(nm, 'mouseover');
    const onLabel = { t: total.textContent,
      sliceOn: box.querySelectorAll('.pie-slice.on').length,
      itemOn: box.querySelectorAll('.rose-item.on').length };
    fire(nm, 'mouseout');
    return { orig, onSlice, reset, onLabel };
  });
  ok('悬停扇区：中心数值被替换', inter.onSlice.t !== inter.orig.t, inter);
  ok('悬停扇区：中心副标题显示「名称 · 占比」', /·/.test(inter.onSlice.s), inter.onSlice.s);
  ok('悬停扇区：恰好 1 个扇区高亮', inter.onSlice.sliceOn === 1, inter.onSlice);
  ok('悬停扇区：整组（含引导线/标签）高亮', inter.onSlice.itemOn === 1, inter.onSlice);
  ok('移出后中心数值精确复位', inter.reset.t === inter.orig.t && inter.reset.s === inter.orig.s, inter.reset);
  ok('移出后无残留高亮', inter.reset.itemOn === 0, inter.reset);
  ok('悬停标签同样点亮对应扇区', inter.onLabel.sliceOn === 1 && inter.onLabel.itemOn === 1, inter.onLabel);

  /* ---------- [4] 三主题下文字取色跟随 ---------- */
  console.log('\n[4] 三主题配色');
  const themeColors = {};
  for (const th of ['light', 'dark', 'sepia']) {
    await page.evaluate((t) => {
      const el = document.querySelector('#skin' + t.charAt(0).toUpperCase() + t.slice(1));
      if (el) el.click();
    }, th);
    await page.waitForTimeout(480);
    themeColors[th] = await page.evaluate(() => {
      const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
        .find(b => !!b.querySelector('.rose-item'));
      return { name: getComputedStyle(box.querySelector('.rose-name')).fill,
               val: getComputedStyle(box.querySelector('.rose-val')).fill };
    });
  }
  const uniq = new Set(Object.values(themeColors).map(o => o.name));
  ok('三主题下标签文字取色各不相同（随主题变化）', uniq.size >= 2, themeColors);
  ok('light / dark 下名称色反差明显',
    themeColors.light.name !== themeColors.dark.name,
    { light: themeColors.light.name, dark: themeColors.dark.name });

  /* ---------- [5] 无 JS 异常 ---------- */
  console.log('\n[5] 运行时');
  ok('全程无 JS 异常', jsErrors.length === 0, jsErrors);

  console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) console.log('失败项:\n  ' + fails.join('\n  '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();