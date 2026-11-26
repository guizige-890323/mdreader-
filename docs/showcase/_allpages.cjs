const { chromium } = require('playwright-core');
const path=require('path'); const fs=require('fs');
const cands = [
  ['show','D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html'],
  ['app','D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html'],
  ['ai','D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/ai-report.html'],
  ['lens','D:/WorkBuddy/2026-11-08-21-28-36/mdlens/engine/MDLens.html'],
  ['d01','D:/WorkBuddy/2026-11-08-21-28-36/docs/design/html/01-产品设计方案.html'],
];
(async()=>{
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--hide-scrollbars']});
  const dir=path.resolve(__dirname,'_ap'); fs.mkdirSync(dir,{recursive:true});
  for(const [tag,f] of cands){
    if(!fs.existsSync(f)){console.log(tag,'MISSING');continue;}
    const p=await b.newPage({viewport:{width:1035,height:900}});
    try{ await p.goto('file:///'+f,{timeout:15000}); }catch(e){ console.log(tag,'ERR',e.message); await p.close(); continue; }
    await p.waitForTimeout(1800);
    const H=await p.evaluate(()=>document.documentElement.scrollHeight);
    for(let y=0;y<Math.max(1,Math.min(H,8000)-270);y+=60){
      await p.evaluate(v=>scrollTo(0,v),y); await p.waitForTimeout(110);
      const buf=await p.screenshot({clip:{x:0,y:0,width:1035,height:270}});
      fs.writeFileSync(path.join(dir,`${tag}_${String(y).padStart(5,'0')}.png`), buf);
    }
    console.log(tag,'H',H);
    await p.close();
  }
  await b.close();
})();
