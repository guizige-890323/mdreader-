const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('wDemo').click());
  await p.waitForTimeout(2400);
  const before = await p.evaluate(() => ({
    docStyle: document.documentElement.getAttribute('doc-style'),
    tblTheme: document.documentElement.getAttribute('table-theme'),
    layout: document.getElementById('layoutSel').value,
    nTables: document.querySelectorAll('.tw').length,
    ttBtns: [...document.querySelectorAll('.tt-btn')].length,
    ttOn: [...document.querySelectorAll('.tt-btn')].filter(b=>b.classList.contains('on')).map(b=>b.dataset.tt),
    heads: [...document.querySelectorAll('.tw table thead th')].slice(0,3).map(t=>getComputedStyle(t).backgroundColor),
  }));
  console.log('BEFORE', JSON.stringify(before));
  await p.evaluate(() => { const tb = document.querySelector('.tw-bar .tt-btn[data-tt="tech"]'); if (tb) tb.click(); });
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({
    docStyle: document.documentElement.getAttribute('doc-style'),
    tblTheme: document.documentElement.getAttribute('table-theme'),
    ttOn: [...document.querySelectorAll('.tt-btn')].filter(b=>b.classList.contains('on')).map(b=>b.dataset.tt),
    heads: [...document.querySelectorAll('.tw table thead th')].slice(0,3).map(t=>getComputedStyle(t).backgroundColor),
    chartSvgTypes: [...document.querySelectorAll('.chart-box.show .chart-types button.on')].map(b=>b.dataset.ct),
    chartMarks: document.querySelectorAll('.chart-box.show svg rect').length,
  }));
  console.log('AFTER ', JSON.stringify(after));
  await b.close();
})();
