const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const th of ['light','sepia','dark']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(F); await p.waitForTimeout(1500);
    await p.evaluate((th) => { document.documentElement.dataset.theme = th;
      const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); }, th);
    await p.waitForTimeout(1400);
    await p.screenshot({ path: path.join(__dirname, 'en-th-'+th+'.png') });
    const g = await p.evaluate(() => { const w=document.getElementById('welcome'); const c=document.querySelector('#gridFeats .w-card');
      return { w:[w.scrollHeight,w.clientHeight], y:scrollY, card:[c.offsetWidth,c.offsetHeight] }; });
    console.log(th, JSON.stringify(g));
    await p.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
