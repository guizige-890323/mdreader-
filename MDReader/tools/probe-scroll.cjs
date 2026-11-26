const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
  await p.waitForTimeout(1300);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2400);
  const sc = await p.evaluate(() => {
    const r = document.getElementById('reader');
    const out = [];
    let n = document.querySelector('.mf-wrap');
    while (n && n !== document.body) { out.push({ cls: n.className || n.id, sh: n.scrollHeight, ch: n.clientHeight, oy: getComputedStyle(n).overflowY }); n = n.parentElement; }
    return { reader: { sh: r.scrollHeight, ch: r.clientHeight, top: r.scrollTop }, chain: out.slice(0, 8), mfWrap: !!document.querySelector('.mf-wrap'), mfSvg: !!document.querySelector('.mf-svg') };
  });
  console.log(JSON.stringify(sc, null, 1));
  await b.close();
})();
