'use strict';
/**
 * MDLens 渲染服务
 * ---------------------------------------------------------------
 * 一个极小的本地 HTTP 服务，两个职责：
 *
 *   1. GET /            → 返回引擎页面（MDLens.html）
 *   2. GET /doc/<id>    → 返回某个文档的 Markdown 原文
 *   3. POST /doc        → 写入 / 更新文档（AI 或 CLI 都走这里）
 *   4. GET /events/<id> → SSE，内容变化时推一条事件，页面自动重渲染
 *
 * 为什么不用 WebSocket：SSE 单向足够（服务→页面），
 * 而且浏览器原生支持、断线自动重连、不需要额外依赖。
 *
 * 为什么不把 Markdown 直接塞进 URL：
 * 长文档会超出 URL 长度限制（浏览器约 2MB，但代理/日志更早出问题），
 * 而且内容会进浏览器历史。用 id 引用，内容走内存。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ENGINE = path.resolve(__dirname, '..', 'engine', 'MDLens.html');

/** 内存文档表：id -> { md, name, prefs, rev, updated } */
const docs = new Map();

/** 每个文档挂着的 SSE 连接集合 */
const subscribers = new Map();

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function getDoc(id) {
  if (!docs.has(id)) {
    docs.set(id, { md: '', name: 'ai-output.md', prefs: {}, rev: 0, updated: Date.now() });
  }
  return docs.get(id);
}

function setDoc(id, patch) {
  const d = getDoc(id);
  if (patch.md != null) d.md = String(patch.md);
  if (patch.name) d.name = String(patch.name);
  if (patch.prefs) d.prefs = Object.assign({}, d.prefs, patch.prefs);
  d.rev += 1;
  d.updated = Date.now();
  broadcast(id, { type: 'mdlens:render', markdown: d.md, name: d.name, prefs: d.prefs, rev: d.rev });
  return d;
}

function broadcast(id, payload) {
  const set = subscribers.get(id);
  if (!set) return 0;
  const line = 'data: ' + JSON.stringify(payload) + '\n\n';
  let n = 0;
  for (const res of set) {
    try { res.write(line); n++; } catch (e) { /* 连接已断，稍后由 close 清理 */ }
  }
  return n;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 启动服务
 * @param {object} opt
 * @param {number} opt.port  0 = 随机端口
 * @param {string} opt.host
 * @returns {Promise<{server, port, origin, close}>}
 */
function start(opt = {}) {
  const host = opt.host || '127.0.0.1';

  if (!fs.existsSync(ENGINE)) {
    return Promise.reject(new Error('引擎未构建：' + ENGINE + '\n请先执行 python scripts/build-engine.py'));
  }

  const engineHtml = fs.readFileSync(ENGINE);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + host);
    const p = url.pathname;

    // --- CORS 预检：允许本地自建 UI 调用 ---
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    // --- 引擎页 ---
    if (p === '/' || p === '/index.html' || p === '/engine') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': engineHtml.length,
        'Cache-Control': 'no-store',
      });
      return res.end(engineHtml);
    }

    // --- 健康检查 ---
    if (p === '/healthz') {
      return json(res, 200, { ok: true, docs: docs.size, engine: engineHtml.length });
    }

    // --- 文档读写 ---
    if (p === '/doc' && req.method === 'POST') {
      try {
        const body = await readBody(req, 16 * 1024 * 1024);
        const data = body ? JSON.parse(body) : {};
        const id = data.id || newId();
        const d = setDoc(id, data);
        return json(res, 200, { ok: true, id, rev: d.rev, chars: d.md.length });
      } catch (e) {
        return json(res, 400, { ok: false, error: String(e.message || e) });
      }
    }

    let m = /^\/doc\/([\w-]+)$/.exec(p);
    if (m) {
      const id = m[1];
      const d = getDoc(id);
      if (req.method === 'GET') {
        return json(res, 200, { ok: true, id, rev: d.rev, name: d.name, prefs: d.prefs, md: d.md });
      }
      if (req.method === 'POST') {
        try {
          const body = await readBody(req, 16 * 1024 * 1024);
          const data = body ? JSON.parse(body) : {};
          const nd = setDoc(id, data);
          return json(res, 200, { ok: true, id, rev: nd.rev, chars: nd.md.length });
        } catch (e) {
          return json(res, 400, { ok: false, error: String(e.message || e) });
        }
      }
    }

    // --- SSE ---
    m = /^\/events\/([\w-]+)$/.exec(p);
    if (m) {
      const id = m[1];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      // 立刻推当前内容，页面不用再发一次请求
      const d = getDoc(id);
      res.write('data: ' + JSON.stringify({
        type: 'mdlens:render', markdown: d.md, name: d.name, prefs: d.prefs, rev: d.rev,
      }) + '\n\n');
      if (!subscribers.has(id)) subscribers.set(id, new Set());
      subscribers.get(id).add(res);

      // 心跳：防止中间层掐断长连接
      const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { } }, 20000);
      req.on('close', () => {
        clearInterval(hb);
        const s = subscribers.get(id);
        if (s) { s.delete(res); if (!s.size) subscribers.delete(id); }
      });
      return;
    }

    // --- 带 id 的页面：直接注入 id，省掉前端解析 ---
    if (p.startsWith('/v/')) {
      const id = p.slice(3).replace(/[^\w-]/g, '') || newId();
      getDoc(id);
      const html = engineHtml.toString('utf8').replace(
        '</head>',
        '<script>window.__MDLENS_DOC_ID__=' + JSON.stringify(id) + ';</script>\n</head>'
      );
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cache-Control': 'no-store',
      });
      return res.end(html);
    }

    json(res, 404, { ok: false, error: 'not found: ' + p });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opt.port || 0, host, () => {
      const port = server.address().port;
      const origin = 'http://' + host + ':' + port;
      resolve({
        server, port, origin,
        enginePath: ENGINE,
        setId(md, name, prefs) { const id = newId(); setDoc(id, { md, name, prefs }); return id; },
        getDoc,
        setDoc,
        broadcast,
        close() {
          for (const s of subscribers.values()) for (const r of s) { try { r.end(); } catch (e) { } }
          subscribers.clear();
          return new Promise((r) => server.close(r));
        },
      });
    });
  });
}

module.exports = { start, newId };