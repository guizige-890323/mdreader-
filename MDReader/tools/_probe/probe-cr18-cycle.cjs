/* 探针：cr18 「前进 6 步停在第 12 项」那条断言附近，状态是否稳定。
   现象：断言判通过（s[11].sc===1），但紧随其后的额外取值 findIndex 返回 0。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);

  const snap = () => p.evaluate(() => [...document.querySelectorAll('.wf-item')].map(el => {
    const m = el.style.transform.match(/scale\(([\d.]+)\)/);
    return { sc: m ? +m[1] : null, z: +el.style.zIndex, vis: el.style.visibility };
  }));
  const idx = async () => (await snap()).findIndex(x => x.sc === 1);

  await p.evaluate(() => { for (let i = 0; i < 6; i++) document.querySelector('.wf-nav.r').click(); });
  await p.waitForTimeout(1000);
  console.log('after +6 clicks, idx =', await idx());
  for (let i = 0; i < 8; i++) {
    const a = await idx(); await p.waitForTimeout(120); const c = await idx();
    console.log(' t' + i, 'idx=' + a, '-> 120ms later idx=' + c);
  }
  // 连续两次快照间隔 <10ms
  const s1 = await idx(), s2 = await idx(), s3 = await idx();
  console.log('rapid x3:', s1, s2, s3);
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });