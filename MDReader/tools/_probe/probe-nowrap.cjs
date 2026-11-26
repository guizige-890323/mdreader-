/* 查清 .wf-info > span 为何不换行：打印计算样式 + 父链上的 white-space */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const card = document.querySelector('.wf-item .w-card');
    const info = card.querySelector('.wf-info');
    const span = info.querySelector('span');
    span.textContent = window.W_FEATS[0].desc;   // 81 字完整描述
    void info.offsetHeight;
    const cs = getComputedStyle(span);
    const chain = [];
    let el = span;
    while (el && el !== document.documentElement) {
      const c = getComputedStyle(el);
      chain.push({ tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
        ws: c.whiteSpace, ov: c.overflow, disp: c.display, w: Math.round(el.getBoundingClientRect().width) });
      el = el.parentElement;
    }
    return {
      spanRect: { w: Math.round(span.getBoundingClientRect().width), h: Math.round(span.getBoundingClientRect().height) },
      cs: { display: cs.display, ws: cs.whiteSpace, wb: cs.wordBreak, clamp: cs.webkitLineClamp, ov: cs.overflow,
            fs: cs.fontSize, lh: cs.lineHeight, maxW: cs.maxWidth, w: cs.width },
      chain,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });