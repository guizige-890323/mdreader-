'use strict';
/**
 * 渲染核心：Markdown → 自包含 HTML
 * ===============================================================
 * 这是整个产品最可靠的一条路径，所以它是**默认路径**。
 *
 * 为什么不用 HTTP 服务做默认：
 *   服务依赖一个活着的进程。进程一死，链接全成死链 —— 用户昨天收到的
 *   报告今天就打不开了。这对「交给人类阅读」这件事是硬伤。
 *
 * 而自包含 HTML 文件：
 *   - 不需要任何进程、任何端口、任何网络
 *   - 双击就开，离线一百年也能开
 *   - 可以直接发给别人、丢进 Git、归档
 *   - 唯一代价是每个文件 ~5MB（引擎内联），可接受
 *
 * 代价与取舍：为什么不做「小 HTML + 外部引擎」？
 *   file:// 下无法 fetch 同目录文件（CORS），iframe 跨源也被拦。
 *   因此引擎必须内联。5MB 换来「永不失效」，这个交换是划算的。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ENGINE = path.resolve(__dirname, '..', 'engine', 'MDLens.html');
const HOME = path.join(os.homedir(), '.mdlens');
const VIEW = path.join(HOME, 'view');

/** 保留最近多少个渲染产物（每个约 5MB，30 个约 150MB） */
const KEEP = 30;

function ensureView() {
  if (!fs.existsSync(VIEW)) fs.mkdirSync(VIEW, { recursive: true });
}

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function shortId() {
  return crypto.randomBytes(8).toString('hex');
}

/** 把主题等偏好折成引擎认识的 URL 参数 */
function prefsToQS(prefs) {
  const qs = new URLSearchParams();
  if (!prefs) return qs;
  if (prefs.theme) qs.set('theme', prefs.theme);
  if (prefs.layout) qs.set('layout', prefs.layout);
  if (prefs.tableTheme) qs.set('table', prefs.tableTheme);
  if (prefs.lang) qs.set('lang', prefs.lang);
  if (prefs.font) qs.set('font', prefs.font);
  if (prefs.width) qs.set('width', prefs.width);
  if (prefs.chartType) qs.set('charttype', prefs.chartType);
  if (prefs.chartAuto != null) qs.set('chartauto', prefs.chartAuto ? '1' : '0');
  if (prefs.flowAuto != null) qs.set('flowauto', prefs.flowAuto ? '1' : '0');
  if (prefs.flowMode) qs.set('flowmode', prefs.flowMode);
  /* 云晰柔光：与 theme / layout 正交的独立一层 */
  if (prefs.papermatte != null) qs.set('pm', prefs.papermatte ? '1' : '0');
  if (prefs.pm && typeof prefs.pm === 'object') {
    Object.keys(prefs.pm).forEach((k) => {
      const v = prefs.pm[k];
      if (v != null && Number.isFinite(Number(v))) qs.set('pm' + k, String(v));
    });
  }
  return qs;
}

/**
 * 生成自包含 HTML 文本（不落盘）
 * @param {string} md
 * @param {object} prefs  { theme, layout, tableTheme, lang, font, width }
 * @returns {string}
 */
function buildHtml(md, prefs) {
  if (!fs.existsSync(ENGINE)) {
    throw new Error('引擎未构建：' + ENGINE + '\n请先执行 python scripts/build-engine.py');
  }
  const engine = fs.readFileSync(ENGINE, 'utf8');
  const qs = prefsToQS(prefs);
  qs.set('md', b64url(md));

  // 1) 把参数写死在页面里 —— file:// 下 location.search 是空的
  let html = engine.replace(
    '</head>',
    '<script>window.__MDLENS_INLINE_QS__=' + JSON.stringify(qs.toString()) + ';</script>\n</head>'
  );
  // 2) 桥接层改为优先读内联参数
  html = html.replace(
    "var q = new URLSearchParams(location.search);",
    "var q = new URLSearchParams(window.__MDLENS_INLINE_QS__ || location.search);"
  );
  return html;
}

/**
 * 渲染到文件，返回文件信息
 * @returns {{path:string, fileUrl:string, bytes:number, id:string}}
 */
function renderToFile(md, opts = {}) {
  ensureView();
  const id = opts.id || shortId();
  const html = buildHtml(md, opts.prefs);

  // 文件名带上可读的标题，方便在目录里找
  const safe = String(opts.name || 'document')
    .replace(/\.(md|markdown|mdown|mkd)$/i, '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 48) || 'document';
  const file = path.join(VIEW, safe + '-' + id + '.html');

  fs.writeFileSync(file, html, 'utf8');
  prune();

  return {
    id,
    path: file,
    fileUrl: 'file:///' + file.replace(/\\/g, '/'),
    bytes: fs.statSync(file).size,
  };
}

/** 清理旧产物：按修改时间倒序，保留最近 KEEP 个 */
function prune() {
  try {
    const files = fs.readdirSync(VIEW)
      .filter((f) => f.endsWith('.html'))
      .map((f) => {
        const p = path.join(VIEW, f);
        return { p, t: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => b.t - a.t);
    for (const f of files.slice(KEEP)) {
      try { fs.unlinkSync(f.p); } catch (e) { }
    }
  } catch (e) { /* 清理失败不影响主流程 */ }
}

/**
 * 列出已渲染的产物（默认路径产出的自包含 HTML）
 * 文件名格式：<可读标题>-<16位id>.html
 * @returns {Array<{id:string,name:string,path:string,fileUrl:string,bytes:number,mtime:number}>}
 */
function listRendered() {
  try {
    return fs.readdirSync(VIEW)
      .filter((f) => /\.html$/i.test(f))
      .map((f) => {
        const p = path.join(VIEW, f);
        const st = fs.statSync(p);
        const m = /^(.*)-([0-9a-f]{8,})\.html$/i.exec(f);
        return {
          id: m ? m[2] : f.replace(/\.html$/i, ''),
          name: m ? m[1] : f,
          path: p,
          fileUrl: 'file:///' + p.replace(/\\/g, '/'),
          bytes: st.size,
          mtime: st.mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    return [];
  }
}

module.exports = { buildHtml, renderToFile, listRendered, VIEW, KEEP };