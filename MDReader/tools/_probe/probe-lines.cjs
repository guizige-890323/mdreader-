const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const lang of ['zh-CN','en']) {
    for (const [w,h] of [[1280,720],[1366,768],[1440,900]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.goto(F); await p.waitForTimeout(1400);
      if (lang==='en') { await p.evaluate(()=>{const s=document.getElementById('setLang');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));}); await p.waitForTimeout(1300); }
      const r = await p.evaluate(() => {
        const d=[...document.querySelectorAll('#gridFeats .w-card .wf-info > span:not([class])')];
        const lh=parseFloat(getComputedStyle(d[0]).lineHeight)||1;
        return { need: d.map(s=>Math.round(s.scrollHeight/lh)), got: d.map(s=>Math.round(s.clientHeight/lh)),
          dw: Math.round(d[0].getBoundingClientRect().width), cw: document.querySelector('#gridFeats .w-card').offsetWidth };
      });
      console.log(lang, w+'x'+h, 'descW', r.dw, 'cardW', r.cw, 'need', r.need.join(''), 'got', r.got.join(''));
      await p.close();
    }
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
