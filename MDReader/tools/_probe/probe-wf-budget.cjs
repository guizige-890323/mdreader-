/* 探针：量欢迎屏「一屏」里各元素吃掉多少高度，算出卡片文案区还有多少预算。
   目的：判断能否把展示页那套（prio/en/desc/vs/tags）完整搬进 .wf-info。 */
const { chromium } = require('playwright-core');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
    const p = await browser.newPage({ viewport: vp });
    await p.goto(FILE, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const q = s => document.querySelector(s);
      const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
      const wel = q('#welcome');
      const stage = q('.wf-stage');
      const item = q('.wf-item');
      const card = q('.wf-item .w-card');
      const shot = q('.wf-item .wf-shot');
      const info = q('.wf-item .wf-info');
      const cur = document.querySelector('.wf-item[style*="z-index: 100"] .w-card') || card;
      const curShot = cur && cur.querySelector('.wf-shot');
      const curInfo = cur && cur.querySelector('.wf-info');
      // 文案区各子元素高度
      const kids = curInfo ? Array.prototype.map.call(curInfo.children, c => ({ cls: c.className, h: Math.round(c.getBoundingClientRect().height), txt: (c.textContent || '').slice(0, 24) })) : [];
      return {
        vp: { w: innerWidth, h: innerHeight },
        welcome: box(wel),
        scrollH: document.documentElement.scrollHeight,
        stage: box(stage),
        item: box(item),
        card: box(cur),
        shot: box(curShot),
        info: box(curInfo),
        infoKids: kids,
        hud: box(q('.wf-hud')),
        tip: box(q('.w-tip')),
        slogan: box(q('.w-slogan')),
        wfW: getComputedStyle(q('#welcome')).getPropertyValue('--wf-w'),
        descLines: (function () {
          const s = curInfo && curInfo.querySelector('span');
          if (!s) return null;
          const cs = getComputedStyle(s);
          return { fs: cs.fontSize, lh: cs.lineHeight, h: Math.round(s.getBoundingClientRect().height), clamp: cs.webkitLineClamp };
        })(),
      };
    });
    console.log('\n===== ' + vp.width + 'x' + vp.height + ' =====');
    console.log(JSON.stringify(r, null, 1));
    await p.close();
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });