/* Node 单元回归：文本流程图解析、范式提示、语义校验、附加组件（纯函数部分） */
const assert = require('assert');
require('../src/mermaid-flow.js');          // 提供 global.MDFlow.parse
const TF = require('../src/text-flow.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const HINT = [
  '@//md-render-hint/',
  '# 范式类型：GATE-PIPELINE + HETEROGENEOUS-STATE-MACHINE',
  '# 范式释义：串行门禁流水线 + 同事件异构分流状态子机',
  '# 布局模式：LR（横向） / TD（纵向）',
  '#   GROUP-MAIN 填充色：#e8f8f0 描边 #239955',
  '#   GROUP-SUB 填充色：#fff6e0 描边 #dd9922',
  '# 语义校验开关：ON，渲染前自动检查是否违反范式约束并输出警告',
  '#   1. 状态单向流转，禁止终态回退连线',
  '#   2. 同一父节点下，确认/驳回/超时 互斥分支，不允许合并回待审',
  '#   3. WARN告警 = 软门禁旁路；FAIL = 硬隔离，不可直通下一阶段',
  '#   4. 重试节点必须标注重试次数+间隔，重试终点为留痕终态',
  '@//end-md-render-hint/'
].join('\n');

const FLOW = [
  '@main LR',
  '([导入]) --> [预校验门禁] --> [任务执行] --> {人工裁决} --> ![归档]',
  '[预校验门禁] -- WARN 放行 --> ![留痕告警]',
  '[预校验门禁] -- FAIL --> ![硬隔离]',
  '[任务执行] -- 重试 3 次 / 间隔 5m --> [重试队列] --> ![重试留痕终态]',
  '![归档] --> [预校验门禁] // 故意保留一条终态回退，用于演示违规标红',
  '@sub',
  '{人工裁决} -. 依赖触发 .-> [分类路由]',
  '[分类路由] -- 确认 --> ![通过归档]',
  '[分类路由] -- 驳回 --> ![驳回留痕]',
  '[分类路由] -- SLA超时 --> ![超时升级]'
].join('\n');

console.log('\n[1] 范式提示块解析');
const hint = TF.parseHint('# 标题\n\n' + HINT + '\n\n正文');
ok('从 Markdown 中剥离提示块', !hint.text.includes('md-render-hint') && hint.text.includes('# 标题') && hint.text.includes('正文'));
ok('占位符已注入', hint.text.includes('data-tf-hint="1"'));
ok('范式类型与释义', hint.cfg.paradigm.includes('GATE-PIPELINE') && hint.cfg.paradigmCN.includes('门禁流水线'));
ok('布局方向 LR', hint.cfg.dir === 'LR', hint.cfg.dir);
ok('主线 / 分流配色', hint.cfg.main.fill === '#e8f8f0' && hint.cfg.main.stroke === '#239955' &&
  hint.cfg.sub.fill === '#fff6e0' && hint.cfg.sub.stroke === '#dd9922');
ok('语义校验 ON 且 4 条规则', hint.cfg.semantic === true && hint.cfg.rules.length === 4, hint.cfg.rules);
ok('未带提示块时回落默认范式', TF.parseHint('# A\n正文').cfg.paradigm === TF.DEFAULT.paradigm);
ok('支持 HTML 注释形式提示块', TF.parseHint('<!-- md-render-hint\n# 布局模式：TD\n-->').cfg.dir === 'TD');
ok('语义校验 OFF 可关闭', TF.parseHint('@//md-render-hint/\n# 语义校验开关：OFF\n@//end-md-render-hint/').cfg.semantic === false);

console.log('\n[2] 符号空格文本 → Mermaid 源码');
const model = TF.toMermaid(FLOW, hint.cfg);
console.log('  mermaid =\n' + model.mermaid.split('\n').map(x => '    ' + x).join('\n'));
ok('生成 flowchart LR 头', /^flowchart LR\n/.test(model.mermaid));
ok('节点去重且编号连续', model.count >= 10 && Object.keys(model.nodes).every(id => /^N\d+$/.test(id)), model.count);
ok('形状识别齐全', ['stadium', 'rect', 'diamond', 'subroutine'].every(s =>
  Object.keys(model.nodes).some(id => model.nodes[id].shape === s)) ||
  ['stadium', 'rect', 'diamond'].every(s => Object.keys(model.nodes).some(id => model.nodes[id].shape === s)));
ok('起止胶囊 / 判断 / 处理框都在', Object.keys(model.nodes).some(id => model.nodes[id].label === '导入' && model.nodes[id].shape === 'stadium') &&
  Object.keys(model.nodes).some(id => model.nodes[id].label === '人工裁决' && model.nodes[id].shape === 'diamond'));
