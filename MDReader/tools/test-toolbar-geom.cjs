/* 不用肉眼看图，用几何断言检查顶栏布局质量：
   重叠、越界、控件间距、按钮尺寸是否仍然可点。*/
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file:///' + path.resolve(__dirname, '../dist/MDReader.html').replace(/\\/g, '/'));
  await p.waitForTimeout(1200);

  const out = [];
  const ok = (n, c, x) => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));

  for (const w of [760, 1080, 1280, 1440, 1600, 1920]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(220);
    const r = await p.evaluate(() => {
      const t = document.querySelector('.toolbar');
      const tr = t.getBoundingClientRect();
      const kids = Array.from(t.children)
        .filter(x => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0)
        .map(x => {
          const q = x.getBoundingClientRect();
          return { id: x.id || x.className, l: q.left, r: q.right, w: q.width, h: q.height };
        })
        .filter(x => x.id !== 'themeSel');
      /* 重叠检测（留 0.6px 容差，避免亚像素误报） */
      const overlap = [];
      for (let i = 1; i < kids.length; i++) {
        if (kids[i].l < kids[i - 1].r - 0.6) {
          overlap.push(kids[i - 1].id + '|' + kids[i].id);
        }
      }
      /* 越界检测 */
      const outside = kids.filter(x => x.r > tr.right + 1 || x.l < tr.left - 1).map(x => x.id);
      /* 可点性：可见按钮高度不应被压扁 */
      const tiny = kids.filter(x => x.id && x.id.startsWith('btn') && (x.h < 24 || x.w < 20)).map(x => x.id);
      return { tb: t.getAttribute('data-tb'), overlap, outside, tiny,
        rightmost: kids.length ? kids[kids.length - 1].id : null,
        gapMin: (() => { let m = 999; for (let i = 1; i < kids.length; i++) m = Math.min(m, kids[i].l - kids[i - 1].r); return Math.round(m); })() };
    });
    ok(`${w}px 无控件重叠`, r.overlap.length === 0, r.overlap.join(','));
    ok(`${w}px 无控件越界`, r.outside.length === 0, r.outside.join(','));
    ok(`${w}px 按钮尺寸未被压扁`, r.tiny.length === 0, r.tiny.join(','));
    ok(`${w}px 最右仍是「更多/设置」入口`, /tbMoreWrap|btnSettings/.test(r.rightmost || ''), r.rightmost + ' tb=' + r.tb);
  }
  const fails = out.filter(l => l.startsWith('FAIL'));
  console.log(fails.join('\n') || '(无失败项)');
  console.log('\n' + (out.length - fails.length) + '/' + out.length + ' passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();