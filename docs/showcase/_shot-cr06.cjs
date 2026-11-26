const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--hide-scrollbars'] });
  const url='file:///'+path.resolve(__dirname,'MDReader-功能展示.html').replace(/\\/g,'/');
  // 1440x900 首屏
  let p = await b.newPage({ viewport:{width:1440,height:900} });
  await p.goto(url); await p.waitForTimeout(2200);
  await p.screenshot({ path: path.resolve(__dirname,'_cr06-01-firstscreen.png') });
  // 整页
  await p.screenshot({ path: path.resolve(__dirname,'_cr06-02-full.png'), fullPage:true });
  // 轮播段
  await p.evaluate(()=>{const s=document.getElementById('stage'); scrollTo(0, s.getBoundingClientRect().top+scrollY-40);});
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.resolve(__dirname,'_cr06-03-stage.png') });
  // 三条主线
  await p.evaluate(()=>{const s=document.getElementById('tracks'); scrollTo(0, s.getBoundingClientRect().top+scrollY-30);});
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(__dirname,'_cr06-04-tracks.png') });
  await p.close();
  // 1274x701（用户截图尺寸）
  p = await b.newPage({ viewport:{width:1274,height:701} });
  await p.goto(url); await p.waitForTimeout(2200);
  await p.screenshot({ path: path.resolve(__dirname,'_cr06-05-1274.png') });
  await b.close();
  console.log('ok');
})();
