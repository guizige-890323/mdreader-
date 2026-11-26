/* 观察 fitCard 迭代是否真的在收敛：手动跑 6 轮，打印每轮 (卡宽, infoH, 目标宽)。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const grid = document.getElementById('gridFeats');
      const st = grid.querySelector('.wf-stage');
      const item = document.querySelector('.wf-item');
      const card = document.querySelector('.wf-item .w-card');
      const info = card.querySelector('.wf-info');
      const cardPad = 20;
      const maxW = Math.min(st.clientWidth * 0.48, 600);
      const avail = st.clientHeight * 0.88 - cardPad - 4;
      const log = [];
      let wcur = item.getBoundingClientRect().width;
      for (let k = 0; k < 6; k++) {
        const padH = info.getBoundingClientRect().height;
        const byH = (avail - padH) * 17 / 10;
        const target = Math.max(240, Math.min(maxW, byH));
        log.push({ k, itemW: +wcur.toFixed(1), infoH: +padH.toFixed(1), target: +target.toFixed(1) });
        grid.style.setProperty('--wf-w', Math.round(target) + 'px');
        void info.getBoundingClientRect().height;
        wcur = item.getBoundingClientRect().width;
      }
      return { stageH: st.clientHeight, avail: +avail.toFixed(1), maxW: +maxW.toFixed(1), log };
    });
    console.log('\n' + w + 'x' + h, 'stageH=' + r.stageH, 'avail=' + r.avail, 'maxW=' + r.maxW);
    r.log.forEach(x => console.log('  k=' + x.k + ' itemW=' + x.itemW + ' infoH=' + x.infoH + ' -> target=' + x.target));
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });