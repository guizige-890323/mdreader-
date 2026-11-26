/* ASCII / Unicode 框线「功能架构图」识别 → 可视化转换 回归测试
   A. 纯 Node —— UAX #11 列宽网格、band/slot 聚类、语义图、Mermaid 兼容性
   B. 浏览器 —— 代码块 / 正文两条路径、复用 MDFlow、导出与打印清理、截图
   跑之前先 python src/build.py；UI 测试需 NODE_PATH 指向含 playwright-core 的 node_modules。 */
const { chromium } = require('playwright-core');
const { spawnSync } = require('child_process');
const A = require('../src/ascii-diagram.js');
const MF = require('../src/mermaid-flow.js');
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SHOTS = path.join(D, '_shots').replace(/\\/g, '/');
const TXT = fs.readFileSync(path.join(__dirname, '_fixtures', 'ascii-arch.txt'), 'utf8');
const MD = path.join(__dirname, '_fixtures', 'ascii-arch.md').replace(/\\/g, '/');
const PLAIN = path.join(__dirname, '_fixtures', 'ascii-arch-plain.md').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };
const vCols = row => row.cells.filter(c => !c.cont && c.ch === '│').map(c => c.col);

/* ==================== A. 纯 Node ==================== */
console.log('\n=== A1. UAX #11 显示列宽 ===');
{
  ok('CJK 汉字占 2 列', A.charW('中') === 2);
  ok('ASCII 字母占 1 列', A.charW('A') === 1);
  ok('box-drawing ─ 占 1 列', A.charW('─') === 1);
  ok('box-drawing │ 占 1 列', A.charW('│') === 1);
  ok('箭头 → 占 1 列', A.charW('→') === 1);
  ok('组合音标占 0 列', A.charW('\u0301') === 0);
  ok('零宽空格占 0 列', A.charW('\u200b') === 0);
  ok('全角＝占 2 列', A.charW('＝') === 2);
  ok('emoji 占 2 列', A.charW('😀') === 2);
}

console.log('\n=== A2. 字符网格对齐（识别失败的技术根因） ===');
{
  const rows = A.gridOf(TXT);
  ok('网格行数 = 29（含末尾换行）', rows.length === 29, rows.length);
  ok('最大显示宽度 = 79 列', rows[14].width === 79, rows[14].width);
  const a = vCols(rows[14]), b = vCols(rows[15]), c = vCols(rows[16]);
  ok('行14 竖线显示列 = [0,17,28,48,59,78]', a.join(',') === '0,17,28,48,59,78', a);
  ok('行15 与行14 竖线列完全一致', b.join(',') === a.join(','), b);
  ok('行16 与行14 竖线列完全一致（±1 漂移后仍同槽）', c.map((x, i) => Math.abs(x - a[i]) <= 1).every(Boolean), c);
  const lines = TXT.split('\n');
  const cp = lines[14].split('│').length - 1, cp2 = lines[15].split('│').length - 1;
  ok('按 code point 算两行边界数相同但位置必然错位', cp === cp2 && cp === 6, { cp, cp2 });
  const cpFirst = lines[14].indexOf('│'), dispFirst = a[1];
  ok('code point 列 ≠ 显示列（证明必须做列宽展开）', cpFirst !== dispFirst, { cpFirst, dispFirst });
}

