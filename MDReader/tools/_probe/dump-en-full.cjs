const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const grab = () => p.evaluate(() => [...document.querySelectorAll('#gridFeats .w-card')].map(card => {
    const info = card.querySelector('.wf-info');
    const head = info.querySelector('.wc-head');
    return {
      title: (head.querySelector('b') || {}).textContent || '',
      tag: (head.querySelector('.w-tag') || {}).textContent || '',
      prio: (info.querySelector('.prio') || {}).textContent || '',
      en: (info.querySelector('.en') || {}).textContent || '',
      desc: (info.querySelector('span:not([class])') || {}).textContent || '',
      them: (info.querySelector('.them') || {}).textContent || '',
      us: (info.querySelector('.us') || {}).textContent || '',
      tags: [...(info.querySelector('.tags') ? info.querySelector('.tags').children : [])].map(e => e.textContent)
    };
  }));
  const zh = await grab();
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1200);
  const en = await grab();
  const attrs = await p.evaluate(() => ({
    dots: [...document.querySelectorAll('.wf-dot')].map(b => b.getAttribute('aria-label')),
    nav: [...document.querySelectorAll('.wf-nav')].map(b => b.getAttribute('aria-label')),
    slogan: (document.querySelector('.w-slogan') || {}).getAttribute ? document.querySelector('.w-slogan').getAttribute('aria-label') : null
  }));
  fs.writeFileSync(path.join(__dirname, 'feats-en.json'), JSON.stringify({ en, attrs }, null, 1));
  const mixed = [];
  const CHK = /[A-Za-z0-9][\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z0-9]/;
  en.forEach((c, i) => { Object.entries(c).forEach(([k, v]) => {
    const s = Array.isArray(v) ? v.join('|') : v;
    if (CHK.test(s)) mixed.push([i + 1, k, s.slice(0, 60)]);
  }); });
  console.log('mixed =', mixed.length); mixed.forEach(m => console.log('  ', m));
  console.log('zh[0]', JSON.stringify(zh[0], null, 1));
  console.log('en[0]', JSON.stringify(en[0], null, 1));
  console.log('attrs', JSON.stringify(attrs));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
