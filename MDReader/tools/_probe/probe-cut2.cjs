const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(F); await p.waitForTimeout(1500);
  await p.evaluate(() => { const s=document.getElementById('setLang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await p.waitForTimeout(1400);
  const r = await p.evaluate(() => {
    const card = document.querySelector('#gridFeats .w-card');
    const info = card.querySelector('.wf-info');
    const d = info.querySelector('span:not([class])');
    const g = (e) => { const cs = getComputedStyle(e); return { h: e.offsetHeight, ch: e.clientHeight, sh: e.scrollHeight,
      clamp: cs.webkitLineClamp, lh: cs.lineHeight, fs: cs.fontSize, flex: cs.flex, minH: cs.minHeight, ov: cs.overflow }; };
    return { card: g(card), info: g(info), desc: g(d), varH: getComputedStyle(document.getElementById('gridFeats')).getPropertyValue('--wf-info-h'),
      infoMin: getComputedStyle(info).minHeight, stage: document.querySelector('.wf-stage').clientHeight };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
