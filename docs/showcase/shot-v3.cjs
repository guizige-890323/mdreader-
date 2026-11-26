/* 出图：hero 区特写（caption 可读性）+ 全页 */
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--hide-scrollbars'],
  });
  const file = path.resolve(__dirname, 'MDReader-功能展示.html');
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await p.goto('file:///' + file.replace(/\\/g, '/'));
  await p.waitForTimeout(3000);

  // 1) hero 图 + caption 同框特写（裁到图片上半 + caption 下方留白）
  const clip = await p.evaluate(() => {
    const img = document.querySelector('.hero-demo img');
    const cap = document.querySelector('.hero-demo figcaption');
    const ib = img.getBoundingClientRect(), cb = cap.getBoundingClientRect();
    return { x: Math.round(ib.x), y: Math.round(ib.y + ib.height * 0.55),
      width: Math.round(ib.width), height: Math.round(cb.bottom - (ib.y + ib.height * 0.55) + 24) };
  });
  await p.evaluate(() => { const ib = document.querySelector('.hero-demo img').getBoundingClientRect(); window.scrollBy(0, ib.y - 60); });
  await p.waitForTimeout(500);
  const clip2 = await p.evaluate(() => {
    const img = document.querySelector('.hero-demo img');
    const cap = document.querySelector('.hero-demo figcaption');
    const ib = img.getBoundingClientRect(), cb = cap.getBoundingClientRect();
    const y = Math.max(0, ib.y + ib.height * 0.5);
    return { x: Math.max(0, Math.round(ib.x) - 10), y: Math.round(y),
      width: Math.round(ib.width) + 20, height: Math.round(Math.min(cb.bottom + 20, window.innerHeight) - y) };
  });
  await p.screenshot({ path: path.resolve(__dirname, '_v3-hero-caption.png'), clip: clip2 });

  // 2) 首屏
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.resolve(__dirname, '_v3-hero-top.png') });

  // 3) 轮播区
  await p.evaluate(() => document.getElementById('showcase').scrollIntoView());
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.resolve(__dirname, '_v3-stage.png') });

  // 4) 轮播之后直接是对比表（确认中间无空洞）
  await p.evaluate(() => document.getElementById('compare').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.resolve(__dirname, '_v3-compare.png') });

  // 5) 全页
  await p.screenshot({ path: path.resolve(__dirname, '_v3-full.png'), fullPage: true });

  // 6) 窄屏 hero
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(900);
  const clip3 = await p.evaluate(() => {
    const f = document.querySelector('.hero-demo');
    const r = f.getBoundingClientRect();
    window.scrollBy(0, r.y - 40);
    return null;
  });
  await p.waitForTimeout(500);
  const clip4 = await p.evaluate(() => {
    const img = document.querySelector('.hero-demo img');
    const cap = document.querySelector('.hero-demo figcaption');
    const ib = img.getBoundingClientRect(), cb = cap.getBoundingClientRect();
    const y = Math.max(0, ib.y);
    return { x: 0, y: Math.round(y), width: window.innerWidth, height: Math.round(Math.min(cb.bottom + 16, window.innerHeight) - y) };
  });
  await p.screenshot({ path: path.resolve(__dirname, '_v3-mobile-caption.png'), clip: clip4 });
  await browser.close();
  console.log('done');
})();