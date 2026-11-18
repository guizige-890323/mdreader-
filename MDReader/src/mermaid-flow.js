/* ==========================================================================
   MD FLOW · 自研 Mermaid 流程图渲染管线
   --------------------------------------------------------------------------
   替代 mermaid 默认主题的出图效果。四段式管线：
     1) parse    源码 -> 图结构（节点 / 边 / 形状 / 方向 / 标签）
     2) layout   图结构 -> 几何（最长路径分层 + 重心法降交叉 + 端口偏移 + 贝塞尔路由）
     3) buildSVG 几何 -> 设计语言 SVG（编号徽章 / 层级配色 / 圆角多边形 / 边标签胶囊）
     4) bind     交互（悬停高亮路径 / 下载独立 SVG / 复制 Mermaid 源码）
   不支持的高级语法（subgraph、classDef、style、click、sequenceDiagram ...）
   一律返回 false，由 app.js 回退到原生 mermaid（附加统一美化主题）。
   颜色全部走 --mf-* CSS 变量，浅色 / 深色 / 护眼主题与卡片 / 纸张排版自动适配。
   ========================================================================== */
(function (global) {
  'use strict';

  var UID = 0;
  var FONT = "system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";
  var FONT_BOLD = '600 14px ' + FONT;
  var FONT_SMALL = '600 11.5px ' + FONT;
  var FONT_MICRO = '600 10.5px ' + FONT;

  /* ---------------- 基础工具 ---------------- */
  function f(n) { return Math.round(n * 10) / 10; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/^["']|["']$/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&').trim();
  }
  var _ctx = null;
  function tw(s, font) {
    if (typeof document !== 'undefined') {
      try {
        if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
        _ctx.font = font || FONT_BOLD;
        return _ctx.measureText(s).width;
      } catch (e) { /* Node / 无 canvas 环境走估算 */ }
    }
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      w += c > 0x2e80 ? 14 : (c >= 65 && c <= 90 ? 9.1 : 7.7);
    }
    return w;
  }
  function roundPoly(pts, r) {
    var d = '', n = pts.length;
    function toward(p, q) {
      var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(r / len, 0.42);
      return { x: p.x + dx * k, y: p.y + dy * k };
    }
    for (var i = 0; i < n; i++) {
      var cur = pts[i], a = toward(cur, pts[(i - 1 + n) % n]), b = toward(cur, pts[(i + 1) % n]);
      d += (i ? 'L' : 'M') + f(a.x) + ' ' + f(a.y);
      d += 'Q' + f(cur.x) + ' ' + f(cur.y) + ' ' + f(b.x) + ' ' + f(b.y);
    }
    return d + 'Z';
  }
  function pal(i) {
    var a = ['--mf-a1', '--mf-a2', '--mf-a3', '--mf-a4'];
    var s = ['--mf-a1s', '--mf-a2s', '--mf-a3s', '--mf-a4s'];
    return { c: 'var(' + a[i % 4] + ')', s: 'var(' + s[i % 4] + ')' };
  }

  /* ---------------- 1. 解析 ---------------- */
  var RISK_LINE = /^\s*(subgraph|end|classDef|class|style|linkStyle|click|direction|stateDiagram|classDiagram|sequenceDiagram|gantt|pie|mindmap|timeline|erDiagram|journey|gitGraph|quadrantChart|requirementDiagram|block-beta)\b/i;
  var EDGE_TOKEN = /(\|[^|]*\||<-->|-\.->|-\.-|==+>|==+|-->|---|--o|--x|~~~)/g;
  var SHAPES = [
    ['[[', ']]', 'subroutine'], ['[(', ')]', 'cylinder'], ['((', '))', 'circle'],
    ['([', '])', 'stadium'], ['{{', '}}', 'hexagon'], ['[/', '/]', 'para'],
    ['[/', '\\]', 'trap'], ['[\\', '\\]', 'para'], ['[\\', '/]', 'trap'],
    ['{', '}', 'diamond'], ['[', ']', 'rect'], ['(', ')', 'round'], ['>', ']', 'asym']
  ];

  function risky(src) {
    var ls = String(src).split(/\r?\n/);
    for (var i = 0; i < ls.length; i++) {
      if (RISK_LINE.test(ls[i])) return true;
      if (/:::|@\{|~~~|\bshape\b/.test(ls[i])) return true;
      if (/^\s*%%\{/.test(ls[i])) return true;
    }
    return false;
  }
  function readNode(frag) {
    var m = /^([A-Za-z_][\w-]*|[^\x00-\x7f][^\s\[\](){}|>=-]*)\s*/.exec(frag);
    if (!m) return null;
    var id = m[1], rest = frag.slice(m[0].length).trim();
    if (!rest) return { id: id, label: null, shape: 'rect' };
    for (var i = 0; i < SHAPES.length; i++) {
      var o = SHAPES[i][0], c = SHAPES[i][1];
      if (rest.indexOf(o) !== 0) continue;
      if (rest.length < o.length + c.length || rest.slice(-c.length) !== c) continue;
      return { id: id, label: clean(rest.slice(o.length, rest.length - c.length)), shape: SHAPES[i][2] };
    }
    return null;
  }
  function splitStatements(line) {
    var out = [], buf = '', depth = 0, quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') quoted = !quoted;
      if (!quoted && (ch === '[' || ch === '(' || ch === '{')) depth++;
      if (!quoted && (ch === ']' || ch === ')' || ch === '}')) depth--;
      if (ch === ';' && depth === 0 && !quoted) { out.push(buf); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) out.push(buf);
    return out;
  }
  function normalizeEdges(s) {
    return s
      .replace(/--+\s*([^|>=\-]+?)\s*(-->|---)/g, function (all, lab, arrow) { return arrow + '|' + lab.trim() + '|'; })
      .replace(/-\.\s*([^.|>]+?)\s*\.->/g, function (all, lab) { return '-.->|' + lab.trim() + '|'; })
      .replace(/==+\s*([^|=]+?)\s*==+>/g, function (all, lab) { return '==>|' + lab.trim() + '|'; });
  }

  function parse(src) {
    if (typeof src !== 'string' || risky(src)) return null;
    var lines = src.split(/\r?\n/), head = false, dir = 'LR';
    var g = { dir: 'LR', nodes: [], edges: [], map: {} };
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line || /^%%/.test(line)) continue;
      if (!head) {
        var m = /^(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b\s*;?\s*$/i.exec(line);
        if (!m) return null;
        head = true; g.dir = m[2].toUpperCase(); dir = g.dir;
        continue;
      }
      var segs = splitStatements(line);
      for (var si = 0; si < segs.length; si++) {
        if (!statement(segs[si], g)) return null;
      }
    }
    if (!head || !g.nodes.length) return null;
    // 去掉没有落点的悬空边（例如链式语句末尾异常）
    g.edges = g.edges.filter(function (e) { return e.from && e.to && g.map[e.from] && g.map[e.to]; });
    return g;
  }

  function statement(raw, g) {
    var s = normalizeEdges(raw.trim());
    if (!s) return true;
    var parts = s.split(EDGE_TOKEN), lastNode = null, openEdge = null, preLabel = '';
    for (var p = 0; p < parts.length; p++) {
      if (p % 2 === 1) {
        var tok = parts[p];
        if (tok.charAt(0) === '|') {
          if (openEdge) openEdge.label = clean(tok.slice(1, -1));
          else preLabel = clean(tok.slice(1, -1));
          continue;
        }
        if (tok === '~~~' || !lastNode) return false;
        var e = {
          from: lastNode, to: null, label: preLabel,
          dashed: /\.|-\.-/.test(tok), thick: /=/.test(tok),
          arrow: /->|o|x/.test(tok), token: tok
        };
        preLabel = ''; lastNode = null; openEdge = e;
        g.edges.push(e);
        continue;
      }
      var frag = parts[p].trim();
      if (!frag) continue;
      var n = readNode(frag);
      if (!n) return false;
      var node = g.map[n.id];
      if (!node) {
        node = { id: n.id, label: n.id, shape: 'rect', lines: [n.id], rank: 0, order: g.nodes.length };
        g.map[n.id] = node; g.nodes.push(node);
      }
      if (n.label !== null) {
        node.label = n.label; node.shape = n.shape;
        node.lines = n.label.split(/\n+/).filter(function (x) { return x.length; });
        if (!node.lines.length) node.lines = [n.id];
      }
      if (openEdge) { openEdge.to = n.id; openEdge = null; }
      lastNode = n.id;
    }
    return !openEdge;
  }

  /* ---------------- 2. 布局 ---------------- */
  /* GAP_MAIN：列（rank）间横向间距；GAP_CROSS：同列节点纵向间距。
     经验值：横向间距略收、纵向间距放宽 → 画板更高、比例更协调，关系不易折叠。 */
  var GAP_MAIN = 86, GAP_CROSS = 44, PAD = 40, HEAD = 52, FOOT = 36, MIN_W = 124;

  /* 长节点自适应（drawio 式的「宽图自动换行 / 竖向重排」）：
     1) 单行文字超过 200px 时按实测字宽折成多行，节点不会把画布撑成细长条；
     2) 横向布局算出来宽于阅读区（>1000px）时自动改走 TD 竖向布局，
        窄窗口、Word 导出、A4 打印都不再横向溢出。 */
  var WRAP_AT = 200, AUTO_TD_W = 1000;
  function wrapLongLabels(g) {
    g.nodes.forEach(function (n) {
      var out = [];
      n.lines.forEach(function (line) {
        if (tw(line, FONT_BOLD) <= WRAP_AT) { out.push(line); return; }
        var buf = '', w = 0;
        for (var i = 0; i < line.length; i++) {
          var ch = line.charAt(i), cw = tw(ch, FONT_BOLD);
          if (w + cw > WRAP_AT && buf) { out.push(buf); buf = ''; w = 0; }
          buf += ch; w += cw;
        }
        if (buf) out.push(buf);
      });
      n.lines = out.slice(0, 4);
      if (!n.lines.length) n.lines = [n.id];
    });
  }
  function layout(g, modeOverride) {
    /* 结构模式（mode）与配色风格（data-flow-style）是两条独立的轴：
       mode 决定几何，配色由 CSS 变量决定，二者可任意组合。
       modeOverride 供「单图结构」使用：优先于全局 MODE，但不改全局默认。 */
    var m = modeOverride || MODE;
    if (m === 'auto') m = autoMode(g);
    if (m === 'mindmap') return layoutMind(g);
    if (m === 'org') return layoutOrg(g);
    if (m === 'timeline') return layoutTimeline(g);

    wrapLongLabels(g);
    var L = layoutAs(g, g.dir);
    if (L.horiz && L.W > AUTO_TD_W) {
      L = layoutAs(g, 'TD');
      L.autoVertical = true;
      g.effDir = 'TD';
    } else {
      g.effDir = g.dir;
    }
    L.mode = 'pipeline';
    return L;
  }
  function layoutAs(g, dir) {
    var horiz = (dir === 'LR' || dir === 'RL');
    var flipX = (dir === 'RL'), flipY = (dir === 'BT');
    var N = g.nodes.length;
    var longest = 0;

    /* 邻接与度数 */
    var adj = {}, radj = {}, indeg = {}, outdeg = {};
    g.nodes.forEach(function (n) { adj[n.id] = []; radj[n.id] = []; indeg[n.id] = 0; outdeg[n.id] = 0; });
    g.edges.forEach(function (e) {
      if (e.from === e.to) return;
      adj[e.from].push(e.to); radj[e.to].push(e.from);
      outdeg[e.from]++; indeg[e.to]++;
    });

    /* 最长路径分层（LR/TD 通用）
       先用 DFS 着色识别「回边 / 环路边」并从最长路径计算中排除，
       避免环（重试回路、回环）把节点层级推到画板最右、把画板拉成超长细条；
       被排除的回边在下方按 b.rank <= a.rank 判定为回边，走 U 形外侧通道路由。 */
    var color = {}, backEdges = {};
    function dfs(u) {
      color[u] = 1;
      adj[u].forEach(function (v) {
        if (v === u) return;
        if (!color[v]) dfs(v);
        else if (color[v] === 1) backEdges[u + '>' + v] = true;
      });
      color[u] = 2;
    }
    g.nodes.forEach(function (n) { if (!color[n.id]) dfs(n.id); });

    var rank = {}, deg = {}, queue = [], sorted = [];
    g.nodes.forEach(function (n) { rank[n.id] = 0; deg[n.id] = 0; });
    g.edges.forEach(function (e) {
      if (e.from === e.to || backEdges[e.from + '>' + e.to]) return;
      deg[e.to]++;
    });
    g.nodes.forEach(function (n) { if (!deg[n.id]) queue.push(n.id); });
    while (queue.length) {
      var u = queue.shift(); sorted.push(u);
      adj[u].forEach(function (v) {
        if (backEdges[u + '>' + v]) return;
        rank[v] = Math.max(rank[v], rank[u] + 1);
        if (--deg[v] === 0) queue.push(v);
      });
    }
    /* 极端孤立环（无任何入口）兜底：未入列的节点统一挂在 rank 0，避免层级缺失 */
    if (sorted.length < N) {
      g.nodes.forEach(function (n) { if (sorted.indexOf(n.id) < 0) rank[n.id] = 0; });
    }
    var L = 0;
    g.nodes.forEach(function (n) { n.rank = rank[n.id]; L = Math.max(L, n.rank + 1); });

    /* 层内排序：重心法迭代降交叉，声明顺序作为稳定基准 */
    var layers = [];
    for (var i = 0; i < L; i++) layers.push([]);
    g.nodes.forEach(function (n) { layers[n.rank].push(n); });
    layers.forEach(function (layer) { layer.sort(function (a, b) { return a.order - b.order; }); });
    var pos = {};
    function snapshot() { layers.forEach(function (layer) { layer.forEach(function (n, k) { pos[n.id] = k; }); }); }
    for (var pass = 0; pass < 6; pass++) {
      snapshot();
      var order = [], q;
      for (q = 0; q < L; q++) order.push(q);
      if (pass % 2) order.reverse();
      order.forEach(function (li) {
        var bary = {}, usePrev = !(pass % 2);
        layers[li].forEach(function (n) {
          var near = usePrev
            ? (li === 0 ? adj[n.id] : radj[n.id])
            : (li === L - 1 ? radj[n.id] : adj[n.id]);
          var vals = near.map(function (x) { return pos[x]; }).filter(function (v) { return v != null; });
          bary[n.id] = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : pos[n.id];
        });
        layers[li].sort(function (a, b) {
          var d = bary[a.id] - bary[b.id];
          return Math.abs(d) < 0.001 ? a.order - b.order : d;
        });
      });
    }
    layers.forEach(function (layer) { layer.forEach(function (n, k) { n.k = k; }); });

    /* 节点尺寸：按真实文本宽度测量，菱形/胶囊留出额外空间。
       纵向最小高度抬高，让画板整体更高、节点不显拥挤（参考图：画板高度充足、关系互不折叠）。 */
    g.nodes.forEach(function (n) {
      var maxW = 0;
      n.lines.forEach(function (s) { maxW = Math.max(maxW, tw(s, FONT_BOLD)); });
      longest = Math.max(longest, maxW);
      var w = Math.max(MIN_W, maxW + 64);
      var h = Math.max(62, n.lines.length * 22 + 34);
      if (n.shape === 'diamond') { w = Math.max(168, maxW + 92); h = Math.max(106, h + 26); }
      else if (n.shape === 'hexagon') { w += 22; h += 14; }
      else if (n.shape === 'circle' || n.shape === 'stadium') { w += 16; h = Math.max(64, h); }
      else if (n.shape === 'para' || n.shape === 'trap') { w += 22; }
      n.w = Math.ceil(w); n.h = Math.ceil(h);
    });

    /* 层尺寸与画布 */
    var layerMain = [], layerCross = [];
    layers.forEach(function (layer) {
      var mm = 0, cc = 0;
      layer.forEach(function (n, k) {
        mm = Math.max(mm, horiz ? n.w : n.h);
        cc += (horiz ? n.h : n.w) + (k ? GAP_CROSS : 0);
      });
      layerMain.push(mm); layerCross.push(cc);
    });
    var mainTotal = layerMain.reduce(function (a, b) { return a + b; }, 0) + GAP_MAIN * (L - 1);
    var crossTotal = Math.max.apply(null, layerCross.concat([0]));
    var W = Math.ceil((horiz ? mainTotal : crossTotal) + PAD * 2);
    var H = Math.ceil((horiz ? crossTotal : mainTotal) + PAD * 2 + HEAD + FOOT);
    var innerH = H - HEAD - FOOT - PAD * 2, innerW = W - PAD * 2;

    /* 坐标：主轴逐层推进，交叉轴整列居中 */
    var cursor = horiz ? PAD : PAD + HEAD;
    layers.forEach(function (layer, li) {
      var cc = layerCross[li];
      var base = horiz
        ? HEAD + PAD + (innerH - cc) / 2
        : PAD + (innerW - cc) / 2;
      var run = base;
      layer.forEach(function (n) {
        if (horiz) {
          n.x = cursor + (layerMain[li] - n.w) / 2; n.y = run;
          run += n.h + GAP_CROSS;
        } else {
          n.x = run; n.y = cursor + (layerMain[li] - n.h) / 2;
          run += n.w + GAP_CROSS;
        }
      });
      cursor += layerMain[li] + GAP_MAIN;
    });

    /* 端口分散：同一节点的多条出/入边错开，形成扇形而非重叠线束 */
    var outIdx = {}, inIdx = {}, outCnt = {}, inCnt = {};
    g.nodes.forEach(function (n) { outCnt[n.id] = outdeg[n.id]; inCnt[n.id] = indeg[n.id]; outIdx[n.id] = 0; inIdx[n.id] = 0; });
    g.edges.forEach(function (e) {
      var a = g.map[e.from], b = g.map[e.to];
      if (!a || !b) return;
      var oi = outIdx[e.from]++, ii = inIdx[e.to]++;
      /* 端口分散放大：同节点多条出/入边错开更明显，形成清晰扇形而非重叠线束 */
      var offOut = (oi - (outCnt[e.from] - 1) / 2) * Math.min(20, (a.h - 24) / Math.max(outCnt[e.from], 1));
      var offIn = (ii - (inCnt[e.to] - 1) / 2) * Math.min(20, (b.h - 24) / Math.max(inCnt[e.to], 1));
      if (horiz) {
        e.p0 = { x: a.x + a.w, y: a.y + a.h / 2 + offOut };
        e.p3 = { x: b.x, y: b.y + b.h / 2 + offIn };
      } else {
        e.p0 = { x: a.x + a.w / 2 + offOut, y: a.y + a.h };
        e.p3 = { x: b.x + b.w / 2 + offIn, y: b.y };
      }
      var back = b.rank <= a.rank;
      var span = Math.abs(horiz ? e.p3.x - e.p0.x : e.p3.y - e.p0.y);
      var dx = Math.max(34, Math.min(98, span * 0.52));
      if (!back) {
        e.c1 = horiz ? { x: e.p0.x + dx, y: e.p0.y } : { x: e.p0.x, y: e.p0.y + dx };
        e.c2 = horiz ? { x: e.p3.x - dx, y: e.p3.y } : { x: e.p3.x, y: e.p3.y - dx };
      } else {
        /* 回边 / 同层边：绕到图的外侧走 U 形通道，避免横穿节点；
           lane 随序号外扩并加大间隔，回环不再与主线线束交叠 */
        var lane = 40 + (oi % 4) * 18;
        if (horiz) {
          var low = Math.min(Math.max(a.y + a.h, b.y + b.h) + lane, H - FOOT - 14);
          e.p0 = { x: a.x + a.w / 2, y: a.y + a.h };
          e.p3 = { x: b.x + b.w / 2, y: b.y + b.h };
          e.c1 = { x: e.p0.x, y: low }; e.c2 = { x: e.p3.x, y: low };
        } else {
          var right = Math.min(Math.max(a.x + a.w, b.x + b.w) + lane, W - PAD - 14);
          e.p0 = { x: a.x + a.w, y: a.y + a.h / 2 };
          e.p3 = { x: b.x + b.w, y: b.y + b.h / 2 };
          e.c1 = { x: right, y: e.p0.y }; e.c2 = { x: right, y: e.p3.y };
        }
        e.back = true;
      }
      e.mx = (e.p0.x + 3 * e.c1.x + 3 * e.c2.x + e.p3.x) / 8;
      e.my = (e.p0.y + 3 * e.c1.y + 3 * e.c2.y + e.p3.y) / 8;
      e.path = 'M' + f(e.p0.x) + ' ' + f(e.p0.y) +
        'C' + f(e.c1.x) + ' ' + f(e.c1.y) + ',' + f(e.c2.x) + ' ' + f(e.c2.y) +
        ',' + f(e.p3.x) + ' ' + f(e.p3.y);
    });

    /* 方向镜像：只翻坐标，不翻文字 */
    if (flipX) {
      g.nodes.forEach(function (n) { n.x = W - n.x - n.w; });
      g.edges.forEach(function (e) {
        [e.p0, e.c1, e.c2, e.p3].forEach(function (p) { p.x = W - p.x; });
        e.mx = W - e.mx;
        e.path = 'M' + f(e.p0.x) + ' ' + f(e.p0.y) +
          'C' + f(e.c1.x) + ' ' + f(e.c1.y) + ',' + f(e.c2.x) + ' ' + f(e.c2.y) +
          ',' + f(e.p3.x) + ' ' + f(e.p3.y);
      });
    }
    if (flipY) {
      g.nodes.forEach(function (n) { n.y = H - n.y - n.h; });
      g.edges.forEach(function (e) {
        [e.p0, e.c1, e.c2, e.p3].forEach(function (p) { p.y = H - p.y; });
        e.my = H - e.my;
        e.path = 'M' + f(e.p0.x) + ' ' + f(e.p0.y) +
          'C' + f(e.c1.x) + ' ' + f(e.c1.y) + ',' + f(e.c2.x) + ' ' + f(e.c2.y) +
          ',' + f(e.p3.x) + ' ' + f(e.p3.y);
      });
    }

    g.nodes.forEach(function (n) {
      n.kind = n.shape === 'diamond' ? 'decision'
        : (indeg[n.id] === 0 && outdeg[n.id] > 0 ? 'start'
          : (outdeg[n.id] === 0 && indeg[n.id] > 0 ? 'end' : 'normal'));
      n.num = String(n.order + 1);
      if (n.num.length < 2) n.num = '0' + n.num;
      n.color = pal(n.rank);
    });

    /* 阶段色带几何：每层一条，包住该层所有节点并上下留白。
       记录在此，供 buildSVG 在「网格点之上、连线之下」绘制。 */
    var stageBands = [];
    if (horiz || !horiz) {
      if (horiz) {
        layers.forEach(function (layer, li) {
          if (!layer.length) return;
          var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          layer.forEach(function (n) {
            x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x + n.w);
            y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y + n.h);
          });
          stageBands.push({ x: x0 - 14, y: y0 - 16, w: (x1 - x0) + 28, h: (y1 - y0) + 32 });
        });
      } else {
        layers.forEach(function (layer, li) {
          if (!layer.length) return;
          var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          layer.forEach(function (n) {
            x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x + n.w);
            y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y + n.h);
          });
          stageBands.push({ x: x0 - 16, y: y0 - 14, w: (x1 - x0) + 32, h: (y1 - y0) + 28 });
        });
      }
    }

    return { W: W, H: H, horiz: horiz, head: HEAD, foot: FOOT, pad: PAD,
      layers: layers.length, longest: longest, autoVertical: false, stageBands: stageBands };
  }

  /* ================================================================
     2b. 结构布局变体（独立于配色的第二条轴）
     ----------------------------------------------------------------
     配色（data-flow-style）决定「什么颜色」，结构（MODE）决定「怎么排」。
     两者正交：同一张图既能是暗夜霓虹的多彩流水，也能是极简线稿的思维导图。

       auto      按图形态自动选（非树→流水，树深/叶多→导图，浅树→组织）
       pipeline  多彩流水：分层横向推进 + 阶段色带 + 贝塞尔主线（原默认外观）
       mindmap   思维导图：根居中，分支按子树宽度分配角度、逐环向外辐射
       org       组织结构图：自上而下等宽箱体 + 正交肘形连线
       timeline  时间图：中轴时间线，卡片上下交替，竖线挂接
     ================================================================ */
  var MODE = 'auto';
  var MODE_LABELS = { auto: '自动', pipeline: '多彩流水', mindmap: '思维导图', org: '组织结构图', timeline: '时间图' };
  function setMode(m) { MODE = MODE_LABELS[m] ? m : 'auto'; }
  function getMode() { return MODE; }

  /* ---- 单图结构覆盖：按源码 hash 记住每张图自己选的结构 ----
     与 MDEdit 的编辑状态分桶思路一致但完全独立：改结构不该动编辑内容。
     'auto' 也存，表示「这张图跟随全局默认」；显式选过就一直保持，直到再次切换。 */
  var MODE_KEY = 'mdreader-mdflow-mode-';
  function h32mode(s) {
    var h = 2166136261; s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36);
  }
  function savedMode(src) {
    try {
      var m = global.localStorage && global.localStorage.getItem(MODE_KEY + h32mode(src));
      return MODE_LABELS[m] ? m : null;
    } catch (e) { return null; }
  }
  function saveMode(src, m) {
    try { if (global.localStorage) global.localStorage.setItem(MODE_KEY + h32mode(src), m); } catch (e) { }
  }
  /* 工具条右上角结构按钮：与图表 .chart-types 一致的小图标按钮组（仅图标 + title） */
  var MODE_ICON = {
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L13.4 10.6 L21 12 L13.4 13.4 L12 21 L10.6 13.4 L3 12 L10.6 10.6 Z"/></svg>',
    pipeline: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="9" width="5" height="6" rx="1.4"/><rect x="9.5" y="3" width="5" height="6" rx="1.4"/><rect x="9.5" y="15" width="5" height="6" rx="1.4"/><rect x="17" y="9" width="5" height="6" rx="1.4"/><path d="M7 12h2.5M14.5 6 L17 7.6M14.5 18 L17 16.4"/></svg>',
    mindmap: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.6"/><circle cx="21" cy="5" r="1.8"/><circle cx="21" cy="19" r="1.8"/><circle cx="3" cy="12" r="1.8"/><path d="M14.2 10.6 L19.4 6.4M14.2 13.4 L19.4 17.6M9.5 12 H4.8"/></svg>',
    org: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="4.4" rx="1.2"/><rect x="2.5" y="17" width="6" height="4.4" rx="1.2"/><rect x="9" y="17" width="6" height="4.4" rx="1.2"/><rect x="15.5" y="17" width="6" height="4.4" rx="1.2"/><path d="M12 6.9v4.6M5.5 11.5h13M5.5 11.5V17M12 11.5V17M18.5 11.5V17"/></svg>',
    timeline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h20"/><rect x="5" y="4" width="5" height="4" rx="1.2"/><rect x="13" y="16" width="5" height="4" rx="1.2"/><path d="M7.5 8v4M15.5 12v4"/></svg>'
  };

  /* 统一的节点测量：自定义布局不走 layoutAs，尺寸必须自己算，否则文字会溢出箱体 */
  function measureNodes(g, opt) {
    opt = opt || {};
    var minW = opt.minW || 124, wrapAt = opt.wrapAt || 200, padX = opt.padX || 64;
    var minH = opt.minH || 58;
    g.nodes.forEach(function (n) {
      var src = (n.lines && n.lines.length) ? n.lines : [n.label || n.id];
      var out = [];
      src.forEach(function (line) {
        if (tw(line, FONT_BOLD) <= wrapAt) { out.push(line); return; }
        var buf = '', w = 0;
        for (var i = 0; i < line.length; i++) {
          var ch = line.charAt(i), cw = tw(ch, FONT_BOLD);
          if (w + cw > wrapAt && buf) { out.push(buf); buf = ''; w = 0; }
          buf += ch; w += cw;
        }
        if (buf) out.push(buf);
      });
      n.lines = out.slice(0, 4);
      if (!n.lines.length) n.lines = [n.id];
      var maxW = 0;
      n.lines.forEach(function (s) { maxW = Math.max(maxW, tw(s, FONT_BOLD)); });
      n.w = Math.ceil(Math.max(minW, maxW + padX));
      n.h = Math.ceil(Math.max(minH, n.lines.length * 21 + 32));
    });
  }

  /* 层深（BFS 松弛）。带 guard 防止环把队列跑穿 */
  function depthMap(g) {
    var adj = {}, indeg = {}, d = {}, q = [];
    g.nodes.forEach(function (n) { adj[n.id] = []; indeg[n.id] = 0; d[n.id] = 0; });
    g.edges.forEach(function (e) {
      if (e.from === e.to) return;
      adj[e.from].push(e.to); indeg[e.to]++;
    });
    g.nodes.forEach(function (n) { if (!indeg[n.id]) q.push(n.id); });
    var guard = 0;
    while (q.length && guard++ < 6000) {
      var u = q.shift();
      adj[u].forEach(function (v) {
        if (d[v] < d[u] + 1 && d[u] < 200) { d[v] = d[u] + 1; q.push(v); }
      });
    }
    return d;
  }

  /* 收尾：补 kind / num / color，自定义布局也必须走一遍，否则 buildSVG 取不到配色 */
  function finishNodes(g) {
    var indeg = {}, outdeg = {};
    g.nodes.forEach(function (n) { indeg[n.id] = 0; outdeg[n.id] = 0; });
    g.edges.forEach(function (e) {
      if (e.from === e.to) return;
      outdeg[e.from]++; indeg[e.to]++;
    });
    g.nodes.forEach(function (n) {
      n.kind = n.shape === 'diamond' ? 'decision'
        : (indeg[n.id] === 0 && outdeg[n.id] > 0 ? 'start'
          : (outdeg[n.id] === 0 && indeg[n.id] > 0 ? 'end' : 'normal'));
      n.num = String(n.order + 1);
      if (n.num.length < 2) n.num = '0' + n.num;
      n.color = pal((typeof n.rank === 'number' ? n.rank : 0));
    });
  }

  /* ---------- 组织结构图：等宽箱体 + 正交肘形连线 ---------- */
  function layoutOrg(g) {
    measureNodes(g, { minW: 152, wrapAt: 172, padX: 58 });
    /* 等宽是组织图的识别特征：先统一宽度再交给分层布局，位置才不会被后改宽度打乱 */
    var uni = 0;
    g.nodes.forEach(function (n) { uni = Math.max(uni, n.w); });
    g.nodes.forEach(function (n) { n.w = uni; });

    var L = layoutAs(g, 'TD');
    L.mode = 'org';

    g.edges.forEach(function (e) {
      var a = g.map[e.from], b = g.map[e.to];
      if (!a || !b) return;
      var x1 = a.x + a.w / 2, y1 = a.y + a.h;
      var x2 = b.x + b.w / 2, y2 = b.y;
      if (b.rank <= a.rank) {
        /* 回边：从右侧绕出，避免横穿中间层 */
        var rx = Math.max(a.x + a.w, b.x + b.w) + 34;
        e.path = 'M' + f(a.x + a.w) + ' ' + f(a.y + a.h / 2) +
          ' H' + f(rx) + ' V' + f(b.y + b.h / 2) + ' H' + f(b.x + b.w);
        e.p0 = { x: a.x + a.w, y: a.y + a.h / 2 };
        e.p3 = { x: b.x + b.w, y: b.y + b.h / 2 };
        e.mx = rx; e.my = (a.y + b.y) / 2;
        e.back = true;
      } else {
        /* 正向下行：竖 → 横 → 竖，正是组织图的「汇流母线」形状 */
        var midY = y1 + Math.max(20, (y2 - y1) / 2);
        e.path = 'M' + f(x1) + ' ' + f(y1) + ' V' + f(midY) +
          ' H' + f(x2) + ' V' + f(y2);
        e.p0 = { x: x1, y: y1 };
        e.p3 = { x: x2, y: y2 };
        e.mx = x2; e.my = midY;
      }
    });
    return L;
  }

  /* ---------- 思维导图：根居中，按子树权重分角度、逐环外扩 ---------- */
  function layoutMind(g) {
    measureNodes(g, { minW: 92, wrapAt: 132, padX: 44, minH: 50 });

    var adj = {}, indeg = {}, treeKids = {}, par = {};
    g.nodes.forEach(function (n) {
      adj[n.id] = []; indeg[n.id] = 0; treeKids[n.id] = [];
    });
    g.edges.forEach(function (e) {
      if (e.from === e.to) return;
      adj[e.from].push(e.to); indeg[e.to]++;
    });

    /* 根取「可达节点最多」的那个，多根（散图）也能收成一棵 */
    function reach(id) {
      var vis = {}, st = [id], c = 0;
      while (st.length) {
        var u = st.pop();
        if (vis[u]) continue;
        vis[u] = 1; c++;
        (adj[u] || []).forEach(function (v) { if (!vis[v]) st.push(v); });
      }
      return c;
    }
    var root = g.nodes[0], best = -1;
    g.nodes.forEach(function (n) {
      var r = reach(n.id);
      if (r > best) { best = r; root = n; }
    });

    var seen = {}, level = {}, order = [];
    (function walk(id, d) {
      if (seen[id]) return;
      seen[id] = true; level[id] = d; order.push(id);
      adj[id].forEach(function (v) {
        if (seen[v]) return;
        par[v] = id; treeKids[id].push(v);
        walk(v, d + 1);
      });
    })(root.id, 0);
    /* 未被根覆盖的孤立节点，统一挂到根的第一环 */
    g.nodes.forEach(function (n) {
      if (seen[n.id]) return;
      seen[n.id] = 1; level[n.id] = 1; par[n.id] = root.id;
      treeKids[root.id].push(n.id); order.push(n.id);
    });

    /* 子树权重：至少容得下自身箱体，所以父级角度永远够宽 */
    var WU = {};
    function calcWu(id) {
      var own = g.map[id].w + 78, sum = 0;
      treeKids[id].forEach(function (k) { sum += calcWu(k); });
      WU[id] = Math.max(own, sum);
      return WU[id];
    }
    calcWu(root.id);

    /* 角度分配必须先于半径计算：半径由「相邻节点的真实角差」反推而定，
       先算半径再算角度会拿不到真实角差，同环节点就会叠在一起。 */
    var maxLv = 0;
    order.forEach(function (id) { maxLv = Math.max(maxLv, level[id]); });

    var ang = {};
    (function alloc(id, a0, a1) {
      ang[id] = (a0 + a1) / 2;
      var kids = treeKids[id];
      if (!kids.length) return;
      var tot = 0;
      kids.forEach(function (k) { tot += WU[k]; });
      var cur = a0;
      kids.forEach(function (k) {
        var span = (a1 - a0) * WU[k] / tot;
        alloc(k, cur, cur + span);
        cur += span;
      });
    })(root.id, -Math.PI / 2, Math.PI * 1.5);

    /* 环半径：三条约束取最大
       ① 逐环外扩 —— 层级要看得出来
       ② 同环相邻节点：R·Δ角 ≥ 两者半宽之和 + 间距 —— 否则同一环上互相压住
       ③ 父子同射线：径向间距 ≥ 父半宽投影 + 子半宽投影 + 间距
          （矩形在角度 θ 上的半径投影 = |w/2·cosθ| + |h/2·sinθ|）
          漏了③就会出现「父节点和子节点在射线上贴住」——环间只差固定值时必犯。 */
    function radProj(n, th) {
      return Math.abs(n.w / 2 * Math.cos(th)) + Math.abs(n.h / 2 * Math.sin(th));
    }
    var ringR = [0];
    for (var d = 1; d <= maxLv; d++) {
      var ring = order.filter(function (id) { return level[id] === d; })
        .map(function (id) { return { id: id, n: g.map[id], a: ang[id] }; })
        .sort(function (p, q) { return p.a - q.a; });

      /* ③ 环间：逐节点用「自己 + 父节点」在该角度上的投影和 */
      var gapNeed = 0;
      ring.forEach(function (o) {
        var pid = par[o.id], pn = pid ? g.map[pid] : null;
        var needGap = radProj(o.n, o.a) + (pn ? radProj(pn, o.a) : o.n.h / 2) + 26;
        gapNeed = Math.max(gapNeed, needGap);
      });
      var need = Math.max(ringR[d - 1] + 92, ringR[d - 1] + gapNeed);

      /* ② 同环相邻 */
      if (ring.length >= 2) {
        for (var ri = 0; ri < ring.length; ri++) {
          var cur0 = ring[ri];
          var nxt = ring[(ri + 1) % ring.length];
          var dA = (ri === ring.length - 1)
            ? Math.abs(ring[0].a - cur0.a + Math.PI * 2) % (Math.PI * 2)
            : Math.abs(nxt.a - cur0.a);
          dA = Math.max(dA, 0.04);
          need = Math.max(need, (cur0.n.w / 2 + nxt.n.w / 2 + 26) / dA);
        }
        ring.forEach(function (o) {
          need = Math.max(need, (o.n.w + 34) / Math.min(Math.PI * 2 / ring.length, 0.9));
        });
      } else if (ring.length === 1) {
        need = Math.max(need, ring[0].n.w + 40);
      }
      ringR[d] = need;
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    order.forEach(function (id) {
      var n = g.map[id], r = ringR[level[id]] || 0;
      var cx = r * Math.cos(ang[id]), cy = r * Math.sin(ang[id]);
      n.x = cx - n.w / 2; n.y = cy - n.h / 2;
      n.rank = level[id] % 4;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });

    /* 平移到画布内（留出眉题与页脚） */
    var dx = PAD + 14 - minX, dy = PAD + HEAD + 14 - minY;
    g.nodes.forEach(function (n) { n.x += dx; n.y += dy; });

    var W = Math.ceil(maxX - minX + PAD * 2 + 28);
    var H = Math.ceil(maxY - minY + PAD * 2 + HEAD + FOOT + 28);

    /* 连线：从父箱体边缘射向子箱体边缘，带一点侧向弧度，像手绘放射线 */
    g.edges.forEach(function (e) {
      var a = g.map[e.from], b = g.map[e.to];
      if (!a || !b) return;
      var ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      var bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      var ddx = bc.x - ac.x, ddy = bc.y - ac.y;
      function edgePt(n, ox, oy) {
        var sx = Math.abs(ox) < 1e-6 ? Infinity : (n.w / 2) / Math.abs(ox);
        var sy = Math.abs(oy) < 1e-6 ? Infinity : (n.h / 2) / Math.abs(oy);
        var k = Math.min(sx, sy);
        return { x: n.x + n.w / 2 + ox * k, y: n.y + n.h / 2 + oy * k };
      }
      var p0 = edgePt(a, ddx, ddy), p3 = edgePt(b, -ddx, -ddy);
      var len = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      /* 垂直方向偏移量：给直线一点点弯，分支密集时视觉上更容易跟随 */
      var nx = -ddy / len, ny = ddx / len;
      var bend = Math.min(46, len * 0.14);
      var c1 = { x: p0.x + (p3.x - p0.x) * 0.34 + nx * bend * 0.55,
                 y: p0.y + (p3.y - p0.y) * 0.34 + ny * bend * 0.55 };
      var c2 = { x: p0.x + (p3.x - p0.x) * 0.68 + nx * bend * 0.35,
                 y: p0.y + (p3.y - p0.y) * 0.68 + ny * bend * 0.35 };
      e.p0 = p0; e.p3 = p3; e.c1 = c1; e.c2 = c2;
      e.path = 'M' + f(p0.x) + ' ' + f(p0.y) +
        'C' + f(c1.x) + ' ' + f(c1.y) + ',' + f(c2.x) + ' ' + f(c2.y) +
        ',' + f(p3.x) + ' ' + f(p3.y);
      e.mx = (p0.x + p3.x) / 2 + nx * bend * 0.4;
      e.my = (p0.y + p3.y) / 2 + ny * bend * 0.4;
    });

    finishNodes(g);
    /* 导图不编号：冗余数字会打断「发散联想」的阅读节奏 */
    g.nodes.forEach(function (n) { n.showNum = false; });

    return { W: W, H: H, horiz: true, head: HEAD, foot: FOOT, pad: PAD,
      layers: maxLv + 1, longest: 0, autoVertical: false, mode: 'mindmap' };
  }

  /* ---------- 时间图：中轴时间线 + 上下交替卡片 ---------- */
  function layoutTimeline(g) {
    measureNodes(g, { minW: 116, wrapAt: 158, padX: 52, minH: 54 });
    var d = depthMap(g);
    var arr = g.nodes.slice().sort(function (a, b) {
      return (d[a.id] - d[b.id]) || (a.order - b.order);
    });
    arr.forEach(function (n, i) { n.seq = i; });

    var maxW = 0, maxH = 0;
    arr.forEach(function (n) { maxW = Math.max(maxW, n.w); maxH = Math.max(maxH, n.h); });

    var GAPX = 62;
    var axisY = PAD + HEAD + 46 + maxH + 22;
    var x = PAD + 12, axisX0 = 0, axisX1 = 0;
    arr.forEach(function (n, i) {
      var cx = x + maxW / 2;
      n.x = cx - n.w / 2;
      n.up = (i % 2 === 0);
      n.y = n.up ? axisY - 40 - n.h : axisY + 40;
      n.axisX = cx;
      if (i === 0) axisX0 = cx;
      axisX1 = cx;
      x += maxW + GAPX;
    });

    var W = Math.ceil(x - GAPX + PAD + 12);
    var H = Math.ceil(axisY + 40 + maxH + PAD + FOOT);

    g.edges.forEach(function (e) {
      var a = g.map[e.from], b = g.map[e.to];
      if (!a || !b) return;
      var bUp = b.up, by = bUp ? b.y + b.h : b.y;
      var ay = bUp ? axisY - 6 : axisY + 6;
      e.p0 = { x: b.axisX, y: axisY };
      e.p3 = { x: b.axisX, y: by };
      e.path = 'M' + f(b.axisX) + ' ' + f(ay) + ' V' + f(by);
      e.mx = b.axisX + 34;
      e.my = bUp ? (axisY + by) / 2 : (axisY + by) / 2;
      e.back = false;
    });

    finishNodes(g);
    g.nodes.forEach(function (n) {
      n.rank = n.seq % 4;
      n.color = pal(n.seq % 4);
      n.showNum = false;
    });

    return { W: W, H: H, horiz: true, head: HEAD, foot: FOOT, pad: PAD,
      layers: arr.length, longest: 0, autoVertical: false, mode: 'timeline',
      axisY: axisY, axisX0: axisX0, axisX1: axisX1 };
  }

  /* ---------- 自动选型：按图形态挑最不容易读坏的那种 ---------- */
  function autoMode(g) {
    /* 用户显式写了 RL / BT，说明他要的就是那个方向 —— 自动选型不能抢这个决定。
       （RL/BT 是有向语义，不是「随便排一下」，改成 org 的 TD 会直接违背作者意图） */
    if (g.dir === 'RL' || g.dir === 'BT') return 'pipeline';

    var indeg = {}, outdeg = {}, self = false;
    g.nodes.forEach(function (n) { indeg[n.id] = 0; outdeg[n.id] = 0; });
    g.edges.forEach(function (e) {
      if (e.from === e.to) { self = true; return; }
      indeg[e.to]++; outdeg[e.from]++;
    });
    if (self) return 'pipeline';

    var multi = false;
    g.nodes.forEach(function (n) { if (indeg[n.id] > 1) multi = true; });
    /* 多父 = 有汇聚，分层流水才能表达「多条来源汇成一条」；导图/组织图是严格树 */
    if (multi) return 'pipeline';

    var d = depthMap(g), depth = 0, leaves = 0;
    g.nodes.forEach(function (n) {
      depth = Math.max(depth, d[n.id] || 0);
      if (outdeg[n.id] === 0) leaves++;
    });
    if (leaves >= 6 && g.nodes.length >= 7) return 'mindmap';
    if (depth >= 4 && leaves >= 3) return 'mindmap';
    if (depth >= 1 && depth <= 3 && g.nodes.length <= 26) return 'org';
    return 'pipeline';
  }

  /* ---------------- 3. 绘制 ---------------- */
  function labelText(lines, cx, cy, color, size, weight) {
    var lh = size * 1.48, y0 = cy - (lines.length - 1) * lh / 2 + size * 0.36;
    var style = 'font-family:' + FONT + ';font-size:' + size + 'px;font-weight:' + (weight || 600) + ';fill:' + color;
    return '<text text-anchor="middle" style="' + style + '">' + lines.map(function (s, i) {
      return '<tspan x="' + f(cx) + '" y="' + f(y0 + i * lh) + '">' + esc(s) + '</tspan>';
    }).join('') + '</text>';
  }
  function shapeMarkup(n, id, opt) {
    opt = opt || {};
    var x = n.x, y = n.y, w = n.w, h = n.h, cx = x + w / 2, cy = y + h / 2;
    var radius = (n.shape === 'circle' || n.shape === 'stadium') ? h / 2
      : (n.shape === 'round' ? 18 : (n.shape === 'subroutine' ? 6 : 11));
    var base = 'fill:var(--mf-card);stroke:var(--mf-stroke);stroke-width:var(--mf-node-sw,1.4)';
    if (n.kind === 'start') base = 'fill:var(--mf-ink);stroke:var(--mf-ink);stroke-width:1.3';
    if (n.kind === 'decision') base = 'fill:' + n.color.s + ';stroke:' + n.color.c + ';stroke-width:1.7';
    if (n.kind === 'end') base = 'fill:var(--mf-card);stroke:' + n.color.c + ';stroke-width:1.9';
    /* 多彩流水：节点底色直接取层级淡色，让「彩色」出现在主干上而不只是侧边色条。
       起点/判定/终点保留原有强调（它们是语义标记，不该被层级色覆盖）。 */
    if (opt.tint && n.kind === 'normal') {
      base = 'fill:' + n.color.s + ';stroke:' + n.color.c + ';stroke-width:1.5';
    }
    /* 时间图：每个节点就是一个时间里程碑，全部着色才看得出「阶段推进」；
       这里不走 kind 判断，因为时间图上大多节点恰好是 start/end。 */
    if (opt.tintAll) {
      base = 'fill:' + n.color.s + ';stroke:' + n.color.c + ';stroke-width:1.6';
    }
    var shadow = 'filter:url(#' + id + '-shadow)';
    var out = '';
    if (n.shape === 'diamond') {
      out += '<path class="mf-shape" d="' + roundPoly([
        { x: cx, y: y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x: x, y: cy }
      ], 12) + '" style="' + base + ';' + shadow + '"/>';
    } else if (n.shape === 'hexagon') {
      var s = 16;
      out += '<path class="mf-shape" d="' + roundPoly([
        { x: x + s, y: y }, { x: x + w - s, y: y }, { x: x + w, y: cy },
        { x: x + w - s, y: y + h }, { x: x + s, y: y + h }, { x: x, y: cy }
      ], 9) + '" style="' + base + ';' + shadow + '"/>';
    } else if (n.shape === 'para' || n.shape === 'trap' || n.shape === 'asym') {
      var k = 16;
      var pts = n.shape === 'trap'
        ? [{ x: x + k, y: y }, { x: x + w - k, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }]
        : [{ x: x + k, y: y }, { x: x + w, y: y }, { x: x + w - k, y: y + h }, { x: x, y: y + h }];
      out += '<path class="mf-shape" d="' + roundPoly(pts, 7) + '" style="' + base + ';' + shadow + '"/>';
    } else {
      out += '<rect class="mf-shape" x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) +
        '" rx="' + f(radius) + '" style="' + base + ';' + shadow + '"/>';
      if (n.shape === 'subroutine') {
        out += '<rect x="' + f(x + 5) + '" y="' + f(y + 5) + '" width="' + f(w - 10) + '" height="' + f(h - 10) +
          '" rx="4" style="fill:none;stroke:var(--mf-stroke);stroke-width:1"/>';
      }
      if (n.shape === 'cylinder') {
        out += '<path d="M' + f(x + 1) + ' ' + f(y + 9) + 'Q' + f(cx) + ' ' + f(y - 5) + ' ' + f(x + w - 1) + ' ' + f(y + 9) +
          '" style="fill:none;stroke:var(--mf-stroke);stroke-width:1.2"/>';
      }
    }
    return out;
  }

  function buildSVG(g, L) {
    var id = 'mf' + (++UID);
    var W = L.W, H = L.H, PAD = L.pad;
    var s = [];
    s.push('<svg class="mf-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
      '" width="' + W + '" height="' + H + '" role="img" aria-label="流程图：' + g.nodes.length + ' 个节点，' + g.edges.length + ' 条连线">');
    s.push('<defs>');
    s.push('<pattern id="' + id + '-dots" width="19" height="19" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1.05" style="fill:var(--mf-dot)"/></pattern>');
    s.push('<filter id="' + id + '-shadow" x="-25%" y="-35%" width="150%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="5" style="flood-color:var(--mf-shade);flood-opacity:var(--mf-shadow-op,.16)"/></filter>');
    s.push('<marker id="' + id + '-arrow" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 4 L0 8 Z" style="fill:var(--mf-edge)"/></marker>');
    s.push('<marker id="' + id + '-arrow-hi" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L10 4 L0 8 Z" style="fill:var(--mf-a1)"/></marker>');
    s.push('</defs>');

    /* 连线流水动效：样式随 SVG 一起走（下载 / 导出 HTML 后动画仍在）。
       两层同路径虚线（亮线 + 光晕）沿 stroke-dashoffset 匀速推进；
       周期 40 = dasharray 11+29，故所有边像素速度天然一致，无需测长度。 */
    s.push('<style>' +
      '.mf-flow,.mf-flow-halo{fill:none;stroke-linecap:round;pointer-events:none;' +
      'stroke-dasharray:11 29;animation:mf-stream 1.6s linear infinite}' +
      '.mf-flow{stroke-width:2.5;opacity:.92}' +
      '.mf-flow-halo{stroke-width:7;opacity:.14}' +
      '.mf-edge.is-hi .mf-flow{opacity:1;stroke-width:3.1}' +
      '.mf-edge.is-hi .mf-flow-halo{opacity:.26}' +
      '@keyframes mf-stream{from{stroke-dashoffset:0}to{stroke-dashoffset:-40}}' +
      /* 独立下载的 SVG 也要尊重系统动效偏好，且打印时不留虚线碎片 */
      '@media (prefers-reduced-motion:reduce){.mf-flow,.mf-flow-halo{display:none;animation:none}}' +
      '@media print{.mf-flow,.mf-flow-halo{display:none;animation:none}}' +
      '</style>');

    /* 画布与眉题 */
    s.push('<rect width="' + W + '" height="' + H + '" rx="14" style="fill:var(--mf-bg)"/>');
    s.push('<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="14" style="fill:url(#' + id + '-dots);opacity:var(--mf-dot-op,.62)"/>');

    /* 多彩流水：给每个阶段铺一条彩带，节点浮在彩带之上。
       这是「流水」最强的识别特征 —— 彩色出现在整条阶段上，
       而不只是每个节点里那点色条（节点大多是 start/end，色条面积太小）。
       必须画在画布背景之后：画在之前会被背景矩形整个盖掉。 */
    if (L.mode === 'pipeline' && L.stageBands && L.stageBands.length) {
      s.push('<g class="mf-bands">');
      L.stageBands.forEach(function (b, bi) {
        var col = ['--mf-a1b', '--mf-a2b', '--mf-a3b', '--mf-a4b'][bi % 4];
        s.push('<rect x="' + f(b.x) + '" y="' + f(b.y) + '" width="' + f(b.w) + '" height="' + f(b.h) +
          '" rx="10" style="fill:var(' + col + ',var(--mf-a1s));opacity:.9"/>');
      });
      s.push('</g>');
    }

    /* 时间图的中轴：先画在最底层，卡片覆盖其上；两端加圆帽表示「时间继续」 */
    if (L.mode === 'timeline') {
      var ay = L.axisY, ax0 = L.axisX0 - 46, ax1 = L.axisX1 + 46;
      s.push('<g class="mf-axis">');
      s.push('<line x1="' + f(ax0) + '" y1="' + f(ay) + '" x2="' + f(ax1) + '" y2="' + f(ay) +
        '" style="stroke:var(--mf-stroke);stroke-width:2.4;stroke-linecap:round"/>');
      s.push('<circle cx="' + f(ax0) + '" cy="' + f(ay) + '" r="4" style="fill:var(--mf-a2)"/>');
      s.push('<circle cx="' + f(ax1) + '" cy="' + f(ay) + '" r="4" style="fill:var(--mf-a2)"/>');
      s.push('</g>');
    }

    var micro = 'font-family:' + FONT + ';font-size:10.5px;font-weight:700;letter-spacing:1.5px;fill:var(--mf-sub)';
    s.push('<g class="mf-head">');
    s.push('<rect x="' + PAD + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a1)"/>');
    s.push('<rect x="' + (PAD + 12) + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a2)"/>');
    s.push('<rect x="' + (PAD + 24) + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a3)"/>');
    /* 风格配色全部走 CSS 变量：切换 html[data-flow-style] 时所有已渲染的图
       （含文本流程图）即时换肤，无需重绘；眉题只显示结构名与方向。 */
    var MODE_TAG = { pipeline: 'PIPELINE', mindmap: 'MINDMAP', org: 'ORG CHART', timeline: 'TIMELINE' };
    var modeTag = MODE_TAG[L.mode] || 'FLOWCHART';
    var dirTxt = L.mode === 'pipeline'
      ? (esc(g.effDir || g.dir) + (L.autoVertical ? ' / AUTO TD' : ''))
      : (L.mode === 'org' ? 'TD' : (L.mode === 'timeline' ? 'LR' : 'RADIAL'));
    s.push('<text x="' + (PAD + 43) + '" y="29" style="' + micro + '">' + modeTag + ' / ' + dirTxt + '</text>');
    s.push('<text x="' + (W - PAD) + '" y="29" text-anchor="end" style="' + micro + '">' +
      g.nodes.length + ' NODES · ' + g.edges.length + ' LINKS · ' + L.layers + ' STAGES</text>');
    s.push('<line x1="' + PAD + '" y1="' + (L.head - 14) + '" x2="' + (W - PAD) + '" y2="' + (L.head - 14) + '" style="stroke:var(--mf-line);stroke-width:1"/>');
    s.push('</g>');

    /* 边（先画，节点覆盖其上，保证端点干净） */
    s.push('<g class="mf-edges">');
    g.edges.forEach(function (e, ei) {
      var stroke = e.thick ? 'var(--mf-a1)' : 'var(--mf-edge)';
      var width = e.thick ? 2.6 : 1.7;
      /* 流水色跟随目标节点的层级强调色，形成「数据往下游汇聚」的层次 */
      var tint = (g.map[e.to] && g.map[e.to].color) ? g.map[e.to].color.c : 'var(--mf-a1)';
      var phase = (-(ei % 6) * 0.27).toFixed(2) + 's';
      var dim = e.dashed ? ';opacity:.5' : '';
      s.push('<g class="mf-edge" data-from="' + esc(e.from) + '" data-to="' + esc(e.to) + '">');
      s.push('<path d="' + e.path + '" style="fill:none;stroke:transparent;stroke-width:16"/>');
      /* 时间图：连线是「中轴 → 卡片」的挂接杆，加粗且不带箭头，避免满图中箭头的视觉噪音 */
      var tl = (L.mode === 'timeline');
      s.push('<path class="mf-line" d="' + e.path + '" style="fill:none;stroke:' + (tl ? 'var(--mf-stroke)' : stroke) +
        ';stroke-width:' + (tl ? 2 : width) +
        ';stroke-linecap:round;stroke-linejoin:round' + (e.dashed ? ';stroke-dasharray:6 6' : '') + '"' +
        ((e.arrow && !tl) ? ' marker-end="url(#' + id + '-arrow)"' : '') + '/>');
      s.push('<path class="mf-flow-halo" d="' + e.path + '" style="stroke:' + tint + ';animation-delay:' + phase + dim + '"/>');
      s.push('<path class="mf-flow" d="' + e.path + '" style="stroke:' + tint + ';animation-delay:' + phase + dim + '"/>');
      if (e.label) {
        var lw = Math.ceil(tw(e.label, FONT_SMALL)) + 22, lh = 24;
        s.push('<g class="mf-elabel">');
        s.push('<rect x="' + f(e.mx - lw / 2) + '" y="' + f(e.my - lh / 2) + '" width="' + lw + '" height="' + lh +
          '" rx="11" style="fill:var(--mf-card);stroke:var(--mf-line);stroke-width:1"/>');
        s.push('<text x="' + f(e.mx) + '" y="' + f(e.my + 4.1) + '" text-anchor="middle" style="font-family:' + FONT +
          ';font-size:11.5px;font-weight:600;fill:var(--mf-edge)">' + esc(e.label) + '</text>');
        s.push('</g>');
      }
      s.push('</g>');
    });
    s.push('</g>');

    /* 节点 */
    s.push('<g class="mf-nodes">');
    /* 导图 / 时间图：文字居中、无序号徽章 —— 这两类图靠位置表达结构，
       插编号反而干扰阅读。多彩流水与组织图保留编号。 */
    var bare = (L.mode === 'mindmap' || L.mode === 'timeline' || L.mode === 'org');
    var centerText = bare;
    g.nodes.forEach(function (n) {
      var cx = centerText ? n.x + n.w / 2 : n.x + 40 + (n.w - 54) / 2;
      var cy = n.y + n.h / 2;
      var isStart = n.kind === 'start', isDec = n.kind === 'decision';
      var textColor = isStart ? 'var(--mf-bg)' : 'var(--mf-ink)';
      s.push('<g class="mf-node mf-' + n.kind + (n.up ? ' mf-up' : '') + '" data-id="' + esc(n.id) + '">');
      s.push(shapeMarkup(n, id, { tint: (L.mode === 'pipeline'), tintAll: (L.mode === 'timeline') }));
      if (!bare && !isStart && !isDec) {
        s.push('<rect class="mf-bar" x="' + f(n.x + 1.5) + '" y="' + f(n.y + 12) + '" width="3.5" height="' + f(n.h - 24) +
          '" rx="2" style="fill:' + n.color.c + '"/>');
      }
      /* 导图：根节点左侧加一个实心圆点，作为视觉锚点 */
      if (L.mode === 'mindmap' && n.kind === 'start') {
        s.push('<circle cx="' + f(n.x + n.w / 2) + '" cy="' + f(n.y - 11) + '" r="4.2" style="fill:var(--mf-a1)"/>');
      }
      if (isDec) {
        s.push('<circle cx="' + f(n.x + n.w / 2) + '" cy="' + f(n.y + 6) + '" r="3.4" style="fill:' + n.color.c + '"/>');
      }
      if (n.kind === 'end' && !bare) {
        s.push('<circle cx="' + f(n.x + n.w - 12) + '" cy="' + f(n.y + 12) + '" r="4" style="fill:' + n.color.c + '"/>');
      }
      /* 序号徽章 */
      if (!bare) {
        s.push('<rect x="' + f(n.x + 13) + '" y="' + f(n.y + n.h / 2 - 10) + '" width="25" height="20" rx="6" style="fill:' +
          (isStart ? 'var(--mf-ink-soft)' : n.color.s) + '"/>');
        s.push('<text x="' + f(n.x + 25.5) + '" y="' + f(n.y + n.h / 2 + 3.7) + '" text-anchor="middle" style="font-family:' + FONT +
          ';font-size:10px;font-weight:800;letter-spacing:.4px;fill:' + (isStart ? 'var(--mf-bg)' : n.color.c) + '">' + n.num + '</text>');
      }
      s.push(labelText(n.lines, cx, cy, textColor, isDec ? 14.5 : 14, 600));
      s.push('</g>');
    });
    s.push('</g>');

    /* 页脚 */
    var fy = H - L.foot + 12;
    s.push('<g class="mf-foot">');
    s.push('<line x1="' + PAD + '" y1="' + fy + '" x2="' + (W - PAD) + '" y2="' + fy + '" style="stroke:var(--mf-line);stroke-width:1"/>');
    s.push('<text x="' + PAD + '" y="' + (fy + 17) + '" style="' + micro + '">MD READER · MD FLOW</text>');
    s.push('<text x="' + (W - PAD) + '" y="' + (fy + 17) + '" text-anchor="end" style="' + micro + '">AUTO LAYOUT · HOVER TO FOCUS</text>');
    s.push('</g>');
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------- 4. 交互与导出 ---------------- */
  function highlight(svg, key) {
    var nodes = svg.querySelectorAll('.mf-node'), edges = svg.querySelectorAll('.mf-edge');
    if (!key) {
      svg.classList.remove('has-focus');
      Array.prototype.forEach.call(nodes, function (n) { n.classList.remove('is-hi'); });
      Array.prototype.forEach.call(edges, function (e) { e.classList.remove('is-hi'); });
      return;
    }
    svg.classList.add('has-focus');
    var rel = {}; rel[key] = 1;
    Array.prototype.forEach.call(edges, function (e) {
      var a = e.getAttribute('data-from'), b = e.getAttribute('data-to');
      var hit = (a === key || b === key);
      e.classList.toggle('is-hi', hit);
      if (hit) { rel[a] = 1; rel[b] = 1; }
    });
    Array.prototype.forEach.call(nodes, function (n) {
      n.classList.toggle('is-hi', !!rel[n.getAttribute('data-id')]);
    });
  }
  function cssVars() {
    var cs = getComputedStyle(document.documentElement), out = {};
    var names = ['--mf-bg', '--mf-card', '--mf-ink', '--mf-ink-soft', '--mf-sub', '--mf-line', '--mf-stroke', '--mf-dot',
      '--mf-edge', '--mf-shade', '--mf-a1', '--mf-a2', '--mf-a3', '--mf-a4',
      '--mf-a1s', '--mf-a2s', '--mf-a3s', '--mf-a4s',
      '--mf-a1b', '--mf-a2b', '--mf-a3b', '--mf-a4b',
      '--mf-shadow-op', '--mf-node-sw', '--mf-dot-op'];
    names.forEach(function (k) {
      var v = (cs.getPropertyValue(k) || '').trim();
      for (var i = 0; i < 4 && /var\(/.test(v); i++) {
        v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, function (all, n) {
          return (cs.getPropertyValue(n) || '').trim() || all;
        });
      }
      out[k] = v;
    });
    return out;
  }
  /* 支持 var(--x)、带兜底的 var(--x, 1.4)，以及嵌套兜底 var(--x,var(--y))。
     彩带 fill 写作 var(--mf-a1b,var(--mf-a1s))：一次正则替换只能吃掉内层
     （→var(--mf-a1b,#eaf1ff)），外层会残留；故循环替换到收敛，导出 SVG 才真正不含 var()。 */
  function inlineVars(text) {
    var map = cssVars();
    /* fallback 允许含一层括号：彩带写作 var(--mf-a1b,var(--mf-a1s))，
       内层展开后可能得到 var(--mf-a1b,rgb(231,232,234))。若仍用 [^()]*，
       外层将永远匹配不上，导出 SVG 残留 var(--mf-a1b,rgb(...))，
       在 Word / 离线 SVG 里丢掉色带真实颜色。 */
    var re = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;
    var out = String(text);
    for (var i = 0; i < 8 && /var\(/.test(out); i++) {
      var next = out.replace(re, function (all, k, fb) {
        return map[k] || (fb != null ? fb.trim() : all);
      });
      if (next === out) break; /* 无定义且无兜底：保留原样，避免死循环 */
      out = next;
    }
    return out;
  }
  function serialize(svg) {
    var clone = svg.cloneNode(true);
    /* 导出的是「最后编辑状态」的图形，但不含编辑器 UI 与选中描边 */
    MDEdit.cleanForExport(clone);
    clone.removeAttribute('class');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', svg.viewBox.baseVal.width);
    clone.setAttribute('height', svg.viewBox.baseVal.height);
    var text = new XMLSerializer().serializeToString(clone);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + inlineVars(text);
  }
  function download(svg) {
    var data = serialize(svg);
    var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'MD-Reader-Flow-' + Date.now() + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function copy(text, btn) {
    var ok = function () {
      var old = btn.textContent; btn.textContent = '已复制'; btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1400);
    };
    function legacy() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      ta.remove(); ok();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, legacy);
    } else legacy();
  }
  function bind(svg, src, tools, host) {
    /* 事件委托：MDEdit.applyAll() 会重建 svg.innerHTML 回放编辑状态，
       直接绑在 .mf-node 上的监听器会被一并抹掉，故委托到 svg 根节点。 */
    var hoverId = null;
    svg.addEventListener('mouseover', function (ev) {
      if (svg.classList.contains('is-editing')) return;
      var n = ev.target.closest && ev.target.closest('.mf-node');
      var id = n ? n.getAttribute('data-id') : null;
      if (id === hoverId) return;
      hoverId = id;
      highlight(svg, id);
    });
    svg.addEventListener('mouseleave', function () {
      hoverId = null;
      highlight(svg, null);
    });
    tools.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'svg') download(svg);
      else if (act === 'copy') copy(MDEdit.currentSource(svg, src), b);
      else if (act === 'edit') MDEdit.toggle(svg);
      else if (act === 'mode') {
        /* 单图结构覆盖：只重绘这一张图，选择按 src hash 持久化，全局 MODE 不动。
           render() 会重建整条工具条并 bind 新监听器；旧 tools 节点随之移除。
           MDEdit.attach() 回放 content（文字/颜色/增删）；pos 按新的 L.mode 分桶，
           因此切结构后节点回到该结构的自动布局，编辑内容不会丢。 */
        var m = b.getAttribute('data-mode');
        if (MODE_LABELS[m] && host) {
          try { render(src, host, { mode: m }); }
          catch (e) { if (global.console) console.warn('[MD FLOW] 单图结构切换失败：', e); }
        }
      }
      else MDEdit.command(svg, act, b);
    });
  }

  /* ---------------- 5. 可视化编辑 ----------------
     设计要点（决定「导出以最后编辑状态为准」能否成立）：
       1. 所有编辑直接落在**当前 SVG DOM**上：节点 transform / tspan 文本 / 边 path 的 d。
          serialize() 与 app.js 的 cloneForExport() clone 的都是这个 DOM，
          因此导出天然就是最后编辑状态，不存在「重新渲染覆盖编辑」的问题。
       2. 但切结构 / 切主题 / 重开文档会重建 SVG，故把编辑存成两层 state 并持久化：
          · content（文字 / 强调色 / 增删节点与连线）按 src 存，与结构无关
          · pos（节点绝对坐标）按 src + mode 存，切结构时位置回到自动布局
          render() 结束时自动回放，编辑不丢。
       3. 拖拽时边不重算布局，而是对**原始路径**做「端点位移插值」：
          起点严格跟随 from 节点、终点严格跟随 to 节点，中间按 t 线性过渡，
          贝塞尔 / 肘形 / 折线形状原样保留；每次基于 d0 重算，重复拖动不累积误差。
       4. 编辑器 UI（工具按钮组 / 属性面板 / 选中描边）不进导出：
          MDEdit.cleanForExport() 在 serialize / cloneForExport 时剥离。 */
  var MDEdit = (function () {
    var PREFIX = 'mdreader-mdflow-edit-';
    var PALETTE = ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#475569'];
    var NS = 'http://www.w3.org/2000/svg';

    function h32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h.toString(36); }
    /* 强调色 → 浅色底（混白）。mermaid-flow.js 没有 app.js 的 tint()，这里自带一份 */
    function mixWhite(hex, k) {
      var s = String(hex).replace('#', '');
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      var n = parseInt(s, 16); if (isNaN(n)) return hex;
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return 'rgb(' + Math.round(r + (255 - r) * k) + ',' + Math.round(g + (255 - g) * k) + ',' + Math.round(b + (255 - b) * k) + ')';
    }
    function get(k) { try { var v = global.localStorage && global.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function set(k, v) { try { global.localStorage && global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    function keys(src, mode) { var h = h32(String(src)); return { c: PREFIX + 'c-' + h, p: PREFIX + 'p-' + h + '-' + mode }; }
    function blank() { return { labels: {}, colors: {}, removed: [], addedNodes: [], addedEdges: [], removedEdges: [] }; }
    function load(src, mode) { var k = keys(src, mode); return { content: get(k.c) || blank(), pos: get(k.p) || {}, keys: k, mode: mode, src: src }; }
    function save(st) { set(st.keys.c, st.content); set(st.keys.p, st.pos); }
    function clear(st) {
      try {
        var ls = global.localStorage; if (!ls) return;
        var h = h32(String(st.src)), pc = PREFIX + 'p-' + h + '-', cc = PREFIX + 'c-' + h;
        for (var i = ls.length - 1; i >= 0; i--) { var k = ls.key(i); if (k === cc || k.indexOf(pc) === 0) ls.removeItem(k); }
      } catch (e) { }
    }
    function snap(st) { return JSON.parse(JSON.stringify({ content: st.content, pos: st.pos })); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function nodeById(svg, id) {
      var ns = svg.querySelectorAll('.mf-node');
      for (var i = 0; i < ns.length; i++) if (ns[i].getAttribute('data-id') === id) return ns[i];
      return null;
    }
    function edgeKey(a, b) { return a + '>' + b; }

    /* 端点位移插值：把 d 里所有坐标按「在路径上的序号 t」加上 from→to 的位移。
       M/L 每 2 个数一组、C 拆成 c1/c2/p3 三组、V/H 每个数一组，
       于是贝塞尔四点的 t 恰好是 0 / 1/3 / 2/3 / 1，形状完全保留。 */
    function transformPath(d, dF, dT) {
      var re = /([A-Za-z])([^A-Za-z]*)/g, m, segs = [], total = 0;
      while ((m = re.exec(d))) {
        var cmd = m[1], up = cmd.toUpperCase();
        var nums = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number);
        var groups = [], i, j, step;
        if (up === 'M' || up === 'L' || up === 'T') {
          for (i = 0; i + 1 < nums.length; i += 2) groups.push([nums[i], nums[i + 1]]);
        } else if (up === 'C' || up === 'S' || up === 'Q') {
          step = up === 'C' ? 6 : 4;
          for (i = 0; i + step <= nums.length; i += step)
            for (j = 0; j < step; j += 2) groups.push([nums[i + j], nums[i + j + 1]]);
        } else if (up === 'V' || up === 'H') {
          nums.forEach(function (v) { groups.push([v]); });
        } else if (nums.length) groups.push(nums.slice());
        segs.push({ cmd: cmd, up: up, groups: groups });
        total += groups.length;
      }
      var k = 0, out = '';
      segs.forEach(function (s) {
        out += s.cmd;
        s.groups.forEach(function (g) {
          var t = total > 1 ? k / (total - 1) : 0;
          /* V/H 只改一个坐标，却常常决定「末段的 x / y」：按序号插值时，
             组织图肘形线 `M…V…H…V…` 的 H 会拿到 t=2/3 的中间值，
             终点因此脱离 to 节点。改为「前半跟 from、后半跟 to」，
             两端严格锚定在各自节点上。 */
          var tail = g.length === 1 && total > 1 && k > (total - 1) / 2;
          var dx = tail ? dT.x : dF.x + (dT.x - dF.x) * t;
          var dy = tail ? dT.y : dF.y + (dT.y - dF.y) * t;
          k++;
          if (g.length === 1) out += ' ' + f(s.up === 'H' ? g[0] + dx : g[0] + dy);
          else {
            out += ' ' + f(g[0] + dx) + ' ' + f(g[1] + dy);
            for (var q = 2; q + 1 < g.length; q += 2) out += ' ' + f(g[q] + dx) + ' ' + f(g[q + 1] + dy);
          }
        });
      });
      return out;
    }

    function linkPath(a, b) {
      var ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      var dx = bc.x - ac.x, dy = bc.y - ac.y;
      function port(n, ox, oy) {
        var sx = Math.abs(ox) < 1e-6 ? Infinity : (n.w / 2) / Math.abs(ox);
        var sy = Math.abs(oy) < 1e-6 ? Infinity : (n.h / 2) / Math.abs(oy);
        var k = Math.min(sx, sy);
        return { x: n.x + n.w / 2 + ox * k, y: n.y + n.h / 2 + oy * k };
      }
      var p0 = port(a, dx, dy), p3 = port(b, -dx, -dy), mx = (p0.x + p3.x) / 2;
      return 'M' + f(p0.x) + ' ' + f(p0.y) + ' C' + f(mx) + ' ' + f(p0.y) + ',' + f(mx) + ' ' + f(p3.y) + ',' + f(p3.x) + ' ' + f(p3.y);
    }
    function setLabel(node, label) {
      var t = node.querySelector('text'); if (!t) return;
      var sp = t.querySelectorAll('tspan'); if (!sp.length) return;
      var mm = /font-size:\s*([\d.]+)px/.exec(t.getAttribute('style') || '');
      var size = mm ? parseFloat(mm[1]) : 14, lh = size * 1.48;
      var y0 = parseFloat(sp[0].getAttribute('y'));
      var cy = y0 + (sp.length - 1) * lh / 2 - size * 0.36;
      var lines = String(label == null ? '' : label).split(/\r?\n/).slice(0, 4).map(function (s) { return s.trim() || ' '; });
      var base = cy - (lines.length - 1) * lh / 2 + size * 0.36, cx = sp[0].getAttribute('x');
      t.innerHTML = lines.map(function (s, i) { return '<tspan x="' + cx + '" y="' + f(base + i * lh) + '">' + esc(s) + '</tspan>'; }).join('');
    }
    function setColor(node, color) {
      var light = mixWhite(color, .8);
      var sh = node.querySelector('.mf-shape');
      if (sh) sh.setAttribute('style', (sh.getAttribute('style') || '').replace(/fill:\s*[^;]+/, 'fill:' + light).replace(/stroke:\s*[^;]+/, 'stroke:' + color));
      var bar = node.querySelector('.mf-bar');
      if (bar) bar.setAttribute('style', 'fill:' + color);
      Array.prototype.forEach.call(node.querySelectorAll('circle'), function (c) {
        c.setAttribute('style', (c.getAttribute('style') || '').replace(/fill:\s*[^;]+/, 'fill:' + color));
      });
      Array.prototype.forEach.call(node.querySelectorAll('rect'), function (r) {
        if (r.classList.contains('mf-shape') || r.classList.contains('mf-bar')) return;
        r.setAttribute('style', 'fill:' + light);
      });
      var badge = node.querySelector('text[style*="font-size:10"]');
      if (badge) badge.setAttribute('style', (badge.getAttribute('style') || '').replace(/fill:\s*[^;]+/, 'fill:' + color));
    }
    function makeNode(id, label, color, x, y, w, h) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'mf-node mf-normal');
      g.setAttribute('data-id', id);
      g.innerHTML =
        '<rect class="mf-shape" x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) +
        '" rx="11" style="fill:' + mixWhite(color, .8) + ';stroke:' + color + ';stroke-width:1.6"/>' +
        '<rect class="mf-bar" x="' + f(x + 1.5) + '" y="' + f(y + 12) + '" width="3.5" height="' + f(h - 24) + '" rx="2" style="fill:' + color + '"/>' +
        labelText(String(label).split(/\r?\n/).slice(0, 4), x + w / 2, y + h / 2, 'var(--mf-ink)', 14, 600);
      return g;
    }
    function makeEdge(svg, from, to, d, label) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'mf-edge');
      g.setAttribute('data-from', from); g.setAttribute('data-to', to);
      g.setAttribute('data-key', edgeKey(from, to));
      var sample = svg.querySelector('.mf-line'), marker = sample ? sample.getAttribute('marker-end') : '';
      if (!marker) { var mk = svg.querySelector('marker'); if (mk) marker = 'url(#' + mk.id + ')'; }
      g.innerHTML = '<path d="' + d + '" style="fill:none;stroke:transparent;stroke-width:16"/>' +
        '<path class="mf-line" d="' + d + '" style="fill:none;stroke:var(--mf-edge);stroke-width:1.7;stroke-linecap:round"' +
        (marker ? ' marker-end="' + marker + '"' : '') + '/>' +
        (label ? '<g class="mf-elabel"><text x="0" y="0" style="font-size:11px">' + esc(label) + '</text></g>' : '');
      return g;
    }

    function refreshEdges(edges, base, cur) {
      edges.forEach(function (e) {
        if (!e.parentNode) return;
        var a = e.getAttribute('data-from'), b = e.getAttribute('data-to');
        var ba = base[a], bb = base[b], ca = cur[a], cb = cur[b];
        if (!ba || !bb || !ca || !cb) return;
        var dF = { x: ca.x - ba.x, y: ca.y - ba.y }, dT = { x: cb.x - bb.x, y: cb.y - bb.y };
        var d0 = e.getAttribute('data-d0'); if (!d0) return;
        var nd = transformPath(d0, dF, dT);
        Array.prototype.forEach.call(e.querySelectorAll('path'), function (p) { p.setAttribute('d', nd); });
        var lab = e.querySelector('.mf-elabel');
        if (lab) lab.setAttribute('transform', 'translate(' + f((dF.x + dT.x) / 2) + ' ' + f((dF.y + dT.y) / 2) + ')');
      });
    }

    /* 把整份 state 重放到干净 DOM 上：撤销 / 新增 / 删除 / 重绘回放都走这里 */
    function applyAll(svg, ctx) {
      var st = ctx.st, g = ctx.g, L = ctx.L;
      svg.innerHTML = ctx.initHTML;
      var nodesG = svg.querySelector('.mf-nodes'), edgesG = svg.querySelector('.mf-edges');
      Array.prototype.forEach.call(svg.querySelectorAll('.mf-edge'), function (e) {
        var p = e.querySelector('.mf-line') || e.querySelector('path');
        if (p && !e.getAttribute('data-d0')) e.setAttribute('data-d0', p.getAttribute('d'));
        if (!e.getAttribute('data-key')) e.setAttribute('data-key', edgeKey(e.getAttribute('data-from'), e.getAttribute('data-to')));
      });
      var base = {}, cur = {};
      g.nodes.forEach(function (n) { base[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; cur[n.id] = { x: n.x, y: n.y }; });
      st.content.removed.forEach(function (id) {
        var n = nodeById(svg, id); if (n) n.remove();
        delete base[id]; delete cur[id];
      });
      st.content.removedEdges.forEach(function (k) {
        Array.prototype.forEach.call(edgesG ? edgesG.querySelectorAll('.mf-edge') : [], function (e) {
          if (e.getAttribute('data-key') === k) e.remove();
        });
      });
      st.content.addedNodes.forEach(function (n) {
        var el = makeNode(n.id, st.content.labels[n.id] || n.label, st.content.colors[n.id] || n.color, n.x, n.y, n.w, n.h);
        if (nodesG) nodesG.appendChild(el);
        base[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
        cur[n.id] = { x: n.x, y: n.y };
      });
      st.content.addedEdges.forEach(function (e) {
        if (!base[e.from] || !base[e.to]) return;
        var k = edgeKey(e.from, e.to);
        var exists = edgesG && Array.prototype.slice.call(edgesG.querySelectorAll('.mf-edge'))
          .some(function (x) { return x.getAttribute('data-key') === k; });
        if (exists) return;
        var d = linkPath(base[e.from], base[e.to]);
        var el = makeEdge(svg, e.from, e.to, d, e.label);
        el.setAttribute('data-d0', d);
        if (edgesG) edgesG.appendChild(el);
      });
      Object.keys(st.content.labels).forEach(function (id) {
        var n = nodeById(svg, id); if (n) setLabel(n, st.content.labels[id]);
      });
      Object.keys(st.content.colors).forEach(function (id) {
        var n = nodeById(svg, id); if (n) setColor(n, st.content.colors[id]);
      });
      Object.keys(st.pos).forEach(function (id) {
        if (base[id]) cur[id] = { x: st.pos[id].x, y: st.pos[id].y };
      });
      Array.prototype.forEach.call(svg.querySelectorAll('.mf-node'), function (n) {
        var id = n.getAttribute('data-id'), b = base[id], c = cur[id];
        if (!b || !c) return;
        n.setAttribute('transform', 'translate(' + f(c.x - b.x) + ' ' + f(c.y - b.y) + ')');
      });
      ctx.base = base; ctx.cur = cur;
      ctx.edges = Array.prototype.slice.call(svg.querySelectorAll('.mf-edge'));
      refreshEdges(ctx.edges, base, cur);
    }

    function push(ctx) { ctx.history.push(snap(ctx.st)); if (ctx.history.length > 30) ctx.history.shift(); }
    function scaleOf(svg) {
      var vb = svg.viewBox && svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      return (vb && vb.width && r.width) ? vb.width / r.width : 1;
    }
    function setPos(ctx, id, x, y) {
      var b = ctx.base[id]; if (!b) return;
      ctx.cur[id] = { x: x, y: y };
      ctx.st.pos[id] = { x: f(x), y: f(y) };
      var n = nodeById(ctx.svg, id);
      if (n) n.setAttribute('transform', 'translate(' + f(x - b.x) + ' ' + f(y - b.y) + ')');
      refreshEdges(ctx.edges, ctx.base, ctx.cur);
    }
    function select(ctx, id) {
      Array.prototype.forEach.call(ctx.svg.querySelectorAll('.is-selected, .is-linksrc'), function (n) {
        n.classList.remove('is-selected', 'is-linksrc');
      });
      ctx.sel = id;
      var p = ctx.panel;
      if (!id) { p.hidden = true; return; }
      /* 同一页可能有多张流程图：只展开当前这一张的属性面板 */
      Array.prototype.forEach.call(document.querySelectorAll('.mf-editor'), function (o) {
        if (o !== p) o.hidden = true;
      });
      var n = nodeById(ctx.svg, id); if (n) n.classList.add('is-selected');
      p.hidden = false;
      var lab = ctx.st.content.labels[id];
      if (lab == null) {
        var t = n && n.querySelector('text');
        lab = t ? Array.prototype.map.call(t.querySelectorAll('tspan'), function (s) { return s.textContent; }).join('\n') : '';
      }
      p.querySelector('.mf-ed-label').value = lab;
      p.querySelector('.mf-ed-id').textContent = id;
      var c = ctx.st.content.colors[id];
      Array.prototype.forEach.call(p.querySelectorAll('button[data-ed="color"]'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-color') === c);
      });
    }
    function delNode(ctx, id) {
      if (!id) return;
      push(ctx);
      if (ctx.st.content.removed.indexOf(id) < 0) ctx.st.content.removed.push(id);
      Array.prototype.forEach.call(ctx.svg.querySelectorAll('.mf-edge'), function (e) {
        if (e.getAttribute('data-from') === id || e.getAttribute('data-to') === id) {
          var k = e.getAttribute('data-key');
          if (k && ctx.st.content.removedEdges.indexOf(k) < 0) ctx.st.content.removedEdges.push(k);
        }
      });
      ctx.st.content.addedEdges = ctx.st.content.addedEdges.filter(function (e) { return e.from !== id && e.to !== id; });
      applyAll(ctx.svg, ctx); save(ctx.st); select(ctx, null);
    }
    function addEdge(ctx, from, to) {
      var k = edgeKey(from, to);
      if (ctx.edges.some(function (e) { return e.getAttribute('data-key') === k; })) return;
      push(ctx);
      ctx.st.content.addedEdges.push({ from: from, to: to, label: '' });
      applyAll(ctx.svg, ctx); save(ctx.st);
    }
    function bindEvents(ctx) {
      var svg = ctx.svg;
      svg.addEventListener('pointerdown', function (ev) {
        if (!ctx.editing) return;
        var n = ev.target.closest ? ev.target.closest('.mf-node') : null;
        if (!n) { select(ctx, null); return; }
        var id = n.getAttribute('data-id');
        if (ctx.linkMode) {
          if (!ctx.linkFrom) { ctx.linkFrom = id; n.classList.add('is-linksrc'); }
          else if (ctx.linkFrom !== id) {
            addEdge(ctx, ctx.linkFrom, id);
            ctx.linkFrom = null; ctx.linkMode = false;
            var lb = ctx.tools.querySelector('[data-act="link"]'); if (lb) lb.classList.remove('on');
          } else { ctx.linkFrom = null; n.classList.remove('is-linksrc'); }
          return;
        }
        var b = ctx.base[id], c = ctx.cur[id];
        if (!b || !c) return;
        ctx.drag = { id: id, x0: ev.clientX, y0: ev.clientY, bx: c.x, by: c.y, w: b.w, h: b.h, moved: false };
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { }
        select(ctx, id);
      });
      svg.addEventListener('pointermove', function (ev) {
        var d = ctx.drag; if (!d) return;
        var k = scaleOf(svg), dx = (ev.clientX - d.x0) / k, dy = (ev.clientY - d.y0) / k;
        /* 只有真正开始拖动才记一次撤销点：单纯点选不会污染 history */
        if (Math.abs(dx) + Math.abs(dy) > 1 && !d.moved) { d.moved = true; push(ctx); }
        var x = clamp(d.bx + dx, ctx.L.pad, ctx.L.W - ctx.L.pad - d.w);
        var y = clamp(d.by + dy, ctx.L.head + 8, ctx.L.H - ctx.L.foot - d.h - 8);
        setPos(ctx, d.id, x, y);
      });
      function endDrag(ev) {
        if (!ctx.drag) return;
        ctx.drag = null;
        try { svg.releasePointerCapture(ev.pointerId); } catch (e) { }
        save(ctx.st);
      }
      svg.addEventListener('pointerup', endDrag);
      svg.addEventListener('pointercancel', endDrag);
      svg.addEventListener('dblclick', function (ev) {
        if (!ctx.editing) return;
        var n = ev.target.closest && ev.target.closest('.mf-node'); if (!n) return;
        select(ctx, n.getAttribute('data-id'));
        var ta = ctx.panel.querySelector('.mf-ed-label'); if (ta) { ta.focus(); ta.select(); }
      });
      ctx.panel.addEventListener('input', function (ev) {
        if (!ev.target.classList.contains('mf-ed-label') || !ctx.sel) return;
        var v = ev.target.value;
        ctx.st.content.labels[ctx.sel] = v;
        var n = nodeById(svg, ctx.sel); if (n) setLabel(n, v);
        save(ctx.st);
      });
      ctx.panel.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('button[data-ed]'); if (!b) return;
        var a = b.getAttribute('data-ed');
        if (a === 'close') select(ctx, null);
        else if (a === 'del') delNode(ctx, ctx.sel);
        else if (a === 'resetpos' && ctx.sel) {
          push(ctx); delete ctx.st.pos[ctx.sel];
          applyAll(svg, ctx); save(ctx.st); select(ctx, ctx.sel);
        } else if (a === 'color' && ctx.sel) {
          var c = b.getAttribute('data-color');
          push(ctx); ctx.st.content.colors[ctx.sel] = c;
          var n = nodeById(svg, ctx.sel); if (n) setColor(n, c);
          save(ctx.st); select(ctx, ctx.sel);
        }
      });
    }
    function attach(svg, src, tools, art, g, L) {
      var panel = document.createElement('div');
      panel.className = 'mf-editor'; panel.hidden = true;
      panel.innerHTML =
        '<div class="mf-ed-head"><b>节点编辑</b><span class="mf-ed-id"></span><button type="button" data-ed="close" title="关闭">×</button></div>' +
        '<label class="mf-ed-field"><span>文字（回车换行）</span><textarea class="mf-ed-label" rows="2" spellcheck="false"></textarea></label>' +
        '<div class="mf-ed-field"><span>强调色</span><div class="mf-ed-colors">' +
        PALETTE.map(function (c) { return '<button type="button" data-ed="color" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></button>'; }).join('') +
        '</div></div>' +
        '<div class="mf-ed-foot"><button type="button" data-ed="resetpos">复位位置</button><button type="button" data-ed="del" class="danger">删除节点</button></div>';
      /* 面板插在「工具条」与「画布」之间：随文档流排布，不被 overflow 裁切，
         也不会像浮层那样随宽图横向滚动跑出视野。 */
      var wrap = art.parentElement || art;
      wrap.insertBefore(panel, art);
      var ctx = {
        svg: svg, src: src, tools: tools, art: art, wrap: wrap, g: g, L: L,
        st: load(src, L.mode), initHTML: svg.innerHTML, panel: panel,
        history: [], drag: null, sel: null, linkMode: false, linkFrom: null, editing: false,
        base: {}, cur: {}, edges: []
      };
      svg.__mfEdit = ctx;
      applyAll(svg, ctx);
      bindEvents(ctx);
      return ctx;
    }
    function ctxOf(svg) { return svg && svg.__mfEdit; }
    function toggle(svg) {
      var ctx = ctxOf(svg); if (!ctx) return;
      ctx.editing = !ctx.editing;
      svg.classList.toggle('is-editing', ctx.editing);
      var acts = ctx.tools.querySelector('.mf-edit-actions'); if (acts) acts.hidden = !ctx.editing;
      var eb = ctx.tools.querySelector('[data-act="edit"]');
      if (eb) { eb.classList.toggle('on', ctx.editing); eb.textContent = ctx.editing ? '✓ 编辑中' : '✎ 编辑'; }
      if (!ctx.editing) { select(ctx, null); ctx.linkMode = false; ctx.linkFrom = null; }
      highlight(svg, null);
    }
    function command(svg, act, b) {
      var ctx = ctxOf(svg); if (!ctx) return false;
      if (act === 'add') {
        push(ctx);
        var id = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
        ctx.st.content.addedNodes.push({
          id: id, label: '新节点', color: PALETTE[ctx.st.content.addedNodes.length % PALETTE.length],
          x: f(ctx.L.W / 2 - 60), y: f(ctx.L.H / 2 - 27), w: 120, h: 54
        });
        applyAll(svg, ctx); save(ctx.st); select(ctx, id); return true;
      }
      if (act === 'link') {
        ctx.linkMode = true; ctx.linkFrom = null;
        b.classList.add('on');
        return true;
      }
      if (act === 'undo') {
        if (!ctx.history.length) return true;
        var s = ctx.history.pop();
        ctx.st.content = s.content; ctx.st.pos = s.pos;
        applyAll(svg, ctx); save(ctx.st); select(ctx, null); return true;
      }
      if (act === 'reset') {
        clear(ctx.st);
        ctx.st = load(ctx.src, ctx.L.mode); ctx.history = [];
        applyAll(svg, ctx); select(ctx, null); return true;
      }
      if (act === 'done') { toggle(svg); return true; }
      return false;
    }
    function isDirty(ctx) {
      var c = ctx.st.content;
      return !!(Object.keys(c.labels).length || Object.keys(c.colors).length || c.removed.length ||
        c.addedNodes.length || c.addedEdges.length || c.removedEdges.length);
    }
    function toMermaid(src, st) {
      var g = parse(src); if (!g) return src;
      var head = 'flowchart ' + (g.dir || 'TD'), ls = String(src).split(/\r?\n/);
      for (var i = 0; i < ls.length; i++) {
        var m = /^\s*(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/i.exec(ls[i]);
        if (m) { head = m[1] + ' ' + m[2].toUpperCase(); break; }
      }
      var out = [head], c = st.content;
      function q(s) { return String(s == null ? '' : s).replace(/\r?\n/g, '<br/>').replace(/"/g, '#quot;'); }
      /* 形状还原表：与 readNode / SHAPES 一一对应，避免「编辑后复制源码」把菱形变回方箱 */
      var OPEN = { subroutine: '[[', cylinder: '[(', circle: '((', stadium: '([', hexagon: '{{',
        para: '[/', trap: '[/', diamond: '{', rect: '[', round: '(', asym: '>' };
      var CLOSE = { subroutine: ']]', cylinder: ')]', circle: '))', stadium: '])', hexagon: '}}',
        para: '/]', trap: '\\]', diamond: '}', rect: ']', round: ')', asym: ']' };
      function nodeLine(n, label) {
        var o = OPEN[n.shape] || '[', cl = CLOSE[n.shape] || ']';
        return '  ' + n.id + o + '"' + q(label) + '"' + cl;
      }
      function edgeLine(from, to, e) {
        var tok = (e && /^(-->|-\.->|==+>|---|--o|--x|<-->)$/.test(e.token || '')) ? e.token : '-->';
        return '  ' + from + ' ' + tok + (e && e.label ? '|' + e.label + '|' : '') + ' ' + to;
      }
      g.nodes.forEach(function (n) {
        if (c.removed.indexOf(n.id) >= 0) return;
        out.push(nodeLine(n, c.labels[n.id] != null ? c.labels[n.id] : (n.label || n.id)));
      });
      c.addedNodes.forEach(function (n) {
        out.push(nodeLine({ id: n.id, shape: 'rect' }, c.labels[n.id] != null ? c.labels[n.id] : n.label));
      });
      g.edges.forEach(function (e) {
        if (c.removed.indexOf(e.from) >= 0 || c.removed.indexOf(e.to) >= 0) return;
        if (c.removedEdges.indexOf(edgeKey(e.from, e.to)) >= 0) return;
        out.push(edgeLine(e.from, e.to, e));
      });
      c.addedEdges.forEach(function (e) {
        if (c.removed.indexOf(e.from) >= 0 || c.removed.indexOf(e.to) >= 0) return;
        out.push(edgeLine(e.from, e.to, null));
      });
      return out.join('\n');
    }
    function currentSource(svg, src) {
      var ctx = ctxOf(svg);
      return (ctx && isDirty(ctx)) ? toMermaid(src, ctx.st) : src;
    }
    /* 导出前剥离编辑器 UI 与编辑态，但**保留**编辑后的图形内容 */
    function cleanForExport(root) {
      if (!root) return root;
      if (root.querySelectorAll) {
        Array.prototype.forEach.call(root.querySelectorAll('.mf-editor,.mf-edit-actions'), function (n) { n.remove(); });
      }
      var svgs = [];
      if (root.classList && root.classList.contains('mf-svg')) svgs.push(root);
      if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('.mf-svg'), function (s) { svgs.push(s); });
      svgs.forEach(function (svg) {
        svg.classList.remove('is-editing', 'has-focus');
        Array.prototype.forEach.call(svg.querySelectorAll('*'), function (n) {
          if (n.classList) n.classList.remove('is-selected', 'is-hi', 'is-linksrc');
          if (n.removeAttribute) { n.removeAttribute('data-d0'); n.removeAttribute('data-key'); }
        });
      });
      return root;
    }
    return {
      attach: attach, toggle: toggle, command: command, currentSource: currentSource,
      transformPath: transformPath, toMermaid: toMermaid, cleanForExport: cleanForExport
    };
  })();

  /* 宽图保护：优先等比缩放到阅读区（适配页面 / Word / 打印）；
     只有画布宽到超过阅读区 1.8 倍、继续压缩会让节点文字不可读时，
     才改 1:1 显示 + 容器横向滚动。长节点已在 layout 阶段折行并自动竖向重排。
     窗口缩放 / 侧栏折叠实时重算。 */
  function fitArt(art, svg, W) {
    function apply() {
      var avail = art.clientWidth;
      if (!avail) return;
      var wide = W > avail * 1.8;
      svg.classList.toggle('is-wide', wide);
      art.classList.toggle('has-wide', wide);
      var meta = art.parentElement && art.parentElement.querySelector('.mf-meta');
      if (meta) {
        var tip = ' · 宽图可横向滚动';
        var on = meta.getAttribute('data-wide-tip') === '1';
        if (wide && !on) { meta.textContent += tip; meta.setAttribute('data-wide-tip', '1'); }
        if (!wide && on) { meta.textContent = meta.textContent.split(tip).join(''); meta.removeAttribute('data-wide-tip'); }
      }
    }
    apply();
    if (typeof ResizeObserver !== 'undefined') {
      try { new ResizeObserver(apply).observe(art); } catch (e) { }
    }
  }

  function render(src, host, opts) {
    opts = opts || {};
    var g = parse(src);
    if (!g) return false;
    try {
      /* 单图结构优先级：本次显式切换 > 该图持久化的覆盖 > 全局默认（设置里的 flowMode）。
         全局 setMode() 只作为「新图默认」，不覆盖已单独选过结构的图。 */
      var mode = opts.mode || savedMode(src) || MODE;
      if (!MODE_LABELS[mode]) mode = MODE;
      /* 导出页预置多形态时传 preview:true：只借用布局能力，
         绝不写回用户对这张图的单图结构选择（saveMode）。 */
      if (opts.mode && !opts.preview) saveMode(src, mode);
      var L = layout(g, mode), svgText = buildSVG(g, L);
      host.innerHTML = '';
      var wrap = document.createElement('div'); wrap.className = 'mf-wrap';
      var tools = document.createElement('div'); tools.className = 'mf-tools';
      var MODE_CN = { pipeline: '多彩流水', mindmap: '思维导图', org: '组织结构图', timeline: '时间图' };
      var modeName = MODE_CN[L.mode] || '流程图';
      var dirInfo = L.mode === 'pipeline'
        ? ((g.effDir || g.dir) + ' 方向' + (L.autoVertical ? ' · AUTO TD' : ''))
        : (L.mode === 'org' ? '自上而下' : (L.mode === 'timeline' ? '中轴时间线' : '放射状'));
      var modeBtns = Object.keys(MODE_LABELS).map(function (m) {
        return '<button type="button" data-act="mode" data-mode="' + m + '"' +
          (m === mode ? ' class="on"' : '') +
          ' title="本图结构：' + MODE_LABELS[m] + '（只影响这一张图）" aria-label="' + MODE_LABELS[m] + '">' +
          MODE_ICON[m] + '</button>';
      }).join('');
      tools.innerHTML = '<span class="mf-chip">MD FLOW</span>' +
        '<span class="mf-meta">' + modeName + ' · ' + dirInfo + ' · ' + g.nodes.length + ' 节点 · ' + g.edges.length + ' 连线 · 悬停高亮 · ✎ 可拖拽编辑</span>' +
        '<span class="mf-sp"></span>' +
        '<span class="mf-modes" role="group" aria-label="本图结构">' + modeBtns + '</span>' +
        '<button type="button" data-act="copy" title="复制 Mermaid 源码（编辑后自动带上改动）">复制源码</button>' +
        '<button type="button" data-act="svg" title="下载为独立 SVG 文件（以最后编辑状态为准）">下载 SVG</button>' +
        '<button type="button" data-act="edit" title="拖拽节点、可视化编辑；导出以最后编辑状态为准">✎ 编辑</button>' +
        '<span class="mf-edit-actions" hidden>' +
          '<button type="button" data-act="add" title="新增节点">+ 节点</button>' +
          '<button type="button" data-act="link" title="依次点击两个节点建立连线">连线</button>' +
          '<button type="button" data-act="undo" title="撤销上一步">撤销</button>' +
          '<button type="button" data-act="reset" title="清除本图全部编辑并恢复自动布局">重置</button>' +
          '<button type="button" data-act="done" title="退出编辑模式">完成</button>' +
        '</span>';
      var art = document.createElement('div'); art.className = 'mf-art'; art.innerHTML = svgText;
      wrap.appendChild(tools); wrap.appendChild(art); host.appendChild(wrap);
      var svg = art.querySelector('svg');
      if (!svg) return false;
      fitArt(art, svg, L.W);
      bind(svg, src, tools, host);
      /* 先重建再回放编辑状态：切结构 / 切主题 / 重开文档后编辑不丢 */
      MDEdit.attach(svg, src, tools, art, g, L);
      return true;
    } catch (e) {
      host.innerHTML = '';
      if (global.console) console.warn('[MD FLOW] 渲染失败，回退原生 Mermaid：', e);
      return false;
    }
  }

  /* 原生 Mermaid 兜底时使用的统一主题（读取当前皮肤真实颜色） */
  function themeVars() {
    var cs = getComputedStyle(document.documentElement);
    function v(k, d) { return (cs.getPropertyValue(k) || '').trim() || d; }
    return {
      background: v('--paper', '#ffffff'),
      primaryColor: v('--accent-2', '#eff5ff'),
      primaryBorderColor: v('--accent', '#2563eb'),
      primaryTextColor: v('--text', '#1f2328'),
      secondaryColor: v('--panel-2', '#fafbfc'),
      tertiaryColor: v('--panel', '#ffffff'),
      lineColor: v('--text-2', '#4b5563'),
      textColor: v('--text', '#1f2328'),
      mainBkg: v('--accent-2', '#eff5ff'),
      nodeBorder: v('--accent', '#2563eb'),
      clusterBkg: v('--panel-2', '#fafbfc'),
      clusterBorder: v('--border', '#e3e7ed'),
      edgeLabelBackground: v('--paper', '#ffffff'),
      fontFamily: FONT, fontSize: '14px'
    };
  }

  var API = {
    parse: parse, layout: layout, buildSVG: buildSVG, render: render,
    themeVars: themeVars, inlineVars: inlineVars, serialize: serialize,
    setMode: setMode, getMode: getMode, MODE_LABELS: MODE_LABELS,
    /* 可视化编辑：导出清理 / 路径变换 / 编辑后源码，供 app.js 与测试使用 */
    cleanForExport: MDEdit.cleanForExport, transformPath: MDEdit.transformPath,
    toMermaid: MDEdit.toMermaid
  };
  global.MDFlow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
