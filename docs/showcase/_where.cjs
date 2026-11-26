const { chromium } = require('playwright-core');
const path=require('path');
const pages = {
  show: 'file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-功能展示.html',
  app:  'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html',
};
(async () => {
  const b = await chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  for (const [tag,url] of Object.entries(pages)) {
    const p = await b.newPage({ viewport:{width:1035,height:900} });
    await p.goto(url); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const out=[];
      const parse=s=>(s.match(/[\d.]+/g)||[]).map(Number);
      document.querySelectorAll('*').forEach(el=>{
        const cs=getComputedStyle(el);
        const bg=parse(cs.backgroundColor);
        if(!bg || bg.length<3) return;
        const [R,G,B]=bg;
        // blue-ish, saturated: B much greater than R, and B fairly high
        if(!(B>150 && B-R>70 && G<180)) return;
        const rect=el.getBoundingClientRect();
        if(rect.width<80 || rect.height<14) return;
        out.push({ tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,40),
          w:Math.round(rect.width), h:Math.round(rect.height), bg:bg.slice(0,3).join(','),
          text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) });
      });
      return out.slice(0,25);
    });
    console.log('=====',tag, JSON.stringify(r,null,1));
    await p.close();
  }
  await b.close();
})();
