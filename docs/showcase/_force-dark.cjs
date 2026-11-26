const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args:['--hide-scrollbars','--force-dark-mode','--enable-features=WebContentsForceDark'] });
  const p = await b.newPage({ viewport:{width:1274,height:701} });
  await p.goto('file:///' + path.resolve(__dirname,'MDReader-功能展示.html').replace(/\\/g,'/'));
  await p.waitForTimeout(2600);
  await p.evaluate(()=>{const s=document.getElementById('stage'); scrollTo(0, s.getBoundingClientRect().top+scrollY-60);});
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.resolve(__dirname,'_r7-forcedark-stage.png') });
  await b.close();
})();
