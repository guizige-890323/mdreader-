const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto('file:///'+path.resolve(__dirname,'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(1800);
  const r = await p.evaluate(()=>{
    return [...document.querySelectorAll('.track')].map(e=>{
      const b=e.getBoundingClientRect();
      return {x:Math.round(b.x), w:Math.round(b.width), h:Math.round(b.height),
              text:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,60)};
    });
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
