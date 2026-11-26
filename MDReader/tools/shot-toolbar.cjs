/* 生成多宽度顶栏截图，用于人眼确认布局 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
(async () => {
  const outDir = path.resolve(__dirname, '../_shots/toolbar');
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [w, tag] of [[1920, 'full'], [1600, 'compact'], [1366, 'icon'], [1080, 'mini'], [760, 'narrow']]) {
    const p = await b.newPage({ viewport: { width: w, height: 300 } });
    await p.goto('file:///' + path.resolve(__dirname, '../dist/MDReader.html').replace(/\\/g, '/'));
    await p.waitForTimeout(1100);
    await p.locator('.toolbar').screenshot({ path: path.join(outDir, `bar-${w}-${tag}.png`) });
    if (w === 1080) {
      await p.click('#btnMore'); await p.waitForTimeout(350);
      await p.screenshot({ path: path.join(outDir, 'menu-1080.png') });
    }
    await p.close();
  }
  await b.close();
  console.log('shots ->', outDir);
})();