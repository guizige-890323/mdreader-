const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const m = () => p.evaluate(() => [...document.querySelectorAll('#gridFeats .w-card')].map(c => {
    const i = c.querySelector('.wf-info'); const d = i.querySelector('span:not([class])');
    return { infoH: i.offsetHeight, dH: d ? d.clientHeight : 0, cardH: c.offsetHeight };
  }));
  const a = await m();
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await p.waitForTimeout(1200);
  const e = await m();
  console.log('ZH infoH set =', [...new Set(a.map(x=>x.infoH))], ' dH set =', [...new Set(a.map(x=>x.dH))]);
  console.log('EN infoH set =', [...new Set(e.map(x=>x.infoH))], ' dH set =', [...new Set(e.map(x=>x.dH))]);
  console.log('EN cardH set =', [...new Set(e.map(x=>x.cardH))]);
  console.log(JSON.stringify(e));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
