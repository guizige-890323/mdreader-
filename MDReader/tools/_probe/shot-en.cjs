const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const [w, h, tag] of [[1440, 900, 'en-1440'], [1366, 768, 'en-1366'], [1920, 1080, 'en-1920']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1500);
    await p.evaluate(() => { const s = document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
    await p.waitForTimeout(1400);
    await p.screenshot({ path: path.join(__dirname, tag + '.png') });
    await p.close();
  }
  await b.close(); console.log('done');
})().catch(e=>{console.error(e);process.exit(1);});
