/* 验证长文写作真正卡住的三件事（性能之外）：
   ① 进出编辑后光标/滚动位置是否保留（长文作者最痛：回去找不到刚写的那段）
   ② 块粒度：标题与它下面的正文是否被切成两块（写完标题要切块才能写正文）
   ③ 有无自动保存 / 草稿（长文写一半崩了会丢）
   ④ 块内是否能看到排版效果（纯 textarea = 只有源码） */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);

  const secs = [];
  for (let i = 1; i <= 40; i++) secs.push('## 第 ' + i + ' 节\n\n这是第 ' + i + ' 节的正文，需要足够长以至于占据多行，方便验证滚动位置。' + '补充文字。'.repeat(6) + '\n');
  const md = secs.join('\n');
  await p.evaluate((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'long.md', { type: 'text/markdown' }));
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, md);
  await p.waitForTimeout(1500);

  // 滚到中间
  await p.evaluate(() => { const r = document.querySelector('.reader'); r.scrollTop = r.scrollHeight * 0.45; });
  await p.waitForTimeout(300);
  const before = await p.evaluate(() => ({ st: document.querySelector('.reader').scrollTop, h: document.querySelector('.reader').scrollHeight }));
  await p.click('#btnEdit'); await p.waitForTimeout(600);
  const inEdit = await p.evaluate(() => ({ st: document.querySelector('.reader').scrollTop, label: document.getElementById('editSecLabel').textContent }));
  await p.click('#btnEdit'); await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({ st: document.querySelector('.reader').scrollTop }));
  console.log('② 光标/滚动：进入编辑前', before.st, '→ 编辑态', inEdit.st, '→ 退出后', after.st);
  console.log('   退出编辑是否回到原位置:', Math.abs(after.st - before.st) < 5 ? '是' : '否 ← 落差 ' + (after.st - before.st) + 'px');
  console.log('   进入编辑默认落在:', inEdit.label);

  // 块粒度
  await p.click('#btnEdit'); await p.waitForTimeout(600);
  const blk = await p.evaluate(() => [...document.querySelectorAll('#sideSections .sec-item')].map(n =>
    n.querySelector('.sec-lv').textContent + '|' + n.querySelector('.sec-title').textContent).slice(0, 6));
  console.log('① 块粒度（前 6 块）:', JSON.stringify(blk));

  // 自动保存痕迹
  const auto = await p.evaluate(() => {
    const keys = Object.keys(localStorage);
    return { lsKeys: keys.slice(0, 12), hasDraft: keys.some(k => /draft|autosave|backup|草稿/i.test(k)) };
  });
  console.log('③ localStorage 键:', JSON.stringify(auto.lsKeys));
  console.log('   有无草稿/自动保存键:', auto.hasDraft ? '有' : '无 ← 长文写一半崩溃即丢失');

  // 编辑态能否看到排版
  const look = await p.evaluate(() => {
    const e = document.getElementById('editor');
    const cs = getComputedStyle(e);
    const v = e.value;
    return { font: cs.fontFamily.slice(0, 40), size: cs.fontSize,
      rawMarks: { bold: v.includes('**'), heading: v.includes('##') },
      contentHidden: document.getElementById('content').classList.contains('hidden') };
  });
  console.log('④ 编辑态样式:', JSON.stringify(look));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
