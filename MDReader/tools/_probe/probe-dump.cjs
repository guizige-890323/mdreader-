const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const snap = (lang) => p.evaluate((lg) => {
    const c = document.querySelectorAll('#gridFeats .w-card');
    return [...c].slice(0, 2).map(card => {
      const info = card.querySelector('.wf-info');
      const kids = [...info.children].map(k => k.className + ' :: ' + (k.textContent || '').trim().slice(0, 90));
      const kids2 = [...info.querySelectorAll('*')].filter(e => !e.children.length).map(e => e.className + ' :: ' + e.textContent.trim().slice(0, 60));
      return { infoH: info.offsetHeight, w: card.offsetWidth, kids, kids2 };
    });
  }, lang);
  console.log('=== ZH ==='); console.log(JSON.stringify(await snap('zh-CN'), null, 1));
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1000);
  console.log('=== EN ==='); console.log(JSON.stringify(await snap('en'), null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
