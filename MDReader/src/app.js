/* MD Reader v1.0 — 本地 Markdown 阅读器主逻辑（无网络依赖） */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var content = $('#content'), reader = $('#reader'), welcome = $('#welcome');
  var S = {
    files: [], byKey: new Map(), images: new Map(), current: null, tabs: [], activeKey: null,
    baseDir: '', theme: 'light', layout: 'card', tableTheme: 'mono', fs: 15, tab: 'files', collapsedDirs: new Set(),
    findMarks: [], findIdx: -1, mermaidReady: false, recent: [],
    editing: false, dirty: false, whole: false, blocks: [], gaps: [], editBlock: -1, fm: '',
    flowCfg: null, flowConverted: false, flowDocKey: null
  };
  /* 表格四套风格：CSS 变量在 template.html，这里只管图表色板与 Word 表头色 */
  var TABLE_THEMES = {
    mono: { name: '黑白极简', head: '#111111', headFg: '#ffffff', edge: '#d9d9d9',
      colors: ['#111111', '#4b5563', '#8a94a2', '#1f2328', '#6b7280', '#374151'] },
    tech: { name: '蓝色科技', head: '#2563eb', headFg: '#ffffff', edge: '#c7dbfb',
      colors: ['#2563eb', '#0ea5e9', '#06b6d4', '#6366f1', '#14b8a6', '#3b82f6'] },
    gov: { name: '红色政商', head: '#9b1c1c', headFg: '#ffffff', edge: '#d9c49b',
      colors: ['#9b1c1c', '#c9a227', '#b45309', '#7f1d1d', '#a16207', '#be123c'] },
    cute: { name: '粉色卡通', head: '#ffe4f0', headFg: '#a4447a', edge: '#ffd6e8',
      colors: ['#ff9ec4', '#f472b6', '#e0417f', '#fbbf24', '#c084fc', '#f9a8d4'] }
  };
  function tableTheme() { return TABLE_THEMES[S.tableTheme] || TABLE_THEMES.mono; }
  function chartColors() { return tableTheme().colors; }
  var CALLOUT = {
    note: ['📝', '笔记'], info: ['ℹ️', '信息'], tip: ['💡', '提示'], success: ['✅', '成功'],
    question: ['❓', '问题'], warning: ['⚠️', '警告'], caution: ['⚠️', '注意'],
    danger: ['🚨', '危险'], error: ['❌', '错误'], example: ['📌', '示例'],
    quote: ['💬', '引用'], abstract: ['📄', '摘要'], todo: ['☑️', '待办']
  };

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
    S.files = []; S.byKey.clear(); S.images.clear(); S.baseDir = opts.baseDir || '';
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
      var obj = { name: nm, rel: rel, dir: dirOf(rel), file: it.file || null, cached: it.cached != null ? it.cached : null, enc: it.enc || '', absPath: it.absPath || '' };
      mds.push(obj);
      if (!S.byKey.has(keyOf(nm))) S.byKey.set(keyOf(nm), obj);
    }
    mds.sort(function (a, b) { return a.rel.localeCompare(b.rel, 'zh-CN', { numeric: true }); });
    S.files = mds;
    resetEditing();
    S.tabs = []; S.activeKey = null; S.current = null;
    buildTree();
    updateStatus();
    if (!mds.length) { toast('没有找到 .md 文件'); enterWelcomeView(); renderTabbar(); return 0; }
    var cap = opts.maxTabs || 12;
    for (var j = 0; j < mds.length && j < cap; j++) {
      await openFile(mds[j], null, { activate: j === 0, pushRecent: j === 0 });
    }
    renderTabbar();
    if (mds.length > cap) toast('已打开前 ' + cap + ' 个文档，其余 ' + (mds.length - cap) + ' 个可在左侧文件树点击打开');
    return mds.length;
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
    return '<details class="frontmatter" open><summary>📋 文档属性 · ' + rows.length + '</summary><table><tbody>' + rows.join('') + '</tbody></table></details>';
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
    if (!S.tabs.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    var html = '';
    for (var i = 0; i < S.tabs.length; i++) {
      var t = S.tabs[i], active = t.key === S.activeKey ? ' active' : '';
      html += '<div class="tab' + active + '" data-key="' + esc(t.key) + '" title="' + esc(t.item.rel || t.item.name) + '">' +
        '<span class="tab-ico">📄</span><span class="tab-name">' + esc(t.item.name) + '</span>' +
        '<button class="tab-x" type="button" title="关闭标签" data-close="' + esc(t.key) + '">✕</button></div>';
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
    if (S.editing && S.dirty && !window.confirm('当前文档有未保存的修改，继续会丢失。确定继续吗？')) return;
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
    $('#crumbPath').textContent = tab.item.rel || tab.item.name;
    $('#crumbEnc').textContent = tab.item.enc || '—';
    welcome.classList.add('hidden'); content.classList.remove('hidden');
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
    if (S.activeKey === key) {
      S.activeKey = null; S.current = null;
      var next = S.tabs[idx] || S.tabs[idx - 1] || null;
      if (next) { activateTab(next, { pushRecent: false }); return; }
      enterWelcomeView(); renderTabbar(); updateStatus();
    } else renderTabbar();
  }
  async function render(md, item) {
    var fm = frontmatter(md);
    /* 先剥离 @//md-render-hint/ 范式提示块，避免在正文显示一整段配置注释 */
    var TF = window.MDTextFlow;
    var hint = TF ? TF.parseHint(fm.text) : null;
    var srcText = hint ? hint.text : fm.text;
    S.flowCfg = hint ? hint.cfg : (TF ? TF.DEFAULT : null);
    var key = item ? (item.rel || item.name) : '__welcome__';
    if (S.flowDocKey !== key) { S.flowDocKey = key; S.flowConverted = false; }
    var html = '';
    try { html = marked.parse(preprocess(srcText), { gfm: true, breaks: false }); }
    catch (e) { html = '<p>解析失败：' + esc(e.message) + '</p>'; }
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
    /* 切主题 / 排版重渲染后保持「已转换」状态，避免图形莫名变回文本 */
    if (S.flowConverted && TF && content.querySelector(TF.SEL)) {
      var n = TF.convertAll(content, S.flowCfg || TF.DEFAULT);
      if (!n) S.flowConverted = false;
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
      var rest = p.textContent.trim(), title = meta[1];
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
    return /^-?\d+(\.\d+)?$/.test(v) && isFinite(parseFloat(v));
  }
  function numVal(s) { return parseFloat(String(s).replace(/[,，\s%％¥$￥]/g, '').replace(/[（(]/, '-').replace(/[)）]/, '')) || 0; }
  /* 表格风格：三选一、全局联动、记忆偏好；切换时已展开的图表同步换色 */
  function applyTableTheme(t, opts) {
    opts = opts || {};
    if (!TABLE_THEMES[t]) t = 'mono';
    S.tableTheme = t;
    document.documentElement.dataset.tableTheme = t;
    $$('.tt-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.tt === t); });
    if (opts.silent === true) return;
    save('tableTheme', t);
    $$('.chart-box.show', content).forEach(function (box) {
      var tw = box.closest('.tw'), tbl = tw && tw.querySelector('table');
      if (tbl) drawChart(box, tbl);
    });
    toast('表格风格：' + tableTheme().name);
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
          var ok = drawChart(chartBox, tbl);
          if (ok) { chartBox.classList.add('show'); b.textContent = '收起图表'; }
        }
      };
    });
  }

  function drawChart(box, tbl) {
    var d = tableData(tbl), pal = chartColors();
    if (!d.rows.length) { toast('表格没有数据行'); return false; }
    var nCols = d.head.length || (d.rows[0] || []).length;
    var numCols = [];
    for (var j = 0; j < nCols; j++) {
      var vals = d.rows.map(function (r) { return r[j] || ''; }).filter(function (x) { return x !== ''; });
      if (vals.length && vals.filter(isNum).length >= Math.max(1, Math.floor(vals.length * 0.7))) numCols.push(j);
    }
    var labelCol = numCols.length && numCols.indexOf(0) >= 0 && d.head.length > 1 ? numCols.shift() : -1;
    var series = numCols.slice(0, 6);
    if (!series.length) { toast('未检测到数值列，无法生成图表'); return false; }
    var labels = d.rows.map(function (r, i) {
      var v = labelCol >= 0 ? r[labelCol] : (r.find(function (c) { return !isNum(c); }) || '第' + (i + 1) + '行');
      return String(v).slice(0, 12);
    });
    var allVals = [];
    series.forEach(function (c) { d.rows.forEach(function (r) { allVals.push(numVal(r[c] || 0)); }); });
    var max = Math.max.apply(null, allVals.concat([0])), min = Math.min.apply(null, allVals.concat([0]));
    if (max === min) max = min + 1;
    var W = 780, H = 280, L = 56, R = 18, T = 16, B = 52;
    var pw = W - L - R, ph = H - T - B;
    var yOf = function (v) { return T + ph - (v - min) / (max - min) * ph; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
    for (var g = 0; g <= 4; g++) {
      var v = min + (max - min) * g / 4, y = yOf(v);
      svg += '<line class="grid-line" x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '"/>';
      svg += '<text class="axis-txt" x="' + (L - 7) + '" y="' + (y + 3.5) + '" text-anchor="end">' + esc(fmt(v)) + '</text>';
    }
    var n = labels.length, groupW = pw / n, barW = Math.max(2, Math.min(22, groupW / (series.length + 0.6)));
    var paths = series.map(function () { return []; });
    labels.forEach(function (lb, i) {
      var cx = L + groupW * (i + 0.5);
      series.forEach(function (c, si) {
        var v = numVal(d.rows[i][c] || 0);
        var x = cx - (series.length * barW) / 2 + si * barW;
        svg += '<rect x="' + x.toFixed(1) + '" y="' + Math.min(yOf(v), yOf(0)).toFixed(1) + '" width="' + (barW - 2).toFixed(1) +
          '" height="' + Math.max(1, Math.abs(yOf(v) - yOf(0))).toFixed(1) + '" rx="2" fill="' + pal[si % pal.length] + '" opacity=".88"><title>' + esc(lb + ' · ' + (d.head[c] || '列' + (c + 1)) + '：' + fmt(v)) + '</title></rect>';
        paths[si].push(cx.toFixed(1) + ',' + yOf(v).toFixed(1));
      });
      if (n <= 20 || i % Math.ceil(n / 20) === 0) {
        svg += '<text class="bar-lbl" x="' + cx.toFixed(1) + '" y="' + (T + ph + 16) + '" text-anchor="middle">' + esc(lb) + '</text>';
      }
    });
    svg += '<line class="grid-line" x1="' + L + '" y1="' + (T + ph) + '" x2="' + (W - R) + '" y2="' + (T + ph) + '"/>';
    svg += '</svg>';
    var legend = '<div class="legend">' + series.map(function (c, i) {
      return '<span><i style="background:' + pal[i % pal.length] + '"></i>' + esc(d.head[c] || '列 ' + (c + 1)) + '</span>';
    }).join('') + '</div>';
    box.innerHTML = '<div class="chart-title">📈 数据图表</div><div class="chart-sub">纵轴：' + esc(series.map(function (c) { return d.head[c] || '列' + (c + 1); }).join(' / ')) + ' · 悬停查看数值 · 点击表头可排序</div>' + svg + legend;
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
    var blocks = $$('pre > code.language-mermaid', content);
    if (!blocks.length) return;
    var flow = window.MDFlow, native = [];
    try {
      blocks.forEach(function (c) {
        var src = c.textContent;
        var box = document.createElement('div');
        box.className = 'mermaid-box md-flow-box';
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
    $('#btnSave').disabled = true;
    $('#stDirty').textContent = '';
    $('#tabSections').classList.add('hidden');
  }
  function markDirty(v) {
    S.dirty = !!v;
    $('#stDirty').textContent = S.dirty ? '● 未保存' : '';
    $('#btnSave').disabled = !S.current || (!S.editing && !S.dirty);
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
    if (S.editBlock >= 0 && S.blocks[S.editBlock]) {
      S.blocks[S.editBlock].lines = editor.value.split('\n');
      S.blocks[S.editBlock].text = editor.value;
    }
  }
  function loadBlock(i) {
    if (!S.editing || S.whole) return;
    if (i < 0 || i >= S.blocks.length) return;
    flushBlock();
    S.editBlock = i;
    editor.value = S.blocks[i].text;
    $('#editSecLabel').textContent = '块 #' + (i + 1) + ' · ' + (S.blocks[i].title || '');
    $$('#sideSections .sec-item').forEach(function (n) { n.classList.toggle('active', +n.dataset.i === i); });
    updateStatus();
  }
  function buildBlockList() {
    var box = $('#sideSections');
    if (!S.blocks || !S.blocks.length) {
      box.innerHTML = '<div class="empty-hint">该文档没有可编辑的块。<br>可用顶部「全篇编辑」直接编辑整份文档。</div>';
      return;
    }
    var html = '';
    S.blocks.forEach(function (b, i) {
      var tag = (BLK_TAG[b.type] || '¶') + (b.type === 'heading' ? b.level : '');
      html += '<div class="sec-item' + (i === S.editBlock ? ' active' : '') + '" data-i="' + i + '" data-t="' + b.type + '">'
        + '<span class="sec-lv">' + tag + '</span>'
        + '<span class="sec-title">' + esc(b.title) + '</span>'
        + '<span class="sec-wc">' + textWordCount(b.lines) + '</span></div>';
    });
    box.innerHTML = html;
  }

  function setEditing(on) {
    if (!S.current) { toast('请先打开一个文档'); return; }
    on = !!on;
    if (on === !!S.editing) return;
    if (!on && S.dirty && !window.confirm(
      '有未保存的修改，仍要返回预览吗？\n（修改会保留在编辑器里，可继续按 Ctrl+S 保存）')) return;
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
      $('#btnSave').disabled = !S.dirty;
      render(full, S.current).then(function () { reader.scrollTop = 0; });
      return;
    }
    // 进入编辑：切成「块」，默认选中第一个块（无块则回落整篇）
    var m = splitBlocks(S.current.cached || '');
    S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps; S.whole = false;
    S.editBlock = S.blocks.length ? 0 : -1;
    S.editing = true;
    document.documentElement.dataset.editing = '1';
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
      editor.value = S.blocks[0].text;
      $('#editSecLabel').textContent = '块 #1 · ' + (S.blocks[0].title || '');
      $('#btnSecWhole').textContent = '全篇编辑';
    }
    buildBlockList();
    switchTab('sections');
    reader.scrollTop = 0;
    setTimeout(function () { editor.focus(); }, 0);
    toast('按块编辑：左栏「段落」选块 · 只编辑这一块 · Ctrl+S 保存 · Ctrl+E 返回预览');
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
    if (D && item.absPath && typeof D.writeFile === 'function') {
      var r = await D.writeFile(item.absPath, text, item.enc || 'UTF-8');
      if (!r || !r.ok) { toast('保存失败：' + ((r && r.error) || '未知错误'), 4000); return; }
      if (r.enc) { item.enc = r.enc; $('#crumbEnc').textContent = item.enc; }
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
  editor.addEventListener('input', function () { markDirty(true); });
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
  /* 导出副本：移除图表工具条，把流程图 SVG 里的 CSS 变量固化为真实颜色 */
  function cloneForExport() {
    var clone = content.cloneNode(true);
    $$('.mf-tools', clone).forEach(function (n) { n.remove(); });
    if (window.MDFlow) {
      $$('.mf-svg', clone).forEach(function (svg) {
        try { svg.outerHTML = window.MDFlow.inlineVars(svg.outerHTML); } catch (e) { }
      });
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
        var scale = 2, cv = document.createElement('canvas');
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        var cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        var pic = document.createElement('img');
        pic.src = cv.toDataURL('image/png'); pic.width = w; pic.height = h;
        pic.style.maxWidth = '100%';
        svg.parentNode.replaceChild(pic, svg);
      } catch (e) { /* 栅格化失败则保留原始 SVG，不影响正文 */ }
    }
    return clone;
  }
  async function exportHTML() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    await inlineBlobImages();
    var css = $('style').textContent;
    var extra = 'body{overflow:auto;height:auto}#app{display:block}.toolbar,.sidebar,.crumb,.statusbar,.tw-bar,.chart-box,.code-bar,#welcome,.mf-tools,.tf-block-bar{display:none!important}.reader-inner{max-width:980px;margin:0 auto;padding:24px 36px 60px}';
    var html = '<!DOCTYPE html><html lang="zh-CN" data-theme="' + S.theme + '" data-layout="' + S.layout +
      '" data-table-theme="' + S.tableTheme + '"><head><meta charset="UTF-8"><title>' +
      esc(S.current.name) + '</title><style>' + css + '\n' + extra + '</style></head><body><div class="reader-inner"><article id="content" style="font-size:' + S.fs + 'px">' +
      cloneForExport().innerHTML + '</article></div></body></html>';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.current.name.replace(/\.\w+$/, '') + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出独立 HTML（样式与图片已内嵌）');
  }

  // 导出为 Word 文档（.doc，Word 原生可打开的 HTML 包装）。
  // 用 Word 兼容的 HTML 命名空间 + 基础排版样式，标题/表格/列表/代码/图片均可保留。
  async function exportWord() {
    if (!S.current) { toast('请先打开一个文档'); return; }
    await inlineBlobImages();
    var clone = await rasterizeFlows(cloneForExport());
    var tt = tableTheme();
    var style = '@page{size:210mm 297mm;margin:20mm 18mm}'
      + 'body{font-family:"Microsoft YaHei","PingFang SC","SimSun",sans-serif;font-size:11pt;line-height:1.7;color:#1f2329}'
      + 'h1{font-size:20pt;margin:18pt 0 8pt;color:#111}h2{font-size:16pt;margin:14pt 0 6pt;color:#111}h3{font-size:13.5pt;margin:12pt 0 4pt;color:#111}h4,h5,h6{font-size:12pt;margin:10pt 0 4pt;color:#111}'
      + 'p{margin:6pt 0}'
      + 'table{border-collapse:collapse;margin:8pt 0}th,td{border:1px solid ' + tt.edge + ';padding:4pt 8pt;font-size:10.5pt}th{background:' + tt.head + ';color:' + (tt.headFg || '#ffffff') + ';font-weight:bold}'
      + 'pre{background:#f6f7f9;border:1px solid #e3e6eb;padding:8pt;border-radius:4px;font-family:Consolas,Menlo,monospace;font-size:10pt;white-space:pre-wrap;word-break:break-all}'
      + 'blockquote{margin:8pt 0;padding:4pt 12pt;border-left:3px solid #c7ccd4;color:#5a6068}'
      + 'img{max-width:100%}code{font-family:Consolas,Menlo,monospace;background:#eef0f3;padding:1pt 3pt;border-radius:3px;font-size:10pt}'
      + 'a{color:#2563eb;text-decoration:underline}';
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(S.current.name) + '</title>'
      + '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->'
      + '<style>' + style + '</style></head><body>' + clone.innerHTML + '</body></html>';
    var blob = new Blob(['﻿' + html], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.current.name.replace(/\.\w+$/, '') + '.doc';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出 Word 文档 (.doc)，可直接用 Word 打开');
  }

  /* ---------- UI 事件 ---------- */
  function switchTab(tab) {
    S.tab = tab;
    $$('.side-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    $('#sideFiles').classList.toggle('hidden', tab !== 'files');
    $('#sideOutline').classList.toggle('hidden', tab !== 'outline');
    $('#sideSections').classList.toggle('hidden', tab !== 'sections');
  }
  var SKIN_NAMES = { light: '浅色', dark: '深色', sepia: '护眼' };
  function setTheme(t, opts) {
    opts = opts || {};
    if (!SKIN_NAMES[t]) t = 'light';
    S.theme = t; document.documentElement.dataset.theme = t;
    var sel = $('#themeSel'); if (sel) sel.value = t;   // 隐藏兼容桥保持同步
    $$('.skin-btn').forEach(function (b) {
      var on = b.dataset.theme === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var D = window.__MD_DESKTOP__;
    if (D && D.setTheme) D.setTheme(t);
    save('theme', t); updateStatus();
    if (!opts.quiet) toast('已切换：' + SKIN_NAMES[t] + '主题');
    if (S.current && !S.editing) rerender();
  }
  function setFont(v) {
    S.fs = Math.max(12, Math.min(22, v));
    content.style.setProperty('--fs', S.fs + 'px');
    save('fs', S.fs);
  }
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
  /* 整篇文档：符号空格文本流程图 ⇄ 图形流程图，一键转换 / 还原 */
  function updateFlowButton() {
    var b = $('#btnFlowAll'); if (!b) return;
    var lab = b.querySelector('.tb-label');
    if (lab) lab.textContent = S.flowConverted ? '还原源码' : '流程图';
    b.classList.toggle('primary', !!S.flowConverted);
    b.title = S.flowConverted
      ? '还原整篇文档的文本流程图源码'
      : '把整篇文档的符号空格文本流程图一键转换为图形（再次点击还原）';
  }
  $('#btnFlowAll').onclick = function () {
    if (!S.current) { toast('请先打开一个文档'); return; }
    var TF = window.MDTextFlow;
    if (!TF) { toast('流程图组件不可用'); return; }
    var r = TF.toggleAll(content, S.flowCfg || TF.DEFAULT);
    if (!r.n) {
      toast('没有可识别的文本流程图：可用 → / ⇒ 符号箭头或 [节点] 写法，放进 ```flow 代码块即可一键转换');
      return;
    }
    S.flowConverted = (r.mode === 'convert');
    updateFlowButton();
    toast(r.mode === 'convert' ? '已转换 ' + r.n + ' 个文本流程图' : '已还原 ' + r.n + ' 处源码');
  };
  $('#layoutSel').onchange = function (e) { applyLayout(e.target.value); if (S.current) rerender(); };
  $('#btnRecent').onclick = function () {
    if ($('#recentWrap').classList.contains('hidden')) openRecentPanel(); else closeRecentPanel();
  };
  $('#recentClose').onclick = closeRecentPanel;
  $('#recentMask').onclick = closeRecentPanel;
  $('#recentFilter').oninput = recentRender;
  $('#recentClear').onclick = function () {
    if (!S.recent.length) return;
    if (!window.confirm('清空全部 ' + S.recent.length + ' 条最近记录？（不会删除任何文件）')) return;
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
  $('#btnSave').onclick = saveCurrent;
  $('#btnSecPrev').onclick = function () {
    if (S.whole || S.editBlock <= 0) { toast(S.whole ? '当前为整篇编辑，点「块编辑」切回' : '已经是第一个块'); return; }
    loadBlock(S.editBlock - 1);
  };
  $('#btnSecNext').onclick = function () {
    if (S.whole || S.editBlock < 0 || S.editBlock >= S.blocks.length - 1) { toast(S.whole ? '当前为整篇编辑，点「块编辑」切回' : '已经是最后一个块'); return; }
    loadBlock(S.editBlock + 1);
  };
  $('#btnSecWhole').onclick = function () {
    if (!S.editing) return;
    if (!S.whole) {
      flushBlock();
      S.whole = true; S.editBlock = -1;
      editor.value = joinBlocks(S.fm, S.blocks, S.gaps);
      $('#editSecLabel').textContent = '全篇';
      $('#btnSecWhole').textContent = '块编辑';
      $$('#sideSections .sec-item').forEach(function (n) { n.classList.remove('active'); });
    } else {
      var m = splitBlocks(editor.value);
      S.fm = m.fm; S.blocks = m.blocks; S.gaps = m.gaps; S.whole = false;
      S.editBlock = S.blocks.length ? 0 : -1;
      $('#btnSecWhole').textContent = '全篇编辑';
      if (S.editBlock >= 0) { editor.value = S.blocks[0].text; $('#editSecLabel').textContent = '块 #1 · ' + (S.blocks[0].title || ''); }
      else { $('#editSecLabel').textContent = '全篇'; }
      buildBlockList();
    }
  };
  $('#sideSections').addEventListener('click', function (e) {
    var it = e.target.closest('.sec-item'); if (!it) return;
    loadBlock(+it.dataset.i);
  });
  $('#btnExport').onclick = exportHTML;
  $('#btnWord').onclick = exportWord;
  $('#btnPrint').onclick = function () { if (S.current) window.print(); else toast('请先打开一个文档'); };
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
    if (e.key === 'Escape' && !$('#recentWrap').classList.contains('hidden')) { closeRecentPanel(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#filePicker').click(); }
    else if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); $('#btnRecent').click(); }
    else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#btnSide').click(); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#findInput').focus(); $('#findInput').select(); }
    else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); $('#btnPrint').click(); }
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
        title.textContent = '导言';
      }

      var meta = document.createElement('div');
      meta.className = 'card-meta';
      var wc = sectionWordCount(g.nodes);
      meta.textContent = wc ? (wc >= 1000 ? (wc / 1000).toFixed(1) + 'k' : wc) + ' 字' : '';

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

  /* ---------- 示例文档 ---------- */
  var DEMO = [
    '---', 'title: MD Reader 功能演示', 'author: 小W', 'tags: 演示 / 表格 / 可视化', '---', '',
    '# MD Reader · 功能演示', '',
    '> [!tip] 这是一份示例文档', '> 打开自己的 .md 文件，或把整个文件夹拖进窗口即可开始阅读。', '',
    '## 1. 表格可视化', '',
    '### 1.1 西南区域季度经营数据（绝对数）', '',
    '| 季度 | 订单（万元） | 收入（万元） | 回款（万元） | 经营利润（万元） | 经营现金流（万元） |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    '| Q1 | 2600 | 1850 | 1620 | 225 | 110 |',
    '| Q2 | 3050 | 2240 | 2010 | 296 | 245 |',
    '| Q3 | 3420 | 2680 | 2530 | 372 | 368 |',
    '| Q4 | 3860 | 3150 | 3020 | 458 | 492 |', '',
    '### 1.2 环比与回款质量', '',
    '| 季度 | 订单环比 | 收入环比 | 回款环比 | 经营利润环比 | 经营现金流环比 | 回款 / 收入比（回款质量） | 利润率（经营利润 / 收入） |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    '| Q1 | - | - | - | - | - | 87.57% | 12.16% |',
    '| Q2 | +17.31% | +21.08% | +24.07% | +31.56% | +122.73% | 89.73% | 13.21% |',
    '| Q3 | +12.13% | +19.64% | +25.87% | +25.68% | +50.20% | 94.40% | 13.88% |',
    '| Q4 | +12.87% | +17.54% | +19.37% | +23.12% | +33.70% | 95.87% | 14.54% |', '',
    '👆 点击「图表」按钮生成柱状图；点击表头可排序；「复制 CSV」可直接粘到 Excel；工具条右侧可切换黑白极简 / 蓝色科技 / 红色政商 / 粉色卡通四套表格风格。', '',
    '## 2. 代码块与高亮', '',
    '```python', 'def collect(devices, proto="snmpv3"):', '    # 采集策略示例', '    return [d.read(proto) for d in devices if d.online]', '```', '',
    '行内代码 `marked.parse()` 与 **加粗**、*斜体*、~~删除线~~ 均正常渲染。', '',
    '## 3. 任务列表与引用', '',
    '- [x] 支持 GFM 表格', '- [x] 支持代码高亮', '- [ ] 支持数学公式（暂未内置）', '',
    '> 好的工具应该让人忘记工具本身，只看见内容。', '',
    '## 4. Mermaid 流程图', '',
    '```mermaid', 'flowchart LR', '  S([打开 .md]) --> B{解析内容}',
    '  B -->|表格| C[(排序 / 图表)]', '  B -->|代码| D[语法高亮]', '  B -->|双链| E[[文档跳转]]',
    '  C --> F([渲染输出])', '  D --> F', '  E --> F', '```', '',
    '### 4.1 符号空格文本型流程图（一键转换）', '',
    '@//md-render-hint/',
    '# 范式类型：GATE-PIPELINE + HETEROGENEOUS-STATE-MACHINE',
    '# 范式释义：串行门禁流水线 + 同事件异构分流状态子机',
    '# 布局模式：LR（横向） / TD（纵向）',
    '# 分组规则：',
    '#   GROUP-MAIN：主线流水线，主色，实线流转；节点遵循门禁模型：导入→预校验门禁→任务执行→人工裁决→归档；支持软告警放行、硬失败隔离、重试、生命周期衍生分支',
    '#   GROUP-SUB：分流状态子机，辅助色；由主线某节点【虚线依赖触发】；基于分类路由，多分支共享事件（确认/驳回/SLA超时），但后置动作、统计口径、权限隔离',
    '# 流转强约束（渲染器静态校验，渲染时标红违规连线）',
    '#   1. 状态单向流转，禁止终态回退连线',
    '#   2. 同一父节点下，确认/驳回/超时 互斥分支，不允许合并回待审',
    '#   3. WARN告警 = 软门禁旁路；FAIL = 硬隔离，不可直通下一阶段',
    '#   4. 重试节点必须标注重试次数+间隔，重试终点为留痕终态',
    '# 视觉规则',
    '#   GROUP-MAIN 填充色：#e8f8f0 描边 #239955',
    '#   GROUP-SUB 填充色：#fff6e0 描边 #dd9922',
    '#   实线：强制流转；虚线：依赖触发关系（不是流程跳转）',
    '# 自动附加组件：自动生成图例、状态矩阵附表、文件输出清单',
    '# 导出配置：输出SVG矢量图；导出时附带配套说明文本；支持嵌入hover备注',
    '# 语义校验开关：ON，渲染前自动检查是否违反范式约束并输出警告',
    '@//end-md-render-hint/', '',
    '👆 点顶栏「**流程图**」按钮，把整篇文档的文本流程图一键转成图形；再点一次还原源码。', '',
    '```flow',
    '@main LR',
    '([导入]) --> [预校验门禁] --> [任务执行] --> {人工裁决} --> ![归档]',
    '[预校验门禁] -- WARN 放行 --> ![留痕告警]',
    '[预校验门禁] -- FAIL --> ![硬隔离]',
    '[任务执行] -- 重试 3 次 / 间隔 5m --> [重试队列] --> ![重试留痕终态]',
    '[预校验门禁] -- FAIL --> [越级放行] // FAIL 未隔离，故意保留用于演示违规标红',
    '@sub',
    '{人工裁决} -. 依赖触发 .-> [分类路由]',
    '[分类路由] -- 确认 --> ![通过归档]',
    '[分类路由] -- 驳回 --> ![驳回留痕]',
    '[分类路由] -- SLA超时 --> ![超时升级]',
    '```', '',
    '也可以用**符号占位**的简写：用符号箭头 `→` 连接、节点用 ①②③ 占位，无需方括号也能识别：', '',
    '```flow',
    '@main LR',
    '① 已导入 → ② 待校验 → ③ 校验通过 → ④ 已准入',
    '② 待校验 → WARN 校验告警 → 人工放行 → ④ 已准入',
    '② 待校验 → FAIL 校验失败 → 已隔离 →（修正重传）→ ② 待校验',
    '```', '',
    '## 5. Obsidian 适配', '',
    '内部双链：[[项目总览]]、[[项目总览|别名写法]]、[[采集策略#SNMP v3]]', '',
    '标签：#智慧综维 #数字员工 #IPOSS', '',
    '> [!warning] 编码提示', '> UTF-8 与 GB18030 会自动识别；打开整个文件夹时，相对路径图片也能正常显示。', '',
    '## 6. 层级标题与大纲', '', '### 6.1 左侧「大纲」标签页', '', '点击右侧「☷ 大纲」可以看到本文档的全部标题，点击即跳转。', '',
    '#### 6.1.1 更深的层级', '', '支持到 h6。', '',
    '---', '', '*导出为独立 HTML 后，样式、表格与图表都会一起带走。*', ''
  ].join('\n');
  $('#wDemo').onclick = function () {
    ingest([{ name: '示例文档.md', rel: '示例文档.md', cached: DEMO, enc: 'DEMO' }])
      .then(function () { toast('已载入示例文档 · 试试表格上的「图表」按钮'); });
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
    if (D.setTheme) D.setTheme(S.theme);
    return true;
  }

  /* ---------- 启动 ---------- */
  function boot() {
    resetEditing();
    setTheme(load('theme', 'light'), { quiet: true });
    setFont(+load('fs', 15));
    loadRecent();
    applyLayout(load('layout', 'card'), { silent: true });
    applyTableTheme(load('tableTheme', 'mono'), { silent: true });
    if (location.protocol !== 'file:') $('#envHint').classList.remove('hidden');
    var DESKTOP = initDesktop();
    $('#stBuild').textContent = 'MD Reader v1.3 · ' +
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
  }
  boot();
})();
