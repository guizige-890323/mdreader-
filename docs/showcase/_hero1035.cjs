const { chromium } = require('playwright-core');
const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--hide-scrollbars']});
  const p=await b.newPage({viewport:{width:1035,height:900}});
  await p.goto('file:///'+path.resolve(__dirname,'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2200);
  await p.screenshot({path:path.resolve(__dirname,'_hero-1035.png')});
  const r=await p.evaluate(()=>{
    const q=s=>{const e=document.querySelector(s); if(!e)return null; const b=e.getBoundingClientRect();
      return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
    return {slogan:q('.slogan'), eyebrow:q('.eyebrow'), sub:q('.hero .sub'),
            badges:q('.badges'), cta:q('.cta'), h1:q('h1'),
            badgeL:(()=>{const e=document.querySelector('.badge .l'); const b=e.getBoundingClientRect();
              return {w:Math.round(b.width),h:Math.round(b.height),bg:getComputedStyle(e).backgroundColor};})()};
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
