/* CR-23 视觉取证：编辑态三张图（分栏 / 预览关 / 全篇） */
const { chromium } = require('playwright-core');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const TMP = path.join(ROOT, '_shots', '_cr23docs');
const OUT = path.join(ROOT, '_shots');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  p.on('dialog', async d => { await d.accept(); });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', [path.join(TMP, 'longform.md')]);
  await p.waitForTimeout(1800);

  /* 滚到第二节，进编辑 —— 验证「落在刚才读的那一节」 */
  await p.evaluate(() => {
    const r = document.querySelector('.reader');
    const h = [...document.querySelectorAll('#content h2')].find(x => /第二节/.test(x.textContent));
    r.scrollTop = r.scrollTop + h.getBoundingClientRect().top - r.getBoundingClientRect().top - 20;
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, 'cr23-1-split.png') });

  /* 预览关 */
  await p.evaluate(() => document.getElementById('btnBlockView').click());
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'cr23-2-pvoff.png') });

  /* 再开 + 改字看实时 */
  await p.evaluate(() => document.getElementById('btnBlockView').click());
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = ed.value.replace('- 列表项甲', '- 列表项甲（已改）');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(OUT, 'cr23-3-live.png') });

  /* 全篇编辑 */
  await p.evaluate(() => document.getElementById('btnSecWhole').click());
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'cr23-4-whole.png') });
  console.log('shots done');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });