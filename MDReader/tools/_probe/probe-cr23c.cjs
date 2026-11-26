/* CR-23 诊断 3：位置恢复为何偏 275px */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const TMP = path.join(ROOT, '_shots', '_cr23docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const doc = path.join(TMP, 'longform.md');

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('dialog', async d => { await d.accept(); });
  await p.goto(F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', [doc]);
  await p.waitForTimeout(1800);

  const snap = (tag) => p.evaluate((tag) => {
    const r = document.querySelector('.reader');
    const box = r.getBoundingClientRect();
    const hs = [...document.querySelectorAll('#content h1,#content h2')];
    const vis = hs.filter(h => h.getBoundingClientRect().bottom > box.top + 4);
    const first = vis[0];
    return {
      tag,
      scrollTop: Math.round(r.scrollTop),
      max: r.scrollHeight - r.clientHeight,
      title: first ? first.textContent.trim() : '',
      offset: first ? +(first.getBoundingClientRect().top - box.top).toFixed(1) : null,
      ratio: +((r.scrollTop / Math.max(1, r.scrollHeight - r.clientHeight)) * 100).toFixed(2)
    };
  }, tag);

  const set45 = () => p.evaluate(async () => {
    const r = document.querySelector('.reader');
    const max = r.scrollHeight - r.clientHeight;
    r.scrollTop = Math.round(max * 0.45);
    await new Promise(s => setTimeout(s, 260));
  });

  await set45();
  const a = await snap('45% 处');
  console.log(JSON.stringify(a));

  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(600);
  const e = await snap('编辑态');
  console.log(JSON.stringify(e));

  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1600);
  const c = await snap('退出后');
  console.log(JSON.stringify(c));

  /* 关键：看 render 之后 content 高度是否与编辑前一致（图片/字体/表格重排会让高度变） */
  await set45();
  const h1 = await p.evaluate(() => ({
    contentH: document.getElementById('content').offsetHeight,
    readerMax: document.querySelector('.reader').scrollHeight - document.querySelector('.reader').clientHeight
  }));
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1600);
  const h2 = await p.evaluate(() => ({
    contentH: document.getElementById('content').offsetHeight,
    readerMax: document.querySelector('.reader').scrollHeight - document.querySelector('.reader').clientHeight
  }));
  console.log('高度 before=', JSON.stringify(h1), 'after=', JSON.stringify(h2));

  /* 再看 render 是不是异步晚到（.then 里回位时 DOM 还没排完） */
  await set45();
  const t = await p.evaluate(async () => {
    const r = document.querySelector('.reader');
    const t0 = Math.round(r.scrollTop);
    document.getElementById('btnEdit').click();
    await new Promise(s => setTimeout(s, 600));
    document.getElementById('btnEdit').click();
    const samples = [];
    for (let i = 0; i < 14; i++) {
      await new Promise(s => setTimeout(s, 120));
      const box = r.getBoundingClientRect();
      const hs = [...document.querySelectorAll('#content h1,#content h2')];
      const f = hs.filter(h => h.getBoundingClientRect().bottom > box.top + 4)[0];
      samples.push([i * 120, Math.round(r.scrollTop), f ? f.textContent.trim().slice(0, 8) : '', f ? Math.round(f.getBoundingClientRect().top - box.top) : null]);
    }
    return { t0, samples };
  });
  console.log('t0=' + t.t0);
  t.samples.forEach(s => console.log('  +' + s[0] + 'ms scrollTop=' + s[1] + ' 顶=' + s[2] + ' off=' + s[3]));

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });