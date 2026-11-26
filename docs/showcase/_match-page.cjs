const { chromium } = require('playwright-core');
const path = require('path'); const fs=require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const dir=path.resolve(__dirname,'_scan2'); fs.mkdirSync(dir,{recursive:true});
  const targets = [
    ['show','file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html'],
    ['app-light','file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html'],
  ];
  for (const [tag,url] of targets){
    const p = await b.newPage({ viewport:{width:1274,height:701} });
    await p.goto(url); await p.waitForTimeout(2500);
    const H = await p.evaluate(()=>document.documentElement.scrollHeight);
    for(let y=0;y<Math.max(1,H-600);y+=60){
      await p.evaluate(v=>scrollTo(0,v), y);
      await p.waitForTimeout(140);
      await p.screenshot({ path: path.join(dir, tag+'-'+String(y).padStart(5,'0')+'.png') });
    }
    console.log(tag,'H=',H);
    await p.close();
  }
  await b.close();
})();
