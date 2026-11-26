const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const lang of ['zh-CN','en']) {
    for (const [w,h] of [[1280,720],[1366,768],[1440,900]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.goto(F); await p.waitForTimeout(1400);
      if (lang==='en') { await p.evaluate(() => { const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); }); await p.waitForTimeout(1300); }
      const r = await p.evaluate(() => {
        const dscs=[...document.querySelectorAll('#gridFeats .w-card .wf-info > span:not([class])')];
        return dscs.map((s,i)=>({i:i+1, cut: s.scrollHeight>s.clientHeight+1, th: s.scrollHeight, ch: s.clientHeight}))
          .filter(x=>x.cut).map(x=>x.i+':'+x.th+'/'+x.ch);
      });
      console.log(lang, w+'x'+h, 'cut =', r.length, r.join(' '));
      await p.close();
    }
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
