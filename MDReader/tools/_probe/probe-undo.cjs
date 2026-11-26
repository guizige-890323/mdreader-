/* 验证按块编辑下「撤销栈」的实际行为 —— 长文写作的致命点：
   切块是整体替换 textarea.value，浏览器的原生 undo 栈会把「上一块的内容」当成可撤销动作，
   用户按 Ctrl+Z 期望撤销自己刚写的字，实际却看到另一个块的内容被塞进来。 */
const { chromium } = require('playwright-core');
const path = require('path');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(F); await p.waitForTimeout(1500);
  const md = '## 第一节\n\n第一节的正文内容。\n\n## 第二节\n\n第二节的正文内容，和第一节完全不同。\n\n## 第三节\n\n第三节的正文内容。\n';
  await p.evaluate((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'undo.md', { type: 'text/markdown' }));
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, md);
  await p.waitForTimeout(1200);
  await p.click('#btnEdit');
  await p.waitForTimeout(400);

  const ed = () => p.evaluate(() => document.getElementById('editor').value);
  const label = () => p.evaluate(() => document.getElementById('editSecLabel').textContent);
  const items = await p.evaluate(() => [...document.querySelectorAll('#sideSections .sec-item')].map(n => n.querySelector('.sec-title').textContent));
  console.log('块列表:', JSON.stringify(items));

  // 在第 1 块里输入
  await p.click('#editor');
  await p.keyboard.type('我在这里写了一句话。');
  const afterType = await ed();
  console.log('输入后 编辑框末尾:', JSON.stringify(afterType.slice(-30)));

  // 撤销 —— 期望只撤掉自己刚写的字
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(200);
  const afterUndo = await ed();
  console.log('Ctrl+Z 后 编辑框:', JSON.stringify(afterUndo.slice(-60)));
  console.log('  是否只撤了自己写的字:', afterUndo === '## 第一节\n\n第一节的正文内容。' ? '是' : '否 ← ');

  // 切到第 2 块再撤销
  await p.evaluate(() => document.querySelectorAll('#sideSections .sec-item')[1].click());
  await p.waitForTimeout(150);
  console.log('切到第 2 块，编辑框:', JSON.stringify((await ed()).slice(0, 40)), '标签:', await label());
  await p.click('#editor');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(250);
  const afterCross = await ed();
  const inBlockNow = await label();
  console.log('跨块 Ctrl+Z 后 编辑框:', JSON.stringify(afterCross.slice(0, 50)), '标签仍为:', inBlockNow);
  console.log('  是否出现「标签说第2块但内容是第1块」:', /第一节/.test(afterCross) && /第 2/.test(inBlockNow) ? '是 ← 撤销栈污染' : '否');

  // 查找替换
  const hasFind = await p.evaluate(() => {
    const e = document.getElementById('editor');
    return { spellcheck: e.spellcheck, wrap: e.getAttribute('wrap') };
  });
  console.log('编辑框属性:', JSON.stringify(hasFind));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
