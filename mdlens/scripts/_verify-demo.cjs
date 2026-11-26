const { chromium } = require('playwright-core');
const path = require('path');
const OUT = 'C:/Users/likui/.mdlens/view/曲靖综维工单分布-fa6ccd224f061f5c.html';
const SHOT = path.join(__dirname, '..', '_shots');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///' + OUT);
  await p.waitForTimeout(2600);
  const info = await p.evaluate(() => {
    const c = document.querySelector('#content');
    const flows = [...document.querySelectorAll('.mf-wrap, [class*=mf-]')];
    const svgFlow = document.querySelector('.mf-wrap svg, svg[class*=mf]');
    const boxes = [...document.querySelectorAll('.chart-box')];
    const shown = boxes.filter(b => b.querySelector('svg'));
    return {
      docH: Math.round(c.scrollHeight),
      h2: document.querySelectorAll('h2').length,
      tables: document.querySelectorAll('table').length,
      callouts: document.querySelectorAll('.callout').length,
      tasks: document.querySelectorAll('input[type=checkbox]').length,
      chartBoxes: boxes.length, chartsShown: shown.length,
      flowSvg: !!svgFlow,
      flowNodes: svgFlow ? svgFlow.querySelectorAll('g.mf-node, [class*=mf-node]').length : 0,
      flowText: svgFlow ? (svgFlow.textContent||'').replace(/\s+/g,' ').slice(0,120) : '',
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      toolbarHidden: getComputedStyle(document.querySelector('.toolbar')).display,
      sidebarHidden: getComputedStyle(document.querySelector('.sidebar')).display,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log(JSON.stringify(info));
  console.log('JS errors:', errs.length, errs.slice(0,3));
  await p.screenshot({ path: path.join(SHOT, 'demo-01-top.png') });
  const chart = await p.$('.chart-box');
  if (chart) { await chart.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await chart.screenshot({ path: path.join(SHOT, 'demo-02-chart.png') }); }
  const flow = await p.$('.mf-wrap');
  if (flow) { await flow.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await flow.screenshot({ path: path.join(SHOT, 'demo-03-flow.png') }); }
  await b.close();
})();
