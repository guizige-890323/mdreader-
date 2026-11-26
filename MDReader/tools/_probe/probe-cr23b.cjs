/* CR-23 诊断 2：为什么退出编辑后 h2 从 16 变 15 */
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
  const orig = fs.readFileSync(doc, 'utf8');
  await p.goto(F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', [doc]);
  await p.waitForTimeout(1800);

  const cnt = async (tag) => {
    const r = await p.evaluate(() => ({
      h1: document.querySelectorAll('#content h1').length,
      h2: document.querySelectorAll('#content h2').length,
      h2t: [...document.querySelectorAll('#content h2')].map(h => h.textContent.trim()),
      ed: document.documentElement.dataset.editing
    }));
    console.log(tag, 'h1=' + r.h1, 'h2=' + r.h2, 'editing=' + r.ed);
    return r;
  };
  await cnt('初始阅读态');

  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(700);
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1500);
  await cnt('进退一次后');

  /* 走一遍 全篇 ↔ 块 切换 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(600);
  await p.evaluate(async () => {
    document.getElementById('btnSecWhole').click();
    await new Promise(s => setTimeout(s, 400));
    document.getElementById('btnSecWhole').click();
    await new Promise(s => setTimeout(s, 400));
  });
  const whole = await p.evaluate(async () => {
    document.getElementById('btnSecWhole').click();
    await new Promise(s => setTimeout(s, 400));
    const v = document.getElementById('editor').value;
    document.getElementById('btnSecWhole').click();
    await new Promise(s => setTimeout(s, 400));
    return v;
  });
  console.log('全篇往返后与原文一致 =', whole === orig, 'len', whole.length, orig.length);
  if (whole !== orig) {
    for (let i = 0; i < Math.min(whole.length, orig.length); i++) {
      if (whole[i] !== orig[i]) {
        console.log('首个差异 @', i);
        console.log('原文:', JSON.stringify(orig.slice(Math.max(0, i - 40), i + 40)));
        console.log('现文:', JSON.stringify(whole.slice(Math.max(0, i - 40), i + 40)));
        break;
      }
    }
  }
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1600);
  await cnt('全篇往返后退出');

  /* 用 E2 的方式改第五节 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(700);
  await p.evaluate(async () => {
    const g = [...document.querySelectorAll('#sideSections .sec-group')]
      .find(n => /第五节/.test(n.querySelector('.sec-title').textContent));
    g.click();
    await new Promise(s => setTimeout(s, 300));
    const ed = document.getElementById('editor');
    console.log('第五节 editor =', JSON.stringify(ed.value));
    ed.value = ed.value.replace('只有一段', '只有一段（已改）');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(s => setTimeout(s, 400));
  });
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1600);
  await cnt('改第五节后退出');

  /* F6 的方式：往当前节末尾追加粗体段 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(700);
  const before = await p.evaluate(() => ({
    lbl: document.getElementById('editSecLabel').textContent,
    val: document.getElementById('editor').value
  }));
  console.log('F6 前 label=', before.lbl, 'val末尾=', JSON.stringify(before.val.slice(-60)));
  await p.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = ed.value + '\n\n**新增的一段粗体内容，用来验证实时预览。**';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1600);
  await cnt('F6 追加后退出');

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });