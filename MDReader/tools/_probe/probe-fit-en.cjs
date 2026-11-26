const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const meta = () => p.evaluate(() => {
    const st = document.querySelector('.wf-stage');
    const info = document.querySelector('#gridFeats .w-card .wf-info');
    const card = document.querySelector('#gridFeats .w-card');
    const w = document.getElementById('welcome');
    return { stageH: st.clientHeight, stageW: st.clientWidth, infoH: info.offsetHeight,
      cardW: card.offsetWidth, cardH: card.offsetHeight,
      wfW: getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-w'),
      welcome: [w.scrollHeight, w.clientHeight], winY: scrollY };
  });
  console.log('ZH', JSON.stringify(await meta()));
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1200);
  console.log('EN', JSON.stringify(await meta()));
  await p.evaluate(() => window.__wfFit && window.__wfFit());
  await p.waitForTimeout(300);
  console.log('EN2', JSON.stringify(await meta()));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
