'use strict';
/**
 * MDLens 守护进程
 * ===============================================================
 * 为什么需要它：
 *   MCP server 的生命周期跟着 AI 客户端走 —— 客户端重启、会话结束，
 *   进程就没了。如果 HTTP 服务寄生在 MCP 进程里，那么之前发给用户的
 *   所有预览链接会**同时变成死链**。这对"给人类看的渲染结果"是致命的。
 *
 * 所以把 HTTP 服务拆成一个独立的、脱离父进程的常驻进程：
 *   - 用 detached + unref 启动，父进程退出它照样活着
 *   - 文档内容落盘（~/.mdlens/docs/<id>.md），进程重启也不丢
 *   - 客户端通过 ~/.mdlens/daemon.json 发现端口，发现不到就拉起一个
 *
 * 这是这个产品从"能跑的 demo"变成"能日常用的工具"的分界线。
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const HOME = path.join(os.homedir(), '.mdlens');
const DOCS = path.join(HOME, 'docs');
const META = path.join(HOME, 'meta');
const STATE = path.join(HOME, 'daemon.json');
const ENGINE = path.resolve(__dirname, '..', 'engine', 'MDLens.html');

function ensureDirs() {
  for (const d of [HOME, DOCS, META]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function newId() { return crypto.randomBytes(8).toString('hex'); }

/** 内存索引：id -> {name, prefs, rev, updated}；正文在磁盘 */
const index = new Map();
const subs = new Map();

function docPath(id) { return path.join(DOCS, id + '.md'); }
function metaPath(id) { return path.join(META, id + '.json'); }

function loadIndex() {
  ensureDirs();
  let n = 0;
  for (const f of fs.readdirSync(DOCS)) {
    if (!f.endsWith('.md')) continue;
    const id = f.slice(0, -3);
    try {
      const m = fs.existsSync(metaPath(id))
        ? JSON.parse(fs.readFileSync(metaPath(id), 'utf8'))
        : {};
      index.set(id, {
        name: m.name || 'ai-output.md',
        prefs: m.prefs || {},
        rev: m.rev || 1,
        updated: m.updated || Date.now(),
      });
      n++;
    } catch (e) { /* 损坏的元数据跳过，正文还在 */ }
  }
  return n;
}

function readDoc(id) {
  const p = docPath(id);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function writeDoc(id, md) {
  ensureDirs();
  fs.writeFileSync(docPath(id), md, 'utf8');
  const m = index.get(id) || { name: 'ai-output.md', prefs: {}, rev: 0, updated: 0 };
  m.rev += 1;
  m.updated = Date.now();
  index.set(id, m);
  fs.writeFileSync(metaPath(id), JSON.stringify(m), 'utf8');
  return m;
}

function setDoc(id, patch) {
  const m = index.get(id) || { name: 'ai-output.md', prefs: {}, rev: 0, updated: 0 };
  if (patch.name) m.name = patch.name;
  if (patch.prefs) m.prefs = Object.assign({}, m.prefs, patch.prefs);
  index.set(id, m);
  let md = patch.md;
  if (md == null) md = readDoc(id);
  if (patch.append) md = readDoc(id).replace(/\s*$/, '') + '\n\n' + md;
  const r = writeDoc(id, md);
  broadcast(id, {
    type: 'mdlens:render', markdown: md, name: r.name, prefs: r.prefs, rev: r.rev,
  });
  return { id, rev: r.rev, chars: md.length, name: r.name };
}

function broadcast(id, payload) {
  const s = subs.get(id);
  if (!s) return 0;
  const line = 'data: ' + JSON.stringify(payload) + '\n\n';
  let n = 0;
  for (const res of s) { try { res.write(line); n++; } catch (e) { } }
  return n;
}

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(b),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(b);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const c = [];
    req.on('data', (x) => {
      n += x.length;
      if (n > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      c.push(x);
    });
    req.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    req.on('error', reject);
  });
}

function startDaemon() {
  ensureDirs();
  const loaded = loadIndex();

  if (!fs.existsSync(ENGINE)) {
    process.stderr.write('[mdlens-daemon] 引擎缺失: ' + ENGINE + '\n');
    process.exit(1);
  }
  const engineHtml = fs.readFileSync(ENGINE);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (p === '/' || p === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': engineHtml.length,
        'Cache-Control': 'no-store',
      });
      return res.end(engineHtml);
    }

    if (p === '/healthz') {
      return json(res, 200, {
        ok: true, service: 'mdlens', pid: process.pid,
        docs: index.size, uptime: Math.round(process.uptime()),
        engine: engineHtml.length, version: '0.1.0',
      });
    }

    if (p === '/docs') {
      const list = [...index.entries()].map(([id, m]) => ({
        id, name: m.name, rev: m.rev, updated: m.updated,
      })).sort((a, b) => b.updated - a.updated);
      return json(res, 200, { ok: true, docs: list });
    }

    if (p === '/doc' && req.method === 'POST') {
      try {
        const body = await readBody(req, 32 * 1024 * 1024);
        const d = body ? JSON.parse(body) : {};
        const id = d.id || newId();
        const r = setDoc(id, d);
        return json(res, 200, { ok: true, ...r, url: '/v/' + id });
      } catch (e) {
        return json(res, 400, { ok: false, error: String(e.message || e) });
      }
    }

    let m = /^\/doc\/([\w-]+)$/.exec(p);
    if (m) {
      const id = m[1];
      if (req.method === 'GET') {
        const meta = index.get(id);
        if (!meta && !fs.existsSync(docPath(id))) {
          return json(res, 404, { ok: false, error: 'not found' });
        }
        return json(res, 200, {
          ok: true, id, rev: (meta || {}).rev || 0,
          name: (meta || {}).name, prefs: (meta || {}).prefs || {},
          md: readDoc(id),
        });
      }
      if (req.method === 'POST') {
        try {
          const body = await readBody(req, 32 * 1024 * 1024);
          const d = body ? JSON.parse(body) : {};
          return json(res, 200, { ok: true, ...setDoc(id, d) });
        } catch (e) {
          return json(res, 400, { ok: false, error: String(e.message || e) });
        }
      }
      if (req.method === 'DELETE') {
        try { fs.unlinkSync(docPath(id)); } catch (e) { }
        try { fs.unlinkSync(metaPath(id)); } catch (e) { }
        index.delete(id);
        return json(res, 200, { ok: true });
      }
    }

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
      const meta = index.get(id) || {};
      res.write('data: ' + JSON.stringify({
        type: 'mdlens:render', markdown: readDoc(id),
        name: meta.name || 'ai-output.md', prefs: meta.prefs || {}, rev: meta.rev || 0,
      }) + '\n\n');
      if (!subs.has(id)) subs.set(id, new Set());
      subs.get(id).add(res);
      const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { } }, 20000);
      req.on('close', () => {
        clearInterval(hb);
        const s = subs.get(id);
        if (s) { s.delete(res); if (!s.size) subs.delete(id); }
      });
      return;
    }

    if (p.startsWith('/v/')) {
      const id = p.slice(3).replace(/[^\w-]/g, '') || newId();
      if (!index.has(id)) index.set(id, { name: 'ai-output.md', prefs: {}, rev: 0, updated: Date.now() });
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

    if (p === '/shutdown' && req.method === 'POST') {
      json(res, 200, { ok: true, bye: true });
      try { fs.unlinkSync(STATE); } catch (e) { }
      setTimeout(() => process.exit(0), 50);
      return;
    }

    json(res, 404, { ok: false, error: 'not found: ' + p });
  });

  const port = Number(process.env.MDLENS_PORT || 7788);
  server.listen(port, '127.0.0.1', () => {
    const actual = server.address().port;
    fs.writeFileSync(STATE, JSON.stringify({
      port: actual, pid: process.pid, startedAt: Date.now(), version: '0.1.0',
    }), 'utf8');
    process.stderr.write('[mdlens-daemon] listening on 127.0.0.1:' + actual +
      ' docs=' + loaded + '\n');
  });

  process.on('uncaughtException', (e) => {
    process.stderr.write('[mdlens-daemon] ' + (e.stack || e) + '\n');
  });
  // 不监听 SIGTERM/SIGINT 自动退出：这个进程本来就该常驻，
  // 想停掉走 POST /shutdown 或 mdlens stop。
}

if (require.main === module) startDaemon();

module.exports = { startDaemon, STATE, HOME, DOCS, META };