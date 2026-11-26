/* 最终交付截图：真实报告的首屏 + 图表区 + 流程图区 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const [,, target, outDir, theme] = process.argv;

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.resolve(target).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => {
    const rd = document.querySelector('.reader');
    const chartBox = [...document.querySelectorAll('.chart-box')].find(b => b.classList.contains('show'));
    const flowBox = document.querySelector('.md-flow-box, .mermaid-box');
    const abs = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top - rd.getBoundingClientRect().top + rd.scrollTop, h: r.height };
    };
    return {
      total: rd.scrollHeight,
      chart: abs(chartBox),
      flow: abs(flowBox),
      charts: document.querySelectorAll('.chart-box.show').length,
      nodes: document.querySelectorAll('.mf-node').length,
      tables: document.querySelectorAll('#content table').length,
      codes: document.querySelectorAll('#content pre > code').length,
    };
  });
  console.log('info:', JSON.stringify(info));

  const shots = [
    ['01-top', 0],
    ['02-chart', info.chart ? Math.max(0, info.chart.top - 70) : Math.round(info.total * 0.18)],
    ['03-flow', info.flow ? Math.max(0, info.flow.top - 70) : Math.round(info.total * 0.55)],
  ];

  for (const [name, y] of shots) {
    await page.evaluate(v => document.querySelector('.reader').scrollTo(0, v), y);
    await page.waitForTimeout(500);
    const f = path.join(outDir, `${theme}-${name}.png`);
    await page.screenshot({ path: f });
    console.log('shot:', f);
  }
  console.log('JS errors:', errs.length);
  await browser.close();
})();