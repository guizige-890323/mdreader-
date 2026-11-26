'use strict';
/**
 * MDLens MCP Server
 * ===============================================================
 * 把「渲染 Markdown」这件事变成一个 AI 可以直接调用的工具。
 *
 * 协议：Model Context Protocol，JSON-RPC 2.0 over stdio，按行分隔。
 * 不引入 @modelcontextprotocol/sdk —— 那一套依赖太重，而且我们只需要
 * initialize / tools/list / tools/call 三个方法，手写反而更稳、更可控。
 *
 * 核心设计判断
 * -------------
 * 一个 AI 助手最需要的不是「render 一个字符串」，而是三件不同的事：
 *
 *   1. render_markdown  —— 就地拿到结果（HTML / 截图 / 统计），不打断对话
 *   2. open_preview     —— 在一个人能持续看的窗口里滚动更新（长任务）
 *   3. render_file      —— 磁盘上的 .md 直接看，不用先读进来
 *
 * 所以工具按这三个动作切，而不是按参数切。AI 不用纠结传什么 flags。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const client = require('./client');
const render = require('./render');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'mdlens', version: '0.2.0' };  // v1.7: unified document style + per-diagram structure

// 注：ensureServer 定义在下方工具区之前，只此一处。

/** 逐行读 stdin 的 JSON-RPC */
function createReader(onMessage) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    // MCP 用换行分隔消息；Content-Length 头是 LSP 风格，这里都兼容一下
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      onMessage(msg);
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

/** 共享守护进程：跨 MCP 会话、跨客户端重启都存活。
 *  失败后允许重试 —— 首次拉起可能因端口占用失败，用户改端口后应能恢复。 */
let svcPromise = null;
function ensureServer() {
  if (!svcPromise) {
    svcPromise = client.ensure();
    svcPromise.catch(() => { svcPromise = null; });
  }
  return svcPromise;
}

// ---------------------------------------------------------------- 工具定义
const TOOLS = [
  {
    name: 'render_markdown',
    description:
      'Render a Markdown string into a human-readable page and return the result. ' +
      'Use this whenever you produced Markdown that a human needs to read — long answers, ' +
      'reports, tables, comparisons, charts. Returns a URL the user can open plus statistics. ' +
      'Prefer this over dumping raw Markdown into the chat.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'The Markdown content to render.' },
        title: { type: 'string', description: 'Document title (shown in the tab / window).' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme. Default dark.' },
        flow_structure: { type: 'string', enum: ['auto', 'pipeline', 'mindmap', 'org', 'timeline'], description: 'Flowchart layout structure (orthogonal to colors): pipeline = multi-color stage bands with numbered nodes; mindmap = radial spokes from a center root; org = top-down equal-width boxes with elbow connectors; timeline = central axis with alternating cards; auto = pick by graph shape. Default auto.' },
        papermatte: { type: 'boolean', description: 'Enable PaperMatte (云晰柔光): a subtle sepia/contrast filter plus a fine grain layer that makes the page look like printed paper — easier on the eyes for long reads. Orthogonal to theme: works on top of light/dark/sepia. Default false.' },
        layout: { type: 'string', enum: ['card', 'paper'], description: 'card = sectioned cards, paper = continuous page. Default card.' },
        table_theme: { type: 'string', enum: ['mono', 'tech', 'gov', 'cute'], description: 'Document style (alias: doc_style). Drives section backgrounds, card badges, chart palette, flowchart accents AND code syntax highlighting together; readable variants are derived for light/dark/sepia. Default mono.' },
        doc_style: { type: 'string', enum: ['mono', 'tech', 'gov', 'cute'], description: 'Preferred name for the unified document style. Same values as table_theme; takes precedence when both are given.' },
        chart_type: { type: 'string', enum: ['auto', 'bar', 'line', 'trend', 'pie', 'rose'], description: 'Chart type for data tables. Default auto (engine picks by data shape). Use line/bar when a table has several series over time — area charts overlap and get hard to read.' },
        chart_auto: { type: 'boolean', description: 'Auto-expand charts for numeric tables. Default true.' },
        width: { type: 'number', description: 'Max body width in px, 560-1400. Default 900.' },
        font: { type: 'number', description: 'Body font size, 12-28. Default 15.' },
        live: { type: 'boolean', description: 'Return a live-updating URL instead of a static file. Use for long tasks where content keeps growing. Default false (static file, never expires).' },
        open: { type: 'boolean', description: 'Open the page in the default browser immediately. Default false.' },
        screenshot: { type: 'boolean', description: 'Also capture a PNG and return its path. Slower (~3s). Default false.' },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'open_preview',
    description:
      'Open a live-updating preview window. Call this once at the start of a long task, then ' +
      'call update_preview as you go — the user watches the document build up in real time ' +
      'instead of waiting for one giant dump at the end.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Initial Markdown content.' },
        title: { type: 'string', description: 'Document title.' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme. Default dark.' },
        flow_structure: { type: 'string', enum: ['auto', 'pipeline', 'mindmap', 'org', 'timeline'], description: 'Flowchart layout structure (orthogonal to colors): pipeline = multi-color stage bands with numbered nodes; mindmap = radial spokes from a center root; org = top-down equal-width boxes with elbow connectors; timeline = central axis with alternating cards; auto = pick by graph shape. Default auto.' },
        papermatte: { type: 'boolean', description: 'Enable PaperMatte (云晰柔光): a subtle sepia/contrast filter plus a fine grain layer that makes the page look like printed paper — easier on the eyes for long reads. Orthogonal to theme: works on top of light/dark/sepia. Default false.' },
        open: { type: 'boolean', description: 'Open the browser. Default true.' },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'update_preview',
    description:
      'Replace the content of an existing live preview. The page keeps its scroll position, ' +
      'so the reader is not thrown back to the top on every update.',
    inputSchema: {
      type: 'object',
      properties: {
        preview_id: { type: 'string', description: 'The preview_id returned by open_preview.' },
        markdown: { type: 'string', description: 'The new full Markdown content (replaces, does not append).' },
        append: { type: 'boolean', description: 'Append to existing content instead of replacing. Default false.' },
      },
      required: ['preview_id', 'markdown'],
    },
  },
  {
    name: 'render_file',
    description:
      'Render a Markdown file from disk. Use when the content is already a file rather than in your context.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to a .md file.' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme. Default dark.' },
        flow_structure: { type: 'string', enum: ['auto', 'pipeline', 'mindmap', 'org', 'timeline'], description: 'Flowchart layout structure (orthogonal to colors): pipeline = multi-color stage bands with numbered nodes; mindmap = radial spokes from a center root; org = top-down equal-width boxes with elbow connectors; timeline = central axis with alternating cards; auto = pick by graph shape. Default auto.' },
        papermatte: { type: 'boolean', description: 'Enable PaperMatte (云晰柔光): a subtle sepia/contrast filter plus a fine grain layer that makes the page look like printed paper — easier on the eyes for long reads. Orthogonal to theme: works on top of light/dark/sepia. Default false.' },
        open: { type: 'boolean', description: 'Open in browser. Default false.' },
        screenshot: { type: 'boolean', description: 'Also capture a PNG. Default false.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'export_html',
    description:
      'Export a standalone single-file HTML that anyone can open offline — no install, no server. ' +
      'Use this when the result must be shared or archived.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown content.' },
        path: { type: 'string', description: 'Output .html path. Defaults to a temp file.' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme. Default dark.' },
        flow_structure: { type: 'string', enum: ['auto', 'pipeline', 'mindmap', 'org', 'timeline'], description: 'Flowchart layout structure (orthogonal to colors): pipeline = multi-color stage bands with numbered nodes; mindmap = radial spokes from a center root; org = top-down equal-width boxes with elbow connectors; timeline = central axis with alternating cards; auto = pick by graph shape. Default auto.' },
        papermatte: { type: 'boolean', description: 'Enable PaperMatte (云晰柔光): a subtle sepia/contrast filter plus a fine grain layer that makes the page look like printed paper — easier on the eyes for long reads. Orthogonal to theme: works on top of light/dark/sepia. Default false.' },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'inspect_markdown',
    description:
      'Analyze Markdown structure without rendering: headings, tables, code blocks, charts, ' +
      'Mermaid blocks, estimated reading time. Useful to decide how to present content.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown content to analyze.' },
      },
      required: ['markdown'],
    },
  },
];

// ---------------------------------------------------------------- 工具实现
function prefsOf(a, defaults = {}) {
  return {
    theme: a.theme || defaults.theme || 'dark',
    layout: a.layout || defaults.layout || 'card',
    /* v1.7：doc_style 为统一文档风格的首选入参，table_theme 保留为兼容别名 */
    tableTheme: a.doc_style || a.table_theme || defaults.tableTheme,
    width: a.width,
    font: a.font,
    chartType: a.chart_type,
    chartAuto: a.chart_auto,
    /* 柔光：与 theme / layout 正交的一层，默认关（不强加给所有调用方） */
    papermatte: a.papermatte != null ? !!a.papermatte : defaults.papermatte,
    flowMode: a.flow_structure || defaults.flowMode,
    pm: a.pm && typeof a.pm === 'object' ? a.pm : defaults.pm,
  };
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch (e) { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 用 playwright 截一张图；失败不致命 */
async function screenshot(url, outPath, opts = {}) {
  let pw;
  try { pw = require('playwright-core'); } catch (e) {
    return { ok: false, error: 'playwright-core 未安装' };
  }
  const edge = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => fs.existsSync(p));

  let browser;
  try {
    browser = await pw.chromium.launch({
      channel: edge ? 'msedge' : undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage({
      viewport: { width: opts.width || 1280, height: opts.height || 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(opts.wait || 2600);
    await page.screenshot({ path: outPath, fullPage: !!opts.full });
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    if (browser) await browser.close().catch(() => { });
  }
}

async function callTool(name, args) {
  switch (name) {
    case 'render_markdown': {
      if (typeof args.markdown !== 'string') throw new Error('markdown 必须是字符串');
      /* 默认产出自包含文件：不依赖进程、不会过期、可直接发给别人。
         live=true 时才走服务（长任务边写边看）。 */
      if (args.live) {
        await ensureServer();
        const r = await client.put(args.markdown, {
          name: args.title || 'ai-output.md', prefs: prefsOf(args),
        });
        return {
          mode: 'live',
          url: r.url,
          preview_id: r.previewId,
          chars: r.chars,
          hint: '实时预览已就绪，用 update_preview 继续推送内容。',
        };
      }

      const out = render.renderToFile(args.markdown, {
        name: args.title || 'ai-output.md',
        prefs: prefsOf(args),
      });
      let opened = false;
      if (args.open) opened = openBrowser(out.fileUrl);

      const res = {
        mode: 'file',
        path: out.path,
        url: out.fileUrl,
        chars: args.markdown.length,
        mb: +(out.bytes / 1024 / 1024).toFixed(2),
        opened,
        hint: '单文件、离线可开、不会过期。把这个路径交给用户即可。',
      };
      if (args.screenshot) {
        const png = path.join(os.tmpdir(), 'mdlens-' + out.id + '.png');
        res.screenshot = await screenshot(out.fileUrl, png, { width: 1280 });
      }
      return res;
    }

    case 'open_preview': {
      await ensureServer();
      const r = await client.put(args.markdown || '', {
        name: args.title || 'live-preview.md',
        prefs: prefsOf(args),
      });
      const opened = args.open === false ? false : openBrowser(r.url);
      return {
        preview_id: r.previewId,
        url: r.url,
        opened,
        hint: '预览已就绪。用 update_preview + preview_id 推送新内容，页面原地更新、滚动位置保留。' +
          '注意：此链接依赖本地服务进程，服务停止后失效。需要长期保存请用 render_markdown（默认文件模式）。',
      };
    }

    case 'update_preview': {
      await ensureServer();
      const r = await client.put(args.markdown || '', {
        id: args.preview_id,
        append: !!args.append,
      });
      return {
        preview_id: args.preview_id,
        url: r.url,
        chars: r.chars,
        appended: !!args.append,
      };
    }

    case 'render_file': {
      const p = path.resolve(args.path);
      if (!fs.existsSync(p)) throw new Error('文件不存在：' + p);
      const md = fs.readFileSync(p, 'utf8');
      const out = render.renderToFile(md, {
        name: path.basename(p),
        prefs: prefsOf(args),
      });
      let opened = false;
      if (args.open) opened = openBrowser(out.fileUrl);
      const res = {
        mode: 'file', path: out.path, url: out.fileUrl,
        chars: md.length, file: p, opened,
      };
      if (args.screenshot) {
        const png = path.join(os.tmpdir(), 'mdlens-' + out.id + '.png');
        res.screenshot = await screenshot(out.fileUrl, png);
      }
      return res;
    }

    case 'export_html': {
      const out = render.renderToFile(args.markdown || '', {
        name: args.path ? path.basename(args.path, '.html') : 'export',
        prefs: prefsOf(args),
      });
      // 用户指定了路径就搬过去
      let finalPath = out.path;
      if (args.path) {
        finalPath = path.resolve(args.path);
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });
        fs.copyFileSync(out.path, finalPath);
        try { fs.unlinkSync(out.path); } catch (e) { }
      }
      return {
        path: finalPath,
        url: 'file:///' + finalPath.replace(/\\/g, '/'),
        bytes: fs.statSync(finalPath).size,
        standalone: true,
        hint: '单个 HTML 文件，双击即开，可发给任何人或归档。',
      };
    }

    case 'inspect_markdown': {
      const md = args.markdown || '';
      const lines = md.split('\n');
      const headings = lines.filter((l) => /^#{1,6}\s/.test(l))
        .map((l) => ({ level: l.match(/^#+/)[0].length, text: l.replace(/^#+\s*/, '').trim() }));
      const fences = md.match(/```[\s\S]*?```/g) || [];
      const langs = fences.map((f) => (f.match(/^```(\w*)/) || [])[1] || 'text');

      /* 数「表格个数」而不是「表格行数」：
         连续的 | ... | 行属于同一张表，中间隔了非表格行才算新表。
         早先直接统计行数，一个 3 行的表会被报成 3 个表格。 */
      const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
      let tables = 0, inTable = false;
      for (const l of lines) {
        if (isRow(l)) { if (!inTable) { tables++; inTable = true; } }
        else if (l.trim() !== '') inTable = false;
      }

      const words = md.replace(/\s+/g, ' ').trim().length;
      const cjk = (md.match(/[\u4e00-\u9fa5]/g) || []).length;
      return {
        chars: md.length,
        lines: lines.length,
        headings,
        tables,
        code_blocks: fences.length,
        code_languages: [...new Set(langs)],
        has_mermaid: langs.includes('mermaid'),
        has_flow: langs.includes('flow'),
        reading_minutes: Math.max(1, Math.round((words + cjk) / 400)),
        suggestions: buildSuggestions({ headings, tables, fences, md }),
      };
    }

    default:
      throw new Error('未知工具：' + name);
  }
}

/** 给 AI 的建议：什么时候这段内容值得渲染 */
function buildSuggestions({ headings, tables, fences, md }) {
  const s = [];
  if (md.length > 1500) s.push('内容较长，渲染成页面比在对话里读更轻松');
  if (tables > 3) s.push('表格较多，渲染后可用表格配色与横向滚动');
  if (fences.some((f) => /```(mermaid|flow)/.test(f))) s.push('含流程图，渲染后可获得图形化结果');
  if (headings.filter((h) => h.level <= 2).length >= 3) s.push('有多级标题，渲染后可用大纲导航');
  if (!s.length) s.push('内容较短，直接在对话里读即可；若需要保存或分享再渲染');
  return s;
}

// ---------------------------------------------------------------- 协议处理
function handle(msg) {
  const { id, method, params } = msg || {};

  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });

      case 'notifications/initialized':
        return; // 通知无需回复

      case 'tools/list':
        return reply(id, { tools: TOOLS });

      case 'tools/call': {
        const name = params && params.name;
        const args = (params && params.arguments) || {};
        if (!name) return fail(id, -32602, '缺少 tool 名称');
        return Promise.resolve(callTool(name, args)).then((result) => {
          reply(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          });
        }).catch((e) => {
          // 工具失败用 isError，而不是协议级 error —— 这样 AI 能看到原因并重试
          reply(id, {
            content: [{ type: 'text', text: '渲染失败：' + (e.message || e) }],
            isError: true,
          });
        });
      }

      case 'ping':
        return reply(id, {});

      case 'prompts/list':
        return reply(id, { prompts: [] });

      case 'resources/list':
        return reply(id, { resources: [] });

      default:
        // 未实现的方法：有 id 才回错误（通知不该回）
        if (id !== undefined) fail(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    if (id !== undefined) fail(id, -32603, String(e.message || e));
  }
}

function run() {
  // 启动时就把服务起好，减少首次调用的等待
  ensureServer().catch((e) => {
    process.stderr.write('[mdlens] 服务启动失败: ' + e.message + '\n');
  });
  createReader(handle);
  process.stderr.write('[mdlens] MCP server ready (stdio)\n');
}

module.exports = { run, TOOLS, callTool };