const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1274, height: 701 } });
  await p.goto('file:///' + path.resolve(__dirname, 'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2500);
  const H = await p.evaluate(()=>document.documentElement.scrollHeight);
  const fs=require('fs');
  const dir=path.resolve(__dirname,'_scan'); fs.mkdirSync(dir,{recursive:true});
  for(let y=0;y<H-700;y+=120){
    await p.evaluate(v=>scrollTo(0,v), y);
    await p.waitForTimeout(220);
    await p.screenshot({ path: path.join(dir, String(y).padStart(5,'0')+'.png') });
  }
  console.log('docH',H);
  await b.close();
})();
