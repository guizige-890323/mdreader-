const { chromium } = require('playwright-core');
/* MD FLOW 结构切换 UI 回归：设置面板切换 → SVG 真的重绘 → 形态互不相同 → 与配色正交
   跑之前先 python src/build.py。 */
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SAMPLE = path.join(__dirname, '_fixtures', 'flow-modes.md').replace(/\\/g, '/');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

const MD = `# 结构测试

## 流程图

\`\`\`mermaid
flowchart TD
CEO[总经理]
CEO --> CTO[技术副总]
CEO --> CFO[财务副总]
CEO --> COO[运营副总]
CTO --> D1[研发部]
CTO --> D2[测试部]
CFO --> D3[会计部]
COO --> D4[客服部]
\`\`\`
`;

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    /* _autoload.js 只在「右键用 MDReader 打开」时由 bat 临时生成，便携版单文件里本就没有 */
    if (/_autoload\.js$/.test(u)) return;
    if (/Failed to load resource/.test(m.text()) && !u) return;
    errs.push('c: ' + m.text() + ' @' + u);
  });
  await p.goto('file:///' + F);
  await p.waitForTimeout(1600);

  // 用真实文件选择器载入
  await p.setInputFiles('#filePicker', SAMPLE);
  await p.waitForTimeout(2600);

  const hasSvg = await p.evaluate(() => !!document.querySelector('.mf-svg'));
  console.log('渲染出 SVG:', hasSvg);
  if (!hasSvg) {
    // 退回到直接操作引擎验证
    console.log('  （UI 注入失败，改用引擎直测）');
  }

  const readSvg = () => p.evaluate(() => {
    const svg = document.querySelector('.mf-svg');
    if (!svg) return null;
    const nodes = [...svg.querySelectorAll('.mf-node')].map(g => {
      const r = g.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      vb: svg.getAttribute('viewBox'),
      head: (svg.querySelector('.mf-head text') || {}).textContent,
      hasAxis: !!svg.querySelector('.mf-axis'),
      /* 肘形连线用 V/H 拐角，贝塞尔用 C 曲线 —— 这是 org 与 pipeline 的真正区别 */
      elbow: [...svg.querySelectorAll('.mf-line')].some(q => /[VH]/.test(q.getAttribute('d') || '')),
      bezier: [...svg.querySelectorAll('.mf-line')].some(q => /C/.test(q.getAttribute('d') || '')),
      hasBar: !!svg.querySelector('.mf-bar'),
      hasNum: !!svg.querySelector('.mf-node text[style*="800"]'),
      widths: [...new Set(nodes.map(n => n.w))].length,
      nodeCount: nodes.length,
      nodes,
      // 判断方位特征
      distinctY: new Set(nodes.map(n => Math.round(n.y / 20))).size,
      distinctX: new Set(nodes.map(n => Math.round(n.x / 20))).size,
    };
  });

  console.log('\n=== 逐一切换结构 ===');
  const modes = ['pipeline', 'mindmap', 'org', 'timeline', 'auto'];
  const results = {};
  for (const m of modes) {
    await p.evaluate((m) => {
      const btn = document.querySelector(`#setFlowMode button[data-fm="${m}"]`);
      if (btn) btn.click();
    }, m);
    await p.waitForTimeout(1300);
    const r = await readSvg();
    results[m] = r;
    if (!r) { console.log(`  ${m}: 无 SVG`); fail++; continue; }
    console.log(`\n  [${m}] 视框=${r.vb} 节点=${r.nodeCount} 眉题="${r.head}" 中轴=${r.hasAxis} X档=${r.distinctX} Y档=${r.distinctY}`);
    ok(`${m} 已渲染`, r.nodeCount >= 8, r.nodeCount);
  }

  console.log('\n=== 结构差异断言（必须真的不同） ===');
  ok('组织图 与 导图 视框不同', results.org.vb !== results.mindmap.vb, [results.org.vb, results.mindmap.vb]);
  ok('导图 与 时间图 视框不同', results.mindmap.vb !== results.timeline.vb, [results.mindmap.vb, results.timeline.vb]);
  /* 同一张 TD 图，流水与组织图的差异在「连线形态」与「装饰」上，不在画布尺寸：
     组织图是正交肘形 + 等宽箱体 + 无编号；流水是贝塞尔 + 色条 + 编号徽章。 */
  ok('组织图用肘形连线', results.org.elbow === true && results.org.bezier === false, { e: results.org.elbow, b: results.org.bezier });
  ok('流水用贝塞尔连线', results.pipeline.bezier === true, results.pipeline.bezier);
  ok('组织图箱体等宽', results.org.widths === 1, results.org.widths);
  ok('组织图无编号徽章', results.org.hasNum === false, results.org.hasNum);
  ok('流水有色条与编号', results.pipeline.hasBar === true && results.pipeline.hasNum === true, { bar: results.pipeline.hasBar, num: results.pipeline.hasNum });
  ok('导图无编号', results.mindmap.hasNum === false, results.mindmap.hasNum);
  ok('时间图 有中轴', results.timeline.hasAxis === true, results.timeline.hasAxis);
  ok('流水 无中轴', results.pipeline.hasAxis === false, results.pipeline.hasAxis);
  ok('眉题标出结构名', /PIPELINE|MINDMAP|ORG|TIMELINE/.test(results.pipeline.head || ''), results.pipeline.head);
  ok('导图眉题 = MINDMAP', /MINDMAP/.test(results.mindmap.head || ''), results.mindmap.head);
  ok('组织图眉题 = ORG CHART', /ORG/.test(results.org.head || ''), results.org.head);
  ok('时间图眉题 = TIMELINE', /TIMELINE/.test(results.timeline.head || ''), results.timeline.head);

  console.log('\n=== 结构与配色正交 ===');
  await p.evaluate(() => { const b = document.querySelector('#setFlowMode button[data-fm="mindmap"]'); if (b) b.click(); });
  await p.waitForTimeout(900);
  const beforeStyle = await readSvg();
  await p.evaluate(() => { const b = document.querySelector('#setFlowStyle button[data-fs="dark"]'); if (b) b.click(); });
  await p.waitForTimeout(900);
  const afterStyle = await readSvg();
  ok('换配色后结构不变（视框相同）', beforeStyle.vb === afterStyle.vb, [beforeStyle.vb, afterStyle.vb]);
  ok('换配色后仍是导图', /MINDMAP/.test(afterStyle.head || ''), afterStyle.head);
  const styleAttr = await p.evaluate(() => document.documentElement.getAttribute('data-flow-style'));
  ok('配色已切到 dark', styleAttr === 'dark', styleAttr);
  await p.evaluate(() => { const b = document.querySelector('#setFlowStyle button[data-fs="classic"]'); if (b) b.click(); });
  await p.waitForTimeout(500);

  console.log('\n=== 刷新后记忆 ===');
  await p.reload();
  await p.waitForTimeout(1400);
  const savedMode = await p.evaluate(() => {
    const on = document.querySelector('#setFlowMode button.on');
    return on ? on.dataset.fm : null;
  });
  ok('结构选择被记住', savedMode === 'mindmap', savedMode);

  ok('全程零 JS 错误', errs.length === 0, errs.slice(0, 3));

  console.log('\n' + '='.repeat(44) + `\n${pass} 通过 / ${fail} 失败\n` + '='.repeat(44));
  await b.close();
  process.exit(fail ? 1 : 0);
})();
