/* MD FLOW 可视化编辑回归：
   A. 纯 Node —— transformPath 端点位移插值、toMermaid 编辑后源码
   B. 浏览器 —— 拖拽 / 节点可视化编辑 / 状态回放 / 「最后编辑状态」导出
   跑之前先 python src/build.py。 */
const { chromium } = require('playwright-core');
const MF = require('../src/mermaid-flow.js');
const path = require('path');
const D = path.resolve(__dirname, '..');
const F = path.join(D, 'dist', 'MDReader.html').replace(/\\/g, '/');
const SAMPLE = path.join(__dirname, '_fixtures', 'flow-modes.md').replace(/\\/g, '/');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MARK = 'EDITED_LABEL_XYZ';
let pass = 0, fail = 0;
/* Playwright 关浏览器时偶发抛出 TargetClosedError（内部清理竞态，与断言无关） */
process.on('unhandledRejection', e => {
  if (!/TargetClosedError|Target page, context or browser has been closed/.test(String(e)))
    console.error('UNHANDLED', e);
});
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1.5 : e);
const nums = s => (String(s).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number);

/* ==================== A. 纯 Node ==================== */
console.log('\n=== A1. transformPath：端点严格跟随、中间按 t 插值 ===');
{
  const r = MF.transformPath('M0 0 L100 0', { x: 10, y: 20 }, { x: 30, y: 40 });
  const n = nums(r);
  ok('直线保留 M/L 命令', /^M[^A-Za-z]*L/.test(r), r);
  ok('直线起点严格跟随 from 节点位移', n[0] === 10 && n[1] === 20, n);
  ok('直线终点严格跟随 to 节点位移', n[2] === 130 && n[3] === 40, n);
}
{
  const r = MF.transformPath('M0 0 C30 0 70 100 100 100', { x: 10, y: 0 }, { x: 0, y: 50 });
  const n = nums(r);
  ok('贝塞尔保留 C 命令且控制点仍是 3 组', /C/.test(r) && n.length === 8, { r, n });
  ok('贝塞尔起点 = 原点 + from 位移', n[0] === 10 && n[1] === 0, n);
  ok('贝塞尔终点 = 原点 + to 位移', n[6] === 100 && n[7] === 150, n);
  ok('贝塞尔控制点按 t=1/3、2/3 线性插值',
    near(n[2], 36.7, .2) && near(n[3], 16.7, .2) && near(n[4], 73.3, .2) && near(n[5], 133.3, .2), n);
}
{
  const r = MF.transformPath('M10 20 V50 H80 V90', { x: 5, y: 7 }, { x: -5, y: 13 });
  const n = nums(r);
  ok('肘形连线保留 V/H 命令（不被改写成贝塞尔）', /V/.test(r) && /H/.test(r) && !/C/.test(r), r);
  ok('肘形起点跟随 from（M 15 27）', n[0] === 15 && n[1] === 27, n);
  ok('肘形终点跟随 to（末个 V = 103）', n[n.length - 1] === 103, n);
}
{
  /* 组织图肘形 `M x1 y1 V midY H x2 V y2`：H 决定终点 x。
     只拖动 from 时终点必须纹丝不动，否则连线会脱离 to 节点。 */
  const r = MF.transformPath('M10 20 V50 H80 V90', { x: 60, y: 36 }, { x: 0, y: 0 });
  const n = nums(r);
  ok('肘形线：只拖 from 时终点 x 仍锚定 to 节点', n[3] === 80, { r, n });
  ok('肘形线：只拖 from 时终点 y 仍锚定 to 节点', n[4] === 90, { r, n });
}
{
  const d0 = 'M12.3 45.6 L78.9 12.3';
  const r = MF.transformPath(d0, { x: 0, y: 0 }, { x: 0, y: 0 });
  ok('零位移是恒等变换', nums(r).join(',') === nums(d0).join(','), { r, d0 });
}
{
  const d0 = 'M0 0 L100 0';
  const once = MF.transformPath(d0, { x: 20, y: 10 }, { x: 40, y: 30 });
  const twice = MF.transformPath(
    MF.transformPath(d0, { x: 10, y: 5 }, { x: 20, y: 15 }),
    { x: 10, y: 5 }, { x: 20, y: 15 });
  ok('每次基于原始 d0 重算，重复拖动不累积误差', nums(once).join(',') === nums(twice).join(','), { once, twice });
}

