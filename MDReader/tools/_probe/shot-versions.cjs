/* 对比三个产物版本的欢迎屏截图，确认「介绍视频」指哪一块 */
const { chromium } = require('playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const targets = [
  ['dist', 'dist/MDReader.html'],
  ['desktop', 'desktop/app/MDReader.html'],
  ['intl', 'dist-intl/MDReader.html'],
];

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  for (const [name, rel] of targets) {
    const f = 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await p.goto(f, { waitUntil: 'load', timeout: 20000 });
      await p.waitForTimeout(2000);
      const info = await p.evaluate(() => ({
        video: document.querySelectorAll('video').length,
        iframe: document.querySelectorAll('iframe').length,
        wfMode: !!document.querySelector('#gridFeats.wf-mode'),
        items: document.querySelectorAll('.wf-item').length,
        shots: document.querySelectorAll('.wf-shot').length,
        cards: document.querySelectorAll('#gridFeats .w-card').length,
        hasPri: document.querySelectorAll('.prio').length,
      }));
      console.log(name, JSON.stringify(info));
      await p.screenshot({ path: path.join(__dirname, 'shot-' + name + '.png') });
    } catch (e) {
      console.log(name, 'ERR', e.message.slice(0, 100));
    }
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });