/* CR-07 验证截图：三主题菜单 / 禁用态 / 柔光 / 英文 / 关闭前后对比 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const F = ('file:///' + path.join(ROOT, 'dist', 'MDReader.html')).replace(/\\/g, '/');
const SHOTS = path.join(ROOT, '_shots');
const TMP = path.join(SHOTS, '_cr07docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const docs = [];
  const names = ['项目周报.md', '接口设计.md', '会议纪要.md', '发布清单.md', '故障复盘.md', '需求池.md'];
  names.forEach((n, i) => {
    const f = path.join(TMP, n);
    fs.writeFileSync(f, '# ' + n.replace('.md', '') + '\n\n这是第 ' + (i + 1) + ' 篇文档的正文内容，用于验证多标签批量关闭。\n\n## 概要\n\n- 条目一\n- 条目二\n\n| 项 | 值 |\n| --- | --- |\n| A | ' + (i * 10 + 10) + ' |\n| B | ' + (i * 20 + 20) + ' |\n', 'utf8');
    docs.push(f);
  });
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  p.on('dialog', async d => await d.accept());
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(1400);
  await p.setInputFiles('#filePicker', docs); await p.waitForTimeout(2600);
  const log = [];
  const shot = async (name, note) => {
    await p.screenshot({ path: path.join(SHOTS, name) });
    log.push([name, note]);
  };
  const rightClick = async i => {
    const ts = await p.$$('#tabbar .tab');
    await ts[i].click({ button: 'right' });
    await p.waitForTimeout(320);
  };
  const setTheme = async t => { await p.evaluate(x => document.getElementById('skin' + x).click(), t); await p.waitForTimeout(750); };
  const setPM = async want => {
    await p.evaluate(w => {
      const cur = document.documentElement.getAttribute('data-pm') === 'on';
      if (cur !== w) document.getElementById('setPm').click();
    }, want);
    await p.waitForTimeout(900);
  };
  const esc = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); };

  /* 1 浅色：右击第 3 个标签（当前激活第 1 个），五项全可用 */
  await rightClick(2);
  await shot('cr07-menu-light.png', '浅色 · 右击第3个标签，五项全可用（其他5/右侧3/左侧2/所有6）');
  await esc();

  /* 2 深色 */
  await setTheme('Dark');
  await rightClick(2);
  await shot('cr07-menu-dark.png', '深色 · 菜单材质跟随 --panel/--border，文字清晰');
  await esc();

  /* 3 护眼 */
  await setTheme('Sepia');
  await rightClick(2);
  await shot('cr07-menu-sepia.png', '护眼 · 暖米底菜单');
  await esc();

  /* 4 柔光（浅色 + PM on） */
  await setTheme('Light');
  await setPM(true);
  await rightClick(2);
  await shot('cr07-menu-pm.png', '云晰柔光 · 菜单自动切到暖色板，与顶栏/侧栏同源');
  await esc();
  await setPM(false);

  /* 5 首标签：关闭左侧禁用 */
  await rightClick(0);
  await shot('cr07-menu-first.png', '首标签基准 ·「关闭左侧」置灰禁用');
  await esc();

  /* 6 尾标签：关闭右侧禁用 */
  await rightClick(5);
  await shot('cr07-menu-last.png', '尾标签基准 ·「关闭右侧」置灰禁用');
  await esc();

  /* 7 右边界翻转 */
  await p.evaluate(() => {
    const tb = document.querySelectorAll('#tabbar .tab')[5];
    tb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1392, clientY: 862 }));
  });
  await p.waitForTimeout(320);
  await shot('cr07-menu-flip.png', '右下角唤出 · 向左向上双向翻转，完整落在视口内');
  await esc();

  /* 8 英文界面 */
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1800);
  await rightClick(2);
  await shot('cr07-menu-en.png', '英文界面 · Close / Close Others / Close to the Right / Left / All');
  /* 9 英文态执行关闭右侧后的结果 */
  await p.click('#tabMenu .tm-item[data-act="right"]');
  await p.waitForTimeout(1100);
  await shot('cr07-after-right-en.png', '英文态执行「关闭右侧」后 · 剩 3 个标签且激活切到基准项');
  /* 切回中文 */
  await p.evaluate(() => { const s = document.getElementById('setLang'); s.value = 'zh-CN'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1700);

  /* 10 关闭所有 → 欢迎屏，文件树保留 */
  await rightClick(0);
  await p.click('#tabMenu .tm-item[data-act="all"]');
  await p.waitForTimeout(1300);
  await shot('cr07-after-all.png', '关闭所有后 · 回欢迎屏，左侧文件树 6 条完整保留');

  /* 11 重新导入同批文件：验证 ingest 修复（旧版只开 1 个） */
  await p.setInputFiles('#filePicker', docs);
  await p.waitForTimeout(2600);
  const n = await p.evaluate(() => document.querySelectorAll('#tabbar .tab').length);
  await shot('cr07-reopen.png', '关闭所有后重新选同批文件 · 6 个标签全部开回（修复既有 ingest 缺陷）');
  log.push(['计数', '重新导入标签数 = ' + n]);

  /* 12 未保存保护弹窗（用真实 confirm 无法截图，改截脏态标签 + 菜单） */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(900);
  await p.evaluate(() => { const e = document.getElementById('editor'); e.value += '\n\n未保存的新内容'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(400);
  await rightClick(0);
  await shot('cr07-dirty-menu.png', '脏标签态 · 状态栏「● 未保存」，此时点关闭所有会先弹保护确认');
  await esc();
  /* 退出编辑，验证段落页签交还 */
  await p.evaluate(() => document.getElementById('btnEdit').click());
  await p.waitForTimeout(1200);
  await shot('cr07-side-restore.png', '退出编辑态后 · 侧栏选中态已交还「文件」，面板不空白（CR-07 修复）');

  log.push(['errs', JSON.stringify(errs)]);
  fs.writeFileSync(path.join(SHOTS, 'shot-cr07.log'), log.map(x => x.join('  |  ')).join('\n'), 'utf8');
  console.log(log.map(x => x.join('  |  ')).join('\n'));
  await b.close();
})();