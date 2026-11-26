/* 流程图可视化编辑：编辑前 / 编辑态对照截图
   - flow-edit-before.png : 原始自动布局 + 工具条（✎ 编辑 按钮）
   - flow-edit-after.png  : 编辑态（属性面板展开、节点被拖动、文字/颜色改动、新增节点）
   再用 PIL 拼成 flow-edit-compare.png。
   运行：NODE_PATH=<node_modules> node tools/shot-flow-edit.cjs
   ------------------------------------------------------------------ */
const { chromium } = require('playwright-core');
const path = require('path');
const D = path.resolve(__dirname, '..');
const HTML = 'file:///' + path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SAMPLE = path.join(__dirname, '_fixtures', 'flow-modes.md').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots');

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true
  });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await p.goto(HTML);
  await p.waitForTimeout(1500);
  await p.setInputFiles('#filePicker', SAMPLE);
  await p.waitForTimeout(2400);

  const wrap = p.locator('.mf-wrap').first();
  await wrap.screenshot({ path: path.join(SHOTS, 'flow-edit-before.png') });
  console.log('saved flow-edit-before.png');

  await p.click('.mf-tools [data-act="edit"]');

  /* 拖动 CEO：连线会实时跟随 */
  const box = await p.locator('.mf-svg .mf-node').first().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 76, box.y + box.height / 2 + 34, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(150);

  /* 改文字 + 换强调色 */
  await p.locator('.mf-svg .mf-node').first().click();
  await p.fill('.mf-ed-label', '总经理（已编辑）');
  await p.click('.mf-ed-colors button[data-color="#dc2626"]');
  await p.waitForTimeout(120);

  /* 新增节点并连线 */
  await p.click('.mf-edit-actions [data-act="add"]');
  await p.waitForTimeout(100);
  await p.fill('.mf-ed-label', '新部门');
  await p.click('.mf-ed-colors button[data-color="#059669"]');
  await p.click('.mf-edit-actions [data-act="link"]');
  await p.locator('.mf-svg .mf-node').first().click();
  await p.locator('.mf-svg .mf-node').last().click();
  await p.waitForTimeout(150);

  /* 保持属性面板展开，选中新节点便于看清编辑态 */
  await p.locator('.mf-svg .mf-node').last().click();
  await p.waitForTimeout(150);
  await wrap.screenshot({ path: path.join(SHOTS, 'flow-edit-after.png') });
  console.log('saved flow-edit-after.png');

  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
