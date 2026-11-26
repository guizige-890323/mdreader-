const { chromium } = require('playwright-core');
const path = require('path'); const fs = require('fs');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const zh = await p.evaluate(() => [...document.querySelectorAll('#gridFeats .w-card')].map(c => {
    const i = c.querySelector('.wf-info');
    return { title: c.querySelector('.wc-head b').textContent.trim(),
      desc: i.querySelector('span:not([class])').textContent.trim() };
  }));
  fs.writeFileSync(path.join(__dirname,'feats-zh.json'), JSON.stringify(zh,null,1));
  zh.forEach((x,k)=>console.log(k+1, x.desc.length, x.desc));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
