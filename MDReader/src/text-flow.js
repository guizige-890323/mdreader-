/* ==========================================================================
   MD TEXT FLOW · 符号空格文本型流程图 → 图形流程图
   --------------------------------------------------------------------------
   把文档中用「符号 + 空格」写的轻量文本流程图（```flow 代码块）批量转换成
   MD FLOW 设计语言图形；支持整篇文档一键转换 / 还原。

   渲染范式由 @//md-render-hint/ … @//end-md-render-hint/ 提示块描述：
     GATE-PIPELINE（主线门禁流水线）+ HETEROGENEOUS-STATE-MACHINE（异构分流状态子机）
     GROUP-MAIN 绿色实线强制流转 / GROUP-SUB 黄色虚线依赖触发
     渲染前做语义静态校验，违规连线标红；自动附图例、状态矩阵、输出清单。

   图形本身复用 MDFlow（parse / layout / buildSVG / render），本模块只负责：
     文本语法转译、范式解析、分组着色、语义校验、附加组件、导出说明。
   ========================================================================== */
(function (global) {
  'use strict';

  var DEFAULT = {
    paradigm: 'GATE-PIPELINE + HETEROGENEOUS-STATE-MACHINE',
    paradigmCN: '串行门禁流水线 + 同事件异构分流状态子机',
    dir: 'LR',
    main: { fill: '#e8f8f0', stroke: '#239955', name: 'GROUP-MAIN · 主线流水线' },
    sub: { fill: '#fff6e0', stroke: '#dd9922', name: 'GROUP-SUB · 分流状态子机' },
    solid: '实线：强制流转',
    dashed: '虚线：依赖触发关系（不是流程跳转）',
    semantic: true,
    extras: ['图例', '状态矩阵附表', '文件输出清单'],
    exports: { svg: true, notes: true, hover: true },
    rules: [
      '状态单向流转，禁止终态回退连线',
      '同一父节点下，确认/驳回/超时互斥分支，不允许合并回待审',
      'WARN 告警 = 软门禁旁路；FAIL = 硬隔离，不可直通下一阶段',
      '重试节点必须标注重试次数 + 间隔，重试终点为留痕终态'
    ]
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- 1. 范式提示块 ---------------- */
  var HINT_RE = /@\/\/md-render-hint\/([\s\S]*?)@\/\/end-md-render-hint\/|<!--\s*md-render-hint\s*([\s\S]*?)-->/gi;

  function parseHint(md) {
    var cfg = clone(DEFAULT), raw = [], found = false;
    var text = String(md || '').replace(HINT_RE, function (all, a, b) {
      found = true;
      var body = String(a || b || '').trim();
      raw.push(body);
      return '\n\n<div class="tf-hint" data-tf-hint="1"></div>\n\n';
    });
    var body = raw.join('\n');
    if (found && body) {
      var m;
      if ((m = /范式类型[：:]\s*([^\n]+)/.exec(body))) cfg.paradigm = m[1].trim();
      if ((m = /范式释义[：:]\s*([^\n]+)/.exec(body))) cfg.paradigmCN = m[1].trim();
      if ((m = /布局模式[：:][^\n]*?\b(LR|TD|TB|BT|RL)\b/i.exec(body))) cfg.dir = m[1].toUpperCase();
      if ((m = /GROUP-MAIN[^\n]*?#([0-9a-f]{6})[^\n]*?描边\s*#([0-9a-f]{6})/i.exec(body))) {
        cfg.main.fill = '#' + m[1]; cfg.main.stroke = '#' + m[2];
      }
      if ((m = /GROUP-SUB[^\n]*?#([0-9a-f]{6})[^\n]*?描边\s*#([0-9a-f]{6})/i.exec(body))) {
        cfg.sub.fill = '#' + m[1]; cfg.sub.stroke = '#' + m[2];
      }
      if ((m = /语义校验开关[：:]\s*(ON|OFF|开|关|开启|关闭)/i.exec(body))) {
        cfg.semantic = /^(ON|开|开启)$/i.test(m[1]);
      }
      if ((m = /自动附加组件[：:]\s*([^\n]+)/.exec(body))) cfg.extras = m[1].trim().split(/[、,，]/);
      var ex = /导出配置[：:]\s*([^\n]+)/.exec(body);
      if (ex) {
        cfg.exports.svg = /SVG/i.test(ex[1]);
        cfg.exports.notes = /说明文本|配套说明/.test(ex[1]);
        cfg.exports.hover = /hover|备注/i.test(ex[1]);
      }
      var rules = [], rr = /^\s*\d+\.\s*(.+)$/gm, r;
      while ((r = rr.exec(body))) rules.push(r[1].trim());
      if (rules.length) cfg.rules = rules;
    }
    return { text: text, cfg: cfg, raw: body, found: found };
  }

  /* ---------------- 2. 文本语法 → Mermaid 源码 ---------------- */
  /* 节点（符号占位）：[文本] / {判断} / ([起止]) / [[子程序]] / [(数据)]，! 前缀标记终态
     边：-->  == >  -.->  ---  -- 标签 -->  -. 标签 .->  -->|标签|
     另外支持「符号箭头」作为连线：→ ⇒ ➜ ⟶ ↘ ↗ ↓ ↑ ↔ ⇄ （统一转成实心 -- >）
     裸节点行（无 [ ] 等符号、但被箭头连接）也按箭头自动切成节点，
     例如「① 已导入 → ② 待校验 → ③ 校验通过」会被识别成 3 个节点 + 2 条边。
     分组：@main / @sub（可跟方向）；行尾 // 备注；# 开头为注释            */
  var NODE_RE = /(!?)(?:\[\[([^\]\n]+)\]\]|\[\(([^)\n]+)\)\]|\[([^\]\n]+)\]|\{([^}\n]+)\}|\(\[([^\]\n]+)\]\))/g;

  /* 符号箭头 → mermaid 边（注意顺序：先长箭头/双向，再单箭头） */
  var ARROW_MAP = [
    [/⟹|⇒|➜|⟶|➔|⇏|⇛|⤳/g, ' --> '],   // 长箭头 / 推出 / 虚线箭头 → 实心（保守统一）
    [/↘|↗|↓|↑|↔|⇄|⟷|⇌/g, ' --> '],     // 斜/直/双向箭头 → 实心
    [/→/g, ' --> ']                       // 主符号箭头
  ];
  function normArrows(s) {
    ARROW_MAP.forEach(function (p) { s = s.replace(p[0], p[1]); });
    return s;
  }
  /* 文本里是否含「符号箭头 / 英文边」连线 */
  var EDGE_RE = /(-->|-\.->|---|==+>?|⟹|⇒|➜|⟶|➔|⇏|⇛|⤳|↘|↗|↓|↑|↔|⇄|⟷|⇌|→)/;
  /* 英文边切分（用于裸节点行切段） */
  var EDGE_SPLIT = /\s*(-->|-\.->|---|==+>?)\s*/;

  function toMermaid(src, cfg) {
    var lines = String(src || '').split(/\r?\n/);
    var out = [], nodes = {}, byLabel = {}, seq = 0;
    var group = 'main', dir = (cfg && cfg.dir) || 'LR';

    function nodeId(terminal, label, shape, wrapL, wrapR) {
      /* 节点按「标签 + 形状」全局去重（不含分组）：
         @sub 里再次引用主线节点时应复用同一节点，虚线依赖才会真正从主线触发 */
      var key = label + '|' + shape;
      if (byLabel[key]) {
        var old = byLabel[key];
        if (terminal) nodes[old].terminal = true;
        return old;
      }
      var id = 'N' + (++seq);
      byLabel[key] = id;
      nodes[id] = { id: id, label: label, shape: shape, group: group,
        terminal: !!terminal, note: '', open: wrapL, close: wrapR };
      return id;
    }

    /* 裸节点行：被箭头连接、但本身没有 [ ] 等符号包围，按箭头切成节点 */
    function wrapBare(line) {
      var norm = normArrows(line);
      var parts = norm.split(EDGE_SPLIT);
      var segs = [], conns = [];
      for (var k = 0; k < parts.length; k++) {
        if (k % 2 === 0) { var t = (parts[k] || '').trim(); if (t) segs.push(t); }
        else conns.push(parts[k]);
      }
      if (segs.length < 2) return null;                 // 单节点或纯说明，忽略
      var arr = [], ids = [];
      for (var j = 0; j < segs.length; j++) {
        var seg = segs[j];
        var terminal = /^!/.test(seg) || /终态|留痕|归档|隔离|已放弃|终止|升级/.test(seg);
        var lbl = seg.replace(/^!/, '').trim();
        var id = nodeId(terminal, lbl, 'rect', '[', ']');
        ids.push(id);
        arr.push(id + '[' + lbl + ']');
        if (j < segs.length - 1) arr.push(conns[j] || '-->');
      }
      return { mermaid: arr.join(' '), ids: ids };
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      var trimmed = line.trim();
      if (!trimmed) continue;
      var gm = /^@(main|sub)\b(?:\s+(LR|TD|TB|BT|RL))?\s*$/i.exec(trimmed);
      if (gm) { group = gm[1].toLowerCase(); if (gm[2]) dir = gm[2].toUpperCase(); continue; }
      if (/^(#|\/\/|%%)/.test(trimmed)) continue;

      var note = '';
      var nm = /\/\/\s*(.+)$/.exec(line);
      if (nm) { note = nm[1].trim(); line = line.slice(0, nm.index); }
      if (!line.trim()) continue;

      var lastIds = [];
      var replaced = line.replace(NODE_RE, function (all, bang, a, b, c, d, e) {
        var label = a || b || c || d || e;
        var shape = a ? 'subroutine' : b ? 'cylinder' : e ? 'stadium' : d ? 'diamond' : 'rect';
        var ol = a ? '[[' : b ? '[(' : e ? '([' : d ? '{' : '[', orr = a ? ']]' : b ? ')]' : e ? '])' : d ? '}' : ']';
        var id = nodeId(!!bang, String(label).trim(), shape, ol, orr);
        lastIds.push(id);
        return id + ol + String(label).trim() + orr;
      });

      if (lastIds.length) {                              // 方括号等符号节点
        if (note) nodes[lastIds[lastIds.length - 1]].note = note;
        out.push(normArrows(replaced).replace(/\s+/g, ' ').trim());
      } else if (EDGE_RE.test(line)) {                  // 裸节点 + 符号箭头
        var bare = wrapBare(line);
        if (bare) {
          if (note) nodes[bare.ids[bare.ids.length - 1]].note = note;
          out.push(bare.mermaid);
        }
      }
    }
    return {
      mermaid: 'flowchart ' + dir + '\n' + out.join('\n'),
      nodes: nodes, dir: dir,
      count: Object.keys(nodes).length
    };
  }

  /* ---------------- 3. 语义静态校验（4 条范式强约束） ---------------- */
  function analyze(model, cfg) {
    var bad = {}, warnings = [];
    var g = global.MDFlow ? global.MDFlow.parse(model.mermaid) : null;
    var edges = g ? g.edges : [];
    if (!cfg.semantic) return { bad: bad, warnings: ['语义校验开关：OFF（已跳过约束检查）'], edges: edges, g: g };

    function mark(e, why) {
      if (!e) return;
      var k = e.from + '>' + e.to;
      bad[k] = why;
      var msg = (model.nodes[e.from] ? model.nodes[e.from].label : e.from) + ' → ' +
        (model.nodes[e.to] ? model.nodes[e.to].label : e.to) + '：' + why;
      if (warnings.indexOf(msg) < 0) warnings.push(msg);
    }
    edges.forEach(function (e) {
      var from = model.nodes[e.from], to = model.nodes[e.to];
      var lab = e.label || '';
      /* 规则 1：终态禁止出边 */
      if (from && from.terminal) mark(e, '规则 1 · 终态回退：终态节点不允许再有出边');
      /* 规则 3：FAIL 必须落到隔离/留痕；WARN 必须是实线旁路 */
      if (/FAIL/i.test(lab) && !(to && /隔离|终止|留痕|终态/.test(to.label)))
        mark(e, '规则 3 · FAIL 硬隔离：不可直通下一阶段');
      if (/WARN/i.test(lab) && e.dashed)
        mark(e, '规则 3 · WARN 软旁路：应使用实线而非虚线依赖');
    });
    /* 规则 2：同一父节点下 确认/驳回/超时 互斥分支不得合并回待审 */
    var byFrom = {};
    edges.forEach(function (e) { (byFrom[e.from] = byFrom[e.from] || []).push(e); });
    Object.keys(byFrom).forEach(function (fid) {
      var arr = byFrom[fid], keys = ['确认', '驳回', '超时'], seen = 0, targets = {};
      arr.forEach(function (e) {
        var l = e.label || '';
        if (keys.some(function (k) { return l.indexOf(k) >= 0; })) seen++;
        targets[e.to] = (targets[e.to] || 0) + 1;
      });
      if (seen >= 2) {
        arr.forEach(function (e) {
          var to = model.nodes[e.to];
          if ((to && /待审/.test(to.label)) || targets[e.to] > 1)
            mark(e, '规则 2 · 互斥分支冲突：确认/驳回/超时 不得合并回待审');
        });
      }
    });
    /* 规则 4：重试节点标注与终点 */
    Object.keys(model.nodes).forEach(function (id) {
      var n = model.nodes[id];
      if (!/重试/.test(n.label) || n.terminal) return;
      var inbound = edges.filter(function (e) { return e.to === id; });
      var ok = inbound.some(function (e) {
        return /\d+\s*次/.test(e.label || '') && /间隔/.test(e.label || '');
      });
      if (!ok) warnings.push(n.label + '：规则 4 · 需标注重试次数 + 间隔（示例「重试 3 次 / 间隔 5m」）');
      var outbound = edges.filter(function (e) { return e.from === id; });
      if (outbound.length && !outbound.every(function (e) {
        var t = model.nodes[e.to]; return t && (t.terminal || /留痕/.test(t.label));
      })) warnings.push(n.label + '：规则 4 · 重试终点应为留痕终态');
    });
    return { bad: bad, warnings: warnings, edges: edges, g: g };
  }

  /* ---------------- 4. 附加组件 ---------------- */
  function extrasHTML(model, info, cfg) {
    var s = [];
    s.push('<div class="tf-extras">');
    s.push('<div class="tf-legend">');
    s.push('<span class="tf-lg"><i style="background:' + cfg.main.fill + ';border-color:' + cfg.main.stroke + '"></i>' + esc(cfg.main.name) + '</span>');
    s.push('<span class="tf-lg"><i style="background:' + cfg.sub.fill + ';border-color:' + cfg.sub.stroke + '"></i>' + esc(cfg.sub.name) + '</span>');
    s.push('<span class="tf-lg tf-solid">' + esc(cfg.solid) + '</span>');
    s.push('<span class="tf-lg tf-dash">' + esc(cfg.dashed) + '</span>');
    s.push('<span class="tf-lg tf-bad">标红：违反范式约束的连线</span>');
    s.push('</div>');

    /* 状态矩阵附表 */
    var inLab = {}, outLab = {};
    info.edges.forEach(function (e) {
      (outLab[e.from] = outLab[e.from] || []).push(e.label || '强制流转');
      (inLab[e.to] = inLab[e.to] || []).push(e.label || '—');
    });
    s.push('<details class="tf-details" open><summary>状态矩阵附表 · ' + model.count + ' 节点 / ' + info.edges.length + ' 连线</summary>');
    s.push('<div class="tf-scroll"><table class="tf-matrix-table"><thead><tr><th>节点</th><th>分组</th><th>形状</th><th>触发事件（入边）</th><th>后置动作（出边）</th><th>状态</th></tr></thead><tbody>');
    var SHAPE_CN = { rect: '处理框', diamond: '判断', stadium: '起止', subroutine: '子程序', cylinder: '数据' };
    Object.keys(model.nodes).forEach(function (id) {
      var n = model.nodes[id];
      s.push('<tr><td><b>' + esc(n.label) + '</b></td><td>' + (n.group === 'main' ? 'GROUP-MAIN' : 'GROUP-SUB') +
        '</td><td>' + (SHAPE_CN[n.shape] || n.shape) + '</td><td>' + esc((inLab[id] || ['—']).join(' / ')) +
        '</td><td>' + esc((outLab[id] || ['—']).join(' / ')) + '</td><td>' +
        (n.terminal ? '留痕终态' : '流转中') + '</td></tr>');
    });
    s.push('</tbody></table></div></details>');

    /* 文件输出清单 */
    s.push('<details class="tf-details"><summary>文件输出清单</summary><ul>');
    if (cfg.exports.svg) s.push('<li><code>流程图.svg</code> —— 矢量图，含分组配色、图例与 hover 备注</li>');
    if (cfg.exports.notes) s.push('<li><code>流程图-说明.txt</code> —— 范式、约束、节点/连线清单与校验报告</li>');
    s.push('<li><code>状态矩阵附表</code> —— 本图上方附表，随 HTML 文档一并导出</li>');
    s.push('<li><code>图例</code> —— 主线 / 分流 / 实线 / 虚线 / 违规标红</li>');
    s.push('</ul></details>');

    /* 语义校验报告 */
    s.push('<div class="tf-check ' + (info.warnings.length ? 'has-warn' : 'all-ok') + '">');
    s.push('<b>语义校验：' + (cfg.semantic ? 'ON' : 'OFF') + '</b> · ' +
      (info.warnings.length ? '发现 ' + info.warnings.length + ' 条告警' : '4 条范式约束全部通过'));
    if (info.warnings.length) {
      s.push('<ul>');
      info.warnings.forEach(function (w) { s.push('<li>' + esc(w) + '</li>'); });
      s.push('</ul>');
    }
    s.push('</div></div>');
    return s.join('');
  }

  function notesText(model, info, cfg) {
    var L = [];
    L.push('MD Reader · 文本流程图配套说明');
    L.push('========================================');
    L.push('范式类型：' + cfg.paradigm);
    L.push('范式释义：' + cfg.paradigmCN);
    L.push('布局模式：' + model.dir + '（' + (model.dir === 'LR' ? '横向' : '纵向') + '）');
    L.push('GROUP-MAIN：填充 ' + cfg.main.fill + ' / 描边 ' + cfg.main.stroke);
    L.push('GROUP-SUB ：填充 ' + cfg.sub.fill + ' / 描边 ' + cfg.sub.stroke);
    L.push(cfg.solid + '；' + cfg.dashed);
    L.push('');
    L.push('【节点清单】');
    Object.keys(model.nodes).forEach(function (id) {
      var n = model.nodes[id];
      L.push('  ' + id + '  ' + n.label + '  [' + n.group + ' / ' + n.shape + (n.terminal ? ' / 终态' : '') + ']' + (n.note ? '  备注：' + n.note : ''));
    });
    L.push('');
    L.push('【连线清单】');
    info.edges.forEach(function (e) {
      var a = model.nodes[e.from] ? model.nodes[e.from].label : e.from;
      var b = model.nodes[e.to] ? model.nodes[e.to].label : e.to;
      L.push('  ' + a + ' ' + (e.dashed ? '-.->' : '-->') + (e.label ? ' |' + e.label + '|' : '') + ' ' + b +
        (info.bad[e.from + '>' + e.to] ? '   ⚠ 违规：' + info.bad[e.from + '>' + e.to] : ''));
    });
    L.push('');
    L.push('【范式强约束】');
    cfg.rules.forEach(function (r, i) { L.push('  ' + (i + 1) + '. ' + r); });
    L.push('');
    L.push('【语义校验报告】' + (cfg.semantic ? 'ON' : 'OFF'));
    if (info.warnings.length) info.warnings.forEach(function (w) { L.push('  ⚠ ' + w); });
    else L.push('  4 条范式约束全部通过');
    L.push('');
    L.push('【文件输出清单】');
    if (cfg.exports.svg) L.push('  · 流程图.svg（矢量图）');
    if (cfg.exports.notes) L.push('  · 流程图-说明.txt（本文件）');
    L.push('  · 状态矩阵附表 / 图例（随 HTML 导出）');
    return L.join('\r\n');
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  /* ---------------- 5. 渲染 + DOM 增强 ---------------- */
  function decorate(host, model, info, cfg) {
    var svg = host.querySelector('.mf-svg');
    if (!svg) return;
    Object.keys(model.nodes).forEach(function (id) {
      var n = svg.querySelector('.mf-node[data-id="' + id + '"]');
      if (!n) return;
      var meta = model.nodes[id], c = meta.group === 'sub' ? cfg.sub : cfg.main;
      var shape = n.querySelector('.mf-shape');
      if (shape) { shape.style.fill = c.fill; shape.style.stroke = c.stroke; shape.style.strokeWidth = '1.8'; }
      var texts = n.querySelectorAll('text'), label = texts[texts.length - 1];
      if (label) label.style.fill = '#1f2937';
      var bar = n.querySelector('.mf-bar'); if (bar) bar.style.fill = c.stroke;
      if (cfg.exports.hover) {
        var ti = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        ti.textContent = meta.note || (meta.group === 'main' ? cfg.main.name : cfg.sub.name) +
          ' · ' + (meta.terminal ? '留痕终态' : '流转中');
        n.appendChild(ti);
      }
    });
    Object.keys(info.bad).forEach(function (k) {
      var p = k.split('>');
      var e = svg.querySelector('.mf-edge[data-from="' + p[0] + '"][data-to="' + p[1] + '"]');
      if (!e) return;
      var line = e.querySelector('.mf-line');
      if (line) { line.style.stroke = '#dc2626'; line.style.strokeWidth = '2.8'; }
      Array.prototype.forEach.call(e.querySelectorAll('.mf-flow,.mf-flow-halo'), function (x) {
        x.style.stroke = '#dc2626'; x.style.opacity = '.45';
      });
      e.classList.add('tf-violation');
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = info.bad[k]; e.appendChild(t);
    });
    var wrap = host.querySelector('.mf-wrap');
    if (wrap) {
      var ex = document.createElement('div');
      ex.innerHTML = extrasHTML(model, info, cfg);
      wrap.appendChild(ex.firstChild);
    }
    var tools = host.querySelector('.mf-tools');
    if (tools && cfg.exports.notes) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.tf = 'notes'; b.title = '下载配套说明文本（含范式、节点/连线清单与校验报告）';
      b.textContent = '下载说明';
      b.onclick = function () { download('MDReader-流程图说明.txt', notesText(model, info, cfg)); };
      tools.insertBefore(b, tools.querySelector('[data-act="svg"]'));
    }
  }

  function renderBlock(host, src, cfg) {
    var model = toMermaid(src, cfg);
    if (!model.count || !global.MDFlow || !global.MDFlow.render(model.mermaid, host)) {
      host.innerHTML = '<pre class="tf-fallback">' + esc(src) + '</pre>';
      return false;
    }
    decorate(host, model, analyze(model, cfg), cfg);
    return true;
  }

  /* ---------------- 6. 整篇文档一键转换 / 还原 ---------------- */
  /* 识别范围（覆盖常见写法）：
     ① 带语言标记的代码块：flow / flowchart / textflow / text-flow / txtflow / tf /
        mdflow / md-flow / graph / symbol-flow / 流程图
     ② 无语言标记（``` 空语言）的纯文本代码块，但内容像流程（含箭头 / 方括号节点）
     ③ 正文段落里用「符号箭头 → ⇒」写的带符号占位流程（兜底，仅在前两类都没命中时触发） */
  var SEL = [
    'pre > code.language-flow', 'pre > code.language-flowchart',
    'pre > code.language-textflow', 'pre > code.language-text-flow',
    'pre > code.language-txtflow', 'pre > code.language-tf',
    'pre > code.language-mdflow', 'pre > code.language-md-flow',
    'pre > code.language-graph', 'pre > code.language-symbol-flow',
    "pre > code.language-流程图"
  ].join(', ');

  /* 无语言标记代码块是否像流程：含连线箭头，且（≥2 个箭头 或 ≥2 个方括号节点） */
  function isBareFlow(code) {
    var t = code.textContent || '';
    if (!/(-->|-\.->|===|[\u2192\u21d2])/.test(t)) return false;
    var arrows = (t.match(/(-->|-\.->|[\u2192\u21d2])/g) || []).length;
    var brackets = (t.match(/\[[^\]]+\]|\{[^}]+\}|\(\[[^\]]+\]\)|\[\([^)]+\)\]|\[\[[^\]]+\]\]/g) || []).length;
    return arrows >= 2 || brackets >= 2;
  }

  function buildBlock(src, cfg, tag) {
    var div = document.createElement('div');
    div.className = 'tf-block'; div.setAttribute('data-src', src); div.setAttribute('data-tag', tag || 'pre');
    var bar = document.createElement('div'); bar.className = 'tf-block-bar';
    bar.innerHTML = '<span class="tf-chip">TEXT → FLOW</span><span class="tf-title">符号占位文本型流程图 · ' +
      esc(cfg.paradigm) + '</span><span class="tf-sp"></span><button type="button" class="tf-back">显示源码</button>';
    var art = document.createElement('div'); art.className = 'tf-art';
    div.appendChild(bar); div.appendChild(art);
    bar.querySelector('.tf-back').onclick = function () { restoreOne(div); };
    renderBlock(art, src, cfg);
    return div;
  }

  function convertAll(content, cfg) {
    var blocks = Array.prototype.slice.call(content.querySelectorAll(SEL + ', pre > code:not([class])'))
      .filter(function (code) {
        if (code.closest('.tf-block')) return false;
        var cls = code.className || '';
        if (/language-/.test(cls)) return true;          // 已知语言标记：直接转换
        return isBareFlow(code);                          // 无标记：需像流程才转换
      });
    var n = 0;
    blocks.forEach(function (code) {
      var pre = code.parentElement, src = code.textContent;
      pre.replaceWith(buildBlock(src, cfg, 'pre'));
      n++;
    });
    if (!n) n = scanBodyFlows(content, cfg);             // 兜底：正文段落里的符号占位流程
    return n;
  }

  /* 正文段落兜底：把连续若干行「用符号箭头 → ⇒ 写的流程」合并成一个图形块。
     触发条件保守——必须是连续 ≥2 行含符号箭头，或单行含 ≥2 个符号箭头，避免误转普通正文。 */
  function scanBodyFlows(content, cfg) {
    var paras = Array.prototype.slice.call(content.querySelectorAll('p'));
    var groups = [], cur = null;
    paras.forEach(function (p) {
      if (p.querySelector('.tf-block, .mf-svg, pre, table, ul, ol, blockquote')) return;
      var t = (p.textContent || '').trim();
      var arrows = (t.match(/[\u2192\u21d2]/g) || []).length;
      var flowish = arrows >= 1 && (arrows >= 2 || /\n/.test(t) === false);
      if (flowish) { if (!cur) cur = []; cur.push(p); }
      else { if (cur) { groups.push(cur); cur = null; } }
    });
    if (cur) groups.push(cur);
    var n = 0;
    groups.forEach(function (g) {
      var src = g.map(function (p) { return (p.textContent || '').trim(); }).join('\n');
      g[0].replaceWith(buildBlock(src, cfg, 'p'));
      for (var i = 1; i < g.length; i++) g[i].remove();
      n++;
    });
    return n;
  }

  function restoreOne(div) {
    var src = div.getAttribute('data-src') || '', tag = div.getAttribute('data-tag') || 'pre';
    var el;
    if (tag === 'pre') {
      el = document.createElement('pre');
      var code = document.createElement('code'); code.className = 'language-flow'; code.textContent = src;
      el.appendChild(code);
    } else {
      el = document.createElement(tag); el.textContent = src;
    }
    div.replaceWith(el);
  }
  function restoreAll(content) {
    var blocks = Array.prototype.slice.call(content.querySelectorAll('.tf-block[data-src]'));
    blocks.forEach(restoreOne);
    return blocks.length;
  }
  function toggleAll(content, cfg) {
    if (content.querySelector('.tf-block[data-src]')) return { mode: 'restore', n: restoreAll(content) };
    return { mode: 'convert', n: convertAll(content, cfg) };
  }

  /* 把提示块占位符填充为可折叠范式说明 */
  function decorateHints(content, hint) {
    Array.prototype.forEach.call(content.querySelectorAll('.tf-hint'), function (h) {
      h.innerHTML = '<div class="tf-hint-top"><span class="tf-chip">RENDER HINT</span>' +
        '<b>' + esc(hint.cfg.paradigm) + '</b><span class="tf-hint-cn">' + esc(hint.cfg.paradigmCN) + '</span>' +
        '<span class="tf-sp"></span><span class="tf-hint-meta">' + esc(hint.cfg.dir) + ' · 语义校验 ' +
        (hint.cfg.semantic ? 'ON' : 'OFF') + ' · 输出 SVG</span></div>' +
        '<details><summary>查看范式约束、分组配色与导出配置</summary><pre>' + esc(hint.raw) + '</pre></details>';
    });
  }

  var API = {
    DEFAULT: DEFAULT, parseHint: parseHint, toMermaid: toMermaid, analyze: analyze,
    extrasHTML: extrasHTML, notesText: notesText, renderBlock: renderBlock,
    convertAll: convertAll, restoreAll: restoreAll, toggleAll: toggleAll,
    decorateHints: decorateHints, SEL: SEL
  };
  global.MDTextFlow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
