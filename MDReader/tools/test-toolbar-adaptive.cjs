/* 顶栏自适应回归：从 320 到 2560 全宽度扫一遍，断言
   1. 零横向溢出（除非极窄，那时必须露出滚动条）
   2. 核心操作按钮永远在视口内且未被收纳
   3. 「更多」菜单能覆盖所有被收纳的控件
   4. 无 JS 错误
*/
const { chromium } = require('playwright-core');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '../dist/MDReader.html').replace(/\\/g, '/');

/* 核心操作：极窄以外的任何宽度都必须直接可见。
   btnSettings 在极窄时会收进「更多」，此时只要「更多」可达就算合格。 */
const CORE = ['btnSide', 'btnFocus', 'btnNew', 'btnEdit', 'btnSave', 'btnExport'];
const CORE_WIDE = ['btnSettings'];
/* 真实存在的顶栏按钮（旧测试里的 btnPrint/btnWord 早已不存在） */
const ALL = ['btnSide', 'btnFocus', 'btnNew', 'btnOpenFile', 'btnOpenDir', 'btnRecent',
  'btnReload', 'btnEdit', 'btnSave', 'layoutSel', 'btnFontDown', 'btnFontUp',
  'btnExport', 'btnChartAuto', 'btnFlowAll', 'skinLight', 'skinDark', 'skinSepia', 'btnSettings'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(FILE);
  await page.waitForTimeout(1200);

  const out = [];
  const ok = (n, c, x) => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));

  const widths = [320, 380, 420, 480, 560, 640, 720, 800, 900, 1024, 1080, 1200,
    1280, 1366, 1440, 1500, 1600, 1700, 1920, 2200, 2560];
  let worst = null;
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(170);
    const r = await page.evaluate((core) => {
      const t = document.querySelector('.toolbar');
      const tr = t.getBoundingClientRect();
      const vis = el => {
        if (!el) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 &&
          b.left >= -1 && b.right <= tr.right + 1;
      };
      return {
        tb: t.getAttribute('data-tb'),
        ov: t.scrollWidth - t.clientWidth,
        scrollMode: t.classList.contains('tb-scroll'),
        tight: t.classList.contains('tb-tight'),
        coreHidden: core.filter(id => !vis(document.getElementById(id))),
        moreVisible: vis(document.getElementById('btnMore')),
        moreInMenu: !!document.querySelector('#tbMoreMenu button') || true,
        collapsed: Array.from(t.querySelectorAll('.tb-collapsed')).map(e => e.id || e.className)
      };
    }, CORE.concat(CORE_WIDE));
    /* 允许滚动兜底：溢出时必须开了 tb-scroll，否则就是"藏起来了" */
    const overflowOk = r.ov <= 1 || r.scrollMode;
    /* 极窄（<560）时设置项允许收进「更多」，但「更多」按钮本身必须可见可点 */
    const narrow = w < 560;
    const coreOk = narrow
      ? CORE.every(id => !r.coreHidden.includes(id)) && r.moreVisible
      : r.coreHidden.length === 0;
    if (!overflowOk || !coreOk) worst = worst || { w, r };
    if (w >= 560) {
      ok(`${w}px 零溢出`, r.ov <= 1, `tb=${r.tb} ov=${r.ov}`);
    } else {
      ok(`${w}px 溢出时露滚动条`, overflowOk, `tb=${r.tb} ov=${r.ov} scroll=${r.scrollMode}`);
    }
    ok(`${w}px 核心按钮全部可见`, coreOk, r.coreHidden.join(','));
  }

  /* 收纳项的菜单可覆盖性：把宽度压到 mini 并检查菜单条目数 */
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(400);
  await page.click('#btnMore');
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const menu = document.querySelector('#tbMoreMenu');
    const items = Array.from(menu.querySelectorAll('button')).map(b => b.textContent.trim());
    const NAMES = {
      layoutSel: '排版皮肤', btnFontDown: '缩小字号', btnFontUp: '放大字号',
      btnSettings: '系统设置', btnReload: '重新读取', btnSave: '保存', btnEdit: '编辑',
      btnOpenFile: '打开文件', btnOpenDir: '打开文件夹', btnRecent: '最近打开',
      btnChartAuto: '数据图表', btnFlowAll: '流程图', btnSide: '侧栏', btnFocus: '专注模式',
      lhSel: '行高', btnPaperMatte: '柔光'
    };
    const collapsed = Array.from(document.querySelectorAll('.toolbar .tb-collapsed'))
      .map(e => (e.querySelector('.tb-label') || {}).textContent || NAMES[e.id] || e.id);
    const mr = menu.getBoundingClientRect();
    return {
      open: !menu.hasAttribute('hidden'),
      items, collapsed,
      inViewport: mr.left >= 0 && mr.right <= innerWidth + 1 && mr.bottom <= innerHeight + 1
    };
  });
  ok('更多菜单能打开', m.open);
  ok('更多菜单不超出视口', m.inViewport, JSON.stringify({ l: m.inViewport }));
  ok('被收纳的控件在菜单里都有入口',
    m.collapsed.every(c => m.items.some(it => it.includes(String(c).trim()))),
    `collapsed=${m.collapsed.length} items=${m.items.length}`);

  /* 窄→宽 回程：拉宽后应恢复显示 */
  await page.click('#btnMore').catch(() => { });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({
    tb: document.querySelector('.toolbar').getAttribute('data-tb'),
    collapsed: document.querySelectorAll('.toolbar .tb-collapsed').length
  }));
  ok('拉宽后恢复完整布局', back.tb === 'full' && back.collapsed === 0, JSON.stringify(back));

  ok('无 JS 运行时错误', errs.length === 0, errs.join(' | '));

  const fails = out.filter(l => l.startsWith('FAIL'));
  console.log(out.filter(l => l.startsWith('FAIL')).join('\n') || '(无失败项)');
  console.log('\n' + (out.length - fails.length) + '/' + out.length + ' passed');
  if (worst) console.log('首个异常:', JSON.stringify(worst));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();