console.log('\n=== A2. toMermaid：编辑后源码保真 ===');
{
  const src = 'flowchart LR\nA[提交申请] --> B{材料齐全?}\nB -->|是| C[进入初审]\nB -->|否| D[退回补正]';
  const st = {
    content: {
      labels: { A: '已改名' }, colors: { A: '#dc2626' },
      removed: ['D'], removedEdges: ['A>B'],
      addedNodes: [{ id: 'N1', label: '新节点', color: '#2563eb', x: 0, y: 0, w: 120, h: 54 }],
      addedEdges: [{ from: 'C', to: 'N1', label: '' }]
    }, pos: {}
  };
  const out = MF.toMermaid(src, st);
  ok('保留原方向头 flowchart LR', /^flowchart LR/.test(out), out.slice(0, 40));
  ok('写入编辑后的节点文字', /A\["已改名"\]/.test(out), out);
  ok('保留菱形形状（不退化成方箱）', /B\{"材料齐全\?"\}/.test(out), out);
  ok('保留原有边标签 |是|', /\|是\|/.test(out), out);
  ok('被删节点不再出现', !/\bD\[/.test(out), out);
  ok('被删边不再出现', !/A --> B/.test(out), out);
  ok('被删节点的关联边不再出现', !/B -->\|否\| D/.test(out), out);
  ok('写入新增节点', /N1\["新节点"\]/.test(out), out);
  ok('写入新增连线', /C --> N1/.test(out), out);
}

/* ==================== B. 浏览器 ==================== */
(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/_autoload\.js$/.test(u)) return;            /* 便携版预期 404 */
    if (/Failed to load resource/.test(m.text()) && !u) return;
    errs.push('c: ' + m.text() + ' @' + u);
  });
  /* 捕获 exportHTML / exportWord / 下载 SVG 生成的 Blob 文本 */
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
  await p.setInputFiles('#filePicker', SAMPLE);
  await p.waitForTimeout(2400);

  const readBlob = async (re) => p.evaluate(async (r) => {
    const x = window.__dl.filter(v => new RegExp(r).test(v.type)).pop();
    return x ? await x.p : '';
  }, re.source);

  console.log('\n=== B1. 初始渲染与编辑器挂载 ===');
  const base = await p.evaluate(() => {
    const svg = document.querySelector('.mf-svg');
    return {
      svg: !!svg,
      nodes: document.querySelectorAll('.mf-svg .mf-node').length,
      edges: document.querySelectorAll('.mf-svg .mf-edge').length,
      editBtn: !!document.querySelector('.mf-tools [data-act="edit"]'),
      actsHidden: document.querySelector('.mf-edit-actions').hidden,
      actCount: document.querySelectorAll('.mf-edit-actions button').length,
      ctx: !!(svg && svg.__mfEdit),
      d0: document.querySelectorAll('.mf-svg .mf-edge[data-d0]').length,
      dkey: document.querySelectorAll('.mf-svg .mf-edge[data-key]').length,
      ls: !!window.localStorage,
      meta: (document.querySelector('.mf-meta') || {}).textContent || ''
    };
  });
  ok('渲染出 SVG', base.svg);
  ok('8 个节点 / 7 条连线（fixture 真实规模）', base.nodes === 8 && base.edges === 7, base);
  ok('工具条出现「✎ 编辑」按钮', base.editBtn);
  ok('编辑动作组初始隐藏', base.actsHidden);
  ok('编辑动作组含 5 个按钮（加节点/连线/撤销/重置/完成）', base.actCount === 5, base.actCount);
  ok('每个 SVG 挂上编辑上下文 __mfEdit', base.ctx);
  ok('每条边预置 data-d0（拖拽基准路径）', base.d0 === 7, base.d0);
  ok('每条边预置 data-key', base.dkey === 7, base.dkey);
  ok('localStorage 可用（编辑状态持久化前提）', base.ls);
  ok('工具条提示可拖拽编辑', /可拖拽编辑/.test(base.meta), base.meta);

  console.log('\n=== B2. applyAll 重建 DOM 后悬停高亮仍生效（事件委托） ===');
  await p.hover('.mf-svg .mf-node');
  const hov1 = await p.evaluate(() => document.querySelector('.mf-svg').classList.contains('has-focus'));
  ok('重建后的节点仍能触发路径高亮', hov1 === true);
  await p.mouse.move(3, 3);
  await p.waitForTimeout(80);
  const hov2 = await p.evaluate(() => document.querySelector('.mf-svg').classList.contains('has-focus'));
  ok('移出画布后高亮清除', hov2 === false);

  console.log('\n=== B3. 进入编辑态 ===');
  await p.click('.mf-tools [data-act="edit"]');
  const ed = await p.evaluate(() => ({
    editing: document.querySelector('.mf-svg').classList.contains('is-editing'),
    label: document.querySelector('.mf-tools [data-act="edit"]').textContent,
    actsHidden: document.querySelector('.mf-edit-actions').hidden,
    focus: document.querySelector('.mf-svg').classList.contains('has-focus')
  }));
  ok('svg 进入 is-editing', ed.editing);
  ok('按钮变为「✓ 编辑中」', /编辑中/.test(ed.label), ed.label);
  ok('编辑动作组展开', ed.actsHidden === false);
  ok('进入编辑态即清除悬停高亮', ed.focus === false);

  /* 编辑前的 Word 导出，用于后面证明「最后编辑状态」确实被栅格化 */
  await p.click('#btnExport');
  await p.click('#expMenu [data-fmt="word"]');
  await p.waitForFunction(() => window.__dl.some(v => /msword/.test(v.type)), null, { timeout: 20000 });
  const wordBefore = await readBlob(/msword/);
  const pngOf = s => { const m = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(s); return m ? m[1] : ''; };
  ok('编辑前 Word 导出含流程图 PNG', !!pngOf(wordBefore), wordBefore.length);

  console.log('\n=== B4. 拖拽节点 + 连线实时跟随（真实 SVG 几何采样） ===');
  const geoBefore = await p.evaluate(() => {
    const svg = document.querySelector('.mf-svg'), ctx = svg.__mfEdit;
    const n = svg.querySelector('.mf-node'), id = n.getAttribute('data-id');
    const e = ctx.edges.find(x => x.getAttribute('data-from') === id);
    return { id: id, d0: e.getAttribute('data-d0'), transform: n.getAttribute('transform') || '' };
  });
  const box = await p.locator('.mf-svg .mf-node').first().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 50, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(160);
  const drag = await p.evaluate((id) => {
    const svg = document.querySelector('.mf-svg'), ctx = svg.__mfEdit;
    const n = [...svg.querySelectorAll('.mf-node')].find(x => x.getAttribute('data-id') === id);
    const e = ctx.edges.find(x => x.getAttribute('data-from') === id);
    function ends(d) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('style', 'position:absolute;left:-99999px;width:1px;height:1px');
      const q = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      q.setAttribute('d', d); s.appendChild(q); document.body.appendChild(s);
      const L = q.getTotalLength(), a = q.getPointAtLength(0), z = q.getPointAtLength(L);
      s.remove(); return { a: { x: a.x, y: a.y }, z: { x: z.x, y: z.y } };
    }
    const b = ctx.base[id], c = ctx.cur[id];
    const p0 = ends(e.getAttribute('data-d0')), p1 = ends(e.querySelector('.mf-line').getAttribute('d'));
    const paths = [...e.querySelectorAll('path')].map(x => x.getAttribute('d'));
    return {
      transform: n.getAttribute('transform') || '',
      delta: { x: c.x - b.x, y: c.y - b.y },
      startDelta: { x: p1.a.x - p0.a.x, y: p1.a.y - p0.a.y },
      endDelta: { x: p1.z.x - p0.z.x, y: p1.z.y - p0.z.y },
      allSame: paths.every(d => d === paths[0]) && paths.length === 4,
      posSaved: !!ctx.st.pos[id]
    };
  }, geoBefore.id);
  ok('拖拽改变了节点 transform', drag.transform !== geoBefore.transform && /translate\(/.test(drag.transform), { before: geoBefore.transform, after: drag.transform });
  ok('位移量非零', Math.abs(drag.delta.x) + Math.abs(drag.delta.y) > 5, drag.delta);
  ok('连线起点精确跟随被拖节点（真实 getPointAtLength 采样）',
    near(drag.startDelta.x, drag.delta.x) && near(drag.startDelta.y, drag.delta.y),
    { got: drag.startDelta, want: drag.delta });
  ok('连线终点保持不动（to 节点未移动）',
    near(drag.endDelta.x, 0) && near(drag.endDelta.y, 0), drag.endDelta);
  ok('边的 4 条 path（命中层/主线/光晕/流水）同步更新', drag.allSame);
  ok('位置写入 state.pos 并持久化', drag.posSaved);

  console.log('\n=== B5. 复位位置 / 重新拖拽 ===');
  await p.click('.mf-ed-foot button[data-ed="resetpos"]');
  const reset = await p.evaluate((id) => {
    const svg = document.querySelector('.mf-svg'), ctx = svg.__mfEdit;
    const n = [...svg.querySelectorAll('.mf-node')].find(x => x.getAttribute('data-id') === id);
    return { transform: n.getAttribute('transform') || '', has: !!ctx.st.pos[id] };
  }, geoBefore.id);
  ok('复位位置清掉 transform', /translate\(0 0\)/.test(reset.transform), reset);
  ok('复位位置清掉 state.pos', reset.has === false);
  const box2 = await p.locator('.mf-svg .mf-node').first().boundingBox();
  await p.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await p.mouse.down();
  await p.mouse.move(box2.x + box2.width / 2 + 60, box2.y + box2.height / 2 + 36, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(120);
  const redrag = await p.evaluate((id) => {
    const svg = document.querySelector('.mf-svg'), ctx = svg.__mfEdit;
    const n = [...svg.querySelectorAll('.mf-node')].find(x => x.getAttribute('data-id') === id);
    return { transform: n.getAttribute('transform') || '', has: !!ctx.st.pos[id] };
  }, geoBefore.id);
  ok('重新拖拽后位置再次生效', redrag.has && /translate\(/.test(redrag.transform) && !/translate\(0 0\)/.test(redrag.transform), redrag);

  console.log('\n=== B6. 节点文字 / 强调色可视化编辑 ===');
  await p.locator('.mf-svg .mf-node').first().click();
  const panel = await p.evaluate(() => {
    const e = document.querySelector('.mf-editor');
    return { hidden: e.hidden, id: (e.querySelector('.mf-ed-id') || {}).textContent || '', value: (e.querySelector('.mf-ed-label') || {}).value || '' };
  });
  ok('点选节点展开属性面板', panel.hidden === false);
  ok('属性面板显示节点 id', panel.id.length > 0, panel.id);
  ok('属性面板载入当前文字', panel.value.length > 0, panel.value);
  await p.fill('.mf-ed-label', MARK);
  await p.waitForTimeout(80);
  const labelNow = await p.evaluate(() => document.querySelector('.mf-svg .mf-node').querySelector('text').textContent);
  ok('改文字即时落到 SVG tspan', labelNow.indexOf(MARK) >= 0, labelNow);
  await p.click('.mf-ed-colors button[data-color="#dc2626"]');
  await p.waitForTimeout(80);
  const colorNow = await p.evaluate(() => document.querySelector('.mf-svg .mf-node .mf-shape').getAttribute('style'));
  ok('强调色写入 stroke', /#dc2626/.test(colorNow), colorNow);
  ok('浅色底同步混白', /rgb\(/.test(colorNow), colorNow);

  console.log('\n=== B7. 新增节点 / 连线 / 删除 / 撤销 ===');
  let cnt = await p.evaluate(() => ({ n: document.querySelectorAll('.mf-svg .mf-node').length, e: document.querySelectorAll('.mf-svg .mf-edge').length }));
  await p.click('.mf-edit-actions [data-act="add"]');
  await p.waitForTimeout(80);
  const afterAdd = await p.evaluate(() => ({
    n: document.querySelectorAll('.mf-svg .mf-node').length,
    e: document.querySelectorAll('.mf-svg .mf-edge').length,
    lastText: [...document.querySelectorAll('.mf-svg .mf-node')].pop().textContent
  }));
  ok('新增节点使节点数 +1', afterAdd.n === cnt.n + 1, { before: cnt.n, after: afterAdd.n });
  ok('新增节点默认文字「新节点」', /新节点/.test(afterAdd.lastText), afterAdd.lastText);
  await p.click('.mf-edit-actions [data-act="link"]');
  await p.locator('.mf-svg .mf-node').first().click();
  await p.locator('.mf-svg .mf-node').last().click();
  await p.waitForTimeout(100);
  const afterLink = await p.evaluate(() => ({
    e: document.querySelectorAll('.mf-svg .mf-edge').length,
    edges: [...document.querySelectorAll('.mf-svg .mf-edge')].map(x => x.getAttribute('data-from') + '>' + x.getAttribute('data-to'))
  }));
  ok('连线使边数 +1', afterLink.e === afterAdd.e + 1, { before: afterAdd.e, after: afterLink.e });
  const cnt2 = await p.evaluate(() => ({ n: document.querySelectorAll('.mf-svg .mf-node').length, e: document.querySelectorAll('.mf-svg .mf-edge').length }));
  await p.locator('.mf-svg .mf-node').nth(1).click();
  await p.click('.mf-ed-foot button[data-ed="del"]');
  await p.waitForTimeout(100);
  const afterDel = await p.evaluate(() => ({ n: document.querySelectorAll('.mf-svg .mf-node').length, e: document.querySelectorAll('.mf-svg .mf-edge').length }));
  ok('删除节点使节点数 -1', afterDel.n === cnt2.n - 1, { before: cnt2.n, after: afterDel.n });
  ok('删除节点同时移除关联连线', afterDel.e < cnt2.e, { before: cnt2.e, after: afterDel.e });
  await p.click('.mf-edit-actions [data-act="undo"]');
  await p.waitForTimeout(100);
  const afterUndo = await p.evaluate(() => ({ n: document.querySelectorAll('.mf-svg .mf-node').length, e: document.querySelectorAll('.mf-svg .mf-edge').length }));
  ok('撤销恢复节点数', afterUndo.n === cnt2.n, { want: cnt2.n, got: afterUndo.n });
  ok('撤销恢复连线数', afterUndo.e === cnt2.e, { want: cnt2.e, got: afterUndo.e });

  /* 撤销会把 pos 回退到该次拖拽的起点快照，这里再拖一次确保「位置」也进入最终状态 */
  const box3 = await p.locator('.mf-svg .mf-node').first().boundingBox();
  await p.mouse.move(box3.x + box3.width / 2, box3.y + box3.height / 2);
  await p.mouse.down();
  await p.mouse.move(box3.x + box3.width / 2 + 45, box3.y + box3.height / 2 + 28, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(120);

  console.log('\n=== B8. 重绘回放（切结构 / 重开文档编辑不丢） ===');
  const src = await p.evaluate(() => document.querySelector('.mf-svg').__mfEdit.src);
  /* 必须在创建 replay host 之前取实时规模；且只数 #content 里的图，
     否则后面新建的回放 SVG 会被全局选择器一起算进去。 */
  const live = await p.evaluate(() => ({
    n: document.querySelectorAll('#content .mf-svg .mf-node').length,
    e: document.querySelectorAll('#content .mf-svg .mf-edge').length
  }));
  await p.evaluate((s) => {
    const h = document.createElement('div'); h.id = '__replay_host'; document.body.appendChild(h);
    window.MDFlow.render(s, h);
  }, src);
  const replay = await p.evaluate(() => {
    const svg = document.querySelector('#__replay_host .mf-svg');
    if (!svg) return null;
    const ns = [...svg.querySelectorAll('.mf-node')];
    return {
      text: svg.textContent,
      n: ns.length,
      e: svg.querySelectorAll('.mf-edge').length,
      moved: ns.filter(x => { const t = x.getAttribute('transform') || ''; return t && !/translate\(0 0\)/.test(t); }).length,
      color: (ns[0].querySelector('.mf-shape') || { getAttribute: () => '' }).getAttribute('style') || '',
      hasEditor: !!document.querySelector('#__replay_host .mf-editor')
    };
  });
  ok('重绘产生新的 SVG', !!replay);
  ok('重绘回放：编辑后文字保留', replay && replay.text.indexOf(MARK) >= 0);
  ok('重绘回放：新增节点保留', replay && replay.n === live.n, { replay: replay && replay.n, live: live.n });
  ok('重绘回放：新增连线保留', replay && replay.e === live.e, { replay: replay && replay.e, live: live.e });
  ok('重绘回放：节点位置保留', replay && replay.moved >= 1, replay && replay.moved);
  ok('重绘回放：强调色保留', replay && /#dc2626/.test(replay.color), replay && replay.color);
  ok('重绘同时挂上属于自己的属性面板', replay && replay.hasEditor);
  await p.evaluate(() => document.querySelector('#__replay_host').remove());

  console.log('\n=== B9. 复制源码 = 编辑后源码 ===');
  await p.evaluate(() => {
    window.__copied = [];
    const c = navigator.clipboard;
    if (c && c.writeText) { const o = c.writeText.bind(c); c.writeText = function (t) { window.__copied.push(String(t)); return o(t); }; }
    const oe = document.execCommand.bind(document);
    document.execCommand = function (cmd) {
      if (cmd === 'copy' && document.activeElement && document.activeElement.tagName === 'TEXTAREA')
        window.__copied.push(document.activeElement.value);
      return oe.apply(document, arguments);
    };
  });
  await p.click('.mf-tools [data-act="copy"]');
  await p.waitForTimeout(220);
  const copied = await p.evaluate(() => window.__copied || []);
  ok('复制源码按钮给出编辑后的 Mermaid 源码', copied.some(t => t.indexOf(MARK) >= 0), copied.map(t => t.slice(0, 60)));
  ok('复制源码含新增节点', copied.some(t => /新节点/.test(t)));

  console.log('\n=== B10. 下载 SVG = 最后编辑状态且不含编辑器 UI ===');
  const svgText = await p.evaluate(() => window.MDFlow.serialize(document.querySelector('.mf-svg')));
  ok('下载 SVG 含编辑后文字', svgText.indexOf(MARK) >= 0);
  ok('下载 SVG 含编辑后强调色', /#dc2626/.test(svgText));
  ok('下载 SVG 含被移动的节点 transform', /translate\(/.test(svgText));
  ok('下载 SVG 不含属性面板', !/class="mf-editor"/.test(svgText));
  ok('下载 SVG 不含编辑动作组', !/mf-edit-actions/.test(svgText));
  ok('下载 SVG 不含编辑态 class', !/is-editing|is-selected|is-linksrc/.test(svgText));
  ok('下载 SVG 不含 data-d0 / data-key', !/data-d0|data-key/.test(svgText));
  ok('下载 SVG 的 CSS 变量已内联', !/var\(--mf-/.test(svgText));

  console.log('\n=== B11. 导出 HTML = 最后编辑状态 ===');
  await p.click('#btnExport');
  await p.click('#expMenu [data-fmt="html"]');
  await p.waitForFunction(() => window.__dl.some(v => /html/.test(v.type)), null, { timeout: 20000 });
  const expHtml = await p.evaluate(async () => {
    const x = window.__dl.filter(v => /html/.test(v.type)).pop();
    const t = x ? await x.p : '';
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const c = doc.querySelector('#content');
    const ns = c ? [...c.querySelectorAll('.mf-node')] : [];
    return {
      len: t.length,
      text: c ? c.textContent : '',
      n: ns.length,
      e: c ? c.querySelectorAll('.mf-edge').length : 0,
      moved: ns.filter(x => { const q = x.getAttribute('transform') || ''; return q && !/translate\(0 0\)/.test(q); }).length,
      color: ns.length ? (ns[0].querySelector('.mf-shape') || { getAttribute: () => '' }).getAttribute('style') || '' : '',
      editor: !!doc.querySelector('.mf-editor'),
      actions: !!doc.querySelector('.mf-edit-actions'),
      tools: !!doc.querySelector('.mf-tools'),
      modes: !!doc.querySelector('.mf-modes'),
      editing: !!doc.querySelector('.is-editing'),
      selected: !!doc.querySelector('.is-selected'),
      d0: !!doc.querySelector('[data-d0]'),
      dkey: !!doc.querySelector('[data-key]')
    };
  });
  ok('导出 HTML 非空', expHtml.len > 10000, expHtml.len);
  ok('导出 HTML 含编辑后文字', expHtml.text.indexOf(MARK) >= 0);
  ok('导出 HTML 含新增节点（节点数与实时一致）', expHtml.n === live.n, { exp: expHtml.n, live: live.n });
  ok('导出 HTML 含新增连线（边数与实时一致）', expHtml.e === live.e, { exp: expHtml.e, live: live.e });
  ok('导出 HTML 保留节点位置', expHtml.moved >= 1, expHtml.moved);
  ok('导出 HTML 保留强调色', /#dc2626/.test(expHtml.color), expHtml.color);
  ok('导出 HTML 不含属性面板', expHtml.editor === false);
  ok('导出 HTML 不含编辑动作组', expHtml.actions === false);
  /* CR-2026-11-15-04：交互导出页保留 .mf-tools（内含 .mf-modes 供切结构），
     但编辑器面板 / 动作组 / 编辑态仍必须全部剥离。 */
  ok('导出 HTML 保留 .mf-tools 但不含编辑器动作组',
    expHtml.tools === true && expHtml.actions === false && expHtml.editor === false,
    { tools: expHtml.tools, actions: expHtml.actions, editor: expHtml.editor });
  ok('导出 HTML 的 .mf-tools 内保留单图结构按钮组', expHtml.modes === true, expHtml.modes);
  ok('导出 HTML 不含编辑态 / 选中态 class', expHtml.editing === false && expHtml.selected === false);
  ok('导出 HTML 不含 data-d0 / data-key', expHtml.d0 === false && expHtml.dkey === false);

  console.log('\n=== B12. 导出 Word = 最后编辑状态（PNG 与编辑前不同） ===');
  await p.click('#btnExport');
  await p.click('#expMenu [data-fmt="word"]');
  await p.waitForFunction(() => window.__dl.filter(v => /msword/.test(v.type)).length >= 2, null, { timeout: 20000 });
  const expWord = await p.evaluate(async () => {
    const x = window.__dl.filter(v => /msword/.test(v.type)).pop();
    const t = x ? await x.p : '';
    const doc = new DOMParser().parseFromString(t, 'text/html');
    return {
      len: t.length,
      png: [...doc.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => /^data:image\/png/.test(s)).length,
      pngSig: [...doc.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => /^data:image\/png/.test(s)).map(s => s.length + ':' + s.slice(0, 80)).join('|'),
      editor: !!doc.querySelector('.mf-editor'),
      editing: !!doc.querySelector('.is-editing'),
      d0: !!doc.querySelector('[data-d0]'),
      svg: !!doc.querySelector('.mf-svg')
    };
  });
  ok('导出 Word 含流程图 PNG', expWord.png >= 1, expWord.png);
  ok('导出 Word 的 PNG 与「编辑前」不同（证明栅格化的是最后编辑状态）',
    expWord.pngSig.length > 0 && expWord.pngSig !== (function () { const m = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(wordBefore); const s = m ? m[1] : ''; return s.length + ':' + s.slice(0, 80); })(),
    { before: pngOf(wordBefore).length, after: expWord.pngSig.slice(0, 40) });
  ok('导出 Word 不含属性面板', expWord.editor === false);
  ok('导出 Word 不含编辑态 class', expWord.editing === false);
  ok('导出 Word 不含 data-d0', expWord.d0 === false);
  ok('导出 Word 已把内联 SVG 栅格化为图片', expWord.svg === false);

  console.log('\n=== B13. 打印 / PDF = 编辑后内容，但无编辑器 UI ===');
  await p.emulateMedia({ media: 'print' });
  const pr = await p.evaluate(() => {
    const e = document.querySelector('.mf-editor'), t = document.querySelector('.mf-tools');
    const s = document.querySelector('.mf-svg .mf-node .mf-shape');
    return {
      editor: e ? getComputedStyle(e).display : 'none',
      tools: t ? getComputedStyle(t).display : 'none',
      sw: s ? parseFloat(getComputedStyle(s).strokeWidth) : 0,
      text: document.querySelector('.mf-svg').textContent
    };
  });
  ok('打印隐藏属性面板', pr.editor === 'none', pr.editor);
  ok('打印隐藏工具条', pr.tools === 'none', pr.tools);
  ok('打印不把选中描边加粗打进 PDF', pr.sw > 0 && pr.sw < 3, pr.sw);
  ok('打印仍保留编辑后的文字', pr.text.indexOf(MARK) >= 0);
  ok('打印仍保留新增节点', pr.text.indexOf('新节点') >= 0);
  await p.emulateMedia({ media: 'screen' });

  console.log('\n=== B14. 重置清除全部编辑 / 零 JS 异常 ===');
  await p.click('.mf-edit-actions [data-act="reset"]');
  await p.waitForTimeout(120);
  const afterReset = await p.evaluate(() => {
    const svg = document.querySelector('.mf-svg'), ctx = svg.__mfEdit;
    return {
      text: svg.textContent,
      n: svg.querySelectorAll('.mf-node').length,
      e: svg.querySelectorAll('.mf-edge').length,
      moved: [...svg.querySelectorAll('.mf-node')].filter(x => { const t = x.getAttribute('transform') || ''; return t && !/translate\(0 0\)/.test(t); }).length,
      dirty: Object.keys(ctx.st.content.labels).length + Object.keys(ctx.st.content.colors).length +
        ctx.st.content.removed.length + ctx.st.content.addedNodes.length +
        ctx.st.content.addedEdges.length + ctx.st.content.removedEdges.length
    };
  });
  ok('重置后文字恢复原始（不再含编辑标记）', afterReset.text.indexOf(MARK) < 0);
  ok('重置后节点数回到 8', afterReset.n === 8, afterReset.n);
  ok('重置后连线数回到 7', afterReset.e === 7, afterReset.e);
  ok('重置后节点位置回到自动布局', afterReset.moved === 0);
  ok('重置后编辑状态为空', afterReset.dirty === 0, afterReset.dirty);
  ok('全流程零 JS 异常', errs.length === 0, errs);

  await b.close();
  console.log('\n========================================');
  console.log('  ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('========================================');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('FATAL', e); process.exitCode = 2; });
