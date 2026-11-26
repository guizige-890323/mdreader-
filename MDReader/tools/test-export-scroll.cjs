/* ==================================================================
   test-export-scroll.cjs  ·  导出 HTML 可滚动回归
   ------------------------------------------------------------------
   背景（CR-2026-11-19-01）：
     主 CSS 里有两条面向应用外壳的全局规则
       · src/template.html:395   html,body{height:100%}
       · src/template.html:2123  html{overflow:hidden}   ← 欢迎屏锁死视口滚动
     导出页会把这套 CSS 全量带走，而 exportHTML() 的 extra 原先只补了
     body{overflow:auto}，没解 html。结果：导出页 html 被锁成视口高、
     overflow:hidden，用户滚轮/PageDown 全部失效（内容明明有 13000px）。

   ⚠ 关键测法：必须用真实 mouse.wheel / 键盘。
     window.scrollTo() 在 overflow:hidden 下依然生效 —— 用它测会得到
     "能滚" 的假阳性，这个坑本轮已经踩过一次。
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'MDReader.html');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TMP = path.join(__dirname, '_export-scroll-tmp');

let pass = 0, fail = 0;
// playwright-core 在 browser.close() 后仍会对已销毁页面派发 TargetClosedError，
// 这是库内部竞态、与应用无关。测试结束阶段静默它，避免干扰判定输出。
process.on('unhandledRejection', e => {
  const m = String((e && e.message) || e);
  if (/TargetClosedError|Target page, context or browser has been closed/i.test(m)) return;
  throw e;
});
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  OK   ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('  FAIL ' + name + '  -> ' + JSON.stringify(extra)); }
};

(async () => {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const appErrs = [];
  p.on('pageerror', e => appErrs.push(String(e)));

  // ---- 1. 静态检查：extra 里必须显式解掉 html 的锁 ----
  const html = fs.readFileSync(DIST, 'utf8');
  ok('产物含 html{overflow:auto!important}', /html\{overflow:auto!important/.test(html));
  ok('产物含 html height:auto!important', /html\{[^}]*height:auto!important/.test(html));

  // ---- 2. 走真实 UI 导出一份 ----
  await p.goto('file:///' + DIST.replace(/\\/g, '/'));
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById('btnExport').click());
  await p.waitForTimeout(500);

  let outFile = null;
  try {
    const [dl] = await Promise.all([
      p.waitForEvent('download', { timeout: 30000 }),
      p.evaluate(() => document.querySelector('#expMenu button[data-fmt="html"]').click()),
    ]);
    outFile = path.join(TMP, 'exported.html');
    await dl.saveAs(outFile);
    ok('导出 HTML 成功', fs.existsSync(outFile), fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB' : null);
  } catch (e) {
    ok('导出 HTML 成功', false, e.message);
  }

  if (outFile) {
    // ---- 3. 打开导出页，量几何 ----
    const p2 = await ctx.newPage();
    const expErrs = [];
    p2.on('pageerror', e => expErrs.push(String(e)));
    await p2.goto('file:///' + outFile.replace(/\\/g, '/'));
    await p2.waitForTimeout(1400);
    const g = await p2.evaluate(() => ({
      htmlOv: getComputedStyle(document.documentElement).overflow,
      htmlH: getComputedStyle(document.documentElement).height,
      bodyOv: getComputedStyle(document.body).overflow,
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      textLen: (document.querySelector('#content') || {}).textContent?.length || 0,
    }));
    ok('导出页 html overflow = auto', g.htmlOv === 'auto', g.htmlOv);
    ok('导出页 html 高度不被锁成视口高', g.htmlH !== g.clientH + 'px', { h: g.htmlH, vh: g.clientH });
    ok('导出页内容确实超出一屏（前提成立）', g.scrollH > g.clientH * 1.5, { scrollH: g.scrollH, clientH: g.clientH });

    // ---- 4. 真实滚轮（这是核心断言） ----
    await p2.mouse.move(Math.round(1440 / 2), Math.round(900 / 2));
    for (let i = 0; i < 8; i++) { await p2.mouse.wheel(0, 400); await p2.waitForTimeout(100); }
    await p2.waitForTimeout(400);
    const yWheel = await p2.evaluate(() => window.scrollY);
    ok('真实滚轮能让导出页滚动', yWheel > 0, yWheel);

    // ---- 5. 键盘 PageDown ----
    await p2.keyboard.press('PageDown');
    await p2.waitForTimeout(450);
    const yKey = await p2.evaluate(() => window.scrollY);
    ok('PageDown 能继续滚动', yKey > yWheel, { 滚轮后: yWheel, PageDown后: yKey });

    // ---- 6. 回到顶部也正常（不能只会往下） ----
    await p2.evaluate(() => window.scrollTo(0, 0));
    await p2.waitForTimeout(300);
    await p2.mouse.wheel(0, -400);
    await p2.waitForTimeout(300);
    const yBack = await p2.evaluate(() => window.scrollY);
    ok('能滚回顶部', yBack < yKey, yBack);

    ok('导出页零 JS 错误', expErrs.length === 0, expErrs.slice(0, 2));
  }

  ok('主应用零 JS 错误', appErrs.length === 0, appErrs.slice(0, 2));
  // 关闭前解绑所有 page 事件：playwright 在 CDP 断开时会对残留监听抛 TargetClosedError
  appErrs.length = 0;
  p.removeAllListeners();
  for (const pg of ctx.pages()) pg.removeAllListeners();
  await browser.close().catch(() => { });
  await new Promise(r => setTimeout(r, 400));

  console.log('\n' + '='.repeat(46));
  console.log('  PASS = ' + pass + '   FAIL = ' + fail);
  console.log('='.repeat(46));
  process.exitCode = fail ? 1 : 0;
})();