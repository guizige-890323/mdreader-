/* ==================================================================
   CR-2026-11-15-04 导出 HTML 渲染菜单 · 对比截图
   ------------------------------------------------------------------
   export-before.png       改动前：导出页是纯静态快照（隐藏菜单 / 工具条）
   export-after.png        改动后：顶部浮动渲染菜单 + 每图自带结构/类型按钮
   export-after-dark.png   菜单真生效：深色 + 红色政商风格 + 环形图 + 组织结构图
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/shot-export-runtime.cjs
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const FIX = path.join(__dirname, '_fixtures', 'doc-style.md').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const OUT = path.join(SHOTS, 'export-shot.html').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
/* 浏览器关闭时 playwright 内部常有 pending navigation reject，与截图无关 */
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

/* 模拟改动前：导出页没有运行时菜单，图表/流程图工具条也被隐藏 */
const OLD = '#mdx-bar{display:none!important}body{padding-top:0!important}' +
  '.mf-tools,.chart-types,.chart-sub{display:none!important}';

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  await p.addInitScript(() => { window.__dl = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = function (x) { try { if (/html/.test(x.type || '')) window.__dl.push(x.text()); } catch (e) { } return o(x); }; });
  await p.goto('file:///' + F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', FIX); await p.waitForTimeout(2300);
  await p.evaluate(() => {
    document.querySelectorAll('#content .tw').forEach(tw => {
      const btn = tw.querySelector('button[data-act="chart"]');
      const box = tw.querySelector('.chart-box');
      if (btn && box && !box.classList.contains('show')) btn.click();
    });
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.getElementById('btnExport').click(); const x = document.querySelector('#expMenu button[data-fmt="html"]'); if (x) x.click(); });
  await p.waitForTimeout(1400);
  const html = await p.evaluate(async () => window.__dl.length ? await window.__dl[window.__dl.length - 1] : '');
  if (!html.length) throw new Error('导出 HTML 失败');
  fs.writeFileSync(OUT, html, 'utf8');
  const q = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await q.goto('file:///' + OUT); await q.waitForTimeout(900);
  /* 改动前对照：注入一条可移除的临时 CSS，不 reload 页面 */
  await q.evaluate(css => {
    const s = document.createElement('style');
    s.id = 'mdx-inject-old'; s.textContent = css; document.head.appendChild(s);
  }, OLD);
  await q.screenshot({ path: SHOTS + '/export-before.png' });
  /* 改动后默认：移除临时 CSS，恢复运行时菜单 */
  await q.evaluate(() => { const s = document.getElementById('mdx-inject-old'); if (s) s.remove(); });
  await q.waitForTimeout(200);
  await q.screenshot({ path: SHOTS + '/export-after.png' });
  /* 菜单真生效 */
  await q.evaluate(() => {
    const hit = (sel) => { const x = document.querySelector(sel); if (x) x.click(); };
    hit('#mdx-bar .mdx-seg[data-seg="theme"] button[data-v="dark"]');
    hit('#mdx-bar .mdx-seg[data-seg="style"] button[data-v="gov"]');
    const cb = document.querySelector('.chart-box[data-mdx-i] .chart-types button[data-ct="pie"]');
    if (cb) cb.click();
    const fb = document.querySelector('.mf-wrap[data-mdx-i] .mf-modes button[data-mode="org"]');
    if (fb) fb.click();
  });
  await q.waitForTimeout(500);
  await q.screenshot({ path: SHOTS + '/export-after-dark.png' });
  const state = await q.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    style: document.documentElement.getAttribute('data-doc-style'),
    chart: document.querySelector('.chart-box[data-mdx-i]').dataset.ct,
    flow: document.querySelector('.mf-wrap[data-mdx-i]').dataset.mdxMode
  }));
  console.log('导出页菜单切换后的状态 =', JSON.stringify(state));
  await b.close();
  console.log('截图完成：export-before.png / export-after.png / export-after-dark.png');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