console.log('\n=== A3. isDiagram：只认框线图，不抢别的链路 ===');
{
  ok('用户原图 → true', A.isDiagram(TXT) === true);
  ok('普通段落 → false', A.isDiagram('这是一段普通文字。\n第二行文字。\n第三行文字。') === false);
  ok('Markdown 表格 → false', A.isDiagram('| 列1 | 列2 |\n|---|---|---|\n| a | b |\n| c | d |') === false);
  ok('Mermaid 源码 → false', A.isDiagram('flowchart TD\n  A[开始] --> B[结束]') === false);
  ok('箭头文本流程图 → false', A.isDiagram('A --> B --> C --> D') === false);
  ok('空文本 → false', A.isDiagram('') === false);
  ok('null → false', A.isDiagram(null) === false);
  const asciiBox = [
    '+-------+', '| Alpha |', '+-------+', '   ↓', '+-------+', '| Beta  |', '+-------+'
  ].join('\n');
  ok('纯 ASCII +---+ 图 → true', A.isDiagram(asciiBox) === true);
  const dbl = ['╔══════╗', '║ 甲模块 ║', '╚══╤═══╝', '   ↓', '╔══════╗', '║ 乙模块 ║', '╚══════╝'].join('\n');
  ok('双线 ╔═╗ 图 → true', A.isDiagram(dbl) === true);
}

console.log('\n=== A4. parse：用户 7 层 syslog 功能架构图 ===');
let model;
{
  model = A.parse(TXT);
  ok('识别 7 个主节点', model.nodes.length === 7, model.nodes.length);
  ok('识别 8 条主连线', model.edges.length === 8, model.edges.length);
  ok('识别 5 个层次', model.layers.length === 5, model.layers.length);
  ok('识别 1 个外部输入标注', model.externals.length === 1, model.externals.length);
  ok('stats.bands = 5', model.stats.bands === 5, model.stats.bands);
  ok('stats.arrows = 12', model.stats.arrows === 12, model.stats.arrows);
  ok('stats.drift > 0（手绘边界漂移被记录）', model.stats.drift > 0, model.stats.drift);
  const L = model.nodes.map(n => n.lines.join('｜'));
  ok('N1 采集层文字保真', /1\. 采集层/.test(L[0]) && /syslog_server\.py/.test(L[0]), L[0]);
  ok('N2 解析层 PRI→severity 箭头未被吃掉', /PRI→severity/.test(L[1]), L[1]);
  ok('N2 key=value 等号未被吃掉', /key=value/.test(L[1]), L[1]);
  ok('N2 %%NN 模块标记保留', /%%NN/.test(L[1]), L[1]);
  ok('N3 IP→台账 箭头保留', /IP→台账/.test(L[2]), L[2]);
  ok('N5 active→cleared 保留', /active→cleared/.test(L[4]), L[4]);
  ok('N6 Flask API + SSE 加号保留', /Flask API \+ SSE/.test(L[5]), L[5]);
  ok('N7 前台两行文字保留', /实时流水/.test(L[6]) && /自监控/.test(L[6]), L[6]);
  const E = model.edges.map(e => e.from + '>' + e.to).sort().join(' ');
  const want = ['N1>N2', 'N2>N3', 'N2>N4', 'N2>N5', 'N3>N6', 'N4>N6', 'N5>N6', 'N6>N7'].sort().join(' ');
  ok('边集合精确匹配 1→2→{3,4,5}→6→7', E === want, { E, want });
  ok('N2→3/4/5 判定为扇出 fanout', model.edges.filter(e => e.kind === 'fanout').length === 3);
  ok('3/4/5→N6 判定为汇合 merge', model.edges.filter(e => e.kind === 'merge').length === 3);
  ok('N1→N2 与 N6→N7 为 linear', model.edges.filter(e => e.kind === 'linear').length === 2);
  ok('外部标注指向 N1', model.externals[0].to === 'N1', model.externals[0]);
  ok('外部标注含 UDP 5140 与兼容 514', /UDP 5140/.test(model.externals[0].label) && /514/.test(model.externals[0].label));
  const W = model.warnings.join(' ');
  ok('warnings 提示顶边缺失容错', /顶边/.test(W), W);
  ok('warnings 提示边界列漂移', /边界列漂移/.test(W), W);
  ok('warnings 提示外部标注', /框外左侧标注/.test(W), W);
}

