/* ==================================================================
   CR-2026-11-15-02  柔光「全应用适配」对比截图
   ------------------------------------------------------------------
   运行：NODE_PATH=/d/WorkBuddy/2026-11-15-02-46-55/sci-hud/node_modules \
         node MDReader/tools/shot-pm-global.cjs

   pm-before.png         柔光已开、但 chrome 仍是冷白/冷灰（= 修复前，隔离感）
   pm-after.png          柔光已开、chrome 全暖（= 修复后）
   pm-after-settings.png 打开系统设置，验证分组卡片式设置页也同步暖化
   ================================================================== */
const { chromium } = require('playwright-core');

const F = 'file:///D:/WorkBuddy/2026-11-08-21-28-36/MDReader/dist/MDReader.html';
const SHOTS = 'D:/WorkBuddy/2026-11-08-21-28-36/MDReader/_shots';

/* 模拟修复前：柔光开着，纸面仍是暖色（--pm-paper 不动），但整套 chrome
   变量回落到 card 皮肤的冷白/冷灰 —— 正是「阅读区一块暖玻璃、四周冷白」的隔离感。
   注入的 <style> 追加在 head 末尾，与映射规则同特异性同 !important，后写赢。 */
const OLD = `
html[data-pm="on"]{
  --bg:#fafafa!important; --canvas:#fafafa!important;
  --panel:#ffffff!important; --panel-2:#f4f4f5!important; --fill:#f4f4f5!important;
  --border:#e4e4e7!important; --border-2:#f0f0f2!important;
  --rule:#e4e4e7!important; --rule-2:#f0f0f2!important;
  --accent-2:#eff6ff!important;
  --set-canvas:#f2f3f5!important; --set-line:#eceef1!important;
  --set-fill:#f1f3f5!important; --set-fill-hover:#e7eaee!important;
  --paper-edge:rgba(9,9,11,.06)!important;
  /* 纸面保留 --pm-paper 暖色（阅读区仍吃柔光），只把四周 chrome 打回冷色 */
  --pm-canvas:#fafafa!important;
  --pm-panel:#ffffff!important; --pm-panel-2:#f4f4f5!important;
}`;

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(F);
  await p.waitForTimeout(1400);
  await p.evaluate(() => { const d = document.getElementById('wDemo'); if (d) d.click(); });
  await p.waitForTimeout(2200);

  /* 开启柔光（正文滤镜 + 纸面 + 颗粒层生效） */
  await p.evaluate(() => document.documentElement.setAttribute('data-pm', 'on'));
  await p.waitForTimeout(400);

  /* ---- 修复前 ---- */
  const tag = await p.addStyleTag({ content: OLD });
  await p.waitForTimeout(450);
  await p.screenshot({ path: SHOTS + '/pm-before.png' });
  console.log('saved pm-before.png  (柔光开 + 冷色 chrome = 修复前)');

  /* ---- 修复后：移除模拟补丁，恢复真实全应用暖色板 ---- */
  await p.evaluate(el => el.remove(), tag);
  await p.waitForTimeout(450);
  await p.screenshot({ path: SHOTS + '/pm-after.png' });
  console.log('saved pm-after.png   (全应用统一柔光 = 修复后)');

  /* ---- 设置面板：分组卡片式设计语言也必须同步暖化 ---- */
  await p.evaluate(() => { const m = document.getElementById('setMask'); if (m) m.removeAttribute('hidden'); });
  await p.waitForTimeout(450);
  await p.screenshot({ path: SHOTS + '/pm-after-settings.png' });
  console.log('saved pm-after-settings.png');

  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
