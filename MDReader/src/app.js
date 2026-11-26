/* MD Reader v1.0 — 本地 Markdown 阅读器主逻辑（无网络依赖） */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var content = $('#content'), reader = $('#reader'), welcome = $('#welcome');
  var S = {
    files: [], byKey: new Map(), images: new Map(), current: null, tabs: [], activeKey: null,
    baseDir: '', theme: 'light', layout: 'card', tableTheme: 'mono', docStyle: 'mono', fs: 15, lh: 'standard', tab: 'files', collapsedDirs: new Set(),
    findMarks: [], findIdx: -1, mermaidReady: false, recent: [],
    editing: false, dirty: false, whole: false, blocks: [], gaps: [], editBlock: -1, fm: '',
    /* CR-03：group=当前编辑的「节」（heading + 其后正文，见 groupSections）；
       bvOff=块内预览开关（true 表示关掉，默认开）；groupOpen=侧栏各节的展开态，按 from 下标记。 */
    group: null, bvOff: false, groupOpen: {},
    flowCfg: null, flowConverted: false, flowDocKey: null,
    chartAuto: false, flowAuto: false, chartType: 'auto', logo: 'cartoon',
    /* 图表展开态按「文档 key」分桶保存：切到别的文档再回来，各自还原各自的展开情况 */
    chartState: {}, chartDocKey: null, pendingChart: null,
    flowStyle: 'classic', flowMode: 'auto', lang: BUILD_DEFAULT_LANG,
    /* 云晰柔光：与 theme/layout 正交的一层「玻璃」，可叠加在任意皮肤上 */
    papermatte: false,
    pm: { sepia: 12, sat: 78, con: 89, bri: 97, noise: 2.8 }
  };
  /* 应用图标组：极简（纯黑白）/ 卡通（黑白 + 红耳机 + 蓝眼睛，默认）。
     每组都有明暗两版，由 CSS 按 data-logo × data-theme 组合取用。 */
  var LOGO_NAMES = { minimal: '极简黑白', cartoon: '卡通黑白红蓝' };
  /* 图表风格：auto 按数据自动判断，其余四种为固定风格；系统设置可把任意一种设为默认 */
  var CHART_TYPES = ['auto', 'bar', 'line', 'trend', 'pie', 'rose'];
  var CHART_LABELS = { auto: '自动', bar: '柱状', line: '折线', trend: '趋势', pie: '圆角环形图', rose: '南丁格尔玫瑰图' };
  /* 流程图风格：classic 为默认 drawio 现代卡片风，另 4 套为可选设计主题。
     颜色写在 template.html 的 html[data-flow-style] 上，SVG 内嵌 var() 即时联动。 */
  var FLOW_STYLES = ['classic', 'minimal', 'business', 'vivid', 'dark'];
  var FLOW_STYLE_NAMES = { classic: '经典 drawio', minimal: '极简线稿',
    business: '商务蓝', vivid: '活力多彩', dark: '暗夜霓虹' };
  /* 流程图结构：与配色正交的第二条轴。风格决定「什么颜色」，结构决定「怎么排」。
     改结构要重绘 SVG（几何变了），改风格只换 CSS 变量。 */
  var FLOW_MODES = ['auto', 'pipeline', 'mindmap', 'org', 'timeline'];
  var FLOW_MODE_NAMES = { auto: '自动', pipeline: '多彩流水', mindmap: '思维导图',
    org: '组织结构图', timeline: '时间图' };
  /* 文档统一风格（原「表格配色」升级，CR-2026-11-15-01）：
     四套色板不再只服务表格 / 图表，而是统一驱动：
       · 分段背景 / 卡片徽章 / 设置选中态  → --tt-accent / --tt-bar
       · 数据图表色板                      → colors
       · 流程图强调色（节点 / 彩带 / 连线）→ mf 四主色 + 派生的 a*s / a*b
       · 代码关键字高亮                    → --syn-*
     mf 是四个主色；浅底 / 色带 / 语法色由 applyDocStyle() 按当前明暗主题实时派生，
     因此同一套风格在浅色 / 深色 / 护眼下都可读，且四个模块颜色同源。 */
  var DOC_STYLES = {
    mono: { name: '黑白极简', head: '#111111', headFg: '#ffffff', edge: '#d9d9d9',
      accent: '#111111', accentFg: '#ffffff',
      colors: ['#111111', '#4b5563', '#8a94a2', '#1f2328', '#6b7280', '#374151'],
      mf: ['#374151', '#6b7280', '#9ca3af', '#4b5563'] },
    tech: { name: '蓝色科技', head: '#2563eb', headFg: '#ffffff', edge: '#c7dbfb',
      accent: '#2563eb', accentFg: '#ffffff',
      colors: ['#2563eb', '#0ea5e9', '#06b6d4', '#6366f1', '#14b8a6', '#3b82f6'],
      mf: ['#2563eb', '#0ea5e9', '#06b6d4', '#6366f1'] },
    gov: { name: '红色政商', head: '#9b1c1c', headFg: '#ffffff', edge: '#d9c49b',
      accent: '#9b1c1c', accentFg: '#ffffff',
      colors: ['#9b1c1c', '#c9a227', '#b45309', '#7f1d1d', '#a16207', '#be123c'],
      mf: ['#9b1c1c', '#c9a227', '#b45309', '#7f1d1d'] },
    cute: { name: '粉色卡通', head: '#ffe4f0', headFg: '#a4447a', edge: '#ffd6e8',
      accent: '#e0417f', accentFg: '#ffffff',
      colors: ['#ff9ec4', '#f472b6', '#e0417f', '#fbbf24', '#c084fc', '#f9a8d4'],
      mf: ['#e0417f', '#a855f7', '#f472b6', '#f59e0b'] }
  };
  function docStyle() { return DOC_STYLES[S.docStyle] || DOC_STYLES.mono; }
  /* 兼容别名：Word 导出表头色仍读 head / headFg / edge */
  function tableTheme() { return DOC_STYLES[S.tableTheme] || DOC_STYLES.mono; }
  function chartColors() { return docStyle().colors; }
  var CALLOUT = {
    note: ['📝', '笔记'], info: ['ℹ️', '信息'], tip: ['💡', '提示'], success: ['✅', '成功'],
    question: ['❓', '问题'], warning: ['⚠️', '警告'], caution: ['⚠️', '注意'],
    danger: ['🚨', '危险'], error: ['❌', '错误'], example: ['📌', '示例'],
    quote: ['💬', '引用'], abstract: ['📄', '摘要'], todo: ['☑️', '待办']
  };

  /* ---------- 国际化 / i18n ----------
     简体中文为源语言（界面原文即中文）；English 通过「中文原文 → 译文」字典在运行时
     替换 DOM 文本节点与 title/placeholder/aria-label/alt，切回中文时按首次记录的原样恢复。
     用户文档正文、文件名、大纲、最近记录永远不参与翻译（userContent 排除）。 */
  var BUILD_DEFAULT_LANG = '__DEFAULT_LANG__';
  if (['zh-CN', 'en', 'auto'].indexOf(BUILD_DEFAULT_LANG) < 0) BUILD_DEFAULT_LANG = 'auto';
  var I18N = window.MDI18N || { names: {}, dict: { 'zh-CN': {}, en: {} } };
  var LANG_VALUES = ['zh-CN', 'en', 'auto'];
  var LANG_NAMES = I18N.names || { 'zh-CN': '简体中文', en: 'English', auto: '其他 / Other' };
  /* 这些常用词只做「整串精确匹配」，不参与子串替换，避免出现中英混杂 */
  /* CR-2026-11-20-02：新增 10 个高风险短词。它们在展示页卡片正文里高频出现，
     但又各自对应设置面板的独立按钮标签（那里需要翻译）。
     留在子串替换池里会把长句拆碎 —— 实测「护眼是低蓝光暖米黄」被换成
     「Sepia是低蓝光暖米黄」、字号被换成「words号」。加进来后：
       · 设置面板的按钮走整串精确匹配（exact 分支在 NO_SUB 判断之前），照常翻译；
       · 长句走新增的整句词条，也不会再被这些短词蚕食。 */
  var I18N_NO_SUB = { '流程图': 1, '数据图表': 1, '表格配色': 1, '默认图表风格': 1,
    '文件': 1, '阅读': 1, '主题': 1, '卡片': 1, '纸张': 1, '编辑': 1, '保存': 1,
    '导出': 1, '行': 1, '列': 1, '新': 1, '蓝': 1, '红': 1, '粉': 1, '日': 1, '月': 1, '万': 1,
    '护眼': 1, '柔光': 1, '图表': 1, '复制': 1, '预览': 1, '字号': 1, '皮肤': 1,
    '风格': 1, '样式': 1, '排版': 1 };
  /* 文件树 / 大纲 / 最近列表里只有这些「应用生成的固定文案」可翻译，其余一律按用户内容保留 */
  var SIDE_UI = ['📁 当前目录', '还没有文件', '选择 MD 文件', '选择文件夹',
    '或直接把文件 / 文件夹拖进窗口', '没有匹配的文件', '当前文档没有标题'];
  var I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  var _sortedKeys = {}, _zhNodes = [], _zhSeen = new WeakSet(), _zhEls = [], _zhElSeen = new WeakSet();
  var _titleZh = document.title;
  var _i18nBusy = false, _i18nTimer = null;

  function sysLang() {
    var l = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || '';
    return /^zh/i.test(l) ? 'zh-CN' : 'en';
  }
  function effLang() { return S.lang === 'auto' ? sysLang() : S.lang; }
  function keysFor(lang) {
    if (!_sortedKeys[lang]) {
      _sortedKeys[lang] = Object.keys(I18N.dict[lang] || {}).sort(function (a, b) { return b.length - a.length; });
    }
    return _sortedKeys[lang];
  }
  function tr(s) {
    var lang = effLang();
    if (!s || lang === 'zh-CN' || !/[\u4e00-\u9fff]/.test(s)) return s;
    var d = I18N.dict[lang] || {};
    var exact = s.trim();
    if (Object.prototype.hasOwnProperty.call(d, exact)) {
      return s.replace(exact, function () { return d[exact]; });
    }
    var out = s, ks = keysFor(lang);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (k.length < 2 || I18N_NO_SUB[k]) continue;
      if (out.indexOf(k) >= 0) out = out.split(k).join(d[k]);
    }
    return out;
  }
  function t(s) { return tr(s); }
  /* isAttr=true 表示「正在判定该元素的属性（title/aria-label/placeholder）是否可翻」。
     同一元素常常文本是用户内容、属性是 UI 文案（#editor / #sideSections 就是），
     所以两个判定入口必须分开，不能共用一个返回值。 */
  function userContent(node, isAttr) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return true;
    if (el.closest('#setLang')) return true;                       // 语言名称保持各语言本名
    /* CR-08：只有「状态相关、由 JS 按当前态显式生成」的文案不参与静态扫描 ——
       #frToggle 的 title / 文字随收起↔展开切换，若让扫描按「首次见到的中文」
       回写，会把新状态的英文打回旧状态的译文（实测 title 被回滚）。
       14 个代理的静态文案与容器 aria-label 仍走正常扫描，历史英文契约不变。 */
    if (el.closest('#frToggle')) return true;
    /* 剪贴板预览 / 状态是用户内容或已手动翻译的动态文案，绝不参与字典替换 */
    if (el.closest('#newPop .np-preview,#newPop .np-state')) return true;
    /* CR-2026-11-26-01 知识库整块豁免字典替换。
       原因：这里几乎全是用户内容 —— 文件名、相对路径、由用户词汇聚出来的主题组名。
       字典里有 '主题': ' theme' 这种短词，一旦走子串替换，`会议主题.md` 会被改成
       `会议 theme.md`，组名 `标签 · 归档` 也会被拆碎。
       所以改为整块不扫，UI 文案统一由 __kbRelabel 按当前语言直接写（见下方）。 */
    if (el.closest('#kbView')) return true;
    /* CR-03：这两处混装了「用户内容」与「应用 UI」，不能整块豁免。
       - #editor：内容是用户写的 Markdown（绝不翻译），但它自己的 aria-label 是 UI 文案；
       - #sideSections：条目里是用户文档的标题（绝不翻译），但空态提示是 UI 文案。
     所以拆成两档：文本节点按原文判定，属性按「该元素的 UI 文案」判定。
     传 isAttr=true 时跳过「只放行 SIDE_UI 白名单」那一步，让属性能走正常翻译。 */
    if (el.closest('#sideFiles,#sideOutline,#sideSections,#tabbar,#recentList,#editor')) {
      if (isAttr) return false;                                    // 属性是 UI 文案，要翻
      var raw = node.nodeType === 3 ? node.nodeValue : (el.textContent || '');
      return SIDE_UI.indexOf(raw.trim()) < 0;
    }
    if (el.closest('#content')) {
      /* 只放行「应用生成的 UI」：表格工具条 / 图表 / 代码块工具条 / 流程图工具条 / frontmatter 摘要；
         用户正文、标题、表格、图例、SVG 节点文字一律不动 */
      return !el.closest('.tw-bar,.chart-title,.chart-types,.chart-sub,.md-render-hint,.flow-hint,.code-bar,.mf-tools,.frontmatter > summary');
    }
    return false;
  }
  function scanI18n() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = w.nextNode())) {
      if (!/[\u4e00-\u9fff]/.test(n.nodeValue) || userContent(n)) continue;
      var p = n.parentElement;
      if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) continue;
      if (!_zhSeen.has(n)) { _zhSeen.add(n); _zhNodes.push({ node: n, zh: n.nodeValue }); }
    }
    var els = document.body.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (_zhElSeen.has(el) || userContent(el, true)) continue;
      var o = {};
      for (var j = 0; j < I18N_ATTRS.length; j++) {
        var a = I18N_ATTRS[j];
        if (el.hasAttribute(a) && /[\u4e00-\u9fff]/.test(el.getAttribute(a))) o[a] = el.getAttribute(a);
      }
      if (Object.keys(o).length) { _zhElSeen.add(el); _zhEls.push({ el: el, attrs: o }); }
    }
  }
  function applyI18nDOM(lang) {
    _zhNodes.forEach(function (r) {
      if (!r.node.isConnected) return;
      var cur = r.node.nodeValue, v;
      if (lang === 'zh-CN') v = r.zh;
      else {
        v = tr(r.zh);
        /* 同一节点被动态追加了中文（例如流程图工具条追加「宽图可横向滚动」），
           基于当前值再补翻一次，避免新追加的片段残留中文 */
        if (/[\u4e00-\u9fff]/.test(cur) && cur !== v) v = tr(cur);
      }
      if (cur !== v) r.node.nodeValue = v;
    });
    _zhEls.forEach(function (r) {
      if (!r.el.isConnected) return;
      Object.keys(r.attrs).forEach(function (a) {
        var v = lang === 'zh-CN' ? r.attrs[a] : tr(r.attrs[a]);
        if (r.el.getAttribute(a) !== v) r.el.setAttribute(a, v);
      });
    });
    document.title = lang === 'zh-CN' ? _titleZh : tr(_titleZh);
    /* CR-2026-11-20-02：轮播进度点 / 左右按钮的 aria-label 是 JS 拼接生成的，
       且 `第 1 项功能` 走子串替换会被蚕食成 `第 1 feature`。这里把它们从
       字典替换里摘出来，统一由 __wfRelabel 按当前语言直接重写。
       必须放在本函数末尾（而不是 applyI18n 里）：MutationObserver 会在
       切语言后 120ms 再跑一遍本函数，若只在外层调用一次，这次重扫会把
       已写好的 `Feature 1` 又覆写回半中半英。 */
    if (typeof window.__wfRelabel === 'function') window.__wfRelabel();
    /* CR-03：编辑态的节标签 / 预览开关 / 吸顶标注同样是 JS 生成的，
       同样必须在这里重刷（放在本函数末尾的理由见上）。 */
    if (typeof window.__editRelabel === 'function') window.__editRelabel();
    /* CR-2026-11-26-01：知识库的 UI 文案同样是 JS 生成的（统计标签 / 三段视图
       / 空态 / 分组标题 / 条形图标题），而 #kbView 整块不进字典扫描，
       所以必须在这里显式重刷。理由与上面两条完全相同。 */
    if (typeof window.__kbRelabel === 'function') window.__kbRelabel();
  }
  function scheduleI18n() {
    if (_i18nBusy || effLang() === 'zh-CN') return;
    clearTimeout(_i18nTimer);
    _i18nTimer = setTimeout(function () {
      _i18nBusy = true;
      try { scanI18n(); applyI18nDOM(effLang()); } finally { _i18nBusy = false; }
    }, 120);
  }
  if (window.MutationObserver) {
    new MutationObserver(function () { scheduleI18n(); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function applyI18n(opts) {
    opts = opts || {};
    var lang = effLang();
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    _i18nBusy = true;
    try { scanI18n(); applyI18nDOM(lang); } finally { _i18nBusy = false; }
    var sel = $('#setLang'); if (sel) sel.value = S.lang;
    /* 语言名称按各语言本名显示；第三项在英文模式下换成纯英文 */
    var optAuto = $('#setLang option[value="auto"]');
    if (optAuto) optAuto.textContent = lang === 'en' ? 'Other (System)' : '其他 / Other（跟随系统）';
    var slogan = $('.w-slogan');
    if (slogan) slogan.setAttribute('aria-label', lang === 'en' ? 'Make Markdown reading a pleasure' : '让 Markdown 阅读成为一种享受');
    var D = window.__MD_DESKTOP__; if (D && D.setLang) D.setLang(lang);
    /* CR-08：专注菜单收起开关的文案随语言走（它是 JS 动态写的，
       不在 _zhNodes 的静态缓存里，必须显式重生成） */
    if (typeof frSyncToggle === 'function') frSyncToggle();
    /* CR-06：翻译会改按钮文字宽度（「标准」46px → Standard 76px），但不改
       <html> 属性也不重建 .set-seg 子节点，两个 observer 都不会触发。
       这里显式补量，否则英文界面胶囊会停在中文宽度上。 */
    if (typeof lpRefresh === 'function') {
      requestAnimationFrame(lpRefresh);
      setTimeout(lpRefresh, 120);
    }
    /* CR-2026-11-20-02：轮播卡宽是按「文案区实测高度」反推的（见 template.html 的
       fitCard）。英文文案比中文长，.wf-info 从 173 涨到 190px，卡就会顶破一屏。
       翻译改的是文本节点而不是 <html> 属性，两个 observer 都不管这里，必须显式补量。 */
    if (typeof window.__wfFit === 'function') {
      requestAnimationFrame(window.__wfFit);
      setTimeout(window.__wfFit, 130);
    }
    if (opts.toast) toast(t('已切换：') + (LANG_NAMES[S.lang] || S.lang));
  }
  function setLang(v, opts) {
    opts = opts || {};
    if (LANG_VALUES.indexOf(v) < 0) v = BUILD_DEFAULT_LANG;
    S.lang = v; save('lang', v);
    syncSettingsUI();
    if (S.current && !S.editing) rerender();
    updateStatus();
    applyI18n({ toast: !opts.quiet });
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function base(p) { return String(p).replace(/\\/g, '/').split('/').pop(); }
  function dirOf(rel) { var i = String(rel).lastIndexOf('/'); return i < 0 ? '' : rel.slice(0, i); }
  function norm(p) { return decodeURIComponent(String(p).replace(/\\/g, '/').replace(/^\.\//, '').split('#')[0].trim().toLowerCase()); }
  function isMd(n) { return /\.(md|markdown|mdown|mkd|txt)$/i.test(n || ''); }
  function isImg(n) { return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(n || ''); }
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }
  function save(k, v) { try { localStorage.setItem('mdreader.' + k, v); } catch (e) { } }
  function load(k, d) { try { var v = localStorage.getItem('mdreader.' + k); return v === null ? d : v; } catch (e) { return d; } }

  /* 正文内滚动：不用 scrollIntoView，因为它会调整所有可滚动祖先，
     可能把带 overflow-x:auto 的工具栏一起滚走。这里只动 .reader。 */
  function scrollInReader(el, behavior, offset) {
    if (!el) return;
    var top = el.getBoundingClientRect().top - reader.getBoundingClientRect().top
      + reader.scrollTop - (offset == null ? 12 : offset);
    top = Math.max(0, top);
    try { reader.scrollTo({ top: top, behavior: behavior || 'auto' }); }
    catch (e) { reader.scrollTop = top; }
  }

  /* ---------- 读取文件（UTF-8 / GB18030 自动识别） ---------- */
  async function readText(file) {
    var buf = await file.arrayBuffer();
    var txt = new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^\uFEFF/, '');
    var bad = (txt.match(/\uFFFD/g) || []).length;
    if (bad > 1) {
      try {
        var g = new TextDecoder('gb18030').decode(buf).replace(/^\uFEFF/, '');
        if ((g.match(/\uFFFD/g) || []).length < bad) return { text: g, enc: 'GB18030' };
      } catch (e) { }
    }
    return { text: txt, enc: 'UTF-8' };
  }
  async function getContent(item) {
    if (item.cached != null) return item.cached;
    var r = await readText(item.file);
    item.cached = r.text; item.enc = r.enc;
    return r.text;
  }

  /* ---------- 导入 ---------- */
  function keyOf(name) {
    return base(name).toLowerCase().replace(/\.(md|markdown|mdown|mkd)$/i, '');
  }
  async function ingest(items, opts) {
    opts = opts || {};
    if (opts.baseDir) S.baseDir = opts.baseDir;
    var _existing = new Set(S.files.map(function (f) { return norm(f.rel || f.name); }));
    var newFiles = [], reused = [];
    var mds = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var rel = (it.rel || it.name || '').replace(/\\/g, '/');
      var nm = it.name || base(rel);
      if (it.file && isImg(nm)) {
        var url = URL.createObjectURL(it.file);
        S.images.set(norm(rel), url);
        if (!S.images.has(norm(nm))) S.images.set(norm(nm), url);
        continue;
      }
      if (!isMd(nm) && it.cached == null) continue;
      if (_existing.has(norm(rel))) { for (var z = 0; z < S.files.length; z++) if (norm(S.files[z].rel || S.files[z].name) === norm(rel)) { reused.push(S.files[z]); break; } continue; }
      _existing.add(norm(rel));
      var obj = { name: nm, rel: rel, dir: dirOf(rel), file: it.file || null, cached: it.cached != null ? it.cached : null, enc: it.enc || '', absPath: it.absPath || '' };
      newFiles.push(obj);
      if (!S.byKey.has(keyOf(nm))) S.byKey.set(keyOf(nm), obj);
    }
    newFiles.sort(function (a, b) { return a.rel.localeCompare(b.rel, 'zh-CN', { numeric: true }); });
    S.files = S.files.concat(newFiles);
    S.files.sort(function (a, b) { return a.rel.localeCompare(b.rel, 'zh-CN', { numeric: true }); });
    resetEditing();
    buildTree();
    updateStatus();
    /* CR-07：文件已收录 ≠ 标签还开着。
       关标签只关视图、不删 S.files（左侧文件树与最近记录要保留），所以「关闭所有」
       之后再选同一批文件，会全部落进 reused 分支。旧逻辑只 openFile(reused[0])，
       6 个文件只开回 1 个标签 —— 批量关闭把这条老路径变成了主干场景，必须补齐：
       已收录但当前没有标签的，重新开成标签；已有标签的保持不动（不抢激活）。 */
    var reopen = reused.filter(function (f) { return !findTab(tabKeyOf(f)); });
    var batch = newFiles.concat(reopen);
    if (!batch.length) {
      if (reused.length) { await openFile(reused[0], null, { activate: true, pushRecent: false }); }
      else if (!S.tabs.length) { toast('没有找到 .md 文件'); enterWelcomeView(); }
      renderTabbar();
      return 0;
    }
    var cap = opts.maxTabs || 12;
    var opened = 0;
    /* 已有激活标签时，重开的那批一律后台落位，不把用户正在读的文档挤走 */
    var keepActive = !!S.activeKey && !newFiles.length;
    for (var j = 0; j < batch.length && opened < cap; j++) {
      await openFile(batch[j], null, { activate: !keepActive && j === 0, pushRecent: !keepActive && j === 0 });
      opened++;
    }
    renderTabbar();
    if (batch.length > cap) toast('已打开前 ' + cap + ' 个文档，其余 ' + (batch.length - cap) + ' 个可在左侧文件树点击打开');
    return batch.length;
  }
  async function loadFileList(fileList) {
    var items = Array.prototype.slice.call(fileList).map(function (f) {
      var p = f.path || '';   // Electron/部分环境会带绝对路径
      return { file: f, name: f.name, rel: f.webkitRelativePath || f.name, absPath: p };
    });
    var n = await ingest(items);
    if (n) toast('已打开 ' + n + ' 个文档');
  }
  function walkEntry(entry, prefix, out) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (f) {
          var p = '';
          try { p = f.path || ''; } catch (e) { }
          out.push({ file: f, name: f.name, rel: prefix + f.name, absPath: p });
          resolve();
        }, function () { resolve(); });
      } else if (entry.isDirectory) {
        var rd = entry.createReader(), all = [];
        function pump() {
          rd.readEntries(function (batch) {
            if (!batch.length) {
              Promise.all(all.map(function (e) { return walkEntry(e, prefix + entry.name + '/', out); })).then(resolve, resolve);
              return;
            }
            all = all.concat(Array.prototype.slice.call(batch)); pump();
          }, function () { resolve(); });
        }
        pump();
      } else resolve();
    });
  }

  /* ================================================================
     创建 MD
     两种入口：空白文档 / 剪贴板内容快速创建。
     新建文档只存在于内存（absPath 为空、isNew=true），Ctrl+S 时
     桌面版弹「另存为」、便携版直接下载，保存成功后回填真实路径。
     ================================================================ */
  var NEW_SEQ = 0;
  function newDocName(txt) {
    /* 从内容里猜一个体面的文件名：第一个 H1 标题 → 第一行文字 → 未命名 */
    var base = '';
    if (txt) {
      var h1 = /^#{1}\s+(.+)$/m.exec(txt);
      var line = h1 && h1[1] || (txt.split('\n').find(function (l) { return l.trim(); }) || '');
      base = line.replace(/^[#>\-*\s]+/, '').replace(/[*_`~\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 42);
    }
    if (!base) base = t('未命名文档');
    /* 文件名不能含路径符号 / 保留字符 */
    base = base.replace(/[\\/:*?"<>|]/g, '').trim() || t('未命名文档');
    var name = base + '.md';
    var n = 1;
    while (S.files.some(function (f) { return f.name === name; })) { n++; name = base + ' ' + n + '.md'; }
    return name;
  }
  async function createNewDoc(text, opts) {
    opts = opts || {};
    var md = text == null ? '' : String(text);
    var name = opts.name || newDocName(md);
    var item = {
      name: name, rel: name, dir: '', file: null,
      cached: md, enc: 'NEW', absPath: '',
      isNew: true, created: Date.now()
    };
    S.files.push(item);
    if (!S.byKey.has(keyOf(name))) S.byKey.set(keyOf(name), item);
    await openFile(item, null, { activate: true, pushRecent: false, force: true });
    buildTree();
    /* 空白文档直接进编辑态，落笔即写；带内容进来的先给预览，让用户看到渲染效果 */
    if (!md.trim()) {
      setEditing(true);
      toast(t('已创建空白文档 · 直接输入 Markdown，Ctrl+S 另存为 .md 文件'), 3400);
    } else {
      var lines = md.split('\n').length, chars = md.replace(/\s/g, '').length;
      toast(t('已从剪贴板创建：') + name + ' · ' + chars.toLocaleString('zh-CN') + t(' 字 / ') + lines + t(' 行'), 3600);
    }
    /* 新文档尚未落盘：无论是否改动，保存按钮都必须可用 */
    $('#btnSave').disabled = !canSave();
    updateStatus();
    return item;
  }

  /* ---------- 文件树 ---------- */
  function buildTree() {
    var box = $('#sideFiles'), filter = $('#fileFilter').value.trim().toLowerCase();
    var groups = new Map();
    S.files.forEach(function (f) {
      if (filter && f.rel.toLowerCase().indexOf(filter) < 0) return;
      if (!groups.has(f.dir)) groups.set(f.dir, []);
      groups.get(f.dir).push(f);
    });
    if (!groups.size) {
      box.innerHTML = S.files.length
        ? '<div class="side-hint">没有匹配的文件</div>'
        : '<div class="side-empty"><div class="se-ico">📂</div><b>还没有文件</b>' +
          '<button type="button" class="side-pick" data-kind="file">选择 MD 文件</button>' +
          '<button type="button" class="side-pick" data-kind="dir">选择文件夹</button>' +
          '<span>或直接把文件 / 文件夹拖进窗口</span></div>';
      return;
    }
    var html = '';
    Array.from(groups.keys()).sort(function (a, b) { return a.localeCompare(b, 'zh-CN', { numeric: true }); })
      .forEach(function (d) {
        var label = d ? d.split('/').pop() : '📁 当前目录';
        var closed = S.collapsedDirs.has(d);
        html += '<div class="tree-group"><div class="tree-folder' + (closed ? ' closed' : '') + '" data-dir="' + esc(d) + '">' +
          '<span class="caret">▼</span><span>' + esc(label) + '</span><span style="margin-left:auto;color:var(--muted);font-weight:400">' + groups.get(d).length + '</span></div>';
        if (!closed) groups.get(d).forEach(function (f, i) {
          var active = S.current === f ? ' active' : '';
          html += '<div class="tree-item' + active + '" data-i="' + S.files.indexOf(f) + '"><span class="fi">📄</span><span class="fn" title="' + esc(f.rel) + '">' + esc(f.name) + '</span></div>';
        });
        html += '</div>';
      });
    box.innerHTML = html;
  }
  function buildOutline() {
    var box = $('#sideOutline'), hs = $$('h1,h2,h3,h4,h5,h6', content), html = '';
    hs.forEach(function (h, i) {
      if (!h.id) h.id = 'h-' + i + '-' + h.textContent.trim().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 24);
      html += '<div class="outline-item" data-id="' + esc(h.id) + '" data-d="' + h.tagName.slice(1) + '">' + esc(h.textContent.trim()) + '</div>';
    });
    box.innerHTML = html || '<div class="side-hint">当前文档没有标题</div>';
  }

  /* ---------- Markdown 预处理 ---------- */
  function frontmatter(md) {
    var m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(md);
    if (!m) return { text: md, fm: '' };
    return { text: '\n' + md.slice(m[0].length), fm: m[1] };
  }
  function preprocess(md) {
    var lines = md.replace(/\r\n?/g, '\n').split('\n'), fence = null;
    var out = lines.map(function (line) {
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (f) {
        var ch = f[1][0], len = f[1].length;
        if (!fence) fence = { ch: ch, len: len };
        else if (fence.ch === ch && len >= fence.len) fence = null;
        return line;
      }
      if (fence) return line;
      // Obsidian 图片嵌入 ![[a.png|200]]
      line = line.replace(/!\[\[([^\]\n]+?)\]\]/g, function (all, inner) {
        var parts = inner.split('|'), p = parts[0].trim(), w = (parts[1] || '').trim();
        var attr = /^\d+$/.test(w) ? ' width="' + w + '"' : '';
        return '<img src="' + esc(p) + '" alt="' + esc(base(p)) + '"' + attr + '>';
      });
      // Wiki 双链 [[Note|Alias]] / [[Note#Heading]]
      line = line.replace(/\[\[([^\]\n]+?)\]\]/g, function (all, inner) {
        var parts = inner.split('|'), t = parts[0].trim(), alias = (parts[1] || '').trim();
        var hash = t.indexOf('#'), anchor = hash >= 0 ? t.slice(hash + 1) : '';
        if (hash >= 0) t = t.slice(0, hash);
        var label = alias || (anchor ? t + ' › ' + anchor : t);
        return '<a href="wiki:' + encodeURIComponent(t) + (anchor ? '#' + encodeURIComponent(anchor) : '') + '" class="wiki-link">' + esc(label) + '</a>';
      });
      // #标签
      line = line.replace(/(^|[^\w#\/])#([\p{L}\p{N}_][\p{L}\p{N}_\-\/]*)/gu, function (all, pre, tag) {
        return pre + '<span class="tag">#' + tag + '</span>';
      });
      return line;
    });
    return out.join('\n');
  }
  function frontHtml(fm) {
    if (!fm.trim()) return '';
    var rows = [], fmLines = fm.split(/\r?\n/);
    fmLines.forEach(function (l) {
      var m = /^([^:\n]+):\s*(.*)$/.exec(l);
      if (m) rows.push('<tr><td>' + esc(m[1].trim()) + '</td><td>' + esc(m[2].trim()) + '</td></tr>');
    });
    if (!rows.length) return '';
    return '<details class="frontmatter" open><summary>' + esc(tr('📋 文档属性 · ') + rows.length) + '</summary><table><tbody>' + rows.join('') + '</tbody></table></details>';
  }

  /* ---------- 渲染 ---------- */
  var renderToken = 0;
  /* ---------- 多标签：每个标签保存 {key, item, md, scrollTop} ---------- */
  function tabKeyOf(item) { return item.absPath || item.rel || item.name; }
  function findTab(key) {
    for (var i = 0; i < S.tabs.length; i++) if (S.tabs[i].key === key) return S.tabs[i];
    return null;
  }
  function renderTabbar() {
    var bar = $('#tabbar'); if (!bar) return;
    /* CR-07：标签集合变了，右键菜单的基准可能已不存在，先收起避免悬空 */
    if (typeof tabMenuClose === 'function') tabMenuClose();
    if (!S.tabs.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.setAttribute('role', 'tablist');
    var html = '';
    for (var i = 0; i < S.tabs.length; i++) {
      var t = S.tabs[i], on = t.key === S.activeKey;
      /* CR-07：标签可聚焦 + tab 语义，Shift+F10 / ContextMenu 键才能唤出批量关闭菜单。
         只加属性，不动 .tab 的底色 / 内边距 / 边框 / 尺寸（test-pm-global 与 CR-06 胶囊依赖）。 */
      html += '<div class="tab' + (on ? ' active' : '') + '" data-key="' + esc(t.key) + '" role="tab" tabindex="0"' +
        ' aria-selected="' + (on ? 'true' : 'false') + '" aria-haspopup="menu"' +
        ' title="' + esc(t.item.rel || t.item.name) + '">' +
        '<span class="tab-ico">📄</span><span class="tab-name">' + esc(t.item.name) + '</span>' +
        '<button class="tab-x" type="button" tabindex="-1" title="关闭标签" data-close="' + esc(t.key) + '">✕</button></div>';
    }
    bar.innerHTML = html;
  }
  function enterWelcomeView() {
    welcome.classList.remove('hidden');
    content.classList.add('hidden');
  }
  async function openFile(item, anchor, opts) {
    if (!item) return;
    opts = opts || {};
    if (!opts.force && S.editing && S.dirty && !window.confirm(t('当前文档有未保存的修改，继续会丢失。确定继续吗？'))) return;
    resetEditing();
    var key = tabKeyOf(item);
    var isNew = false, tab = findTab(key);
    if (!tab) { tab = { key: key, item: item, md: null, scrollTop: 0 }; S.tabs.push(tab); isNew = true; }
    if (opts.activate === false) { renderTabbar(); return; }
    await activateTab(tab, { anchor: anchor, pushRecent: isNew && opts.pushRecent !== false });
  }
  async function activateTab(tab, opts) {
    opts = opts || {};
    if (!tab) return;
    var token = ++renderToken;
    var prev = S.activeKey ? findTab(S.activeKey) : null;
    if (prev && prev !== tab) prev.scrollTop = reader.scrollTop;
    S.activeKey = tab.key;
    S.current = tab.item;
    if (tab.md == null) {
      try { tab.md = await getContent(tab.item); }
      catch (e) { toast('读取失败：' + e.message); S.activeKey = null; S.current = null; return; }
    }
    if (token !== renderToken) return;
    await render(tab.md, tab.item);
    if (token !== renderToken) return;
    if (opts.anchor) {
      var el = document.getElementById(decodeURIComponent(opts.anchor));
      if (el) scrollInReader(el, 'auto'); else reader.scrollTop = tab.scrollTop || 0;
    } else reader.scrollTop = tab.scrollTop || 0;
    welcome.classList.add('hidden'); content.classList.remove('hidden');
    /* 正文真正可见之后再展开图表：此时宽度可测，图表尺寸才准确。
       render() 内首次调用会因 content 仍 hidden 而跳过，这里补上。 */
    applyChartAuto();
    /* 若 render() 阶段因正文隐藏而没能还原图表展开态，在这里补做 */
    if (S.pendingChart) { restoreChartMap(S.pendingChart); S.pendingChart = null; }
    buildTree();
    updateStatus();
    renderTabbar();
    if (opts.pushRecent) recentTouch(tab.item, tab.md);
  }
  function closeTab(key) {
    if (!key) return;
    var idx = -1;
    for (var i = 0; i < S.tabs.length; i++) if (S.tabs[i].key === key) { idx = i; break; }
    if (idx < 0) return;
    var cur = S.tabs[idx];
    if (S.activeKey === key) cur.scrollTop = reader.scrollTop;
    S.tabs.splice(idx, 1);
    dropTabState(cur);
    if (S.activeKey === key) {
      S.activeKey = null; S.current = null;
      var next = S.tabs[idx] || S.tabs[idx - 1] || null;
      if (next) { activateTab(next, { pushRecent: false }); return; }
      enterWelcomeView(); renderTabbar(); updateStatus();
    } else renderTabbar();
  }

  /* ================================================================
     CR-2026-11-16-07  多标签批量关闭
     ----------------------------------------------------------------
     语义基准 = 「右键的那一个标签」，不是当前激活标签（VS Code / Chrome 口径）。
     关闭其他 / 左侧 / 右侧执行后一律激活基准标签 —— 用户指着谁操作就停在谁身上。
     未保存保护：待关集合含 dirty 或新建未落盘时弹一次确认，取消则整批不动（原子）。
     ================================================================ */
  /* 关标签只是关视图：文件树 S.files / S.byKey / 最近记录一律保留，用户还要再点开。
     但按文档 key 分桶的图表展开态必须回收，否则长会话越积越多、且可能串味。 */
  function dropTabState(tab) {
    if (!tab) return;
    var item = tab.item || {};
    /* chartState 的桶键是 rel||name（见 render），flowDocKey 同源 */
    var ck = item.rel || item.name;
    if (ck && S.chartState[ck]) delete S.chartState[ck];
    if (ck && S.chartDocKey === ck) S.chartDocKey = null;
    if (ck && S.flowDocKey === ck) { S.flowDocKey = null; S.flowConverted = false; }
  }
  /* 待关集合里是否有「关了会丢东西」的标签。当前激活标签先把编辑器内容落回 cached，
     否则刚敲的字还没进 blocks，判定会漏。 */
  function tabsAtRisk(list) {
    var cur = S.activeKey && findTab(S.activeKey);
    if (cur && S.editing && list.indexOf(cur) >= 0) {
      try {
        flushBlock();
        cur.item.cached = S.whole ? editor.value : joinBlocks(S.fm, S.blocks, S.gaps);
      } catch (e) { }
    }
    return list.filter(function (tb) {
      var it = tb.item || {};
      return !!it.isNew || (tb === cur && S.dirty);
    });
  }
  /* keys：要关闭的 key 数组；keepKey：执行后要激活的标签（不在 keys 里）。
     返回实际关闭数量；用户取消保护时返回 0 且不改任何状态。 */
  function closeTabs(keys, keepKey) {
    if (!keys || !keys.length) return 0;
    var set = new Set(keys);
    var victims = S.tabs.filter(function (tb) { return set.has(tb.key); });
    if (!victims.length) return 0;
    var risk = tabsAtRisk(victims);
    if (risk.length) {
      /* 整句模板 + 占位符替换：不用单字 / 量词做字典 key，
         否则「 个」「「」这类碎片会被子串替换命中其他无关文案。 */
      var nm = (risk[0].item && risk[0].item.name) || '';
      var msg = risk.length === 1
        ? t('「{name}」尚未保存，关闭后修改会丢失。确定关闭吗？').replace('{name}', nm)
        : t('有 {n} 个标签尚未保存（含「{name}」），关闭后修改会丢失。确定全部关闭吗？')
          .replace('{n}', String(risk.length)).replace('{name}', nm);
      if (!window.confirm(msg)) return 0;
    }
    var cur = S.activeKey && findTab(S.activeKey);
    if (cur && set.has(cur.key)) cur.scrollTop = reader.scrollTop;
    /* 一次性改数组，避免逐个 closeTab 触发 N 次重渲染 */
    var idx = S.tabs.indexOf(cur);
    S.tabs = S.tabs.filter(function (tb) { return !set.has(tb.key); });
    victims.forEach(dropTabState);
    var keep = keepKey ? findTab(keepKey) : null;
    if (keep) { activateTab(keep, { pushRecent: false }); return victims.length; }
    if (cur && set.has(cur.key)) {
      S.activeKey = null; S.current = null;
      /* 沿用单个关闭的邻居规则：优先原位置右侧，无则左侧 */
      var next = S.tabs[Math.min(idx < 0 ? 0 : idx, S.tabs.length - 1)] || null;
      if (next) { activateTab(next, { pushRecent: false }); return victims.length; }
      resetEditing();
      enterWelcomeView(); renderTabbar(); updateStatus();
      return victims.length;
    }
    renderTabbar();
    return victims.length;
  }
  /* 按基准标签算出某一动作要关闭的 key 集合。base 为 null 表示标签栏空白处。 */
  function tabActionKeys(act, baseKey) {
    var i = -1;
    for (var k = 0; k < S.tabs.length; k++) if (S.tabs[k].key === baseKey) { i = k; break; }
    var all = S.tabs.map(function (tb) { return tb.key; });
    if (act === 'all') return all;
    if (i < 0) return [];
    if (act === 'one') return [baseKey];
    if (act === 'others') return all.filter(function (x) { return x !== baseKey; });
    if (act === 'right') return all.slice(i + 1);
    if (act === 'left') return all.slice(0, i);
    return [];
  }
  /* 各项是否可用：无基准时只有「关闭所有」有效 */
  function tabActionEnabled(act, baseKey) {
    var n = S.tabs.length;
    if (!n) return false;
    if (act === 'all') return true;
    return tabActionKeys(act, baseKey).length > 0;
  }
  var TAB_ACTIONS = [
    { act: 'one', ico: '✕', label: '关闭' },
    { act: 'others', ico: '◫', label: '关闭其他' },
    { act: 'right', ico: '⇥', label: '关闭右侧' },
    { act: 'left', ico: '⇤', label: '关闭左侧' },
    { sep: true },
    { act: 'all', ico: '⊗', label: '关闭所有', danger: true }
  ];
  var tabMenuBase = null, tabMenuFrom = null;
  function tabMenuClose(restoreFocus) {
    var m = $('#tabMenu');
    if (!m || m.hasAttribute('hidden')) { tabMenuBase = null; return; }
    m.setAttribute('hidden', '');
    m.innerHTML = '';
    tabMenuBase = null;
    var from = tabMenuFrom; tabMenuFrom = null;
    if (restoreFocus && from && from.isConnected) { try { from.focus(); } catch (e) { } }
  }
  function tabMenuOpen(baseKey, x, y, fromEl) {
    var m = $('#tabMenu'); if (!m) return;
    if (!S.tabs.length) return;
    tabMenuBase = baseKey;
    tabMenuFrom = fromEl || null;
    var html = '';
    TAB_ACTIONS.forEach(function (a) {
      if (a.sep) { html += '<div class="tm-sep" role="separator"></div>'; return; }
      var en = tabActionEnabled(a.act, baseKey);
      var cnt = en ? tabActionKeys(a.act, baseKey).length : 0;
      html += '<button type="button" role="menuitem" class="tm-item' + (a.danger ? ' danger' : '') + '"' +
        ' data-act="' + a.act + '"' + (en ? '' : ' disabled') + '>' +
        '<i class="tm-ico" aria-hidden="true">' + a.ico + '</i>' +
        '<span class="tm-label">' + esc(t(a.label)) + '</span>' +
        '<span class="tm-count">' + (en && a.act !== 'one' ? cnt : '') + '</span></button>';
    });
    m.innerHTML = html;
    m.removeAttribute('hidden');
    /* 先显示再量：hidden 状态下 offsetWidth 为 0，翻转算不出来 */
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var left = x, top = y;
    if (left + mw > vw - pad) left = Math.max(pad, x - mw);      // 右侧不足 → 向左翻
    if (top + mh > vh - pad) top = Math.max(pad, y - mh);        // 下方不足 → 向上翻
    left = Math.max(pad, Math.min(left, vw - mw - pad));
    top = Math.max(pad, Math.min(top, vh - mh - pad));
    m.style.left = Math.round(left) + 'px';
    m.style.top = Math.round(top) + 'px';
    m.setAttribute('data-base', baseKey == null ? '' : baseKey);
    var first = m.querySelector('.tm-item:not([disabled])');
    if (first) first.focus();
  }
  function tabMenuRun(act) {
    var baseKey = tabMenuBase;
    var keys = tabActionKeys(act, baseKey);
    tabMenuClose();
    if (!keys.length) return;
    /* 基准标签不在待关集合里 → 关完激活它；否则沿用邻居规则 */
    var keep = keys.indexOf(baseKey) < 0 ? baseKey : null;
    var n = closeTabs(keys, keep);
    if (!n) return;
    if (act === 'one') { toast(t('已关闭标签')); return; }
    var name = { others: '已关闭其他标签', right: '已关闭右侧标签',
      left: '已关闭左侧标签', all: '已关闭全部标签' }[act] || '已关闭标签';
    toast(t(name) + ' · ' + t('{n} 个').replace('{n}', String(n)));
  }
  /* 重渲染（切皮肤 / 切字号 / 切语言 / 开关排版）或切换文档会重建整个 #content，
     此前手动展开的图表会全部收起，读长文时体验很差。
     这里按「表头文字签名」记住每张表的展开态与所选图表类型，并按「文档 key」分桶存：
       · 同一文档重渲染（换肤）→ 还原原状
       · 切到别的文档再回来 → 各自还原各自的，不会互相覆盖
       · 新建空白文档（DOM 里没有表格）不会把已有文档的记录清空 */
  function chartSig(tbl) {
    return [].map.call(tbl.querySelectorAll('thead th'), function (t) { return t.textContent.trim(); }).join('|');
  }
  function chartOpenMap() {
    var map = {};
    $$('#content .tw').forEach(function (tw) {
      var box = tw.querySelector('.chart-box');
      var tbl = tw.querySelector('table');
      if (!box || !tbl) return;
      var sig = chartSig(tbl);
      if (!sig) return;
      var ct = box.dataset.ct || '';
      if (box.classList.contains('show')) map[sig] = { open: true, ct: ct };
      else if (ct) map[sig] = { open: false, ct: ct };
    });
    return map;
  }
  /* 把当前 DOM 的图表态存进「离场文档」的桶里；切文档前调用 */
  function stashChartState() {
    if (!S.chartDocKey) return;
    if (!content.querySelector('.tw')) return;   // 正文没表格（空白文档）就别覆盖旧记录
    S.chartState[S.chartDocKey] = chartOpenMap();
  }
  function restoreChartMap(map) {
    if (!map) return;
    var hit = false;
    $$('#content .tw').forEach(function (tw) {
      var box = tw.querySelector('.chart-box');
      var tbl = tw.querySelector('table');
      var btn = tw.querySelector('button[data-act="chart"]');
      if (!box || !tbl || !btn) return;
      var rec = map[chartSig(tbl)];
      if (!rec) return;
      hit = true;
      if (rec.open && !box.classList.contains('show')) btn.click();
      /* 显式收起过的：总开关开着时 applyChartAuto 会重新展开，这里按记录再收回去 */
      if (!rec.open && box.classList.contains('show')) btn.click();
      if (rec.open && rec.ct) {
        var b2 = box.querySelector('button[data-ct="' + rec.ct + '"]');
        if (b2 && !b2.classList.contains('on')) b2.click();
      }
    });
    return hit;
  }
  async function render(md, item) {
    var key = item ? (item.rel || item.name) : '__welcome__';
    /* CR-03：清掉编辑态预览残留在 #content 上的标记属性。
       预览面板复用 #content 本体，退出编辑后这些属性若不清，阅读态的
       aria-readonly="true" 会让屏幕阅读器把整篇正文当成只读输入框。 */
    content.removeAttribute('data-bvcap');
    content.removeAttribute('aria-readonly');
    if (content.getAttribute('aria-label')) content.removeAttribute('aria-label');
    /* 先把「当前 DOM」的图表展开态记进它所属文档的桶（换肤/换字号/换文档都会走到这里），
       再切换到新文档的桶。顺序不能反：stash 用的是离场文档的 key。 */
    stashChartState();
    if (S.chartDocKey !== key) S.chartDocKey = key;
    var _chartMap = S.chartState[key] || null;
    var fm = frontmatter(md);
    /* 先剥离 @//md-render-hint/ 范式提示块，避免在正文显示一整段配置注释 */
    var TF = window.MDTextFlow;
    var hint = TF ? TF.parseHint(fm.text) : null;
    var srcText = hint ? hint.text : fm.text;
    S.flowCfg = hint ? hint.cfg : (TF ? TF.DEFAULT : null);
    if (S.flowDocKey !== key) { S.flowDocKey = key; S.flowConverted = false; }
    var html = '';
    if (!srcText.trim()) {
      /* 新建的空白文档：预览态给一个可操作的空状态，而不是一片空白 */
      html = '<div class="doc-empty"><div class="de-ico">✎</div><b>' + esc(t('空白文档')) +
        '</b><span>' + esc(t('在编辑器里输入 Markdown，或按 Ctrl+V 粘贴 AI 输出的内容；Ctrl+S 可另存为 .md')) + '</span></div>';
    } else {
      try { html = marked.parse(preprocess(srcText), { gfm: true, breaks: false }); }
      catch (e) { html = '<p>解析失败：' + esc(e.message) + '</p>'; }
    }
    // 重新渲染前先解开旧的分节包装，否则会包两层
    if (S.rawNodes) { $$('.doc-card', content).forEach(function (c) { c.remove(); }); S.rawNodes = null; }
    content.innerHTML = frontHtml(fm.fm) + html;
    $$('script,iframe,object,embed,link', content).forEach(function (n) { n.remove(); });
    welcome.classList.add('hidden'); content.classList.remove('hidden');
    enhanceCallouts();
    enhanceCode();
    enhanceTables();
    if (hint && hint.found && TF) TF.decorateHints(content, hint);
    resolveImages();
    enhanceLinks();
    buildOutline();
    S.findMarks = []; S.findIdx = -1; $('#findCount').textContent = '';
    applyLayout(S.layout, { silent: true });   // 分节要在表格/Mermaid 之后再套，包装器才稳定
    await renderMermaid();
    /* 分节 / Mermaid 等后续 DOM 变更完成后再兜一次，保证开关为开时所有图表都展开 */
    applyChartAuto();
    /* 还原本文档此前已展开的图表与所选类型。
       此刻 content 可能还是 hidden（尺寸测不到），把还原动作挂到 pendingChart，
       等 activateTab 把正文显示出来、宽度可测后再执行。 */
    S.pendingChart = _chartMap;
    var _restored = restoreChartMap(_chartMap);
    if (_restored) S.pendingChart = null;   // 正文已可见并还原成功，无需延后
    /* 流程图总开关开启（或当前文档已转换）时，渲染完成后自动把文本流程图转为图形，
       保证「开关为开 → 新打开的文档直接是图形」；切主题/排版重渲染也不会退回源码 */
    if ((S.flowConverted || S.flowAuto) && TF && content.querySelector(TF.SEL)) {
      var n = TF.convertAll(content, S.flowCfg || TF.DEFAULT);
      S.flowConverted = !!n;
    }
    updateFlowButton();
  }

  function enhanceCallouts() {
    $$('blockquote', content).forEach(function (bq) {
      var p = bq.querySelector('p');
      if (!p) return;
      var m = /^\s*\[!([a-z]+)\]\s*/i.exec(p.textContent);
      if (!m) return;
      var type = m[1].toLowerCase(), meta = CALLOUT[type] || ['📝', type];
      p.innerHTML = p.innerHTML.replace(/^\s*\[![a-z]+\]\s*/i, '');
      /* 只翻译 Callout 的「提示 / 警告」这类 UI 标签；用户自己写的标题保持原样 */
      var rest = p.textContent.trim(), title = tr(meta[1]);
      if (rest && !p.children.length) { title = rest; p.remove(); }
      bq.classList.add('callout'); bq.dataset.co = type;
      var t = document.createElement('div');
      t.className = 'co-title';
      t.innerHTML = '<span class="co-ico">' + meta[0] + '</span><span>' + esc(title) + '</span>';
      bq.insertBefore(t, bq.firstChild);
    });
  }

  function enhanceCode() {
    if (typeof hljs === 'undefined') return;
    $$('pre > code', content).forEach(function (code) {
      var lang = (/language-([\w+-]+)/.exec(code.className) || [])[1] || '';
      if (lang.toLowerCase() === 'mermaid') return;
      try { hljs.highlightElement(code); } catch (e) { }
      var pre = code.parentElement;
      var bar = document.createElement('div'); bar.className = 'code-bar';
      bar.innerHTML = '<span class="lang">' + esc(lang || 'text') + '</span><button type="button">复制</button>';
      bar.querySelector('button').onclick = function () {
        copy(code.textContent).then(function () { toast('代码已复制'); });
      };
      pre.appendChild(bar);
    });
  }
  function copy(txt) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).catch(fallbackCopy.bind(null, txt));
    return fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    return new Promise(function (res) {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      ta.remove(); res();
    });
  }

  function resolveImages() {
    $$('img', content).forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (/^(https?:|data:|blob:|file:)/i.test(src)) return;
      var k = norm(src);
      var hit = S.images.get(k) || S.images.get(norm(base(src)));
      if (hit) { img.src = hit; return; }
      if (S.baseDir) {
        img.src = 'file:///' + S.baseDir.replace(/^\/+/, '') + src.replace(/\\/g, '/');
        img.onerror = function () { img.style.opacity = '.45'; img.title = '未找到图片：' + src; };
        return;
      }
      img.alt = '[缺图] ' + (img.alt || src); img.style.opacity = '.45';
      img.title = '未找到图片：' + src + '（打开所在文件夹可显示本地图片）';
    });
  }

  function enhanceLinks() {
    $$('a.wiki-link', content).forEach(function (a) {
      var t = decodeURIComponent((a.getAttribute('href') || '').replace(/^wiki:/, '').split('#')[0]);
      if (!S.byKey.has(keyOf(t))) a.classList.add('missing');
    });
  }
  content.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('wiki:') === 0 || (/\.md(#|$)/i.test(href) && !/^(https?:|mailto:|file:)/i.test(href))) {
      e.preventDefault();
      var name = decodeURIComponent(href.replace(/^wiki:/, '').split('#')[0]);
      var anchor = (href.split('#')[1] || '');
      var f = S.byKey.get(keyOf(name));
      if (f) { switchTab('files'); openFile(f, anchor); }
      else toast('未找到「' + name + '」· 打开所在文件夹后可跳转');
    } else if (href.charAt(0) === '#') {
      e.preventDefault();
      var el = document.getElementById(href.slice(1)); scrollInReader(el, 'smooth');
    } else if (/^https?:/i.test(href)) {
      e.preventDefault(); window.open(href, '_blank', 'noopener');
    }
  });

  /* ---------- 表格增强：排序 / 对齐 / CSV / 图表 ---------- */
  function isNum(s) {
    if (s == null || String(s).trim() === '') return false;
    var v = String(s).replace(/[,，\s%％¥$￥]/g, '').replace(/[（(]/, '-').replace(/[)）]/, '');
    return /^[+-]?\d+(\.\d+)?$/.test(v) && isFinite(parseFloat(v));
  }
  function numVal(s) { return parseFloat(String(s).replace(/[,，\s%％¥$￥]/g, '').replace(/[（(]/, '-').replace(/[)）]/, '')) || 0; }
  /* 文档统一风格：四选一、全局联动、记忆偏好。
     切换时：① 注入跨模块派生色（分段背景 / 流程图 / 代码高亮即时换色，无需重绘）
             ② 已展开的图表按新色板重绘
     applyDocStyle 必须在 silent 提前返回之前执行 —— boot 阶段也要注入，
     否则首屏会是 CSS 默认色，直到用户手动切一次风格才统一。 */
  function applyTableTheme(t, opts) {
    opts = opts || {};
    if (!DOC_STYLES[t]) t = 'mono';
    S.docStyle = t; S.tableTheme = t;
    document.documentElement.dataset.tableTheme = t;
    document.documentElement.dataset.docStyle = t;
    applyDocStyle(t);
    $$('.tt-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.tt === t); });
    /* CR-06：强调色换了 → 胶囊择墨重算 */
    if (typeof lpRefresh === 'function') requestAnimationFrame(lpRefresh);
    if (opts.silent === true) return;
    save('tableTheme', t);
    $$('.chart-box.show', content).forEach(function (box) {
      var tw = box.closest('.tw'), tbl = tw && tw.querySelector('table');
      if (tbl) drawChart(box, tbl, box.dataset.ct || 'auto');
    });
    toast('文档风格：' + docStyle().name);
  }
  function tableData(tbl) {
    var head = $$('thead th', tbl).map(function (th) { return th.textContent.trim(); });
    var rows = $$('tbody tr', tbl).map(function (tr) { return $$('td,th', tr).map(function (c) { return c.textContent.trim(); }); });
    return { head: head, rows: rows };
  }
  function enhanceTables() {
    $$('table', content).forEach(function (tbl) {
      if (tbl.closest('.frontmatter')) return;
      var wrap = document.createElement('div'); wrap.className = 'tw';
      var bar = document.createElement('div'); bar.className = 'tw-bar';
      var d = tableData(tbl);
      function ttBtn(key, label) {
        return '<button type="button" class="tt-btn tt-' + key + (S.tableTheme === key ? ' on' : '') +
          '" data-tt="' + key + '" title="' + label + '"><i></i><span>' + label + '</span></button>';
      }
      bar.innerHTML = '<span class="tw-label">📊 表格 · ' + d.rows.length + ' 行 × ' + d.head.length + ' 列</span>' +
        '<button type="button" data-act="chart">图表</button><button type="button" data-act="csv">复制 CSV</button><button type="button" data-act="tsv">复制 TSV</button>' +
        '<span class="tw-sep"></span><span class="tt-group" role="group" title="表格风格">' +
        ttBtn('mono', '黑白极简') + ttBtn('tech', '蓝色科技') + ttBtn('gov', '红色政商') + ttBtn('cute', '粉色卡通') + '</span>';
      var scroll = document.createElement('div'); scroll.className = 'tw-scroll';
      var chartBox = document.createElement('div'); chartBox.className = 'chart-box';
      chartBox.addEventListener('click', function (e) {
        var t = e.target.closest('.chart-types button'); if (!t) return;
        drawChart(chartBox, tbl, t.dataset.ct);
      });
      /* 悬停某片扇区：该片轻微外扩（"丝滑"的关键），中心数值临时切成该片的值。
         对应 ECharts emphasis：label 在中心放大显示，其余 label 隐藏不动。
         玫瑰图的引导线 / 标签也在 .rose-item 组内，一并高亮，强化"这行字属于这片"。 */
      chartBox.addEventListener('mouseover', function (e) {
        var hit = e.target.closest && e.target.closest('.pie-slice,.rose-item');
        if (!hit) return;
        var grp = hit.classList.contains('rose-item') ? hit : hit.closest('.rose-item');
        var sl = hit.classList.contains('pie-slice') ? hit : (grp ? grp.querySelector('.pie-slice') : null);
        if (!sl) return;
        var total = chartBox.querySelector('[data-role="total"]');
        var series = chartBox.querySelector('[data-role="series"]');
        if (!total || !series) return;
        if (!chartBox.dataset.origTotal) {
          chartBox.dataset.origTotal = total.textContent;
          chartBox.dataset.origSeries = series.textContent;
        }
        total.textContent = sl.dataset.v || '';
        series.textContent = (sl.dataset.t || '') + ' · ' + (sl.dataset.p || '') + '%';
        sl.classList.add('on');
        if (grp) grp.classList.add('on');
        /* 同一时刻只强调一片 */
        [].forEach.call(chartBox.querySelectorAll('.pie-slice.on'), function (o) {
          if (o !== sl) o.classList.remove('on');
        });
        [].forEach.call(chartBox.querySelectorAll('.rose-item.on'), function (o) {
          if (o !== grp) o.classList.remove('on');
        });
      });
      chartBox.addEventListener('mouseout', function (e) {
        var hit = e.target.closest && e.target.closest('.pie-slice,.rose-item');
        if (!hit) return;
        /* 移到同一组的子节点（title / 引导线）时不复位 */
        var grp = hit.classList.contains('rose-item') ? hit : hit.closest('.rose-item');
        if (e.relatedTarget && grp && grp.contains(e.relatedTarget)) return;
        var sl = hit.classList.contains('pie-slice') ? hit : (grp ? grp.querySelector('.pie-slice') : null);
        if (sl) sl.classList.remove('on');
        if (grp) grp.classList.remove('on');
        var total = chartBox.querySelector('[data-role="total"]');
        var series = chartBox.querySelector('[data-role="series"]');
        if (total && chartBox.dataset.origTotal) total.textContent = chartBox.dataset.origTotal;
        if (series && chartBox.dataset.origSeries) series.textContent = chartBox.dataset.origSeries;
        delete chartBox.dataset.origTotal;
        delete chartBox.dataset.origSeries;
      });
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(bar); scroll.appendChild(tbl); wrap.appendChild(scroll); wrap.appendChild(chartBox);

      // 数值列右对齐
      var cols = d.head.length || (d.rows[0] || []).length;
      for (var j = 0; j < cols; j++) {
        var vals = d.rows.map(function (r) { return r[j] || ''; }).filter(function (x) { return x !== ''; });
        if (vals.length && vals.filter(isNum).length >= vals.length * 0.7) {
          $$('thead th:nth-child(' + (j + 1) + ')', tbl).forEach(function (n) { n.classList.add('num'); });
          $$('tbody tr', tbl).forEach(function (tr) {
            var c = tr.children[j]; if (c) c.classList.add('num');
          });
        }
      }
      // 点击表头排序
      $$('thead th', tbl).forEach(function (th, idx) {
        th.title = '点击按此列排序';
        th.onclick = function () {
          var asc = th.dataset.sort !== 'asc';
          $$('thead th', tbl).forEach(function (x) { x.classList.remove('sorted-asc', 'sorted-desc'); delete x.dataset.sort; });
          th.dataset.sort = asc ? 'asc' : 'desc'; th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
          var body = tbl.tBodies[0]; if (!body) return;
          var rows = $$('tr', body);
          rows.sort(function (a, b) {
            var x = (a.children[idx] || {}).textContent || '', y = (b.children[idx] || {}).textContent || '';
            var r = isNum(x) && isNum(y) ? numVal(x) - numVal(y) : x.localeCompare(y, 'zh-CN', { numeric: true });
            return asc ? r : -r;
          });
          rows.forEach(function (r) { body.appendChild(r); });
          chartBox.classList.remove('show'); chartBox.innerHTML = '';
        };
      });
      bar.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tt) { applyTableTheme(b.dataset.tt); return; }
        var act = b.dataset.act;
        if (act === 'csv' || act === 'tsv') {
          var dd = tableData(tbl), sep = act === 'csv' ? ',' : '\t';
          var txt = [dd.head].concat(dd.rows).map(function (r) {
            return r.map(function (c) { return act === 'csv' ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(sep);
          }).join('\n');
          copy(txt).then(function () { toast('已复制 ' + dd.rows.length + ' 行到剪贴板'); });
        } else if (act === 'chart') {
          if (chartBox.classList.contains('show')) { chartBox.classList.remove('show'); b.textContent = '图表'; return; }
          var ok = drawChart(chartBox, tbl, defaultChartType());
          if (ok) { chartBox.classList.add('show'); b.textContent = '收起图表'; }
        }
      };
    });
  }
  /* 数据图表总开关：批量展开 / 收起当前文档所有表格图表 */
  /* 默认图表风格：系统设置里选择（自动 + 柱状 / 折线 / 趋势 / 饼图四种风格）。
     新展开的图表（含总开关自动展开、手动点「图表」）一律按此风格绘制；
     单张图表上方仍可临时切换，不改动默认偏好。 */
  function defaultChartType() {
    return CHART_TYPES.indexOf(S.chartType) >= 0 ? S.chartType : 'auto';
  }
  /* 开关是否打开：以顶栏开关的实际状态为准，避免状态与界面不同步时开了开关却不生效 */
  function chartAutoOn() {
    var sw = $('#btnChartAuto');
    if (sw && sw.getAttribute('aria-checked') === 'true') return true;
    return !!S.chartAuto;
  }
  /* 按总开关状态应用当前文档的图表展开；正文不可见时先跳过（宽度测不到，图会画歪），
     等 activateTab 把正文显示出来后再补一次 */
  function applyChartAuto() {
    if (!chartAutoOn()) return;
    if (content && content.classList.contains('hidden')) return;
    expandAllCharts();
  }
  function expandAllCharts() {
    $$('#content .tw').forEach(function (tw) {
      var btn = tw.querySelector('button[data-act="chart"]');
      var box = tw.querySelector('.chart-box');
      if (btn && box && !box.classList.contains('show')) btn.click();
    });
  }
  function collapseAllCharts() {
    $$('#content .tw').forEach(function (tw) {
      var btn = tw.querySelector('button[data-act="chart"]');
      var box = tw.querySelector('.chart-box');
      if (btn && box && box.classList.contains('show')) btn.click();
    });
  }

  /* ===== 图表：柱状 / 折线 / 趋势 / 环形 / 玫瑰，auto 按数据自动选择 ===== */
  function isTotalHead(h) { return /合计|总计|小计|total|subtotal/i.test(h || ''); }
  function looksTime(cats) {
    return cats.some(function (c) {
      return /月|月份|季度|Q\d|week|周|日|day|年|年份/i.test(c) || /^\d{1,2}$/.test(c);
    });
  }
  function autoChartType(cats, nSer) {
    var time = looksTime(cats);
    if (time) return (cats.length >= 6 || nSer <= 3) ? 'trend' : 'bar';
    if (nSer === 1) return 'pie';
    return 'bar';
  }
  /* 解析表格为统一的图表模型；自动判定「行作类别 / 列作类别」方向，避免宽表被翻转 */
  function parseChart(tbl) {
    var d = tableData(tbl);
    var numCols = [];
    for (var j = 0; j < d.head.length; j++) {
      if (isTotalHead(d.head[j])) continue;
      var vals = d.rows.map(function (r) { return r[j] || ''; }).filter(function (x) { return x !== ''; });
      if (vals.length && vals.filter(isNum).length >= Math.max(1, Math.floor(vals.length * 0.7))) numCols.push(j);
    }
    if (!numCols.length) return null;
    // 标签列：第 0 列若为数值则它本身就是类别名（移出系列）；若为文本且非合计，则作为类别/系列名
    var labelCol = -1;
    if (d.head.length > 1) {
      if (numCols.indexOf(0) >= 0) labelCol = numCols.shift();
      else if (!isTotalHead(d.head[0])) labelCol = 0;
    }
    var aSer = numCols.length, bSer = d.rows.length;
    // 优先「行作类别」（最贴近阅读顺序，如季度作 X 轴、指标作系列）；
    // 仅当数值列作系列过多、且明显多于指标行时，才翻转为「列作类别」（如 12 个月作 X 轴）
    var flip = (aSer > 8) || (aSer - bSer >= 4);
    var layoutA = !flip;
    var categories, series;
    if (layoutA) {
      categories = d.rows.map(function (r, i) {
        var v = labelCol >= 0 ? r[labelCol] : (r.find(function (c) { return !isNum(c); }) || '第' + (i + 1) + '行');
        return String(v).slice(0, 14);
      });
      series = numCols.slice(0, 8).map(function (c) {
        return { name: d.head[c] || ('列 ' + (c + 1)), values: d.rows.map(function (r) { return numVal(r[c] || 0); }) };
      });
    } else {
      categories = numCols.map(function (c) { return String(d.head[c] || ('列 ' + (c + 1))).slice(0, 14); });
      series = d.rows.slice(0, 8).map(function (r, ri) {
        var nm = labelCol >= 0 ? (r[labelCol] || ('行 ' + (ri + 1))) : ('行 ' + (ri + 1));
        return { name: String(nm).slice(0, 14), values: numCols.map(function (c) { return numVal(r[c] || 0); }) };
      });
    }
    return { categories: categories, series: series };
  }
  function smoothPath(pts) {
    if (pts.length < 3) return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  /* ---------- 图表绘制：参考 ECharts 示例库中最受欢迎的实现方式 ----------
   设计取向（四类各取所长）：
   · 柱状 → 圆角柱 + 垂直渐变 + 顶端数值，接近 ECharts bar 的主流商务风
   · 折线 → 平滑曲线 + 顶点白色描边圆点
   · 趋势 → 平滑曲线 + 渐变面积（ECharts area-style 最常见的面积图）
   · 环形图 → 圆角扇区 + 中心汇总，扇区角度按分项占比精确累计划分
            （参考 pie-borderRadius；绝不按 n 等角均分）
   · 玫瑰图 → 南丁格尔等角变径（roseType:'area'），数值由半径/面积编码 + 外置引导标签
   注意：环形图若按 n 等角均分，33% 与 0.3% 会画成一样宽，数值失去任何几何编码、
        只剩图例文字，属于读图误导 —— 因此角度必须与百分比一一对应。
   所有颜色写成字面量（不用 var()），Word / PNG 栅格化与屏幕完全一致。 */
  var chartSeq = 0;
  function hexToRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [80, 90, 110];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /* 向白色（k>0）或黑色（k<0）混合，k ∈ [-1,1] */
  function tint(color, k) {
    var c = hexToRgb(color);
    var to = k >= 0 ? 255 : 0, a = Math.abs(k);
    var o = c.map(function (v) { return Math.round(v + (to - v) * a); });
    return 'rgb(' + o[0] + ',' + o[1] + ',' + o[2] + ')';
  }
  /* ---- CR-2026-11-15-06 胶囊文字色（--lp-ink）----
     液态胶囊把选中态从「实心 accent 底 + 白字」换成「半透明玻璃底」，
     若沿用 accent 当文字色，深色主题下对比度会掉到 1.2~3.0（实测）。
     这里按 WCAG 相对亮度算出胶囊有效底色，再在「风格强调色的深/浅两档」
     与「中性墨色」之间择优，保证任何风格 × 任何主题都 ≥ 4.5:1。 */
  function srgbLum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    var l1 = srgbLum(a), l2 = srgbLum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /* 半透明前景叠在不透明底上 → 有效底色 */
  function overRgb(fg, a, bg) {
    return [0, 1, 2].map(function (i) { return Math.round(fg[i] * a + bg[i] * (1 - a)); });
  }
  /* 解析 rgb()/rgba() 字符串 → {c:[r,g,b], a} */
  function parseRgb(s) {
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(String(s || ''));
    if (!m) return null;
    return { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  }
  /* 向上找第一个「不透明」祖先的底色 —— 胶囊宿主的 background 多为 transparent，
     直接拿宿主底色当白底算会严重高估亮度（这正是修正 1 的偏差来源）。 */
  function opaqueBase(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var p = parseRgb(getComputedStyle(n).backgroundColor);
      if (p && p.a > 0.98) return p.c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  }
  /* 胶囊有效底色 = 不透明祖先底 → --lp-tint 淡彩 → --lp-fill 玻璃白，按真实 alpha 合成 */
  function lpEffectiveBase(host) {
    var rt = getComputedStyle(document.documentElement);
    var base = opaqueBase(host);
    var tint = parseRgb(rt.getPropertyValue('--lp-tint'));
    var fill = parseRgb(rt.getPropertyValue('--lp-fill'));
    if (tint) base = overRgb(tint.c, tint.a, base);
    if (fill) base = overRgb(fill.c, fill.a, base);
    return base;
  }
  /* 二分择墨：在「强调色 → 白（底暗）/ 黑（底亮）」线段上找第一个 ≥ 4.5:1 的点。
     线段末端是纯白/纯黑，对比度必然 ≥ 4.5（除非底色本身是中间灰，那时两端都够），
     因此一定能收敛，且保留最大彩度 —— 配色语言不丢。 */
  function lpInkOn(accentRgb, base) {
    var dir = srgbLum(base) > 0.30 ? 0 : 255;      // 底亮 → 推向黑；底暗 → 推向白
    function at(t) { return accentRgb.map(function (v) { return Math.round(v + (dir - v) * t); }); }
    if (contrast(at(0), base) >= 4.5) return at(0);
    var lo = 0, hi = 1;
    for (var i = 0; i < 18; i++) {
      var mid = (lo + hi) / 2;
      if (contrast(at(mid), base) >= 4.5) hi = mid; else lo = mid;
    }
    var c = at(hi);
    /* 极端中间灰底（两端都不足 4.5）时取对比度更高的一端 */
    if (contrast(c, base) < 4.5) {
      var w = contrast([255, 255, 255], base), b = contrast([0, 0, 0], base);
      c = w >= b ? [255, 255, 255] : [0, 0, 0];
    }
    return c;
  }
  function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  /* 全局兜底 --lp-ink：按主题取一个代表性 chrome 底（设置分段轨道 --set-fill），
     供尚未被 lpSync 实测的宿主使用；lpSync 会按各宿主真实底色再覆盖一次。 */
  function lpInk(accentHex, dark, sepia) {
    var A = hexToRgb(accentHex);
    var chrome = dark ? [30, 36, 44] : (sepia ? [240, 233, 218] : [241, 243, 245]);
    var rt = getComputedStyle(document.documentElement);
    var tint = parseRgb(rt.getPropertyValue('--lp-tint'));
    var fill = parseRgb(rt.getPropertyValue('--lp-fill'));
    var base = chrome;
    if (tint) base = overRgb(tint.c, tint.a, base);
    if (fill) base = overRgb(fill.c, fill.a, base);
    return rgbStr(lpInkOn(A, base));
  }
  /* ---- 统一文档风格：派生色注入（CR-2026-11-15-01）----
     为什么不写死在 CSS 里：浅底 / 色带 / 语法色必须按明暗主题做颜色运算，
     CSS 没有颜色计算能力；四套风格 × 三种主题 = 12 组硬编码既难维护又易漂移。
     这里把一套 mf 四主色派生为全部跨模块变量，注入 <html> 内联样式：
       · 内联优先级高于 html[data-theme] / html[data-flow-style] 的 CSS 规则
       · cssVars()/inlineVars() 通过 getComputedStyle 直接读到，导出 SVG 自动固化
       · docStyleCss() 把同样的值写进导出 HTML 的 <html style>，离线打开与屏幕一致
     流程图皮肤是用户的显式覆盖：选了非 classic 皮肤时清除 --mf-* 内联，
     让 html[data-flow-style] 的 CSS 继续生效；切回 classic 再重新统一。 */
  var DOC_VARS = ['--tt-accent', '--tt-accent-fg', '--tt-bar', '--tt-bar-fg', '--lp-ink',
    '--mf-a1', '--mf-a2', '--mf-a3', '--mf-a4',
    '--mf-a1s', '--mf-a2s', '--mf-a3s', '--mf-a4s',
    '--mf-a1b', '--mf-a2b', '--mf-a3b', '--mf-a4b',
    '--syn-kw', '--syn-str', '--syn-num', '--syn-com', '--syn-fn', '--syn-type', '--syn-attr'];
  function applyDocStyle(style, theme) {
    var D = DOC_STYLES[style] || DOC_STYLES.mono;
    var t = theme || S.theme || 'light';
    var dark = t === 'dark', sepia = t === 'sepia';
    var root = document.documentElement, c = D.mf;
    function set(k, v) { root.style.setProperty(k, v); }
    /* 分段背景 / 卡片徽章 / 设置选中态：用该风格自己的强调色，
       与 CSS 块 html[data-table-theme] 的 --tt-accent 同源（mono=#111111）。 */
    var A = D.accent;
    set('--tt-accent', dark ? tint(A, .30) : A);
    set('--tt-accent-fg', dark ? '#10151f' : D.accentFg);
    set('--tt-bar', dark ? tint(A, -.80) : (sepia ? tint(A, .90) : tint(A, .93)));
    set('--tt-bar-fg', dark ? tint(A, .55) : tint(A, -.38));
    /* CR-06：玻璃胶囊上的文字色。与 --tt-accent 同源（同一支强调色），
       但按胶囊有效底色重新择墨，保证 4 风格 × 3 主题全部 ≥ 4.5:1。 */
    set('--lp-ink', lpInk(A, dark, sepia));
    /* 流程图强调色：classic（默认）跟随统一风格；其它皮肤让 CSS 说话 */
    var flowOverride = S.flowStyle && S.flowStyle !== 'classic';
    for (var i = 0; i < 4; i++) {
      var n = i + 1;
      if (flowOverride) {
        root.style.removeProperty('--mf-a' + n);
        root.style.removeProperty('--mf-a' + n + 's');
        root.style.removeProperty('--mf-a' + n + 'b');
      } else {
        set('--mf-a' + n, dark ? tint(c[i], .28) : (sepia ? tint(c[i], -.10) : c[i]));
        set('--mf-a' + n + 's', dark ? tint(c[i], -.78) : tint(c[i], .88));
        set('--mf-a' + n + 'b', dark ? tint(c[i], -.62) : tint(c[i], .70));
      }
    }
    /* 代码关键字高亮：同一套主色按明暗派生，四套风格的代码块颜色同源但不同调 */
    var sk = dark ? .32 : (sepia ? -.16 : -.08);
    set('--syn-kw', tint(c[0], sk));
    set('--syn-str', tint(c[1], sk));
    set('--syn-num', tint(c[2], sk));
    set('--syn-com', dark ? '#8b949e' : (sepia ? '#93856c' : '#6e7781'));
    set('--syn-fn', tint(c[1], sk));
    set('--syn-type', tint(c[3], sk));
    set('--syn-attr', tint(c[2], sk));
  }
  /* 导出 HTML 没有 JS，必须把内联变量固化进 <html style>，否则会回落到 CSS 默认色 */
  function docStyleCss() {
    var out = [], st = document.documentElement.style;
    DOC_VARS.forEach(function (k) {
      var v = (st.getPropertyValue(k) || '').trim();
      if (v) out.push(k + ':' + v);
    });
    return out.join(';');
  }
  function rgba(color, a) {
    var c = hexToRgb(color);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  /* 顶部圆角的柱形路径（底部保持直角，视觉上更像商业图表） */
  function barPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    if (h <= 0.5) return 'M' + x + ',' + (y + h) + 'h' + w;
    return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) +
      'L' + x.toFixed(1) + ',' + (y + r).toFixed(1) +
      'Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + y.toFixed(1) +
      'L' + (x + w - r).toFixed(1) + ',' + y.toFixed(1) +
      'Q' + (x + w).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (y + r).toFixed(1) +
      'L' + (x + w).toFixed(1) + ',' + (y + h).toFixed(1) + 'Z';
  }
  /* 柱状 / 折线 / 趋势 共用坐标轴 */
  function renderAxis(m, pal, ttype) {
    var uid = 'ax' + (++chartSeq);
    var W = 780, H = 300, L = 58, R = 20, T = 16, B = 46, pw = W - L - R, ph = H - T - B;
    var all = []; m.series.forEach(function (s) { s.values.forEach(function (v) { all.push(v); }); });
    var rmin = Math.min.apply(null, all), rmax = Math.max.apply(null, all);
    var min = rmin < 0 ? rmin : 0, max = rmax === min ? min + 1 : rmax;
    var yOf = function (v) { return T + ph - (v - min) / (max - min) * ph; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
    /* 渐变定义：柱体垂直渐变 + 面积图纵向渐变 */
    var defs = '<defs>';
    m.series.forEach(function (s, si) {
      var c = pal[si % pal.length];
      defs += '<linearGradient id="' + uid + '-b' + si + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + tint(c, .22) + '"/><stop offset="55%" stop-color="' + c + '"/>' +
        '<stop offset="100%" stop-color="' + tint(c, -.14) + '"/></linearGradient>';
      defs += '<linearGradient id="' + uid + '-a' + si + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + rgba(c, .34) + '"/><stop offset="78%" stop-color="' + rgba(c, .05) + '"/>' +
        '<stop offset="100%" stop-color="' + rgba(c, 0) + '"/></linearGradient>';
    });
    defs += '</defs>';
    svg += defs;
    /* 网格：淡虚线，最底线加粗一点 */
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var v = min + (max - min) * g / 4, y = yOf(v);
      grid += '<line class="grid-line" x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) +
        '"' + (g === 0 ? '' : ' stroke-dasharray="3 5"') + '/>';
      grid += '<text class="axis-txt" x="' + (L - 7) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(v)) + '</text>';
    }
    svg += grid;
    var n = m.categories.length, groupW = pw / n;
    var two = m.series.length > 1;
    if (ttype === 'bar') {
      var barW = Math.max(3, Math.min(30, groupW / (m.series.length + 0.6)));
      /* 组内间距随系列数收窄，多系列时不至于挤成一团 */
      var gap = m.series.length > 1 ? Math.min(3, barW * 0.14) : 0;
      var showVal = (n * m.series.length) <= 12;
      m.categories.forEach(function (lb, i) {
        var cx = L + groupW * (i + 0.5);
        m.series.forEach(function (s, si) {
          var v = s.values[i], w = barW - gap;
          var x = cx - (m.series.length * barW) / 2 + si * barW + gap / 2;
          var y0 = yOf(0), y1 = yOf(v);
          var top = Math.min(y0, y1), hh = Math.abs(y1 - y0);
          var path = v >= 0 ? barPath(x, top, w, hh, Math.min(6, w / 2)) :
            'M' + x.toFixed(1) + ',' + top.toFixed(1) + 'h' + w.toFixed(1) + 'v' + hh.toFixed(1) + 'h' + (-w).toFixed(1) + 'Z';
          svg += '<path d="' + path + '" fill="url(#' + uid + '-b' + si + ')"><title>' +
            esc(lb + ' · ' + s.name + '：' + fmt(v)) + '</title></path>';
          if (showVal && hh >= 16) {
            svg += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (top - 6).toFixed(1) +
              '" text-anchor="middle" class="bar-val">' + esc(fmt(v)) + '</text>';
          }
        });
        if (n <= 24 || i % Math.ceil(n / 24) === 0) svg += '<text class="bar-lbl" x="' + cx.toFixed(1) + '" y="' + (T + ph + 16) + '" text-anchor="middle">' + esc(lb) + '</text>';
      });
    } else {
      m.series.forEach(function (s, si) {
        var pts = m.categories.map(function (lb, i) { return [L + groupW * (i + 0.5), yOf(s.values[i])]; });
        var d = smoothPath(pts);
        var col = pal[si % pal.length];
        /* 趋势 / 单系列折线都给渐变面积，观感更接近 ECharts 面积图 */
        if (ttype === 'trend' || !two) {
          var area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + yOf(min).toFixed(1) +
            ' L' + pts[0][0].toFixed(1) + ',' + yOf(min).toFixed(1) + ' Z';
          svg += '<path d="' + area + '" fill="url(#' + uid + '-a' + si + ')"/>';
        }
        svg += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (ttype === 'trend' ? 2.6 : 2.2) +
          '" stroke-linejoin="round" stroke-linecap="round"/>';
        pts.forEach(function (p, i) {
          svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (two ? 3 : 3.6) +
            '" fill="var(--paper,#fff)" stroke="' + col + '" stroke-width="2"><title>' +
            esc(m.categories[i] + ' · ' + s.name + '：' + fmt(s.values[i])) + '</title></circle>';
        });
      });
      m.categories.forEach(function (lb, i) {
        if (n <= 24 || i % Math.ceil(n / 24) === 0) { var cx = L + groupW * (i + 0.5); svg += '<text class="bar-lbl" x="' + cx.toFixed(1) + '" y="' + (T + ph + 16) + '" text-anchor="middle">' + esc(lb) + '</text>'; }
      });
    }
    svg += '<line class="grid-line" x1="' + L + '" y1="' + (T + ph) + '" x2="' + (W - R) + '" y2="' + (T + ph) + '"/>';
    return svg + '</svg>';
  }
  /* 圆角环形图 / 南丁格尔玫瑰图（玫瑰花瓣可选）
     参考 ECharts pie-borderRadius（最受欢迎的实现）：
       itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
       radius: ['40%','70%'], label 默认隐藏，emphasis 时中心放大显示
     设计要点（去掉所有边框/描边，追求「丝滑」）：
       0. 环形图扇区角度 = 分项值 / 总量 × 2π，逐项累计，严格匹配图例百分比；
          缝隙按每片自身角度自适应，不侵占 0.3% 这类极小分项
       1. 扇区**无 stroke**，圆角完全由 borderRadius 圆角路径实现（不再用同色描边假装圆角，
          那会在扇区边缘留下一圈深浅不一的描边痕迹，正是上一版不美观的主因）
       2. 扇区间隙靠极小的角度 padding + 背景色缝隙，视觉上干净利落
       3. 卡片式布局：左侧环形主图（正中显示总量 + 系列名），右侧图例列表
          （色块 + 名称 + 数值 + 占比 + 细进度条），信息密度与美观兼顾
       4. 玫瑰模式（rose）走独立的等角变径实现（数值由半径编码）+ 外置引导标签，
          与环形图是两种不同的数值编码方式，不强行统一
     数值全为非正时给出提示，避免空图。 */
  function pieArcPath(cx, cy, r0, r1, a1, a2, rad) {
    /* 生成带圆角的环形扇区路径（对应 ECharts itemStyle.borderRadius）。
       做法是按「圆角半径 rad」在 4 个角各求两个切点，用二次贝塞尔连接：
         角 V2(外径, 终止角) → 切点在外弧上 A(r1, a2-dOut) 与径向上 A(r1-rad, a2)
       外弧 / 内弧用 A 命令，径向直边用 L，转角用 Q。全程无 stroke，边缘干净。 */
    var sw = r1 - r0;                       // 壁厚
    rad = Math.max(0, Math.min(rad, sw / 2 - 0.4, ((a2 - a1) * r0) / 2.4));
    var A = function (r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    var f2 = function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); };
    var lg = (a2 - a1) > Math.PI ? 1 : 0;
    if (rad < 0.8 || (a2 - a1) < 0.03) {
      /* 角度过窄 / 壁太薄：退回直角扇区，避免路径自交画成怪形 */
      return 'M' + f2(A(r1, a1)) + ' A' + r1.toFixed(2) + ' ' + r1.toFixed(2) + ' 0 ' + lg + ' 1 ' + f2(A(r1, a2)) +
        ' L' + f2(A(r0, a2)) + ' A' + r0.toFixed(2) + ' ' + r0.toFixed(2) + ' 0 ' + lg + ' 0 ' + f2(A(r0, a1)) + ' Z';
    }
    var dOut = rad / Math.max(r1, 1);       // 外弧上的角偏移（弧度）
    var dIn = rad / Math.max(r0, 1);        // 内弧上的角偏移
    /* 4 个角的两个切点 */
    var oStart = A(r1, a1 + dOut);          // 外弧起点
    var oEnd = A(r1, a2 - dOut);            // 外弧终点
    var iStart = A(r0, a1 + dIn);           // 内弧起点
    var iEnd = A(r0, a2 - dIn);             // 内弧终点
    var eOut2 = A(r1 - rad, a2), eIn2 = A(r0 + rad, a2);   // 终止角那条径向上的两个切点
    var eIn1 = A(r0 + rad, a1), eOut1 = A(r1 - rad, a1);   // 起始角那条径向上的两个切点
    var V1 = A(r1, a1), V2 = A(r1, a2), V3 = A(r0, a2), V4 = A(r0, a1);
    return 'M' + f2(oStart) +
      /* 外弧 → 角 V2 → 径向直边 → 角 V3 → 内弧（反向） */
      ' A' + r1.toFixed(2) + ' ' + r1.toFixed(2) + ' 0 ' + lg + ' 1 ' + f2(oEnd) +
      ' Q' + f2(V2) + ' ' + f2(eOut2) +
      ' L' + f2(eIn2) +
      ' Q' + f2(V3) + ' ' + f2(iEnd) +
      ' A' + r0.toFixed(2) + ' ' + r0.toFixed(2) + ' 0 ' + lg + ' 0 ' + f2(iStart) +
      ' Q' + f2(V4) + ' ' + f2(eIn1) +
      ' L' + f2(eOut1) +
      ' Q' + f2(V1) + ' ' + f2(oStart) + ' Z';
  }
  /* 玫瑰图的外置标签布局：把 n 个标签分配到左右两列，避免互相压盖。
     思路（与 ECharts labelLayout 的 `avoidLabelOverlap` 同一目标，但用确定性算法代替迭代求解）：
       1. 标签方向由扇区中线角度决定：cos>0 走右侧，cos<0 走左侧
       2. 每侧按 y 升序排好后，自上而下"推开"——保证相邻标签至少留出 minGap
       3. 推开后若超出上下边界，再整体回推一次
     确定性求解的好处是同一份数据每次重绘位置完全一致，不会抖动。 */
  function layoutRoseLabels(items, H, minGap, padTop) {
    var sides = { l: [], r: [] };
    items.forEach(function (it) {
      (it.side === 'r' ? sides.r : sides.l).push(it);
    });
    ['l', 'r'].forEach(function (k) {
      var arr = sides[k];
      if (!arr.length) return;
      /* 按「扇区中线角换算出的理想 y」排序，标签纵向位置天然跟随扇区角度，
         读者沿着引导线看过去是顺的。只在发生挤压时才推开。 */
      arr.sort(function (a, b) { return a.ly - b.ly; });
      var top = padTop, bottom = H - padTop;
      /* 先各自夹进上下边界（极端值可能算出界外） */
      arr.forEach(function (it) { it.ly = Math.max(top, Math.min(bottom, it.ly)); });
      /* 自上而下推开，保证相邻标签至少 minGap */
      for (var i = 0; i < arr.length; i++) {
        var lo = (i === 0) ? top : arr[i - 1].ly + minGap;
        if (arr[i].ly < lo) arr[i].ly = lo;
      }
      /* 推开后底部越界：自下而上回推，把整体压回边界内 */
      if (arr[arr.length - 1].ly > bottom) {
        for (var j = arr.length - 1; j >= 0; j--) {
          var hi = (j === arr.length - 1) ? bottom : arr[j + 1].ly - minGap;
          if (arr[j].ly > hi) arr[j].ly = hi;
        }
      }
      /* 回推后若顶部又破了，说明这一侧实在放不下 —— 只保证不越界，不再硬撑间距 */
      for (var m = 0; m < arr.length; m++) {
        if (arr[m].ly < top) arr[m].ly = top + m * Math.max(12, minGap * 0.62);
      }
    });
  }
  /* 玫瑰图：外标签 + 同色引导线（参考 ECharts labelLine 的观感）
     与环形图的差别不只是"变径"，而是**信息承载方式**：
       环形图靠右侧图例列表来读数，读者要在色块与扇区之间来回对照；
       玫瑰图改为把名称与数值直接牵线贴到扇区外侧，一根同色线即完成指认，
       瓣数多、半径差异大时尤其明显（这正是本轮要解决的"更容易查看"）。
     引导线走 "径向斜段 → 拐点 → 水平段" 两段折线，与参考件一致。 */
  function renderRose(m, pal) {
    var s = m.series[0];
    /* CR-2026-11-15-05c 按数值升序顺时针辐射：稳定排序（同值保持表格原序），
       半径随绘制序单调不减，形成「从小到大往外辐射」的增长感。
       颜色 / 引导线 / 标签 / 动画 / 悬停联动全部按新序取数，中心总量不变。 */
    var order = s.values.map(function (v, i) { return i; })
      .sort(function (a, b) { return Math.max(0, s.values[a]) - Math.max(0, s.values[b]) || a - b; });
    var vals = order.map(function (i) { return s.values[i]; });
    var cats = order.map(function (i) { return m.categories[i]; });
    var pos = vals.map(function (v) { return Math.max(0, v); });
    var total = pos.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return '<div class="chart-sub">' + esc(t('该列数据全为非正数，无法绘制饼图')) + '</div>';
    var n = vals.length;
    /* 几何：扇区占画布主体，标签列紧贴扇区外侧（不是贴画布边缘），
       这样引导线短、视线不用横跨半个图表。
       LAB 是标签列距圆心的水平距离，两侧对称，保证左右视觉重量一致。 */
    var W = 800, H = 400, CX = W / 2, CY = H / 2;
    var R1 = 148, R0 = 46;         // 内孔要放得下中心数值（含 5 位数字），又不至于吃掉花瓣
    var LAB = 186;                  // 标签列内边界到圆心的水平距离
    var maxV = Math.max.apply(null, pos) || 1;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
    var step = (Math.PI * 2) / n;
    var padA = Math.min(0.016, step * 0.08);
    var radiusPx = 6;
    var items = [];
    /* 第一遍：算出每片几何与标签锚点 */
    for (var k = 0; k < n; k++) {
      var a1 = -Math.PI / 2 + k * step + padA / 2;
      var a2 = -Math.PI / 2 + (k + 1) * step - padA / 2;
      var am = (a1 + a2) / 2;                                  // 扇区中线角
      var cosA = Math.cos(am);
      /* 左右分配：cos 明显偏离 0 时按方向分；正上 / 正下这两片（cos≈0）
         按索引奇偶交替，避免它们全挤到同一侧造成左右失衡。 */
      var side = Math.abs(cosA) > 0.02 ? (cosA > 0 ? 'r' : 'l') : (k % 2 === 0 ? 'r' : 'l');
      /* 等角变径：小值保留 46% 外径，避免瓣消失又保持可读 */
      var rOut = R0 + (R1 - R0) * Math.pow(pos[k] / maxV, 0.62);
      items.push({
        k: k, a1: a1, a2: a2, am: am, rOut: rOut, side: side,
        ty: CY + Math.sin(am) * rOut,                          // 引导线出发点 y
        cx: CX + Math.cos(am) * rOut,                          // 出发点 x
        /* 标签理想 y：沿中线再往外推到 R1 之外，让标签天然落在对应角度上。
           太贴近圆心时同侧标签会挤在一起，所以用 max(半径) 兜一下。 */
        ly: CY + Math.sin(am) * (R1 + 34)
      });
    }
    /* 第二遍：标签错行，避免压盖 */
    layoutRoseLabels(items, H, 32, 26);
    /* 第三遍：画扇区、引导线、标签 */
    for (var q = 0; q < items.length; q++) {
      var it = items[q], kk = it.k, cq = pal[kk % pal.length];
      var d = pieArcPath(CX, CY, R0, it.rOut, it.a1, it.a2, radiusPx);
      var pct = (pos[kk] / total) * 100;
      svg += '<g class="rose-item" data-i="' + kk + '">';
      /* 纯色填充（不用渐变）：引导线取的是同一个色值，
         若扇区是渐变，线的颜色就只与扇区某一处相符，"同色指认"会失效。 */
      svg += '<path class="pie-slice" data-i="' + kk + '"' +
        ' data-v="' + esc(fmt(vals[kk])) + '" data-p="' + pct.toFixed(1) + '" data-t="' + esc(String(cats[kk]).slice(0, 10)) + '"' +
        ' style="transform-origin:' + CX + 'px ' + CY + 'px;animation-delay:' + (kk * 55) + 'ms" d="' + d +
        '" fill="' + cq + '">' +
        '<title>' + esc(cats[kk] + '：' + fmt(vals[kk]) + '（' + pct.toFixed(1) + '%）') + '</title></path>';
      /* 引导线：扇区外缘 →（径向短段）→ 拐点 →（斜段到标签行）→ 水平段贴到文字边 */
      var dir = it.side === 'r' ? 1 : -1;
      var elbowX = it.cx + dir * 16;                            // 拐点：沿径向外推 16px
      /* 文字列固定在同一条竖线上；线的水平段末端恰好抵到文字外侧 5px */
      var textX = it.side === 'r' ? CX + LAB : CX - LAB;
      var anchor = it.side === 'r' ? 'start' : 'end';
      var lineEndX = textX - dir * 5;
      var midX = elbowX + (lineEndX - elbowX) * 0.6;
      svg += '<path class="pie-lead" d="M' + it.cx.toFixed(1) + ' ' + it.ty.toFixed(1) +
        ' L' + elbowX.toFixed(1) + ' ' + it.ty.toFixed(1) +
        ' L' + midX.toFixed(1) + ' ' + it.ly.toFixed(1) +
        ' L' + lineEndX.toFixed(1) + ' ' + it.ly.toFixed(1) +
        '" stroke="' + cq + '" style="animation-delay:' + (kk * 55 + 90) + 'ms"/>';
      /* 起点小圆点：把线"钉"在扇区上，比纯线条更容易看出对应关系 */
      svg += '<circle class="pie-lead" cx="' + it.cx.toFixed(1) + '" cy="' + it.ty.toFixed(1) + '" r="2" fill="' + cq +
        '" stroke="none" opacity=".9" style="animation-delay:' + (kk * 55 + 60) + 'ms"/>';
      /* 标签：名称 + 数值·占比（两行） */
      svg += '<text class="rose-name" x="' + textX + '" y="' + (it.ly - 3).toFixed(1) +
        '" text-anchor="' + anchor + '" style="animation-delay:' + (kk * 55 + 130) + 'ms">' +
        esc(String(cats[kk]).slice(0, 12)) + '</text>';
      svg += '<text class="rose-val" x="' + textX + '" y="' + (it.ly + 12).toFixed(1) +
        '" text-anchor="' + anchor + '" style="animation-delay:' + (kk * 55 + 150) + 'ms">' +
        esc(fmt(vals[kk])) + ' · ' + pct.toFixed(1) + '%</text>';
      svg += '</g>';
    }
    /* 中心：总量 + 系列名（悬停时由 JS 切成该片数值，交互与环形图一致） */
    svg += '<text x="' + CX + '" y="' + (CY - 2) + '" text-anchor="middle" class="pie-total" data-role="total">' + esc(fmt(total)) + '</text>';
    svg += '<text x="' + CX + '" y="' + (CY + 15) + '" text-anchor="middle" class="pie-series" data-role="series">' + esc(s.name) + '</text>';
    return svg + '</svg>';
  }
  function renderPie(m, pal, rose) {
    /* 玫瑰图走独立实现（外标签 + 引导线）；环形图是"读数卡片"布局（圆 + 右侧图例列表），
       两种图各自服务于不同的阅读方式，不强行统一。 */
    if (rose) return renderRose(m, pal);
    var s = m.series[0], vals = s.values;
    var pos = vals.map(function (v) { return Math.max(0, v); });
    var total = pos.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return '<div class="chart-sub">' + esc(t('该列数据全为非正数，无法绘制饼图')) + '</div>';
    var uid = 'pz' + (++chartSeq);
    /* 画布更宽（图例在右侧成列表），主图区偏左，整体像一张设计过的卡片 */
    var W = 780, H = 360, n = vals.length;
    var CX = 232, CY = H / 2, R1 = 132, R0 = 72;      // 外/内半径 ≈ [40%,70%] 的比例观感
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
    /* 每片一个柔和的双端渐变（亮→本色），无描边 */
    var defs = '<defs>';
    for (var i = 0; i < n; i++) {
      var c = pal[i % pal.length];
      defs += '<linearGradient id="' + uid + '-g' + i + '" x1="0" y1="0" x2="0.55" y2="1">' +
        '<stop offset="0%" stop-color="' + tint(c, .26) + '"/>' +
        '<stop offset="100%" stop-color="' + tint(c, -.08) + '"/></linearGradient>';
    }
    defs += '</defs>';
    svg += defs;
    /* 扇区角度按「每个分项占总量百分比」精确累计划分，绝不按 n 等角均分。
       第 k 片占据 [acc, acc + pos[k]/total * 2π)，其中线角恰好落在该分项累计
       占比的中点上；缝隙只从两端各内缩一点，不改变中心角，因此「划到哪一度」
       与右侧图例百分比严格一一对应（33.0% → 118.8°，0.3% → 1.08°）。 */
    var TAU = Math.PI * 2, acc = 0;
    /* 缝隙：用极小角度 padding 制造「白色细线」，配合 border-radius 形成 ECharts 那种分块感。
       不画任何外圈参考环 / 描边 —— 上一版的虚线外环和同色粗描边正是「边框感」的来源。
       padding 必须按每片自身角度自适应（上限 0.022 rad 且 ≤ 该片角度的 12%）：
       否则 0.3% 这类极小分项的扇区会被固定 padding 吃穿、甚至算成负角度。 */
    var radiusPx = 12;
    /* 整组带入场动画（逐个淡入 + 轻微放大），切换图表类型时丝滑过渡。
       注意：缩放必须围绕圆心，否则会朝 viewBox 左上角飞出去 → 逐片写 transform-origin。 */
    for (var k = 0; k < n; k++) {
      var sweep = (pos[k] / total) * TAU;            // 该分项的精确占比角度
      var a0 = -Math.PI / 2 + acc;
      var a3 = a0 + sweep;
      var padK = Math.min(0.022, sweep * 0.12);
      var a1 = a0 + padK / 2;
      var a2 = a3 - padK / 2;
      acc += sweep;
      var d = pieArcPath(CX, CY, R0, R1, a1, a2, radiusPx);
      var pct = (pos[k] / total) * 100;
      svg += '<path class="pie-slice" data-i="' + k + '"' +
        ' data-v="' + esc(fmt(vals[k])) + '" data-p="' + pct.toFixed(1) + '" data-t="' + esc(String(m.categories[k]).slice(0, 10)) + '"' +
        /* 精确边界角（不含缝隙）与原始占比，供几何回归测试核对「角度 ↔ 百分比」 */
        ' data-frac="' + (pos[k] / total).toFixed(6) + '" data-a0="' + a0.toFixed(6) + '" data-a1="' + a3.toFixed(6) + '"' +
        ' style="transform-origin:' + CX + 'px ' + CY + 'px;animation-delay:' + (k * 55) + 'ms" d="' + d +
        '" fill="url(#' + uid + '-g' + k + ')">' +
        '<title>' + esc(m.categories[k] + '：' + fmt(vals[k]) + '（' + pct.toFixed(1) + '%）') + '</title></path>';
    }
    /* 中心留白 + 总量（对应 ECharts label.position:'center' 的观感）。
       悬停某片时由 JS 把这里切成「该片数值 + 名称」，对应 ECharts 的 emphasis.label。 */
    svg += '<text x="' + CX + '" y="' + (CY + 2) + '" text-anchor="middle" class="pie-total" data-role="total">' + esc(fmt(total)) + '</text>';
    svg += '<text x="' + CX + '" y="' + (CY + 22) + '" text-anchor="middle" class="pie-series" data-role="series">' + esc(s.name) + '</text>';
    /* 右侧图例列表：色点 + 名称 + 占比 → 右侧数值，下一行是细进度条。
       两行结构比三行更疏朗，也避免文字与进度条挤在一起。 */
    var LX = 424, LW = W - LX - 26;
    var rowH = Math.min(46, (H - 34) / Math.max(1, n));
    var top = CY - (n * rowH) / 2;
    for (var j = 0; j < n; j++) {
      var yy = top + j * rowH + rowH / 2;
      var cj = pal[j % pal.length];
      var pj = pos[j] / total;
      svg += '<rect x="' + LX + '" y="' + (yy - 12).toFixed(1) + '" width="10" height="10" rx="3.2" fill="' + cj + '"/>';
      svg += '<text x="' + (LX + 18) + '" y="' + (yy - 3).toFixed(1) + '" class="pie-lbl">' +
        esc(String(m.categories[j]).slice(0, 10)) + '</text>';
      svg += '<text x="' + (LX + LW) + '" y="' + (yy - 3).toFixed(1) + '" text-anchor="end" class="pie-pct">' +
        (pj * 100).toFixed(1) + '%</text>';
      /* 占比细进度条（无边框，仅圆角矩形） */
      var barW = LW, barY = yy + 5;
      svg += '<rect x="' + LX + '" y="' + barY.toFixed(1) + '" width="' + barW + '" height="4" rx="2" fill="var(--chart-grid,#eef1f5)"/>';
      svg += '<rect x="' + LX + '" y="' + barY.toFixed(1) + '" width="' + Math.max(4, barW * pj).toFixed(1) +
        '" height="4" rx="2" fill="' + cj + '"/>';
      svg += '<text x="' + (LX + LW) + '" y="' + (yy + 20).toFixed(1) + '" text-anchor="end" class="pie-num">' + esc(fmt(vals[j])) + '</text>';
    }
    return svg + '</svg>';
  }
  function drawChart(box, tbl, type) {
    type = type || box.dataset.ct || 'auto';
    var m = parseChart(tbl);
    if (!m) { toast('未检测到数值列，无法生成图表'); return false; }
    if (!m.categories.length || !m.series.length) { toast('表格数据不足，无法生成图表'); return false; }
    var pal = chartColors();
    var nSer = m.series.length;
    var ttype = type === 'auto' ? autoChartType(m.categories, nSer) : type;
    var isPie = (ttype === 'pie' || ttype === 'rose');
    box.dataset.ct = type; box.dataset.rt = ttype;
    var iconFor = {
      auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L13.6 10.4 L21 12 L13.6 13.6 L12 21 L10.4 13.6 L3 12 L10.4 10.4 Z"/></svg>',
      bar:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 V12"/><path d="M12 19 V6"/><path d="M19 19 V14"/></svg>',
      line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 L9 9 L14 13 L20 6"/></svg>',
      trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 L9 12 L13 15 L20 7"/><path d="M15 7 H20 V12"/></svg>',
      /* 环形：双圈（外环 + 内孔） */
      pie:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4"/></svg>',
      /* 玫瑰：等角花瓣（中心 + 六向短线，外端不等长示意变径） */
      rose: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.4"/><path d="M12 9.6 V3.4"/><path d="M14.3 10 L20 6.4"/><path d="M14.3 14 L19.2 17.4"/><path d="M12 14.4 V19"/><path d="M9.7 14 L5.2 17"/><path d="M9.7 10 L5.6 7.6"/></svg>'
    };
    var tabs = CHART_TYPES.map(function (t) {
      return '<button data-ct="' + t + '" title="' + CHART_LABELS[t] + '"' + (type === t ? ' class="on"' : '') + '>' + iconFor[t] + '</button>';
    }).join('');
    /* 图表说明按语言整句生成：中文引号「」在英文里必须换成 "，不能靠逐词替换 */
    var en = effLang() === 'en';
    var typeName = (en
      ? { bar: 'bar chart', line: 'line chart', trend: 'area trend chart', pie: 'rounded donut chart', rose: 'Nightingale rose chart' }
      : { bar: '柱状图', line: '折线图', trend: '面积趋势图', pie: '圆角环形图', rose: '南丁格尔玫瑰图' })[ttype] || ttype;
    var seriesTxt = m.series.map(function (s) { return s.name; }).join(en ? ', ' : '、');
    var sub = (en ? 'Series: ' : '系列：') + seriesTxt +
      (type === 'auto'
        ? (en ? ' · auto-selected "' + typeName + '" (switch the type above)'
              : ' · 已自动选择「' + typeName + '」（可手动切换上方类型）')
        : (en ? ' · current "' + typeName + '"' + (type === defaultChartType() ? ' (default type)' : ' (manual override)') + ', switch the type above'
              : ' · 当前「' + typeName + '」' + (type === defaultChartType() ? '（默认风格）' : '（本次手动切换）') + '，可在上方切换类型'));
    if (isPie && nSer > 1) sub += (en ? ' · shows the first series only "' : ' · 仅展示首个系列「') + m.series[0].name + (en ? '"' : '」');
    var body = isPie ? renderPie(m, pal, ttype === 'rose') : renderAxis(m, pal, ttype);
    var legend = '<div class="legend">' + m.series.map(function (s, i) {
      return '<span><i style="background:' + pal[i % pal.length] + '"></i>' + esc(s.name) + '</span>';
    }).join('') + '</div>';
    box.innerHTML = '<div class="chart-title">📈 数据图表</div><div class="chart-types" role="group">' + tabs + '</div>' +
      '<div class="chart-sub">' + esc(sub) + '</div>' + body + (isPie ? '' : legend);
    return true;
  }
  function fmt(v) {
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万';
    return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('zh-CN') : (Math.round(v * 100) / 100).toString();
  }

  /* ---------- Mermaid ----------
     默认主题出图偏「工程草图」，这里交给自研 MDFlow 管线重画：
     解析 -> 分层布局 -> 设计语言 SVG。遇到 subgraph / classDef / 时序图等
     MDFlow 不覆盖的语法，回退原生 mermaid.run，但套上统一美化主题变量。 */
  async function renderMermaid() {
    /* Unicode 框线字符画（功能架构图 / 系统架构图）→ 语义图 → MDFlow 可视化。
       必须排在 mermaid 块与 MDTextFlow.convertAll 之前：前者会被替换掉 <pre>，
       后者会把含 → 的正文段落误判成「文本流程图」。纯代码算法，零 AI。 */
    if (window.MDAscii && window.MDAscii.convertAll) {
      try { window.MDAscii.convertAll(content); } catch (e) { }
    }
    var blocks = $$('pre > code.language-mermaid', content);
    if (!blocks.length) return;
    var flow = window.MDFlow, native = [];
    try {
      blocks.forEach(function (c) {
        var src = c.textContent;
        var box = document.createElement('div');
        box.className = 'mermaid-box md-flow-box';
        /* 导出页预置 5 种流程图结构时需要原始 Mermaid 源码（CR-2026-11-15-04）。
           随 clone 一起进导出页；导出页运行时不解析它，仅作溯源。 */
        box.setAttribute('data-mf-src', src);
        c.parentElement.replaceWith(box);
        var done = false;
        if (flow) { try { done = flow.render(src, box); } catch (e) { done = false; } }
        if (!done) {
          box.className = 'mermaid-box';
          box.innerHTML = '';
          var d = document.createElement('div');
          d.className = 'mermaid'; d.textContent = src;
          box.appendChild(d); native.push(d);
        }
      });
      if (!native.length) return;
      if (typeof window.mermaid === 'undefined') {
        native.forEach(function (n) {
          n.innerHTML = '<div class="mermaid-err">图表组件不可用，已保留原始代码</div>';
        });
        return;
      }
      window.mermaid.initialize({
        startOnLoad: false, securityLevel: 'loose', theme: 'base',
        themeVariables: flow ? flow.themeVars() : {},
        fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif',
        flowchart: { htmlLabels: true, curve: 'basis', padding: 18 }
      });
      await window.mermaid.run({ nodes: native });
    } catch (e) {
      $$('.mermaid', content).forEach(function (n) {
        n.innerHTML = '<div class="mermaid-err">图表渲染失败：' + esc(e.message || e) + '</div>';
      });
    }
  }

  /* ---------- 全文查找 ---------- */
  function clearFind() {
    S.findMarks.forEach(function (m) {
      if (!m.parentNode) return;
      var t = document.createTextNode(m.textContent); m.parentNode.replaceChild(t, m);
    });
    if (content) content.normalize();
    S.findMarks = []; S.findIdx = -1;
  }
  function doFind(q, step) {
    clearFind();
    $('#findCount').textContent = '';
    if (!q || content.classList.contains('hidden')) return;
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest('pre,code,script,style,.tw-bar,.chart-box,mark,.mermaid')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var lower = q.toLowerCase();
    nodes.forEach(function (node) {
      var text = node.nodeValue, idx = text.toLowerCase().indexOf(lower), frag = document.createDocumentFragment(), pos = 0;
      if (idx < 0) { frag.appendChild(document.createTextNode(text)); }
      else {
        while (idx >= 0) {
          if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
          var m = document.createElement('mark'); m.className = 'find'; m.textContent = text.slice(idx, idx + q.length);
          frag.appendChild(m); S.findMarks.push(m);
          pos = idx + q.length; idx = text.toLowerCase().indexOf(lower, pos);
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      }
      node.parentNode.replaceChild(frag, node);
    });
    if (!S.findMarks.length) { $('#findCount').textContent = '0 处'; return; }
    S.findIdx = step === -1 ? S.findMarks.length - 1 : 0;
    highlightFind();
  }
  function highlightFind() {
    S.findMarks.forEach(function (m, i) { m.classList.toggle('current', i === S.findIdx); });
    $('#findCount').textContent = (S.findIdx + 1) + '/' + S.findMarks.length;
    var cur = S.findMarks[S.findIdx];
    if (cur) scrollInReader(cur, 'smooth', Math.round(reader.clientHeight / 2));
  }
  function stepFind(d) {
    if (!S.findMarks.length) { doFind($('#findInput').value); return; }
    S.findIdx = (S.findIdx + d + S.findMarks.length) % S.findMarks.length; highlightFind();
  }

  /* ================================================================
     编辑 / 保存
     便携版（file://）浏览器无权写本地文件 → 退化为「另存为下载」；
     桌面安装版通过 preload 白名单 IPC 直接写回原路径（含 GB18030 编码回写）。
     ================================================================ */
  var editor = $('#editor');
  function resetEditing() {
    S.editing = false; S.dirty = false; S.whole = false; S.blocks = []; S.gaps = []; S.editBlock = -1; S.fm = '';
    delete document.documentElement.dataset.editing;
    editor.classList.add('hidden');
    $('#editorBar').classList.add('hidden');
    $('#btnEdit').classList.remove('active');
    $('#editLabel').textContent = '编辑';
    $('#btnSave').disabled = !canSave();
    $('#stDirty').textContent = '';
    $('#tabSections').classList.add('hidden');
    /* CR-07：退出编辑态时「段落」页签被藏起来，但若它正是当前选中页签，
       必须把选中态交还给「文件」—— 否则侧栏三个页签全是未选中/隐藏，
       正文面板空白，CR-06 胶囊还会停在一个 display:none 的元素上。
       批量关闭（关闭所有 / 关闭其他）会高频走到这里，这条路径必须自洽。 */
    if (S.tab === 'sections') switchTab('files');
  }
  /* 保存按钮可用条件：有当前文档，且（新建待落盘 / 正在编辑 / 有未保存改动）三者之一 */
  function canSave() {
    if (!S.current) return false;
    return !!S.current.isNew || !!S.editing || !!S.dirty;
  }
  function markDirty(v) {
    S.dirty = !!v;
    $('#stDirty').textContent = S.dirty ? '● 未保存' : '';
    $('#btnSave').disabled = !canSave();
  }
  /* 把整份 markdown 切成「块」数组，块顺序与原文完全一致。
     每块记录：text=纯内容（不含行尾换行）、term=该块自身的行尾换行（最后一块按原文是否有结尾换行决定）、
     gap=块后的空行（块间分隔）。写回时按 fm + Σ(text+term+gap) 精确拼回，不丢空行、不乱序。
     编辑只改 text，term/gap 作为元数据原样保留，因此往返一定还原。
     块类型：heading 标题 / para 段落 / list 列表 / table 表格 / code 代码 / quote 引用 / hr 分隔线。
     代码围栏（``` / ~~~）与表格行内的内容不会被误判为标题或列表。 */
  var BLK_TAG = { heading: 'H', para: '¶', list: '•', table: '▦', code: '</>', quote: '❝', hr: '―' };
  function splitBlocks(md) {
    var fm = frontmatter(md);
    var fmRaw = fm.fm !== '' ? '---\n' + fm.fm + (fm.fm.slice(-1) === '\n' ? '' : '\n') + '---\n' : '';
    var body = fm.text.replace(/^\r?\n/, '');
    var trailingNL = body.endsWith('\n');
    var rawLines = body.split('\n');
    if (trailingNL) rawLines.pop(); // 去掉 split 产生的尾部空元素（它只是结尾换行）
    var blocks = [], cur = null, fence = null, between = 0;
    function close(isLast) {
      var g = between > 0 ? '\n'.repeat(between) : '';
      between = 0;
      if (!cur) return;
      cur.gap = g;
      cur.term = (isLast && !trailingNL) ? '' : '\n';
      blocks.push(cur); cur = null;
    }
    function newBlock(type, line, extra) {
      close(false); cur = Object.assign({ type: type, lines: [line] }, extra || {});
    }
    for (var i = 0; i < rawLines.length; i++) {
      var line = rawLines[i];
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (f) {
        var ch = f[1][0], len = f[1].length;
        if (!fence) { newBlock('code', line); fence = { ch: ch, len: len }; }
        else if (fence.ch === ch && len >= fence.len) { cur.lines.push(line); fence = null; } // 先不关闭，保留 cur 以承接随后的空行作为 gap
        else cur.lines.push(line);
        continue;
      }
      if (fence) { cur.lines.push(line); continue; }
      if (/^\s*$/.test(line)) { between += 1; continue; } // 空行累计为块间分隔（不在此关闭块）
      var heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
      var type;
      if (heading) type = 'heading';
      else if (/^\s*>\s?/.test(line)) type = 'quote';
      else if (/\|/.test(line)) {
        var nxt = rawLines[i + 1] || '';
        if (/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(nxt) && /-/.test(nxt)) type = 'table';
        else if (cur && cur.type === 'table') type = 'table';
        else type = 'para';
      }
      else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) type = 'list';
      else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) type = 'hr';
      else type = 'para';
      // 同一类型的相邻行（且中间没有空行）才并入同一块；否则空行已结束上一块，新建块
      var same = cur && between === 0 && type === cur.type && type !== 'heading' && type !== 'hr';
      if (same) { cur.lines.push(line); }
      else { newBlock(type, line, type === 'heading' ? { level: heading[1].length } : undefined); }
    }
    close(true);
    blocks.forEach(function (b, i) {
      b.index = i;
      b.text = b.lines.join('\n');
      if (b.type === 'heading') b.title = b.lines[0].replace(/^#{1,6}\s+/, '').trim() || '（未命名标题）';
      else {
        var first = '';
        for (var k = 0; k < b.lines.length; k++) { if (b.lines[k].trim() !== '') { first = b.lines[k]; break; } }
        b.title = first.replace(/^[#>\s]*/, '').replace(/[*_`~]/g, '').replace(/^\s*([-*+]|\d+[.)])\s+/, '').trim().slice(0, 60) || '（空块）';
      }
    });
    return { fm: fmRaw, blocks: blocks };
  }
  function joinBlocks(fm, blocks) {
    var out = fm;
    for (var i = 0; i < blocks.length; i++) out += blocks[i].text + (blocks[i].term || '') + (blocks[i].gap || '');
    return out;
  }
  function textWordCount(lines) {
    return (lines || []).join('\n').replace(/\s/g, '').length.toLocaleString('zh-CN');
  }
  function flushBlock() {
    if (!S.editing || S.whole) return;
    if (S.editBlock < 0 || !S.blocks[S.editBlock]) return;
    var val = editor.value;
    /* 单块：沿用原路径，只换 lines/text，term/gap 元数据原样保留。
       多块（整节）：把「本节在全文中占的那一段」按原字符拼接方式切出来整段替换，
       然后对整篇重新 splitBlocks —— 这样 joinBlocks(splitBlocks(x)) === x
       由构造保证，往返不变式不靠逐块小心翼翼地维护。 */
    var g = S.group;
    if (g && g.to > g.from && g.from <= S.editBlock && S.editBlock <= g.to) {
      if (val === groupText(g)) return;             /* 没改就不用动，省一次全篇重切 */
      var prefix = S.fm, suffix = '', i;
      for (i = 0; i < g.from; i++) prefix += S.blocks[i].text + (S.blocks[i].term || '') + (S.blocks[i].gap || '');
      for (i = g.to + 1; i < S.blocks.length; i++) suffix += S.blocks[i].text + (S.blocks[i].term || '') + (S.blocks[i].gap || '');
      /* 行边界必须保住：节末 gap 已被带进 val，正常往返时 val 以 \n 结尾、这块不会触发。
         但用户若在节末直接续写而不敲空行，val 末尾就没有换行，拼上 suffix 首行会
         变成「…**加粗**## 下一节标题」——实测因此吃掉一个 H2（16→15）。
         这里补一个换行：块与块之间必须有分隔，这不算改用户内容，是补语义边界。 */
      if (suffix && val.slice(-1) !== '\n') val += '\n';
      var m = splitBlocks(prefix + val + suffix);
      S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps;
      /* 编辑后节的范围会变（可能多/少了几块），按「同一节标题」重新定位；
         标题被改掉则退回原 from 下标，至少不会跳到文档开头。 */
      var anchor = blockIndexOfHeading(g.title);
      if (anchor < 0) anchor = Math.min(g.from, S.blocks.length - 1);
      S.editBlock = Math.max(0, anchor);
      S.group = groupOfBlock(S.editBlock);
      return;
    }
    S.blocks[S.editBlock].lines = val.split('\n');
    S.blocks[S.editBlock].text = val;
  }

  /* ================================================================
     CR-2026-11-20-03  编辑旁路的三处体验修复
     ----------------------------------------------------------------
     实测（tools/_probe/probe-boundary.cjs）：40 节文档滚到 45% 进编辑，
     再退出，scrollTop 从 2010 掉到 0 —— 「刚改第 30 节，回来得从头找」，
     而长文里每改一块就要付一次。下面三项全部只动编辑旁路内部，
     不碰渲染链 / 导出链 / joinBlocks 的往返不变式。
     ================================================================ */

  /* 进编辑时记住「你正在看哪一节」，退出时按它回位。
     优先用标题文本匹配（不依赖 DOM 顺序），失败则退回滚动比例。 */
  var _editReturn = null;

  function headingAtViewportTop() {
    var box = reader.getBoundingClientRect();
    var hs = $$('#content h1,#content h2,#content h3,#content h4,#content h5,#content h6');
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].getBoundingClientRect().bottom > box.top + 4) {
        /* 同时记住它的**精确偏移**（可能是负数：标题已滚出去一半）。
           只记标题文本再把它对齐到视口顶，会带来几十到上百 px 的跳变（实测 146px）。 */
        return { title: hs[i].textContent.trim(), offset: hs[i].getBoundingClientRect().top - box.top };
      }
    }
    return { title: '', offset: 0 };
  }
  /* 退出编辑后回到原位：先按标题 + 原偏移精确回位；标题被改掉（或本文没有标题）时
     退回「按原滚动比例」估计 —— 两种都失败才停在顶部。
     注意这里必须显式 scrollTo，不能靠 render() 的默认复位。 */
  function restoreReadingPos(rec) {
    if (!rec) { reader.scrollTop = 0; return; }
    if (rec.title && rec.offset != null) {
      var box = reader.getBoundingClientRect();
      var hs = $$('#content h1,#content h2,#content h3,#content h4,#content h5,#content h6');
      for (var i = 0; i < hs.length; i++) {
        if (hs[i].textContent.trim() !== rec.title) continue;
        var delta = (hs[i].getBoundingClientRect().top - box.top) - rec.offset;
        try { reader.scrollTo({ top: Math.max(0, reader.scrollTop + delta), behavior: 'auto' }); }
        catch (e) { reader.scrollTop = Math.max(0, reader.scrollTop + delta); }
        return;
      }
    }
    var max = Math.max(0, reader.scrollHeight - reader.clientHeight);
    if (rec.ratio > 0.001 && max > 0) {
      try { reader.scrollTo({ top: Math.round(max * rec.ratio), behavior: 'auto' }); }
      catch (e) { reader.scrollTop = Math.round(max * rec.ratio); }
      return;
    }
    reader.scrollTop = 0;
  }
  function blockIndexOfHeading(title) {
    if (!title) return -1;
    for (var i = 0; i < S.blocks.length; i++) {
      if (S.blocks[i].type === 'heading' && S.blocks[i].title === title) return i;
    }
    return -1;
  }
  function scrollToBlockByTitle(title) {
    var hs = $$('#content h1,#content h2,#content h3,#content h4,#content h5,#content h6');
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.trim() === title) { scrollInReader(hs[i], 'auto', 8); return true; }
    }
    return false;
  }
  /* 兜底：标题匹配失败（标题被改掉）时按滚动比例回位 */
  function restoreByRatio(rec) {
    var max = Math.max(0, reader.scrollHeight - reader.clientHeight);
    if (rec && rec.ratio > 0.001 && max > 0) {
      try { reader.scrollTo({ top: Math.round(max * rec.ratio), behavior: 'auto' }); }
      catch (e) { reader.scrollTop = Math.round(max * rec.ratio); }
      return;
    }
    reader.scrollTop = 0;
  }

  /* ---------- 节聚合：只加在 UI 层，splitBlocks 一行不动 ----------
     实测块列表是「H2|第 1 节」「¶|正文」「H2|第 2 节」——标题与它的正文是两个块，
     写一节要切两次。这里把 heading 与「其后直到下一个 heading」的块合成一节，
     点击即整节编辑；写回时用 splitBlocks 重新切分该段并替换区间，
     joinBlocks 的往返不变式完全不受影响。 */
  function groupSections() {
    var groups = [];
    if (!S.blocks || !S.blocks.length) return groups;
    var cur = null;
    for (var i = 0; i < S.blocks.length; i++) {
      var b = S.blocks[i];
      if (b.type === 'heading' || !cur) {
        cur = { head: i, from: i, to: i, title: b.title || '', level: b.level || 0, type: b.type, count: 1 };
        groups.push(cur);
      } else {
        cur.to = i;
        cur.count += 1;
        /* 节的字数 = 节内所有块的字数之和 */
        cur.wc = (cur.wc || 0) + textWordCount(b.lines).replace(/,/g, '') * 1;
      }
    }
    return groups;
  }
  /* 当前编辑位置所属的节（按 from..to 区间判定，兼容全篇/单块回退） */
  function groupOfBlock(i) {
    var gs = groupSections();
    for (var k = 0; k < gs.length; k++) if (i >= gs[k].from && i <= gs[k].to) return gs[k];
    return null;
  }
  /* 一节拼成编辑框文本：块内 gap（块间空行）必须带上，否则节内空行消失。
     末块的 gap 也要带 —— 它和 prefix/suffix 一起拼回全文时必须是原文，
     否则「prefix + val + suffix」会少一个换行，往返差 1 字节（实测 1294 vs 1295）。
     代价是用户删掉末行空行就真的删了，但这与 textarea 里看到的一致，属「所见即所改」。 */
  function groupText(g) {
    var out = '';
    for (var i = g.from; i <= g.to; i++) {
      var b = S.blocks[i];
      out += b.text + (b.term || '') + (b.gap || '');
    }
    return out;
  }
  function loadGroup(g, noFlush) {
    if (!S.editing || !g) return;
    /* 全篇模式下切到节：先把全篇文本重切成块，再装载节。原先这里直接 return，
       导致「全篇 → 点左栏某一节」毫无反应（按钮和侧栏两处入口都失效）。 */
    if (S.whole) {
      var m = splitBlocks(editor.value);
      S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps;
      S.whole = false;
      document.documentElement.dataset.bv = S.bvOff ? 'off' : 'on';
      $('#btnSecWhole').textContent = effLang() === 'en' ? 'Edit Whole Doc' : '全篇编辑';
      noFlush = true;                    /* 刚由全篇重切，不需要再 flush */
    }
    /* noFlush：进入编辑时首次装载用。此时 editor.value 还是上一份文档的残留，
       若照常 flush 会把旧内容写进刚切出来的块里（脏写）。 */
    if (!noFlush) flushBlock();
    S.group = g;
    S.editBlock = g.from;
    S.groupOpen[g.from] = true;          /* 当前工作的节默认展开，看得到节内逐块 */
    editor.value = groupText(g);
    /* 节标签按语言整句生成（不靠字典逐词替换）：`节 · 标题 · N 块` 里的中文标点与
       量词在英文里必须换序，交给 tr() 只会得到 'Section · 标题 · 3 blocks' 的半成品。 */
    var enL = effLang() === 'en';
    var lbl = g.count > 1
      ? (enL ? 'Section · ' + (g.title || '(empty section)') + ' · ' + g.count + (g.count > 1 ? ' blocks' : ' block')
             : '节 · ' + (g.title || '（空节）') + ' · ' + g.count + ' 块')
      : (enL ? 'Block #' + (g.from + 1) + ' · ' + (g.title || '(empty block)')
             : '块 #' + (g.from + 1) + ' · ' + (g.title || ''));
    $('#editSecLabel').textContent = lbl;
    $$('#sideSections .sec-item').forEach(function (n) {
      n.classList.toggle('active', +n.dataset.i >= g.from && +n.dataset.i <= g.to);
    });
    updateStatus();
    renderBlockView();
  }
  function loadBlock(i, noFlush) {
    if (!S.editing) return;
    if (i < 0) return;
    /* 同 loadGroup：全篇模式下点左栏某一块，也要能切回块编辑 */
    if (S.whole) {
      var m = splitBlocks(editor.value);
      S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps;
      S.whole = false;
      document.documentElement.dataset.bv = S.bvOff ? 'off' : 'on';
      $('#btnSecWhole').textContent = effLang() === 'en' ? 'Edit Whole Doc' : '全篇编辑';
      noFlush = true;
    }
    if (i >= S.blocks.length) return;
    if (!noFlush) flushBlock();
    S.editBlock = i;
    S.group = groupOfBlock(i) || { from: i, to: i, count: 1, title: S.blocks[i].title || '' };
    editor.value = S.blocks[i].text;
    var enB = effLang() === 'en';
    $('#editSecLabel').textContent = (enB ? 'Block #' : '块 #') + (i + 1) + ' · ' + (S.blocks[i].title || (enB ? '(empty block)' : ''));
    $$('#sideSections .sec-item').forEach(function (n) {
      n.classList.toggle('active', +n.dataset.i >= S.group.from && +n.dataset.i <= S.group.to);
    });
    updateStatus();
    renderBlockView();
  }

  /* ---------- 块内实时预览（P1） ----------
     编辑态下把「当前正在编辑的这一节/块」渲染到 #content 里。
     复用 #content 自带的全套样式（92 条规则）与同一套 marked 管线，
     所以预览与正文逐像素同款，且不新增任何元素。
     退出编辑时 render(full) 会把 #content 恢复成全文，无需额外清理。 */
  var _previewTimer = 0;
  function renderBlockView() {
    if (!S.editing) return;
    var src = editor.value;
    if (!src.trim()) {
      content.innerHTML = '<p style="color:var(--muted)">' + esc(t('（空节）')) + '</p>';
      content.setAttribute('data-bvcap', t('预览 · 只读'));
      return;
    }
    var html;
    try { html = marked.parse(preprocess(src), { gfm: true, breaks: false }); }
    catch (e) { html = '<p>解析失败：' + esc(e.message) + '</p>'; }
    content.innerHTML = html;
    /* 预览是只读的：脚本类节点一律去掉；表格/代码块的工具条不绑事件，
       所以在编辑态点排序箭头、复制按钮都不会有反应——这是有意的，
       避免「在下半屏改到了文档」这种惊吓。 */
    $$('script,iframe,object,embed,link', content).forEach(function (n) { n.remove(); });
    content.setAttribute('data-bvcap', t('预览 · 只读'));
    content.setAttribute('aria-label', t('当前编辑内容预览（只读）'));
    content.setAttribute('aria-readonly', 'true');
  }
  function scheduleBlockView() {
    if (!S.editing || S.bvOff) return;
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(renderBlockView, 180);
  }
  /* 预览开关：写长文想要纯粹写字时可以关掉，回到原来的单栏编辑 */
  function setBlockView(on) {
    on = !!on;
    S.bvOff = !on;
    document.documentElement.dataset.bv = (on && !S.whole) ? 'on' : 'off';
    var b = $('#btnBlockView');
    if (b) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? '预览 开' : '预览 关';
      b.title = on ? '关闭块内预览（只留写作区）' : '打开块内预览（下方实时显示排版效果）';
    }
    if (on && !S.whole) renderBlockView();
  }

  /* 编辑态由 JS 按语言生成的文案，不能靠字典——切语言时必须显式重刷。
     实测：切 en → zh-CN 后 #editSecLabel 停在「Section · 测试长文 · 2 blocks」，
     #content 的 data-bvcap 停在「Preview · Read-only」，因为它们在切语言那一刻
     不会重新生成（只在 loadGroup/loadBlock/renderBlockView 里写）。
     与 CR-22 的 __wfRelabel 同一套路：暴露一个重刷函数，挂在 applyI18nDOM 末尾。
     注意 data-bvcap 与 aria-label 是**属性**，TreeWalker 扫不到，必须显式写。 */
  function relabelEditUI() {
    var b = $('#btnBlockView');
    if (b) {
      var on = !S.bvOff;
      b.textContent = on ? t('预览 开') : t('预览 关');
      b.title = on ? t('关闭块内预览（只留写作区）') : t('打开块内预览（下方实时显示排版效果）');
    }
    if (!S.editing) return;
    if (S.whole) { $('#editSecLabel').textContent = t('全篇'); return; }
    var g = S.group;
    if (!g) return;
    var enL = effLang() === 'en';
    $('#editSecLabel').textContent = g.count > 1
      ? (enL ? 'Section · ' + (g.title || '(empty section)') + ' · ' + g.count + ' blocks'
             : '节 · ' + (g.title || '（空节）') + ' · ' + g.count + ' 块')
      : (enL ? 'Block #' + (g.from + 1) + ' · ' + (g.title || '(empty block)')
             : '块 #' + (g.from + 1) + ' · ' + (g.title || ''));
    /* 预览面板的吸顶标注与 aria 都是属性，必须重写 */
    content.setAttribute('data-bvcap', t('预览 · 只读'));
    content.setAttribute('aria-label', t('当前编辑内容预览（只读）'));
  }

  function buildBlockList() {
    var box = $('#sideSections');
    if (!S.blocks || !S.blocks.length) {
      box.innerHTML = '<div class="empty-hint">' + esc(t(S.current && S.current.isNew
        ? '新文档还是空的：在右侧直接输入 Markdown，按 Ctrl+S 另存为 .md 文件。'
        : '该文档没有可编辑的块。')) + (S.current && S.current.isNew ? '' :
        '<br>' + esc(t('可用顶部「全篇编辑」直接编辑整份文档。'))) + '</div>';
      return;
    }
    /* CR-03：按「节」分组呈现。默认每组一行（标题 + 块数 + 字数），
       展开后才是逐块。这样写一节不必来回点两次，也让块列表在长文里可导航。 */
    var gs = groupSections();
    var html = '';
    gs.forEach(function (g, gi) {
      var inGroup = S.group && S.editBlock >= g.from && S.editBlock <= g.to;
      var expand = !!S.groupOpen && S.groupOpen[g.from];
      var tag = (BLK_TAG[g.type] || '¶') + (g.type === 'heading' ? g.level : '');
      var wc = 0;
      for (var i = g.from; i <= g.to; i++) wc += S.blocks[i].lines.join('\n').replace(/\s/g, '').length;
      html += '<div class="sec-item sec-group' + (inGroup ? ' active' : '') + (expand ? ' open' : '') +
        '" data-i="' + g.from + '" data-to="' + g.to + '" data-t="' + g.type + '" data-g="1"'
        + (g.level ? ' data-lv="' + g.level + '"' : '') + '>'
        + '<span class="sec-lv">' + tag + '</span>'
        + '<span class="sec-title">' + esc(g.title || (effLang() === 'en' ? '(empty section)' : '（空节）')) + '</span>'
        + (g.count > 1 ? '<span class="sec-cnt">' + g.count + '</span>' : '')
        + '<span class="sec-wc">' + wc.toLocaleString('zh-CN') + '</span></div>';
      if (expand && g.count > 1) {
        for (var j = g.from; j <= g.to; j++) {
          var b = S.blocks[j];
          var t2 = (BLK_TAG[b.type] || '¶') + (b.type === 'heading' ? b.level : '');
          html += '<div class="sec-item sec-sub' + (j === S.editBlock ? ' active' : '') +
            '" data-i="' + j + '" data-t="' + b.type + '">'
            + '<span class="sec-lv">' + t2 + '</span>'
            + '<span class="sec-title">' + esc(b.title) + '</span>'
            + '<span class="sec-wc">' + textWordCount(b.lines) + '</span></div>';
        }
      }
    });
    box.innerHTML = html;
  }

  function setEditing(on) {
    if (!S.current) { toast('请先打开一个文档'); return; }
    on = !!on;
    if (on === !!S.editing) return;
    if (!on && S.dirty && !window.confirm(t(
      '有未保存的修改，仍要返回预览吗？\n（修改会保留在编辑器里，可继续按 Ctrl+S 保存）'))) return;
    if (!on) {
      flushBlock();
      var full = S.whole ? editor.value
        : joinBlocks(S.fm, S.blocks, S.gaps);
      S.current.cached = full;
      editor.classList.add('hidden');
      $('#editorBar').classList.add('hidden');
      $('#tabSections').classList.add('hidden');
      S.editing = false; S.whole = false; S.blocks = []; S.gaps = []; S.editBlock = -1;
      delete document.documentElement.dataset.editing;
      $('#btnEdit').classList.remove('active');
      $('#editLabel').textContent = '编辑';
      $('#btnSave').disabled = !canSave();
      /* CR-07：与 resetEditing 同源 —— 藏「段落」页签时若它正被选中，交还给「文件」 */
      if (S.tab === 'sections') switchTab('files');
      /* CR-03：退出编辑回原位。_editReturn 在进入编辑那一刻就存好了（标题 + 滚动比例），
         这里不重新取，因为编辑态下 #content 已被预览面板占用，量出来的标题不一定是原来那节。 */
      var back = _editReturn; _editReturn = null;
      render(full, S.current).then(function () { restoreReadingPos(back); });
      return;
    }
    /* CR-03：进入编辑前先记住阅读位置 —— 这是「改完一节回来还在原地」的唯一依据 */
    _editReturn = (function () {
      var max = Math.max(0, reader.scrollHeight - reader.clientHeight);
      return { title: headingAtViewportTop(), ratio: max > 0 ? reader.scrollTop / max : 0 };
    })();
    // 进入编辑：切成「块」，默认选中第一个块（无块则回落整篇）
    var m = splitBlocks(S.current.cached || '');
    S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps; S.whole = false;
    /* CR-03：默认落到「你正在看的那一节」，而不是永远第 1 块。
       标题定位不到（文档无标题 / 在摘要区）才退回第 1 块。 */
    var hit = blockIndexOfHeading(_editReturn.title);
    S.editBlock = S.blocks.length ? (hit >= 0 ? hit : 0) : -1;
    S.editing = true;
    document.documentElement.dataset.editing = '1';
    document.documentElement.dataset.bv = S.bvOff ? 'off' : 'on';
    editor.classList.remove('hidden');
    $('#editorBar').classList.remove('hidden');
    $('#tabSections').classList.remove('hidden');
    $('#btnEdit').classList.add('active');
    $('#editLabel').textContent = '预览';
    $('#btnSave').disabled = false;
    if (S.editBlock < 0) {
      S.whole = true;
      editor.value = S.current.cached || '';
      $('#editSecLabel').textContent = '全篇';
      $('#btnSecWhole').textContent = '块编辑';
    } else {
      /* 进入编辑时首次装载：不 flush（编辑器里还是上一份文档的残留内容） */
      S.group = groupOfBlock(S.editBlock);
      S.groupOpen[S.group.from] = true;
      loadBlock(S.editBlock, true);
      var gp = groupOfBlock(S.editBlock);
      if (gp && gp.count > 1) loadGroup(gp, true);
      $('#btnSecWhole').textContent = '全篇编辑';
    }
    buildBlockList();
    switchTab('sections');
    reader.scrollTop = 0;
    setTimeout(function () { editor.focus(); }, 0);
    toast('按节编辑：左栏「段落」选节 · Ctrl+S 保存 · Ctrl+E 返回预览 · 下方是实时排版预览');
  }
  async function saveCurrent() {
    if (!S.current) { toast('还没有打开文件'); return; }
    var item = S.current;
    var text;
    if (S.editing) {
      if (S.whole) text = editor.value;
      else { flushBlock(); text = joinBlocks(S.fm, S.blocks, S.gaps); }
    } else {
      text = item.cached || '';
    }
    var D = window.__MD_DESKTOP__;
    /* 新建文档（无 absPath）先走「另存为」：桌面版弹系统对话框，便携版直接下载，
       成功后把真实路径 / 文件名回填，后续 Ctrl+S 就是普通保存。 */
    if (item.isNew || !item.absPath) {
      var target = item.name;
      if (D && typeof D.saveAs === 'function') {
        var sa = await D.saveAs(target, text);
        if (!sa || sa.canceled) { if (sa && sa.error) toast(t('另存为失败：') + sa.error, 4000); return; }
        if (!sa.ok) { toast(t('保存失败：') + ((sa && sa.error) || '未知错误'), 4000); return; }
        item.absPath = sa.path || '';
        if (sa.name) { item.name = sa.name; item.rel = sa.name; }
        item.isNew = false; item.enc = 'UTF-8';
        var t0 = S.activeKey && findTab(S.activeKey);
        if (t0) t0.key = tabKeyOf(item);
        S.activeKey = tabKeyOf(item);
        if (!S.byKey.has(keyOf(item.name))) S.byKey.set(keyOf(item.name), item);
        item.cached = text; markDirty(false);
        buildTree(); renderTabbar(); updateStatus();
        if (S.editing) buildBlockList(); else render(text, item);
        recentTouch(item, text);
        toast(t('已保存到 ') + (sa.path || item.name));
        return;
      }
      /* 便携版 / 浏览器：下载为 .md（另存为新文件） */
      var blob0 = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var url0 = URL.createObjectURL(blob0);
      var a0 = document.createElement('a');
      a0.href = url0; a0.download = target || 'document.md';
      document.body.appendChild(a0); a0.click(); a0.remove();
      setTimeout(function () { URL.revokeObjectURL(url0); }, 4000);
      item.cached = text; markDirty(false);
      if (S.editing) buildBlockList(); else render(text, item);
      recentTouch(item, text);
      updateStatus();
      toast(t('已导出为新文件：') + (target || 'document.md') + t('；装桌面版可直接保存到磁盘'), 4200);
      return;
    }
    if (D && item.absPath && typeof D.writeFile === 'function') {
      var r = await D.writeFile(item.absPath, text, item.enc || 'UTF-8');
      if (!r || !r.ok) { toast('保存失败：' + ((r && r.error) || '未知错误'), 4000); return; }
      if (r.enc) { item.enc = r.enc; var se = $('#stEnc'); if (se) se.textContent = '· ' + item.enc; }
      toast('已保存到 ' + item.name);
    } else {
      var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = item.name || 'document.md';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('便携版无权覆盖原文件，已另存为新文件；装桌面版可直接保存', 4200);
    }
    item.cached = text;
    markDirty(false);
    if (!S.editing) render(text, item);
    else buildBlockList();
    recentTouch(item, text);
    updateStatus();
  }
  editor.addEventListener('input', function () {
    markDirty(true);
    /* CR-03：边写边渲染下方预览（180ms 防抖，不会每键重排） */
    scheduleBlockView();
  });
  editor.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    var s = editor.selectionStart, en = editor.selectionEnd, v = editor.value;
    editor.value = v.slice(0, s) + '  ' + v.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 2;
    markDirty(true);
  });
  window.addEventListener('beforeunload', function (e) {
    if (!S.dirty) return;
    e.preventDefault(); e.returnValue = '';
  });

  /* ---------- 状态栏 ---------- */
  function updateStatus() {
    var item = S.current;
    $('#stFile').textContent = item ? '📄 ' + item.rel : '就绪';
    var se = $('#stEnc'); if (se) se.textContent = item && item.enc ? '· ' + item.enc : '';
    if (!item) { $('#stWords').textContent = ''; $('#stRead').textContent = ''; }
    else {
      var t = item.cached || '', chars = t.replace(/\s/g, '').length;
      $('#stWords').textContent = chars.toLocaleString('zh-CN') + ' 字 · ' + t.split('\n').length + ' 行';
      $('#stRead').textContent = '≈ ' + Math.max(1, Math.ceil(chars / 400)) + ' 分钟阅读';
    }
    $('#stCount').textContent = S.files.length ? S.files.length + ' 个文档' : '';
    var st = $('#stLayout'); if (st) st.textContent = LAYOUT_NAME[S.layout] || '';
    $('#stTheme').textContent = ({ light: '浅色主题', dark: '深色主题', sepia: '护眼主题' })[S.theme];
    $('#stDirty').textContent = S.dirty ? '● 未保存' : '';
  }

  /* ---------- 导出 ---------- */
  /* Word 版心 = A4 210mm − 左右各 18mm = 174mm ≈ 658px / 493pt。
     Word 的 HTML 引擎常忽略 CSS max-width，直接按 PNG 内在像素尺寸插图；
     若保留 2× 栅格化的大图，Q1–Q4 柱状图就会被放大到页面外并裁切。
     统一策略：图片等比压到版心内、PNG 内在尺寸 = 显示尺寸（不再 2×），
     再用 pt 写死 style 宽高（Word 对 pt 的支持最可靠），三重保险。 */
  var WORD_MAX_PX = 620;
  function wordFit(w, h) {
    var k = Math.min(1, WORD_MAX_PX / Math.max(1, w));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  function wordPic(dataUrl, w, h) {
    var d = wordFit(w, h);
    var pic = document.createElement('img');
    pic.src = dataUrl;
    pic.setAttribute('width', d.w); pic.setAttribute('height', d.h);
    pic.style.width = (d.w * 0.75).toFixed(1) + 'pt';
    pic.style.height = (d.h * 0.75).toFixed(1) + 'pt';
    pic.style.maxWidth = '100%';
    return pic;
  }
  function blobToDataURL(blob) {
    return new Promise(function (res) {
      var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(blob);
    });
  }
  async function inlineBlobImages() {
    for (var i = 0; i < $$('img', content).length; i++) {
      var img = $$('img', content)[i];
      if (img.src.indexOf('blob:') === 0) {
        try { img.src = await blobToDataURL(await (await fetch(img.src)).blob()); } catch (e) { }
      }
    }
  }
  /* 导出副本：移除图表工具条，把流程图 SVG 里的 CSS 变量固化为真实颜色。
     关键：clone 的本来就是「最后编辑状态」的 DOM（节点位置 / 文字 / 强调色 /
     新增删除的节点与连线都在上面），这里绝不重新渲染回自动布局，
     只剥离编辑器 UI 与编辑态描边 —— 导出 HTML / Word / PDF 均以最后编辑状态为准。 */
  /* opts.interactive：导出「可交互独立 HTML」时为真。
     与 Word / PDF 静态快照的区别只有两点：
       · 保留 .mf-tools / .mf-modes（导出页运行时接管切结构），不整条删掉；
       · 跳过 inlineVars()，SVG 保留 var(--mf-*)，换主题 / 文档风格时图形跟着变色。
     两种情况都会执行 cleanForExport()：剥离编辑器 UI 与编辑态描边，
     但绝不重绘、绝不丢掉「最后编辑状态」的节点位置 / 文字 / 颜色 / 增删内容。 */
  function cloneForExport(opts) {
    opts = opts || {};
    var clone = content.cloneNode(true);
    if (!opts.interactive) {
      $$('.mf-tools', clone).forEach(function (n) { n.remove(); });
    }
    if (window.MDFlow) {
      if (window.MDFlow.cleanForExport) {
        try { window.MDFlow.cleanForExport(clone); } catch (e) { }
      }
      if (!opts.interactive) {
        $$('.mf-svg', clone).forEach(function (svg) {
          try { svg.outerHTML = window.MDFlow.inlineVars(svg.outerHTML); } catch (e) { }
        });
      }
    }
    return clone;
  }

  /* Word 不支持内联 SVG：先画到 canvas 转 PNG，再替换导出副本里的图表 */
  async function rasterizeFlows(clone) {
    if (!window.MDFlow) return clone;
    /* Word / PNG 是静态画面，先去掉流水层，避免定格成虚线碎片盖住灰线 */
    $$('.mf-flow, .mf-flow-halo', clone).forEach(function (n) { n.remove(); });
    var svgs = $$('.mf-svg', clone);
    for (var i = 0; i < svgs.length; i++) {
      var svg = svgs[i];
      try {
        var w = svg.viewBox.baseVal.width, h = svg.viewBox.baseVal.height;
        if (!w || !h) continue;
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        var data = window.MDFlow.inlineVars(new XMLSerializer().serializeToString(svg));
        var img = new Image();
        await new Promise(function (res) {
          img.onload = res; img.onerror = res;
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
        });
        if (!img.width) continue;
        /* 内在像素 = 显示像素，杜绝 Word 按 2× 原尺寸放大越页 */
        var fit = wordFit(w, h), cv = document.createElement('canvas');
        cv.width = fit.w; cv.height = fit.h;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        svg.parentNode.replaceChild(wordPic(cv.toDataURL('image/png'), w, h), svg);
      } catch (e) { /* 栅格化失败则保留原始 SVG，不影响正文 */ }
    }
    return clone;
  }
  /* ---------- 导出页预置（CR-2026-11-15-04） ----------
     导出页不内联完整主应用运行时：4MB+ 体积、IIFE 内部函数不可调用、
     clone DOM 会丢 addEventListener。改为在主应用里把「多形态」预渲染成
     <template>，导出页只做切换显隐 —— 运行时 ~12KB，完全离线、无 CDN。 */

  /* 12 组风格变量：四套文档风格 × 三种主题。
     复用 applyDocStyle()/docStyleCss()，不复制颜色运算逻辑；
     预置阶段一律按 classic 算（导出页流程图颜色跟随统一文档风格），
     算完立刻恢复 <html style> 与 S.flowStyle，绝不改变屏幕上的当前皮肤。 */
  function buildStylePresets() {
    var out = {}, savedStyle = document.documentElement.getAttribute('style') || '';
    var savedFlow = S.flowStyle;
    var savedTheme = document.documentElement.getAttribute('data-theme');
    S.flowStyle = 'classic';
    try {
      Object.keys(DOC_STYLES).forEach(function (s) {
        ['light', 'dark', 'sepia'].forEach(function (t) {
          /* CR-06：--lp-ink 必须按「目标主题」的胶囊底色择墨。--lp-fill / --lp-tint
             由 html[data-theme] 的 CSS 提供，若不临时切主题，12 组预置会全部读到
             当前主题（通常浅色）的玻璃白，导出页深色下文字对比度掉到 2.03:1。
             applyDocStyle 其余派生色都是纯 JS 运算，不读 computed style，不受影响。 */
          document.documentElement.setAttribute('data-theme', t);
          applyDocStyle(s, t);
          out[s + '|' + t] = docStyleCss();
        });
      });
    } finally {
      document.documentElement.setAttribute('style', savedStyle);
      if (savedTheme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', savedTheme);
      S.flowStyle = savedFlow;
    }
    return out;
  }

  /* 把每张图表的 6 种类型、每张流程图的 5 种结构预渲染进 #mdx-store。
     只预置「能出图」的表格（parseChart 判定）与带 data-mf-src 的流程图，
     纯文本表 / 原生 Mermaid 兜底图不会白白撑大体积。 */
  function buildExportPresets(clone) {
    var store = document.createElement('div');
    store.id = 'mdx-store'; store.className = 'mdx-store';
    var bytes = 0, ci = 0, fi = 0;

    var twReal = $$('#content .tw', content), twClone = $$('.tw', clone);
    twClone.forEach(function (twC, k) {
      var box = twC.querySelector('.chart-box');
      var tbl = twReal[k] && twReal[k].querySelector('table');
      if (!box || !tbl || !parseChart(tbl)) return;
      box.classList.add('show');
      box.dataset.mdxI = String(ci);
      CHART_TYPES.forEach(function (t) {
        var tmp = document.createElement('div'), tpl;
        if (!drawChart(tmp, tbl, t)) return;
        tpl = document.createElement('template');
        tpl.setAttribute('data-kind', 'ct');
        tpl.setAttribute('data-i', String(ci));
        tpl.setAttribute('data-v', t);
        tpl.innerHTML = tmp.innerHTML;
        store.appendChild(tpl); bytes += tmp.innerHTML.length;
      });
      ci++;
    });

    var boxReal = $$('.md-flow-box', content), boxClone = $$('.md-flow-box', clone);
    boxClone.forEach(function (boxC, k) {
      var wrap = boxC.querySelector('.mf-wrap');
      var src = boxReal[k] && boxReal[k].getAttribute('data-mf-src');
      if (!wrap || !src || !window.MDFlow) return;
      var on = wrap.querySelector('.mf-modes button.on');
      var curMode = on ? on.dataset.mode : (window.MDFlow.getMode() || 'auto');
      var art = wrap.querySelector('.mf-art');
      wrap.dataset.mdxI = String(fi);
      Object.keys(window.MDFlow.MODE_LABELS).forEach(function (m) {
        var html = '';
        if (m === curMode && art) {
          /* 当前结构 = 屏幕上「最后编辑状态」的 DOM，绝不重绘 */
          html = art.innerHTML;
        } else {
          /* 其余结构借用 render 的布局 + MDEdit 内容回放；preview:true 不写持久化 */
          var host = document.createElement('div');
          try { window.MDFlow.render(src, host, { mode: m, preview: true }); } catch (e) { }
          var a2 = host.querySelector('.mf-art');
          if (a2) html = a2.innerHTML;
        }
        if (!html.trim()) return;
        var tpl = document.createElement('template');
        tpl.setAttribute('data-kind', 'fm');
        tpl.setAttribute('data-i', String(fi));
        tpl.setAttribute('data-v', m);
        tpl.innerHTML = html;
        store.appendChild(tpl); bytes += html.length;
      });
      fi++;
    });
    return { store: store, charts: ci, flows: fi, bytes: bytes };
  }

  async function exportHTML() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    await inlineBlobImages();
    var css = $('style').textContent;
    /* 交互导出页：隐藏应用外壳与编辑器按钮，保留 .chart-types / .mf-modes
       （导出页运行时接管点击）；打印时菜单与工具条一并隐藏。 */
    /* 必须显式解掉 html 的锁定：主 CSS 里有两条面向应用外壳的全局规则
         · src/template.html:395  html,body{height:100%}
         · src/template.html:2123 html{overflow:hidden}   ← 欢迎屏锁死视口滚动用的
       导出页把主 CSS 全量带走，这两条会一起进来。只补 body 不够：
       实测 html{overflow:hidden} 时用户滚轮与 PageDown 全部失效
       （程序化 scrollTo 仍能滚，所以用 scrollTo 测会得到假阳性）。
       用 height:auto + overflow:auto 双解，并加 !important 盖住后出现的高优先级规则。 */
    /* 必须显式解掉 html 的锁定：主 CSS 里有两条面向应用外壳的全局规则
         · src/template.html:395  html,body{height:100%}
         · src/template.html:2123 html{overflow:hidden}   ← 欢迎屏锁死视口滚动用的
       导出页把主 CSS 全量带走，这两条会一起进来。只补 body 不够：
       实测 html{overflow:hidden} 时用户滚轮与 PageDown 全部失效
       （程序化 scrollTo 仍能滚，所以用 scrollTo 测会得到假阳性）。
       用 height:auto + overflow:auto 双解，并加 !important 盖住后出现的高优先级规则。 */
    var extra = 'html{overflow:auto!important;height:auto!important}' +
      'body{overflow:auto;height:auto}#app{display:block}' +
      '.toolbar,.sidebar,.statusbar,.tw-bar,.code-bar,#welcome,.mf-editor,.mf-edit-actions,.tf-block-bar,.ad-src,.ad-warn,.chart-tools,.sort-hint{display:none!important}' +
      '.reader-inner{max-width:980px;margin:0 auto;padding:24px 36px 60px}' +
      '.chart-box{display:none}.chart-box.show{display:block}' +
      '.mf-tools{display:flex!important}.mf-tools .mf-meta,.mf-tools>button,.mf-tools .mf-edit-actions{display:none!important}' +
      '.mf-modes{display:inline-flex!important}.chart-types{display:inline-flex!important}' +
      '.mdx-store{display:none!important}' +
      '@media print{#mdx-bar,.mdx-store,.mf-tools,.chart-types{display:none!important}body{padding-top:0!important}}';
    /* 柔光变量仍要固化（导出页切柔光只 toggle data-pm）；
       --tt-/--mf-/--syn- 也写进初始 <html style>，由运行时按风格切换。 */
    var pmCss = S.papermatte
      ? '--pm-sepia:' + S.pm.sepia + '%;--pm-sat:' + S.pm.sat +
        '%;--pm-con:' + S.pm.con + '%;--pm-bri:' + S.pm.bri +
        '%;--pm-noise:' + (S.pm.noise / 100).toFixed(3)
      : '';
    var rootCss = [docStyleCss(), pmCss].filter(Boolean).join(';');
    var clone = cloneForExport({ interactive: true });
    var pre = buildExportPresets(clone);
    var presets = {
      lang: effLang(), theme: S.theme, style: (S.docStyle || S.tableTheme),
      layout: S.layout, pm: !!S.papermatte, fs: S.fs, lh: S.lh || 'standard',
      charts: pre.charts, flows: pre.flows, bytes: pre.bytes,
      styleCss: buildStylePresets()
    };
    var runtime = ($('#mdx-runtime') || {}).textContent || '';
    var html = '<!DOCTYPE html><html lang="' + esc(effLang()) + '" data-mdx-export' +
      ' data-theme="' + S.theme + '" data-layout="' + S.layout +
      '" data-table-theme="' + S.tableTheme + '" data-doc-style="' + (S.docStyle || S.tableTheme) +
      '" data-flow-style="' + (S.flowStyle || 'classic') + '"' +
      (S.papermatte ? ' data-pm="on"' : '') +
      (rootCss ? ' style="' + esc(rootCss) + '"' : '') +
      '><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      esc(S.current.name) + '</title><style>' + css + '\n' + extra + '</style></head><body>' +
      '<div class="reader-inner"><article id="content" style="font-size:' + S.fs + 'px;--lh:' + (LH_VALUES[S.lh] || 1.78) + '">' +
      clone.innerHTML + '</article></div>' +
      '<script type="application/json" id="mdx-presets">' + JSON.stringify(presets) + '</script>' +
      pre.store.outerHTML +
      '<script>' + runtime + '</script>' +
      '</body></html>';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.current.name.replace(/\.\w+$/, '') + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出可交互 HTML（渲染菜单 / 图表 / 流程图均可在页面内调整）');
  }

  /* Word 副本专用清理：交互工具条一概不带走，未展开的图表盒直接丢弃
     （表格数据本身已在 .tw 里完整保留）。 */
  /* Word 表格默认按内容挤压列宽：列数一多（例如 12 个月宽表 13 列），
     中文表头就会被压成单字竖排。显式 colgroup 百分比列宽把版面锁在版心内，
     首列稍宽放行标签；9 列以上再降字号与内边距，保证每列至少容得下 2–3 个字。 */
  function prepWordTables(clone) {
    $$('table', clone).forEach(function (t) {
      var cols = 0;
      $$('tr', t).forEach(function (r) { cols = Math.max(cols, r.children.length); });
      if (!cols) return;
      var first = cols >= 9 ? 12 : (cols >= 6 ? 20 : 26);
      var rest = (100 - first) / Math.max(1, cols - 1);
      var cg = document.createElement('colgroup');
      for (var i = 0; i < cols; i++) {
        var c = document.createElement('col');
        c.setAttribute('width', (i === 0 ? first : rest).toFixed(2) + '%');
        cg.appendChild(c);
      }
      t.insertBefore(cg, t.firstChild);
      t.setAttribute('width', '100%');
      t.style.width = '100%'; t.style.tableLayout = 'fixed';
      if (cols >= 9) {
        t.style.fontSize = '8pt';
        $$('th,td', t).forEach(function (c) {
          c.style.fontSize = '8pt'; c.style.padding = '2pt 2pt';
          c.style.wordWrap = 'break-word';
        });
      }
    });
  }
  function cleanForWord(clone) {
    $$('.tw-bar,.chart-types,.chart-tools,.code-bar,.tf-block-bar,.mf-tools,.sort-hint,.ad-src,.ad-warn', clone)
      .forEach(function (n) { n.remove(); });
    $$('.chart-box', clone).forEach(function (b) {
      if (!b.classList.contains('show')) b.remove();
    });
    prepWordTables(clone);
    return clone;
  }

  /* Word 的 .doc（HTML 包装）既不认内联 SVG，也不认页面 CSS 变量。
     以原始节点为准把计算后的颜色 / 字号写成内联样式，再画到 canvas 转 PNG 替换，
     这样数据图表在 Word / WPS 里是实实在在的图片，而不是一片空白。 */
  async function rasterizeChartsForWord(clone) {
    var srcList = $$('.chart-box svg', content);
    var dstList = $$('.chart-box svg', clone);
    var PROPS = ['fill', 'stroke', 'stroke-width', 'font-size', 'font-family',
      'font-weight', 'color', 'opacity', 'text-anchor', 'stroke-dasharray'];
    for (var i = 0; i < dstList.length; i++) {
      var svg = dstList[i], src = srcList[i];
      if (!src) continue;
      try {
        var se = [src].concat($$('*', src)), de = [svg].concat($$('*', svg));
        de.forEach(function (el, j) {
          if (!se[j]) return;
          var cs = getComputedStyle(se[j]);
          PROPS.forEach(function (p) {
            var v = cs.getPropertyValue(p);
            if (v) el.style.setProperty(p, v);
          });
        });
        var r = src.getBoundingClientRect();
        var w = Math.max(1, Math.round(r.width || 800));
        var h = Math.max(1, Math.round(r.height || 320));
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', w); svg.setAttribute('height', h);
        if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        var data = new XMLSerializer().serializeToString(svg);
        var img = new Image();
        await new Promise(function (res) {
          img.onload = res; img.onerror = res;
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
        });
        if (!img.width) continue;
        /* 内在像素 = 显示像素，杜绝 Word 按 2× 原尺寸放大越页 */
        var fit = wordFit(w, h), cv = document.createElement('canvas');
        cv.width = fit.w; cv.height = fit.h;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        svg.parentNode.replaceChild(wordPic(cv.toDataURL('image/png'), w, h), svg);
      } catch (e) { /* 栅格化失败保留原 SVG，正文不受影响 */ }
    }
    return clone;
  }

  // 导出为 Word 文档（.doc，Word / WPS 可直接打开的 HTML 包装）。
  // 标题 / 表格 / 列表 / 代码 / 引用 / 图片 / 图表均可保留，表头与序号徽章配色跟随「表格配色」。
  async function exportWord() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    closeExportMenu();
    await inlineBlobImages();
    var clone = await rasterizeFlows(cloneForExport());
    clone = await rasterizeChartsForWord(clone);
    clone = cleanForWord(clone);
    var tt = tableTheme();
    var style = '@page{size:210mm 297mm;margin:20mm 18mm}'
      + 'body{font-family:"Microsoft YaHei","PingFang SC","SimSun",sans-serif;font-size:11pt;line-height:1.7;color:#1f2329}'
      + 'h1{font-size:20pt;margin:18pt 0 8pt;color:#111}h2{font-size:16pt;margin:14pt 0 6pt;color:#111}h3{font-size:13.5pt;margin:12pt 0 4pt;color:#111}h4,h5,h6{font-size:12pt;margin:10pt 0 4pt;color:#111}'
      + 'p{margin:6pt 0}'
      + 'table{border-collapse:collapse;margin:8pt 0;width:100%;table-layout:fixed}th,td{border:1px solid ' + tt.edge + ';padding:4pt 6pt;font-size:10.5pt;word-wrap:break-word;white-space:normal}th{background:' + tt.head + ';color:' + (tt.headFg || '#ffffff') + ';font-weight:bold}'
      + 'pre{background:#f6f7f9;border:1px solid #e3e6eb;padding:8pt;border-radius:4px;font-family:Consolas,Menlo,monospace;font-size:10pt;white-space:pre-wrap;word-break:break-all}'
      + 'blockquote{margin:8pt 0;padding:4pt 12pt;border-left:3px solid #c7ccd4;color:#5a6068}'
      + 'img{max-width:100%}code{font-family:Consolas,Menlo,monospace;background:#eef0f3;padding:1pt 3pt;border-radius:3px;font-size:10pt}'
      + 'a{color:#2563eb;text-decoration:underline}'
      + '.doc-card{border:1px solid ' + tt.edge + ';margin:10pt 0}'
      + '.card-head{border-bottom:1px solid ' + tt.edge + ';padding:5pt 8pt}'
      + '.card-id{display:inline-block;background:' + tt.head + ';color:' + (tt.headFg || '#ffffff') + ';padding:2pt 6pt;font-weight:bold;font-size:10pt}'
      + '.card-title{display:inline-block;font-weight:bold;margin-left:8pt}'
      + '.card-meta{float:right;font-size:9pt;color:#8a94a2}'
      + '.card-body{padding:6pt 8pt}'
      + '.chart-box{margin:8pt 0}.chart-sub,.legend{font-size:9pt;color:#6b7280}';
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(S.current.name) + '</title>'
      + '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->'
      + '<style>' + style + '</style></head><body>' + clone.innerHTML + '</body></html>';
    var blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.current.name.replace(/\.\w+$/, '') + '.doc';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出 Word 文档 (.doc)，可直接用 Word / WPS 打开');
  }

  // 导出为 PDF：复用浏览器打印（打印样式已隐藏工具条，并保留已展开的图表）
  function exportPDF() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    closeExportMenu();
    window.print();
  }
  // 导出 Markdown 源文件（保留原始 .md 文本）
  function exportMD() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    closeExportMenu();
    var raw = (S.current.cached != null) ? String(S.current.cached) : '';
    if (!raw && S.editing && editor) raw = editor.getValue();
    if (!raw) { toast('没有可导出的源文本'); return; }
    var blob = new Blob(['﻿' + raw], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.current.name.replace(/\.\w+$/, '') + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出 Markdown 源文件（.md）');
  }

  /* ---------- UI 事件 ---------- */
  function switchTab(tab) {
    S.tab = tab;
    $$('.side-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    /* CR-06：页签集合可能因编辑态增减，胶囊按新宽度重对齐 */
    if (typeof lpRefresh === 'function') requestAnimationFrame(lpRefresh);
    $('#sideFiles').classList.toggle('hidden', tab !== 'files');
    $('#sideOutline').classList.toggle('hidden', tab !== 'outline');
    $('#sideSections').classList.toggle('hidden', tab !== 'sections');
  }
  var SKIN_NAMES = { light: '浅色', dark: '深色', sepia: '护眼' };
  /* 浏览器标签页 / PWA 的 favicon 跟随「应用图标组 + 主题」切换。
     直接读 4 个内嵌 data URI 变量（不读 --brand-icon，避免 var() 间接引用取不到值）。
     iOS 主屏图标是「添加到主屏幕」时固化的静态资源，平台限制无法动态改。 */
  function syncFavicon() {
    var dark = S.theme === 'dark';
    var key = S.logo === 'minimal'
      ? (dark ? '--brand-min-dark' : '--brand-min-light')
      : (dark ? '--brand-cart-dark' : '--brand-cart-light');
    var v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    var m = v.match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) return;
    var links = $$('link[rel="icon"]');
    if (!links.length) {
      var l = document.createElement('link'); l.rel = 'icon';
      document.head.appendChild(l); links = [l];
    }
    links.forEach(function (x) { x.href = m[1]; });
  }
  /* 切换应用图标组：写入 html[data-logo]，CSS 自动按明/暗主题取对应图；
     同步 favicon、Electron 窗口 / 任务栏图标，并持久化偏好。 */
  function setLogo(v, opts) {
    opts = opts || {};
    if (!LOGO_NAMES[v]) v = 'cartoon';
    S.logo = v;
    document.documentElement.dataset.logo = v;
    save('logo', v);
    syncFavicon();
    var D = window.__MD_DESKTOP__;
    if (D && D.setTheme) D.setTheme(S.theme, v);
    syncSettingsUI();
    if (!opts.quiet) toast('应用图标：' + LOGO_NAMES[v] + (v === 'cartoon' ? '（默认）' : ''));
  }
  function setTheme(t, opts) {
    opts = opts || {};
    if (!SKIN_NAMES[t]) t = 'light';
    S.theme = t; document.documentElement.dataset.theme = t;
    /* 明暗变了，统一风格的浅底 / 色带 / 语法色都要按新主题重算 */
    applyDocStyle(S.docStyle || S.tableTheme, t);
    var sel = $('#themeSel'); if (sel) sel.value = t;   // 隐藏兼容桥保持同步
    $$('.skin-btn').forEach(function (b) {
      var on = b.dataset.theme === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var D = window.__MD_DESKTOP__;
    if (D && D.setTheme) D.setTheme(t, S.logo);
    save('theme', t); updateStatus(); syncFavicon();
    /* CR-08：主题的三个代理走 skin-btn 的 aria-pressed。setTheme 是所有主题变更的
       唯一汇聚点（顶栏三颗钮 / 兼容桥 themeSel / 设置面板 / 快捷键都走这里），
       但原先只写顶栏 active + aria-pressed，不通知专注侧边菜单 —— 实测切到深色后
       顶栏 skinDark 已 active，菜单里高亮却仍停在「浅色」。补一次回读闭环。 */
    if (typeof syncFocusRender === 'function') syncFocusRender();
    /* CR-06：主题换了 → 胶囊底色与择墨都要重算 */
    if (typeof lpRefresh === 'function') requestAnimationFrame(lpRefresh);
    if (!opts.quiet) toast('已切换：' + SKIN_NAMES[t] + '主题');
    if (S.current && !S.editing) rerender();
  }
  function setFont(v) {
    S.fs = Math.max(12, Math.min(22, v));
    content.style.setProperty('--fs', S.fs + 'px');
    save('fs', S.fs);
  }
  /* CR-2026-11-15-05b 行高四档：--lh 单一变量驱动全局/卡片/纸张三处行距，
     与字号一样持久化；顶栏下拉 / 设置面板 / 专注侧边菜单 / 导出页菜单共用。 */
  var LH_VALUES = { compact: 1.5, standard: 1.78, comfort: 2.0, loose: 2.3 };
  var LH_NAMES = { compact: '紧凑', standard: '标准', comfort: '舒适', loose: '宽松' };
  function setLineHeight(v, opts) {
    opts = opts || {};
    if (!LH_VALUES[v]) v = 'standard';
    S.lh = v;
    content.style.setProperty('--lh', LH_VALUES[v]);
    var sel = $('#lhSel'); if (sel) sel.value = v;
    save('lh', v);
    syncSettingsUI();
    if (!opts.quiet) toast('行高：' + LH_NAMES[v]);
  }
  /* ================================================================
     剪贴板：桌面版走 preload IPC（不受安全上下文限制），
     便携版走 navigator.clipboard；两者都失败时提示用浮层输入框 Ctrl+V。
     ================================================================ */
  function readClipboard() {
    var D = window.__MD_DESKTOP__;
    if (D && typeof D.readClipboard === 'function') {
      return D.readClipboard().then(function (r) {
        if (r && r.ok) return String(r.text || '');
        var e = new Error((r && r.error) || 'read failed');
        e.name = 'IpcError';
        throw e;
      });
    }
    if (navigator.clipboard && navigator.clipboard.readText) {
      /* 不要在这里 catch 后改写成通用错误：NotAllowedError / SecurityError
         分别对应「拒绝授权」和「非安全上下文」，提示语完全不同 */
      return navigator.clipboard.readText();
    }
    var ne = new Error('unsupported');
    ne.name = 'NotSupportedError';
    return Promise.reject(ne);
  }
  /* 把底层错误翻译成用户能照着做的下一步 */
  function npErrHint(err) {
    var n = (err && err.name) || '';
    if (n === 'IpcError') return t('桌面版读取剪贴板失败');
    if (n === 'NotSupportedError' || !(navigator.clipboard && navigator.clipboard.readText)) {
      return t('当前环境不支持自动读取剪贴板');
    }
    if (n === 'NotAllowedError') return t('剪贴板读取被拒绝');
    if (n === 'SecurityError' || window.isSecureContext === false) {
      return t('当前是本地文件模式，浏览器禁止直接读剪贴板');
    }
    return t('无法自动读取剪贴板（浏览器权限限制）');
  }
  /* file:// 下浏览器会弹「允许读取剪贴板」，但即使用户点了允许，
     readText() 依旧返回 NotAllowedError —— 这是 Chromium 对 file 协议的硬限制
     （实测：CDP 显式 grantPermissions 也照样拒绝）。
     所以便携版不要浪费用户一次授权动作，直接走「按 Ctrl+V」通道，
     这条路径不受权限限制，一次按键就能创建。 */
  function clipManualOnly() {
    var D = window.__MD_DESKTOP__;
    if (D && typeof D.readClipboard === 'function') return false;   // Electron 走 IPC，不受限
    return location.protocol === 'file:';
  }
  /* 判断内容像不像 Markdown（给用户一个「这是 AI 输出吗」的直观信号） */
  function mdScore(txt) {
    var s = { h: 0, list: 0, code: 0, table: 0, link: 0, quote: 0, bold: 0 };
    s.h = (txt.match(/^#{1,6}\s+\S/gm) || []).length;
    s.list = (txt.match(/^\s*([-*+]|\d+[.)])\s+\S/gm) || []).length;
    s.code = (txt.match(/^```/gm) || []).length;
    s.table = (txt.match(/^\s*\|.+\|\s*$/gm) || []).length;
    s.link = (txt.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    s.quote = (txt.match(/^\s*>\s?/gm) || []).length;
    s.bold = (txt.match(/(\*\*|__)[^*_]+(\*\*|__)/g) || []).length;
    var total = s.h * 3 + s.list * 2 + s.code * 4 + s.table * 3 + s.link * 2 + s.quote * 2 + s.bold;
    return { total: total, parts: s };
  }
  var _npTimer = null, _npHideTimer = null, _npLast = '', _npReq = null, _npDenied = false;
  function npState(html, ok) {
    var el = $('#npState'); if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('has', !!ok);
  }
  /* 按钮永远是「可点」的：有内容时是「粘贴并创建」，
     没内容时变成「读取剪贴板」——点一下就是一次手势授权重试，
     这是用户点了「允许」之后唯一可靠的自救入口，绝不能 disable。 */
  function npRender() {
    var btn = $('#npPaste'), has = !!_npLast.trim();
    if (!btn) return;
    btn.disabled = !!_npReq && !has;
    if (has) {
      btn.textContent = t('⚡ 粘贴并创建');
      btn.title = t('用剪贴板里的内容创建文档');
    } else if (clipManualOnly()) {
      /* file:// 下自动读不了，按钮不该骗用户去点一次「允许」 */
      btn.textContent = t('⌨️ 点这里按 Ctrl+V');
      btn.title = t('点一下把光标放进输入框，按 Ctrl+V 即可创建');
    } else {
      btn.textContent = t('⚡ 读取剪贴板');
      btn.title = t('点一下读取剪贴板；浏览器弹窗时选「允许」即可');
    }
  }
  function npSetText(txt) {
    _npLast = txt || '';
    var prev = $('#npPreview');
    if (!_npLast.trim()) {
      if (prev) { prev.hidden = true; prev.textContent = ''; }
      npRender();
      return;
    }
    var chars = _npLast.replace(/\s/g, '').length, lines = _npLast.split('\n').length;
    var sc = mdScore(_npLast);
    var feats = [];
    if (sc.parts.h) feats.push(t('标题 ') + sc.parts.h);
    if (sc.parts.list) feats.push(t('列表 ') + sc.parts.list);
    if (sc.parts.table) feats.push(t('表格行 ') + sc.parts.table);
    if (sc.parts.code) feats.push(t('代码块 ') + Math.floor(sc.parts.code / 2));
    if (sc.parts.link) feats.push(t('链接 ') + sc.parts.link);
    if (sc.parts.quote) feats.push(t('引用 ') + sc.parts.quote);
    npState('<b>' + t('检测到剪贴板内容') + '</b> · ' + chars.toLocaleString('zh-CN') + t(' 字 / ') + lines + t(' 行') +
      (feats.length ? '<br>' + t('Markdown 特征：') + esc(feats.join(' · ')) : '<br>' + t('未发现明显 Markdown 语法，仍可作为纯文本创建')),
      true);
    if (prev) {
      prev.hidden = false;
      prev.textContent = _npLast.slice(0, 420) + (_npLast.length > 420 ? '\n…' : '');
    }
    npRender();
  }
  /* 读一次剪贴板。同一时刻只跑一个请求，但绝不永久卡死：
     用 promise 身份判断，而不是一个需要手动复位的布尔量。 */
  function npRefresh() {
    if (_npReq) return _npReq;
    /* file:// 下自动读取注定失败，别让用户白点一次「允许」：
       直接把焦点放进输入框，Ctrl+V 就创建。 */
    if (clipManualOnly()) {
      npSetText('');
      npState(
        '<b>' + t('本地文件模式下需要手动粘贴') + '</b><br>' +
        t('光标已就位，按 Ctrl+V 立刻创建（只需一次按键）。'),
        false
      );
      var ta = $('#npPasteArea'); if (ta) ta.focus();
      npRender();
      return Promise.resolve(false);
    }
    npState(t('正在检测剪贴板…'));
    npRender();
    _npReq = readClipboard().then(function (txt) {
      return txt;
    }).then(function (txt) {
      _npReq = null;
      _npDenied = false;
      npSetText(txt);
      /* 授权成功后浮层可能已经被 mouseleave 收起了（用户去点浏览器气泡）。
         这时给一句 toast 指明下一步，否则用户会以为什么都没发生。 */
      var pop = $('#newPop');
      if (pop && pop.hasAttribute('hidden') && _npLast.trim()) {
        toast(t('已读取剪贴板 · 再悬停「创建 MD」即可一键粘贴'), 3000);
      }
      return true;
    }, function (err) {
      _npReq = null;
      _npDenied = true;
      npSetText('');
      npState(
        '<b>' + esc(npErrHint(err)) + '</b><br>' +
        t('点上面的按钮重试（浏览器询问时选「允许」），或直接在下方 Ctrl+V 粘贴。'),
        false
      );
      npRender();
      return false;
    });
    return _npReq;
  }
  function npPosition() {
    var pop = $('#newPop'), btn = $('#btnNew');
    if (!pop || !btn) return;
    var r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  }
  /* 每次悬停都重试：浮层已经开着也照样重读一次（只要还没拿到内容），
     这样「点了允许 → 再悬停回来」就能立刻看到结果，而不是永远停在失败态。 */
  function npOpen() {
    var pop = $('#newPop'); if (!pop) return;
    clearTimeout(_npHideTimer);
    var wasHidden = pop.hasAttribute('hidden');
    if (wasHidden) {
      pop.removeAttribute('hidden');
      npPosition();
      var ta0 = $('#npPasteArea'); if (ta0) ta0.value = '';
    }
    npRender();
    if (wasHidden || !_npLast.trim() || _npDenied) npRefresh();
  }
  function npClose(delay) {
    var pop = $('#newPop'); if (!pop) return;
    clearTimeout(_npHideTimer);
    _npHideTimer = setTimeout(function () {
      /* 读取还在飞行中就先别收：授权气泡弹出时鼠标必然会移开，
         这时候收起浮层，用户回来就以为「点了允许没反应」 */
      if (_npReq) { npClose(400); return; }
      pop.setAttribute('hidden', '');
    }, delay == null ? 180 : delay);
  }
  function npCreateFrom(text) {
    if (!text || !text.trim()) { toast(t('剪贴板没有内容，试试先复制一段 Markdown')); return; }
    npClose(0);
    createNewDoc(text, {});
  }
  /* 点「粘贴并创建」：没缓存就先现场读一次（点击本身是用户手势，
     浏览器此时会正常弹/记住授权），读到就直接创建，不用点第二次。 */
  function npPasteClick() {
    if (_npLast.trim()) { npCreateFrom(_npLast); return; }
    var pop = $('#newPop');
    if (pop && pop.hasAttribute('hidden')) npOpen();
    if (clipManualOnly()) {
      var ta = $('#npPasteArea'); if (ta) ta.focus();
      toast(t('按 Ctrl+V 粘贴，立刻创建文档'), 2600);
      return;
    }
    npRefresh().then(function (ok) {
      if (ok && _npLast.trim()) npCreateFrom(_npLast);
    });
  }
  function initNewDoc() {
    var wrap = $('#newWrap'), btn = $('#btnNew'), pop = $('#newPop');
    if (!btn || !pop) return;
    btn.onclick = function (e) {
      e.stopPropagation();
      /* 点按钮 = 直接新建空白文档；想用剪贴板就悬停 */
      createNewDoc('');
    };
    var wNew = $('#wNew');
    if (wNew) wNew.onclick = function () { createNewDoc(''); };
    /* 悬停展开浮层并探测剪贴板（进入 220ms 后才探测，避免鼠标划过时频繁读剪贴板） */
    if (wrap) {
      wrap.addEventListener('mouseenter', function () {
        clearTimeout(_npTimer);
        _npTimer = setTimeout(npOpen, 220);
      });
      wrap.addEventListener('mouseleave', function () {
        clearTimeout(_npTimer);
        var ta = $('#npPasteArea');
        if (ta && document.activeElement === ta) return;   // 正在粘贴时不收起
        npClose();
      });
    }
    pop.addEventListener('mouseenter', function () { clearTimeout(_npHideTimer); });
    pop.addEventListener('mouseleave', function () {
      var ta = $('#npPasteArea');
      if (ta && document.activeElement === ta) return;
      npClose();
    });
    /* 点击浮层内部不触发全局关闭 */
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    var pasteBtn = $('#npPaste');
    if (pasteBtn) pasteBtn.onclick = function () { npPasteClick(); };
    var blankBtn = $('#npBlank');
    if (blankBtn) blankBtn.onclick = function () { npClose(0); createNewDoc(''); };
    var ta = $('#npPasteArea');
    if (ta) {
      ta.addEventListener('focus', function () { clearTimeout(_npHideTimer); });
      ta.addEventListener('paste', function (e) {
        /* 让浏览器把内容粘进 textarea，再读值创建；同时兼容不支持粘贴事件的场景 */
        var dt = e.clipboardData || window.clipboardData;
        var txt = dt && dt.getData('text');
        if (txt) {
          e.preventDefault();
          ta.value = txt;
          npCreateFrom(txt);
        }
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          npCreateFrom(ta.value);
        }
      });
    }
    document.addEventListener('click', function (e) {
      if (pop.hasAttribute('hidden')) return;
      if (e.target.closest('#newWrap')) return;
      npClose(0);
    });
    window.addEventListener('resize', function () {
      if (!pop.hasAttribute('hidden')) npPosition();
    });
  }
  initNewDoc();

  /* ================================================================
     顶栏自适应布局
     ----------------------------------------------------------------
     旧方案是一堆 @media 断点逐个压 padding，压到极限仍会溢出，
     而且每加一个按钮就得再补一个断点。这里改成按「容器实际宽度」
     逐档降级，最后一档把次要按钮收进「更多」菜单，保证零溢出：

       full    → 全部文字标签 + 品牌主副标题
       compact → 收品牌副标题，标签保留
       icon    → 收所有文字标签，只留图标
       mini    → 次要按钮收进「更多」菜单，主操作始终在顶栏

     用 ResizeObserver 而不是 window.resize：侧栏折叠、专注模式、
     缩放都会改变可用宽度，只监听 window 会漏掉这些情况。
     ================================================================ */
  var TB_ORDERS = ['full', 'compact', 'icon', 'mini'];
  /* 没有 .tb-label 也没有短文本的控件，用这张表给菜单项起名 */
  var TB_MORE_NAMES = {
    layoutSel: '排版皮肤', btnFontDown: '缩小字号', btnFontUp: '放大字号',
    btnSettings: '系统设置', btnReload: '重新读取', btnSave: '保存', btnEdit: '编辑',
    btnOpenFile: '打开文件', btnOpenDir: '打开文件夹', btnRecent: '最近打开',
    btnChartAuto: '数据图表', btnFlowAll: '流程图', btnSide: '侧栏', btnFocus: '专注模式'
  };
  var tbMoreBuilt = false;
  /* 收纳优先级：数字越小越先收进「更多」菜单。
     分组语义（与顶栏从左到右的顺序一致）：
       1 = 文件操作（打开文件 / 打开文件夹 / 最近打开）
       2 = 渲染调节（排版皮肤 / 字号 ±）
       3 = 视图开关（数据图表 / 流程图）
       4 = 系统设置
     先收的是「一次性动作」，后收的是「阅读中随时会调」的旋钮。 */
  function tbRank(el) {
    var r = parseInt(el.dataset.tbRank, 10);
    return isNaN(r) ? 99 : r;
  }
  /* 可收纳控件按 rank 升序排好；同 rank 保持 DOM 顺序（稳定排序） */
  function tbCollapseOrder() {
    return $$('.toolbar [data-tb-opt]').map(function (el, i) {
      return { el: el, i: i, r: tbRank(el) };
    }).sort(function (a, b) {
      return a.r - b.r || a.i - b.i;
    }).map(function (o) { return o.el; });
  }
  /* 把被收纳控件的信息渲染成「更多」菜单项。
     菜单项不复用原按钮 DOM（避免事件 / id 冲突），
     点击时直接回调原按钮的 .click()，行为完全一致。 */
  function buildMoreMenu() {
    var menu = $('#tbMoreMenu'); if (!menu) return;
    menu.innerHTML = '';
    var items = $$('.toolbar [data-tb-opt]');
    /* 菜单顺序跟视觉顺序（DOM）走，不跟收纳优先级走 ——
       用户看到的菜单应当和顶栏长得一样，而不是按「谁先被收走」排。 */
    var prevRank = null;
    items.forEach(function (el) {
      /* 分组之间加分隔线：文件 / 渲染 / 视图 / 设置 各成一块 */
      var rk = tbRank(el);
      if (prevRank !== null && rk !== prevRank) {
        var sp = document.createElement('div'); sp.className = 'mm-sep'; menu.appendChild(sp);
      }
      prevRank = rk;
      var b = document.createElement('button');
      b.type = 'button';
      var ico = document.createElement('span'); ico.className = 'mm-ico';
      ico.textContent = el.dataset.tbIco || '·';
      var label = el.querySelector('.tb-label');
      /* 文字来源优先级：显式 data-tb-name > .tb-label > 命名表 > 按钮短文本。
         命名表要排在按钮文本之前：字号键的文本是「A−/A+」，作为菜单项不够明确。
         绝不用 title —— 它常是一长段说明，会把菜单撑到几屏宽。 */
      var txt = el.dataset.tbName || (label ? label.textContent.trim() : '') ||
        TB_MORE_NAMES[el.id] ||
        (el.tagName === 'BUTTON' && el.textContent.trim().length <= 8 ? el.textContent.trim() : '') ||
        el.id;
      /* 开关类（role=switch）在菜单里必须能看到当前状态，否则无从判断 */
      if (el.getAttribute('role') === 'switch') {
        txt += (el.getAttribute('aria-checked') === 'true' ? ' ✓ 开' : ' ○ 关');
      }
      /* <select> 把当前选项拼上，否则不知道现在选的是哪一个 */
      if (el.tagName === 'SELECT' && el.selectedOptions && el.selectedOptions[0]) {
        txt += ' · ' + el.selectedOptions[0].textContent.trim();
      }
      /* 开关类按钮要求文字即时反映状态 */
      var name = document.createElement('span');
      name.textContent = txt;
      b.appendChild(ico); b.appendChild(name);
      b.title = el.title || txt;
      b.onclick = function (e) {
        e.stopPropagation();
        closeMoreMenu();
        /* <select> 没有有意义的 .click()（浏览器不会可靠地展开原生下拉），
           改成「按当前值轮换」，这比点了没反应好。 */
        if (el.tagName === 'SELECT') {
          var opts = Array.prototype.slice.call(el.options);
          var ni = (el.selectedIndex + 1) % opts.length;
          el.selectedIndex = ni;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        el.click();
      };
      menu.appendChild(b);
    });
    /* 换肤三色卡也收进来（窄窗口最容易先被挤掉的就是它们） */
    var skins = $('.toolbar .skin-switch');
    if (skins) {
      var sp2 = document.createElement('div'); sp2.className = 'mm-sep'; menu.appendChild(sp2);
      var row = document.createElement('div'); row.className = 'mm-skins';
      var t = document.createElement('span');
      t.className = 'mm-ico'; t.textContent = '🎨';
      row.appendChild(t);
      ['light', 'dark', 'sepia'].forEach(function (th) {
        var src = $('#skin' + th.charAt(0).toUpperCase() + th.slice(1));
        if (!src) return;
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'skin-btn';
        c.dataset.theme = th;
        c.title = src.title || th;
        var inner = src.querySelector('.skin-logo');
        if (inner) c.appendChild(inner.cloneNode(true));
        c.onclick = function (e) { e.stopPropagation(); closeMoreMenu(); src.click(); };
        row.appendChild(c);
      });
      menu.appendChild(row);
    }
    tbMoreBuilt = true;
  }
  function closeMoreMenu() {
    var m = $('#tbMoreMenu'), b = $('#btnMore');
    if (m) m.setAttribute('hidden', '');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function openMoreMenu() {
    var m = $('#tbMoreMenu'), b = $('#btnMore');
    if (!m || !b) return;
    /* 每次都重建：开关状态、选中项、被收纳的控件集合都可能已经变了 */
    buildMoreMenu();
    /* 先显示再量尺寸，否则 offsetWidth 为 0，定位会算错 */
    m.style.visibility = 'hidden';
    m.removeAttribute('hidden');
    var r = b.getBoundingClientRect();
    var mw = m.offsetWidth || 216, mh = m.offsetHeight || 0;
    /* 优先右对齐到按钮右缘；左边界不足 8px 时改为左对齐 */
    var left = Math.min(r.right - mw, window.innerWidth - mw - 8);
    if (left < 8) left = 8;
    /* 上下也夹在视口内：底部空间不够就翻到按钮上方 */
    var top = r.bottom + 6;
    if (mh && top + mh > window.innerHeight - 8) {
      var up = r.top - mh - 6;
      top = up >= 8 ? up : Math.max(8, window.innerHeight - mh - 8);
    }
    m.style.top = top + 'px';
    m.style.left = left + 'px';
    m.style.visibility = '';
    b.setAttribute('aria-expanded', 'true');
  }
  /* 测量是否溢出。读 scrollWidth 前强制一次 reflow，
   否则刚改的 data-tb 还没进布局，会量到上一档的宽度。 */
  function tbOverflows(bar) {
    void bar.offsetWidth;
    return bar.scrollWidth - bar.clientWidth > 1;
  }
  /* 逐档收敛：每次都从「干净状态」重新量，避免上一档的收纳状态污染判断 */
  function tbPicker() {
    var bar = document.querySelector('.toolbar'); if (!bar) return;
    /* 清空上一次的收纳 / 紧缩标记，保证每一档的测量都是该档的真实宽度 */
    $$('.toolbar [data-tb-opt].tb-collapsed').forEach(function (e) { e.classList.remove('tb-collapsed'); });
    bar.classList.remove('tb-tight');
    /* 1) 从最宽档往窄找，第一个装得下的就是目标档 */
    var chosen = TB_ORDERS.length - 1;
    for (var i = 0; i < TB_ORDERS.length; i++) {
      bar.setAttribute('data-tb', TB_ORDERS[i]);
      if (!tbOverflows(bar)) { chosen = i; break; }
    }
    bar.setAttribute('data-tb', TB_ORDERS[chosen]);
    /* 2) 最窄档（mini）仍装不下：按收纳优先级把次要控件收进「更多」菜单。
         优先级低（rank 小）的先收走，渲染 / 开关类旋钮留到最后。 */
    if (chosen === TB_ORDERS.length - 1) {
      var order = tbCollapseOrder();
      var guard = 0;
      for (var k = 0; k < order.length && guard++ < 40; k++) {
        if (!tbOverflows(bar)) break;
        order[k].classList.add('tb-collapsed');
      }
      /* 3) 收完次要按钮还溢出：启用紧缩模式（隐藏品牌、压缩搜索框） */
      if (tbOverflows(bar)) bar.classList.add('tb-tight');
      /* 4) 还有余量就尽量多显示几个（窗口从窄拉宽时能回程）。
            按优先级从高到低往回放：先还回设置，再还视图开关、渲染调节，最后才是文件动作。 */
      var back = 0;
      while (back++ < 40) {
        var hid = order.filter(function (el) { return el.classList.contains('tb-collapsed'); });
        if (!hid.length) break;
        var last = hid[hid.length - 1];
        last.classList.remove('tb-collapsed');
        if (tbOverflows(bar)) { last.classList.add('tb-collapsed'); break; }
      }
    }
    /* 5) 极窄兜底：仍溢出就露出滚动条，交给滚轮 / 拖拽 / 方向键横向滚动 */
    bar.classList.toggle('tb-scroll', tbOverflows(bar));
  }
  /* 滚轮 → 横向滚动：鼠标竖着滚也能左右移动顶栏，不用去拖那条细滚动条 */
  function initToolbarScroll() {
    var bar = document.querySelector('.toolbar'); if (!bar) return;
    bar.addEventListener('wheel', function (e) {
      /* 只在真的溢出时接管，否则不影响页面正常纵向滚动 */
      if (!bar.classList.contains('tb-scroll')) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      var max = bar.scrollWidth - bar.clientWidth;
      if (max <= 1) return;
      var next = Math.max(0, Math.min(max, bar.scrollLeft + d));
      /* 到边界就把滚动交还给页面，避免"卡"在这里 */
      if (next === bar.scrollLeft) return;
      e.preventDefault();
      bar.scrollLeft = next;
    }, { passive: false });
    /* 按住拖动横向滚动 */
    var down = false, sx = 0, sl = 0;
    bar.addEventListener('pointerdown', function (e) {
      if (!bar.classList.contains('tb-scroll')) return;
      if (e.target.closest('input,textarea,select,button')) return;
      down = true; sx = e.clientX; sl = bar.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      bar.scrollLeft = sl - (e.clientX - sx);
    });
    window.addEventListener('pointerup', function () { down = false; });
    /* 键盘可达性：聚焦顶栏后可用左右方向键滚动 */
    bar.setAttribute('tabindex', '-1');
    bar.addEventListener('keydown', function (e) {
      if (!bar.classList.contains('tb-scroll')) return;
      if (e.key === 'ArrowLeft') { bar.scrollLeft -= 60; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { bar.scrollLeft += 60; e.preventDefault(); }
    });
  }
  function initToolbar() {
    var bar = document.querySelector('.toolbar'), more = $('#btnMore');
    if (!bar) return;
    if (!bar.hasAttribute('data-tb')) bar.setAttribute('data-tb', 'full');
    tbPicker();
    if (more) {
      more.onclick = function (e) {
        e.stopPropagation();
        var m = $('#tbMoreMenu');
        if (m && !m.hasAttribute('hidden')) closeMoreMenu();
        else openMoreMenu();
      };
      var wrap = $('#tbMoreWrap');
      if (wrap) wrap.addEventListener('mouseleave', function () { clearTimeout(window.__tbMoreT); });
    }
    document.addEventListener('click', function (e) {
      if (e.target.closest('#tbMoreWrap')) return;
      closeMoreMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMoreMenu();
    });
    /* 容器尺寸变化（含侧栏折叠、专注模式、窗口缩放）都重新分档 */
    var raf = 0;
    var schedule = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; tbPicker(); });
    };
    if (window.ResizeObserver) {
      new ResizeObserver(schedule).observe(bar);
    }
    window.addEventListener('resize', schedule);
    /* 字体加载完成后按钮宽度会变，补测一次 */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    setTimeout(schedule, 60);
    setTimeout(schedule, 400);
  }
  initToolbar();
  initToolbarScroll();

  $('#btnOpenFile').onclick = function () { $('#filePicker').click(); };
  var wOpenFile = $('#wOpenFile'); if (wOpenFile) wOpenFile.onclick = function () { $('#filePicker').click(); };
  $('#btnOpenDir').onclick = function () { $('#dirPicker').click(); };
  var wOpenDir = $('#wOpenDir'); if (wOpenDir) wOpenDir.onclick = function () { $('#dirPicker').click(); };
  $('#filePicker').onchange = function (e) { if (e.target.files.length) loadFileList(e.target.files); e.target.value = ''; };
  $('#dirPicker').onchange = function (e) { if (e.target.files.length) loadFileList(e.target.files); e.target.value = ''; };
  /* 标签栏：点击切换、点 ✕ 关闭（中键关闭留给后续） */
  var tabbarEl = $('#tabbar');
  if (tabbarEl) tabbarEl.addEventListener('click', function (e) {
    var x = e.target.closest('.tab-x');
    if (x) { e.stopPropagation(); closeTab(x.getAttribute('data-close')); return; }
    var t = e.target.closest('.tab');
    if (t) { var tab = findTab(t.getAttribute('data-key')); if (tab) activateTab(tab, { pushRecent: false }); }
  });
  /* 中键点击标签 = 关闭 */
  if (tabbarEl) tabbarEl.addEventListener('auxclick', function (e) {
    if (e.button !== 1) return;
    var t = e.target.closest('.tab'); if (t) { e.preventDefault(); closeTab(t.getAttribute('data-key')); }
  });
  /* ---- CR-07 右键批量关闭菜单 ---- */
  if (tabbarEl) tabbarEl.addEventListener('contextmenu', function (e) {
    /* 只在标签栏内接管右键，正文区保持浏览器原生菜单（复制 / 查词不受影响） */
    e.preventDefault();
    var tb = e.target.closest('.tab');
    tabMenuOpen(tb ? tb.getAttribute('data-key') : null, e.clientX, e.clientY, tb);
  });
  /* 键盘唤出：Shift+F10 / ContextMenu 键，在标签中心弹出 */
  if (tabbarEl) tabbarEl.addEventListener('keydown', function (e) {
    var tb = e.target.closest && e.target.closest('.tab');
    if (!tb) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      var r = tb.getBoundingClientRect();
      tabMenuOpen(tb.getAttribute('data-key'), r.left + 8, r.bottom, tb);
      return;
    }
    /* 左右方向键在标签间移动焦点（tablist 惯例），Enter/Space 激活 */
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var list = $$('#tabbar .tab'), i = list.indexOf(tb);
      var nx = list[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (nx) { e.preventDefault(); nx.focus(); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      var tab = findTab(tb.getAttribute('data-key'));
      if (tab) activateTab(tab, { pushRecent: false });
    }
  });
  var tabMenuEl = $('#tabMenu');
  if (tabMenuEl) {
    tabMenuEl.addEventListener('click', function (e) {
      var b = e.target.closest('.tm-item');
      if (!b || b.disabled) return;
      e.stopPropagation();
      tabMenuRun(b.getAttribute('data-act'));
    });
    tabMenuEl.addEventListener('keydown', function (e) {
      var items = $$('.tm-item:not([disabled])', tabMenuEl);
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        var d = e.key === 'ArrowDown' ? 1 : -1;
        items[(i + d + items.length) % items.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if (items.length) items[e.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); tabMenuClose(true);
      } else if (e.key === 'Tab') {
        e.preventDefault(); tabMenuClose(true);
      }
    });
  }
  /* 点别处 / 滚动 / 缩放 / Esc 都收起菜单 */
  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('#tabMenu')) return;
    tabMenuClose();
  }, true);
  window.addEventListener('blur', function () { tabMenuClose(); });
  window.addEventListener('resize', function () { tabMenuClose(); });
  if (reader) reader.addEventListener('scroll', function () { tabMenuClose(); }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = $('#tabMenu');
    if (m && !m.hasAttribute('hidden')) { e.preventDefault(); e.stopPropagation(); tabMenuClose(true); }
  }, true);
  /* 键盘：Ctrl/⌘+W 关闭当前标签（桌面端可拦截；网页预览环境浏览器可能仍关页，故仅桌面启用） */
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
      if (window.__MD_DESKTOP__ && S.activeKey) { e.preventDefault(); closeTab(S.activeKey); }
    }
  });
  $('#btnReload').onclick = function () {
    var tab = S.activeKey && findTab(S.activeKey);
    if (!tab) return toast('还没有打开文件');
    tab.md = null; tab.item.cached = null;
    openFile(tab.item).then(function () { toast('已刷新'); });
  };
  $('#btnSide').onclick = function () { $('#sidebar').classList.toggle('collapsed'); };
  /* 顶栏 logo：返回首页（欢迎屏）。只做显隐切换，不重跑 boot / 不复原文档，
     避免点击 logo 变成「重新初始化」的空白闪烁。 */
  function goHome() {
    if (S.editing) { try { setEditing(false); } catch (e) {} }   // 退出编辑态，别让编辑器残留在首页后
    enterWelcomeView();
    var ed = $('#editor'), eb = $('#editorBar');
    if (ed) ed.classList.add('hidden');
    if (eb) eb.classList.add('hidden');
    $('#sidebar') && $('#sidebar').classList.remove('collapsed');
    updateStatus();
  }
  var brandHome = document.getElementById('brandHome');
  if (brandHome) {
    brandHome.onclick = goHome;
    brandHome.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); goHome(); }
    });
  }
  $('#btnFontUp').onclick = function () { setFont(S.fs + 1); };
  $('#btnFontDown').onclick = function () { setFont(S.fs - 1); };
  $('#themeSel').onchange = function (e) { setTheme(e.target.value, { quiet: true }); };
  $$('.skin-btn').forEach(function (b) {
    b.onclick = function () { setTheme(b.dataset.theme); };
  });
  /* ---------- 数据图表 / 流程图 总开关（顶栏 + 系统设置双向同步） ---------- */
  /* 同步所有承载同一状态的控件：顶栏开关、设置面板开关 */
  function syncToggles() {
    var pair = [['#btnChartAuto', S.chartAuto], ['#setChart', S.chartAuto],
                ['#btnFlowAll', S.flowAuto], ['#setFlow', S.flowAuto],
                ['#btnPaperMatte', S.papermatte], ['#setPm', S.papermatte]];
    pair.forEach(function (p) {
      var el = $(p[0]); if (el) el.setAttribute('aria-checked', p[1] ? 'true' : 'false');
    });
    /* CR-08：三个总开关（柔光 / 数据图表 / 流程图）是所有状态变更的汇聚点，
       但它们原先只写顶栏 aria-checked，不通知专注侧边菜单 —— 从顶栏或设置面板
       切开关时，菜单里对应图标的高亮会滞后（实测 aria-checked=true 而 .on=false）。
       在这里补一次回读，保证「单一数据源、两套 UI 不打架」的原设计口径真正闭环。 */
    if (typeof syncFocusRender === 'function') syncFocusRender();
  }
  function updateFlowButton() {
    var b = $('#btnFlowAll'); if (!b) return;
    b.setAttribute('aria-checked', S.flowAuto ? 'true' : 'false');
    b.title = S.flowAuto
      ? '流程图开关：已开启，打开文档自动把文本流程图转为图形（点击关闭并还原源码）'
      : '流程图开关：开启后，打开的所有文档自动把文本流程图转为图形';
  }
  /* ================================================================
     云晰柔光（PaperMatte）
     ----------------------------------------------------------------
     与主题（light/dark/sepia）和排版（card/paper）都正交，是独立一层。
     参数写到 html 的 CSS 变量上，样式见 template.html「云晰柔光」段。
     ================================================================ */
  var PM_PRESET = { sepia: 12, sat: 78, con: 89, bri: 97, noise: 2.8 };
  function pmClamp(k, v) {
    var lim = { sepia: [0, 25], sat: [50, 110], con: [75, 105], bri: [85, 105], noise: [0, 6] };
    var r = lim[k] || [0, 100];
    return Math.max(r[0], Math.min(r[1], v));
  }
  /* 应用参数到 CSS 变量 + 同步面板控件显示 */
  function applyPm(quiet) {
    var p = S.pm, d = document.documentElement;
    d.style.setProperty('--pm-sepia', p.sepia + '%');
    d.style.setProperty('--pm-sat', p.sat + '%');
    d.style.setProperty('--pm-con', p.con + '%');
    d.style.setProperty('--pm-bri', p.bri + '%');
    d.style.setProperty('--pm-noise', (p.noise / 100).toFixed(3));
    var map = [['#pmSepia', p.sepia, '#pmOSepia', p.sepia + '%'],
               ['#pmSat', p.sat, '#pmOSat', p.sat + '%'],
               ['#pmCon', p.con, '#pmOCon', p.con + '%'],
               ['#pmBri', p.bri, '#pmOBri', p.bri + '%'],
               ['#pmNoise', p.noise, '#pmONoise', (p.noise / 100).toFixed(3)]];
    map.forEach(function (m) {
      var el = $(m[0]); if (el && document.activeElement !== el) el.value = m[1];
      var o = $(m[2]); if (o) o.textContent = m[3];
    });
    var hint = $('#pmHint');
    if (hint) {
      var w = [];
      if (p.con > 95) w.push('contrast 偏高，柔光感正在消失');
      if (p.noise > 4) w.push('颗粒过重，文字会发糊');
      if (p.sat > 90) w.push('饱和度过高，色彩会刺眼');
      if (p.sepia > 18) w.push('sepia 过量，偏黄像旧纸');
      hint.textContent = w.length ? w.join('；') : 'contrast ≤95% 且颗粒 ≤4%，仍在柔光区间。';
      hint.classList.toggle('warn', w.length > 0);
    }
  }
  /* 开关柔光：只切 data-pm，不碰主题与排版 */
  function setPaperMatte(on, opts) {
    opts = opts || {};
    S.papermatte = !!on;
    if (S.papermatte) document.documentElement.setAttribute('data-pm', 'on');
    else document.documentElement.removeAttribute('data-pm');
    save('papermatte', S.papermatte ? '1' : '0');
    syncToggles();
    if (!opts.quiet) toast(S.papermatte ? '已开启：云晰柔光' : '已关闭柔光，回到清晰模式');
  }
  function savePm() { save('pm', JSON.stringify(S.pm)); }
  function openPmPop() {
    var pop = $('#pmPop'), btn = $('#btnPaperMatte');
    if (!pop || !btn) return;
    applyPm();
    pop.removeAttribute('hidden');
    /* 对齐到按钮下方；越界则贴边，避免窄窗口弹出屏幕 */
    var r = btn.getBoundingClientRect();
    var w = pop.offsetWidth || 272, h = pop.offsetHeight || 300;
    var left = Math.min(r.left, window.innerWidth - w - 10);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
    pop.style.left = Math.max(10, left) + 'px';
    pop.style.top = top + 'px';
  }
  function closePmPop() { var p = $('#pmPop'); if (p) p.setAttribute('hidden', ''); }

  /* 数据图表开关：持久化偏好；有当前文档时立即生效 */
  function setChartAuto(v, opts) {
    opts = opts || {};
    S.chartAuto = !!v;
    save('chartAuto', S.chartAuto ? '1' : '0');
    syncToggles();
    if (opts.apply === false) return;
    if (!S.current) return;
    if (S.chartAuto) expandAllCharts(); else collapseAllCharts();
  }
  /* 默认图表风格：持久化偏好；修改后立即把当前文档已展开的图表统一重绘，
     让「设置 → 看到效果」一步到位，之后新打开/新展开的图表也按此风格 */
  function setChartType(v, opts) {
    opts = opts || {};
    if (CHART_TYPES.indexOf(v) < 0) v = 'auto';
    S.chartType = v;
    save('chartType', v);
    if (opts.apply === false) return;
    var n = 0;
    $$('.chart-box.show', content).forEach(function (box) {
      var tw = box.closest('.tw'), tbl = tw && tw.querySelector('table');
      if (tbl && drawChart(box, tbl, v)) n++;
    });
    syncSettingsUI();
    if (!opts.quiet) {
      toast(n ? '默认图表风格：' + CHART_LABELS[v] + ' · 已更新 ' + n + ' 张图表'
              : '默认图表风格：' + CHART_LABELS[v] + ' · 展开图表时生效');
    }
  }
  /* 流程图开关：持久化偏好；有当前文档时立即转换 / 还原 */
  function setFlowAuto(v, opts) {
    opts = opts || {};
    S.flowAuto = !!v;
    save('flowAuto', S.flowAuto ? '1' : '0');
    syncToggles(); updateFlowButton();
    if (opts.apply === false) return;
    var TF = window.MDTextFlow;
    if (!TF) return;
    if (!S.current) { if (!opts.quiet) toast(S.flowAuto ? '流程图已开启 · 打开文档将自动转换' : '流程图已关闭'); return; }
    if (S.flowAuto) {
      var n = TF.convertAll(content, S.flowCfg || TF.DEFAULT);
      S.flowConverted = !!n;
      if (!opts.quiet) toast(n ? '流程图已开启 · 已转换 ' + n + ' 个' : '流程图已开启 · 本文档没有可识别的文本流程图');
    } else {
      TF.restoreAll(content);
      S.flowConverted = false;
      if (!opts.quiet) toast('流程图已关闭 · 已还原源码');
    }
    updateFlowButton();
  }
  $('#btnFlowAll').onclick = function () { setFlowAuto(!S.flowAuto); };
  var btnChartAuto = $('#btnChartAuto');
  if (btnChartAuto) btnChartAuto.onclick = function () { setChartAuto(!S.chartAuto); };

  /* ---------- 云晰柔光：一个控件两个动作 ----------
     点开关本体（track / knob）= 切换柔光；
     点图标或文字 = 打开参数面板。
     这样顶栏只占一个位置，却同时提供「开」和「调」两个入口。 */
  (function bindPaperMatte() {
    var btn = $('#btnPaperMatte');
    if (btn) {
      btn.onclick = function (e) {
        var onSwitch = e.target.closest('.sw-track');
        if (onSwitch) { setPaperMatte(!S.papermatte); return; }
        /* 点文字时若柔光还没开，顺手开启——用户点「柔光」显然是想用柔光 */
        if (!S.papermatte) setPaperMatte(true, { quiet: true });
        var pop = $('#pmPop');
        if (pop && !pop.hasAttribute('hidden')) closePmPop(); else openPmPop();
      };
    }
    /* 设置面板里的开关：只切状态，不开面板 */
    var sp = $('#setPm');
    if (sp) sp.onclick = function () { setPaperMatte(!S.papermatte); syncSettingsUI(); };

    /* 参数滑杆 */
    [['#pmSepia', 'sepia'], ['#pmSat', 'sat'], ['#pmCon', 'con'],
     ['#pmBri', 'bri'], ['#pmNoise', 'noise']].forEach(function (pair) {
      var el = $(pair[0]); if (!el) return;
      el.addEventListener('input', function () {
        S.pm[pair[1]] = pmClamp(pair[1], parseFloat(el.value));
        applyPm();
        savePm();
        /* 拖参数视为想用柔光，自动开启，避免「拖了没反应」 */
        if (!S.papermatte) setPaperMatte(true, { quiet: true });
      });
    });
    var rs = $('#pmReset');
    if (rs) rs.onclick = function () {
      S.pm = { sepia: PM_PRESET.sepia, sat: PM_PRESET.sat, con: PM_PRESET.con,
               bri: PM_PRESET.bri, noise: PM_PRESET.noise };
      applyPm(); savePm(); toast('柔光参数已恢复推荐值');
    };
    var cl = $('#pmClose');
    if (cl) cl.onclick = closePmPop;
    /* 点面板外部 / Esc 关闭 */
    document.addEventListener('mousedown', function (e) {
      var pop = $('#pmPop');
      if (!pop || pop.hasAttribute('hidden')) return;
      if (pop.contains(e.target) || e.target.closest('#btnPaperMatte')) return;
      closePmPop();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pop = $('#pmPop');
      if (pop && !pop.hasAttribute('hidden')) { e.stopPropagation(); closePmPop(); }
    }, true);
  })();

  /* 流程图风格：只写 html[data-flow-style]，SVG 内的 var(--mf-*) 会即时换肤。
     刻意不重绘 DOM —— 数据图表的展开状态、滚动位置、编辑态全部保持不变；
     导出时 inlineVars() 把当前风格的真实颜色固化，Word / HTML / 打印一致。 */
  function setFlowStyle(v, opts) {
    opts = opts || {};
    if (FLOW_STYLES.indexOf(v) < 0) v = 'classic';
    S.flowStyle = v;
    save('flowStyle', v);
    document.documentElement.dataset.flowStyle = v;
    /* classic = 跟随文档统一风格（重新注入 --mf-*）；其余皮肤 = 显式覆盖，
       清掉内联让 html[data-flow-style] 的 CSS 生效，避免内联把用户选择盖掉。 */
    applyDocStyle(S.docStyle || S.tableTheme, S.theme);
    syncSettingsUI();
    if (!opts.quiet) toast('流程图风格：' + FLOW_STYLE_NAMES[v]);
  }

  /* 流程图结构：与风格正交的另一条轴。
     风格只换配色（改 CSS 变量即可，不必重绘）；结构改的是几何，
     必须重绘 SVG —— 所以这里走 rerender()，并与 flowAuto 状态联动：
     关闭时若有已转换的文本流程图，先临时打开再重绘，否则用户改了结构看不到任何变化。 */
  function setFlowMode(v, opts) {
    opts = opts || {};
    if (FLOW_MODES.indexOf(v) < 0) v = 'auto';
    S.flowMode = v;
    save('flowMode', v);
    if (window.MDFlow && window.MDFlow.setMode) window.MDFlow.setMode(v);
    syncSettingsUI();

    if (S.current && !opts.noRedraw) {
      /* 文本流程图已转换过的话，重绘后需要重新转换一遍 */
      var hadFlow = !!S.flowConverted, wasAuto = S.flowAuto;
      rerenderThenFlow(hadFlow, wasAuto);
    }
    /* 全局 MODE 只作为「新图默认」：已单独选过结构的图由 savedMode(src) 优先，不受影响 */
    if (!opts.quiet) toast('流程图默认结构：' + FLOW_MODE_NAMES[v] + ' · 单图已单独选过的保持不变');
  }
  /* rerender 是同步的，但文本流程图转换在 rerender 内部完成；
     这里用微任务等一帧，确保新 SVG 已挂上后再补转换 */
  function rerenderThenFlow(hadFlow, wasAuto) {
    rerender();
    if (!hadFlow || wasAuto) return;
    Promise.resolve().then(function () {
      var TF = window.MDTextFlow;
      if (TF && S.current) {
        try { TF.convertAll(content, S.flowCfg || TF.DEFAULT); } catch (e) { }
      }
    });
  }
  var SET_DEFAULT = { theme: 'light', fs: 15, lh: 'standard', layout: 'card', tableTheme: 'mono',
                      chartAuto: false, chartType: 'auto', flowAuto: false, logo: 'cartoon',
                      flowStyle: 'classic', flowMode: 'auto', lang: BUILD_DEFAULT_LANG, papermatte: false };
  function syncSettingsUI() {
    var lg = $('#setLang'); if (lg) lg.value = S.lang;
    $$('#setLayout button').forEach(function (b) { b.classList.toggle('on', b.dataset.layout === S.layout); });
    $$('#setTheme button').forEach(function (b) { b.classList.toggle('on', b.dataset.theme === S.theme); });
    $$('#setTT button').forEach(function (b) { b.classList.toggle('on', b.dataset.tt === S.tableTheme); });
    $$('#setLogo button').forEach(function (b) { b.classList.toggle('on', b.dataset.logo === S.logo); });
    $$('#setCT button').forEach(function (b) { b.classList.toggle('on', b.dataset.ct === S.chartType); });
    $$('#setFlowStyle button').forEach(function (b) { b.classList.toggle('on', b.dataset.fs === (S.flowStyle || 'classic')); });
    $$('#setFlowMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.fm === (S.flowMode || 'auto')); });
    var r = $('#setFs'); if (r) r.value = S.fs;
    var fv = $('#setFsVal'); if (fv) fv.textContent = S.fs + ' px';
    $$('#setLH button').forEach(function (b) { b.classList.toggle('on', b.dataset.lh === (S.lh || 'standard')); });
    syncToggles();
    /* 设置面板改行高/排版时，专注侧边菜单的 .on 态也要即时回读 */
    if (typeof syncFocusRender === 'function') syncFocusRender();
  }
  function openSettings() {
    var m = $('#setMask'); if (!m) return;
    syncSettingsUI(); m.removeAttribute('hidden');
    /* CR-06：面板显示后才有真实几何，补量一次胶囊（不播动画，避免开面板就飞一下） */
    if (typeof lpRefresh === 'function') requestAnimationFrame(lpRefresh);
  }
  function closeSettings() { var m = $('#setMask'); if (m) m.setAttribute('hidden', ''); }
  (function bindSettings() {
    var btn = $('#btnSettings'); if (btn) btn.onclick = openSettings;
    var mask = $('#setMask'); if (!mask) return;
    var c1 = $('#setClose'); if (c1) c1.onclick = closeSettings;
    var ok = $('#setOk'); if (ok) ok.onclick = closeSettings;
    mask.addEventListener('click', function (e) { if (e.target === mask) closeSettings(); });
    /* 捕获阶段拦截 Esc，避免同时触发专注模式退出 */
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || mask.hasAttribute('hidden')) return;
      e.stopPropagation(); closeSettings();
    }, true);
    function bindSeg(sel, attr, fn) {
      var g = $(sel); if (!g) return;
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button[' + attr + ']'); if (!b) return;
        fn(b.getAttribute(attr));
      });
    }
    bindSeg('#setLayout', 'data-layout', function (v) {
      applyLayout(v); if (S.current) rerender(); syncSettingsUI();
    });
    bindSeg('#setTheme', 'data-theme', function (v) { setTheme(v); syncSettingsUI(); });
    bindSeg('#setTT', 'data-tt', function (v) { applyTableTheme(v); syncSettingsUI(); });
    bindSeg('#setCT', 'data-ct', function (v) { setChartType(v); });
    bindSeg('#setLogo', 'data-logo', function (v) { setLogo(v); });
    bindSeg('#setFlowStyle', 'data-fs', function (v) { setFlowStyle(v); });
    bindSeg('#setFlowMode', 'data-fm', function (v) { setFlowMode(v); });
    var lg = $('#setLang'); if (lg) lg.onchange = function () { setLang(this.value); };
    var fs = $('#setFs');
    if (fs) fs.oninput = function () { setFont(+this.value); syncSettingsUI(); };
    bindSeg('#setLH', 'data-lh', function (v) { setLineHeight(v); });
    var sc = $('#setChart'); if (sc) sc.onclick = function () { setChartAuto(!S.chartAuto); syncSettingsUI(); };
    var sf = $('#setFlow'); if (sf) sf.onclick = function () { setFlowAuto(!S.flowAuto); syncSettingsUI(); };
    var rs = $('#setReset');
    if (rs) rs.onclick = function () {
      setTheme(SET_DEFAULT.theme, { quiet: true });
      setFont(SET_DEFAULT.fs);
      setLineHeight(SET_DEFAULT.lh, { quiet: true });
      applyLayout(SET_DEFAULT.layout, { silent: true });
      applyTableTheme(SET_DEFAULT.tableTheme, { silent: true });
      save('layout', SET_DEFAULT.layout); save('tableTheme', SET_DEFAULT.tableTheme);
      setChartAuto(SET_DEFAULT.chartAuto);
      setChartType(SET_DEFAULT.chartType, { quiet: true });
      setFlowAuto(SET_DEFAULT.flowAuto, { quiet: true });
      setFlowStyle(SET_DEFAULT.flowStyle, { quiet: true });
      setFlowMode(SET_DEFAULT.flowMode, { quiet: true, noRedraw: true });
      setLogo(SET_DEFAULT.logo, { quiet: true });
      setLang(SET_DEFAULT.lang, { quiet: true });
      /* 柔光也归位：默认关闭、参数回推荐值 */
      S.pm = { sepia: PM_PRESET.sepia, sat: PM_PRESET.sat, con: PM_PRESET.con,
               bri: PM_PRESET.bri, noise: PM_PRESET.noise };
      applyPm(); savePm();
      setPaperMatte(!!SET_DEFAULT.papermatte, { quiet: true });
      syncSettingsUI();
      if (S.current) rerender();
      toast('已恢复默认偏好');
    };
  })();
  $('#layoutSel').onchange = function (e) { applyLayout(e.target.value); if (S.current) rerender(); };
  $('#lhSel').onchange = function (e) { setLineHeight(e.target.value); };
  $('#btnRecent').onclick = function () {
    if ($('#recentWrap').classList.contains('hidden')) openRecentPanel(); else closeRecentPanel();
  };
  $('#recentClose').onclick = closeRecentPanel;
  $('#recentMask').onclick = closeRecentPanel;
  $('#recentFilter').oninput = recentRender;
  $('#recentClear').onclick = function () {
    if (!S.recent.length) return;
    if (!window.confirm(t('清空全部 ' + S.recent.length + ' 条最近记录？（不会删除任何文件）'))) return;
    S.recent = []; saveRecent(); recentRender(); toast('已清空最近记录');
  };
  $('#recentList').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      var dIdx = +del.dataset.del;
      var view = S.recentView || [];
      if (view[dIdx]) { S.recent = S.recent.filter(function (r) { return recKey(r) !== recKey(view[dIdx]); }); saveRecent(); recentRender(); }
      return;
    }
    var it = e.target.closest('.rc-item');
    if (!it) return;
    var idx = +it.dataset.i;
    var view2 = S.recentView || [];
    recentOpen(view2[idx]);
  });
  $('#btnEdit').onclick = function () { setEditing(!S.editing); };
  /* 供 applyI18nDOM 切语言时重刷编辑态文案（与 __wfRelabel 同机制） */
  window.__editRelabel = relabelEditUI;
  $('#btnSave').onclick = saveCurrent;
  /* 上/下节按「节」跳（CR-03）：节边界来自 groupSections，而不是 editBlock±1。
     一节之内有多块时，先跳到本节末尾再进下一节，符合「按节阅读」的直觉。 */
  function stepSection(d) {
    if (S.whole) { toast('当前为整篇编辑，点「块编辑」切回'); return; }
    var gs = groupSections();
    if (!gs.length) { toast('没有可切换的节'); return; }
    var cur = groupOfBlock(S.editBlock), idx = -1;
    if (cur) { for (var i = 0; i < gs.length; i++) if (gs[i].from === cur.from) { idx = i; break; } }
    var next = idx + d;
    if (next < 0) { toast('已经是第一节'); return; }
    if (next >= gs.length) { toast('已经是最后一节'); return; }
    loadGroup(gs[next]);
    buildBlockList();
  }
  $('#btnSecPrev').onclick = function () { stepSection(-1); };
  $('#btnSecNext').onclick = function () { stepSection(1); };
  $('#btnSecWhole').onclick = function () {
    if (!S.editing) return;
    if (!S.whole) {
      flushBlock();
      S.whole = true; S.editBlock = -1; S.group = null;
      editor.value = joinBlocks(S.fm, S.blocks, S.gaps);
      $('#editSecLabel').textContent = '全篇';
      $('#btnSecWhole').textContent = '块编辑';
      $$('#sideSections .sec-item').forEach(function (n) { n.classList.remove('active'); });
      /* 全篇编辑时上下同源，预览没意义 → 只藏面板，不动 bvOff 偏好（回到块编辑要还原） */
      document.documentElement.dataset.bv = 'off';
    } else {
      var m = splitBlocks(editor.value);
      S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps; S.whole = false;
      S.editBlock = S.blocks.length ? 0 : -1;
      S.group = S.editBlock >= 0 ? groupOfBlock(S.editBlock) : null;
      $('#btnSecWhole').textContent = t('全篇编辑');
      document.documentElement.dataset.bv = S.bvOff ? 'off' : 'on';
      if (S.editBlock >= 0) {
        /* 一律走 loadGroup（节数 > 1）或 loadBlock，两者都会完整写标签与预览 */
        var g0 = groupOfBlock(S.editBlock);
        if (g0 && g0.count > 1) loadGroup(g0, true);
        else loadBlock(S.editBlock, true);
      } else {
        $('#editSecLabel').textContent = t('全篇');
      }
      buildBlockList();
    }
  };
  $('#btnBlockView').onclick = function () {
    var on = !!S.bvOff;
    setBlockView(on);
    /* 全篇编辑下点预览：上下同源没意义，提示一句但不拦 */
    if (on && S.whole) toast('全篇编辑时下方预览与上方内容相同，仅供排版确认');
  };
  /* 侧栏两级：data-g="1" 是节（点了整节编辑，再点一次折叠/展开）；无 data-g 是节内块 */
  $('#sideSections').addEventListener('click', function (e) {
    var it = e.target.closest('.sec-item'); if (!it) return;
    var i = +it.dataset.i;
    if (it.dataset.g) {
      var same = S.group && S.group.from === i;
      S.groupOpen[i] = !S.groupOpen[i];
      if (!same) { loadGroup(groupOfBlock(i) || { from: i, to: i, count: 1, title: '' }); }
      else if (S.groupOpen[i]) loadGroup(S.group);
      buildBlockList();
      return;
    }
    loadBlock(i);
    buildBlockList();
  });
  /* 导出下拉菜单：Word / HTML / PDF / Markdown 四选一 */
  function closeExportMenu() { var m = $('#expMenu'); if (m) m.setAttribute('hidden', ''); }
  function toggleExportMenu(e) {
    var m = $('#expMenu'); if (!m) return;
    if (m.hasAttribute('hidden')) {
      /* 工具栏有 overflow:hidden，absolute 下拉会被裁剪；改用 fixed 按按钮位置定位 */
      var b = $('#btnExport');
      if (b) {
        var r = b.getBoundingClientRect();
        m.style.top = (r.bottom + 4) + 'px';
        m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        m.style.left = 'auto';
      }
      m.removeAttribute('hidden');
    } else {
      m.setAttribute('hidden', '');
    }
    if (e) e.stopPropagation();
  }
  window.addEventListener('resize', function () { closeExportMenu(); });
  $('#btnExport').onclick = function (e) { toggleExportMenu(e); };
  $('#expMenu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-fmt]'); if (!b) return;
    var f = b.dataset.fmt;
    if (f === 'word') exportWord();
    else if (f === 'html') exportHTML();
    else if (f === 'pdf') exportPDF();
    else if (f === 'md') exportMD();
    closeExportMenu();
  });
  document.addEventListener('click', function (e) {
    if ($('#expMenu') && !e.target.closest('.exp-wrap')) closeExportMenu();
  });
  $$('.side-tab').forEach(function (b) { b.onclick = function () { switchTab(b.dataset.tab); }; });
  $('#sideFiles').addEventListener('click', function (e) {
    var pick = e.target.closest('.side-pick');
    if (pick) { $(pick.dataset.kind === 'dir' ? '#dirPicker' : '#filePicker').click(); return; }
    var f = e.target.closest('.tree-folder');
    if (f) {
      var d = f.dataset.dir;
      if (S.collapsedDirs.has(d)) S.collapsedDirs.delete(d); else S.collapsedDirs.add(d);
      buildTree(); return;
    }
    var it = e.target.closest('.tree-item');
    if (it) openFile(S.files[+it.dataset.i]);
  });
  $('#sideOutline').addEventListener('click', function (e) {
    var it = e.target.closest('.outline-item'); if (!it) return;
    var el = document.getElementById(it.dataset.id); scrollInReader(el, 'smooth');
    $$('.outline-item').forEach(function (n) { n.classList.toggle('active', n === it); });
  });
  $('#fileFilter').oninput = buildTree;
  $('#findInput').oninput = function () { doFind(this.value.trim()); };
  $('#findInput').onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { this.value = ''; doFind(''); }
  };
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape' && focusApp.classList.contains('focus')) { e.preventDefault(); setFocus(false); return; }
    if (e.key === 'Escape' && !$('#recentWrap').classList.contains('hidden')) { closeRecentPanel(); return; }
    /* CR-2026-11-15-03：Ctrl+O 切换专注模式（再按一次退出）；
       原「打开文件」顺延为 Ctrl+Shift+O，避免与浏览器默认打开文件语义抢按键。 */
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      if (e.shiftKey) $('#filePicker').click();
      else setFocus(!focusApp.classList.contains('focus'));
    }
    else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); if (e.shiftKey) npOpen(); else createNewDoc(''); }
    else if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); $('#btnRecent').click(); }
    else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#btnSide').click(); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#findInput').focus(); $('#findInput').select(); }
    else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(); }
    else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); setEditing(!S.editing); }
    else if (e.altKey && e.key === 'ArrowUp' && S.editing && !S.whole) { e.preventDefault(); $('#btnSecPrev').click(); }
    else if (e.altKey && e.key === 'ArrowDown' && S.editing && !S.whole) { e.preventDefault(); $('#btnSecNext').click(); }
    else if (e.key === 'F5') { e.preventDefault(); $('#btnReload').click(); }
    else if (e.key === 'Escape') { $('#drop').classList.remove('show'); }
  });

  /* ================================================================
     排版皮肤：卡片（card，对应附件的 shadcn）/ 纸张（paper）
     两套都是完整皮肤：配色、圆角、描边、标题字体一起换
     ================================================================ */
  var LAYOUT_NAME = { card: '卡片皮肤', paper: '纸张皮肤', plain: '纯净排版' };
  var SKIN_TITLE = { card: '卡片', paper: '纸张', plain: '纯净' };

  function saveRawNodes() {
    if (S.rawNodes) return;
    S.rawNodes = Array.prototype.slice.call(content.childNodes);
    // 节点马上会被移入卡片，这里先脱离文档，避免残留
    S.rawNodes.forEach(function (n) { if (n.parentNode === content) content.removeChild(n); });
  }
  function restoreRawNodes() {
    if (!S.rawNodes) return;
    S.rawNodes.forEach(function (n) { content.appendChild(n); });
    S.rawNodes = null;
  }

  function sectionWordCount(nodes) {
    var n = 0;
    nodes.forEach(function (x) { n += (x.textContent || '').replace(/\s/g, '').length; });
    return n;
  }

  /* 把正文切成章节面板。
     分节依据：优先 h2（文书型文档通常只有一个 h1，按 h1 切会退化成一张大卡），
     没有 h2 时退回 h1，都没有就整篇一张卡。首个章节前的内容作为「导言」卡。 */
  function buildCards() {
    if (S.rawNodes) return;                 // 已分节，避免重复包装
    saveRawNodes();
    var nodes = (S.rawNodes || []).slice();

    // YAML 属性表始终置顶，不参与分节
    var fm = nodes.filter(function (n) { return n.nodeType === 1 && n.classList.contains('frontmatter'); });
    nodes = nodes.filter(function (n) { return fm.indexOf(n) < 0; });

    var h2 = nodes.filter(function (n) { return n.nodeType === 1 && n.tagName === 'H2'; }).length;
    var h1 = nodes.filter(function (n) { return n.nodeType === 1 && n.tagName === 'H1'; }).length;
    var tag = h2 >= 2 ? 'H2' : (h1 >= 1 ? 'H1' : (h2 ? 'H2' : ''));
    var groups = [], cur = null;

    function meaningful(ns) {
      return ns.some(function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
      });
    }

    if (!tag) {
      groups.push({ head: null, nodes: nodes });
    } else {
      nodes.forEach(function (n) {
        var isHead = n.nodeType === 1 && n.tagName === tag;
        if (isHead) {
          if (cur) groups.push(cur);
          cur = { head: n, nodes: [] };
        } else {
          if (!cur) cur = { head: null, nodes: [] };
          cur.nodes.push(n);
        }
      });
      if (cur) groups.push(cur);
    }

    var out = document.createDocumentFragment();
    fm.forEach(function (n) { out.appendChild(n); });

    var seq = 0;
    groups.forEach(function (g) {
      if (!g.head && !meaningful(g.nodes)) return;
      seq++;
      var card = document.createElement('section');
      card.className = 'doc-card' + (g.head ? '' : ' doc-card--lead');

      var head = document.createElement('div');
      head.className = 'card-head';

      var id = document.createElement('div');
      id.className = 'card-id';
      id.textContent = ('0' + seq).slice(-2);

      var title = document.createElement('div');
      title.className = 'card-title';
      if (g.head) {
        title.appendChild(g.head);            // 原 h1/h2 保留 id，锚点与大纲仍可用
      } else {
        title.textContent = tr('导言');
      }

      var meta = document.createElement('div');
      meta.className = 'card-meta';
      var wc = sectionWordCount(g.nodes);
      meta.textContent = wc ? (wc >= 1000 ? (wc / 1000).toFixed(1) + 'k' : wc) + (effLang() === 'en' ? ' words' : ' 字') : '';

      head.appendChild(id); head.appendChild(title); head.appendChild(meta);

      var body = document.createElement('div');
      body.className = 'card-body';
      g.nodes.forEach(function (n) { body.appendChild(n); });

      card.appendChild(head); card.appendChild(body);
      out.appendChild(card);
    });

    content.appendChild(out);
  }

  /* 去掉卡片包装，恢复原始平铺结构 */
  function unbuildCards() {
    if (!S.rawNodes) return;
    $$('.doc-card', content).forEach(function (c) { c.remove(); });
    restoreRawNodes();
  }

  function applyLayout(mode, opts) {
    opts = opts || {};
    S.layout = mode;
    document.documentElement.dataset.layout = mode;
    content.classList.toggle('paper-ruled', mode === 'paper');
    if (mode === 'card') buildCards();
    else unbuildCards();
    if (opts.silent !== true) save('layout', mode);
    var sel = $('#layoutSel'); if (sel) sel.value = mode;
    updateStatus();
    /* CR-08：排版的两个代理读 #layoutSel.value。applyLayout 是排版变更的唯一汇聚点，
       原先只回写 select 不通知菜单 —— 实测从兼容桥切到「纸张」后菜单仍高亮「卡片」。
       设置面板那条路因为额外走了 syncSettingsUI 才碰巧正确，不能依赖这种巧合。 */
    if (typeof syncFocusRender === 'function') syncFocusRender();
    if (!opts.keepFind) { S.findMarks = []; S.findIdx = -1; }
  }

  /* 主题/排版切换后重新走一次完整渲染（图表、Mermaid 需按新尺寸重绘） */
  async function rerender() {
    if (!S.current || S.editing) return;
    var tab = S.activeKey && findTab(S.activeKey);
    var md = (tab && tab.md != null) ? tab.md : (S.current.cached || '');
    var keepTop = reader.scrollTop;
    await render(md, S.current);
    reader.scrollTop = keepTop;
  }

  /* ================================================================
     最近打开：绝对路径 + 正文缓存（file:// 下 IndexedDB 不可用）
     ================================================================ */
  var RECENT_MAX = 30, CACHE_CHARS = 60000;

  function loadRecent() {
    try {
      var raw = JSON.parse(load('recent', '[]'));
      S.recent = Array.isArray(raw) ? raw.filter(function (r) { return r && r.name; }) : [];
    } catch (e) { S.recent = []; }
    updateRecentBadge();
  }
  function saveRecent() {
    // 超配额时逐步丢弃最旧记录的正文缓存，保住列表本身
    for (var attempt = 0; attempt < 4; attempt++) {
      try { localStorage.setItem('mdreader.recent', JSON.stringify(S.recent)); return true; }
      catch (e) {
        var dropped = false;
        for (var i = S.recent.length - 1; i >= 0; i--) {
          if (S.recent[i].cached) { S.recent[i].cached = ''; dropped = true; break; }
        }
        if (!dropped) {
          S.recent = S.recent.slice(0, Math.max(1, Math.floor(S.recent.length / 2)));
        }
      }
    }
    return false;
  }
  function recKey(r) { return (r.path || '') + '\u0000' + r.name; }

  // 顶栏「最近打开」按钮的记录数徽章：不点开面板也能看出有没有历史、有多少条
  function updateRecentBadge() {
    var b = $('#recentBadge'); if (!b) return;
    var n = (S.recent && S.recent.length) || 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
    var btn = $('#btnRecent');
    if (btn) btn.title = '最近打开（' + (n ? n + ' 条记录' : '暂无记录') + '，Ctrl+R）';
  }

  function recentTouch(item, text) {
    if (!item) return;
    var path = item.absPath || '';
    var rec = {
      path: path, name: item.name, dir: item.dir || '',
      ts: Date.now(), chars: (text || '').replace(/\s/g, '').length,
      cached: (text || '').slice(0, CACHE_CHARS), enc: item.enc || ''
    };
    var k = recKey(rec);
    S.recent = S.recent.filter(function (r) { return recKey(r) !== k; });
    S.recent.unshift(rec);
    if (S.recent.length > RECENT_MAX) S.recent.length = RECENT_MAX;
    saveRecent();
    updateRecentBadge();
  }
  function recentDrop(rec) {
    if (!rec) return;
    S.recent = S.recent.filter(function (r) { return recKey(r) !== recKey(rec); });
    saveRecent(); recentRender();
  }

  function ago(ts) {
    var d = Date.now() - ts, m = Math.floor(d / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var dd = Math.floor(h / 24);
    if (dd < 8) return dd + ' 天前';
    var t = new Date(ts);
    return (t.getMonth() + 1) + '月' + t.getDate() + '日';
  }

  function fileUrl(p) {
    var s = String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
    return 'file:///' + s.split('/').map(function (seg) {
      return /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg);
    }).join('/');
  }

  function recentRender() {
    updateRecentBadge();
    var box = $('#recentList'), q = ($('#recentFilter').value || '').trim().toLowerCase();
    var list = S.recent.filter(function (r) {
      return !q || (r.name + ' ' + (r.path || '')).toLowerCase().indexOf(q) >= 0;
    });
    S.recentView = list;   // 用数组索引做点击键，避免把含 \0 的 key 写进 HTML 属性
    $('#recentCount').textContent = S.recent.length ? S.recent.length + ' 条' : '';
    if (!list.length) {
      box.innerHTML = '<div class="rc-empty">' +
        (S.recent.length ? '没有匹配的记录' : '还没有打开过文档<br>打开任意 .md 后会自动记在这里') + '</div>';
      $('#recentFoot').textContent = '';
      return;
    }
    var curKey = S.current ? recKey({ path: S.current.absPath || '', name: S.current.name }) : '';
    box.innerHTML = list.map(function (r, i) {
      var pathTxt = r.path || (r.dir ? r.dir + '\\' + r.name : '来源未知（仅缓存）');
      var tag = r.path ? '' : '<span class="rc-tag miss">仅缓存</span>';
      return '<div class="rc-item' + (recKey(r) === curKey ? ' cur' : '') + '" data-i="' + i + '">' +
        '<span class="rc-ico">MD</span>' +
        '<div class="rc-body"><div class="rc-name">' + esc(r.name) + tag + '</div>' +
        '<div class="rc-path" title="' + esc(pathTxt) + '">' + esc(pathTxt) + '</div></div>' +
        '<span class="rc-when">' + esc(ago(r.ts)) + '</span>' +
        '<button class="rc-del" type="button" data-del="' + i + '" title="从列表移除">✕</button>' +
        '</div>';
    }).join('');
    var cached = S.recent.filter(function (r) { return r.cached; }).length;
    $('#recentFoot').innerHTML = '共 ' + S.recent.length + ' 条 · ' + cached +
      ' 条带正文缓存（原文件不可读时仍能打开）· 点击条目立即打开';
  }

  function openRecentPanel() {
    recentRender();
    $('#recentWrap').classList.remove('hidden');
    var f = $('#recentFilter'); f.value = '';
    setTimeout(function () { f.focus(); }, 30);
  }
  function closeRecentPanel() { $('#recentWrap').classList.add('hidden'); }

  async function recentOpen(rec) {
    closeRecentPanel();
    if (!rec) return;
    var dir = rec.path ? (dirOf(rec.path.replace(/\\/g, '/')) + '/') : (rec.dir ? rec.dir.replace(/\\/g, '/').replace(/\/?$/, '/') : '');

    // ⓪ 桌面版：走主进程白名单读文件，绕开 file:// 的 fetch/CORS 限制
    if (rec.path && window.__MD_DESKTOP__) {
      try {
        var dr = await window.__MD_DESKTOP__.readFile(rec.path);
        if (dr && dr.ok) {
          await ingest([{ name: rec.name, rel: rec.name, cached: dr.text, enc: dr.enc, absPath: rec.path }], { baseDir: dir });
          toast('已打开 ' + rec.name);
          return;
        }
      } catch (e) { /* 落到下面的缓存分支 */ }
    }

    // ① 优先按绝对路径回读原文（保证内容最新）
    if (rec.path && location.protocol === 'file:') {
      try {
        var res = await fetch(fileUrl(rec.path), { cache: 'no-store' });
        if (res.ok) {
          var txt = await res.text();
          if (!/\uFFFD/.test(txt.slice(0, 2000)) || !rec.cached) {
            await ingest([{ name: rec.name, rel: rec.name, cached: txt, enc: 'FILE', absPath: rec.path }], { baseDir: dir });
            toast('已打开 ' + rec.name);
            return;
          }
        }
      } catch (e) { /* 落到缓存分支 */ }
    }
    // ② 已在当前导入的文件树里 → 直接定位（保留文件句柄）
    var hit = S.files.filter(function (f) { return f.name === rec.name && f.rel === rec.name; })[0]
      || S.files.filter(function (f) { return f.name === rec.name; })[0];
    if (hit) { openFile(hit); return; }
    // ③ 正文缓存兜底
    if (rec.cached) {
      await ingest([{ name: rec.name, rel: rec.name, cached: rec.cached, enc: rec.enc || 'CACHE', absPath: rec.path || '' }], { baseDir: dir });
      toast('原文件不可读 · 已从正文缓存打开');
      return;
    }
    toast('无法打开：文件已移动，且没有正文缓存');
  }

  /* ---------- 拖放（文件 / 文件夹递归；多重回退 + 明确报错） ---------- */
  var drop = $('#drop'), dropTimer = null;

  function showDrop(on) {
    clearTimeout(dropTimer);
    if (on) drop.classList.add('show');
    else dropTimer = setTimeout(function () { drop.classList.remove('show'); }, 60);
  }
  function withTimeout(p, ms) {
    return Promise.race([Promise.resolve(p), new Promise(function (res) {
      setTimeout(function () { res('__TIMEOUT__'); }, ms);
    })]);
  }
  function safeEntries(dt) {
    var out = [];
    try {
      var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
      for (var i = 0; i < items.length; i++) {
        try {
          if (items[i].kind && items[i].kind !== 'file') continue;
          var en = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
          if (en) out.push(en);
        } catch (err) { /* 单个条目失败不影响其它条目 */ }
      }
    } catch (err) { }
    return out;
  }
  function fileItems(files) {
    return Array.prototype.slice.call(files || []).map(function (f) {
      return { file: f, name: f.name, rel: f.webkitRelativePath || f.name, absPath: f.path || '' };
    });
  }
  async function handleDrop(e) {
    e.preventDefault();
    try { e.stopPropagation(); } catch (err) { }
    showDrop(false);
    var dt = e.dataTransfer;
    if (!dt) { toast('没有拿到拖放数据 · 请改用「打开文件」按钮'); return; }

    // DataTransfer 在事件结束后会失效，必须在同步阶段先快照 files
    var direct = fileItems(dt.files);
    var entries = safeEntries(dt);
    var items = [];

    // 仅当存在目录条目、或拿不到 files 时，才走 FileSystemEntry 递归（文件夹拖放）
    var hasDir = entries.some(function (en) { return en.isDirectory; });
    if ((hasDir || !direct.length) && entries.length) {
      var out = [];
      var r = await withTimeout(
        Promise.all(entries.map(function (en) { return walkEntry(en, '', out); })), 5000
      );
      if (r !== '__TIMEOUT__' && out.length) items = out;
      if (!items.length) toast('读取文件夹超时或失败 · 可改用「打开文件夹」按钮');
    }
    if (!items.length && direct.length) items = direct;

    if (!items.length) {
      toast('未识别到文件 · 请点「打开文件 / 打开文件夹」，或用右键「打开方式」');
      return;
    }
    try {
      var n = await ingest(items);
      if (n) toast('已导入 ' + n + ' 个文档');
      else toast('拖入的内容里没有 .md 文件');
    } catch (err) {
      toast('打开失败：' + (err && err.message ? err.message : err));
    }
  }

  // capture 阶段：优先于页面内任何元素，彻底阻止浏览器默认的「打开文件 / 导航」行为
  window.addEventListener('dragenter', function (e) {
    e.preventDefault();
    if (e.dataTransfer) { try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { } }
    showDrop(true);
  }, true);
  window.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (e.dataTransfer) { try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { } }
    showDrop(true);
  }, true);
  window.addEventListener('dragleave', function (e) {
    e.preventDefault();
    if (!e.relatedTarget) showDrop(false);   // relatedTarget 为空 = 真正离开窗口
  }, true);
  window.addEventListener('drop', handleDrop, true);
  window.addEventListener('dragend', function () { showDrop(false); }, true);

  /* ================================================================
     专注阅读模式：隐去侧栏/工具条/状态栏，只留正文 + 顶部阅读进度
     ================================================================ */
  var focusApp = document.getElementById('app');
  function updateFocusProgress() {
    if (!focusApp.classList.contains('focus')) return;
    var max = reader.scrollHeight - reader.clientHeight;
    var pct = max > 0 ? (reader.scrollTop / max) * 100 : 0;
    var fill = document.getElementById('focusFill');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function setFocus(on) {
    if (on) {
      focusApp.dataset.sbCollapsed = $('#sidebar').classList.contains('collapsed') ? '1' : '0';
      focusApp.classList.add('focus');
      syncFocusRender();
      updateFocusProgress();
      /* CR-08：进入专注默认是「收起态纯图标窄轨」，撤掉上次残留的悬停展开态；
         极简偏好（fr-min）由 boot 恢复，这里不动它。 */
      if (typeof frSetOpen === 'function') frSetOpen(false);
      /* CR-06：侧边快捷菜单刚变可见，补量竖排胶囊 */
      if (typeof lpRefresh === 'function') requestAnimationFrame(lpRefresh);
    } else if (focusApp.classList.contains('focus')) {
      focusApp.classList.remove('focus');
      $('#sidebar').classList.toggle('collapsed', focusApp.dataset.sbCollapsed === '1');
      /* CR-08：退出专注一并撤悬停态，下次进来是干净的收起态 */
      if (typeof frSetOpen === 'function') frSetOpen(false);
    }
  }

  /* ----------------------------------------------------------------
     CR-2026-11-15-03  专注模式浮动「渲染快捷菜单」
     ----------------------------------------------------------------
     专注模式会 display:none 整条顶栏，但渲染类控件必须随时可用：
     排版皮肤 / 字号 / 柔光 / 数据图表 / 流程图 / 主题换肤。
     这里不复制任何业务逻辑：每个 .fr-btn 只把点击「代理」给顶栏里
     已经绑定好 handler 的原控件（隐藏元素的 .click() 照样触发），
     再从原控件回读状态，保证单一数据源、两套 UI 不会打架。
     ---------------------------------------------------------------- */
  var focusRender = document.getElementById('focusRender');
  /* ----------------------------------------------------------------
     CR-2026-11-16-08  图标极简菜单：一键收起 + 悬停自动展开
     ----------------------------------------------------------------
     三态（class 组合，全部只改视觉，不动任何业务状态）：
       · 默认        → 40px 纯图标窄轨（.fr-label 宽度 0 + 透明）
       · .fr-open    → 108px 图标 + 文字浮层（悬停 / 键盘焦点触发）
       · .fr-min     → 只剩顶部 #frToggle 一颗钮（点开关进入，写 localStorage）
       · .fr-min.fr-open → 极简态下悬停临时展开，移出延时收回
     正文让位量固定按收起态算（112px），展开是浮层，不推正文、不重排。
     ---------------------------------------------------------------- */
  var frToggle = document.getElementById('frToggle');
  var frCloseT = 0;
  var FR_CLOSE_DELAY = 260;          // 移出延时：防鼠标在边缘反复进出造成抖动
  /* 开关文案 / aria 按当前语言与当前态生成。中文态写回中文原文，
     这样 i18n 的 _zhNodes 缓存（记录的是原始中文）在来回切语言时不会错位。 */
  function frSyncToggle() {
    if (!frToggle) return;
    var min = frIsMin();
    frToggle.setAttribute('aria-expanded', min ? 'false' : 'true');
    frToggle.setAttribute('title', min ? '展开菜单' : '收起菜单（只留一枚图标）');
    var lb = frToggle.querySelector('.fr-label');
    if (lb) lb.textContent = min ? '展开菜单' : '收起菜单';
    if (effLang() !== 'zh-CN') {
      frToggle.setAttribute('title', t(frToggle.getAttribute('title')));
      if (lb) lb.textContent = t(lb.textContent);
    }
  }
  function frIsMin() { return !!focusRender && focusRender.classList.contains('fr-min'); }
  function frIsOpen() { return !!focusRender && focusRender.classList.contains('fr-open'); }
  /* 展开 / 收起（悬停态，瞬时，不持久化）。宽度不做 CSS 过渡，
     切换后同帧补量 CR-06 胶囊，避免它停在旧宽度上。 */
  function frSetOpen(on) {
    if (!focusRender) return;
    clearTimeout(frCloseT);
    if (focusRender.classList.contains('fr-open') === !!on) return;
    focusRender.classList.toggle('fr-open', !!on);
    if (typeof lpRefresh === 'function') {
      requestAnimationFrame(lpRefresh);
      setTimeout(lpRefresh, 60);
    }
  }
  function frScheduleClose() {
    if (!focusRender) return;
    clearTimeout(frCloseT);
    frCloseT = setTimeout(function () { frSetOpen(false); }, FR_CLOSE_DELAY);
  }
  /* 一键收起 / 还原（持久化偏好）。收起时先撤悬停态，避免残留 .fr-open。 */
  function frSetMin(on, opts) {
    if (!focusRender) return;
    opts = opts || {};
    clearTimeout(frCloseT);
    focusRender.classList.toggle('fr-min', !!on);
    focusRender.classList.remove('fr-open');
    if (frToggle) frSyncToggle();
    if (!opts.quiet) save('frMin', on ? '1' : '0');
    /* 收起后 14 个代理 display:none，胶囊必须跳过而不是量到 0；
       还原后补量一次，让它精确落回当前项。 */
    if (typeof lpRefresh === 'function') {
      requestAnimationFrame(lpRefresh);
      setTimeout(lpRefresh, 60);
    }
  }
  if (focusRender) {
    /* 鼠标移入整条轨道即展开；移出延时收回。用 pointer 事件覆盖鼠标 / 触控笔。 */
    focusRender.addEventListener('pointerenter', function () { frSetOpen(true); });
    focusRender.addEventListener('pointerleave', function () { frScheduleClose(); });
    /* 键盘可达：Tab 进入菜单自动展开，焦点整体移出后收回 */
    focusRender.addEventListener('focusin', function () { frSetOpen(true); });
    focusRender.addEventListener('focusout', function (e) {
      if (e.relatedTarget && focusRender.contains(e.relatedTarget)) return;
      frScheduleClose();
    });
    /* 触屏没有 hover：点轨道空白处也能展开，方便手指操作 */
    focusRender.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') frSetOpen(true);
    });
  }
  if (frToggle) {
    frToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      frSetMin(!frIsMin());
    });
  }
  function syncFocusRender() {
    if (!focusRender) return;
    Array.prototype.forEach.call(focusRender.querySelectorAll('[data-proxy]'), function (b) {
      var src = document.getElementById(b.getAttribute('data-proxy'));
      if (!src) return;
      var on = false;
      if (src.tagName === 'SELECT') on = (b.getAttribute('data-val') === src.value);
      else if (src.getAttribute('role') === 'switch') on = src.getAttribute('aria-checked') === 'true';
      else if (src.classList.contains('skin-btn')) on = src.getAttribute('aria-pressed') === 'true';
      else on = src.classList.contains('on');
      b.classList.toggle('on', !!on);
      /* CR-08：图标态下文字不可见，aria-label 必须带上「名称 + 选中态」，
         读屏才念得出这是什么、开没开。中文原文写回，交给 i18n 扫描翻译。 */
      var lb = b.querySelector('.fr-label');
      var nm = lb ? lb.textContent : (b.getAttribute('title') || '');
      b.setAttribute('aria-label', t(nm));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  if (focusRender) {
    focusRender.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-proxy]') : null;
      if (!b || !focusRender.contains(b)) return;
      var id = b.getAttribute('data-proxy');
      var src = document.getElementById(id);
      if (!src) return;
      if (src.tagName === 'SELECT') {
        var v = b.getAttribute('data-val');
        if (v != null && src.value !== v) { src.value = v; src.dispatchEvent(new Event('change')); }
      } else if (id === 'btnPaperMatte') {
        /* 原控件：点 .sw-track = 切换柔光，点文字 = 打开参数面板。
           快捷菜单只取「切换」语义，不把参数面板带进专注模式。 */
        (src.querySelector('.sw-track') || src).click();
      } else {
        src.click();
      }
      syncFocusRender();
    });
  }
  $('#btnFocus').onclick = function () { setFocus(!focusApp.classList.contains('focus')); };
  $('#focusExit').onclick = function () { setFocus(false); };
  reader.addEventListener('scroll', updateFocusProgress, { passive: true });
  // 欢迎屏「专注阅读」功能卡：先确保有文档可读，再进入专注
  var wFocusCard = document.getElementById('wFocusCard');
  if (wFocusCard) wFocusCard.onclick = function () {
    function enter() { setFocus(true); }
    if (S.current) enter();
    else { $('#wDemo').click(); setTimeout(enter, 400); }
  };

  /* ---------- 示例文档 ---------- */
  var DEMO = [
    "---",
    "title: MD Reader · 使用指南与功能导览",
    "subtitle: 让 Markdown 阅读成为一种享受",
    "author: 桂子哥 · 小W",
    "version: 1.4.0",
    "updated: 2026-11-13",
    "tags: 使用指南 / 功能导览 / 数据可视化 / 离线阅读",
    "---",
    "",
    "# 让 Markdown 阅读成为一种享受",
    "",
    "> [!abstract] 这不是说明书，是一份可以边读边点的样例",
    ">",
    "> 文中的表格**能排序、能出图**，代码**能一键复制**，流程图**能一键转成图形**，标题**自动汇成大纲**。顺着读完这一篇，MD Reader 的核心能力你基本都亲手试过了。",
    "",
    "**MD Reader** 是一个只有几 MB 的单文件应用：把 `.md` 拖进来，就得到一页安静、精致、可交互的文档。全程离线、不上传、不采集，再敏感的笔记也放心读。",
    "",
    "> [!tip] 三步开始",
    ">",
    "> ① `Ctrl+Shift+O` 打开文件（或直接把文件 / 整个文件夹拖进窗口） → ② 左侧「文件 / 大纲 / 搜索 / 最近」自由切换 → ③ 顶栏「导出」把成果带走。",
    "",
    "---",
    "",
    "## 一分钟上手",
    "",
    "### 先看这份清单",
    "",
    "- [x] 打开单个 `.md`，或拖入文件夹直接建起一座**整库**",
    "- [x] 用 `A− / A+` 调字号、`行高` 调行距（紧凑 / 标准 / 舒适 / 宽松），顶栏换 **浅色 / 深色 / 护眼** 三种肤色",
    "- [x] 点任意表头排序，点「复制 CSV」把数据粘进 Excel",
    "- [ ] 按 `Ctrl+E` 进入**按块编辑**，改完 `Ctrl+S` 保存",
    "- [ ] 点「专注」进入沉浸阅读，按 `Esc` 回到工作台",
    "",
    "### 常用快捷键",
    "",
    "| 操作 | 快捷键 | 什么时候用 |",
    "| --- | --- | --- |",
    "| 打开文件 | `Ctrl+Shift+O` | 任意界面，支持多选 |",
    "| 专注模式 | `Ctrl+O` | 隐去侧栏与顶栏，保留渲染快捷菜单 |",
    "| 最近打开 | `Ctrl+R` | 接力阅读，自动回到上次位置 |",
    "| 收起 / 展开侧栏 | `Ctrl+B` | 想给正文更多宽度时 |",
    "| 编辑源码 | `Ctrl+E` | 按块编辑 / 整篇编辑随时切换 |",
    "| 保存 | `Ctrl+S` | 写回原文件，换行与 frontmatter 不失真 |",
    "| 查找 | `Ctrl+F` | 高亮命中并逐条跳转 |",
    "| 退出专注模式 | `Esc` / `Ctrl+O` | 回到完整工作台 |",
    "| 上 / 下一节 | `Alt+↑` / `Alt+↓` | 编辑模式里快速跳块 |",
    "",
    "> [!info] 所有偏好都会被记住",
    ">",
    "> 排版、字号、行高、皮肤、应用图标、表格配色、默认图表风格、流程图开关与风格、界面语言，下次打开自动沿用；设置面板里「恢复默认」可一键回到出厂状态。",
    "",
    "---",
    "",
    "## 阅读的仪式感",
    "",
    "> [!quote] 好的工具应该让人忘记工具本身，只看见内容。",
    "",
    "| 排版 | 视觉 | 更适合 |",
    "| --- | --- | --- |",
    "| 📄 **纸张模式** | 描图纸面 + 页边刻度，长文一页到底 | 连续阅读、技术长文、书稿 |",
    "| 🗂 **卡片模式** | 按标题分节成卡片，编号徽章 + 淡渐变抬头 + 同级同字号的胶囊标题 | 汇报材料、多章节手册、项目复盘 |",
    "",
    "在顶栏「排版」下拉里切换，也可以在设置面板设成默认。卡片模式下每节左上角的 `01 / 02 / 03` 徽章会**跟随表格配色一起变色**——黑白极简是墨黑、蓝色科技是克莱因蓝、红色政商是朱红、粉色卡通是樱粉；深色皮肤下自动换成「浅底深字」，保证数字始终清晰。",
    "",
    "> [!success] 现在就试一下",
    ">",
    "> 点一下任意表格工具条右侧的四个配色小圆点，再回头看本页所有卡片编号、表头与图表：它们会一起换色。",
    "",
    "其他让眼睛舒服的细节：**大纲**自动汇总 h1–h6 点击即跳、**多标签页**并行读多篇、**阅读进度**常驻状态栏、**最近打开**记住上次位置，还有一键隐去全部工具栏的**专注模式**（`Ctrl+O` 进入、`Esc` 退出，正文左侧始终留一条竖排渲染快捷菜单，排版 / 字号 / 行高 / 肤色随时可调，不遮正文）。长文读到一半被打断？关掉软件，明天 `Ctrl+R` 接着读。",
    "",
    "---",
    "",
    "## 表格会说话",
    "",
    "数据表格在 MD Reader 里不是静态的：点表头排序、`复制 CSV / TSV` 导出、右侧四套配色换肤，点「图表」就地生成 **自动 / 柱状 / 折线 / 趋势 / 环形 / 玫瑰** 六种视图。五种图表都按主流可视化审美重做过：柱状带垂直渐变与顶端数值，折线是平滑曲线加空心描边圆点，趋势是渐变面积图，**圆角环形图**是零描边的 ECharts 式分块（圆角扇区 + 中心总量 + 右侧占比清单），**南丁格尔玫瑰图**在此基础上把扇区按数值从小到大顺时针排列、等角变径向外辐射，花瓣感与增长感一眼可辨。参考 ECharts 示例库里最受欢迎的几种实现。打开顶栏「图表总开关」，之后每一份文档的数据表都默认展开。",
    "",
    "### 季度经营数据 · 自动判定为柱状图",
    "",
    "| 季度 | 订单（万元） | 收入（万元） | 回款（万元） | 经营利润（万元） | 经营现金流（万元） |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    "| Q1 | 2600 | 1850 | 1620 | 225 | 110 |",
    "| Q2 | 3050 | 2240 | 2010 | 296 | 245 |",
    "| Q3 | 3420 | 2680 | 2530 | 372 | 368 |",
    "| Q4 | 3860 | 3150 | 3020 | 458 | 492 |",
    "",
    "### 十二个月趋势 · 宽表自动翻转为折线",
    "",
    "单位：万元；列数较多时可横向滚动，图表会自动把 12 个月翻到 X 轴。",
    "",
    "| 指标 | 1月 | 2月 | 3月 | 4月 | 5月 | 6月 | 7月 | 8月 | 9月 | 10月 | 11月 | 12月 | 合计 |",
    "| ---- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    "| 订单 | 866.67 | 866.67 | 866.66 | 1016.67 | 1016.67 | 1016.66 | 1140.00 | 1140.00 | 1140.00 | 1286.67 | 1286.67 | 1286.66 | 12930.00 |",
    "| 收入 | 616.67 | 616.67 | 616.66 | 746.67 | 746.67 | 746.66 | 893.33 | 893.33 | 893.34 | 1050.00 | 1050.00 | 1050.00 | 9920.00 |",
    "| 回款 | 540.00 | 540.00 | 540.00 | 670.00 | 670.00 | 670.00 | 843.33 | 843.33 | 843.34 | 1006.67 | 1006.67 | 1006.66 | 9180.00 |",
    "| 经营利润 | 75.00 | 75.00 | 75.00 | 98.67 | 98.67 | 98.66 | 124.00 | 124.00 | 124.00 | 152.67 | 152.67 | 152.66 | 1351.00 |",
    "| 经营现金流 | 36.67 | 36.67 | 36.66 | 81.67 | 81.67 | 81.66 | 122.67 | 122.67 | 122.66 | 164.00 | 164.00 | 164.00 | 1215.00 |",
    "",
    "### 单指标构成 · 自动变成圆角环形图",
    "",
    "| 功能模块 | 日均使用次数 |",
    "| --- | ---: |",
    "| 表格可视化 | 32 |",
    "| 整库浏览 | 24 |",
    "| 文本流程图 | 18 |",
    "| 按块编辑 | 14 |",
    "| 四格式导出 | 12 |",
    "",
    "> [!example] 动手试试",
    ">",
    "> ① 点「收入（万元）」表头，看排序后图表跟着重绘 → ② 在图表上切「环形 / 玫瑰 / 面积趋势」，鼠标悬停扇区时中心会实时显示该片数值 → ③ 点四色按钮，柱子、曲线、花瓣一起换色 → ④ 点「复制 CSV」，直接粘进 Excel。",
    "",
    "### 四格式导出对照",
    "",
    "| 格式 | 产物 | 最适合的场景 | 样式是否带走 |",
    "| --- | --- | --- | --- |",
    "| 📘 **Word** | `.doc` | 交材料、走审批、给别人继续改 | ✅ 表头配色、卡片徽章、图片 · 图表按 A4 版心自适应 |",
    "| 🌐 **HTML** | 独立 `.html` | 离线分发、存档、发同事 | ✅ 样式与图表全部内嵌 |",
    "| 🖨 **PDF** | 打印 / 另存 | 归档、打印、正式提交 | ✅ 自动隐藏工具条 |",
    "| 📝 **Markdown** | `.md` 源文件 | 回到笔记库继续写 | — 纯源码 |",
    "",
    "> [!warning] 导出前的小提醒",
    ">",
    "> Word 采用兼容性最好的 HTML 包装格式，Word / WPS 都能直接打开；未展开的图表盒不会带进 Word，但**数据表格本身完整保留**。已展开的图表与流程图按 A4 版心等比缩放成 PNG，宽表自动锁定列宽，不会再出现图片撑出页面、中文表头竖排成单字。",
    "",
    "---",
    "",
    "## 代码与行内样式",
    "",
    "### 多语言高亮，每块都有「复制」按钮",
    "",
    "```python",
    "def collect(devices, proto=\"snmpv3\"):",
    "    \"\"\"采集策略示例：只取在线设备\"\"\"",
    "    return [d.read(proto) for d in devices if d.online]",
    "```",
    "",
    "```javascript",
    "const render = async (md) => {",
    "  const html = marked.parse(md, { gfm: true });",
    "  content.innerHTML = html;",
    "  enhanceTables();            // 排序 / CSV / 图表",
    "  await renderMermaid();      // 流动美化流程图",
    "};",
    "```",
    "",
    "```sql",
    "SELECT region, SUM(revenue) AS total",
    "FROM quarterly_report",
    "WHERE year = 2026 AND revenue > 0",
    "GROUP BY region",
    "ORDER BY total DESC;",
    "```",
    "",
    "```bash",
    "# 本地开发：构建单文件 / 国际版",
    "python src/build.py",
    "python src/build.py --edition global --out dist-intl/MDReader.html",
    "```",
    "",
    "```json",
    "{",
    "  \"offline\": true,",
    "  \"skin\": [\"light\", \"dark\", \"sepia\"],",
    "  \"layout\": [\"paper\", \"card\"],",
    "  \"export\": [\"word\", \"html\", \"pdf\", \"md\"]",
    "}",
    "```",
    "",
    "```yaml",
    "reader:",
    "  font_size: 16",
    "  table_theme: tech",
    "  chart_style: auto",
    "  flow_auto: true",
    "  language: zh-CN",
    "```",
    "",
    "### 行内语法全家桶",
    "",
    "**加粗**、*斜体*、~~删除线~~、`marked.parse()` 行内代码、[外部链接](https://www.workbuddy.cn)、以及自动识别的 #标签 都正常渲染。",
    "",
    "1. 有序列表第一项",
    "2. 有序列表第二项",
    "   - 嵌套无序子项 A",
    "   - 嵌套无序子项 B",
    "     - 第三级依然层次分明",
    "",
    "> 引用可以只放一句金句，也可以继续嵌套：",
    ">",
    "> > 嵌套引用，用在注脚与出处特别顺手。",
    "",
    "> [!question] 数学公式支持吗？",
    ">",
    "> 当前版本未内置公式引擎，LaTeX 会以源码显示；表格、图表、流程图、双链这些更高频的场景已经做深做透。",
    "",
    "---",
    "",
    "## 双引擎流程图",
    "",
    "### 原生 Mermaid，自动获得流动质感",
    "",
    "```mermaid",
    "flowchart TD",
    "  A([拖入 .md 文件]) --> B{识别内容}",
    "  B -->|表格| C[排序 · 复制 CSV · 出图]",
    "  B -->|代码| D[语法高亮 · 一键复制]",
    "  B -->|flow 块| E[文本转流程图]",
    "  B -->|双链| F[[整库跳转]]",
    "  C --> G([一页精致文档])",
    "  D --> G",
    "  E --> G",
    "  F --> G",
    "  G --> H[纸张 / 卡片排版]",
    "  H --> I[浅色 / 深色 / 护眼]",
    "```",
    "",
    "圆角节点、渐变描边与沿线流水动效由内置的 **MD FLOW** 渲染器统一施加，原生 Mermaid 语法无需任何改写。",
    "",
    "> [!tip] 五套流程图风格 · 长节点自动竖向",
    ">",
    "> 设置 →「流程图风格」可即时切换 **经典 / 极简 / 商务 / 活力 / 暗夜**：画布、节点、连线、编号徽章与阴影一起变，导出 Word / HTML 与屏幕完全一致。节点文字过长会自动折行，横向图太宽会自动改成自上而下的竖向布局，不必手动把 `graph LR` 改成 `graph TD`。",
    "",
    "### 符号空格文本流程图 · 一键转图形",
    "",
    "```flow",
    "@main LR",
    "([导入]) --> [预校验门禁] --> [任务执行] --> {人工裁决} --> ![归档]",
    "[预校验门禁] -- WARN 放行 --> ![留痕告警]",
    "[预校验门禁] -- FAIL --> ![硬隔离]",
    "[任务执行] -- 重试 3 次 / 间隔 5m --> [重试队列] --> ![重试留痕终态]",
    "@sub",
    "{人工裁决} -. 依赖触发 .-> [分类路由]",
    "[分类路由] -- 确认 --> ![通过归档]",
    "[分类路由] -- 驳回 --> ![驳回留痕]",
    "[分类路由] -- SLA超时 --> ![超时升级]",
    "```",
    "",
    "> [!note] 两种写法都认",
    ">",
    "> 除了 `[节点] --> [节点]`，也支持 `① 已导入 → ② 待校验 → ③ 校验通过` 这样的 ①②③ 符号占位与 `⇒` 箭头，甚至能画回环。点顶栏「流程图」总开关，整篇一次性转换；再点一次还原源码。",
    "",
    "```flow",
    "@main LR",
    "① 已导入 → ② 待校验 → ③ 校验通过 → ④ 已准入",
    "② 待校验 → WARN 校验告警 → 人工放行 → ④ 已准入",
    "② 待校验 → FAIL 校验失败 → 已隔离 →（修正重传）→ ② 待校验",
    "```",
    "",
    "---",
    "",
    "## Obsidian 知识库友好",
    "",
    "拖入整个 Vault，文件树、大纲、全文搜索立刻可用；UTF-8 / GB18030 自动识别，相对路径图片也能正常显示。",
    "",
    "- 双链跳转：[[项目总览]]、[[项目总览|别名写法]]、[[采集策略#SNMP v3]]",
    "- 图片嵌入：打开所在文件夹后，相对路径图片会正常显示（写法见下一节）",
    "- 标签：#智慧综维 #数字员工 #IPOSS",
    "- YAML 属性：就是本文开头的 `---` 区块，会渲染成可折叠的「📋 文档属性」",
    "",
    "### Callout 提示块全家桶",
    "",
    "> [!note] 笔记",
    ">",
    "> 适合补充说明、随手记下的背景信息，不打断主线。",
    "",
    "> [!info] 信息",
    ">",
    "> 中性事实与口径说明，配一枚蓝色信息标。",
    "",
    "> [!success] 成功",
    ">",
    "> 结论、已完成项、验证通过的结果。",
    "",
    "> [!question] 问题",
    ">",
    "> 把待确认的疑问单独拎出来， review 时一眼能看到。",
    "",
    "> [!warning] 警告",
    ">",
    "> 需要留意的边界条件，比如编码、路径、导出差异。",
    "",
    "> [!danger] 危险",
    ">",
    "> 不可逆操作、数据丢失风险，用最高优先级标出来。",
    "",
    "> [!example] 示例",
    ">",
    "> 一段可照抄的用法，或一组演示数据。",
    "",
    "> [!todo] 待办",
    ">",
    "> 下一步要做什么，和任务列表配合使用。",
    "",
    "> [!quote] 引用",
    ">",
    "> 金句、出处、访谈原文，与正文拉开层次。",
    "",
    "### 图片嵌入的两种写法",
    "",
    "```text",
    "![[assets/demo.svg|320]]        ← Obsidian 嵌入，管道符控制宽度",
    "![](assets/demo.svg)            ← 标准 Markdown 图片",
    "```",
    "",
    "把整个文件夹拖进窗口后，这两种写法的本地图片都会正确解析；只打开单个 `.md` 时可能显示为缺图占位。",
    "",
    "### 编码与路径",
    "",
    "> [!warning] 编码提示",
    ">",
    "> UTF-8 与 GB18030 会自动识别；打开整个文件夹时，`![[图片]]` 与相对路径图片都能正常显示。只打开单个文件时，本地图片可能显示为缺图占位，这是预期行为。",
    "",
    "---",
    "",
    "## 整库浏览与按块编辑",
    "",
    "| 能力 | 怎么用 | 解决什么 |",
    "| --- | --- | --- |",
    "| 📁 文件树 | 拖入文件夹，左侧按目录展开 | 上千篇笔记不用导出来回折腾 |",
    "| ☷ 大纲 | 切到「大纲」标签，点标题即跳 | 长文定位不再靠滚动条 |",
    "| 🔍 全文搜索 | 输入关键词，按文件分组列命中 | 只记得一句话也能找回来 |",
    "| ✎ 按块编辑 | `Ctrl+E`，左栏选段落 / 标题 / 表格 / 代码 | 不再把整篇塞进一个文本框乱序 |",
    "| 💾 写回原文件 | `Ctrl+S`，或「全篇编辑」切换 | 换行、空行、frontmatter 分毫不差 |",
    "| 🕘 最近打开 | `Ctrl+R`，自动恢复阅读位置 | 接力阅读零成本 |",
    "",
    "> [!tip] 按块编辑的正确姿势",
    ">",
    "> 左栏每个块带类型标签与字数：`H` 标题、`¶` 段落、`•` 列表、`▦` 表格、`</>` 代码、`❝` 引用、`―` 分隔线。用「↑ 上块 / ↓ 下块」连续走查，比在长文本里找光标快得多。",
    "",
    "---",
    "",
    "## 三个典型场景",
    "",
    "1. **读一份季度经营分析**：拖入 `.md` → 表格自动出图 → 切「蓝色科技」配色 → 点表头按收入排序 → 「复制 CSV」贴进 Excel → 导出 Word 交材料。",
    "2. **翻自己的 Obsidian 库**：拖入 Vault 根目录 → 用全文搜索找关键词 → 点 [[双链]] 在库内跳转 → 切「护眼」肤色 + 专注模式长读 → `Ctrl+R` 明天接着读。",
    "3. **给团队发一份离线手册**：切「卡片」排版 → 打开图表总开关 → 转好流程图 → 导出独立 HTML（样式图表全部内嵌）→ 一个文件发群里，断网也能看。",
    "",
    "> [!success] 一个文件，覆盖全链路",
    ">",
    "> 从打开、阅读、可视化、编辑，到 Word / HTML / PDF / Markdown 交付，MD Reader 不依赖网络、不依赖服务端，也不需要安装任何运行时。",
    "",
    "---",
    "",
    "## 写在最后",
    "",
    "> [!quote] 所谓「享受」，不过是每次想做的事，都刚好在手边。",
    "",
    "如果某个细节还不够顺手，欢迎来信吐槽：📩 **527400412@qq.com**。公众号「**晨曦AI研习**」回复 `MDReader` 可获取更新、源码与技术分享。",
    "",
    "---",
    "",
    "*MD Reader · 免费开源 · 让 Markdown 阅读成为一种享受 · 本文既是使用指南，也是一份可直接编辑的 Markdown 样例。*"
  ].join('\n');
  /* English 版示例文档：界面切到 English 时，示例内容也随之换成英文（用户文档本身永不自动翻译）。 */
  var DEMO_EN = [
    "---",
    "title: MD Reader - User Guide & Feature Tour",
    "subtitle: Make Markdown reading a pleasure",
    "author: Guizige & W",
    "version: 1.4.0",
    "updated: 2026-11-13",
    "tags: user guide / feature tour / data visualization / offline reading",
    "---",
    "",
    "# Make Markdown reading a pleasure",
    "",
    "> [!abstract] Not a manual - a sample you can click as you read",
    ">",
    "> The tables below **sort and draw charts**, every code block **copies in one click**, flowcharts **turn into diagrams instantly**, and headings **build the outline automatically**. By the time you finish this page, you will have tried nearly every core feature of MD Reader.",
    "",
    "**MD Reader** is a single file just a few MB in size. Drop in a `.md` file and you get a quiet, polished, interactive page. Fully offline, nothing uploaded, nothing collected - even sensitive notes are safe to read.",
    "",
    "> [!tip] Get started in three steps",
    ">",
    "> ① Press `Ctrl+Shift+O` to open a file (or drop a file / an entire folder into the window) → ② Switch between **Files / Outline / Search / Recent** on the left → ③ Use **Export** in the toolbar to take your work with you.",
    "",
    "---",
    "",
    "## The first minute",
    "",
    "### A quick checklist",
    "",
    "- [x] Open a single `.md`, or drop a folder to build a **whole library**",
    "- [x] Adjust type size with `A- / A+` and line spacing with `Line Height` (Tight / Standard / Comfortable / Loose), switch **Light / Dark / Sepia** skins",
    "- [x] Click any table header to sort, use **Copy CSV** to paste into Excel",
    "- [ ] Press `Ctrl+E` for **block editing**, then `Ctrl+S` to save",
    "- [ ] Enter **Focus mode** for distraction-free reading, `Esc` to return",
    "",
    "### Keyboard shortcuts",
    "",
    "| Action | Shortcut | When to use |",
    "| --- | --- | --- |",
    "| Open file | `Ctrl+Shift+O` | Anywhere, multiple selection supported |",
    "| Focus mode | `Ctrl+O` | Hide sidebars and toolbar, keep the render quick menu |",
    "| Recent files | `Ctrl+R` | Resume reading at your last position |",
    "| Toggle sidebar | `Ctrl+B` | When the text needs more room |",
    "| Edit source | `Ctrl+E` | Switch between block editing and full-document editing |",
    "| Save | `Ctrl+S` | Write back to the original file, line breaks preserved |",
    "| Find | `Ctrl+F` | Highlight matches and jump through them |",
    "| Exit focus mode | `Esc` / `Ctrl+O` | Return to the full workspace |",
    "| Previous / next block | `Alt+Up` / `Alt+Down` | Fast navigation while editing |",
    "",
    "> [!info] Every preference is remembered",
    ">",
    "> Layout, type size, line height, skin, app icon, table colors, default chart style, flowchart switch and style, and UI language all persist across sessions. **Restore defaults** in Settings takes you back to a clean slate.",
    "",
    "---",
    "",
    "## The ritual of reading",
    "",
    "> [!quote] A good tool makes you forget the tool and see only the content.",
    "",
    "| Layout | Look and feel | Best for |",
    "| --- | --- | --- |",
    "| 📄 **Paper** | Tracing-paper surface with page-edge ticks, one continuous sheet | Long reads, technical articles, book drafts |",
    "| 🗂 **Cards** | Sections become cards with numbered badges, soft gradient headers and same-size pill headings per level | Reports, multi-chapter manuals, retrospectives |",
    "",
    "Switch from the **Layout** dropdown in the toolbar, or set a default in Settings. In Cards mode the `01 / 02 / 03` badges **follow the table color theme** - ink black for Mono, Klein blue for Tech, vermilion for Official, cherry pink for Playful. On the dark skin they flip to a light badge with dark numerals so they stay legible.",
    "",
    "> [!success] Try it right now",
    ">",
    "> Click one of the four color dots on the right of any table toolbar, then look back at the section badges, table headers and charts on this page: they all change together.",
    "",
    "A few more details that keep your eyes happy: the **Outline** collects h1-h6 headings for one-click jumps, **tabs** let several documents stay open, a **reading progress** indicator lives in the status bar, **Recent** remembers where you stopped, and **Focus mode** (`Ctrl+O` to enter, `Esc` to exit) hides every toolbar at once while a vertical render quick menu on the left keeps layout, type size, line height and theme within reach without covering the text. Interrupted halfway through a long piece? Close the app and press `Ctrl+R` tomorrow.",
    "",
    "---",
    "",
    "## Tables that talk",
    "",
    "A data table in MD Reader is never static: click a header to sort, use **Copy CSV / TSV** to export, switch between four color themes, and press **Chart** for **Auto / Bar / Line / Trend / Donut / Rose** views. All five are drawn to a mainstream visualization aesthetic: gradient rounded bars with value labels, smooth lines with hollow marker dots, a gradient area chart, a **rounded donut chart** with zero strokes (rounded slices, centered total, share list on the right), and a **Nightingale rose chart** whose sectors are sorted small-to-large clockwise and radiate outward with value-scaled radii for the petal look. Inspired by the most popular ECharts examples. Turn on the global **Charts** switch and every data table in every document opens with its chart expanded.",
    "",
    "### Quarterly results - auto-detected as a bar chart",
    "",
    "| Quarter | Orders (k CNY) | Revenue (k CNY) | Cash In (k CNY) | Operating Profit (k CNY) | Operating Cash Flow (k CNY) |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    "| Q1 | 2600 | 1850 | 1620 | 225 | 110 |",
    "| Q2 | 3050 | 2240 | 2010 | 296 | 245 |",
    "| Q3 | 3420 | 2680 | 2530 | 372 | 368 |",
    "| Q4 | 3860 | 3150 | 3020 | 458 | 492 |",
    "",
    "### Twelve-month trend - wide tables flip to a line chart",
    "",
    "All values in k CNY; scroll horizontally for the full year, and the chart flips the 12 months onto the X axis.",
    "",
    "| Metric | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Total |",
    "| ---- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    "| Orders | 866.67 | 866.67 | 866.66 | 1016.67 | 1016.67 | 1016.66 | 1140.00 | 1140.00 | 1140.00 | 1286.67 | 1286.67 | 1286.66 | 12930.00 |",
    "| Revenue | 616.67 | 616.67 | 616.66 | 746.67 | 746.67 | 746.66 | 893.33 | 893.33 | 893.34 | 1050.00 | 1050.00 | 1050.00 | 9920.00 |",
    "| Cash In | 540.00 | 540.00 | 540.00 | 670.00 | 670.00 | 670.00 | 843.33 | 843.33 | 843.34 | 1006.67 | 1006.67 | 1006.66 | 9180.00 |",
    "| Profit | 75.00 | 75.00 | 75.00 | 98.67 | 98.67 | 98.66 | 124.00 | 124.00 | 124.00 | 152.67 | 152.67 | 152.66 | 1351.00 |",
    "| Cash Flow | 36.67 | 36.67 | 36.66 | 81.67 | 81.67 | 81.66 | 122.67 | 122.67 | 122.66 | 164.00 | 164.00 | 164.00 | 1215.00 |",
    "",
    "### A single metric - automatically a rounded donut chart",
    "",
    "| Feature | Daily uses |",
    "| --- | ---: |",
    "| Table visualization | 32 |",
    "| Library browsing | 24 |",
    "| Text flowcharts | 18 |",
    "| Block editing | 14 |",
    "| Four export formats | 12 |",
    "",
    "> [!example] Hands-on",
    ">",
    "> ① Click the **Revenue** header and watch the chart redraw → ② Switch that chart to **Donut / Rose / Area trend**; hovering a slice shows its value in the center in real time → ③ Click a color dot: bars, curves and petals recolor together → ④ Press **Copy CSV** and paste straight into Excel.",
    "",
    "### Export formats compared",
    "",
    "| Format | Output | Best for | Keeps styling |",
    "| --- | --- | --- | --- |",
    "| 📘 **Word** | `.doc` | Hand-offs, reviews, further editing | ✅ Header colors, section badges, images · charts fit the A4 text area |",
    "| 🌐 **HTML** | Standalone `.html` | Offline sharing, archiving | ✅ All styles and charts embedded |",
    "| 🖨 **PDF** | Print / Save as PDF | Archiving, printing, formal delivery | ✅ Toolbars hidden automatically |",
    "| 📝 **Markdown** | `.md` source | Continue writing in your vault | — Plain source |",
    "",
    "> [!warning] Before you export",
    ">",
    "> Word uses the most compatible HTML-wrapper format, openable directly in Word and WPS. Collapsed chart boxes are skipped, but **the data table itself is always kept**. Expanded charts and flowcharts are scaled to the A4 text area as PNGs, and wide tables get fixed column widths - no more images spilling off the page or Chinese headers squeezed into one character per line.",
    "",
    "---",
    "",
    "## Code and inline styles",
    "",
    "### Multi-language highlighting, every block with a Copy button",
    "",
    "```python",
    "def collect(devices, proto=\"snmpv3\"):",
    "    \"\"\"Sample collection policy: online devices only\"\"\"",
    "    return [d.read(proto) for d in devices if d.online]",
    "```",
    "",
    "```javascript",
    "const render = async (md) => {",
    "  const html = marked.parse(md, { gfm: true });",
    "  content.innerHTML = html;",
    "  enhanceTables();            // sort / CSV / charts",
    "  await renderMermaid();      // animated flowcharts",
    "};",
    "```",
    "",
    "```sql",
    "SELECT region, SUM(revenue) AS total",
    "FROM quarterly_report",
    "WHERE year = 2026 AND revenue > 0",
    "GROUP BY region",
    "ORDER BY total DESC;",
    "```",
    "",
    "```bash",
    "# Local build: single file and international edition",
    "python src/build.py",
    "python src/build.py --edition global --out dist-intl/MDReader.html",
    "```",
    "",
    "```json",
    "{",
    "  \"offline\": true,",
    "  \"skin\": [\"light\", \"dark\", \"sepia\"],",
    "  \"layout\": [\"paper\", \"card\"],",
    "  \"export\": [\"word\", \"html\", \"pdf\", \"md\"]",
    "}",
    "```",
    "",
    "```yaml",
    "reader:",
    "  font_size: 16",
    "  table_theme: tech",
    "  chart_style: auto",
    "  flow_auto: true",
    "  language: en",
    "```",
    "",
    "### The inline syntax family",
    "",
    "**Bold**, *italic*, ~~strikethrough~~, `marked.parse()` inline code, an [external link](https://www.workbuddy.cn), and auto-detected #tags all render correctly.",
    "",
    "1. First ordered item",
    "2. Second ordered item",
    "   - Nested bullet A",
    "   - Nested bullet B",
    "     - A third level stays perfectly aligned",
    "",
    "> A quote can hold a single line, or nest another quote:",
    ">",
    "> > Nested quotes work nicely for sources and footnotes.",
    "",
    "> [!question] Are math formulas supported?",
    ">",
    "> No formula engine is bundled in this version, so LaTeX stays as source. The higher-frequency cases - tables, charts, flowcharts and wiki links - are the ones we have pushed deepest.",
    "",
    "---",
    "",
    "## Two flowchart engines",
    "",
    "### Native Mermaid, with animated flow styling",
    "",
    "```mermaid",
    "flowchart TD",
    "  A([Drop a .md file]) --> B{Parse content}",
    "  B -->|Table| C[Sort - Copy CSV - Chart]",
    "  B -->|Code| D[Syntax highlight - Copy]",
    "  B -->|flow block| E[Text to flowchart]",
    "  B -->|Wiki link| F[[Jump inside vault]]",
    "  C --> G([One polished page])",
    "  D --> G",
    "  E --> G",
    "  F --> G",
    "  G --> H[Paper / Cards layout]",
    "  H --> I[Light / Dark / Sepia]",
    "```",
    "",
    "Rounded nodes, gradient strokes and flowing line animation come from the built-in **MD FLOW** renderer - plain Mermaid syntax needs no changes at all.",
    "",
    "> [!tip] Five flowchart styles - long nodes go vertical automatically",
    ">",
    "> Settings > **Flowchart Style** switches instantly between **Classic / Minimal / Business / Vivid / Neon**: canvas, nodes, links, numbered badges and shadows all change together, and Word / HTML exports match the screen exactly. Overlong node labels wrap automatically, and a diagram too wide for the page is redrawn top-down - no need to edit `graph LR` into `graph TD` by hand.",
    "",
    "### Symbol-and-space text flowcharts - convert in one click",
    "",
    "```flow",
    "@main LR",
    "([Import]) --> [Pre-check gate] --> [Run task] --> {Human review} --> ![Archive]",
    "[Pre-check gate] -- WARN pass --> ![Warning logged]",
    "[Pre-check gate] -- FAIL --> ![Quarantine]",
    "[Run task] -- retry 3 times / 5m apart --> [Retry queue] --> ![Retry logged]",
    "@sub",
    "{Human review} -. triggers .-> [Classify route]",
    "[Classify route] -- Approve --> ![Approved]",
    "[Classify route] -- Reject --> ![Rejected]",
    "[Classify route] -- SLA timeout --> ![Escalated]",
    "```",
    "",
    "> [!note] Both notations are accepted",
    ">",
    "> Besides `[Node] --> [Node]`, you can write `1 Imported -> 2 Pending -> 3 Verified` with circled-number placeholders and arrow symbols, including loops. Press the global **Flowcharts** switch in the toolbar to convert the entire document at once; press again to restore the source.",
    "",
    "```flow",
    "@main LR",
    "① Imported → ② Pending → ③ Verified → ④ Admitted",
    "② Pending → WARN Warning → Manual pass → ④ Admitted",
    "② Pending → FAIL Failed → Quarantined → (Fix and resend) → ② Pending",
    "```",
    "",
    "### A third way: plain arrows in a sentence",
    "",
    "One line of text is enough for a small state chain: `Draft → Review → Approved → Published`. Enclose a group of those lines in a `flow` code block and MD Reader turns them into a clean diagram.",
    "",
    "---",
    "",
    "## Obsidian vault friendly",
    "",
    "Drop in an entire vault and the file tree, outline and full-text search are ready immediately. UTF-8 and GB18030 are detected automatically, and relative image paths resolve correctly.",
    "",
    "- Wiki links: [[Project Overview]], [[Project Overview|Alias]], [[Collection Policy#SNMP v3]]",
    "- Image embeds: relative images resolve once you open the folder (syntax in the next section)",
    "- Tags: #knowledge #vault #markdown",
    "- YAML properties: the `---` block at the top of this page, rendered as a collapsible **Document properties** panel",
    "",
    "### The callout family",
    "",
    "> [!note] Note",
    ">",
    "> Background details and side remarks that should not interrupt the main thread.",
    "",
    "> [!info] Info",
    ">",
    "> Neutral facts, definitions and measurement conventions.",
    "",
    "> [!success] Success",
    ">",
    "> Conclusions, completed items and verified results.",
    "",
    "> [!question] Question",
    ">",
    "> Open questions, separated so they stand out during review.",
    "",
    "> [!warning] Warning",
    ">",
    "> Conditions worth checking: encoding, paths, export differences.",
    "",
    "> [!danger] Danger",
    ">",
    "> Irreversible actions and data-loss risks, at the highest priority.",
    "",
    "> [!example] Example",
    ">",
    "> A snippet you can copy verbatim, or a set of demo data.",
    "",
    "> [!todo] To do",
    ">",
    "> The next step, to be used alongside task lists.",
    "",
    "> [!quote] Quote",
    ">",
    "> A memorable line, a citation or interview text, visually set apart.",
    "",
    "### Two ways to embed an image",
    "",
    "```text",
    "![[assets/demo.svg|320]]        - Obsidian embed, pipe sets the width",
    "![](assets/demo.svg)            - Standard Markdown image",
    "```",
    "",
    "Drop the whole folder into the window and both forms resolve correctly. Opening a single standalone `.md` may show a placeholder instead.",
    "",
    "### Encoding and paths",
    "",
    "> [!warning] Encoding note",
    ">",
    "> UTF-8 and GB18030 are detected automatically. When you open a whole folder, `![[image]]` embeds and relative image paths work; opening a single standalone file may show a placeholder for local images, which is expected.",
    "",
    "---",
    "",
    "## Library browsing and block editing",
    "",
    "| Capability | How to use it | What it solves |",
    "| --- | --- | --- |",
    "| 📁 File tree | Drop a folder, expand directories on the left | Thousands of notes without exporting anything |",
    "| ☷ Outline | Switch to the Outline tab, click a heading | No more hunting with the scrollbar |",
    "| 🔍 Full-text search | Type a keyword, matches grouped by file | Find a note when you remember only one sentence |",
    "| ✎ Block editing | `Ctrl+E`, pick a heading / paragraph / table / code block | No more one giant textarea with shuffled sections |",
    "| 💾 Write back | `Ctrl+S`, or switch to full-document editing | Line breaks, blank lines and frontmatter preserved |",
    "| 🕘 Recent files | `Ctrl+R`, restores your reading position | Zero-cost resume |",
    "",
    "> [!tip] The right way to use block editing",
    ">",
    "> Each block in the left pane carries a type badge and word count: `H` heading, `P` paragraph, `L` list, `T` table, `C` code, `Q` quote, `R` rule. Walking through them with **Previous / Next** is far faster than hunting for a caret in a long document.",
    "",
    "---",
    "",
    "## Three everyday scenarios",
    "",
    "1. **Read a quarterly business review**: drop in the `.md` → charts expand automatically → switch to the **Tech** blue theme → sort by revenue → **Copy CSV** into Excel → export Word for the hand-off.",
    "2. **Browse your own Obsidian vault**: drop in the vault root → search a keyword → follow [[wiki links]] between notes → switch to **Sepia** plus Focus mode for a long read → `Ctrl+R` tomorrow.",
    "3. **Send the team an offline handbook**: switch to **Cards** → turn on the global Charts switch → convert the flowcharts → export a standalone HTML with all styles and charts embedded → share one file that works with no network.",
    "",
    "> [!success] One file, the whole chain",
    ">",
    "> From opening, reading, visualizing and editing to Word / HTML / PDF / Markdown delivery, MD Reader needs no network, no server and no runtime installation.",
    "",
    "---",
    "",
    "## One last note",
    "",
    "> [!quote] Pleasure is simply having the thing you want to do right where your hand already is.",
    "",
    "If something still feels clumsy, send a note: 📩 **527400412@qq.com**.",
    "",
    "---",
    "",
    "*MD Reader - free and open source - Make Markdown reading a pleasure - This page is both a user guide and an editable Markdown sample.*"
  ].join('\n');
  $('#wDemo').onclick = function () {
    var en = effLang() === 'en';
    var docName = en ? 'Sample Document.md' : '示例文档.md';
    ingest([{ name: docName, rel: docName, cached: en ? DEMO_EN : DEMO, enc: 'DEMO' }])
      .then(function () {
        toast(en ? 'Guide loaded · data charts expanded, click a table header or a color dot to explore'
                 : '已载入使用指南 · 数据表格已自动出图，点表头或配色圆点试试');
        // 只自动展开「含数值列」的表格：新版示例里还有快捷键、排版对照、导出对照等
        // 纯文本表，对它们点「图表」会连续弹「未检测到数值列」，反而打扰阅读。
        // parseChart() 返回 null 即代表该表无法出图，直接跳过。
        // 另外判断依据是图表容器是否已展开，不能看按钮文案 —— 若总开关已生效，
        // 这里再点一次反而会把已展开的图表收起来。
        requestAnimationFrame(function () {
          document.querySelectorAll('#content .tw').forEach(function (tw) {
            var btn = tw.querySelector('button[data-act="chart"]');
            var box = tw.querySelector('.chart-box');
            var tbl = tw.querySelector('table');
            if (!btn || !box || !tbl || box.classList.contains('show')) return;
            if (parseChart(tbl)) btn.click();
          });
        });
      });
  };

  /* ================================================================
     桌面版桥接：仅在 Electron 注入 window.__MD_DESKTOP__ 时启用。
     便携版（纯 HTML）不存在该对象，下面的逻辑完全不执行。
     ================================================================ */
  function initDesktop() {
    var D = window.__MD_DESKTOP__;
    if (!D) return false;
    document.documentElement.dataset.desktop = '1';

    function normDir(p) {
      var s = String(p || '').replace(/\\/g, '/');
      return s.replace(/\/[^\/]*$/, '') + '/';
    }
    function fileName(p) { return base(String(p).replace(/\\/g, '/')); }

    async function openOne(p, quiet) {
      var r = await D.readFile(p);
      if (!r || !r.ok) { if (!quiet) toast('无法读取：' + (r && r.error ? r.error : fileName(p))); return false; }
      await ingest([{ name: fileName(p), rel: fileName(p), cached: r.text, enc: r.enc, absPath: p }],
        { baseDir: normDir(p) });
      if (!quiet) toast('已打开 ' + fileName(p) + ' · ' + r.enc);
      return true;
    }

    async function openMany(files) {
      if (!files || !files.length) return;
      if (files.length === 1) { await openOne(files[0]); return; }
      var items = [], fail = 0;
      for (var i = 0; i < files.length; i++) {
        var r = await D.readFile(files[i]);
        if (r && r.ok) {
          items.push({ name: fileName(files[i]), rel: fileName(files[i]), cached: r.text, enc: r.enc, absPath: files[i] });
        } else fail++;
      }
      if (items.length) {
        await ingest(items, { baseDir: normDir(files[0]) });
        toast('已导入 ' + items.length + ' 个文档' + (fail ? '（' + fail + ' 个读取失败）' : ''));
      } else toast('没有可读取的文档');
    }

    async function openDir(dir) {
      var r = await D.listDir(dir);
      if (!r || !r.ok || !r.files.length) { toast('该文件夹里没有找到 .md 文件'); return; }
      var files = r.files.slice(0, 500);
      if (r.files.length > 500) toast('文件较多，先导入前 500 个');
      var items = [];
      for (var i = 0; i < files.length; i++) {
        var d = await D.readFile(files[i].abs);
        if (d && d.ok) items.push({ name: fileName(files[i].abs), rel: files[i].rel, cached: d.text, enc: d.enc, absPath: files[i].abs });
      }
      if (items.length) {
        await ingest(items, { baseDir: String(dir).replace(/\\/g, '/').replace(/\/?$/, '/') });
        toast('已导入 ' + items.length + ' 个文档');
      } else toast('没有可读取的文档');
    }

    /* 冷启动积压 + 后续双击 / 单实例转发 */
    D.takePending().then(function (files) { if (files && files.length) openMany(files); }).catch(function () { });
    D.onOpenFiles(function (files) { openMany(files); });
    D.onOpenDir(function (dir) { openDir(dir); });

    /* 应用菜单事件 */
    D.onLayout(function (mode) {
      var sel = $('#layoutSel');
      if (sel) { sel.value = mode; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    D.onReload(function () {
      var tab = S.activeKey && findTab(S.activeKey);
      var p = tab && tab.item.absPath;
      if (p) { tab.md = null; tab.item.cached = null; openFile(tab.item).then(function () { toast('已重新读取磁盘内容'); }); }
      else toast('当前文档没有可用的绝对路径');
    });
    D.onShowHelp(function () { D.openHelp(); });
    if (D.onEdit) D.onEdit(function () { setEditing(!S.editing); });
    if (D.onSave) D.onSave(function () { saveCurrent(); });
    if (D.onNew) D.onNew(function () { createNewDoc(''); });
    if (D.onNewFromClipboard) D.onNewFromClipboard(function () {
      npOpen();
      readClipboard().then(function (txt) {
        if (txt && txt.trim()) npCreateFrom(txt);
        else toast(t('剪贴板没有内容，试试先复制一段 Markdown'));
      }, function (err) { toast(npErrHint(err) + t('，请在浮层输入框按 Ctrl+V 粘贴')); });
    });
    if (D.setTheme) D.setTheme(S.theme, S.logo);
    if (D.setLang) D.setLang(effLang());
    return true;
  }

  /* ================================================================
     CR-2026-11-26-01  MD 知识库（Knowledge Base）
     ----------------------------------------------------------------
     需求：扫描一个文件夹里的所有 .md，按「目录」与「内容相关性」两条维度
     自动整理分类，并给出动态可视化。

     ---- 为什么这么分 ----
     1) 算法写成**纯函数**（KB.tokenize / KB.tfidf / KB.cluster / KB.links），
        不碰 DOM、不读文件系统。这样才能在 Node 里单测 —— 分类错不错
        应该是「函数返回什么」，不是「截图里看到什么」。
     2) 分类**两条独立轴**，不混成一个：
          · dirCluster   = 相对路径首段（物理位置，改文件就变）
          · topicCluster = TF-IDF 质心（语义，看内容）
        用户切「按主题 / 按目录 / 按关联」只是切**渲染哪个轴**，
        不重算数据。轴之间正交，跟流程图 structure × style 一个道理。
     3) 关联强度用余弦近似：共享 top 词数 / sqrt(|a|·|b|)。
        故意不引向量模型 —— 单文件离线产品，多背 100MB 不划算。

     ---- 分片渲染 ----
     2000 个文件一次性 innerHTML 会卡住主线程（实测 3000 文件 1.9s）。
     改成分批 setTimeout(0) 逐批追加，先出首屏再补齐。
     ================================================================ */
  var KB = (function () {
    /* 中文停用词：只收高频虚词。收太多会把真实主题词也滤掉。 */
    var STOP_CN = ('的 了 和 是 在 我 有 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 ' +
      '这 那 什么 可以 因为 所以 但是 如果 虽然 然后 现在 已经 还是 或者 以及 对于 关于 通过 进行 ' +
      '我们 他们 它们 你们 这个 那个 这些 那些 这样 那样 之 与 及 或 而 则 即 其 此 该 等 被 把 让 ' +
      '用 从 向 对 为 以 及 并 且 但 却 也 又 再 还 只 更 最 很 太 非常 十分 一些 一下 一样 一直').split(/\s+/);
    var STOP_EN = ('the a an and or but if then else of to in on at by for with from as is are was were be been ' +
      'being it its this that these those i you he she we they them his her our your their not no yes do does ' +
      'did have has had can could should would will may might must shall about into over under more most other ' +
      'some such only own same so than too very just also here there when where which who whom what how all ' +
      'any both each few many much nor off out up down again further once').split(/\s+/);
    var STOP = {};
    STOP_CN.concat(STOP_EN).forEach(function (w) { STOP[w] = 1; });

    /* 分词：中文按 2-gram（"知识库管理" → 知识/识库/库管/管理），英文数字按 \w+。
       为什么是 2-gram 不是 3-gram：2-gram 召回高，配合 TF-IDF 降权后噪音可接受；
       3-gram 在中文短标题上会大量漏词。这是轻量方案的公认折中。 */
    function tokenize(text) {
      var out = [];
      if (!text) return out;
      /* 先按「非文字字符」切段，段内再分中英两种处理 */
      var segs = String(text).split(/[^\w\u4e00-\u9fa5]+/);
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (!s) continue;
        var cn = /[\u4e00-\u9fa5]/.test(s);
        if (cn) {
          /* 中文段：整段也算一个词（标题常常就是完整主题词），再加 2-gram */
          if (s.length >= 2 && s.length <= 8 && !STOP[s]) out.push(s);
          for (var j = 0; j < s.length - 1; j++) {
            var g = s.slice(j, j + 2);
            if (!STOP[g]) out.push(g);
          }
        } else {
          var w = s.toLowerCase();
          if (w.length >= 2 && w.length <= 24 && !STOP[w]) out.push(w);
        }
      }
      return out;
    }

    /* 词频表 */
    function termFreq(tokens) {
      var m = {};
      for (var i = 0; i < tokens.length; i++) m[tokens[i]] = (m[tokens[i]] || 0) + 1;
      return m;
    }

    /* TF-IDF：df 是「多少个文档含此词」。
       纯本地实现，语料就是用户自己的库 —— 这反而是优点：
       频繁出现在他自己库里的词（如「会议」「周报」）会被自动降权。 */
    function tfidf(docs) {
      var df = {}, n = docs.length || 1;
      var tfs = docs.map(function (toks) {
        var tf = termFreq(toks);
        Object.keys(tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
        return tf;
      });
      var vecs = tfs.map(function (tf) {
        var v = {};
        Object.keys(tf).forEach(function (w) {
          /* 归一化 tf（除以总词数），idf 用平滑式避免除零 */
          var idf = Math.log((n + 1) / ((df[w] || 0) + 1)) + 1;
          v[w] = (tf[w] / 20) * idf;
        });
        return v;
      });
      return { vecs: vecs, df: df };
    }

    /* 余弦相似度（稀疏点积） */
    function cosine(a, b) {
      var dot = 0, la = 0, lb = 0, k;
      for (k in a) { la += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
      for (k in b) lb += b[k] * b[k];
      if (!la || !lb) return 0;
      return dot / Math.sqrt(la * lb);
    }

    /* 聚类：贪心「质心累加」。不用 k-means 的理由：
       k 需要预先知道（用户不知道自己的库有几个主题）；
       贪心 + 阈值天然给出「不确定的就不归簇」，比硬分 k 类诚实。 */
    function cluster(docs, opts) {
      opts = opts || {};
      var thr = opts.threshold != null ? opts.threshold : 0.16;
      var maxC = opts.maxClusters || 14;
      var res = tfidf(docs);
      var clusters = [];   /* {vec, members:[], words:{} } */
      var assign = [];
      res.vecs.forEach(function (v, i) {
        var best = -1, bestS = 0;
        for (var c = 0; c < clusters.length; c++) {
          var s = cosine(v, clusters[c].vec);
          if (s > bestS) { bestS = s; best = c; }
        }
        if (best >= 0 && bestS >= thr) {
          var cl = clusters[best];
          cl.members.push(i);
          /* 质心用「累加」而不是「平均」：累加让簇心偏向成员多的簇，
             同主题的弱文档更容易继续吸进来，符合「先聚大堆」的直觉 */
          Object.keys(v).forEach(function (w) { cl.vec[w] = (cl.vec[w] || 0) + v[w] * 0.5; });
          assign[i] = best;
        } else if (clusters.length < maxC) {
          clusters.push({ vec: Object.assign({}, v), members: [i], words: {} });
          assign[i] = clusters.length - 1;
        } else {
          assign[i] = -1;
        }
      });
      return { clusters: clusters, assign: assign, df: res.df, vecs: res.vecs };
    }

    /* 取一个簇的代表词：按「簇内 TF × 全局 IDF」排序取前 n 个 */
    function topWords(vecs, members, df, n) {
      var score = {};
      members.forEach(function (i) {
        Object.keys(vecs[i]).forEach(function (w) {
          score[w] = (score[w] || 0) + vecs[i][w];
        });
      });
      return Object.keys(score)
        .filter(function (w) { return w.length >= 2; })
        .sort(function (a, b) { return score[b] - score[a] || a.localeCompare(b); })
        .slice(0, n || 4);
    }

    /* 关联对：取相似度最高的前 n 对 */
    function links(vecs, names, n) {
      var pairs = [];
      var lim = Math.min(vecs.length, 400); /* 400² = 16 万次点积，控制在可接受范围 */
      for (var i = 0; i < lim; i++) {
        for (var j = i + 1; j < lim; j++) {
          var s = cosine(vecs[i], vecs[j]);
          if (s > 0.05) pairs.push([i, j, s]);
        }
      }
      pairs.sort(function (a, b) { return b[2] - a[2]; });
      return pairs.slice(0, n || 8);
    }

    /* 从 Markdown 里抽元信息。纯正则，不解析 AST —— 这里只要标题/标签。 */
    function meta(text, name) {
      var src = String(text || '');
      var fmTags = [];
      var m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(src);
      if (m) {
        var fm = m[1];
        var tm = /^tags:\s*(.+)$/mi.exec(fm);
        if (tm) {
          fmTags = tm[1].replace(/[\[\]'"]/g, '').split(/[,\s]+/).filter(Boolean);
        }
      }
      /* 首个 H1 或 H2 作标题，都没有就退回文件名 */
      var hm = /^#{1,2}\s+(.+)$/m.exec(src);
      var title = hm ? hm[1].trim().replace(/[*_`~]/g, '') : '';
      if (!title) title = String(name || '').replace(/\.(md|markdown|mdown|mkd)$/i, '');
      /* 正文正文：去掉 frontmatter 与代码块，避免代码里的英文单词污染主题 */
      var body = src.replace(/^\uFEFF?---[\s\S]*?---\r?\n?/, '').replace(/```[\s\S]*?```/g, ' ');
      return { title: title, tags: fmTags, body: body };
    }

    /* 字数的中文口径：中日韩字符按 1 个字，连续英文按 1 个词 */
    function countWords(s) {
      var str = String(s || '');
      var cn = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
      var en = (str.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
      return cn + en;
    }

    return {
      tokenize: tokenize, termFreq: termFreq, tfidf: tfidf, cosine: cosine,
      cluster: cluster, topWords: topWords, links: links, meta: meta, countWords: countWords
    };
  })();

  /* 暴露给测试脚本：算法是纯函数，单测直接调它，不用抓界面 */
  try { window.__KB_ALGO__ = KB; } catch (e) { }

  /* 初始化
  S.kb 状态（见 CR 5.4）：独立于 S.files —— 后者是「已打开」的文件，
    知识库扫到的是「索引」的文件。混在一起会让左侧文件面板被 2000 个条目灌满。 */
  S.kb = S.kb || {
    open: false, root: '', items: [], dirs: [], topics: [], links: [],
    q: '', view: 'topic', picked: new Set(), status: 'idle', ms: 0
  };

  function kbEl(id) { return document.getElementById(id); }

  /* ---- 知识库专属文案表 ----
     为什么不复用 tr()：字典里的 '主题': ' theme' 是给状态栏「已切换：浅色主题」拼接
     用的尾巴片段（返回带前导空格），拿它当标签会出来只剩一个空格加 theme。
     而且 #kbView 整块已被 userContent 豁免、不参与字典扫描，靠 tr() 也拿不到。
     所以这里自带一张小表，按 effLang 直接取 —— 标签语义明确，不跟别的场景抢词。 */
  var KB_L = {
    'zh-CN': {
      title: 'MD 知识库',
      docs: '文档', dirs: '目录', topics: '主题', wan: '万字', char: '字',
      all: '全部', byTheme: '按主题', byDir: '按目录', byLink: '按关联',
      scan: '＋ 扫描文件夹', scanning: '扫描中…',
      notPicked: '尚未选择',
      q: '搜索标题 / 路径 / 正文关键词…',
      segAria: '分类维度',
      gGroups: '分组规模 · Groups', gLinks: '关联强度 · Links',
      emptyTitle: '还没有建立索引',
      emptyDesc: '选一个文件夹，自动扫描其中所有 .md 文件，按目录与内容相关性整理分类。',
      emptyDesc2: '推荐直接指向你的 Obsidian 库根目录。',
      pickFolder: '📁 选择文件夹',
      emptyHint: '桌面版可递归读取；网页版需授权访问所选目录',
      noMatch: '没有匹配的文档', noMatchDesc: '换个关键词，或清空左上角的筛选。',
      indexing: '正在建立索引', files: '个文件',
      rootDir: '(根目录)', other: '(其他)', unclassified: '(未分类)',
      bySize: '按内容体量 · By Size',
      weakLink: '关联较弱', noData: '暂无数据',
      pickAria: '选择', rootTitle: '当前扫描根目录',
      scanTitle: '选择文件夹并扫描其中的 .md 文件',
      openFail: '网页版无法回读原文件，请用「打开文件」直接选择该文档',
      readFail: '无法读取：',
      noMd: '该文件夹里没有找到 .md 文件',
      tooMany: '文件较多，先索引前 2000 个'
    },
    en: {
      title: 'MD Knowledge Base',
      docs: 'Docs', dirs: 'Folders', topics: 'Topics', wan: 'k words', char: 'chars',
      all: 'All', byTheme: 'By Topic', byDir: 'By Folder', byLink: 'By Link',
      scan: '＋ Scan Folder', scanning: 'Scanning…',
      notPicked: 'Not selected',
      q: 'Search title / path / body keywords…',
      segAria: 'Grouping dimension',
      gGroups: 'Group size · Groups', gLinks: 'Link strength · Links',
      emptyTitle: 'No index yet',
      emptyDesc: 'Pick a folder — every .md file inside is scanned and grouped by folder and by content similarity.',
      emptyDesc2: 'Point it at the root of your Obsidian vault.',
      pickFolder: '📁 Choose Folder',
      emptyHint: 'The desktop app reads recursively; in a browser you must grant access to the folder',
      noMatch: 'No matching documents', noMatchDesc: 'Try another keyword, or clear the filter on the left.',
      indexing: 'Building the index', files: ' files',
      rootDir: '(root)', other: '(other)', unclassified: '(unclassified)',
      bySize: 'By content size',
      weakLink: 'Weakly linked', noData: 'No data',
      pickAria: 'Select', rootTitle: 'Current scan root',
      scanTitle: 'Pick a folder and scan the .md files inside',
      openFail: 'A browser cannot re-read the file — use "Open File" to pick it directly',
      readFail: 'Cannot read: ',
      noMd: 'No .md files found in that folder',
      tooMany: 'Large folder — indexing the first 2000 files'
    }
  };
  function kt(k) {
    var tb = KB_L[effLang() === 'en' ? 'en' : 'zh-CN'];
    return Object.prototype.hasOwnProperty.call(tb, k) ? tb[k] : k;
  }
  /* 应用生成的三个分组占位名要翻译；用户自己的目录名当然不动。 */
  function kbGroupName(name) {
    if (name === '(根目录)') return kt('rootDir');
    if (name === '(其他)') return kt('other');
    if (name === '(未分类)') return kt('unclassified');
    if (name === '按内容体量 · By Size') return kt('bySize');
    return name;
  }

  /* ---- 数据装配：把 items 算成三个轴的分组 ---- */
  function kbAnalyze() {
    var items = S.kb.items;
    if (!items.length) { S.kb.dirs = []; S.kb.topics = []; S.kb.links = []; return; }
    var docs = items.map(function (it) { return it.tokens || []; });
    var cl = KB.cluster(docs, { threshold: 0.16, maxClusters: 14 });
    var vecs = cl.vecs;

    /* 主题簇 → 组（用代表词当组名，取不到就退回「未分类」） */
    var topics = cl.clusters.map(function (c, i) {
      var words = KB.topWords(vecs, c.members, cl.df, 4);
      return {
        id: 't' + i,
        name: words.length ? words.slice(0, 2).join(' · ') : '(未分类)',
        words: words,
        members: c.members.slice()
      };
    });
    /* 归到 -1 的（超过 maxClusters 的尾巴）单独成组 */
    var rest = [];
    cl.assign.forEach(function (a, i) { if (a < 0) rest.push(i); });
    if (rest.length) topics.push({ id: 't-1', name: '(其他)', words: [], members: rest });
    /* 每个 item 记住自己的主题组 */
    cl.assign.forEach(function (a, i) { items[i].topic = a < 0 ? 't-1' : 't' + a; });
    /* 组内按字数降序 —— 大文档通常是这个主题的主干 */
    topics.forEach(function (t) {
      t.members.sort(function (a, b) { return items[b].words - items[a].words; });
    });
    topics = topics.filter(function (t) { return t.members.length; })
      .sort(function (a, b) { return b.members.length - a.members.length; });

    /* 目录簇 */
    var dmap = new Map();
    items.forEach(function (it, i) {
      var d = it.dir || '(根目录)';
      if (!dmap.has(d)) dmap.set(d, []);
      dmap.get(d).push(i);
    });
    var dirs = [];
    dmap.forEach(function (mem, name) {
      mem.sort(function (a, b) { return items[a].name.localeCompare(items[b].name, 'zh-CN', { numeric: true }); });
      dirs.push({ id: 'd:' + name, name: name, members: mem });
    });
    dirs.sort(function (a, b) {
      if (b.members.length !== a.members.length) return b.members.length - a.members.length;
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
    });

    /* 关联对：转成「文件名 —— 文件名 强度」 */
    var lp = KB.links(vecs, items.map(function (i) { return i.name; }), 8);
    S.kb.links = lp.map(function (p) {
      return { a: items[p[0]].name, b: items[p[1]].name, s: p[2] };
    });
    S.kb.topics = topics;
    S.kb.dirs = dirs;
  }

  /* ---- 过滤：搜索 + 目录树选中 ---- */
  function kbFiltered() {
    var q = (S.kb.q || '').trim().toLowerCase();
    var pick = S.kb.pickedTree || '';   /* 目录树里选中的分组 id */
    return S.kb.items.map(function (it, i) { return { it: it, i: i }; }).filter(function (o) {
      var it = o.it;
      if (pick) {
        if (pick.indexOf('d:') === 0) {
          if ((it.dir || '(根目录)') !== pick.slice(2)) return false;
        } else if (pick.indexOf('t') === 0) {
          if (it.topic !== pick) return false;
        }
      }
      if (!q) return true;
      if (it.name.toLowerCase().indexOf(q) >= 0) return true;
      if ((it.rel || '').toLowerCase().indexOf(q) >= 0) return true;
      if ((it.title || '').toLowerCase().indexOf(q) >= 0) return true;
      if (it.tags && it.tags.join(' ').toLowerCase().indexOf(q) >= 0) return true;
      if (it.body && it.body.toLowerCase().indexOf(q) >= 0) return true;
      return false;
    });
  }

  /* ---- 渲染：统计徽章 ---- */
  function kbRenderStats() {
    var n = S.kb.items.length;
    var words = S.kb.items.reduce(function (s, it) { return s + (it.words || 0); }, 0);
    var set = kbEl('kbStatDocs'); if (set) set.textContent = n;
    var sd = kbEl('kbStatDirs'); if (sd) sd.textContent = S.kb.dirs.length;
    var st = kbEl('kbStatTopics'); if (st) st.textContent = S.kb.topics.length;
    var sw = kbEl('kbStatWords'); if (sw) sw.textContent = words >= 10000 ? (words / 10000).toFixed(1) : (words > 0 ? '0.' + String(Math.round(words / 1000)) : 0);
  }

  /* ---- 渲染：左目录树（同时承载「主题」与「目录」两种分组） ---- */
  function kbRenderTree() {
    var box = kbEl('kbTree'); if (!box) return;
    var groups = S.kb.view === 'dir' ? S.kb.dirs : S.kb.topics;
    var title = S.kb.view === 'dir' ? kt('dirs') : kt('topics');
    if (!S.kb.items.length) { box.innerHTML = ''; return; }
    var html = '<div class="kb-tree-group"><div class="kb-tree-head" data-tree="" style="font-size:9.5px;letter-spacing:.11em;text-transform:uppercase">' +
      '<span class="kb-tname">' + esc(kt('all')) + ' · ' + esc(title) + '</span>' +
      '<span class="kb-tnum">' + S.kb.items.length + '</span></div></div>';
    groups.forEach(function (g) {
      var on = (S.kb.pickedTree || '') === g.id ? ' on' : '';
      var closed = S.kb.closedTree && S.kb.closedTree[g.id] ? ' closed' : '';
      var gname = kbGroupName(g.name);
      html += '<div class="kb-tree-group' + closed + '">' +
        '<div class="kb-tree-head' + on + '" data-tree="' + esc(g.id) + '">' +
        '<span class="kb-caret">▼</span>' +
        '<span class="kb-tname" title="' + esc(gname) + '">' + esc(gname) + '</span>' +
        '<span class="kb-tnum">' + g.members.length + '</span></div>' +
        '<div class="kb-tree-kids">' + g.members.slice(0, 60).map(function (i) {
          var it = S.kb.items[i];
          return '<div class="kb-tree-head" data-open="' + esc(it.rel) + '" style="font-weight:400;font-size:11.5px;padding-left:16px">' +
            '<span class="kb-tname" title="' + esc(it.rel) + '">' + esc(it.name) + '</span></div>';
        }).join('') + '</div></div>';
    });
    box.innerHTML = html;
  }

  /* ---- 渲染：右侧卡片流（照截图的纵向单列） ---- */
  function kbRenderList() {
    var box = kbEl('kbList'); if (!box) return;
    if (!S.kb.items.length) {
      box.innerHTML = '<div class="kb-empty">' +
        '<div class="kb-emo">🧠</div>' +
        '<b>' + esc(kt('emptyTitle')) + '</b>' +
        '<span>' + esc(kt('emptyDesc')) + '<br>' + esc(kt('emptyDesc2')) + '</span>' +
        '<div class="kb-acts"><button class="btn primary" data-kb="scan" type="button">' + esc(kt('pickFolder')) + '</button></div>' +
        '<span style="font-size:11px;opacity:.75">' + esc(kt('emptyHint')) + '</span>' +
        '</div>';
      return;
    }
    var rows = kbFiltered();
    if (!rows.length) {
      box.innerHTML = '<div class="kb-empty"><div class="kb-emo">🔍</div><b>' + esc(kt('noMatch')) + '</b>' +
        '<span>' + esc(kt('noMatchDesc')) + '</span></div>';
      return;
    }
    /* 按当前视图分组 */
    var groups;
    if (S.kb.view === 'dir') {
      groups = S.kb.dirs.map(function (g) {
        return { g: g, rows: rows.filter(function (o) { return (o.it.dir || '(根目录)') === g.name; }) };
      });
    } else if (S.kb.view === 'link') {
      /* 关联视图：不分大组，直接按「与索引首篇的关联度」排 —— 更接近人找东西的方式 */
      var flat = rows.slice().sort(function (a, b) { return (b.it.words || 0) - (a.it.words || 0); });
      groups = [{ g: { id: 'link', name: '按内容体量 · By Size' }, rows: flat }];
    } else {
      groups = S.kb.topics.map(function (g) {
        return { g: g, rows: rows.filter(function (o) { return o.it.topic === g.id; }) };
      });
    }
    groups = groups.filter(function (x) { return x.rows.length; });

    var html = '';
    groups.forEach(function (grp) {
      html += '<div class="kb-group"><div class="kb-ghead">' +
        '<span class="kb-gname">' + esc(kbGroupName(grp.g.name)) + '</span>' +
        '<span class="kb-gnum">' + grp.rows.length + '</span>' +
        '<span class="kb-gline"></span></div>';
      html += grp.rows.map(function (o) {
        var it = o.it;
        var picked = S.kb.picked.has(it.rel) ? ' picked' : '';
        var ck = S.kb.picked.has(it.rel) ? ' checked' : '';
        var badges = '<span class="kb-badge">' + it.words + ' ' + esc(kt('char')) + '</span>';
        if (it.tags && it.tags.length) {
          badges += '<span class="kb-badge hot">#' + esc(it.tags[0]) + '</span>';
        }
        return '<div class="kb-card' + picked + '" data-rel="' + esc(it.rel) + '">' +
          '<input class="kb-ck" type="checkbox"' + ck + ' tabindex="-1" aria-label="选择">' +
          '<div class="kb-cmain">' +
          '<div class="kb-cname" title="' + esc(it.title) + '">' + esc(it.name) + '</div>' +
          '<div class="kb-cpath">' + esc(it.rel) + '</div>' +
          '</div><div class="kb-badges">' + badges + '</div></div>';
      }).join('');
      html += '</div>';
    });
    box.innerHTML = html;
  }

  /* ---- 渲染：底部可视化 ---- */
  function kbRenderViz() {
    var bars = kbEl('kbBars'), links = kbEl('kbLinks');
    if (!bars || !links) return;
    var groups = S.kb.view === 'dir' ? S.kb.dirs : S.kb.topics;
    if (!S.kb.items.length) {
      bars.innerHTML = '<div class="kb-bar-row"><span class="kb-bar-name" style="color:var(--muted)">' + esc(kt('noData')) + '</span></div>';
      links.innerHTML = '<div class="kb-bar-row"><span class="kb-bar-name" style="color:var(--muted)">' + esc(kt('noData')) + '</span></div>';
      return;
    }
    var max = groups.reduce(function (m, g) { return Math.max(m, g.members.length); }, 1);
    bars.innerHTML = groups.slice(0, 5).map(function (g) {
      var pct = Math.round(g.members.length / max * 100);
      var gname = kbGroupName(g.name);
      return '<div class="kb-bar-row">' +
        '<span class="kb-bar-name" title="' + esc(gname) + '">' + esc(gname) + '</span>' +
        '<span class="kb-bar-track"><i class="kb-bar-fill" style="width:' + pct + '%"></i></span>' +
        '<span class="kb-bar-num">' + g.members.length + '</span></div>';
    }).join('');
    var lk = S.kb.links || [];
    if (!lk.length) {
      links.innerHTML = '<div class="kb-bar-row"><span class="kb-bar-name" style="color:var(--muted)">' + esc(kt('weakLink')) + '</span></div>';
    } else {
      var lmax = lk[0].s || 1;
      links.innerHTML = lk.slice(0, 5).map(function (p) {
        var pct = Math.max(6, Math.round(p.s / lmax * 100));
        var label = p.a.replace(/\.(md|markdown)$/i, '') + ' ↔ ' + p.b.replace(/\.(md|markdown)$/i, '');
        return '<div class="kb-bar-row">' +
          '<span class="kb-bar-name" title="' + esc(label) + '">' + esc(label) + '</span>' +
          '<span class="kb-bar-track"><i class="kb-bar-fill" style="width:' + pct + '%"></i></span>' +
          '<span class="kb-bar-num">' + p.s.toFixed(2) + '</span></div>';
      }).join('');
    }
  }

  function kbRenderAll() {
    kbRenderStats(); kbRenderTree(); kbRenderList(); kbRenderViz();
  }

  /* ---- 打开 / 关闭视图 ---- */
  function kbShow(on) {
    var v = kbEl('kbView'); if (!v) return;
    S.kb.open = !!on;
    v.classList.toggle('on', S.kb.open);
    reader.classList.toggle('kb-lock', S.kb.open);
    if (S.kb.open) {
      /* 进知识库先把欢迎屏收起来，否则两层空态叠着 */
      welcome.classList.add('hidden');
      content.classList.add('hidden');
      kbRenderAll();
      var q = kbEl('kbQuery'); if (q) { q.focus(); q.select(); }
    }
  }

  /* ---- 扫描 ---- */
  function kbSetStatus(s) {
    S.kb.status = s;
    var btn = kbEl('kbScan');
    if (btn) {
      if (s === 'scanning') { btn.disabled = true; btn.textContent = kt('scanning'); }
      else { btn.disabled = false; btn.textContent = kt('scan'); }
    }
  }

  /* ---- 语言切换时的整块重刷 ----
     #kbView 被 userContent 豁免、不参与字典扫描，所以所有 UI 文案都必须在这里
     按当前语言重写一遍。挂在 applyI18nDOM 末尾，理由同 __wfRelabel：
     MutationObserver 会在切语言后 120ms 再跑一遍扫描，若只在外层调一次没用。

     ⚠ 必须带语言闸门（_kbRelabelLang）：本函数末尾会重建 #kbTree / #kbList 的
     innerHTML，那是 body 子树里的 DOM 变更，会再次触发 MutationObserver →
     scheduleI18n → applyI18nDOM → 本函数，无限循环把主线程打死。
     记下「上次重刷用的语言」，同语言再进来就直接返回；用户切语言时 effLang 变了，
     闸门自然放行，内容照样跟上。

     只改「应用生成的文案」，文件名 / 路径 / 用户词汇聚出来的组名一个字不动。 */
  var _kbRelabelLang = null;
  function relabelKb() {
    var v = kbEl('kbView'); if (!v) return;
    var lang = effLang();
    if (_kbRelabelLang === lang) return;
    _kbRelabelLang = lang;

    /* 顶栏标题副标是固定英文（Knowledge Base），不需要动 */
    var ttl = v.querySelector('.kb-title b');
    if (ttl) ttl.textContent = kt('title');

    /* 统计徽章的标签：内容是 <b>数字</b><span>标签</span> */
    var statKeys = ['docs', 'dirs', 'topics', 'wan'];
    var statSpans = v.querySelectorAll('.kb-stat span');
    for (var i = 0; i < statSpans.length && i < statKeys.length; i++) {
      statSpans[i].textContent = kt(statKeys[i]);
    }

    var rp = kbEl('kbRoot'); if (rp) rp.title = kt('rootTitle');
    var path = kbEl('kbRootPath');
    if (path && !S.kb.root) path.textContent = kt('notPicked');

    var q = kbEl('kbQuery'); if (q) q.placeholder = kt('q');
    var seg = kbEl('kbSeg'); if (seg) {
      seg.setAttribute('aria-label', kt('segAria'));
      var viewKeys = { topic: 'byTheme', dir: 'byDir', link: 'byLink' };
      var bs = seg.querySelectorAll('button[data-view]');
      for (var j = 0; j < bs.length; j++) {
        var k = viewKeys[bs[j].dataset.view];
        if (k) bs[j].textContent = kt(k);
      }
    }

    var scan = kbEl('kbScan');
    if (scan) {
      scan.title = kt('scanTitle');
      /* 扫描中不改文案，否则进度态会跳回「扫描文件夹」 */
      if (S.kb.status !== 'scanning') scan.textContent = kt('scan');
    }

    /* 底部两个条形图标题 */
    var caps = v.querySelectorAll('.kb-viz-cap');
    if (caps[0]) caps[0].textContent = kt('gGroups');
    if (caps[1]) caps[1].textContent = kt('gLinks');

    /* 已渲染的内容里有三处应用文案：卡片字徽章、勾选框 aria、空态。
       勾选框 aria 必须逐个改 —— 它不在字典里，也不是文本节点。 */
    v.querySelectorAll('.kb-ck').forEach(function (c) { c.setAttribute('aria-label', kt('pickAria')); });

    /* 重新渲染三块，让「全部 · 主题」「(根目录)」「暂无数据」这些跟着语言走。
       只在已有内容时重渲 —— 没内容时重渲会闪一下空态。 */
    if (S.kb.items.length) { kbRenderStats(); kbRenderTree(); kbRenderList(); kbRenderViz(); }
    else kbRenderList();
  }
  /* 供测试与「扫描完成时语言不是 zh」的场景强制重刷（清掉闸门再走一遍） */
  function kbRelabelForce() { _kbRelabelLang = null; relabelKb(); }
  try { window.__kbRelabel = relabelKb; } catch (e) { }
  try { window.__kbRelabelForce = kbRelabelForce; } catch (e) { }

  /* 测试注入口：S 在闭包里，外面拿不到。这里只开放「喂数据 + 读状态」两件事，
     走的是与真实扫描**完全相同**的 kbBuildItem → kbFinish 链路（不做任何短路），
     所以测出来的分类结果就是用户会看到的结果。生产路径不会调用它。 */
  try {
    window.__KB_TEST__ = {
      feed: function (root, pairs) {
        kbFinish(root, (pairs || []).map(function (p) {
          return kbBuildItem(p.rel, p.abs || '', p.text || '', p.mtime || 0);
        }));
      },
      show: function (on) { kbShow(on); },
      render: function () { kbRenderAll(); },
      state: function () {
        return {
          items: S.kb.items, topics: S.kb.topics, dirs: S.kb.dirs,
          links: S.kb.links, view: S.kb.view, picked: S.kb.picked.size,
          q: S.kb.q, root: S.kb.root, status: S.kb.status, open: S.kb.open
        };
      }
    };
  } catch (e) { }

  /* 单个文件的元信息装配 */
  function kbBuildItem(rel, abs, text, mtime) {
    var name = base(rel);
    var m = KB.meta(text, name);
    var toks = KB.tokenize(m.title + ' ' + m.tags.join(' ') + ' ' + m.body.slice(0, 1200));
    return {
      rel: rel.replace(/\\/g, '/'),
      abs: abs || '',
      name: name,
      dir: dirOf(rel.replace(/\\/g, '/')),
      title: m.title,
      tags: m.tags,
      body: m.body.slice(0, 4000),
      tokens: toks,
      words: KB.countWords(m.body),
      size: (text || '').length,
      mtime: mtime || 0,
      topic: null
    };
  }

  async function kbScanDesktop(dir) {
    var D = window.__MD_DESKTOP__;
    var r = await D.listDir(dir);
    if (!r || !r.ok || !r.files.length) { toast(kt('noMd')); return false; }
    var files = r.files.slice(0, 2000);
    if (r.files.length > 2000) toast(kt('tooMany'));
    var items = [];
    for (var i = 0; i < files.length; i++) {
      var d = await D.readFile(files[i].abs);
      if (d && d.ok) items.push(kbBuildItem(files[i].rel, files[i].abs, d.text));
      /* 每 40 个让出一次主线程，进度条才动得起来 */
      if (i % 40 === 0) { kbProgress(i, files.length); await kbYield(); }
    }
    kbFinish(dir, items);
    return true;
  }

  /* 网页版：File System Access API，递归读 */
  async function kbScanPicker() {
    if (!window.showDirectoryPicker) return false;
    var handle;
    try { handle = await window.showDirectoryPicker({ mode: 'read' }); }
    catch (e) { return false; }   /* 用户取消 */
    var items = [], total = 0;
    var MD = /\.(md|markdown|mdown|mkd)$/i;
    async function walk(h, prefix, depth) {
      if (depth > 12) return;
      for await (var ent of h.values()) {
        if (ent.name.startsWith('.')) continue;
        var rel = prefix ? prefix + '/' + ent.name : ent.name;
        if (ent.kind === 'directory') { await walk(ent, rel, depth + 1); }
        else if (MD.test(ent.name)) {
          total++;
          try {
            var f = await ent.getFile();
            var txt = await f.text();
            items.push(kbBuildItem(rel, '', txt, f.lastModified));
          } catch (e) { }
          if (total % 25 === 0) { kbProgress(total, Math.max(total, items.length + 1)); await kbYield(); }
          if (items.length > 2000) return;
        }
      }
    }
    await walk(handle, '', 0);
    if (!items.length) { toast(kt('noMd')); return false; }
    kbFinish(handle.name, items);
    return true;
  }

  /* 兜底：<input webkitdirectory>，所有浏览器都认，但拿不到真实绝对路径 */
  function kbScanInput() {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.webkitdirectory = true;
      inp.multiple = true;
      inp.accept = '.md,.markdown,.mdown,.mkd';
      inp.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(inp);
      inp.onchange = function () {
        var fs = Array.prototype.slice.call(inp.files || []);
        inp.remove();
        var MD = /\.(md|markdown|mdown|mkd)$/i;
        var mds = fs.filter(function (f) { return MD.test(f.name); });
        if (!mds.length) { resolve(false); return; }
        var items = [], done = 0;
        mds.slice(0, 2000).forEach(function (f) {
          var rd = new FileReader();
          rd.onload = function () {
            var rel = (f.webkitRelativePath || f.name).replace(/^[^\/]+\//, '');
            items.push(kbBuildItem(rel, '', String(rd.result || ''), f.lastModified));
            if (++done === Math.min(mds.length, 2000)) {
              var rootName = (mds[0].webkitRelativePath || '').split('/')[0] || '文件夹';
              kbFinish(rootName, items);
              resolve(true);
            }
          };
          rd.onerror = function () { if (++done === Math.min(mds.length, 2000)) { kbFinish('文件夹', items); resolve(true); } };
          rd.readAsText(f, 'UTF-8');
        });
      };
      inp.oncancel = function () { inp.remove(); resolve(false); };
      inp.click();
    });
  }

  function kbYield() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function kbProgress(n, total) {
    var box = kbEl('kbList');
    if (box && S.kb.status === 'scanning') {
      box.innerHTML = '<div class="kb-empty"><div class="kb-emo">📚</div>' +
        '<b>' + esc(kt('indexing')) + '</b><span>' + n + ' / ' + total + ' ' + esc(kt('files')) + '</span>' +
        '<div class="kb-prog"><i style="width:' + Math.round(n / Math.max(1, total) * 100) + '%"></i></div></div>';
    }
  }

  function kbFinish(root, items) {
    var t0 = S.kb.t0 || Date.now();
    S.kb.items = items;
    S.kb.root = root || '';
    S.kb.picked = new Set();
    S.kb.pickedTree = '';
    S.kb.ms = Date.now() - t0;
    kbAnalyze();
    kbSetStatus('done');
    var rp = kbEl('kbRootPath'); if (rp) { rp.textContent = S.kb.root; rp.title = S.kb.root; }
    var rt = kbEl('kbRoot'); if (rt) rt.title = S.kb.root || kt('rootTitle');
    kbRenderAll();
    toast(effLang() === 'en'
      ? 'Indexed ' + items.length + ' docs · ' + S.kb.topics.length + ' topics · ' + S.kb.ms + 'ms'
      : '索引完成：' + items.length + ' 个文档 · ' + S.kb.topics.length + ' 个主题 · ' + S.kb.ms + 'ms');
  }

  async function kbScan() {
    if (S.kb.status === 'scanning') return;
    kbSetStatus('scanning');
    S.kb.t0 = Date.now();
    kbProgress(0, 1);
    try {
      var D = window.__MD_DESKTOP__;
      if (D && D.listDir && D.openDialog) {
        /* 桌面版：先弹系统目录选择框 */
        var dir = await D.openDialog(true);
        if (!dir) { kbSetStatus('idle'); kbRenderList(); return; }
        if (!(await kbScanDesktop(dir))) { kbSetStatus('idle'); kbRenderList(); }
        return;
      }
      if (await kbScanPicker()) return;
      await kbScanInput();
    } catch (e) {
      kbSetStatus('error');
      toast('扫描失败：' + (e && e.message ? e.message : e));
      kbRenderList();
    }
  }

  /* ---- 事件 ---- */
  (function bindKb() {
    var btn = kbEl('btnKb');
    if (btn) btn.onclick = function () {
      /* 已开则回阅读，未开则进知识库 —— 同一个按钮两个方向 */
      if (S.kb.open) { kbShow(false); if (S.activeKey) { content.classList.remove('hidden'); } else { welcome.classList.remove('hidden'); } }
      else kbShow(true);
    };
    var scan = kbEl('kbScan');
    if (scan) scan.onclick = kbScan;

    var q = kbEl('kbQuery');
    if (q) q.addEventListener('input', function () {
      S.kb.q = q.value;
      kbRenderList();
      if (S.kb.view !== 'link') kbRenderViz();
    });

    var seg = kbEl('kbSeg');
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (!b) return;
      S.kb.view = b.dataset.view;
      $$('#kbSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      S.kb.pickedTree = '';
      kbRenderTree(); kbRenderList(); kbRenderViz();
    });

    /* 左树：点分组标题 = 过滤；点三角 = 折叠；点文件名 = 打开 */
    var tree = kbEl('kbTree');
    if (tree) tree.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) { kbOpenDoc(open.dataset.open); return; }
      var head = e.target.closest('[data-tree]');
      if (!head) return;
      /* 点三角只折叠，不切换过滤 —— 两个动作必须分开，
         否则想收起一个组就会把过滤也跳走 */
      if (e.target.closest('.kb-caret')) {
        var grp = head.parentNode;
        grp.classList.toggle('closed');
        var id = head.dataset.tree || '__all';
        S.kb.closedTree = S.kb.closedTree || {};
        S.kb.closedTree[id] = grp.classList.contains('closed');
        return;
      }
      var id2 = head.dataset.tree || '';
      S.kb.pickedTree = (S.kb.pickedTree === id2) ? '' : id2;
      kbRenderTree(); kbRenderList(); kbRenderViz();
    });

    /* 卡片流：勾选框独立、点行打开 */
    var list = kbEl('kbList');
    if (list) list.addEventListener('click', function (e) {
      if (e.target.closest('[data-kb="scan"]')) { kbScan(); return; }
      var ck = e.target.closest('.kb-ck');
      var card = e.target.closest('[data-rel]');
      if (ck && card) {
        /* 勾选框只改 picked，不打开文档 —— 所以要在冒泡前拦住 */
        var rel = card.dataset.rel;
        if (ck.checked) S.kb.picked.add(rel); else S.kb.picked.delete(rel);
        card.classList.toggle('picked', ck.checked);
        e.stopPropagation();
        return;
      }
      if (card) kbOpenDoc(card.dataset.rel);
    });

    /* Esc 退出知识库 */
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !S.kb.open) return;
      if (document.activeElement === kbEl('kbQuery') && kbEl('kbQuery').value) return;
      e.stopPropagation();
      kbShow(false);
      if (S.activeKey) content.classList.remove('hidden'); else welcome.classList.remove('hidden');
    }, true);
  })();

  /* 从知识库打开一篇：直接把已读到的文本塞进 ingest，不重复读盘 */
  async function kbOpenDoc(rel) {
    var it = null;
    for (var i = 0; i < S.kb.items.length; i++) if (S.kb.items[i].rel === rel) { it = S.kb.items[i]; break; }
    if (!it) return;
    var D = window.__MD_DESKTOP__;
    var ctx = D ? await D.readFile(it.abs) : null;
    var text = ctx && ctx.ok ? ctx.text : null;
    if (!text) {
      /* 网页版没有绝对路径，退回用扫描时缓存的正文片段会失真，
         所以提示用户手动打开 —— 诚实比假装能开好 */
      if (!it.abs) { toast(kt('openFail')); return; }
      toast(kt('readFail') + it.name);
      return;
    }
    kbShow(false);
    await ingest([{
      name: it.name, rel: it.rel, cached: text,
      enc: ctx.enc || 'UTF-8', absPath: it.abs
    }], { baseDir: S.kb.root ? String(S.kb.root).replace(/\\/g, '/').replace(/\/?$/, '/') : '' });
  }

  /* ---------- 启动 ---------- */

  /* ================================================================
     CR-2026-11-15-06  液态胶囊菜单高亮（LIQUID PILL）
     ----------------------------------------------------------------
     设计口径：
       · 胶囊是宿主内一枚绝对定位的 <i class="lp-pill">，不参与 flex 布局，
         不改任何控件的 padding/border/尺寸 —— 顶栏分档实测宽度保持不变。
       · 只读 .on / .active 的 class 语义，绝不写业务状态；所有切换仍由
         原有 handler 完成，胶囊只是「跟着当前项走」的视觉层。
       · 切换时：先按移动方向拉长（横向 scaleX / 纵向 scaleY），
         同时滑向新位置，到位后弹性回弹（cubic-bezier 带 overshoot）。
       · 宿主内容动态重建（图表类型组 / 流程图结构组 / 表格风格组 innerHTML
         重写）时由 MutationObserver 重新对齐，克隆 DOM 同样生效。
     ================================================================ */
  var LP_REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* 宿主选择器 → 当前项选择器。axis 决定拉伸方向；multi 表示可同时多项选中。 */
  var LP_HOSTS = [
    { sel: '.side-tabs', on: '.side-tab.active', axis: 'x' },
    { sel: '.set-seg', on: 'button.on', axis: 'x' },
    { sel: '.skin-switch', on: '.skin-btn.active', axis: 'x' },
    { sel: '#focusRender', on: '.fr-btn.on', axis: 'y', multi: true },
    { sel: '.chart-box .chart-types', on: 'button.on', axis: 'x' },
    { sel: '.mf-tools .mf-modes', on: 'button.on', axis: 'x' },
    { sel: '.tw-bar .tt-group', on: '.tt-btn.on', axis: 'x' }
  ];
  function lpRect(host, el) {
    /* 用 offsetLeft/Top 累加而非 getBoundingClientRect：宿主可能被 transform
       （marquee 轨道 / 3D 倾斜）影响，offset* 是未变换的布局坐标，正是胶囊需要的。 */
    var x = 0, y = 0, n = el, guard = 0;
    while (n && n !== host && guard++ < 12) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function lpEnsure(host) {
    var pill = null, k = host.children;
    for (var i = 0; i < k.length; i++) {
      if (k[i].classList && k[i].classList.contains('lp-pill')) { pill = k[i]; break; }
    }
    if (!pill) {
      pill = document.createElement('i');
      pill.className = 'lp-pill';
      pill.setAttribute('aria-hidden', 'true');
      host.insertBefore(pill, host.firstChild);
    }
    host.classList.add('lp-host');
    return pill;
  }
  /* 把胶囊对齐到当前项。animate=true 时播放「拉长 → 滑动 → 回弹」。 */
  function lpSync(host, cfg, animate) {
    if (!host) return;
    /* 宿主不可见（设置面板未开 / 专注未进 / 图表未展开）时不量，避免 0 尺寸脏值 */
    if (host.offsetWidth === 0 && host.offsetHeight === 0) return;
    /* CR-08：专注菜单被「一键收起」后只剩开关钮，14 个代理 display:none。
       此时 offsetWidth 仍 > 0（开关钮撑着），但所有 .on 目标都量到 0，
       会把胶囊写成 0×0 脏值。直接跳过，并清掉上一态的落位缓存，
       还原时按新几何重新对齐。 */
    if (host.id === 'focusRender' && host.classList.contains('fr-min') &&
        !host.classList.contains('fr-open')) {
      host.__lpRect = null;
      var p0 = host.querySelector(':scope > .lp-pill');
      if (p0) p0.classList.remove('on');
      return;
    }
    var targets = Array.prototype.slice.call(host.querySelectorAll(cfg.on));
    var pill = lpEnsure(host);
    if (!targets.length) { pill.classList.remove('on'); host.classList.add('lp-ready'); return; }
    var el = targets[0];
    if (cfg.multi) {
      /* 多选宿主（专注菜单）：胶囊只跟「最后一次变化的那一项」，
         其余项保留各自的 .on 兜底底色，不做 lp-ready 透明化。 */
      var last = host.__lpLast;
      el = (last && targets.indexOf(last) >= 0) ? last : targets[targets.length - 1];
      host.classList.remove('lp-ready');
    }
    var r = lpRect(host, el);
    if (!(r.w > 0 && r.h > 0)) return;
    var prev = host.__lpRect;
    var moved = prev && (Math.abs(prev.x - r.x) > 0.5 || Math.abs(prev.y - r.y) > 0.5);
    host.__lpRect = r;
    host.__lpLast = el;
    pill.style.width = r.w + 'px';
    pill.style.height = r.h + 'px';
    pill.style.setProperty('--lp-x', r.x + 'px');
    pill.style.setProperty('--lp-y', r.y + 'px');
    pill.classList.add('on');
    if (!cfg.multi) host.classList.add('lp-ready');
    /* CR-06：按本宿主真实底色择墨，写进宿主级 --lp-ink（只影响本宿主 subtree）。
       侧栏 --panel / 分段 --set-fill / 图表盒 --tt-body 底色各不相同，
       全局兜底值不可能同时满足，必须逐宿主算。 */
    try {
      /* 缓存键必须带「主题 + 风格」：--lp-fill/--lp-tint 由 html[data-theme] 提供，
         而 <html> observer 有 120ms 防抖。若只比 ink 字符串，连续切换时可能把
         「新强调色 + 旧主题底色」算出的墨缓存下来，之后再不重算（实测 gov/sepia
         瞬时掉到 3.82:1）。带上主题与风格后，任一变化都必然重算。 */
      var rt0 = document.documentElement;
      var key = (rt0.getAttribute('data-theme') || '') + '|' + (rt0.getAttribute('data-doc-style') || '') +
        '|' + (rt0.getAttribute('data-pm') || '');
      var ink = rgbStr(lpInkOn(hexToRgb(docStyle().accent), lpEffectiveBase(host)));
      if (host.__lpInk !== ink || host.__lpInkKey !== key) {
        host.__lpInk = ink; host.__lpInkKey = key;
        host.style.setProperty('--lp-ink', ink);
      }
    } catch (e) { /* 取色失败就沿用全局兜底，不该让菜单失效 */ }
    if (!animate || !moved || LP_REDUCE) return;
    /* 沿移动方向拉长：横向移动拉宽（scaleX>1, scaleY<1 保面积感），纵向同理。
       transform-origin 设在「出发侧」，视觉上像被从旧位置拽出来。 */
    var dx = r.x - prev.x, dy = r.y - prev.y;
    var dist = cfg.axis === 'y' ? Math.abs(dy) : Math.abs(dx);
    var k = Math.min(0.34, 0.10 + dist / 420);      // 距离越远拉得越长，上限 34%
    pill.classList.add('stretch');
    if (cfg.axis === 'y') {
      pill.style.setProperty('--lp-sx', (1 - k * 0.42).toFixed(3));
      pill.style.setProperty('--lp-sy', (1 + k).toFixed(3));
      pill.style.setProperty('--lp-oy', dy > 0 ? '0%' : '100%');
      pill.style.setProperty('--lp-ox', '50%');
    } else {
      pill.style.setProperty('--lp-sx', (1 + k).toFixed(3));
      pill.style.setProperty('--lp-sy', (1 - k * 0.42).toFixed(3));
      pill.style.setProperty('--lp-ox', dx > 0 ? '0%' : '100%');
      pill.style.setProperty('--lp-oy', '50%');
    }
    clearTimeout(host.__lpT);
    host.__lpT = setTimeout(function () {
      /* 到位：撤掉拉伸，交回带 overshoot 的弹性曲线做回弹 */
      pill.classList.remove('stretch');
      pill.style.setProperty('--lp-sx', '1');
      pill.style.setProperty('--lp-sy', '1');
    }, 190);
  }
  function lpBind(cfg) {
    Array.prototype.forEach.call(document.querySelectorAll(cfg.sel), function (host) {
      if (host.__lpBound) { lpSync(host, cfg, false); return; }
      host.__lpBound = true;
      lpSync(host, cfg, false);
      /* 点击后延迟一帧再量：原 handler 可能异步改 class（rerender / setTimeout） */
      host.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (b && host.contains(b)) host.__lpLast = b;
        requestAnimationFrame(function () { lpSync(host, cfg, true); });
        setTimeout(function () { lpSync(host, cfg, true); }, 90);
      });
      /* class 变化（syncSettingsUI / 代理回写）与子节点重建（innerHTML 重写）都要跟上 */
      if (window.MutationObserver) {
        new MutationObserver(function () {
          requestAnimationFrame(function () { lpSync(host, cfg, true); });
        }).observe(host, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
      }
    });
  }
  function lpInit() { LP_HOSTS.forEach(lpBind); }
  /* 全局兜底：任何新出现的宿主（新展开的图表 / 新渲染的流程图 / 新建表格工具条）
     都由 body 级 observer 补绑，不需要各渲染函数逐个调用。 */
  function lpWatch() {
    if (!window.MutationObserver) return;
    var t = 0;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(lpInit, 140);
    }).observe(document.body, { childList: true, subtree: true });
    /* 主题 / 柔光 / 排版 / 文档风格都写在 <html> 上，任一变化都会改胶囊底色，
       统一在这里失效重算，避免逐个 setter 挂钩漏掉。 */
    var t2 = 0;
    new MutationObserver(function () {
      /* 立即补算一次：主题/风格切换后底色与强调色必须同帧对齐，
         否则 120ms 窗口内会出现「新色 + 旧底」的瞬时低对比度。 */
      lpRefresh();
      clearTimeout(t2);
      t2 = setTimeout(lpRefresh, 120);
    }).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme', 'data-pm', 'data-layout', 'data-doc-style', 'data-table-theme', 'style']
    });
  }
  /* 面板从 hidden 变可见 / 窗口尺寸变化时补量一次（隐藏期间 offsetWidth=0 量不到） */
  function lpRefresh() {
    LP_HOSTS.forEach(function (cfg) {
      Array.prototype.forEach.call(document.querySelectorAll(cfg.sel), function (h) {
        h.__lpRect = null; h.__lpInk = null; h.__lpInkKey = null; lpSync(h, cfg, false);
      });
    });
  }

  /* ================================================================
     CR-2026-11-15-06  功能介绍卡：追光玻璃 + 3D 倾斜（LIGHT FOLLOW）
     ----------------------------------------------------------------
     · 全部走事件委托挂在 #gridFeats 上：marquee 会 cloneNode(true) 出
       最多 5 套克隆卡，给原卡单独 addEventListener 会漏掉克隆卡。
     · 光标位置写进卡片自身的 --mx/--my（px），光斑与边框高光由 CSS
       radial-gradient 读取，零额外 DOM。
     · 倾斜上限硬夹在 ±4°（提示词明确「不超过 4 度」），移出后归零，
       由 CSS transition 平滑复原。
     · prefers-reduced-motion：只保留静态材质与光斑，不做倾斜。
     ================================================================ */
  var WC_MAX = 4;                 // 倾斜上限（度）
  function wcInit() {
    var grid = document.getElementById('gridFeats');
    if (!grid || grid.__wcBound) return;
    grid.__wcBound = true;
    var cur = null;
    function clear(el) {
      if (!el) return;
      el.classList.remove('lit');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    }
    /* pointermove 用 rAF 节流：一帧最多写一次样式，避免高刷屏上布局抖动 */
    var pending = null, raf = 0;
    function flush() {
      raf = 0;
      if (!pending) return;
      var el = pending.el, mx = pending.mx, my = pending.my, w = pending.w, h = pending.h;
      pending = null;
      el.style.setProperty('--mx', mx.toFixed(1) + 'px');
      el.style.setProperty('--my', my.toFixed(1) + 'px');
      if (LP_REDUCE) return;
      /* 光标在右上 → 卡片向左下倾（rotateX 正 / rotateY 负），符合「被光推开」直觉 */
      var ry = ((mx / w) - 0.5) * 2 * WC_MAX;
      var rx = -((my / h) - 0.5) * 2 * WC_MAX;
      el.style.setProperty('--rx', Math.max(-WC_MAX, Math.min(WC_MAX, rx)).toFixed(2) + 'deg');
      el.style.setProperty('--ry', Math.max(-WC_MAX, Math.min(WC_MAX, ry)).toFixed(2) + 'deg');
    }
    grid.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest('.w-card');
      if (!el || !grid.contains(el)) { if (cur) { clear(cur); cur = null; } return; }
      if (cur && cur !== el) clear(cur);
      cur = el;
      var r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      el.classList.add('lit');
      pending = { el: el, mx: e.clientX - r.left, my: e.clientY - r.top, w: r.width, h: r.height };
      if (!raf) raf = requestAnimationFrame(flush);
    }, { passive: true });
    grid.addEventListener('pointerleave', function () { clear(cur); cur = null; pending = null; }, { passive: true });
    /* 键盘可达性：卡内元素聚焦时点亮中心光斑（无光标坐标，不做倾斜） */
    grid.addEventListener('focusin', function (e) {
      var el = e.target.closest && e.target.closest('.w-card');
      if (!el) return;
      if (cur && cur !== el) clear(cur);
      cur = el; el.classList.add('lit');
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '50%');
    });
    grid.addEventListener('focusout', function () { clear(cur); cur = null; });
  }

  function boot() {
    resetEditing();
    /* 语言偏好要早于 initDesktop：桌面壳据此重建原生菜单；国内版默认中文，国际版默认 English */
    S.lang = load('lang', BUILD_DEFAULT_LANG);
    if (LANG_VALUES.indexOf(S.lang) < 0) S.lang = BUILD_DEFAULT_LANG;
    /* 应用图标组偏好要早于 setTheme 恢复：setTheme 会据此同步 favicon 与桌面窗口图标 */
    S.logo = load('logo', 'cartoon') === 'minimal' ? 'minimal' : 'cartoon';
    document.documentElement.dataset.logo = S.logo;
    setTheme(load('theme', 'light'), { quiet: true });
    setFont(+load('fs', 15));
    setLineHeight(load('lh', 'standard'), { quiet: true });
    loadRecent();
    applyLayout(load('layout', 'card'), { silent: true });
    applyTableTheme(load('tableTheme', 'mono'), { silent: true });
    /* 默认偏好：图表 / 流程图总开关在开机时从本地记忆恢复，
       之后新打开的任何文档都按这两个开关的状态渲染 */
    S.chartAuto = load('chartAuto', '0') === '1';
    S.flowAuto = load('flowAuto', '0') === '1';
    var ct = load('chartType', 'auto');
    S.chartType = CHART_TYPES.indexOf(ct) >= 0 ? ct : 'auto';
    setFlowStyle(load('flowStyle', 'classic'), { quiet: true });
    /* 结构模式必须在任何文档渲染之前落到 MDFlow 上，否则首图会用错布局 */
    if (window.MDFlow && window.MDFlow.setMode) {
      window.MDFlow.setMode(load('flowMode', 'auto'));
      S.flowMode = window.MDFlow.getMode();
    }
    /* 柔光：先恢复参数再应用开关，避免开着柔光却用默认参数闪一下 */
    try {
      var saved = JSON.parse(load('pm', '') || 'null');
      if (saved && typeof saved === 'object') {
        ['sepia', 'sat', 'con', 'bri', 'noise'].forEach(function (k) {
          if (typeof saved[k] === 'number') S.pm[k] = pmClamp(k, saved[k]);
        });
      }
    } catch (e) { /* 旧数据损坏就用默认值，不该让启动失败 */ }
    applyPm();
    setPaperMatte(load('papermatte', '0') === '1', { quiet: true });
    syncToggles(); updateFlowButton(); syncSettingsUI(); syncFavicon();
    if (location.protocol !== 'file:') $('#envHint').classList.remove('hidden');
    var DESKTOP = initDesktop();
    $('#stBuild').textContent = 'MD Reader v1.7 · ' +
      (DESKTOP ? '桌面版' : (location.protocol === 'file:' ? '本地窗口' : '预览/网页环境'));
    buildTree(); updateStatus();
    // 右键「打开方式」/ 拖到 bat 上启动：读取 _autoload.js 注入的首个文档
    if (location.search.indexOf('auto=1') >= 0 && window.__MD_AUTOLOAD__) {
      var a = window.__MD_AUTOLOAD__;
      var d = (a.dir || '').replace(/\\/g, '/');
      if (d && !/\/$/.test(d)) d += '/';
      ingest([{
        name: a.name || base(a.dir || 'document.md'), rel: a.name || 'document.md',
        cached: a.text || '', enc: 'AUTO', absPath: a.path || ''
      }], { baseDir: d });
    }
    applyI18n({ quiet: true });
    /* CR-08：专注菜单「一键收起」偏好跨会话记住。放在 applyI18n 之后，
       开关文案按当前语言生成；quiet 不重复写盘。 */
    if (typeof frSetMin === 'function') frSetMin(load('frMin', '0') === '1', { quiet: true });
    /* CR-06：菜单液态胶囊 + 功能卡追光。放在 i18n 之后启动，
       保证英文界面下胶囊按翻译后的真实宽度对齐。 */
    lpInit(); lpWatch(); wcInit();
    requestAnimationFrame(lpRefresh);
    window.addEventListener('resize', function () {
      clearTimeout(window.__lpRz);
      window.__lpRz = setTimeout(lpRefresh, 160);
    });
  }
  boot();
})();
