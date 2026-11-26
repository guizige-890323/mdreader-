const { chromium } = require('playwright-core');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--hide-scrollbars']});
  const p=await b.newPage({viewport:{width:1035,height:900}});
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(2500);
  await p.screenshot({path:path.resolve(__dirname,'_appw-1035.png')});
  const r=await p.evaluate(()=>{
    const parse=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const out=[];
    document.querySelectorAll('*').forEach(el=>{
      const cs=getComputedStyle(el); const bg=parse(cs.backgroundColor);
      if(!bg||bg.length<3) return;
      const [R,G,B]=bg;
      if(!(B>120 && B-R>40)) return;
      const rc=el.getBoundingClientRect();
      if(rc.width<100||rc.height<20) return;
      out.push({t:el.tagName.toLowerCase(),c:(el.className||'').toString().slice(0,30),
        w:Math.round(rc.width),h:Math.round(rc.height),bg:[R,G,B].join(','),
        tx:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,40)});
    });
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
