'use strict';
/**
 * 守护进程客户端
 * ===============================================================
 * 上层（CLI / MCP / 任何调用方）只跟这个模块打交道，不关心
 * 服务是刚拉起的、还是早就跑着的。
 *
 * 发现策略（按顺序）：
 *   1. 环境变量 MDLENS_URL  —— 显式指定，测试与容器场景用
 *   2. ~/.mdlens/daemon.json 里的端口 —— 正常路径
 *   3. 都没有 / 探活失败 → 拉起一个 detached 守护进程，等它就绪
 *
 * 三处都失败才报错，且错误信息要说清「怎么自己救」。
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOME = path.join(os.homedir(), '.mdlens');
const STATE = path.join(HOME, 'daemon.json');
const DAEMON_JS = path.resolve(__dirname, 'daemon.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try {
    const j = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    if (j && j.port) return j;
  } catch (e) { }
  return null;
}

function request(method, urlPath, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const st = readState() || {};
    const origin = process.env.MDLENS_URL || ('http://127.0.0.1:' + st.port);
    if (!origin || origin.endsWith(':undefined')) {
      return reject(new Error('no-origin'));
    }
    const u = new URL(urlPath, origin);
    const data = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: Object.assign(
        { Accept: 'application/json' },
        data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}
      ),
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          const err = new Error('HTTP ' + res.statusCode + ': ' + txt.slice(0, 200));
          err.status = res.statusCode;
          return reject(err);
        }
        try { resolve(JSON.parse(txt)); }
        catch (e) { resolve(txt); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function ping() {
  try {
    const r = await request('GET', '/healthz', null, 1200);
    return r && r.ok ? r : null;
  } catch (e) { return null; }
}

/** 拉起守护进程（detached，父进程退出它仍在） */
function spawnDaemon() {
  const child = spawn(process.execPath, [DAEMON_JS], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: Object.assign({}, process.env, {
      MDLENS_PORT: String(process.env.MDLENS_PORT || 7788),
    }),
  });
  child.unref();
  return child.pid;
}

let ensurePromise = null;

/**
 * 保证有一个可用守护进程，返回 { origin, port, pid }
 */
function ensure() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // 1) 显式 URL
    if (process.env.MDLENS_URL) {
      const p = await ping();
      if (p) return { origin: process.env.MDLENS_URL, port: p.port || 0, pid: p.pid, external: true };
    }
    // 2) 已有 daemon.json
    let st = readState();
    if (st) {
      const p = await ping();
      if (p) {
        return {
          origin: process.env.MDLENS_URL || ('http://127.0.0.1:' + st.port),
          port: st.port, pid: st.pid,
        };
      }
      // 探活失败：可能是崩溃残留（含端口被别的东西占用），清掉再拉
      try { fs.unlinkSync(STATE); } catch (e) { }
    }
    // 3) 拉起
    spawnDaemon();
    // 等就绪：守护进程要读 4MB 引擎 + 扫文档目录，给足 12s
    for (let i = 0; i < 120; i++) {
      await sleep(100);
      const p = await ping();
      if (p) {
        const s2 = readState() || {};
        return {
          origin: 'http://127.0.0.1:' + (s2.port || p.port),
          port: s2.port || p.port, pid: p.pid, spawned: true,
        };
      }
    }
    throw new Error(
      '守护进程启动失败。\n' +
      '可手动排查：\n' +
      '  node "' + DAEMON_JS + '"\n' +
      '（常见原因：7788 端口被占用 → 设 MDLENS_PORT=其他端口）'
    );
  })();

  // 失败后允许重试，不要把错误永久缓存
  ensurePromise.catch(() => { ensurePromise = null; });
  return ensurePromise;
}

// ------------------------------------------------------------- 高层操作
async function put(md, opts = {}) {
  const s = await ensure();
  const r = await request('POST', '/doc', {
    id: opts.id, md, name: opts.name, prefs: opts.prefs, append: opts.append,
  });
  return {
    ...r,
    origin: s.origin,
    url: s.origin + '/v/' + r.id,
    previewId: r.id,
  };
}

async function get(id) {
  return request('GET', '/doc/' + encodeURIComponent(id));
}

async function health() {
  const s = await ensure();
  return request('GET', '/healthz');
}

async function shutdown() {
  try {
    await request('POST', '/shutdown', {});
  } catch (e) { }
  try { fs.unlinkSync(STATE); } catch (e) { }
}

async function list() {
  await ensure();
  return request('GET', '/docs');
}

module.exports = { ensure, put, get, health, shutdown, list, ping, STATE, HOME };