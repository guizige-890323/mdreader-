const { chromium } = require('playwright-core');
const path=require('path'); const fs=require('fs');
const targets = [
  ['show','file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html'],
  ['app','file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html'],
];
(async()=>{
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--hide-scrollbars']});
  const dir=path.resolve(__dirname,'_band'); fs.mkdirSync(dir,{recursive:true});
  for(const [tag,url] of targets){
    const p=await b.newPage({viewport:{width:1035,height:900}});
    await p.goto(url); await p.waitForTimeout(2500);
    const H=await p.evaluate(()=>document.documentElement.scrollHeight);
    for(let y=0;y<Math.max(1,H-260);y+=90){
      await p.evaluate(v=>scrollTo(0,v),y); await p.waitForTimeout(160);
      const clip=await p.screenshot();
      fs.writeFileSync(path.join(dir,`${tag}_${String(y).padStart(5,'0')}.png`), clip);
    }
    console.log(tag,'H',H);
    await p.close();
  }
  await b.close();
})();
