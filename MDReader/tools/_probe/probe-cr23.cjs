/* CR-23 诊断：为什么 I3 少一个 H2、F2 预览空、C6 偏差 275px */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const TMP = path.join(ROOT, '_shots', '_cr23docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('dialog', async d => { await d.accept(); });
  const doc = path.join(TMP, 'longform.md');
  const src = fs.readFileSync(doc, 'utf8');
  console.log('源文件 H1=', (src.match(/^# /gm) || []).length, 'H2=', (src.match(/^## /gm) || []).length);

  await p.goto(F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', [doc]);
  await p.waitForTimeout(1800);

  const r = await p.evaluate(() => {
    const c = document.getElementById('content');
    return {
      h1: c.querySelectorAll('h1').length,
      h2: c.querySelectorAll('h2').length,
      h2texts: [...c.querySelectorAll('h2')].map(h => h.textContent.trim()),
      h3: c.querySelectorAll('h3').length,
      tables: c.querySelectorAll('table').length,
      pre: c.querySelectorAll('pre').length
    };
  });
  console.log('渲染后 h1/h2/h3 =', r.h1, r.h2, r.h3, 'table=', r.tables, 'pre=', r.pre);
  console.log('h2 列表:', JSON.stringify(r.h2texts));

  /* 进编辑看块 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(900);
  const e = await p.evaluate(() => {
    const gs = [...document.querySelectorAll('#sideSections .sec-group')];
    return {
      n: gs.length,
      seq: gs.map(n => n.dataset.t),
      titles: gs.map(n => n.querySelector('.sec-title').textContent.trim()),
      editorVal: (document.getElementById('editor').value || '').slice(0, 120),
      lbl: document.getElementById('editSecLabel').textContent,
      contentLen: document.getElementById('content').innerHTML.length,
      contentTxt: (document.getElementById('content').textContent || '').slice(0, 120)
    };
  });
  console.log('节数=', e.n, 'types=', JSON.stringify(e.seq));
  console.log('标题:', JSON.stringify(e.titles));
  console.log('首次 editor.value=', JSON.stringify(e.editorVal));
  console.log('label=', e.lbl, 'previewLen=', e.contentLen, 'previewTxt=', JSON.stringify(e.contentTxt));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });