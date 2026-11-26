/* 剪贴板浮层回归测试（两套上下文）
   A. file:// —— 浏览器硬限制，预期「引导手动 Ctrl+V」，绝不能让用户白点授权
   B. http:// —— 正常流程：拒绝 → 允许 → 重试 → 创建
*/
const { chromium } = require('playwright-core');
const path = require('path');
const http = require('http');
const fs = require('fs');

const HTML = path.resolve(__dirname, '../dist/MDReader.html');
const FILE = 'file:///' + HTML.replace(/\\/g, '/');
const out = [];
const ok = (n, c, x) => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  /* ================= A. file:// ================= */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(FILE);
    await page.waitForTimeout(900);

    await page.hover('#btnNew');
    await page.waitForTimeout(600);

    const s = await page.evaluate(() => ({
      vis: !document.querySelector('#newPop').hasAttribute('hidden'),
      btn: document.querySelector('#npPaste').textContent.trim(),
      disabled: document.querySelector('#npPaste').disabled,
      state: document.querySelector('#npState').innerHTML.replace(/<[^>]+>/g, ' ').trim(),
      focused: document.activeElement === document.querySelector('#npPasteArea')
    }));
    ok('A1 file:// 浮层正常展开', s.vis);
    ok('A2 file:// 按钮不诱导授权，改为引导 Ctrl+V', /Ctrl\+V/.test(s.btn), s.btn);
    ok('A3 file:// 按钮可点（不 disable）', s.disabled === false);
    ok('A4 file:// 明示需手动粘贴', /手动粘贴/.test(s.state), s.state.slice(0, 40));
    ok('A5 file:// 光标自动落位到输入框', s.focused === true);

    /* 手动粘贴必须能创建 */
    await page.evaluate(() => {
      const ta = document.querySelector('#npPasteArea');
      const dt = new DataTransfer();
      dt.setData('text', '# 本地文件粘贴\n\n内容来自 Ctrl+V。\n');
      ta.focus();
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500);
    const t1 = await page.evaluate(() => ({
      hidden: document.querySelector('#newPop').hasAttribute('hidden'),
      text: document.querySelector('#content').textContent
    }));
    ok('A6 file:// Ctrl+V 成功创建文档', t1.hidden && /本地文件粘贴/.test(t1.text), JSON.stringify(t1.text.slice(0, 40)));
    ok('A7 file:// 无 JS 错误', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  /* ================= B. http:// ================= */
  {
    const html = fs.readFileSync(HTML);
    /* _autoload.js 是便携版注入脚本，index 之外的请求按 JS 回空，避免测试服务器返回 HTML 造成的假报错 */
    const srv = http.createServer((q, r) => {
      if (q.url && q.url.indexOf('_autoload.js') >= 0) {
        r.writeHead(200, { 'Content-Type': 'application/javascript' }); r.end(''); return;
      }
      r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html);
    });
    await new Promise(r => srv.listen(8851, '127.0.0.1', r));

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://127.0.0.1:8851/');
    await page.waitForTimeout(700);

    await page.evaluate(() => {
      let mode = 'deny';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText() {
            if (mode === 'deny') { const e = new Error('d'); e.name = 'NotAllowedError'; return Promise.reject(e); }
            return Promise.resolve('## 授权后内容\n\n成功。\n');
          }
        }
      });
      window.__mode = m => { mode = m; };
    });

    await page.hover('#btnNew');
    await page.waitForTimeout(600);
    const b1 = await page.evaluate(() => ({
      btn: document.querySelector('#npPaste').textContent.trim(),
      disabled: document.querySelector('#npPaste').disabled,
      state: document.querySelector('#npState').innerHTML.replace(/<[^>]+>/g, ' ').trim()
    }));
    ok('B1 http:// 拒绝后按钮可重试且不禁用', b1.disabled === false && /读取剪贴板/.test(b1.btn), b1.btn);
    ok('B2 http:// 提示具体原因', /拒绝/.test(b1.state), b1.state.slice(0, 30));

    /* 授权后移开再移回 —— 旧代码在这里卡死 */
    await page.evaluate(() => window.__mode('allow'));
    await page.mouse.move(700, 600);
    await page.waitForTimeout(350);
    await page.hover('#btnNew');
    await page.waitForTimeout(700);
    const b2 = await page.evaluate(() => ({
      vis: !document.querySelector('#newPop').hasAttribute('hidden'),
      has: document.querySelector('#npState').classList.contains('has'),
      btn: document.querySelector('#npPaste').textContent.trim()
    }));
    ok('B3 http:// 授权后移回自动重读成功', b2.vis && b2.has, JSON.stringify(b2));
    ok('B4 http:// 按钮变回「粘贴并创建」', /粘贴并创建/.test(b2.btn), b2.btn);

    await page.click('#npPaste');
    await page.waitForTimeout(600);
    const b3 = await page.evaluate(() => ({
      hidden: document.querySelector('#newPop').hasAttribute('hidden'),
      text: document.querySelector('#content').textContent
    }));
    ok('B5 http:// 一键创建成功', b3.hidden && /授权后内容/.test(b3.text), JSON.stringify(b3.text.slice(0, 40)));
    ok('B6 http:// 无 JS 错误', errs.length === 0, errs.join('|'));

    srv.close();
    await ctx.close();
  }

  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('FAIL')).length;
  console.log('\n' + (out.length - f) + '/' + out.length + ' passed');
  await browser.close();
  process.exit(f ? 1 : 0);
})();