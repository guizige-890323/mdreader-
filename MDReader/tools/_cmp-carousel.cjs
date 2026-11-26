/* 欢迎屏 vs 展示页轮播：并排取实际效果，看差距到底在哪 */
const { chromium } = require('playwright-core');
const path = require('path');

const OUT = __dirname;

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--hide-scrollbars'],
  });

  // 1) 应用欢迎屏
  for (const [w, h, tag] of [[1440, 900, '1440'], [1280, 800, '1280']]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html');
    await p.waitForTimeout(3000);
    const info = await p.evaluate(() => {
      const g = document.getElementById('gridFeats');
      const st = g && g.querySelector('.wf-stage');
      const it = g && g.querySelector('.wf-item');
      const card = g && g.querySelector('.wf-item .w-card');
      const shot = g && g.querySelector('.wf-shot');
      const infoEl = g && g.querySelector('.wf-info');
      const bb = e => e ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(e.getBoundingClientRect()) : null;
      return {
        hasWfMode: g ? g.classList.contains('wf-mode') : null,
        stage: bb(st), item: bb(it), card: bb(card), shot: bb(shot), info: bb(infoEl),
        cardCount: g ? g.querySelectorAll('.w-card').length : 0,
        wfW: g ? getComputedStyle(g).getPropertyValue('--wf-w').trim() : null,
        vw: window.innerWidth, vh: window.innerHeight,
        welcome: bb(document.getElementById('welcome')),
      };
    });
    console.log(`\n[应用欢迎屏 ${tag}] vw=${info.vw} vh=${info.vh}`);
    console.log('  welcome:', JSON.stringify(info.welcome));
    console.log('  wf-mode:', info.hasWfMode, ' 卡片数:', info.cardCount, ' --wf-w:', info.wfW);
    console.log('  stage:', JSON.stringify(info.stage));
    console.log('  item :', JSON.stringify(info.item));
    console.log('  card :', JSON.stringify(info.card));
    console.log('  shot :', JSON.stringify(info.shot), ' info:', JSON.stringify(info.info));
    await p.screenshot({ path: path.join(OUT, `_cmp-app-${tag}.png`) });
    await p.close();
  }

  // 2) 展示页轮播
  for (const [w, h, tag] of [[1440, 900, '1440']]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('file:///D:/WorkBuddy/2026-11-08-21-28-36/docs/showcase/MDReader-%E5%8A%9F%E8%83%BD%E5%B1%95%E7%A4%BA.html');
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => {
      const bb = e => e ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(e.getBoundingClientRect()) : null;
      const st = document.querySelector('.stage');
      const card = document.querySelector('.card');
      const media = document.querySelector('.card-media');
      const ci = document.querySelector('.card-info');
      return {
        stage: bb(st), card: bb(card), media: bb(media), info: bb(ci),
        cw: getComputedStyle(document.documentElement).getPropertyValue('--cw').trim(),
        ch: getComputedStyle(document.documentElement).getPropertyValue('--ch').trim(),
        n: document.querySelectorAll('.card').length,
      };
    });
    console.log(`\n[展示页 ${tag}]`);
    console.log('  stage:', JSON.stringify(info.stage), ' 卡片数:', info.n);
    console.log('  card :', JSON.stringify(info.card), ' --cw:', info.cw, ' --ch:', info.ch);
    console.log('  media:', JSON.stringify(info.media), ' info:', JSON.stringify(info.info));
    await p.evaluate(() => document.getElementById('showcase').scrollIntoView());
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `_cmp-showcase-${tag}.png`) });
    await p.close();
  }

  await browser.close();
})();