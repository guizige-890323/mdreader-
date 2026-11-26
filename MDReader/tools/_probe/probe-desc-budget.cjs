/* 决策探针：把 W_FEATS 的完整 desc 铺进卡里，量不同卡宽下的文案区高度。
   目的：判断「完整描述 + vs + tags」在 1440x900 一屏里放不放得下，
   以及 fitCard 的「卡宽 ←→ infoH」耦合会不会收敛。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);

  const r = await p.evaluate(() => {
    const grid = document.getElementById('gridFeats');
    const card = document.querySelector('.wf-item .w-card');
    const info = card.querySelector('.wf-info');
    const span = info.querySelector('span');
    const F2 = window.W_FEATS;
    const st = document.querySelector('.wf-stage');
    const out = { stageH: st.clientHeight, avail: Math.round(st.clientHeight * 0.86), rows: [] };
    const firstSentence = t => { const m = t.match(/^[^。；]*[。；]?/); return m ? m[0] : t; };

    // 试三种文案 + 三种 clamp，量 info 高度（宽度固定按当前 --wf-w）
    for (const mode of ['full-clamp2', 'full-clamp3', 'full-natural', 'sent-clamp2']) {
      for (const w of [517, 470, 430, 390]) {
        grid.style.setProperty('--wf-w', w + 'px');
        // 恢复原始短文案
        span.textContent = F2[0].desc;
        if (mode.startsWith('full')) span.textContent = F2[0].desc;
        if (mode.startsWith('sent')) span.textContent = firstSentence(F2[0].desc);
        span.style.webkitLineClamp = mode === 'full-clamp3' ? '3' : (mode === 'full-natural' ? 'none' : '2');
        span.style.display = mode === 'full-natural' ? 'block' : '-webkit-box';
        // 强制回流
        void info.offsetHeight;
        out.rows.push({ mode, w, infoH: info.offsetHeight,
          descH: span.offsetHeight, clients: [span.clientHeight, span.scrollHeight],
          cardH: card.offsetHeight, descLen: span.textContent.length });
      }
    }
    return out;
  });
  console.log('stageH avail:', r.stageH, r.avail);
  for (const x of r.rows) console.log(JSON.stringify(x));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });