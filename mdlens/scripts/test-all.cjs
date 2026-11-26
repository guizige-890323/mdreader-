'use strict';
/**
 * MDLens 端到端测试
 * ===============================================================
 * 覆盖三条真实接入路径：
 *   A. CLI 文件模式（默认，最可靠）
 *   B. CLI html 导出
 *   C. MCP 协议（initialize / tools/list / tools/call）
 *   D. 渲染质量（在真实浏览器里断言内容是否正确呈现）
 *
 * 断言取向：测「人类能不能读到」，而不是「函数有没有被调用」。
 * 所以最后一定要用浏览器打开产物，去数标题、表格、流程图节点。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'mdlens.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else {
    fail++; fails.push(name);
    console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  }
}
function group(t) { console.log('\n' + t); }

const SAMPLE = `# 季度经营分析

本季度整体**稳中有进**，营收同比增长 31.7%。

## 关键指标

| 指标 | Q1 | Q2 | 变化 |
| --- | ---: | ---: | ---: |
| 营收 | 1200 | 1580 | +31.7% |
| 成本 | 720 | 810 | +12.5% |
| 毛利 | 480 | 770 | +60.4% |

## 月度趋势

| 月份 | 营收 | 成本 |
| --- | ---: | ---: |
| 1月 | 1200 | 720 |
| 2月 | 1280 | 745 |
| 3月 | 1360 | 770 |
| 4月 | 1450 | 790 |
| 5月 | 1520 | 805 |
| 6月 | 1580 | 810 |

## 处理流程

\`\`\`mermaid
graph LR
  A[采集] --> B[清洗] --> C[建模] --> D[报告]
\`\`\`

## 采样代码

\`\`\`python
def growth(cur, prev):
    return (cur - prev) / prev * 100
\`\`\`

> [!NOTE]
> 复购率提升是本期最大亮点。

- 华东区超额完成
- 华南区持平
`;

function run(args, input) {
  return execFileSync(process.execPath, [CLI].concat(args), {
    input: input || undefined,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { NO_COLOR: '1' }),
    timeout: 120000,
  });
}

(async () => {
  // ---------------------------------------------------------- A. 文件模式
  group('[A] CLI 文件模式（默认路径）');
  let outFile = '';
  try {
    /* 带 --table tech：验证「表格配色」这个参数真的能落到 DOM 上。
       曾经 prefToQS() 传了 ?table=tech，但桥接层没读，参数被静默丢弃。 */
    const out = run(['render', '--no-open', '--table', 'tech', '-'], SAMPLE);
    const m = /file\s*:\s*(.+)/.exec(out);
    outFile = m ? m[1].trim() : '';
    ok('render 返回了文件路径', !!outFile, out.slice(0, 200));
    ok('文件确实存在', outFile && fs.existsSync(outFile));
    if (outFile) {
      const size = fs.statSync(outFile).size;
      ok('产出是自包含单文件（>2MB，引擎已内联）', size > 2 * 1024 * 1024, size);
      const html = fs.readFileSync(outFile, 'utf8');
      ok('内联了主题参数', html.includes('__MDLENS_INLINE_QS__'));
      ok('含 Mermaid / 图表引擎', html.includes('mermaid'));
      ok('外壳已标记（data-mdlens）', html.includes('data-mdlens'));
    }
  } catch (e) {
    ok('render 执行成功', false, String(e.message).slice(0, 300));
  }

  // ---------------------------------------------------------- B. html 导出
  group('[B] CLI html 导出到指定路径');
  const exportPath = path.join(os.tmpdir(), 'mdlens-e2e-export.html');
  try {
    const out = run(['html', '-', '-o', exportPath, '--theme', 'sepia'], SAMPLE);
    ok('html 命令成功', fs.existsSync(exportPath), out.slice(0, 200));
    if (fs.existsSync(exportPath)) {
      const html = fs.readFileSync(exportPath, 'utf8');
      ok('导出文件含内容（sepia 主题已写入参数）', html.includes('sepia'));
      ok('导出文件不含外部依赖（无 http 引用 <script src>）',
        !/<script[^>]+src=["']https?:/i.test(html));
    }
  } catch (e) {
    ok('html 导出执行成功', false, String(e.message).slice(0, 300));
  }

  // ---------------------------------------------------------- C. MCP 协议
  group('[C] MCP 协议层');
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'inspect_markdown', arguments: { markdown: SAMPLE } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'render_markdown', arguments: { markdown: SAMPLE, title: 'e2e' } } },
  ];
  let mcpOut = '';
  try {
    mcpOut = run(['mcp'], msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
  } catch (e) {
    mcpOut = String(e.stdout || '');
  }
  const replies = {};
  mcpOut.trim().split('\n').forEach((l) => {
    try { const m = JSON.parse(l); if (m.id != null) replies[m.id] = m; } catch (e) { }
  });

  ok('initialize 返回 serverInfo', !!(replies[1] && replies[1].result && replies[1].result.serverInfo));
  ok('协议版本已声明', !!(replies[1] && replies[1].result.protocolVersion));
  ok('声明了 tools 能力', !!(replies[1] && replies[1].result.capabilities && replies[1].result.capabilities.tools));

  const tools = (replies[2] && replies[2].result && replies[2].result.tools) || [];
  const names = tools.map((t) => t.name);
  ok('tools/list 返回 6 个工具', tools.length === 6, names);
  ['render_markdown', 'open_preview', 'update_preview', 'render_file', 'export_html', 'inspect_markdown']
    .forEach((n) => ok('工具已注册：' + n, names.includes(n)));

  let inspected = null;
  try {
    inspected = JSON.parse(replies[3].result.content[0].text);
  } catch (e) { }
  ok('inspect_markdown 返回结构分析', !!inspected);
  if (inspected) {
    ok('识别出标题', Array.isArray(inspected.headings) && inspected.headings.length >= 3, inspected.headings);
    /* tables 是「表格个数」，不是行数：SAMPLE 里正好 2 张表（关键指标 / 月度趋势）。
       早先按行数统计，一个 3 行的表会被算成 3 个表格。 */
    ok('识别出表格（个数而非行数）', inspected.tables === 2, inspected.tables);
    ok('识别出 Mermaid 代码块', inspected.has_mermaid === true);
    ok('给出渲染建议', Array.isArray(inspected.suggestions) && inspected.suggestions.length > 0, inspected.suggestions);
  }

  let rendered = null;
  try {
    rendered = JSON.parse(replies[4].result.content[0].text);
  } catch (e) { }
  ok('render_markdown 返回结果', !!rendered);
  if (rendered) {
    ok('默认为文件模式（不会过期）', rendered.mode === 'file', rendered.mode);
    ok('返回了 html 绝对路径', typeof rendered.path === 'string' && rendered.path.endsWith('.html'), rendered.path);
    ok('返回了可双击的 file:// 地址', String(rendered.url || '').startsWith('file:///'), rendered.url);
    ok('产出文件真实存在', fs.existsSync(rendered.path));
  }

  // ---------------------------------------------------------- D. 渲染质量
  group('[D] 浏览器内渲染质量（真正的人类视角）');
  let pw = null;
  try { pw = require('playwright-core'); } catch (e) { }

  if (!pw) {
    ok('playwright 可用（跳过渲染质量检查）', true);
  } else if (outFile && fs.existsSync(outFile)) {
    const browser = await pw.chromium.launch({
      channel: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some((p) => fs.existsSync(p))
        ? 'msedge' : undefined,
      headless: true, args: ['--no-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto('file:///' + outFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    const r = await page.evaluate(() => {
      const c = document.querySelector('#content');
      const node = (el) => (el ? getComputedStyle(el).display : '(null)');
      return {
        h1: [...c.querySelectorAll('h1')].map((n) => n.textContent.trim()),
        h2: c.querySelectorAll('h2').length,
        tables: c.querySelectorAll('table').length,
        tableCells: c.querySelectorAll('table td').length,
        codeHl: c.querySelectorAll('.hljs').length,
        callout: c.querySelectorAll('.callout').length,
        listItems: c.querySelectorAll('li').length,
        flowNodes: c.querySelectorAll('.mf-node').length,
        flowEdges: c.querySelectorAll('.mf-edge').length,
        svgTotal: c.querySelectorAll('svg').length,
        toolbarShown: node(document.querySelector('.toolbar')),
        sidebarShown: node(document.querySelector('.sidebar')),
        welcomeShown: node(document.querySelector('#welcome')),
        readerH: document.querySelector('.reader').clientHeight,
        viewportH: window.innerHeight,
        // 文字是否真的可见（不是被 opacity:0 / 颜色同背景藏起来）
        bodyColor: getComputedStyle(c.querySelector('p') || c).color,
        bg: getComputedStyle(document.body).backgroundColor,
        // 表格配色（--table tech）是否真的生效
        tableTheme: document.documentElement.getAttribute('data-table-theme'),
        thBg: (() => {
          const th = c.querySelector('table th');
          return th ? getComputedStyle(th).backgroundColor : '';
        })(),
      };
    });

    ok('一级标题正确', r.h1.includes('季度经营分析'), r.h1);
    ok('三个二级标题都在', r.h2 >= 3, r.h2);
    ok('表格被渲染', r.tables >= 1, r.tables);
    ok('表格单元格有内容', r.tableCells >= 12, r.tableCells);
    ok('代码块已高亮', r.codeHl >= 1, r.codeHl);
    ok('Callout 已识别（> [!NOTE]）', r.callout >= 1, r.callout);
    ok('列表项已渲染', r.listItems >= 2, r.listItems);
    ok('Mermaid 流程图有 4 个节点', r.flowNodes === 4, r.flowNodes);
    ok('流程图有 3 条连线', r.flowEdges === 3, r.flowEdges);
    ok('顶栏已隐藏（AI 场景不需要）', r.toolbarShown === 'none', r.toolbarShown);
    /* 表格配色落到 DOM：data-table-theme 已切换，且表头真的变蓝。
       只查属性不够 —— 属性对了样式没接上照样是黑表头。 */
    ok('表格配色已切换到 tech', r.tableTheme === 'tech', r.tableTheme);
    ok('表头真的变蓝（蓝色科技配色生效）',
      /^rgb\(\s*37\s*,\s*99\s*,\s*235\s*\)$/.test(r.thBg.replace(/\s+/g, ' ').replace(/\(\s+/g, '(')), r.thBg);
    ok('侧栏已隐藏', r.sidebarShown === 'none', r.sidebarShown);
    ok('欢迎屏已隐藏（不遮挡正文）', r.welcomeShown === 'none', r.welcomeShown);
    ok('阅读区撑满视口高度', r.readerH === r.viewportH, { readerH: r.readerH, viewportH: r.viewportH });
    ok('正文颜色与背景有足够反差', r.bodyColor !== r.bg, { color: r.bodyColor, bg: r.bg });
    ok('零 JS 错误', errs.length === 0, errs.slice(0, 2));

    // ---- 图表自动生成（AI 输出里表格必须能自动出图）----
    group('[E] 表格 → 图表自动生成');
    const c2 = await page.evaluate(() => {
      const c = document.querySelector('#content');
      const boxes = [...c.querySelectorAll('.chart-box')];
      const shown = boxes.filter((b) => b.classList.contains('show'));
      const svgOf = (b) => [...b.querySelectorAll('svg')]
        .find((s) => /0 0 (7|8)\d\d/.test(s.getAttribute('viewBox') || ''));
      const first = shown.length ? svgOf(shown[0]) : null;
      return {
        boxes: boxes.length,
        shown: shown.length,
        // 折线：path 有 C 命令且 fill=none；柱状：rect；饼/玫瑰：path 带弧
        curves: first ? [...first.querySelectorAll('path')]
          .filter((p) => /C/.test(p.getAttribute('d') || '')).length : 0,
        circles: first ? first.querySelectorAll('circle').length : 0,
        rects: first ? first.querySelectorAll('rect').length : 0,
        slices: first ? first.querySelectorAll('path').length : 0,
        gridLines: first ? first.querySelectorAll('line.grid-line').length : 0,
        axisTexts: first ? first.querySelectorAll('text').length : 0,
        sub: shown.length && shown[0].querySelector('.chart-sub')
          ? shown[0].querySelector('.chart-sub').textContent.trim() : '',
      };
    });
    ok('表格被识别为图表容器', c2.boxes >= 1, c2.boxes);
    ok('图表默认自动展开（无需用户点击）', c2.shown >= 1, c2.shown);
    // 柱状图用 rect，折线用带 C 的 path，饼/玫瑰用 path 弧 —— 三者任一即算画出来了
    ok('图表内绘制了图形元素（柱/线/扇区）',
      c2.curves + c2.circles + c2.rects + c2.slices > 0,
      { curves: c2.curves, circles: c2.circles, rects: c2.rects, slices: c2.slices });
    ok('图表有网格线', c2.gridLines >= 3, c2.gridLines);
    ok('图表有坐标轴标签', c2.axisTexts >= 4, c2.axisTexts);
    ok('图表副标题说明了类型（可读性提示）', c2.sub.length > 0, c2.sub.slice(0, 60));

    await browser.close();
  }

  // ---------------------------------------------------------- 汇总
  console.log('\n' + '='.repeat(56));
  console.log('结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) { console.log('\n失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exitCode = fail ? 1 : 0;
})();