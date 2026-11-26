const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist-intl/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const w = document.getElementById('welcome');
    const chk = /[\u4e00-\u9fff]/;
    const bad=[];
    const walk = document.createTreeWalker(w, NodeFilter.SHOW_TEXT, null, false);
    let n; while((n=walk.nextNode())){ const t=(n.nodeValue||'').trim();
      if(!t||!chk.test(t))continue; const el=n.parentElement;
      if(!el||/^(SCRIPT|STYLE)$/.test(el.tagName))continue;
      const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')continue;
      bad.push((el.className||el.tagName)+' :: '+t.slice(0,50)); }
    const attrs=[]; w.querySelectorAll('[title],[aria-label],[alt],[placeholder]').forEach(el=>{
      ['title','aria-label','alt','placeholder'].forEach(a=>{ const v=el.getAttribute(a);
        if(v&&chk.test(v)) attrs.push(a+' '+(el.className||el.tagName)+' '+v.slice(0,40)); }); });
    const cards=[...document.querySelectorAll('#gridFeats .w-card')];
    const c = cards[0];
    return { lang: document.documentElement.dataset.lang,
      welcome:[w.scrollHeight,w.clientHeight], y:scrollY,
      cards: cards.length, bad, attrs,
      card:[c.offsetWidth,c.offsetHeight], stage:[document.querySelector('.wf-stage').clientWidth, document.querySelector('.wf-stage').clientHeight],
      infos:[...new Set([...document.querySelectorAll('#gridFeats .w-card .wf-info')].map(e=>e.offsetHeight))],
      title:(c.querySelector('.wc-head b')||{}).textContent,
      desc:(c.querySelector('.wf-info > span:not([class])')||{}).textContent.slice(0,60),
      dots:[...document.querySelectorAll('.wf-dot')].slice(0,2).map(b=>b.getAttribute('aria-label')),
      nav:[...document.querySelectorAll('.wf-nav')].map(b=>b.getAttribute('aria-label')) };
  });
  console.log(JSON.stringify(r,null,1));
  console.log('JS errors =', errs.length, errs.slice(0,2));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
