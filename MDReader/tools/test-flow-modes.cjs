/* MD FLOW 结构布局回归：五种结构的几何合法性（越界 / 重叠 / 路径完整 / 自动选型走偏）
   新增结构布局时先跑这一支，它不依赖浏览器。 */
const MF = require('../src/mermaid-flow.js');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

const pipe = `flowchart LR
A[提交申请] --> B{材料齐全?}
B -->|是| C[进入初审]
B -->|否| D[退回补正]
C --> E[复核]
D --> A
E --> F[归档]`;

const tree = `flowchart TD
ROOT[产品规划]
ROOT --> A[用户研究]
ROOT --> B[功能设计]
ROOT --> C[技术方案]
A --> A1[访谈]
A --> A2[问卷]
B --> B1[信息架构]
B --> B2[交互原型]
C --> C1[架构评审]
C --> C2[容量评估]
A1 --> A11[定性分析]
A2 --> A21[定量统计]`;

const org = `flowchart TD
CEO[总经理]
CEO --> CTO[技术副总]
CEO --> CFO[财务副总]
CEO --> COO[运营副总]
CTO --> D1[研发部]
CTO --> D2[测试部]
CFO --> D3[会计部]
COO --> D4[客服部]`;

for (const [name, src, mode, expect] of [
  ['pipeline', pipe, 'pipeline', 'pipeline'],
  ['mindmap', tree, 'mindmap', 'mindmap'],
  ['org', org, 'org', 'org'],
  ['timeline', pipe, 'timeline', 'timeline'],
  ['auto→树', tree, 'auto', 'mindmap'],
  ['auto→流水', pipe, 'auto', 'pipeline'],
]) {
  MF.setMode(mode);
  const g = MF.parse(src);
  if (!g) { console.log(`\n=== ${name} ===\n  FAIL 解析失败`); fail++; continue; }
  const L = MF.layout(g);
  const svg = MF.buildSVG(g, L);
  console.log(`\n=== ${name} (mode=${mode}) ===`);
  ok(`结构 = ${expect}`, L.mode === expect, L.mode);
  ok('SVG 生成', /^<svg/.test(svg.trim()), svg.slice(0, 40));
  ok('画布尺寸有效', L.W > 200 && L.H > 150, { W: L.W, H: L.H });
  // 节点不越界
  const oob = g.nodes.filter(n => n.x < -1 || n.y < -1 || n.x + n.w > L.W + 1 || n.y + n.h > L.H + 1);
  ok('节点全在画布内', oob.length === 0, oob.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })));
  // 节点不重叠（允许 1px 容差）
  let ov = 0;
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) {
    const a = g.nodes[i], b = g.nodes[j];
    if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) ov++;
  }
  ok('节点无重叠', ov === 0, ov);
  // 所有节点都有坐标
  ok('节点坐标完整', g.nodes.every(n => isFinite(n.x) && isFinite(n.y)), null);
  // 边都有 path
  ok('连线路径完整', g.edges.every(e => e.path && e.path.length > 5), g.edges.filter(e => !e.path).length);
}
console.log('\n' + '='.repeat(42) + `\n${pass} 通过 / ${fail} 失败\n` + '='.repeat(42));
process.exit(fail ? 1 : 0);
