/* ============================================================================
 * MD ASCII DIAGRAM  ·  Unicode 框线字符画 → 语义图 → Mermaid
 * ----------------------------------------------------------------------------
 * 纯代码算法，零 AI / 零 LLM / 零网络 / 零外部依赖。
 *
 * 行业方案调研结论（2026-11）：
 *   - svgbob (Rust, Apache-2.0)：ASCII → fragment 检测 → 两遍合并 → 几何处理
 *     → SVG。输出的是「形状图片」，不产出可编辑的节点/边语义图。
 *   - ditaa (Java, GPL)：ASCII → PNG 位图，按 open/closed shape 涂色。
 *   - GoAT / Kroki：前者输出 SVG、后者是需服务端的聚合网关。
 *   - mermaid-text v0.6.0 (Rust, MIT)：反向 Mermaid → 终端字符画，核心是
 *     「2D 字符网格 + 4-bit 方向掩码查表映射 box-drawing glyph」+ A* 路由。
 *   上述工具都依赖 unicode-width 处理东亚宽字符；且都是外部二进制/服务端，
 *   无法塞进 MDReader 的单文件离线 HTML。
 *
 * 本模块借鉴其中两点、但目标不同：
 *   ① UAX #11 显示列宽网格（中文 2 列 / 组合字符 0 列）—— 这是中英框线
 *      混排能否对齐的决定性因素；按 JS 字符串 length 算必然错位。
 *   ② 字符网格 + fragment 聚类的容错思想（两遍合并 → 这里表现为「竖线行组
 *      band」+「边界列槽聚类 slot」两级归并）。
 *   输出的是 {nodes, edges} 语义图，直接交给 MDFlow.render() 复用现成的
 *   五种结构 / 拖拽编辑 / HTML·Word·PDF 导出链路，而不是一张死图。
 *
 * 识别策略（针对手绘图而非工具生成的规整图）：
 *   - 不要求四边严格闭合。顶边可缺失、左右边界可与顶底边错位 ±3 列。
 *   - 以「连续含 >=2 条竖线的行」为 band（一个框行带），band 内允许并列多框。
 *   - 以「竖线列聚类」为 slot，两两配对成框；框内文字按显示列区间提取。
 *   - 层 = band 顺序；层间靠中间的 ↓ / │ / ┬ ┴ ┼ 作为连线证据，
 *     再按 1→1 / 1→n 扇出 / n→1 汇合 / n→m 最近列匹配生成边。
 * ==========================================================================*/
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* ---------------- 字符集 ---------------- */
  var S_H = '─━═┄┅┈┉-=';                    // 水平线（含 ASCII - =）
  var S_V = '│┃║┆┇┊┋|';                    // 垂直线（含 ASCII |）
  var S_CORNER = '┌┐└┘┏┓┗┛╔╗╚╝╭╮╰╯+';   // 角点
  var S_UNI_CORNER = '┌┐└┘┏┓┗┛╔╗╚╝╭╮╰╯'; // Unicode 角点（不含 +）
  var S_JUNC = '┬┴┼├┤╦╩╬╠╣';              // T / 十字接点
  var S_ARROW = '↓↑←→▼▲▽△⇓⇑⇒⇐';           // 方向箭头

  /* 真正的「结构字符」只含 Unicode 框线。ASCII 的 - = + | 与箭头 → 在正文里
     太常见（PRI→severity / key=value / Flask API + SSE），框内提取文字时必须
     原样保留，否则会丢信息。仅 ASCII 框线图（+---+ / | |）才额外依赖 ASCII 集。 */
  var S_STRUCT_V = '│┃║┆┇┊┋';
  var S_STRUCT_H = '─━═┄┅┈┉';
  var S_STRUCT_C = '┌┐└┘┏┓┗┛╔╗╚╝╭╮╰╯';
  var S_STRUCT_J = '┬┴┼├┤╦╩╬╠╣';

  function has(set, ch) { return !!ch && set.indexOf(ch) >= 0; }
  function isBoxChar(ch) {
    return has(S_H, ch) || has(S_V, ch) || has(S_CORNER, ch) ||
      has(S_JUNC, ch) || has(S_ARROW, ch);
  }
  function isStruct(ch) {
    return has(S_STRUCT_V, ch) || has(S_STRUCT_H, ch) ||
      has(S_STRUCT_C, ch) || has(S_STRUCT_J, ch);
  }

  /* ---------------- 1. UAX #11 显示列宽（子集） ----------------
     - 组合音标 / 零宽字符 / variation selector → 0 列（不占格）
     - East Asian Wide / Fullwidth（CJK、全角标点、emoji）→ 2 列
     - box-drawing U+2500–257F、箭头、ASCII → 1 列
     svgbob / mermaid-text 均用 unicode-width 做同一件事。 */
  function charW(ch) {
    var cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) return 0;
    if ((cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) ||
      (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x20d0 && cp <= 0x20ff) ||
      (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) ||
      cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060) return 0;
    if ((cp >= 0x1100 && cp <= 0x115f) || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
    return 1;
  }
  function toChars(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var ch = String.fromCodePoint(s.codePointAt(i));
      out.push(ch); i += ch.length;
    }
    return out;
  }

  /* 把文本展开成「显示列」网格：row.byCol[col] 可直接取到该列字符。
     宽字符占 col / col+1 两格，第二格 cont=true、ch=''（连通判断时忽略）。 */
  function gridOf(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var rows = [];
    for (var r = 0; r < lines.length; r++) {
      var line = lines[r].replace(/\t/g, '    ');
      var byCol = Object.create(null), cells = [], col = 0;
      var arr = toChars(line);
      for (var i = 0; i < arr.length; i++) {
        var ch = arr[i], w = charW(ch);
        if (w <= 0) continue;                    // 零宽字符不占列
        var cell = { ch: ch, col: col, w: w, cont: false };
        cells.push(cell); byCol[col] = cell;
        for (var k = 1; k < w; k++) {
          var cont = { ch: '', col: col + k, w: 0, cont: true };
          cells.push(cont); byCol[col + k] = cont;
        }
        col += w;
      }
      rows.push({ r: r, text: line, width: col, cells: cells, byCol: byCol });
    }
    return rows;
  }
  function at(row, c) { return row.byCol[c]; }

  /* ---------------- 2. 行画像 ---------------- */
  function vCols(row) {
    var out = [];
    for (var i = 0; i < row.cells.length; i++) {
      var c = row.cells[i];
      if (!c.cont && has(S_V, c.ch)) out.push(c.col);
    }
    return out;
  }
  function countChars(row, set) {
    var n = 0;
    for (var i = 0; i < row.cells.length; i++) {
      var c = row.cells[i];
      if (!c.cont && has(set, c.ch)) n++;
    }
    return n;
  }

  /* ---------------- 3. 是否字符架构图（避免误伤普通文本） ---------------- */
  function isDiagram(text) {
    if (typeof text !== 'string' || text.length < 12) return false;
    var rows = gridOf(text);
    if (rows.length < 3) return false;
    var uniCorner = 0, h = 0, content = 0, vline = 0;
    for (var i = 0; i < rows.length; i++) {
      uniCorner += countChars(rows[i], S_UNI_CORNER);
      h += countChars(rows[i], S_H);
      vline += countChars(rows[i], S_V);
      if (vCols(rows[i]).length >= 2) content++;
    }
    /* 普通 Markdown 表格分隔行 |---|---| 有 - 和 |，但没有 Unicode 角点 / +---+ */
    var asciiBox = /\+[-=]{3,}\+/.test(text);
    if (uniCorner < 2 && !asciiBox) return false;
    if (content < 2) return false;                  // 至少两行「有左右边界」
    if (h + uniCorner < 10) return false;           // 至少成片的横线
    /* 已经是 Mermaid / 箭头文本流程图的，交给 MDFlow / MDTextFlow，不抢 */
    if (/\b(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/i.test(text)) return false;
    if ((text.match(/-->/g) || []).length >= 3) return false;
    return true;
  }

  /* ---------------- 4. band：连续「内容行」组成的框行带 ---------------- */
  function bandsOf(rows) {
    var out = [], cur = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], vc = vCols(row);
      if (vc.length >= 2) {
        if (!cur) cur = { r0: row.r, r1: row.r, rows: [] };
        cur.rows.push({ r: row.r, row: row, vc: vc });
        cur.r1 = row.r;
      } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }

  /* ---------------- 5. slot：band 内竖线列聚类（容忍 ±TOL 漂移） ----------------
     手绘图常见同一框右边界在不同行落在不同列（中英混排凑空格导致），
     严格按列相等会漏框；这里按「相邻值差 <= TOL」做单遍归并。 */
  var TOL = 3, MIN_BOX_W = 6;
  function slotsOf(band) {
    var all = [], i, j;
    for (i = 0; i < band.rows.length; i++)
      for (j = 0; j < band.rows[i].vc.length; j++) all.push(band.rows[i].vc[j]);
    all.sort(function (a, b) { return a - b; });
    var groups = [];
    for (i = 0; i < all.length; i++) {
      var c = all[i], g = groups[groups.length - 1];
      if (g && c - g.max <= TOL) { g.vals.push(c); g.max = c; }
      else groups.push({ vals: [c], min: c, max: c });
    }
    return groups.map(function (g) {
      var s = 0;
      for (i = 0; i < g.vals.length; i++) s += g.vals[i];
      return { col: s / g.vals.length, min: g.min, max: g.max, n: g.vals.length, drift: g.max - g.min };
    });
  }

  /* 两两配对成框；间距过小的孤立边界直接丢弃 */
  function boxesOf(band, slots) {
    var out = [], i = 0;
    while (i + 1 < slots.length) {
      var a = slots[i], b = slots[i + 1];
      if (b.col - a.col >= MIN_BOX_W) {
        out.push({ left: a, right: b, center: (a.col + b.col) / 2, band: band });
        i += 2;
      } else i += 1;
    }
    return out;
  }

  /* 按显示列区间取框内文字；框线残片当空格，宽字符续格跳过 */
  function boxLines(box) {
    var lo = Math.ceil(box.left.col) + 1, hi = Math.floor(box.right.col), lines = [];
    for (var i = 0; i < box.band.rows.length; i++) {
      var row = box.band.rows[i].row, buf = '';
      for (var c = lo; c < hi; c++) {
        var cell = at(row, c);
        if (!cell || cell.cont) continue;
        buf += isStruct(cell.ch) ? ' ' : cell.ch;
      }
      /* 手绘图常用连续空格凑对齐，展示层压成一个空格，减少 MDFlow 自动折行的碎行；
         .ad-src 折叠区仍保留逐字原文，信息不丢。 */
      var t = buf.replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
      if (t) lines.push(t);
    }
    return lines;
  }
  /* 第一个框左边界之外的文字（外部数据源标注，如「网络设备/UDP 5140 →」） */
  function outerLines(box) {
    var hi = Math.floor(box.left.col), lines = [];
    for (var i = 0; i < box.band.rows.length; i++) {
      var row = box.band.rows[i].row, buf = '';
      for (var c = 0; c < hi; c++) {
        var cell = at(row, c);
        if (!cell || cell.cont) continue;
        /* 外部标注里的 → / ↓ 是「流入符号」，不是文字，跳过；其余按结构字符处理 */
        if (isStruct(cell.ch) || has(S_ARROW, cell.ch)) continue;
        buf += cell.ch;
      }
      var t = buf.replace(/^\s+|\s+$/g, '');
      if (t) lines.push(t);
    }
    return lines;
  }

  /* ---------------- 6. 层间连线证据 ---------------- */
  function linkOf(aBand, bBand, rows) {
    var arrows = 0, vlines = 0, junctions = 0;
    for (var r = aBand.r1 + 1; r < bBand.r0 && r < rows.length; r++) {
      arrows += countChars(rows[r], S_ARROW);
      vlines += countChars(rows[r], S_V);
      junctions += countChars(rows[r], S_JUNC);
    }
    return { arrows: arrows, vlines: vlines, junctions: junctions, linked: (arrows + vlines + junctions) > 0 };
  }
  function edgesOf(layers, rows, warnings) {
    var edges = [];
    for (var i = 0; i + 1 < layers.length; i++) {
      var a = layers[i], b = layers[i + 1], lk = linkOf(a.band, b.band, rows);
      if (!lk.linked) {
        warnings.push('第 ' + (i + 1) + ' → ' + (i + 2) + ' 层之间未检测到连线证据，已跳过该层间连边');
        continue;
      }
      var A = a.nodes, B = b.nodes, k, j;
      if (A.length === 1 && B.length === 1) {
        edges.push({ from: A[0].id, to: B[0].id, kind: 'linear' });
      } else if (A.length === 1) {
        for (k = 0; k < B.length; k++) edges.push({ from: A[0].id, to: B[k].id, kind: 'fanout' });
      } else if (B.length === 1) {
        for (k = 0; k < A.length; k++) edges.push({ from: A[k].id, to: B[0].id, kind: 'merge' });
      } else {
        /* n→m：按水平中心最近匹配，再补上未被指向的下层节点 */
        for (k = 0; k < A.length; k++) {
          var best = null, bd = Infinity;
          for (j = 0; j < B.length; j++) {
            var d = Math.abs(A[k].center - B[j].center);
            if (d < bd) { bd = d; best = B[j]; }
          }
          if (best) edges.push({ from: A[k].id, to: best.id, kind: 'match' });
        }
        for (j = 0; j < B.length; j++) {
          var hit = false;
          for (k = 0; k < edges.length; k++) if (edges[k].to === B[j].id) { hit = true; break; }
          if (hit) continue;
          var bf = null, bd2 = Infinity;
          for (k = 0; k < A.length; k++) {
            var d2 = Math.abs(A[k].center - B[j].center);
            if (d2 < bd2) { bd2 = d2; bf = A[k]; }
          }
          if (bf) edges.push({ from: bf.id, to: B[j].id, kind: 'match' });
        }
      }
      a.link = lk;
    }
    return edges;
  }

  /* ---------------- 7. 生成 Mermaid ----------------
     标签里的 " | --> --- ==> ~~~ ::: @{ 会破坏 MDFlow.parse / risky()，
     统一 defuse 成视觉近似的全角字符或插入零宽空格，保证原文可读且不炸语法。 */
  function defuse(s) {
    return String(s == null ? '' : s)
      .replace(/"/g, '＂').replace(/\|/g, '｜')
      .replace(/~~~/g, '≈≈≈').replace(/:::/g, '：：：')
      .replace(/@\{/g, '＠{').replace(/%%\{/g, '％％{')
      .replace(/<-->/g, '＜-＞').replace(/-\.->/g, '-.＞')
      .replace(/-->/g, '-＞').replace(/==>/g, '=＞').replace(/---/g, '－－－')
      .replace(/\bshape\b/g, 'sh\u200Bape');
  }
  function toMermaid(model) {
    var L = ['flowchart TD'], i;
    for (i = 0; i < model.externals.length; i++)
      L.push('  ' + model.externals[i].id + '["' + defuse(model.externals[i].label) + '"]');
    for (i = 0; i < model.nodes.length; i++)
      L.push('  ' + model.nodes[i].id + '["' + defuse(model.nodes[i].lines.join('<br/>')) + '"]');
    for (i = 0; i < model.externals.length; i++)
      L.push('  ' + model.externals[i].id + ' --> ' + model.externals[i].to);
    for (i = 0; i < model.edges.length; i++)
      L.push('  ' + model.edges[i].from + ' --> ' + model.edges[i].to);
    return L.join('\n');
  }

  /* ---------------- 8. 主解析 ---------------- */
  function parse(text) {
    var warnings = [], rows = gridOf(text), bands = bandsOf(rows);
    var layers = [], nodes = [], externals = [], n = 0, drift = 0, i, j;

    for (i = 0; i < bands.length; i++) {
      var band = bands[i], slots = slotsOf(band), boxes = boxesOf(band, slots);
      for (j = 0; j < slots.length; j++) drift += slots[j].drift;
      if (!boxes.length) { warnings.push('第 ' + (i + 1) + ' 个框行带未能识别出矩形框'); continue; }
      var layerNodes = [];
      for (j = 0; j < boxes.length; j++) {
        var lines = boxLines(boxes[j]);
        if (!lines.length) continue;
        var id = 'N' + (++n);
        layerNodes.push({ id: id, lines: lines, label: lines.join('<br/>'), band: i, center: boxes[j].center });
        nodes.push(layerNodes[layerNodes.length - 1]);
      }
      if (!layerNodes.length) continue;
      /* 外部标注：只在第一个 band 的第一个框左侧找（数据入口） */
      if (i === 0) {
        var out = outerLines(boxes[0]);
        if (out.length) {
          externals.push({
            id: 'ADIN1', label: out.join(' '), to: layerNodes[0].id, lines: out
          });
          warnings.push('检测到框外左侧标注「' + out.join(' ') + '」，已生成输入节点');
        }
      }
      layers.push({ band: band, nodes: layerNodes, slots: slots });
    }

    /* 顶边缺失检测（手绘图常见）：第一行内容之前没有 ┌…┐ 时提示 */
    if (layers.length) {
      var r0 = layers[0].band.r0, topEdge = false;
      for (var r = Math.max(0, r0 - 1); r <= r0; r++) {
        if (rows[r] && countChars(rows[r], '┌┏╔╭') > 0 && countChars(rows[r], '┐┓╗╮') > 0) topEdge = true;
      }
      if (!topEdge) warnings.push('首层缺少顶边（手绘图常见），已按「竖线行组」识别，未要求四边闭合');
    }
    if (drift > 0) warnings.push('检测到边界列漂移合计 ' + drift + ' 列（中英混排凑空格所致），已按显示列宽 ±' + TOL + ' 容差聚类');

    var edges = edgesOf(layers, rows, warnings);
    var model = {
      nodes: nodes, edges: edges, externals: externals, layers: layers,
      warnings: warnings,
      stats: {
        rows: rows.length,
        cols: rows.reduce(function (m, x) { return Math.max(m, x.width); }, 0),
        bands: bands.length, boxes: nodes.length, edges: edges.length,
        arrows: rows.reduce(function (m, x) { return m + countChars(x, S_ARROW); }, 0),
        drift: drift
      }
    };
    model.mermaid = toMermaid(model);
    return model;
  }

  /* ---------------- 9. 浏览器侧接入 ----------------
     把命中 isDiagram 的 <pre><code> 或正文 <p> 换成 MDFlow 可视化容器。
     复用 .mf-wrap / .mf-art / svg.mf-svg 类名 → HTML / Word / 打印导出全部自动生效。 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function convertOne(el, text) {
    var model = parse(text);
    if (model.nodes.length < 2 || !model.edges.length) return false;

    var host = document.createElement('div');
    host.className = 'mermaid-box md-flow-box ad-box';
    host.setAttribute('data-ad-nodes', String(model.nodes.length));
    host.setAttribute('data-ad-edges', String(model.edges.length));
    /* 导出页预置流程图 5 种结构时需要 Mermaid 源码（CR-2026-11-15-04） */
    host.setAttribute('data-mf-src', model.mermaid);
    if (el.parentNode) el.parentNode.replaceChild(host, el);
    else return false;

    var flow = global.MDFlow, ok = false;
    if (flow && flow.render) { try { ok = flow.render(model.mermaid, host); } catch (e) { ok = false; } }
    if (!ok) {
      host.className = 'ad-box ad-fallback';
      host.innerHTML = '<div class="ad-warn">字符架构图已识别，但图形渲染未成功，已保留原文</div>' +
        '<pre class="ad-raw">' + esc(text) + '</pre>';
      return true;
    }

    /* 标识 + 原图折叠区（导出时由 CSS / cleanForWord 剥离） */
    var tools = host.querySelector('.mf-tools');
    var meta = tools && tools.querySelector('.mf-meta');
    if (meta) meta.textContent += ' · ⌗ 字符架构图识别（' + model.layers.length + ' 层 / ' + model.nodes.length + ' 节点）';
    var det = document.createElement('details');
    det.className = 'ad-src';
    var sum = document.createElement('summary');
    sum.textContent = '查看字符原图（自动识别为 ' + model.nodes.length + ' 个节点 · ' + model.edges.length + ' 条连线）';
    var pre = document.createElement('pre');
    pre.textContent = text;
    det.appendChild(sum); det.appendChild(pre);
    host.appendChild(det);
    return true;
  }
  function convertAll(root) {
    if (!root || !root.querySelectorAll) return 0;
    var done = 0, list = [], i;
    var codes = root.querySelectorAll('pre > code');
    for (i = 0; i < codes.length; i++) {
      var cls = codes[i].className || '';
      if (/language-(mermaid|flow|flowchart|textflow|text-flow|txtflow|tf|mdflow|md-flow|graph|symbol-flow)/i.test(cls)) continue;
      var pre = codes[i].parentElement;
      list.push({ el: pre, text: codes[i].textContent });
    }
    var ps = root.querySelectorAll('p');
    for (i = 0; i < ps.length; i++) {
      var t = ps[i].textContent || '';
      if (t.indexOf('\n') < 0) continue;
      list.push({ el: ps[i], text: t });
    }
    /* 去重：同一个 pre 可能被 p 扫描重复命中不会发生，但保一层保险 */
    var seen = [];
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (seen.indexOf(it.el) >= 0 || !it.el.parentNode) continue;
      seen.push(it.el);
      if (!isDiagram(it.text)) continue;
      try { if (convertOne(it.el, it.text)) done++; } catch (e) { /* 单块失败不影响全文 */ }
    }
    return done;
  }

  var API = {
    VERSION: VERSION, charW: charW, gridOf: gridOf, isDiagram: isDiagram,
    parse: parse, toMermaid: toMermaid, convertAll: convertAll
  };
  global.MDAscii = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
