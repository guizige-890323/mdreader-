/* CR-2026-11-20-01 视觉验收：三主题 × 四个关键视口的截图 + 溢出检查。
   溢出判据（卡片内 overflow:hidden，超了就被切，看不见但会静默丢信息）：
   · .wf-info.scrollHeight > clientHeight  → 文案被切
   · .w-card.scrollHeight  > clientHeight  → 整卡超框
   · .tags 子项总宽 > 容器宽              → 标签被切 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '../../tools/_probe');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const vps = [[1440, 900], [1280, 800], [1366, 768], [1156, 560], [1920, 1080]];
  for (const [w, h] of vps) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(F); await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      const c = document.querySelector('.wf-item[style*="z-index: 100"] .w-card');
      const info = c.querySelector('.wf-info');
      const tags = c.querySelector('.tags');
      const st = document.querySelector('.wf-stage');
      const cb = c.getBoundingClientRect(), sb = st.getBoundingClientRect();
      return {
        card: [Math.round(cb.width), Math.round(cb.height)],
        info: [info.clientHeight, info.scrollHeight],
        cardS: [c.clientHeight, c.scrollHeight],
        tagsFit: tags ? [tags.clientWidth, tags.scrollWidth] : null,
        gapTop: Math.round(cb.top - sb.top), gapBottom: Math.round(sb.bottom - cb.bottom),
        one: document.querySelector('.reader').scrollHeight === document.querySelector('.reader').clientHeight,
      };
    });
    const overflow = r.info[1] > r.info[0] + 1 || r.cardS[1] > r.cardS[0] + 1 || (r.tagsFit && r.tagsFit[1] > r.tagsFit[0] + 1);
    console.log(w + 'x' + h, 'card=' + r.card, 'info=' + r.info, 'tags=' + r.tagsFit,
      'gap=' + r.gapTop + '/' + r.gapBottom, 'one=' + r.one, overflow ? '*** OVERFLOW ***' : 'ok');
    if (w === 1440) {
      for (const t of ['light', 'sepia', 'dark']) {
        await p.evaluate(x => document.documentElement.setAttribute('data-theme', x), t);
        await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(OUT, 'cr22-' + t + '.png') });
      }
    }
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });