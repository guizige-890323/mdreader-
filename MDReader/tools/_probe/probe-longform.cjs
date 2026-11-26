/* 量现有编辑链在长文下的真实成本。走真实交互（拖文件进窗口 → Ctrl+E 编辑 → 切块 → 退出编辑），
   不 mock 内部状态 —— 目的是给出可复现的数字，而不是凭感觉说「会卡」。
   注：不点「保存」（会触发下载，headless 下会使页面关闭）；「退出编辑」已覆盖 joinBlocks + 全量重渲染，
   这两步正是保存路径里最贵的部分。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const F = 'file:///' + path.resolve(__dirname, '../../dist/MDReader.html').replace(/\\/g, '/');
const TMP = path.resolve(__dirname, '_tmp');

function genDoc(targetChars) {
  const out = []; let n = 0, i = 0;
  while (n < targetChars) {
    i++;
    const paras = [];
    for (let k = 0; k < 4; k++) {
      paras.push('这是一段用于压测的正文，包含**加粗**、*斜体*、`行内代码` 和 [链接](https://example.com)。' +
        '混入一些技术名词与中英混排以贴近真实文档的排版密度，让每段的换行位置不至于过于规律。序号 ' + i + '-' + k + '。');
    }
    out.push('## 第 ' + i + ' 节 标题文本\n\n' + paras.join('\n\n') +
      '\n\n- 列表项一\n- 列表项二\n- 列表项三\n\n' +
      '| 列 A | 列 B |\n|---|---|\n| 1 | 2 |\n\n' +
      '```js\nconst x = ' + i + ';\nconsole.log(x);\n```\n\n');
    n += out[out.length - 1].length;
  }
  return out.join('');
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
  console.log('字数   行数   块数  首渲染ms  进编辑ms  切块ms  退出编辑ms  内存MB');
  for (const K of [5, 10, 30, 60, 100]) {
    const md = genDoc(K * 1000);
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(F); await p.waitForTimeout(1400);
    try {
      const t = await p.evaluate(async (text) => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const T = {};
        const dt = new DataTransfer();
        dt.items.add(new File([text], 'doc.md', { type: 'text/markdown' }));
        let t0 = performance.now();
        document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        for (let i = 0; i < 400; i++) { await wait(20); const c = document.getElementById('content'); if (c && c.textContent.length > 500) break; }
        T.render = Math.round(performance.now() - t0);
        await wait(500);

        t0 = performance.now();
        document.getElementById('btnEdit').click();
        for (let i = 0; i < 400; i++) { await wait(15); if (!document.getElementById('editor').classList.contains('hidden')) break; }
        T.edit = Math.round(performance.now() - t0);

        T.blocks = document.querySelectorAll('#sideSections .sec-item').length;
        T.blockChars = document.getElementById('editor').value.length;
        T.lines = text.split('\n').length;
        T.textLen = text.length;

        t0 = performance.now();
        const items = document.querySelectorAll('#sideSections .sec-item');
        if (items.length > 1) items[1].click();
        T.switchBlock = Math.round(performance.now() - t0);

        t0 = performance.now();
        document.getElementById('btnEdit').click();          // 退出编辑 → joinBlocks + render(full)
        for (let i = 0; i < 400; i++) { await wait(15); if (document.getElementById('editor').classList.contains('hidden')) break; }
        T.exitEdit = Math.round(performance.now() - t0);

        T.heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
        return T;
      }, md);
      console.log(String(t.textLen).padStart(6) + String(t.lines).padStart(7) + String(t.blocks).padStart(6) +
        String(t.render).padStart(9) + String(t.edit).padStart(9) + String(t.switchBlock).padStart(7) +
        String(t.exitEdit).padStart(11) + String(t.heap).padStart(8));
    } catch (e) {
      console.log(String(md.length).padStart(6) + '  测量失败：' + e.message.slice(0, 60));
    }
    await p.close().catch(() => {});
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
