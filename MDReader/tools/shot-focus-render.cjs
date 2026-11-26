/* ==================================================================
   CR-2026-11-15-03  Ctrl+O 专注模式 · 渲染快捷菜单 对比截图
   ------------------------------------------------------------------
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/shot-focus-render.cjs

   focus-before.png       模拟改动前：Ctrl+O 打开文件，专注模式把整条顶栏藏掉，
                          渲染类控件无处可点（注入一条 CSS 把 .focus-render 隐藏）
   focus-after.png        改动后：Ctrl+O 进入专注，底部浮出渲染快捷菜单
   focus-after-dark.png   深色主题下：通过快捷菜单里的「深色」按钮切换，证明代理真生效
   focus-normal.png       普通界面参考（完整顶栏）
   ================================================================== */
const { chromium } = require('playwright-core');

const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const SHOTS = 'D:/WorkBuddy/2026-11-08-21-28-36/MDReader/_shots';

/* 模拟改动前：专注模式仍隐藏整条顶栏，且没有任何浮动渲染菜单 */
const OLD = '#app.focus .focus-render{display:none!important}';

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(F);
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await p.waitForTimeout(2200);

  /* 普通界面参考 */
  await p.screenshot({ path: SHOTS + '/focus-normal.png' });
  console.log('saved focus-normal.png');

  /* 进入专注模式 */
  await p.keyboard.press('Control+o');
  await p.waitForTimeout(500);

  /* 改动前：隐藏浮动菜单 */
  const tag = await p.addStyleTag({ content: OLD });
  await p.waitForTimeout(350);
  await p.screenshot({ path: SHOTS + '/focus-before.png' });
  console.log('saved focus-before.png  (专注下无渲染菜单 = 改动前)');

  /* 改动后：恢复浮动菜单 */
  await p.evaluate(el => el.remove(), tag);
  await p.waitForTimeout(350);
  await p.screenshot({ path: SHOTS + '/focus-after.png' });
  console.log('saved focus-after.png   (专注下保留渲染快捷菜单 = 改动后)');

  /* 用快捷菜单切深色，证明代理按钮真生效 */
  await p.click('.fr-btn[data-proxy="skinDark"]');
  await p.waitForTimeout(900);
  await p.screenshot({ path: SHOTS + '/focus-after-dark.png' });
  console.log('saved focus-after-dark.png  (快捷菜单切深色主题)');

  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
