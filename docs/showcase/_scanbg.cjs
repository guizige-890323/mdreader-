const { chromium } = require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--hide-scrollbars']});
  const p=await b.newPage({viewport:{width:1035,height:900}});
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html');
  await p.waitForTimeout(2500);
  const r=await p.evaluate(()=>{
    const parse=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const out=[];
    document.querySelectorAll('*').forEach(el=>{
      const cs=getComputedStyle(el);
      const bg=parse(cs.backgroundColor);
      if(!bg||bg.length<3) return;
      const [R,G,B]=bg;
      const isDark = R<60&&G<70&&B<80;
      const isBlue = B>140&&B-R>50&&G<190;
      if(!isDark&&!isBlue) return;
      const rc=el.getBoundingClientRect();
      if(rc.width<60||rc.height<16) return;
      out.push({t:el.tagName.toLowerCase(),c:(el.className||'').toString().slice(0,26),
        w:Math.round(rc.width),h:Math.round(rc.height),ar:+(rc.width/rc.height).toFixed(1),
        bg:[R,G,B].join(','),tx:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,28)});
    });
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
