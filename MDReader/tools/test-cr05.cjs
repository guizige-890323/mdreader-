/* ==================================================================
   CR-2026-11-15-05 · 阅读体验四件套 专项测试
   ------------------------------------------------------------------
   a) 同级标题字阶统一（全局/卡头/卡体/纸张四处同字号）+ 胶囊背景随 --tt-* 联动
   b) 行高四档（--lh 变量 / 顶栏下拉 / 设置面板 / 专注侧边 / 导出页 / 持久化）
   c) 玫瑰图按值升序顺时针辐射（半径非减 / 标签数值对应 / 总量不变）
   d) 专注快捷菜单左侧竖排（不遮正文 / 14 代理 / 窄屏窄轨）
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/test-cr05.cjs
   跑之前先 python MDReader/src/build.py
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'MDReader.html');
const F = ('file:///' + FILE).replace(/\\/g, '/');
const HTML = fs.readFileSync(FILE, 'utf8');
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
  await p.goto(F);
  await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2000);

  /* ---------------- A. 标题统一 + 胶囊 ---------------- */
  console.log('\n[A] 同级标题字阶统一 + 胶囊背景');
  ok('dist 含统一字阶变量', has('#content{--h1:1.9em;--h2:1.5em;--h3:1.25em;--h4:1.12em;--h5:1.06em;--h6:1.02em}'));
  ok('dist 含胶囊背景规则', has('background:var(--tt-bar,var(--accent-2));color:var(--tt-bar-fg,var(--text));'));

  /* card 皮肤量「卡头 vs 卡体」；paper 皮肤没有卡片结构，
     把探针挂到 #content 直接量全局标题字阶（同一组 --h1..--h6）。 */
  const probeHeadings = (layout) => p.evaluate((layout) => {
    const isCard = layout === 'card';
    const body = isCard ? document.querySelector('#content .card-body') : document.getElementById('content');
    const head = isCard ? document.querySelector('#content .card-head .card-title') : null;
    const probes = [];
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(t => {
      if (body && !body.querySelector(t)) {
        const e = document.createElement(t); e.className = '__cr05probe'; e.textContent = 'probe';
        body.appendChild(e); probes.push(e);
      }
      if (head && !head.querySelector(t)) {
        const e = document.createElement(t); e.className = '__cr05probe'; e.textContent = 'probe';
        head.appendChild(e); probes.push(e);
      }
    });
    const px = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
    const bs = isCard ? '#content .card-body ' : '#content ';
    const r = {
      head: head ? { h1: px('#content .card-head h1'), h2: px('#content .card-head h2'), h3: px('#content .card-head h3') } : null,
      body: { h1: px(bs + 'h1'), h2: px(bs + 'h2'), h3: px(bs + 'h3'),
              h4: px(bs + 'h4'), h5: px(bs + 'h5'), h6: px(bs + 'h6') },
      p: px(bs + 'p') || px('#content p')
    };
    probes.forEach(e => e.remove());
    return r;
  }, layout);

  for (const layout of ['card', 'paper']) {
    await p.evaluate(l => {
      const sel = document.getElementById('layoutSel');
      sel.value = l; sel.dispatchEvent(new Event('change'));
    }, layout);
    await p.waitForTimeout(600);
    const r = await probeHeadings(layout);
    const near = (a, c) => a !== null && c !== null && Math.abs(a - c) < 0.6;
    if (r.head) {
      ok(`${layout} 卡头 h1 = 卡体 h1`, near(r.head.h1, r.body.h1), r);
      ok(`${layout} 卡头 h2 = 卡体 h2`, near(r.head.h2, r.body.h2), r);
      ok(`${layout} 卡头 h3 = 卡体 h3`, near(r.head.h3, r.body.h3), r);
      ok(`${layout} 卡头 h2 ≥ 卡体 h3 ×1.1`, r.head.h2 >= r.body.h3 * 1.1, [r.head.h2, r.body.h3]);
    }
    ok(`${layout} 字阶严格递减`, r.body.h1 > r.body.h2 && r.body.h2 > r.body.h3 && r.body.h3 > r.body.h4 && r.body.h4 > r.body.h5 && r.body.h5 >= r.body.h6, r.body);
    ok(`${layout} h6 仍大于正文`, r.body.h6 > r.p, [r.body.h6, r.p]);
  }
  /* 纸张全局标题与卡体同级同字号 */
  const paperGlobal = await p.evaluate(() => {
    const c = document.getElementById('content');
    const mk = t => { const e = document.createElement(t); e.className = '__cr05probe'; e.textContent = 'probe'; c.appendChild(e); return e; };
    const hs = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(mk);
    const g = hs.map(e => parseFloat(getComputedStyle(e).fontSize));
    const b = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(t => {
      const e = document.querySelector('#content .card-body ' + t) || document.querySelector('#content ' + t);
      return e ? parseFloat(getComputedStyle(e).fontSize) : null;
    });
    hs.forEach(e => e.remove());
    return { g, b };
  });
  ok('纸张全局 h1..h6 与卡体同级同字号', paperGlobal.g.every((v, i) => Math.abs(v - paperGlobal.b[i]) < 0.6), paperGlobal);

  /* 胶囊：圆角 + 背景随风格联动 + 宽度随文字 */
  await p.evaluate(() => { const s = document.getElementById('layoutSel'); s.value = 'card'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  const pill = () => p.evaluate(() => {
    const h = document.querySelector('#content .card-body h3') || document.querySelector('#content h2');
    const cs = getComputedStyle(h);
    const hr = h.getBoundingClientRect();
    const pr = h.parentElement.getBoundingClientRect();
    return { radius: cs.borderRadius, bg: cs.backgroundColor, color: cs.color,
      fit: hr.width < pr.width - 4, border: cs.borderBottomWidth };
  });
  const pillMono = await pill();
  ok('标题胶囊圆角 ≥ 12px', parseFloat(pillMono.radius) >= 12, pillMono.radius);
  ok('标题胶囊有背景色', pillMono.bg !== 'rgba(0, 0, 0, 0)' && pillMono.bg !== 'transparent', pillMono.bg);
  ok('标题宽度随文字（不拉通栏）', pillMono.fit === true, pillMono);
  ok('旧版下划线已移除', pillMono.border === '0px', pillMono.border);
  const pillBgs = { mono: pillMono.bg };
  for (const s of ['tech', 'gov', 'cute']) {
    await p.evaluate(v => {
      const btn = document.querySelector('#setTT button[data-tt="' + v + '"]');
      if (btn) btn.click();
    }, s);
    await p.waitForTimeout(450);
    pillBgs[s] = (await pill()).bg;
  }
  ok('四套风格胶囊背景互不相同', new Set(Object.values(pillBgs)).size === 4, pillBgs);
  await p.evaluate(() => { const btn = document.querySelector('#setTT button[data-tt="mono"]'); if (btn) btn.click(); });
  await p.waitForTimeout(400);
  /* 深色下胶囊仍可读（背景与文字不同色） */
  await p.evaluate(() => document.getElementById('skinDark').click());
  await p.waitForTimeout(600);
  const pillDark = await pill();
  ok('深色主题胶囊背景与文字不同色', pillDark.bg !== pillDark.color, pillDark);
  await p.evaluate(() => document.getElementById('skinLight').click());
  await p.waitForTimeout(500);

  /* ---------------- B. 行高设置 ---------------- */
  console.log('\n[B] 行高四档 + 全入口同步 + 持久化');
  ok('dist 含 --lh 变量行距', has('line-height:var(--lh,1.78)'));
  ok('dist 含顶栏行高下拉', has('id="lhSel"'));
  ok('dist 含设置面板行高行', has('id="setLH"'));
  const lhOf = () => p.evaluate(() => {
    const c = document.getElementById('content');
    const cs = getComputedStyle(c);
    return { varLh: c.style.getPropertyValue('--lh'), computed: cs.lineHeight, fs: cs.fontSize,
      sel: document.getElementById('lhSel').value };
  });
  const lh0 = await lhOf();
  ok('默认行高 = 标准 1.78', lh0.varLh === '1.78' && lh0.sel === 'standard', lh0);
  const ratio = s => parseFloat(s.computed) / parseFloat(s.fs);
  ok('默认计算行距比 ≈1.78', Math.abs(ratio(lh0) - 1.78) < 0.02, ratio(lh0));

  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'loose'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  const lhLoose = await lhOf();
  ok('顶栏切「宽松」→ --lh=2.3', lhLoose.varLh === '2.3', lhLoose);
  ok('宽松计算行距比 ≈2.3', Math.abs(ratio(lhLoose) - 2.3) < 0.02, ratio(lhLoose));
  ok('设置面板「宽松」呈 .on', await p.evaluate(() => document.querySelector('#setLH button[data-lh="loose"]').classList.contains('on')));

  await p.evaluate(() => document.querySelector('#setLH button[data-lh="compact"]').click());
  await p.waitForTimeout(300);
  const lhCompact = await lhOf();
  ok('设置面板切「紧凑」→ --lh=1.5 且顶栏同步', lhCompact.varLh === '1.5' && lhCompact.sel === 'compact', lhCompact);

  /* 纸张皮肤行距也吃 --lh */
  await p.evaluate(() => { const s = document.getElementById('layoutSel'); s.value = 'paper'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  const lhPaper = await lhOf();
  ok('纸张皮肤行距同样吃 --lh', Math.abs(ratio(lhPaper) - 1.5) < 0.02, ratio(lhPaper));
  await p.evaluate(() => { const s = document.getElementById('layoutSel'); s.value = 'card'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);

  /* 持久化：reload 后恢复 */
  await p.reload(); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(1600);
  const lhReload = await lhOf();
  ok('reload 后行高偏好恢复（紧凑）', lhReload.varLh === '1.5' && lhReload.sel === 'compact', lhReload);
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'standard'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);

  /* ---------------- C. 玫瑰图升序辐射 ---------------- */
  console.log('\n[C] 玫瑰图按值升序顺时针辐射');
  await p.evaluate(() => {
    const tw = Array.prototype.slice.call(document.querySelectorAll('#content .tw'))
      .find(w => !!w.querySelector('button[data-act="chart"]'));
    const tb = tw.querySelector('tbody');
    /* 故意乱序输入：小→大→中→0→最大 */
    tb.innerHTML = '<tr><td>甲</td><td class="num">120</td></tr>' +
      '<tr><td>乙</td><td class="num">900</td></tr>' +
      '<tr><td>丙</td><td class="num">300</td></tr>' +
      '<tr><td>丁</td><td class="num">0</td></tr>' +
      '<tr><td>戊</td><td class="num">2000</td></tr>';
    const box = tw.querySelector('.chart-box');
    const btn = tw.querySelector('button[data-act="chart"]');
    if (box.classList.contains('show')) btn.click();
    btn.click();
    box.querySelector('.chart-types button[data-ct="rose"]').click();
  });
  await p.waitForTimeout(800);
  const rose = await p.evaluate(() => {
    const box = Array.prototype.slice.call(document.querySelectorAll('.chart-box.show'))
      .find(x => !!x.querySelector('.rose-item'));
    const gs = Array.from(box.querySelectorAll('.rose-item'));
    const data = gs.map(g => {
      const sl = g.querySelector('.pie-slice');
      const d = sl.getAttribute('d');
      const m = d.match(/A([\d.]+) [\d.]+ 0/);
      return { i: +sl.getAttribute('data-i'), v: parseFloat(sl.getAttribute('data-v').replace(/,/g, '')),
        t: sl.getAttribute('data-t'), r: m ? +m[1] : 0,
        name: g.querySelector('.rose-name').textContent,
        val: g.querySelector('.rose-val').textContent };
    });
    return { data, total: box.querySelector('[data-role="total"]').textContent };
  });
  ok('绘制序 data-i 递增（顺时针）', rose.data.every((d, i) => d.i === i), rose.data.map(d => d.i));
  ok('数值按绘制序升序', rose.data.every((d, i) => i === 0 || d.v >= rose.data[i - 1].v), rose.data.map(d => d.v));
  ok('半径随绘制序非减（向外辐射）', rose.data.every((d, i) => i === 0 || d.r >= rose.data[i - 1].r - 0.6), rose.data.map(d => d.r));
  ok('标签名称与扇区数值一一对应', rose.data.every(d => d.val.indexOf(d.t) >= 0 || d.name === d.t), rose.data);
  ok('中心总量不变（3320）', rose.total.replace(/,/g, '') === '3320', rose.total);

  /* ---------------- D. 专注侧边菜单 ---------------- */
  console.log('\n[D] 专注快捷菜单左侧竖排');
  ok('dist 含侧边定位规则', has('.focus-render{position:fixed;left:14px;top:50%;transform:translateY(-50%)'));
  ok('dist 含正文让位规则', has('#app.focus .reader-inner{margin-left:112px;margin-right:12px;width:calc(100% - 124px)}'));
  ok('旧底部横条规则已清零', !has('bottom:18px;left:50%;transform:translateX(-50%)'));
  ok('旧 toast 上移规则已清零', !has('html:has(#app.focus) #toast{bottom:auto;top:18px}'));
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(400);
  const fr = await p.evaluate(() => {
    const f = document.getElementById('focusRender');
    const r = f.getBoundingClientRect();
    const inner = document.querySelector('.reader-inner').getBoundingClientRect();
    const btns = Array.from(f.querySelectorAll('[data-proxy]'));
    const cs = getComputedStyle(f);
    return { rect: { l: r.left, t: r.top, r: r.right, b: r.bottom }, dir: cs.flexDirection,
      innerL: inner.left, count: btns.length,
      ids: btns.map(x => x.getAttribute('data-proxy') + (x.getAttribute('data-val') ? ':' + x.getAttribute('data-val') : '')),
      on: btns.map(x => x.classList.contains('on')),
      toastBottom: getComputedStyle(document.getElementById('toast')).bottom };
  });
  ok('侧边菜单竖排', fr.dir === 'column', fr.dir);
  ok('侧边菜单落在左侧（right < 120）', fr.rect.r < 120, fr.rect);
  ok('侧边菜单完整在视口内', fr.rect.l >= 0 && fr.rect.t >= 0 && fr.rect.b <= 900, fr.rect);
  ok('正文让位：reader-inner 左缘 ≥ 菜单右缘', fr.innerL >= fr.rect.r - 1, { innerL: fr.innerL, dockR: fr.rect.r });
  ok('代理按钮 14 个（含 4 行高）', fr.count === 14, fr.count);
  ok('行高代理集合正确', fr.ids.slice(4, 8).join(',') === 'lhSel:compact,lhSel:standard,lhSel:comfort,lhSel:loose', fr.ids);
  ok('标准行高代理呈 .on', fr.on[5] === true, fr.on);
  ok('toast 保持底部（不再上移）', fr.toastBottom === '44px', fr.toastBottom);

  await p.click('.fr-btn[data-proxy="lhSel"][data-val="loose"]');
  await p.waitForTimeout(300);
  const frLh = await p.evaluate(() => ({
    lh: document.getElementById('content').style.getPropertyValue('--lh'),
    sel: document.getElementById('lhSel').value,
    on: Array.from(document.querySelectorAll('#focusRender [data-proxy="lhSel"]')).map(x => x.classList.contains('on'))
  }));
  ok('侧边代理「宽松」→ --lh=2.3 且顶栏同步', frLh.lh === '2.3' && frLh.sel === 'loose', frLh);
  ok('侧边行高 .on 态正确', JSON.stringify(frLh.on) === JSON.stringify([false, false, false, true]), frLh.on);
  await p.click('.fr-btn[data-proxy="lhSel"][data-val="standard"]');
  await p.waitForTimeout(300);

  /* 窄屏窄轨
     CR-08 取样口径：本段测的是「窄轨（收起态）」宽度，而上面两次 p.click 会把
     真实鼠标停在菜单上 —— 按新契约「鼠标移入自动展开」，此时菜单理应处于展开态。
     所以先把光标移回正文区（真实用户把鼠标挪开的动作），再量收起态几何。
     这不是放宽断言：≤50px 这条硬约束原样保留，只是让它量在它该量的那一态上；
     展开态的几何与「不遮正文」由 test-cr08 另行按 132/116px 精确锁定。 */
  await p.mouse.move(700, 500);
  await p.waitForTimeout(450);
  await p.setViewportSize({ width: 800, height: 900 });
  await p.waitForTimeout(400);
  const frNarrow = await p.evaluate(() => {
    const f = document.getElementById('focusRender');
    const r = f.getBoundingClientRect();
    const inner = document.querySelector('.reader-inner').getBoundingClientRect();
    return { w: r.width, r: r.right, innerL: inner.left, b: r.bottom };
  });
  ok('窄屏侧边收成窄轨（≤50px）', frNarrow.w <= 50, frNarrow);
  ok('窄屏正文仍让位', frNarrow.innerL >= frNarrow.r - 1, frNarrow);
  ok('窄屏侧边不越界', frNarrow.b <= 900, frNarrow);
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok('Esc 退出后侧边收起', await p.evaluate(() => getComputedStyle(document.getElementById('focusRender')).display === 'none'));

  /* ---------------- E. 导出页行高菜单 ---------------- */
  console.log('\n[E] 导出页行高菜单');
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'comfort'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    window.__dl = [];
    const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (x) { try { if (/html/.test(x.type || '')) window.__dl.push(x.text()); } catch (e) { } return o(x); };
  });
  await p.evaluate(() => { document.getElementById('btnExport').click(); const x = document.querySelector('#expMenu button[data-fmt="html"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  const expHtml = await p.evaluate(async () => window.__dl.length ? await window.__dl[window.__dl.length - 1] : '');
  ok('导出 HTML 捕获成功', expHtml.length > 10000, expHtml.length);
  const OUT = path.join(ROOT, '_shots', 'cr05-export.html');
  fs.writeFileSync(OUT, expHtml, 'utf8');
  const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const qerrs = [];
  q.on('pageerror', e => qerrs.push(e.message));
  await q.goto(('file:///' + OUT).replace(/\\/g, '/'));
  await q.waitForTimeout(900);
  const exp0 = await q.evaluate(() => ({
    lh: document.getElementById('content').style.getPropertyValue('--lh'),
    seg: !!document.querySelector('#mdx-bar .mdx-seg[data-seg="lh"]'),
    on: (document.querySelector('#mdx-bar .mdx-seg[data-seg="lh"] button.on') || {}).dataset ? document.querySelector('#mdx-bar .mdx-seg[data-seg="lh"] button.on').dataset.v : null,
    state: window.MDExport.state.lh
  }));
  ok('导出页携带行高预置（comfort=2）', exp0.lh === '2' && exp0.state === 'comfort', exp0);
  ok('导出页行高分段存在且选中舒适', exp0.seg === true && exp0.on === 'comfort', exp0);
  await q.click('#mdx-bar .mdx-seg[data-seg="lh"] button[data-v="loose"]');
  await q.waitForTimeout(300);
  const exp1 = await q.evaluate(() => ({
    lh: document.getElementById('content').style.getPropertyValue('--lh'),
    ratio: parseFloat(getComputedStyle(document.getElementById('content')).lineHeight) / parseFloat(getComputedStyle(document.getElementById('content')).fontSize)
  }));
  ok('导出页切「宽松」真生效', exp1.lh === '2.3' && Math.abs(exp1.ratio - 2.3) < 0.02, exp1);
  ok('导出页零 JS 错误', qerrs.length === 0, qerrs.slice(0, 3));
  await q.close();
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'standard'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);

  /* ---------------- F. 英文界面 ---------------- */
  console.log('\n[F] 英文界面词条');
  await p.evaluate(() => { const sel = document.getElementById('setLang'); sel.value = 'en'; sel.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1400);
  const en = await p.evaluate(() => ({
    lhLabel: (document.querySelector('#setLH') || {}).closest ? document.querySelector('#setLH').closest('.set-row').querySelector('.set-label').textContent : '',
    opts: Array.from(document.getElementById('lhSel').options).map(o => o.textContent),
    segBtns: Array.from(document.querySelectorAll('#setLH button')).map(x => x.textContent),
    frLh: Array.from(document.querySelectorAll('#focusRender [data-proxy="lhSel"]')).map(x => x.textContent)
  }));
  ok('设置面板行高标签翻译', en.lhLabel === 'Line Height', en.lhLabel);
  ok('顶栏行高选项翻译', en.opts.join('|') === '↕ Tight|↕ Std|↕ Cozy|↕ Loose', en.opts);
  ok('设置面板四档翻译', en.segBtns.join('|') === 'Tight|Standard|Comfortable|Loose', en.segBtns);
  ok('专注侧边行高翻译', en.frLh.join('|') === 'Tight|Standard|Comfortable|Loose', en.frLh);
  await p.evaluate(() => { const sel = document.getElementById('setLang'); sel.value = 'zh-CN'; sel.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(900);

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 5));
  await b.close();
  console.log('\n============================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('============================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
