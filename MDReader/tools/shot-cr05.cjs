/* ==================================================================
   CR-2026-11-15-05 · 阅读体验四件套 对比截图
   ------------------------------------------------------------------
   cr05-headings.png   卡片皮肤：同级同字号 + 胶囊标题（红色政商风格）
   cr05-lh.png         行高对比：左紧凑 1.5 / 右宽松 2.3（同一段文字）
   cr05-rose.png       玫瑰图：乱序输入 → 升序顺时针辐射（深色）
   cr05-focus.png      专注模式：左侧竖排快捷菜单，正文让位不遮挡
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/shot-cr05.cjs
   ================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto('file:///' + F); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2000);

  /* 1. 胶囊标题（红色政商 + 卡片） */
  await p.evaluate(() => { const x = document.querySelector('#setTT button[data-tt="gov"]'); if (x) x.click(); });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.evaluate(() => { const r = document.getElementById('reader'); if (r) r.scrollTop = 0; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/cr05-headings.png' });

  /* 2. 行高对比：同一文档先紧凑后宽松，各截阅读区 */
  const shotReader = async (name) => {
    const el = await p.$('.reader');
    await el.screenshot({ path: SHOTS + '/' + name });
  };
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'compact'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await shotReader('cr05-lh-compact.png');
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'loose'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await shotReader('cr05-lh-loose.png');
  await p.evaluate(() => { const s = document.getElementById('lhSel'); s.value = 'standard'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);

  /* 3. 玫瑰图升序辐射（深色 + 乱序数据） */
  await p.evaluate(() => document.getElementById('skinDark').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const tw = Array.prototype.slice.call(document.querySelectorAll('#content .tw'))
      .find(w => !!w.querySelector('button[data-act="chart"]'));
    const tb = tw.querySelector('tbody');
    tb.innerHTML = '<tr><td>00-首页与导航</td><td class="num">37</td></tr>' +
      '<tr><td>10-系统设计</td><td class="num">181</td></tr>' +
      '<tr><td>20-项目交付</td><td class="num">960</td></tr>' +
      '<tr><td>30-商务经营</td><td class="num">409</td></tr>' +
      '<tr><td>40-运维保障</td><td class="num">358</td></tr>' +
      '<tr><td>50-模板规范</td><td class="num">125</td></tr>' +
      '<tr><td>60-知识参考</td><td class="num">1198</td></tr>' +
      '<tr><td>99-附件</td><td class="num">0</td></tr>' +
      '<tr><td>合计</td><td class="num">3269</td></tr>';
    const box = tw.querySelector('.chart-box');
    const btn = tw.querySelector('button[data-act="chart"]');
    if (box.classList.contains('show')) btn.click();
    btn.click();
    box.querySelector('.chart-types button[data-ct="rose"]').click();
    box.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(900);
  await shotReader('cr05-rose.png');

  /* 4. 专注模式侧边菜单 */
  await p.evaluate(() => document.getElementById('skinLight').click());
  await p.waitForTimeout(500);
  await p.evaluate(() => { const r = document.getElementById('reader'); if (r) r.scrollTop = 0; });
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(500);
  await p.screenshot({ path: SHOTS + '/cr05-focus.png' });
  const geo = await p.evaluate(() => {
    const f = document.getElementById('focusRender').getBoundingClientRect();
    const inner = document.querySelector('.reader-inner').getBoundingClientRect();
    return { dockRight: Math.round(f.right), innerLeft: Math.round(inner.left), dockW: Math.round(f.width) };
  });
  console.log('专注侧边几何 =', JSON.stringify(geo));
  await b.close();
  console.log('截图完成：cr05-headings / cr05-lh-compact / cr05-lh-loose / cr05-rose / cr05-focus');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
