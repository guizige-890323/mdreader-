/* 复刻 cr18 的前序操作序列，看「前进 6 步」那一刻到底有几个 scale(1)。
   cr18 判定 ok(cond, extra) 两个参数是两次独立 evaluate：
     cond  = (await snap())[11].sc === 1
     extra = (await snap()).findIndex(x => x.sc === 1)
   实测 cond 通过而 extra 报 0 → 怀疑同一时刻有两个元素 scale(1)，或状态在间隙里被改。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);

  const ones = () => p.evaluate(() => [...document.querySelectorAll('.wf-item')]
    .map((el, i) => {
      const m = el.style.transform.match(/scale\(([\d.]+)\)/);
      return { i, sc: m ? +m[1] : null, z: +el.style.zIndex };
    })
    .filter(x => x.sc === 1).map(x => x.i + ' z=' + x.z));

  console.log('B 初始 scale(1):', await ones());

  // C 组：右箭头 → 左箭头 → 点第 6 项 → 右箭头 → 左箭头
  await p.click('.wf-nav.r'); await p.waitForTimeout(700);
  await p.click('.wf-nav.l'); await p.waitForTimeout(700);
  await p.click('.wf-item:nth-child(6) .w-card').catch(() => p.evaluate(() => document.querySelectorAll('.wf-item')[5].querySelector('.w-card').click()));
  await p.waitForTimeout(800);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(700);
  console.log('C 结束 scale(1):', await ones());

  // D 组：连点 6 次右箭头
  await p.evaluate(() => { for (let i = 0; i < 6; i++) document.querySelector('.wf-nav.r').click(); });
  await p.waitForTimeout(1000);
  console.log('D 前进6步 第1次:', await ones());
  console.log('D 前进6步 第2次:', await ones());
  console.log('D 前进6步 第3次:', await ones());

  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });