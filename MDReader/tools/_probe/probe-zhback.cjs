const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1600);
  const grab = () => p.evaluate(() => [...document.querySelectorAll('#gridFeats .w-card')].map(card => {
    const info = card.querySelector('.wf-info'), head = info.querySelector('.wc-head');
    return { title: head.querySelector('b').textContent, tag: (head.querySelector('.w-tag')||{}).textContent,
      prio: info.querySelector('.prio').textContent, en: info.querySelector('.en').textContent,
      desc: info.querySelector('span:not([class])').textContent,
      them: info.querySelector('.them').textContent, us: info.querySelector('.us').textContent,
      tags: [...info.querySelector('.tags').children].map(e => e.textContent) };
  }));
  const set = (v) => p.evaluate((v) => { const s = document.getElementById('setLang'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  const a = await grab();
  await set('en'); await p.waitForTimeout(900);
  await set('zh-CN'); await p.waitForTimeout(900);
  const c = await grab();
  const diff = [];
  a.forEach((x, i) => Object.keys(x).forEach(k => {
    const l = JSON.stringify(x[k]), r = JSON.stringify(c[i][k]);
    if (l !== r) diff.push([i + 1, k, l.slice(0, 50), r.slice(0, 50)]);
  }));
  const attrs = await p.evaluate(() => ({ dots: [...document.querySelectorAll('.wf-dot')].map(b => b.getAttribute('aria-label')),
    nav: [...document.querySelectorAll('.wf-nav')].map(b => b.getAttribute('aria-label')) }));
  const geo = await p.evaluate(() => { const w = document.getElementById('welcome');
    return { welcome: [w.scrollHeight, w.clientHeight], wfW: getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-w'),
      infoH: document.querySelector('.wf-info').offsetHeight }; });
  console.log('zh->en->zh diff =', diff.length); diff.forEach(d => console.log('  ', d));
  console.log('attrs', JSON.stringify(attrs)); console.log('geo', JSON.stringify(geo));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