console.log('\n=== A5. Mermaid 生成与 MDFlow.parse 兼容 ===');
{
  ok('mermaid 以 flowchart TD 开头', /^flowchart TD\n/.test(model.mermaid));
  ok('外部输入节点已生成', /ADIN1\["/.test(model.mermaid));
  ok('多行标签用 <br\/> 表达', (model.mermaid.match(/<br\/>/g) || []).length >= 8);
  const g = MF.parse(model.mermaid);
  ok('MDFlow.parse 接受（未被 risky 拦截）', !!g);
  if (g) {
    ok('MDFlow 图 = 8 节点', g.nodes.length === 8, g.nodes.length);
    ok('MDFlow 图 = 9 连线', g.edges.length === 9, g.edges.length);
    ok('方向 = TD', g.dir === 'TD', g.dir);
    const n2 = g.nodes.find(n => n.id === 'N2');
    ok('N2 多行文字拆成 4 行', n2 && n2.lines.length === 4, n2 && n2.lines);
    ok('N2 第二行保留 PRI→severity', n2 && /PRI→severity/.test(n2.lines[1]), n2 && n2.lines[1]);
  }
}

console.log('\n=== A6. defuse：危险字符不炸 Mermaid 语法 ===');
{
  const tricky = [
    '┌────────────────────────┐',
    '│ A --> B · a|b · "q"   │',
    '│ :::  shape  ~~~  @{   │',
    '└───────────┬────────────┘',
    '            ↓',
    '┌────────────────────────┐',
    '│ 第二个节点             │',
    '└────────────────────────┘'
  ].join('\n');
  const m = A.parse(tricky);
  ok('含危险字符图仍被识别', A.isDiagram(tricky) && m.nodes.length === 2, m.nodes.length);
  ok('生成码不含裸双引号', !/\["[^\n]*"[^\n]*"\]/.test(m.mermaid));
  ok('生成码不含裸竖线', !/\|/.test(m.mermaid.split('\n').slice(1).join('\n')));
  ok('生成码不含 --> 伪边', (m.mermaid.match(/-->/g) || []).length === m.edges.length, m.mermaid);
  ok('生成码不含 ::: / ~~~ / @{ / shape', !/:::|~~~|@\{|\bshape\b/.test(m.mermaid), m.mermaid);
  const g = MF.parse(m.mermaid);
  ok('MDFlow.parse 仍接受 defuse 后的源码', !!g, g && g.nodes.length);
}

console.log('\n=== A7. 边界用例 ===');
{
  const regular = [
    '┌──────┐', '│ 起点 │', '└──┬───┘', '   ↓', '┌──────┐', '│ 终点 │', '└──────┘'
  ].join('\n');
  const m1 = A.parse(regular);
  ok('规整四边闭合图：2 节点 1 边', m1.nodes.length === 2 && m1.edges.length === 1, { n: m1.nodes.length, e: m1.edges.length });
  ok('规整图无顶边缺失告警', !/顶边/.test(m1.warnings.join(' ')), m1.warnings);
  const m2 = A.parse(['+-------+', '| Alpha |', '+-------+', '   ↓', '+-------+', '| Beta  |', '+-------+'].join('\n'));
  ok('纯 ASCII 图：2 节点 1 边', m2.nodes.length === 2 && m2.edges.length === 1, { n: m2.nodes.length, e: m2.edges.length });
  const m3 = A.parse(['╔══════╗', '║ 甲模块 ║', '╚══╤═══╝', '   ↓', '╔══════╗', '║ 乙模块 ║', '╚══════╝'].join('\n'));
  ok('双线图：2 节点 1 边', m3.nodes.length === 2 && m3.edges.length === 1, { n: m3.nodes.length, e: m3.edges.length });
  const single = A.parse(['┌──────┐', '│ 独框 │', '└──────┘'].join('\n'));
  ok('单框：1 节点 0 边（convertOne 会拒转）', single.nodes.length === 1 && single.edges.length === 0);
  const nolink = A.parse([
    '┌──────┐', '│ 上层 │', '└──────┘', '┌──────┐', '│ 下层 │', '└──────┘'
  ].join('\n'));
  ok('层间无连线证据 → 不生成边并告警', nolink.edges.length === 0 && /未检测到连线证据/.test(nolink.warnings.join(' ')), nolink.warnings);
  const cjk = A.parse([
    '┌────────────────┐', '│ 全中文标签测试 │', '└────────┬───────┘', '         ↓',
    '┌────────────────┐', '│ 第二个中文节点 │', '└────────────────┘'
  ].join('\n'));
  ok('全中文宽标签：2 节点 1 边', cjk.nodes.length === 2 && cjk.edges.length === 1, { n: cjk.nodes.length, e: cjk.edges.length });
}

/* ==================== B. 浏览器 ==================== */
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 2100 }, acceptDownloads: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/_autoload\.js$/.test(u)) return;
    if (/Failed to load resource/.test(m.text()) && !u) return;
    errs.push('c: ' + m.text() + ' @' + u);
  });
  await p.addInitScript(() => {
    window.__dl = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      try { if (/html|msword|svg/.test(blob.type || '')) window.__dl.push({ type: blob.type, p: blob.text() }); } catch (e) { }
      return orig(blob);
    };
  });
  await p.goto('file:///' + F);
  await p.waitForTimeout(1500);

  const snap = () => p.evaluate(() => {
    const box = document.querySelector('.ad-box');
    const svg = document.querySelector('.ad-box .mf-svg');
    return {
      box: !!box,
      nodes: box ? +box.getAttribute('data-ad-nodes') : -1,
      edges: box ? +box.getAttribute('data-ad-edges') : -1,
      svg: !!svg,
      svgNodes: svg ? svg.querySelectorAll('.mf-node').length : -1,
      svgEdges: svg ? svg.querySelectorAll('.mf-edge').length : -1,
      src: !!document.querySelector('.ad-src'),
      srcText: document.querySelector('.ad-src pre') ? document.querySelector('.ad-src pre').textContent : '',
      meta: document.querySelector('.ad-box .mf-meta') ? document.querySelector('.ad-box .mf-meta').textContent : '',
      tools: !!document.querySelector('.ad-box .mf-tools [data-act="edit"]'),
      /* .ad-src 折叠区里也会有一个 <pre> 存原文，那不算「未被替换的代码块」 */
      rawPre: Array.from(document.querySelectorAll('#content pre')).filter(n => !n.closest('.ad-src')).length,
      pCount: document.querySelectorAll('#content p').length
    };
  });

  console.log('\n=== B1. 正文 <p> 路径（无围栏纯字符画） ===');
  await p.setInputFiles('#filePicker', PLAIN);
  await p.waitForTimeout(2200);
  const s1 = await snap();
  ok('生成 .ad-box 可视化容器', s1.box, s1);
  ok('容器标注 7 节点 / 8 连线', s1.nodes === 7 && s1.edges === 8, s1);
  ok('复用 MDFlow 生成 svg.mf-svg', s1.svg, s1);
  ok('SVG 内 8 个节点（含外部输入）', s1.svgNodes === 8, s1.svgNodes);
  ok('SVG 内 9 条连线', s1.svgEdges === 9, s1.svgEdges);
  ok('原图折叠区 .ad-src 存在', s1.src, s1);
  ok('折叠区内保留原始字符画文字', /syslog_server\.py/.test(s1.srcText) && /┌/.test(s1.srcText));
  ok('工具条 meta 标注「字符架构图识别」', /字符架构图识别/.test(s1.meta), s1.meta);
  ok('复用 MDFlow 编辑按钮', s1.tools, s1);
  ok('原 <p> 已被替换（正文不再糊成一团）', s1.pCount === 0, s1.pCount);

  console.log('\n=== B2. 代码块 <pre><code> 路径 ===');
  await p.setInputFiles('#filePicker', MD);
  await p.waitForTimeout(2200);
  const s2 = await snap();
  ok('代码块路径同样生成 .ad-box', s2.box, s2);
  ok('7 节点 / 8 连线', s2.nodes === 7 && s2.edges === 8, s2);
  ok('SVG 8 节点 9 连线', s2.svgNodes === 8 && s2.svgEdges === 9, s2);
  ok('原图折叠区存在', s2.src, s2);
  ok('原 <pre> 代码块已被替换', s2.rawPre === 0, s2.rawPre);
  ok('标题段落仍在（未误伤普通文本）', s2.pCount >= 1, s2.pCount);

  console.log('\n=== B3. 复用 MDFlow 编辑能力（白拿的五条导出链路） ===');
  await p.click('.ad-box .mf-tools [data-act="edit"]');
  await p.waitForTimeout(250);
  const editing = await p.evaluate(() => ({
    cls: document.querySelector('.ad-box .mf-svg').classList.contains('is-editing'),
    acts: !document.querySelector('.ad-box .mf-edit-actions').hidden,
    editor: !!document.querySelector('.ad-box .mf-editor')
  }));
  ok('编辑态可开启', editing.cls && editing.acts && editing.editor, editing);
  await p.click('.ad-box .mf-edit-actions [data-act="done"]');
  await p.waitForTimeout(200);

  console.log('\n=== B4. 导出 HTML / 打印清理 ===');
  await p.evaluate(() => {
    const btn = document.querySelector('#expMenu button[data-fmt="html"]');
    if (btn) btn.click();
  });
  await p.waitForTimeout(900);
  const exp = await p.evaluate(async () => {
    const x = window.__dl.filter(v => /html/.test(v.type)).pop();
    return x ? await x.p : '';
  });
  ok('导出 HTML 生成', exp.length > 10000, exp.length);
  ok('导出 HTML 含可视化 SVG', /mf-svg/.test(exp));
  ok('导出 HTML 保留 .ad-box 标注', /data-ad-nodes="7"/.test(exp));
  /* 只取流程图主 SVG：导出页里 .chart-types 图标按钮也是 <svg>，
     取「第一个 <svg>」会命中 24×24 图标（不含 var(--mf-)），属取样口径错误。 */
  const svgPart = (() => {
    const i = exp.indexOf('<svg class="mf-svg"'), j = i >= 0 ? exp.indexOf('</svg>', i) : -1;
    return i >= 0 && j > i ? exp.slice(i, j + 6) : '';
  })();
  /* CR-2026-11-15-04：交互导出页保留 var()，换风格时图形跟着变色；
     .mf-modes 保留供单图切结构，编辑动作按钮由 extra CSS 隐藏。 */
  ok('导出 SVG（交互页）保留 var(--mf-) 供换色', svgPart.length > 1000 && /var\(--mf-/.test(svgPart),
    (svgPart.match(/var\(--mf-[^)]*\)/g) || []).slice(0, 8));
  ok('导出 HTML 保留 .mf-modes 供单图切结构', /mf-modes/.test(exp));
  ok('导出 HTML 隐藏编辑动作按钮', /\.mf-tools>button[^}]*display:none!important/.test(exp));
  ok('导出 HTML 含 .ad-src 隐藏规则', /\.ad-src[^{]*\{[^}]*display:none!important/.test(exp) || /\.ad-src,\.ad-warn\{display:none!important\}/.test(exp), exp.slice(exp.indexOf('.ad-src') - 120, exp.indexOf('.ad-src') + 160));
  /* 源码不再泄漏成可见 <pre>，改为仅存于 data-mf-src 属性供导出页预置结构，
     运行时不解析、页面上不可见。ad-raw 是「识别兜底保留原文」的正常内容
     （fixture 里就有），不能拿来当源码泄漏判据。
     严格判据：导出页里每一处 flowchart TD 都必须来自 data-mf-src 属性。 */
  const srcHits = (exp.match(/flowchart TD/g) || []).length;
  const attrHits = (exp.match(/data-mf-src="flowchart TD/g) || []).length;
  ok('源码仅以 data-mf-src 属性留存（不可见）',
    attrHits >= 1 && srcHits === attrHits, { srcHits: srcHits, attrHits: attrHits });
  await p.emulateMedia({ media: 'print' });
  const printHidden = await p.evaluate(() => {
    const n = document.querySelector('.ad-src');
    return n ? getComputedStyle(n).display : 'missing';
  });
  ok('打印 / PDF 隐藏原图折叠区', printHidden === 'none', printHidden);
  await p.emulateMedia({ media: 'screen' });

  console.log('\n=== B5. 不误伤普通文档 / Mermaid 块 ===');
  await p.setInputFiles('#filePicker', path.join(__dirname, '_fixtures', 'flow-modes.md').replace(/\\/g, '/'));
  await p.waitForTimeout(2200);
  const s3 = await p.evaluate(() => ({
    ad: document.querySelectorAll('.ad-box').length,
    mf: document.querySelectorAll('.md-flow-box').length,
    nodes: document.querySelectorAll('.mf-svg .mf-node').length
  }));
  ok('普通 Mermaid 文档不产生 .ad-box', s3.ad === 0, s3);
  ok('Mermaid 块仍正常渲染', s3.mf > 0 && s3.nodes > 0, s3);

  console.log('\n=== B6. 截图对比 ===');
  await p.setInputFiles('#filePicker', MD);
  await p.waitForTimeout(2200);
  const box = await p.locator('.ad-box').first().boundingBox();
  if (box) {
    /* 7 层架构图 SVG viewBox 高约 1182，clip 必须放宽到 >1300 才不会被腰斩 */
    const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1400), height: Math.min(box.height, 1800) };
    await p.screenshot({ path: path.join(SHOTS, 'ascii-after.png'), clip });
    /* before：把识别后的容器临时换成「原文 <pre>」，模拟识别失败时的样子 */
    const raw = await p.evaluate(() => document.querySelector('.ad-src pre').textContent);
    await p.evaluate((arg) => {
      const t = arg[0], h = arg[1];
      const b = document.querySelector('.ad-box');
      b.setAttribute('data-before', '1');
      b.innerHTML = '<div style="font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre;overflow:auto;padding:12px;border:1px dashed #bbb;background:#fafafa;color:#333">' +
        t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';
      b.style.minHeight = h + 'px'; /* 与 after 等高，拼接不露底 */
    }, [raw, Math.ceil(box.height)]);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(SHOTS, 'ascii-before.png'), clip });
    const py = 'from PIL import Image,ImageDraw\n' +
      'a=Image.open(r"' + path.join(SHOTS, 'ascii-before.png') + '").convert("RGB")\n' +
      'b=Image.open(r"' + path.join(SHOTS, 'ascii-after.png') + '").convert("RGB")\n' +
      'h=max(a.height,b.height); W=a.width+b.width+24\n' +
      'o=Image.new("RGB",(W,h+34),(245,246,248)); d=ImageDraw.Draw(o)\n' +
      'o.paste(a,(0,34)); o.paste(b,(a.width+24,34))\n' +
      'd.text((8,9),"BEFORE  raw box-drawing text (recognition failed)",fill=(90,90,90))\n' +
      'd.text((a.width+32,9),"AFTER  auto-recognised editable flowchart",fill=(90,90,90))\n' +
      'o.save(r"' + path.join(SHOTS, 'ascii-compare.png') + '")\n' +
      'print("compare ok",o.size)\n';
    const r = spawnSync('python', ['-c', py], { encoding: 'utf8' });
    ok('生成编辑前后对比图', /compare ok/.test(r.stdout || ''), (r.stderr || '').slice(0, 200));
  } else ok('生成编辑前后对比图', false, 'no .ad-box boundingBox');

  console.log('\n=== B7. 零 JS 异常 ===');
  ok('全流程零 JS 异常', errs.length === 0, errs.slice(0, 5));

  await b.close();
  console.log('\n========================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