ok('终态 ! 标记生效', Object.keys(model.nodes).filter(id => model.nodes[id].terminal).length >= 5);
ok('@main / @sub 分组', Object.keys(model.nodes).some(id => model.nodes[id].group === 'main') &&
  Object.keys(model.nodes).some(id => model.nodes[id].group === 'sub'));
ok('主线与分流共享触发节点（虚线从主线出发）',
  Object.keys(model.nodes).filter(id => model.nodes[id].label === '人工裁决').length === 1 &&
  model.mermaid.includes('-. 依赖触发 .->'));
ok('行尾 // 备注写入节点', Object.keys(model.nodes).some(id => /违规标红/.test(model.nodes[id].note)));
ok('@sub 方向覆盖', TF.toMermaid('@sub TD\n[A] --> [B]', hint.cfg).dir === 'TD');
const g = global.MDFlow.parse(model.mermaid);
ok('MDFlow 可解析生成的源码', !!g && g.nodes.length === model.count && g.edges.length >= 10,
  g ? { nodes: g.nodes.length, edges: g.edges.length } : null);
ok('边标签被保留', !!g && g.edges.some(e => /WARN|FAIL|确认|驳回|SLA超时|重试 3 次/.test(e.label || '')),
  g ? g.edges.map(e => e.label).filter(Boolean) : null);
ok('虚线依赖边被保留', !!g && g.edges.some(e => e.dashed));

console.log('\n[3] 语义校验（4 条强约束）');
const info = TF.analyze(model, hint.cfg);
console.log('  warnings =', JSON.stringify(info.warnings));
ok('检出终态回退违规并标红', Object.keys(info.bad).length >= 1 &&
  info.warnings.some(w => /规则 1/.test(w)));
ok('校验报告非空', info.warnings.length >= 1);
const offCfg = Object.assign({}, hint.cfg, { semantic: false });
ok('开关 OFF 时跳过约束检查', TF.analyze(model, offCfg).warnings.some(w => /OFF/.test(w)) &&
  Object.keys(TF.analyze(model, offCfg).bad).length === 0);
const clean = TF.toMermaid([
  '@main LR',
  '([导入]) --> [门禁] --> ![归档]',
  '[门禁] -- WARN 放行 --> ![留痕]',
  '[门禁] -- FAIL --> ![硬隔离]'
].join('\n'), hint.cfg);
const cleanInfo = TF.analyze(clean, hint.cfg);
ok('合规图零违规', Object.keys(cleanInfo.bad).length === 0, cleanInfo.warnings);

const bad2 = TF.toMermaid([
  '@main LR',
  '[待审] -- 确认 --> [通过]',
  '[待审] -- 驳回 --> [通过]'
].join('\n'), hint.cfg);
ok('规则 2 检出互斥分支合并', TF.analyze(bad2, hint.cfg).warnings.some(w => /规则 2/.test(w)));
const bad3 = TF.toMermaid('@main LR\n[门禁] -- FAIL --> [任务执行]', hint.cfg);
ok('规则 3 检出 FAIL 直通', TF.analyze(bad3, hint.cfg).warnings.some(w => /规则 3/.test(w)));
const bad4 = TF.toMermaid('@main LR\n[门禁] --> [重试队列] --> [普通节点]', hint.cfg);
ok('规则 4 检出重试未标注 / 终点非留痕',
  TF.analyze(bad4, hint.cfg).warnings.filter(w => /规则 4/.test(w)).length >= 1);

console.log('\n[4] 附加组件与导出说明文本');
const extra = TF.extrasHTML(model, info, hint.cfg);
ok('图例含两组配色与线型', extra.includes('#e8f8f0') && extra.includes('#fff6e0') &&
  extra.includes('实线：强制流转') && extra.includes('虚线：依赖触发'));
ok('状态矩阵附表含节点行', extra.includes('tf-matrix-table') && extra.includes('GROUP-SUB') && extra.includes('留痕终态'));
ok('文件输出清单', extra.includes('文件输出清单') && extra.includes('流程图.svg'));
ok('语义校验报告', extra.includes('语义校验：ON') && extra.includes('发现'));
const notes = TF.notesText(model, info, hint.cfg);
ok('说明文本含范式 / 节点 / 连线 / 规则 / 报告',
  ['范式类型', '节点清单', '连线清单', '范式强约束', '语义校验报告', '文件输出清单'].every(k => notes.includes(k)));

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
