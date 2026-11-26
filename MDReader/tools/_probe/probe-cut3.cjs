const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of [[1280,720],[1366,768],[1600,900],[1920,1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1500);
    await p.evaluate(() => { const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
    await p.waitForTimeout(1400);
    const r = await p.evaluate(() => {
      const out=[];
      document.querySelectorAll('#gridFeats .w-card').forEach((c,i)=>{
        const s=c.querySelector('.wf-info > span:not([class])');
        const lh=parseFloat(getComputedStyle(s).lineHeight)||0;
        const need = lh ? Math.round(s.scrollHeight/lh) : 0;
        out.push({i:i+1, need, ch:s.clientHeight, len:(s.textContent||'').length, txt:(c.querySelector('b')||{}).textContent});
      });
      return out;
    });
    console.log('--- '+w+'x'+h+' ---');
    r.sort((a,b)=>b.need-a.need).slice(0,5).forEach(x=>console.log(' #'+x.i, 'need', x.need+'行', 'len', x.len, x.txt));
    await p.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
