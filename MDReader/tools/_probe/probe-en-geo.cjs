const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const [w,h] of [[1280,720],[1366,768],[1440,900],[1600,900],[1920,1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1400);
    const zh = await p.evaluate(() => { const c=document.querySelector('#gridFeats .w-card'), s=document.querySelector('.wf-stage');
      return [c.offsetWidth, c.offsetHeight, s.clientWidth, s.clientHeight, document.querySelector('.wf-info').offsetHeight]; });
    await p.evaluate(() => { const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
    await p.waitForTimeout(1300);
    const en = await p.evaluate(() => { const c=document.querySelector('#gridFeats .w-card'), s=document.querySelector('.wf-stage');
      return [c.offsetWidth, c.offsetHeight, s.clientWidth, s.clientHeight, document.querySelector('.wf-info').offsetHeight]; });
    console.log(w+'x'+h, 'ZH card/info/stage', zh.join('/'), ' EN card/info/stage', en.join('/'));
    await p.close();
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
