/* 诊断：切到 English 后，欢迎屏里还有哪些可见中文没被翻。
   用途：给出待补 i18n 的精确清单，而不是凭感觉列。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../desktop/app/MDReader.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1800);

  // 走真实 UI 切语言：设置里的 #setLang
  const switched = await p.evaluate(() => {
    const sel = document.getElementById('setLang');
    if (!sel) return 'no #setLang';
    sel.value = 'en';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  });
  await p.waitForTimeout(900);
  const lang = await p.evaluate(() => document.documentElement.dataset.lang);
  console.log('switch:', switched, 'data-lang =', lang);

  const r = await p.evaluate(() => {
    const out = [];
    const w = document.getElementById('welcome');
    const walk = document.createTreeWalker(w, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walk.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (!t || !/[\u4e00-\u9fff]/.test(t)) continue;
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      out.push({ cls: el.className || el.tagName, txt: t.slice(0, 70) });
    }
    // 顺带看属性型文案
    const attrs = [];
    w.querySelectorAll('[title],[aria-label],[alt]').forEach(el => {
      ['title', 'aria-label', 'alt'].forEach(a => {
        const v = el.getAttribute(a);
        if (v && /[\u4e00-\u9fff]/.test(v)) attrs.push({ a, cls: el.className || el.tagName, v: v.slice(0, 50) });
      });
    });
    // 非卡片区域（HUD / tip / 兜底入口）
    return { texts: out, attrs, cardCount: document.querySelectorAll('#gridFeats .w-card').length };
  });
  console.log('cards =', r.cardCount, ' untranslated text nodes =', r.texts.length);
  r.texts.forEach(x => console.log('  [' + x.cls + '] ' + x.txt));
  if (r.attrs.length) { console.log(' untranslated attrs =', r.attrs.length); r.attrs.forEach(x => console.log('  ' + x.a + ' [' + x.cls + '] ' + x.v)); }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });