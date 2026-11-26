# -*- coding: utf-8 -*-
"""把 MDReader.html 加工成「AI 原生渲染引擎」MDLens.html。

设计原则：**不重写渲染器**。
MDReader 已经是一套打磨过的渲染管线（marked + highlight.js + mermaid +
四类图表 + 文本流程图 + 三种皮肤 + 表格四套配色）。重写一遍既没必要也不划算。
本脚本只做两件精准的事：

  1. **开入口**：在 IIFE 结尾追加 `window.__MDLENS__`，把「重新渲染一段新
     Markdown」这件事暴露给外部。原渲染逻辑一行不改，只是多了一个调用点。

  2. **剥外壳**：AI 场景下不需要侧栏文件树、顶栏按钮、标签页、状态栏。
     CSS 层直接隐藏，DOM 一行不删 —— 因为渲染管线依赖这些节点存在
     （比如 content、reader 的滚动容器、chart-box 的尺寸测量）。

另外注入一段 `__MDLENS_BRIDGE__`：负责
  - 从 URL / postMessage / BroadcastChannel 三个通道接收 Markdown
  - 内容变化时保留滚动位置、保留图表展开态
  - 上报「已就绪」与「渲染完成」事件，供 CLI / MCP 等待与截图

用法：
    python scripts/build-engine.py                    # 输出 engine/MDLens.html
    python scripts/build-engine.py --src <path>       # 指定源 MDReader.html
"""
import argparse
import io
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                       # mdlens/
DEFAULT_SRC = ROOT.parent / "MDReader" / "dist" / "MDReader.html"
DEFAULT_OUT = ROOT / "engine" / "MDLens.html"


# ---------------------------------------------------------------- 外壳剥离 CSS
SHELL_CSS = r"""
/* ================= MDLens：AI 原生渲染外壳 =================
   这一层只做「减法」：把阅读器改造成一个纯粹的渲染窗口。
   保留：正文、图表、流程图、皮肤、字号
   去掉：顶栏 / 侧栏 / 标签页 / 状态栏 / 欢迎屏 / 各种悬浮按钮
   —— 全部用 CSS 隐藏，DOM 不删：渲染管线依赖这些节点做尺寸测量。 */

/* 1) 顶栏、侧栏、标签栏、状态栏 —— 整体不参与布局 */
html[data-mdlens] .toolbar,
html[data-mdlens] .sidebar,
html[data-mdlens] .tabbar,
html[data-mdlens] .statusbar,
html[data-mdlens] .focus-exit,
html[data-mdlens] .focus-bar,
html[data-mdlens] #welcome,
html[data-mdlens] #tabbar { display: none !important; }

/* 2) 布局塌缩：body-row 只剩主区，且必须能撑满视口高度 */
html[data-mdlens] .body-row { display: block !important; }
html[data-mdlens] .main {
  width: 100% !important; max-width: none !important;
  height: 100vh !important; height: 100dvh !important;
  margin: 0 !important; padding: 0 !important;
}
html[data-mdlens] .reader {
  height: 100vh !important; height: 100dvh !important;
  padding: 0 !important; overflow-y: auto !important;
  scroll-behavior: auto !important;   /* 热更新时不要平滑滚动，否则会飘 */
}

/* 3) 正文区域：去掉阅读器自带的「纸张居中 + 内边距」留白策略，
      改为 AI 场景更合适的宽正文 + 舒适行高。数值与原 reader-inner 协调。 */
html[data-mdlens] .reader-inner { padding: 34px 28px 96px !important; }
html[data-mdlens] .paper {
  box-shadow: none !important; border: none !important;
  background: transparent !important; border-radius: 0 !important;
}
html[data-mdlens] #content { max-width: 900px; margin: 0 auto; }

/* 4) 隐藏渲染器里所有「操作类」浮层：它们对 AI 输出场景没有意义，
      而且会在截图里露出半截，破坏成图观感。
      注意：**不能**藏 .chart-toggle / button[data-act="chart"] ——
      expandAllCharts() 靠程序化点击它来展开图表，藏了显示但点不到。
      改用视觉上「存在但不可见」的方式：保留可点击性，只去掉视觉。 */
html[data-mdlens] .chart-types,
html[data-mdlens] .code-bar button,
html[data-mdlens] .copy-btn,
html[data-mdlens] .anchor-link,
html[data-mdlens] .toast,
html[data-mdlens] .np-pop,
html[data-mdlens] .find-box { display: none !important; }

/* 图表的类型切换条（柱状/折线/环形…）在 AI 场景没人会点，但它是图表框内的一部分，
   直接 display:none 会让图表内边距变化。用 opacity:0 + 高度塌陷更稳。 */
html[data-mdlens] .chart-types {
  opacity: 0 !important; height: 0 !important; overflow: hidden !important;
  margin: 0 !important; padding: 0 !important; pointer-events: none !important;
}

/* 表格工具条（排序 / CSV / 图表 / 配色）：AI 输出里这些对读者是噪音，
   但「图表」按钮要能被程序点到。所以整体降透明度并收窄，而不是 display:none。 */
html[data-mdlens] .tw-tools,
html[data-mdlens] .table-tools {
  opacity: .28 !important;
  transition: opacity .18s !important;
}
html[data-mdlens] .tw-tools:hover,
html[data-mdlens] .table-tools:hover { opacity: 1 !important; }

/* 5) 代码块保留「语言标签」，便于人类快速识别这段是什么语言；
      但去掉复制按钮（已在上一条隐藏）。 */
html[data-mdlens] .code-bar { justify-content: flex-start !important; }

/* 6) 表格在 AI 输出里极常见，默认给它横向滚动容器，
      避免宽表格把正文撑破（原样式是 break-word 硬挤，长英文列会很难看）。 */
html[data-mdlens] #content table { display: table; }
html[data-mdlens] .table-wrap { overflow-x: auto; }

/* 7) 滚动条：AI 渲染窗口滚动频繁，收窄一点，观感更轻。 */
html[data-mdlens] .reader::-webkit-scrollbar { width: 9px; height: 9px; }
html[data-mdlens] .reader::-webkit-scrollbar-thumb {
  background: var(--line-2, rgba(0,0,0,.18)); border-radius: 5px;
}
html[data-mdlens] .reader::-webkit-scrollbar-track { background: transparent; }

/* 8) 热更新时整篇重绘会闪一下。加一层极短的淡入，把「闪」变成「换」。
      用 animation 而不是 transition：SVG 图表也能一起淡。 */
html[data-mdlens] #content.mdlens-fade { animation: mdlensFade .22s ease; }
@keyframes mdlensFade { from { opacity: .35 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) {
  html[data-mdlens] #content.mdlens-fade { animation: none; }
}

/* 9) 首页（无内容时）：显示一句轻提示，而不是阅读器那个巨大的欢迎屏。 */
html[data-mdlens] .mdlens-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; min-height: 60vh; color: var(--muted);
  font: 500 14px/1.7 var(--font, system-ui, sans-serif);
}
html[data-mdlens] .mdlens-empty b { font-size: 16px; color: var(--text-2); font-weight: 650; }
"""


# --------------------------------------------------------- 引擎公开接口（IIFE 内）
# 注意：这段必须插在 `boot(); })();` 之前 —— 即仍在 IIFE 作用域内，
# 才能访问 render / setTheme / applyLayout 等内部函数。
ENGINE_API = r"""
  /* ================= MDLens 引擎接口 =================
     对外只暴露「一个动作 + 几个旋钮」：
       MDLens.show(md, opts)   —— 用一段新 Markdown 重新渲染
       MDLens.prefs(opts)      —— 调主题 / 皮肤 / 字号 / 表格配色
       MDLens.state()          —— 供 CLI 与 MCP 读取当前渲染状态

     刻意不暴露内部函数：接口面越小，越不容易随渲染器演进被破坏。 */

  var _mdlensSample = 0;

  function mdlensItem(text, name) {
    /* 复用 ingest 的对象形态。cached 直接给内容 → getContent 不会去读文件，
       这条路径已验证可绕过所有文件系统访问。 */
    return {
      name: name || 'ai-output.md',
      rel: name || 'ai-output.md',
      cached: text,
      enc: 'UTF8',
      absPath: ''
    };
  }

  function mdlensShow(text, opts) {
    opts = opts || {};
    var name = opts.name || 'ai-output.md';
    var scrollTop = opts.keepScroll ? reader.scrollTop : 0;

    /* 复用阅读器「重新读取」的做法：同一个 tab 换内容 → 重渲染。
       不新增 tab，避免标签栏无限增长（虽然已隐藏，但会吃内存）。 */
    var tab = S.activeKey && findTab(S.activeKey);
    if (tab) {
      tab.item = mdlensItem(text, name);
      tab.md = text;
      tab.scrollTop = scrollTop;
      S.current = tab.item;
    } else {
      var item = mdlensItem(text, name);
      var t = { key: tabKeyOf(item), item: item, md: text, scrollTop: 0 };
      S.tabs.push(t);
      S.activeKey = t.key;
      S.current = item;
    }
    /* 空内容时 render() 会走「空白文档」分支，这里直接给一个更中性的提示 */
    return render(text, S.current).then(function () {
      welcome.classList.add('hidden');
      content.classList.remove('hidden');
      if (opts.keepScroll) reader.scrollTop = scrollTop;

      /* 关键：render() 内部调用 applyChartAuto() 时 content 还是 hidden，
         宽度测不到会直接 return，图表就不会自动展开。
         AI 输出里表格极常见，「表格自动变成图表」是这个产品的主要卖点之一，
         所以必须在此刻（正文已可见、宽度可测）补做一次。
         同理，文本流程图的自动转换也在这里补。 */
      if (chartAutoOn()) expandAllCharts();
      if (S.flowAuto && window.MDTextFlow && content.querySelector(window.MDTextFlow.SEL)) {
        try {
          var n = window.MDTextFlow.convertAll(content, S.flowCfg || window.MDTextFlow.DEFAULT);
          if (n) S.flowConverted = true;
          updateFlowButton();
        } catch (e) { }
      }

      /* 短淡入，把整篇重绘的「闪」变成「换」 */
      content.classList.remove('mdlens-fade');
      void content.offsetWidth;
      content.classList.add('mdlens-fade');
      _mdlensSample = Date.now();
      window.dispatchEvent(new CustomEvent('mdlens:rendered', {
        detail: {
          chars: text.length,
          blocks: content.children.length,
          charts: content.querySelectorAll('svg').length,
          ms: 0
        }
      }));
      return true;
    });
  }

  function mdlensPrefs(o) {
    if (!o) return;
    if (o.theme) { try { setTheme(o.theme, { silent: true }); } catch (e) { } }
    if (o.layout) { try { applyLayout(o.layout, { silent: true }); } catch (e) { } }
    if (o.tableTheme) { try { applyTableTheme(o.tableTheme, { silent: true }); } catch (e) { } }
    if (o.font) {
      var n = parseInt(o.font, 10);
      if (!isNaN(n) && n >= 12 && n <= 28) { S.font = n; applyFont(); }
    }
    if (o.chartAuto != null) { S.chartAuto = !!o.chartAuto; applyChartAuto(); }
    if (o.flowAuto != null) { S.flowAuto = !!o.flowAuto; }
    /* 流程图结构：DOM 级的 CSS 变量之外，结构是几何，必须在渲染前落到 MDFlow 上 */
    if (o.flowMode && window.MDFlow && window.MDFlow.setMode) {
      try { window.MDFlow.setMode(String(o.flowMode)); } catch (e) { }
    }
    /* 图表类型：AI 输出常含「多系列随时间变化」的表，面积图会互相遮挡，
       这时折线更清楚。允许调用方指定，'auto' 保持引擎原有的智能判断。 */
    if (o.chartType) {
      var ct = String(o.chartType);
      if (CHART_TYPES.indexOf(ct) >= 0) {
        S.chartType = ct;
        try { if (typeof applyChartAuto === 'function') applyChartAuto(); } catch (e) { }
      }
    }
    if (o.width) {
      /* 正文宽度：AI 输出常含宽表格，允许调用方放宽到 1200 */
      var w = Math.max(560, Math.min(1400, parseInt(o.width, 10) || 900));
      content.style.maxWidth = w + 'px';
    }
    /* 表格配色 / 版式变了之后，已展开的图表要用新配色重画 */
    if (o.reflow) { try { applyChartAuto(); } catch (e) { } }
  }

  function mdlensState() {
    var tab = S.activeKey && findTab(S.activeKey);
    return {
      ready: true,
      chars: tab && tab.md ? tab.md.length : 0,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      layout: S.layout,
      tables: content.querySelectorAll('table').length,
      charts: content.querySelectorAll('.chart-box').length,
      svgs: content.querySelectorAll('svg').length,
      flows: content.querySelectorAll(window.MDFlow ? window.MDFlow.SEL : '.mf-svg').length,
      codes: content.querySelectorAll('pre > code').length,
      headings: content.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      scrollHeight: reader.scrollHeight,
      clientHeight: reader.clientHeight
    };
  }

  window.__MDLENS__ = {
    show: function (text, opts) { return mdlensShow(String(text == null ? '' : text), opts); },
    prefs: mdlensPrefs,
    state: mdlensState,
    /* 供桥接层判断是否已经完成首次渲染 */
    renderedAt: function () { return _mdlensSample; }
  };
  window.dispatchEvent(new CustomEvent('mdlens:engine-ready'));
"""


# ----------------------------------------------------------------- 外部桥接层
BRIDGE = r"""
/* ================= MDLens 桥接层 =================
   三个输入通道，覆盖三类真实接入方式：

   1) URL 参数  ?src=<http url>&theme=dark   —— 最简形态，浏览器 / iframe 直接可用。
      把 Markdown 放在任意 HTTP 地址上，本页 fetch 后渲染。
      （不做 data: / file: 直读，避免跨域与权限噪音）

   2) postMessage  { type:'mdlens:render', markdown, prefs }
      —— 编辑器 / 桌面容器 / 自建 UI 用这个，零依赖。

   3) BroadcastChannel('mdlens')
      —— 同源多标签同步：CLI 在本地服务里广播，所有已开的预览窗一起更新。

   输出通道只有事件：
      mdlens:ready     引擎可用，可以开始喂内容
      mdlens:rendered  一次渲染完成（带统计）
      mdlens:error     渲染失败
  另提供 window.__MDLENS_RENDER__(md, opts) 同步入口，方便自动化脚本直接调用。
*/
(function () {
  'use strict';
  if (window.__MDLENS_BRIDGE_READY__) return;
  window.__MDLENS_BRIDGE_READY__ = true;

  var CH = 'mdlens';
  var engineWaiters = [];

  function whenEngine() {
    if (window.__MDLENS__) return Promise.resolve(window.__MDLENS__);
    return new Promise(function (res) {
      engineWaiters.push(res);
      window.addEventListener('mdlens:engine-ready', function () {
        var w = engineWaiters.splice(0);
        w.forEach(function (f) { f(window.__MDLENS__); });
      }, { once: true });
    });
  }

  function applyPrefs(p) {
    if (!p) return;
    var root = document.documentElement;
    // 主题走 data-theme，同时同步下拉框（渲染器有依赖）
    if (p.theme) {
      root.setAttribute('data-theme', p.theme);
      var sel = document.getElementById('themeSel');
      if (sel) { sel.value = p.theme; }
    }
    if (p.lang) root.setAttribute('data-lang', p.lang);
    if (p.layout) {
      var ls = document.getElementById('layoutSel');
      if (ls) { ls.value = p.layout; ls.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    /* 云晰柔光：DOM 属性级开关，不经过引擎内部状态，
       所以引擎还没挂载也能立刻生效（纯 CSS 滤镜 + 颗粒层）。 */
    if (p.papermatte != null) {
      if (p.papermatte) root.setAttribute('data-pm', 'on');
      else root.removeAttribute('data-pm');
    }
    if (p.pm) {
      ['sepia', 'sat', 'con', 'bri', 'noise'].forEach(function (k) {
        if (p.pm[k] == null) return;
        var v = Number(p.pm[k]);
        if (!isFinite(v)) return;
        root.style.setProperty('--pm-' + k, k === 'noise' ? (v / 100).toFixed(3) : v + '%');
      });
    }
    /* 其余偏好（图表类型 / 表格配色 / 字号 / 宽度 / 自动开关）
       都要经过引擎接口才能生效 —— 它们是引擎内部状态，不是 DOM 属性。
       引擎尚未挂载时先缓存，等 ready 后补一次。 */
    var rest = {};
    ['chartType', 'chartAuto', 'flowAuto', 'flowMode', 'tableTheme', 'font', 'width'].forEach(function (k) {
      if (p[k] != null) rest[k] = p[k];
    });
    if (Object.keys(rest).length) {
      if (window.__MDLENS__) { try { window.__MDLENS__.prefs(rest); } catch (e) { } }
      else {
        window.addEventListener('mdlens:engine-ready', function () {
          try { window.__MDLENS__.prefs(rest); } catch (e) { }
        }, { once: true });
      }
    }
  }

  /* 独立渲染入口：不依赖引擎内部实现，纯 DOM 级降级方案。
     只在引擎缺失（比如被极端环境裁剪）时使用，保证「至少能看」。 */
  function fallbackRender(md) {
    var c = document.getElementById('content');
    if (!c) return;
    var w = document.getElementById('welcome');
    if (w) w.classList.add('hidden');
    c.classList.remove('hidden');
    if (window.marked) {
      try { c.innerHTML = window.marked.parse(md, { gfm: true }); return; } catch (e) { }
    }
    var pre = document.createElement('pre');
    pre.textContent = md;
    c.innerHTML = '';
    c.appendChild(pre);
  }

  function render(md, opts) {
    opts = opts || {};
    applyPrefs(opts);
    /* AI 输出里的表格就是为了看数据。默认把「表格自动出图」打开，
       否则读者要自己去点表格工具条上的小图标才知道有图表 —— 没人会去点。
       调用方传 chart_auto:false 可以关掉。 */
    if (!opts.prefs) opts.prefs = {};
    if (opts.prefs.chartAuto == null) opts.prefs.chartAuto = true;
    if (opts.prefs.flowAuto == null) opts.prefs.flowAuto = true;
    var t0 = performance.now();
    return whenEngine().then(function (E) {
      if (!E) { fallbackRender(md); return true; }
      if (opts.prefs) E.prefs(opts.prefs);
      return E.show(md, opts).then(function (ok) {
        window.dispatchEvent(new CustomEvent('mdlens:rendered', {
          detail: { ok: ok, ms: Math.round(performance.now() - t0), chars: String(md).length }
        }));
        return ok;
      });
    }).catch(function (err) {
      window.dispatchEvent(new CustomEvent('mdlens:error', { detail: { message: String(err && err.message || err) } }));
      fallbackRender(md);
      return false;
    });
  }

  /* ---- 通道 2/3/4：postMessage / BroadcastChannel ---- */
  function handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'mdlens:ping') {
      window.dispatchEvent(new CustomEvent('mdlens:ready', { detail: { pong: true } }));
      return;
    }
    if (data.type === 'mdlens:render') {
      render(data.markdown || '', data);
    } else if (data.type === 'mdlens:prefs') {
      whenEngine().then(function (E) { if (E) E.prefs(data.prefs || data); });
    }
  }

  window.addEventListener('message', function (e) {
    // 本地渲染窗口，来源不可枚举；只接受结构合法的消息，不执行任意代码
    handleMessage(e.data);
  });
  try {
    var bc = new BroadcastChannel(CH);
    bc.onmessage = function (e) { handleMessage(e.data); };
    window.__MDLENS_BC__ = bc;
  } catch (e) { /* Safari 老版本无 BroadcastChannel，忽略 */ }

  /* ---- 通道 1：实时模式（由服务端 /v/<id> 注入 __MDLENS_DOC_ID__） ----
     这是 CLI `mdlens live` 与 MCP `open_preview` 的核心：
     页面通过 SSE 订阅，服务端每次写入新内容就推一条，页面自动重渲染。 */
  function bootLive(id) {
    if (typeof EventSource === 'undefined') {
      return render('# 实时通道不可用\n\n当前环境不支持 EventSource。', {});
    }
    var es = new EventSource('/events/' + encodeURIComponent(id));
    window.__MDLENS_ES__ = es;
    es.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (!data || data.type !== 'mdlens:render') return;
      /* 关键：热更新要保留滚动位置，否则每次 AI 追加内容都把人甩回顶部 */
      render(data.markdown || '', {
        name: data.name,
        prefs: data.prefs,
        keepScroll: true
      });
    };
    es.onerror = function () {
      /* EventSource 自带重连；只在首次失败时提示，避免刷屏 */
      if (!window.__MDLENS_ES_WARNED__) {
        window.__MDLENS_ES_WARNED__ = true;
        console.warn('[MDLens] SSE 连接中断，浏览器会自动重连');
      }
    };
  }

  /* ---- 通道 2：URL 参数 ---- */
  function boot() {
    var q = new URLSearchParams(location.search);

    /* 优先级 0：服务端注入的实时模式 */
    if (window.__MDLENS_DOC_ID__) {
      var pid = window.__MDLENS_DOC_ID__;
      var livePrefs = {
        theme: q.get('theme') || undefined,
        layout: q.get('layout') || undefined
      };
      if (q.get('pm') != null) livePrefs.papermatte = q.get('pm') === '1';
      applyPrefs(livePrefs);
      bootLive(pid);
      return;
    }

    var prefs = {
      theme: q.get('theme') || undefined,
      layout: q.get('layout') || undefined,
      lang: q.get('lang') || undefined,
      /* 表格配色：render.js 的 prefsToQS() 早就传了 ?table=tech，
         但这里漏读，导致 CLI `--table tech` / MCP `table_theme` 全部无效。
         引擎侧 applyTableTheme() 一直都在，只是没人把参数递进去。 */
      tableTheme: q.get('table') || undefined,
      chartType: q.get('charttype') || undefined,
      font: q.get('font') || undefined,
      width: q.get('width') || undefined
    };
    if (q.get('chartauto') != null) prefs.chartAuto = q.get('chartauto') === '1';
    if (q.get('flowauto') != null) prefs.flowAuto = q.get('flowauto') === '1';
    /* 结构：auto | pipeline | mindmap | org | timeline */
    if (q.get('flowmode')) prefs.flowMode = q.get('flowmode');
    /* 云晰柔光：?pm=1 开 / ?pm=0 关；?pmsepia / pmcon / pmnoise … 给细分参数 */
    if (q.get('pm') != null) prefs.papermatte = q.get('pm') === '1';
    (function () {
      var o = {};
      [['pmsepia', 'sepia'], ['pmsat', 'sat'], ['pmcon', 'con'],
       ['pmbri', 'bri'], ['pmnoise', 'noise']].forEach(function (pair) {
        var v = q.get(pair[0]);
        if (v != null && v !== '' && isFinite(Number(v))) { o[pair[1]] = Number(v); }
      });
      if (Object.keys(o).length) { prefs.papermatte = prefs.papermatte !== false; prefs.pm = o; }
    })();
    applyPrefs(prefs);

    // ?src=<url> 远程取 Markdown
    var src = q.get('src');
    if (src) {
      fetch(src, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (txt) { return render(txt, prefs); })
        .catch(function (err) {
          render('# 读取失败\n\n无法从 `' + src + '` 获取内容：' + (err.message || err),
            prefs);
        });
      return;
    }

    // ?md=<base64> 小段内容直接内联（AI 生成的短文本，避免多一次请求）
    var b64 = q.get('md');
    if (b64) {
      try {
        var txt = decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))));
        render(txt, prefs);
        return;
      } catch (e) { /* 落到空状态 */ }
    }

    // 空闲：显示提示，等外部喂内容
    var c = document.getElementById('content');
    if (c) {
      c.classList.remove('hidden');
      c.innerHTML = '<div class="mdlens-empty"><b>MDLens 已就绪</b>' +
        '<span>等待 Markdown 输入 · 通过 postMessage / BroadcastChannel / URL 参数</span></div>';
    }
    window.dispatchEvent(new CustomEvent('mdlens:ready', { detail: { idle: true } }));
  }

  /* 同步入口：给自动化脚本（CDP / Playwright）用，省掉事件监听 */
  window.__MDLENS_RENDER__ = function (md, opts) { return render(md, opts); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
})();
"""


def patch_source(html: str) -> str:
    """在 MDReader.html 上打三个精准补丁，返回 MDLens.html 内容。"""
    # --- 补丁 1：标记这是 MDLens 外壳（CSS 全部挂在 html[data-mdlens] 下）---
    if "<html lang=" not in html:
        raise SystemExit("找不到 <html> 标签，源文件不是 MDReader 产物？")
    html = re.sub(r"<html\b", '<html data-mdlens="1"', html, count=1)

    # --- 补丁 2：注入外壳 CSS（放 </head> 前，优先级高于原样式）---
    if "</head>" not in html:
        raise SystemExit("找不到 </head>")
    html = html.replace(
        "</head>",
        "<style>%s</style>\n</head>" % SHELL_CSS,
        1,
    )

    # --- 补丁 3：在 IIFE 内追加引擎接口 ---
    # 锚点是 app.js 最后两行 `  boot();\n})();`，已验证全文唯一
    anchor = "  boot();\n})();"
    if html.count(anchor) != 1:
        raise SystemExit("boot 锚点不唯一（%d 处），拒绝打补丁" % html.count(anchor))
    html = html.replace(anchor, ENGINE_API + "\n  boot();\n})();", 1)

    # --- 补丁 4：桥接层放到 </body> 之前（IIFE 之后，确保 __MDLENS__ 已挂载）---
    idx = html.rfind("</body>")
    if idx < 0:
        raise SystemExit("找不到 </body>")
    html = html[:idx] + "<script>%s</script>\n" % BRIDGE + html[idx:]

    # --- 补丁 5：标题与 meta，让窗口 / 分享链接有正确名字 ---
    html = re.sub(r"<title>.*?</title>",
                  "<title>MDLens · AI 输出渲染</title>", html, count=1, flags=re.S)
    return html


def main():
    ap = argparse.ArgumentParser(description="Build MDLens.html from MDReader.html")
    ap.add_argument("--src", default=str(DEFAULT_SRC), help="source MDReader.html")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output MDLens.html")
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    if not src.exists():
        raise SystemExit("源文件不存在：%s\n（先构建 MDReader：python src/build.py）" % src)

    html = io.open(src, encoding="utf-8").read()
    patched = patch_source(html)
    out.parent.mkdir(parents=True, exist_ok=True)
    io.open(out, "w", encoding="utf-8", newline="\n").write(patched)

    print("built : %s" % out)
    print("src   : %s" % src)
    print("size  : %.2f MB" % (out.stat().st_size / 1024 / 1024))
    # 自检：四个补丁标记都必须存在
    checks = {
        'data-mdlens="1"': 'html 标记',
        'MDLens：AI 原生渲染外壳': '外壳 CSS',
        'window.__MDLENS__': '引擎接口',
        'window.__MDLENS_RENDER__': '桥接层',
        '<title>MDLens': '标题',
    }
    for token, label in checks.items():
        n = patched.count(token)
        print("  %-28s %s (x%d)" % (label, "OK" if n else "MISSING", n))
        if not n:
            raise SystemExit("补丁缺失：%s" % label)


if __name__ == "__main__":
    main()