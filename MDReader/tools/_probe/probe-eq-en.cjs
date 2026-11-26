const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of [[1280,720],[1366,768],[1440,900],[1920,1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1400);
    await p.evaluate(() => { const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
    await p.waitForTimeout(1400);
    const r = await p.evaluate(() => {
      const infos=[...document.querySelectorAll('#gridFeats .w-card .wf-info')];
      const cards=[...document.querySelectorAll('#gridFeats .w-card')];
      const dscs=[...document.querySelectorAll('#gridFeats .w-card .wf-info > span:not([class])')];
      return { info:[...new Set(infos.map(e=>e.offsetHeight))], card:[...new Set(cards.map(e=>e.offsetHeight))],
        varH:getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-info-h').trim(),
        cut: dscs.filter(s=>s.scrollHeight>s.clientHeight+1).length, n: infos.length };
    });
    console.log(w+'x'+h, JSON.stringify(r));
    await p.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
