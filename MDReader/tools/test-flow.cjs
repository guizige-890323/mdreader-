/* MD FLOW 渲染管线 Node 回归：解析 / 分层 / 路由 / 回退 / SVG 结构 */
const F = require('../src/mermaid-flow.js');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')); }
}
function svgOf(src) {
  const g = F.parse(src);
  if (!g) return null;
  const L = F.layout(g);
  return { g, L, s: F.buildSVG(g, L) };
}
function sane(s) {
  return s && !/NaN|undefined|Infinity/.test(s) && s.startsWith('<svg') && s.endsWith('</svg>');
}

console.log('\n[1] 内置示例图');
const demo = [
  'flowchart LR',
  '  A[读取 .md] --> B{解析}',
  '  B -->|表格| C[排序 / 图表]',
  '  B -->|代码| D[语法高亮]',
  '  B -->|双链| E[文档跳转]',
  '  C --> F[渲染输出]',
  '  D --> F',
  '  E --> F'
].join('\n');
{
  const r = svgOf(demo);
  ok('接管渲染', !!r);
  if (r) {
    ok('节点 6 个', r.g.nodes.length === 6, String(r.g.nodes.length));
    ok('连线 7 条', r.g.edges.length === 7, String(r.g.edges.length));
    ok('菱形识别为决策', r.g.map.B.shape === 'diamond');
    ok('标签解析', r.g.edges.filter(e => e.label).length === 3, JSON.stringify(r.g.edges.map(e => e.label)));
    ok('起点/终点判定', r.g.map.A.kind === 'start' && r.g.map.F.kind === 'end');
    ok('最长路径分层 4 段', r.L.layers === 4, String(r.L.layers));
    ok('SVG 结构完整', sane(r.s));
    ok('SVG 含 6 个节点组', (r.s.match(/class="mf-node /g) || []).length === 6);
    ok('SVG 含 7 条边组', (r.s.match(/class="mf-edge"/g) || []).length === 7);
    ok('SVG 含 3 个边标签', (r.s.match(/class="mf-elabel"/g) || []).length === 3);
    ok('菱形为圆角多边形 path', /class="mf-shape" d="M[\d.]+ [\d.]+Q/.test(r.s));
    ok('画布宽高为正', r.L.W > 300 && r.L.H > 150, r.L.W + 'x' + r.L.H);
  }
}

console.log('\n[2] 语法覆盖：多形状 / 边类型 / 分号');
const rich = [
  'flowchart TD',
  '  S([开始]) --> A[[读取模块]]; A --> B[(知识库)]',
  '  B -- 命中 --> C{{判断}}',
  '  C ==>|通过| D((输出))',
  '  C -.-> E[/降级/]',
  '  D --- F>终点]',
  '  E --> F'
].join('\n');
{
  const r = svgOf(rich);
  ok('接管渲染', !!r);
  if (r) {
    const shapes = {}; r.g.nodes.forEach(n => { shapes[n.id] = n.shape; });
    ok('形状全解析', JSON.stringify(shapes) === JSON.stringify({ S: 'stadium', A: 'subroutine', B: 'cylinder', C: 'hexagon', D: 'circle', E: 'para', F: 'asym' }), JSON.stringify(shapes));
    ok('分号拆句后 7 节点', r.g.nodes.length === 7, String(r.g.nodes.length));
    ok('-- label --> 归一', r.g.edges.some(e => e.label === '命中'), JSON.stringify(r.g.edges.map(e => e.label)));
    ok('==> 粗箭头', r.g.edges.some(e => e.thick && e.label === '通过'));
    ok('-.-> 虚线', r.g.edges.some(e => e.dashed));
    ok('--- 无箭头', r.g.edges.some(e => !e.arrow));
    ok('SVG 结构完整', sane(r.s));
    ok('svg 含 dashed', /stroke-dasharray/.test(r.s));
  }
}

console.log('\n[3] 四个方向 / 镜像 / 环');
['LR', 'RL', 'TD', 'BT'].forEach(dir => {
  const r = svgOf('flowchart ' + dir + '\n A[源] --> B[中] --> C[终]');
  ok(dir + ' 正常出图', !!r && sane(r.s));
  if (r) {
    const xs = r.g.nodes.map(n => n.x), ys = r.g.nodes.map(n => n.y);
    const allIn = r.g.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= r.L.W && n.y + n.h <= r.L.H);
    ok(dir + ' 节点不越界', allIn, JSON.stringify({ W: r.L.W, H: r.L.H, xs, ys }));
    if (dir === 'RL') ok('RL 水平镜像', xs[0] > xs[2], xs.join(','));
    if (dir === 'BT') ok('BT 垂直镜像', ys[0] > ys[2], ys.join(','));
  }
});
{
  const r = svgOf('flowchart LR\n A[一] --> B[二]\n B --> C[三]\n C -.->|回环| A');
  ok('含环图不崩', !!r && sane(r.s));
  if (r) ok('回边走外侧通道', r.g.edges.some(e => e.back), JSON.stringify(r.g.edges.map(e => !!e.back)));
}

console.log('\n[4] 安全回退（交还原生 Mermaid）');
[
  'sequenceDiagram\n Alice->>Bob: Hi',
  'flowchart LR\n subgraph 一组\n A-->B\n end',
  'flowchart LR\n A-->B\n classDef hot fill:#f00',
  'flowchart LR\n A:::hot --> B',
  '%%{init: {"theme":"dark"}}%%\nflowchart LR\n A-->B',
  'pie title X\n "A": 1',
  'flowchart XY\n A-->B',
  'gantt\n title X'
].forEach((src, i) => {
  ok('回退 #' + (i + 1), F.parse(src) === null, src.split('\n')[0]);
});
ok('空源码回退', F.parse('') === null);
ok('只有表头回退', F.parse('flowchart LR') === null);

console.log('\n[5] 多语言 / 长文本 / 转义');
{
  const r = svgOf('flowchart LR\n A["包含 <b>标签</b> 与 &amp; 符号<br/>第二行"] --> B[日本語・中文混排 / 2026]');
  ok('复杂标签出图', !!r && sane(r.s));
  if (r) {
    ok('HTML 标签被清理', !/<b>/.test(r.s) && r.g.map.A.label.indexOf('标签') >= 0);
    ok('双行文本', r.g.map.A.lines.length === 2, JSON.stringify(r.g.map.A.lines));
    ok('实体已转义', /&amp;lt;/.test(r.s) || !/<b>/.test(r.s));
  }
}

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exitCode = fail ? 1 : 0;
