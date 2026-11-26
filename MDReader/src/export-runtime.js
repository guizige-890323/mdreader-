/* ==================================================================
   MD Reader · 导出页轻量运行时   CR-2026-11-15-04
   ------------------------------------------------------------------
   这份源码由 build.py 以 type=text/plain 的 #mdx-runtime 脚本槽
   内嵌进主应用；exportHTML() 把它的 textContent 原样写进导出页的
   执行脚本里。主应用本身不执行它（text/plain + data-mdx-export
   双重守卫），只有导出的独立 HTML 才带 data-mdx-export 标记。

   设计边界（变更单关键决策）：
   · 不内联完整主应用 IIFE —— 4MB+ 体积、内部函数不可调用、clone DOM
     会丢 addEventListener。这里只做「切换 + 查询」，不重新解析 Markdown。
   · 图表 6 种类型 / 流程图 5 种结构由主应用在导出时预渲染成 <template>，
     放在 body 末尾的 #mdx-store 里，运行时只负责把对应片段换进容器。
   · 导出 HTML 跳过 inlineVars()，SVG 保留 var(--mf-*)；换主题 / 文档风格
     时流程图与代码高亮即时跟着变。Word / PDF 分支仍按原样固化颜色。
   · 完全离线：无 CDN、无 fetch、无 mermaid.run、无外部字体。

   注意：本文件内不得出现脚本闭合标签字面量（它会被塞进 text/plain 槽）。
   ================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.hasAttribute('data-mdx-export')) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var content = $('#content');
  if (!content) return;
  var store = $('#mdx-store');

  /* ---------- 预置数据 ---------- */
  var P = {};
  try { var pn = $('#mdx-presets'); if (pn) P = JSON.parse(pn.textContent || '{}'); } catch (e) { }
  var en = /^en/i.test(P.lang || root.getAttribute('lang') || '');
  var T = en ? {
    brand: 'MD · Exported', find: 'Find…', font: 'Font', theme: 'Theme', style: 'Style',
    layout: 'Layout', lh: 'Line', batch: 'All', print: 'Print', pm: 'Soft', reset: 'Reset',
    lhCompact: 'Tight', lhStandard: 'Std', lhComfort: 'Cozy', lhLoose: 'Loose',
    light: 'Light', dark: 'Dark', sepia: 'Sepia', mono: 'Mono', tech: 'Blue', gov: 'Red', cute: 'Pink',
    card: 'Card', paper: 'Paper', ctAll: 'Charts', fmAll: 'Flows', noChange: '- keep -',
    ct: ['Auto', 'Bar', 'Line', 'Trend', 'Donut', 'Rose'],
    fm: ['Auto', 'Pipeline', 'Mindmap', 'Org', 'Timeline'],
    unitChart: ' charts', unitFlow: ' flows', unitSize: ' interactive'
  } : {
    brand: 'MD · 导出页', find: '查找正文…', font: '字体', theme: '主题', style: '风格',
    layout: '排版', lh: '行高', batch: '批量', print: '打印', pm: '柔光', reset: '重置',
    lhCompact: '紧凑', lhStandard: '标准', lhComfort: '舒适', lhLoose: '宽松',
    light: '浅', dark: '深', sepia: '护眼', mono: '黑白', tech: '蓝', gov: '红', cute: '粉',
    card: '卡片', paper: '纸张', ctAll: '图表', fmAll: '流程', noChange: '— 不改 —',
    ct: ['自动', '柱状', '折线', '趋势', '环形', '玫瑰'],
    fm: ['自动', '流水', '导图', '组织', '时间'],
    unitChart: ' 图表', unitFlow: ' 流程', unitSize: ' 可交互'
  };
  var CT_V = ['auto', 'bar', 'line', 'trend', 'pie', 'rose'];
  var FM_V = ['auto', 'pipeline', 'mindmap', 'org', 'timeline'];
  var STYLES = ['mono', 'tech', 'gov', 'cute'];
  var THEMES = ['light', 'dark', 'sepia'];
  var LH_V = ['compact', 'standard', 'comfort', 'loose'];
  var LH_NUM = { compact: 1.5, standard: 1.78, comfort: 2.0, loose: 2.3 };

  /* ---------- 1. 菜单样式（自注入，导出页 CSS 不含这段） ---------- */
  var CSS = [
    '#mdx-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;',
    'gap:6px 10px;padding:8px 14px;background:var(--panel,#fff);color:var(--text,#1f2328);',
    'border-bottom:1px solid var(--border,#e3e7ed);box-shadow:0 2px 14px rgba(0,0,0,.10);',
    'font:12px/1.4 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;user-select:none}',
    'body{padding-top:54px}',
    '#mdx-bar .mdx-brand{font-weight:700;letter-spacing:.02em;white-space:nowrap;color:var(--accent,#2563eb)}',
    '#mdx-bar .mdx-meta{color:var(--muted,#8a94a2);font-size:11px;white-space:nowrap}',
    '#mdx-bar .mdx-grp{display:inline-flex;align-items:center;gap:3px}',
    '#mdx-bar .mdx-lb{color:var(--muted,#8a94a2);margin-right:2px;white-space:nowrap}',
    '#mdx-bar button,#mdx-bar select,#mdx-bar input{font:inherit;color:inherit;',
    'background:var(--panel-2,#fafbfc);border:1px solid var(--border,#e3e7ed);border-radius:6px;padding:4px 8px;outline:none}',
    '#mdx-bar button{cursor:pointer;min-width:28px}',
    '#mdx-bar button:hover{background:var(--accent-2,#eff5ff);border-color:var(--accent,#2563eb)}',
    '#mdx-bar button.on{background:var(--accent,#2563eb);color:#fff;border-color:var(--accent,#2563eb)}',
    '#mdx-bar input[type=search]{width:152px}',
    '#mdx-bar #mdx-count{min-width:40px;text-align:center;color:var(--muted,#8a94a2);font-variant-numeric:tabular-nums}',
    '#mdx-bar select{padding:4px 6px}',
    '#mdx-bar .mdx-sp{flex:1}',
    'body.mdx-folded{padding-top:28px}',
    'body.mdx-folded #mdx-bar{height:26px;overflow:hidden;padding:3px 14px;flex-wrap:nowrap}',
    'body.mdx-folded #mdx-bar > *:not(#mdx-fold){display:none!important}',
    'mark.mdx-hit{background:#ffe58f;color:inherit;border-radius:2px;padding:0 1px}',
    'mark.mdx-cur{background:#ff9f43;box-shadow:0 0 0 2px rgba(255,159,67,.45)}',
    '.lp-host{position:relative}',
    '.lp-pill{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;border-radius:7px;opacity:0;z-index:0;',
    '  background:linear-gradient(160deg,var(--lp-fill,rgba(255,255,255,.66)),var(--lp-fill-2,rgba(255,255,255,.32))),var(--lp-tint,rgba(37,99,235,.10));',
    '  box-shadow:inset 0 0 0 .5px var(--lp-rim,rgba(255,255,255,.94)),inset 0 1px 0 var(--lp-rim,rgba(255,255,255,.94)),var(--lp-shadow,0 1px 2px rgba(16,24,40,.10));',
    '  transform:translate3d(var(--lp-x,0px),var(--lp-y,0px),0) scale(var(--lp-sx,1),var(--lp-sy,1));',
    '  transform-origin:var(--lp-ox,50%) 50%;',
    '  transition:transform .42s cubic-bezier(.34,1.42,.44,1),width .42s cubic-bezier(.34,1.42,.44,1),height .42s cubic-bezier(.34,1.42,.44,1),opacity .2s ease}',
    '.lp-pill.on{opacity:1}',
    '.lp-pill.stretch{transition:transform .19s cubic-bezier(.3,.7,.2,1),width .19s cubic-bezier(.3,.7,.2,1),height .19s cubic-bezier(.3,.7,.2,1),opacity .2s ease}',
    '.lp-host > *:not(.lp-pill){position:relative;z-index:1}',
    '#mdx-bar .mdx-seg{position:relative}',
    '.chart-types{position:relative}.mf-modes{position:relative}',
    '#mdx-bar .mdx-seg.lp-ready button.on{background:transparent;border-color:transparent;color:var(--lp-ink,var(--accent,#2563eb));font-weight:700}',
    '.chart-types.lp-ready button.on,.mf-modes.lp-ready button.on{background:transparent!important;border-color:transparent!important;color:var(--lp-ink,var(--tt-accent,var(--accent,#2563eb)))!important;font-weight:700}',
    '@media (prefers-reduced-motion:reduce){.lp-pill,.lp-pill.stretch{transition:opacity .12s linear!important}}',
    '@media print{.lp-pill{display:none!important}',
    '  .chart-types.lp-ready button.on,.mf-modes.lp-ready button.on{background:var(--tt-accent,var(--accent))!important;color:var(--tt-accent-fg,#fff)!important}}',
    '.mdx-store{display:none!important}',
    '@media print{',
    '  #mdx-bar,.mdx-store,.mf-tools,.chart-types,.chart-tools{display:none!important}',
    '  body{padding-top:0!important}',
    '  mark.mdx-hit,mark.mdx-cur{background:transparent;box-shadow:none;color:inherit}',
    '}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.id = 'mdx-css'; styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ---------- 2. 顶部浮动渲染菜单 ---------- */
  function seg(k, label, vals, labels, cur) {
    return '<div class="mdx-grp mdx-seg" data-seg="' + k + '"><span class="mdx-lb">' + label + '</span>' +
      vals.map(function (v, i) {
        return '<button type="button" data-v="' + v + '"' + (v === cur ? ' class="on"' : '') + '>' + labels[i] + '</button>';
      }).join('') + '</div>';
  }
  function opts(vals, labels) {
    return '<option value="">' + T.noChange + '</option>' + vals.map(function (v, i) {
      return '<option value="' + v + '">' + labels[i] + '</option>';
    }).join('');
  }
  var meta = (P.charts || 0) + T.unitChart + ' · ' + (P.flows || 0) + T.unitFlow +
    ' · +' + Math.round((P.bytes || 0) / 1024) + ' KB' + T.unitSize;
  var bar = document.createElement('div');
  bar.id = 'mdx-bar';
  bar.innerHTML =
    '<span class="mdx-brand">' + T.brand + '</span>' +
    '<span class="mdx-meta">' + meta + '</span>' +
    '<div class="mdx-grp"><input id="mdx-q" type="search" placeholder="' + T.find + '" autocomplete="off">' +
    '<span id="mdx-count">0/0</span>' +
    '<button type="button" data-find="prev" title="上一条">‹</button>' +
    '<button type="button" data-find="next" title="下一条">›</button>' +
    '<button type="button" data-find="clear" title="清除">✕</button></div>' +
    '<div class="mdx-grp"><span class="mdx-lb">' + T.font + '</span>' +
    '<button type="button" data-font="-">A−</button><button type="button" data-font="+">A+</button>' +
    '<button type="button" data-font="0" title="' + T.reset + '">↺</button></div>' +
    seg('theme', T.theme, THEMES, [T.light, T.dark, T.sepia], P.theme || 'light') +
    seg('style', T.style, STYLES, [T.mono, T.tech, T.gov, T.cute], P.style || 'mono') +
    seg('layout', T.layout, ['card', 'paper'], [T.card, T.paper], P.layout || 'card') +
    seg('lh', T.lh, LH_V, [T.lhCompact, T.lhStandard, T.lhComfort, T.lhLoose], P.lh || 'standard') +
    '<button type="button" data-toggle="pm"' + (P.pm ? ' class="on"' : '') + '>' + T.pm + '</button>' +
    '<div class="mdx-grp"><span class="mdx-lb">' + T.batch + '</span>' +
    '<select id="mdx-ct-all" title="' + T.ctAll + '">' + opts(CT_V, T.ct) + '</select>' +
    '<select id="mdx-fm-all" title="' + T.fmAll + '">' + opts(FM_V, T.fm) + '</select></div>' +
    '<span class="mdx-sp"></span>' +
    '<button type="button" id="mdx-print">🖨 ' + T.print + '</button>' +
    '<button type="button" id="mdx-fold" title="收起 / 展开菜单">−</button>';
  document.body.appendChild(bar);

  /* ---------- 3. 状态 ---------- */
  var cur = {
    theme: P.theme || 'light', style: P.style || 'mono', layout: P.layout || 'card',
    pm: !!P.pm, fs: parseInt(content.style.fontSize, 10) || (P.fs || 15),
    lh: P.lh || 'standard'
  };
  var baseFs = cur.fs;
  var marks = [], markIdx = -1, findTimer = null;

  function syncSeg() {
    $$('#mdx-bar .mdx-seg').forEach(function (g) {
      var k = g.dataset.seg, v = cur[k];
      $$('button', g).forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    });
    var pmb = $('[data-toggle="pm"]'); if (pmb) pmb.classList.toggle('on', cur.pm);
  }

  /* ---------- 4. 统一文档风格：按 (style, theme) 换整套内联变量 ----------
     预置里 12 组 CSS 由主应用 applyDocStyle() 在同一次导出中算好，
     这里只做替换，不含任何颜色运算。 */
  function setVars(cssText) {
    /* 先清掉旧的 --tt-/--mf-/--syn- 内联属性（保留 --pm-* 柔光变量） */
    for (var i = root.style.length - 1; i >= 0; i--) {
      var n = root.style[i];
      if (/^--(tt|mf|syn|lp)-/.test(n)) root.style.removeProperty(n);
    }
    if (!cssText) return;
    cssText.split(';').forEach(function (kv) {
      var p = kv.indexOf(':'); if (p < 0) return;
      var k = kv.slice(0, p).trim(), v = kv.slice(p + 1).trim();
      if (k && v) root.style.setProperty(k, v);
    });
  }
  function applyStyle() {
    var key = cur.style + '|' + cur.theme;
    var cssText = (P.styleCss && P.styleCss[key]) || '';
    setVars(cssText);
    root.setAttribute('data-doc-style', cur.style);
    root.setAttribute('data-table-theme', cur.style);
    root.setAttribute('data-theme', cur.theme);
    root.setAttribute('data-layout', cur.layout);
    content.style.setProperty('--lh', LH_NUM[cur.lh] || 1.78);
  }

  /* ---------- 5. 全文查找：纯 DOM，不依赖主应用 ---------- */
  function clearMarks() {
    $$('mark.mdx-hit', content).forEach(function (m) {
      if (!m.parentNode) return;
      m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
    });
    try { content.normalize(); } catch (e) { }
    marks = []; markIdx = -1;
  }
  function updateFind() {
    var c = $('#mdx-count'); if (c) c.textContent = marks.length ? (markIdx + 1) + '/' + marks.length : '0/0';
  }
  function focusHit(i) {
    if (!marks.length) { updateFind(); return; }
    marks.forEach(function (m) { m.classList.remove('mdx-cur'); });
    markIdx = ((i % marks.length) + marks.length) % marks.length;
    var m = marks[markIdx];
    m.classList.add('mdx-cur');
    try { m.scrollIntoView({ block: 'center' }); } catch (e) { try { m.scrollIntoView(); } catch (e2) { } }
    updateFind();
  }
  function runFind(q) {
    clearMarks();
    q = (q || '').trim();
    if (!q) { updateFind(); return; }
    var needle = q.toLowerCase();
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) {
        var p = t.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('script,style,template,mark,select,input,textarea,svg')) return NodeFilter.FILTER_REJECT;
        return t.nodeValue.toLowerCase().indexOf(needle) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var text = node.nodeValue, low = text.toLowerCase(), from = 0, at, last = 0;
      var frag = document.createDocumentFragment();
      while ((at = low.indexOf(needle, from)) >= 0) {
        if (at > last) frag.appendChild(document.createTextNode(text.slice(last, at)));
        var mk = document.createElement('mark');
        mk.className = 'mdx-hit'; mk.textContent = text.slice(at, at + needle.length);
        frag.appendChild(mk); marks.push(mk);
        last = at + needle.length; from = last;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
    markIdx = marks.length ? 0 : -1;
    if (marks.length) focusHit(0); else updateFind();
  }

  /* ---------- 6. 图表类型 / 流程图结构：预置 <template> 切换显隐 ---------- */
  function tpl(kind, i, v) {
    if (!store) return null;
    return store.querySelector('template[data-kind="' + kind + '"][data-i="' + i + '"][data-v="' + v + '"]');
  }
  function switchChart(box, v) {
    if (!box || box.dataset.mdxI == null) return false;
    var t = tpl('ct', box.dataset.mdxI, v);
    if (!t) return false;
    box.innerHTML = t.innerHTML;              /* <template> 在 #mdx-store，不会被覆盖 */
    box.dataset.ct = v;
    box.classList.add('show');
    $$('.chart-types button', box).forEach(function (b) { b.classList.toggle('on', b.dataset.ct === v); });
    return true;
  }
  function switchFlow(wrap, v) {
    if (!wrap || wrap.dataset.mdxI == null) return false;
    var t = tpl('fm', wrap.dataset.mdxI, v);
    if (!t) return false;
    var art = wrap.querySelector('.mf-art');
    if (!art) return false;
    art.innerHTML = t.innerHTML;
    wrap.dataset.mdxMode = v;
    $$('.mf-modes button', wrap).forEach(function (b) { b.classList.toggle('on', b.dataset.mode === v); });
    /* 复刻 fitArt 的宽图保护：viewBox 超过容器 1.8 倍时允许横向滚动 */
    try {
      var svg = art.querySelector('svg.mf-svg');
      if (svg && svg.viewBox && svg.viewBox.baseVal) {
        var wide = svg.viewBox.baseVal.width > (art.clientWidth || 900) * 1.8;
        svg.classList.toggle('is-wide', wide);
        art.classList.toggle('has-wide', wide);
      }
    } catch (e) { }
    return true;
  }
  function batch(kind, v) {
    if (!v) return;
    if (kind === 'ct') $$('.chart-box[data-mdx-i]', content).forEach(function (b) { switchChart(b, v); });
    else $$('.mf-wrap[data-mdx-i]', content).forEach(function (w) { switchFlow(w, v); });
  }

  /* ---------- 7. 事件（全部委托，clone DOM 无绑定也不影响） ---------- */
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.find) {
      var q = $('#mdx-q');
      if (b.dataset.find === 'clear') { if (q) q.value = ''; runFind(''); }
      else if (b.dataset.find === 'next') focusHit(markIdx + 1);
      else if (b.dataset.find === 'prev') focusHit(markIdx - 1);
      return;
    }
    if (b.dataset.font) {
      if (b.dataset.font === '0') cur.fs = baseFs;
      else cur.fs = Math.max(12, Math.min(28, cur.fs + (b.dataset.font === '+' ? 1 : -1)));
      content.style.fontSize = cur.fs + 'px';
      return;
    }
    if (b.dataset.toggle === 'pm') {
      cur.pm = !cur.pm;
      if (cur.pm) root.setAttribute('data-pm', 'on'); else root.removeAttribute('data-pm');
      syncSeg();
      return;
    }
    if (b.id === 'mdx-print') { window.print(); return; }
    if (b.id === 'mdx-fold') {
      document.body.classList.toggle('mdx-folded');
      b.textContent = document.body.classList.contains('mdx-folded') ? '+' : '−';
      return;
    }
    var seg = b.closest('.mdx-seg');
    if (seg && b.dataset.v) {
      cur[seg.dataset.seg] = b.dataset.v;
      applyStyle(); syncSeg();
      return;
    }
  });
  bar.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'mdx-q') return;
    var q = e.target.value;
    clearTimeout(findTimer);
    findTimer = setTimeout(function () { runFind(q); }, 180);
  });
  bar.addEventListener('keydown', function (e) {
    if (!e.target || e.target.id !== 'mdx-q') return;
    if (e.key === 'Enter') { e.preventDefault(); runFind(e.target.value); focusHit(markIdx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') { e.target.value = ''; runFind(''); }
  });
  bar.addEventListener('change', function (e) {
    if (e.target.id === 'mdx-ct-all') { batch('ct', e.target.value); e.target.value = ''; }
    if (e.target.id === 'mdx-fm-all') { batch('fm', e.target.value); e.target.value = ''; }
  });
  content.addEventListener('click', function (e) {
    var ct = e.target.closest && e.target.closest('.chart-types button[data-ct]');
    if (ct) { switchChart(ct.closest('.chart-box'), ct.dataset.ct); return; }
    var fm = e.target.closest && e.target.closest('.mf-modes button[data-mode]');
    if (fm) { switchFlow(fm.closest('.mf-wrap'), fm.dataset.mode); }
  });


  /* ---------- 9. CR-2026-11-15-06 液态胶囊（导出页同款，自包含精简版） ----------
     导出页的 .chart-types / .mf-modes 会被 switchChart/switchFlow 整段 innerHTML
     重写，胶囊必须每次切换后重新对齐；顶部菜单分段同理。 */
  var LP_REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LP_SEL = ['#mdx-bar .mdx-seg', '.chart-types', '.mf-modes'];
  function lpRect(host, el) {
    var x = 0, y = 0, n = el, guard = 0;
    while (n && n !== host && guard++ < 12) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function lpSync(host, animate) {
    if (!host) return;
    if (host.offsetWidth === 0 && host.offsetHeight === 0) return;
    var el = host.querySelector('button.on');
    var pill = null, k = host.children;
    for (var i = 0; i < k.length; i++) {
      if (k[i].classList && k[i].classList.contains('lp-pill')) { pill = k[i]; break; }
    }
    if (!pill) {
      pill = document.createElement('i');
      pill.className = 'lp-pill'; pill.setAttribute('aria-hidden', 'true');
      host.insertBefore(pill, host.firstChild);
    }
    host.classList.add('lp-host');
    if (!el) { pill.classList.remove('on'); host.classList.add('lp-ready'); return; }
    var r = lpRect(host, el);
    if (!(r.w > 0 && r.h > 0)) return;
    var prev = host.__lpRect;
    var moved = prev && Math.abs(prev.x - r.x) > 0.5;
    host.__lpRect = r;
    pill.style.width = r.w + 'px'; pill.style.height = r.h + 'px';
    pill.style.setProperty('--lp-x', r.x + 'px');
    pill.style.setProperty('--lp-y', r.y + 'px');
    pill.classList.add('on'); host.classList.add('lp-ready');
    if (!animate || !moved || LP_REDUCE) return;
    var dx = r.x - prev.x;
    var k2 = Math.min(0.34, 0.10 + Math.abs(dx) / 420);
    pill.classList.add('stretch');
    pill.style.setProperty('--lp-sx', (1 + k2).toFixed(3));
    pill.style.setProperty('--lp-sy', (1 - k2 * 0.42).toFixed(3));
    pill.style.setProperty('--lp-ox', dx > 0 ? '0%' : '100%');
    clearTimeout(host.__lpT);
    host.__lpT = setTimeout(function () {
      pill.classList.remove('stretch');
      pill.style.setProperty('--lp-sx', '1');
      pill.style.setProperty('--lp-sy', '1');
    }, 190);
  }
  function lpAll(animate) {
    LP_SEL.forEach(function (s) { $$(s).forEach(function (h) { lpSync(h, animate); }); });
  }
  function lpReset() {
    LP_SEL.forEach(function (s) { $$(s).forEach(function (h) { h.__lpRect = null; lpSync(h, false); }); });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('button')) return;
    requestAnimationFrame(function () { lpAll(true); });
    setTimeout(function () { lpAll(true); }, 90);
  });
  window.addEventListener('resize', function () {
    clearTimeout(window.__lpRz);
    window.__lpRz = setTimeout(lpReset, 160);
  });

  /* ---------- 8. 初始对齐 ---------- */
  applyStyle(); syncSeg(); updateFind(); lpAll(false);
  requestAnimationFrame(lpReset);
  window.MDExport = {
    state: cur, find: runFind, chart: switchChart, flow: switchFlow,
    style: applyStyle, liquid: lpAll, version: 'CR-2026-11-15-06'
  };
})();
