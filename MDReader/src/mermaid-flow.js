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

  function layout(g) {
    var horiz = (g.dir === 'LR' || g.dir === 'RL');
    var flipX = (g.dir === 'RL'), flipY = (g.dir === 'BT');
    var N = g.nodes.length;

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

    return { W: W, H: H, horiz: horiz, head: HEAD, foot: FOOT, pad: PAD, layers: layers.length };
  }

  /* ---------------- 3. 绘制 ---------------- */
  function labelText(lines, cx, cy, color, size, weight) {
    var lh = size * 1.48, y0 = cy - (lines.length - 1) * lh / 2 + size * 0.36;
    var style = 'font-family:' + FONT + ';font-size:' + size + 'px;font-weight:' + (weight || 600) + ';fill:' + color;
    return '<text text-anchor="middle" style="' + style + '">' + lines.map(function (s, i) {
      return '<tspan x="' + f(cx) + '" y="' + f(y0 + i * lh) + '">' + esc(s) + '</tspan>';
    }).join('') + '</text>';
  }
  function shapeMarkup(n, id) {
    var x = n.x, y = n.y, w = n.w, h = n.h, cx = x + w / 2, cy = y + h / 2;
    var radius = (n.shape === 'circle' || n.shape === 'stadium') ? h / 2
      : (n.shape === 'round' ? 18 : (n.shape === 'subroutine' ? 6 : 11));
    var base = 'fill:var(--mf-card);stroke:var(--mf-stroke);stroke-width:1.4';
    if (n.kind === 'start') base = 'fill:var(--mf-ink);stroke:var(--mf-ink);stroke-width:1.3';
    if (n.kind === 'decision') base = 'fill:' + n.color.s + ';stroke:' + n.color.c + ';stroke-width:1.7';
    if (n.kind === 'end') base = 'fill:var(--mf-card);stroke:' + n.color.c + ';stroke-width:1.9';
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
    s.push('<filter id="' + id + '-shadow" x="-25%" y="-35%" width="150%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="5" style="flood-color:var(--mf-shade);flood-opacity:0.16"/></filter>');
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
    s.push('<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="14" style="fill:url(#' + id + '-dots);opacity:.62"/>');
    var micro = 'font-family:' + FONT + ';font-size:10.5px;font-weight:700;letter-spacing:1.5px;fill:var(--mf-sub)';
    s.push('<g class="mf-head">');
    s.push('<rect x="' + PAD + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a1)"/>');
    s.push('<rect x="' + (PAD + 12) + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a2)"/>');
    s.push('<rect x="' + (PAD + 24) + '" y="21" width="8" height="8" rx="2" style="fill:var(--mf-a3)"/>');
    s.push('<text x="' + (PAD + 43) + '" y="29" style="' + micro + '">FLOWCHART / ' + esc(g.dir) + '</text>');
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
      s.push('<path class="mf-line" d="' + e.path + '" style="fill:none;stroke:' + stroke + ';stroke-width:' + width +
        ';stroke-linecap:round;stroke-linejoin:round' + (e.dashed ? ';stroke-dasharray:6 6' : '') + '"' +
        (e.arrow ? ' marker-end="url(#' + id + '-arrow)"' : '') + '/>');
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
    g.nodes.forEach(function (n) {
      var cx = n.x + 40 + (n.w - 54) / 2, cy = n.y + n.h / 2;
      var isStart = n.kind === 'start', isDec = n.kind === 'decision';
      var textColor = isStart ? 'var(--mf-bg)' : (isDec ? 'var(--mf-ink)' : 'var(--mf-ink)');
      s.push('<g class="mf-node mf-' + n.kind + '" data-id="' + esc(n.id) + '">');
      s.push(shapeMarkup(n, id));
      if (!isStart && !isDec) {
        s.push('<rect class="mf-bar" x="' + f(n.x + 1.5) + '" y="' + f(n.y + 12) + '" width="3.5" height="' + f(n.h - 24) +
          '" rx="2" style="fill:' + n.color.c + '"/>');
      }
      if (isDec) {
        s.push('<circle cx="' + f(n.x + n.w / 2) + '" cy="' + f(n.y + 6) + '" r="3.4" style="fill:' + n.color.c + '"/>');
      }
      if (n.kind === 'end') {
        s.push('<circle cx="' + f(n.x + n.w - 12) + '" cy="' + f(n.y + 12) + '" r="4" style="fill:' + n.color.c + '"/>');
      }
      /* 序号徽章 */
      s.push('<rect x="' + f(n.x + 13) + '" y="' + f(n.y + n.h / 2 - 10) + '" width="25" height="20" rx="6" style="fill:' +
        (isStart ? 'var(--mf-ink-soft)' : n.color.s) + '"/>');
      s.push('<text x="' + f(n.x + 25.5) + '" y="' + f(n.y + n.h / 2 + 3.7) + '" text-anchor="middle" style="font-family:' + FONT +
        ';font-size:10px;font-weight:800;letter-spacing:.4px;fill:' + (isStart ? 'var(--mf-bg)' : n.color.c) + '">' + n.num + '</text>');
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
      '--mf-a1s', '--mf-a2s', '--mf-a3s', '--mf-a4s'];
    names.forEach(function (k) {
      var v = (cs.getPropertyValue(k) || '').trim();
      for (var i = 0; i < 4 && /var\(/.test(v); i++) {
        v = v.replace(/var\(\s*(--[\w-]+)\s*\)/g, function (all, n) { return (cs.getPropertyValue(n) || '').trim() || all; });
      }
      out[k] = v;
    });
    return out;
  }
  function inlineVars(text) {
    var map = cssVars();
    return String(text).replace(/var\(\s*(--[\w-]+)\s*\)/g, function (all, k) { return map[k] || all; });
  }
  function serialize(svg) {
    var clone = svg.cloneNode(true);
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
  function bind(svg, src, tools) {
    Array.prototype.forEach.call(svg.querySelectorAll('.mf-node'), function (n) {
      n.addEventListener('mouseenter', function () { highlight(svg, n.getAttribute('data-id')); });
      n.addEventListener('mouseleave', function () { highlight(svg, null); });
    });
    tools.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'svg') download(svg);
      else copy(src, b);
    });
  }

  /* 宽图保护：画布明显宽于阅读区时不再等比压缩（否则节点文字会被缩到看不清），
     改为 1:1 显示 + 容器横向滚动；轻微超宽仍走自适应。窗口缩放 / 侧栏折叠实时重算。 */
  function fitArt(art, svg, W) {
    function apply() {
      var avail = art.clientWidth;
      if (!avail) return;
      var wide = W > avail * 1.4;
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

  function render(src, host) {
    var g = parse(src);
    if (!g) return false;
    try {
      var L = layout(g), svgText = buildSVG(g, L);
      host.innerHTML = '';
      var wrap = document.createElement('div'); wrap.className = 'mf-wrap';
      var tools = document.createElement('div'); tools.className = 'mf-tools';
      tools.innerHTML = '<span class="mf-chip">MD FLOW</span>' +
        '<span class="mf-meta">' + esc(g.dir) + ' 方向 · ' + g.nodes.length + ' 节点 · ' + g.edges.length + ' 连线 · 连线流水动效 · 悬停节点高亮路径</span>' +
        '<span class="mf-sp"></span>' +
        '<button type="button" data-act="copy" title="复制 Mermaid 源码">复制源码</button>' +
        '<button type="button" data-act="svg" title="下载为独立 SVG 文件">下载 SVG</button>';
      var art = document.createElement('div'); art.className = 'mf-art'; art.innerHTML = svgText;
      wrap.appendChild(tools); wrap.appendChild(art); host.appendChild(wrap);
      var svg = art.querySelector('svg');
      if (!svg) return false;
      fitArt(art, svg, L.W);
      bind(svg, src, tools);
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
    themeVars: themeVars, inlineVars: inlineVars, serialize: serialize
  };
  global.MDFlow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
