const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto('file:///'+path.resolve(__dirname,'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(1500);
  // 实测自动翻页节奏：记录 cur 变化时间
  const t0=Date.now(); const marks=[];
  await p.evaluate(()=>{ window.__marks=[]; const o=render; window.render=function(){ window.__marks.push([Date.now(),cur]); return o.apply(this,arguments); }; });
  await p.waitForTimeout(9000);
  const m = await p.evaluate(()=>window.__marks);
  const steps=[]; for(let i=1;i<m.length;i++){ if(m[i][1]!==m[i-1][1]) steps.push(m[i][0]-m[i-1][0]); }
  console.log('自动翻页间隔实测(ms):', steps);
  console.log('页面高度:', await p.evaluate(()=>document.documentElement.scrollHeight));
  console.log('首屏舞台顶:', await p.evaluate(()=>Math.round(document.getElementById('stage').getBoundingClientRect().top)));
  await b.close();
})();
