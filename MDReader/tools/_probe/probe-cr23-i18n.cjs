/* CR-23 英文界面专项：编辑态新增文案不得留中文/中英混杂 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const TMP = path.join(ROOT, '_shots', '_cr23docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const doc = path.join(TMP, 'longform.md');
const CJK = /[\u4e00-\u9fff]/;
const MIXED = /[A-Za-z]{2,}[\u4e00-\u9fff]|[\u4e00-\u9fff][A-Za-z]{2,}/;

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('OK   ' + n); } else { fail++; console.log('FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('dialog', async d => { await d.accept(); });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1400);
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1200);
  await p.setInputFiles('#filePicker', [doc]);
  await p.waitForTimeout(1800);

  /* 欢迎屏是 CR-22 的资产，这里只看编辑态新增的部分 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(800);

  const ui = await p.evaluate(() => {
    const grab = (sel) => { const e = document.querySelector(sel); return e ? { txt: (e.textContent || '').trim(), title: e.getAttribute('title') || '', aria: e.getAttribute('aria-label') || '', pressed: e.getAttribute('aria-pressed') } : null; };
    const secs = [...document.querySelectorAll('#sideSections .sec-item')].slice(0, 4).map(n => ({
      t: n.querySelector('.sec-title').textContent.trim(),
      group: n.dataset.g === '1'
    }));
    return {
      editSecLabel: grab('#editSecLabel'),
      btnBlockView: grab('#btnBlockView'),
      btnSecWhole: grab('#btnSecWhole'),
      btnSecPrev: grab('#btnSecPrev'),
      btnSecNext: grab('#btnSecNext'),
      editorAria: (document.getElementById('editor').getAttribute('aria-label') || ''),
      contentAria: (document.getElementById('content').getAttribute('aria-label') || ''),
      bvCap: (document.getElementById('content').getAttribute('data-bvcap') || ''),
      secs
    };
  });

  const isUserContent = (s) => /测试长文|第一节|第二节|第三节|第四节|第五节|第\d+节|导语/.test(s);
  const fields = [
    ['#editSecLabel 文案', ui.editSecLabel && ui.editSecLabel.txt],
    ['#btnBlockView 文案', ui.btnBlockView && ui.btnBlockView.txt],
    ['#btnBlockView title', ui.btnBlockView && ui.btnBlockView.title],
    ['#btnSecWhole 文案', ui.btnSecWhole && ui.btnSecWhole.txt],
    ['#btnSecPrev 文案', ui.btnSecPrev && ui.btnSecPrev.txt],
    ['#btnSecNext 文案', ui.btnSecNext && ui.btnSecNext.txt],
    ['#editor aria-label', ui.editorAria],
    ['#content aria-label', ui.contentAria],
    ['#content data-bvcap', ui.bvCap]
  ];
  const leak = fields.filter(([, v]) => v && CJK.test(v) && !isUserContent(v));
  ok('E1 编辑态 UI 文案零残留中文（用户文档标题除外）', leak.length === 0, leak);

  const mixed = fields.filter(([, v]) => v && MIXED.test(v) && !isUserContent(v));
  ok('E2 编辑态 UI 文案零中英混杂', mixed.length === 0, mixed);

  ok('E3 预览开关文案已英文化', /Preview/i.test(ui.btnBlockView.txt), ui.btnBlockView.txt);
  ok('E4 只读标注已英文化', /Preview|Read-only/i.test(ui.bvCap), ui.bvCap);
  ok('E5 节标签已英文化（Section / Block）', /Section|Block/i.test(ui.editSecLabel.txt), ui.editSecLabel.txt);
  /* 节标签里带的是用户文档的中文标题，这属正常（用户内容不翻译） */
  ok('E6 节标签保留用户标题原文（正文永不参与翻译）',
    /测试长文|第一节/.test(ui.editSecLabel.txt), ui.editSecLabel.txt);

  /* 切回中文必须完全还原 */
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'zh-CN'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1100);
  const zh = await p.evaluate(() => ({
    bv: document.getElementById('btnBlockView').textContent.trim(),
    lbl: document.getElementById('editSecLabel').textContent.trim(),
    cap: document.getElementById('content').getAttribute('data-bvcap') || ''
  }));
  ok('E7 切回中文完全还原（无半英半中）',
    /预览 开/.test(zh.bv) && /节 ·|块 #/.test(zh.lbl) && /预览 · 只读/.test(zh.cap), zh);

  /* 关预览 → 文案也要跟着切 */
  await p.evaluate(() => document.getElementById('btnBlockView').click());
  await p.waitForTimeout(300);
  ok('E8 关预览后中文文案为「预览 关」',
    /预览 关/.test(await p.evaluate(() => document.getElementById('btnBlockView').textContent.trim())),
    await p.evaluate(() => document.getElementById('btnBlockView').textContent.trim()));

  ok('E9 零 JS 错误', errs.length === 0, errs.slice(0, 3));
  console.log('\nPASS = ' + pass + '  FAIL = ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });