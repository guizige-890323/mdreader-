#!/usr/bin/env node
'use strict';
/**
 * MDLens CLI —— 把 Markdown 变成人更容易读的东西
 * ===============================================================
 *
 *   mdlens render <file.md>            渲染并打开预览窗口
 *   cat out.md | mdlens render -       从管道读（AI agent 最常用）
 *   mdlens live <file.md>              监听文件，改了自动刷新
 *   mdlens serve                       起一个常驻渲染服务（供 UI / MCP 复用）
 *   mdlens html <file.md> -o out.html  导出独立 HTML（不依赖服务）
 *   mdlens shot <file.md> --png a.png  截图成图片（发给不看 HTML 的人）
 *   mdlens mcp                         以 MCP server 模式运行（stdio）
 *
 * 设计取向：**默认零依赖、零配置、零网络**。
 * 除了 shot（需要浏览器）与 open（需要系统打开方式），其余全部本地内存完成。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const client = require('../lib/client');
const render = require('../lib/render');

// ---------------------------------------------------------------- 参数解析
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out.flags.help = true; continue; }
    if (a === '-v' || a === '--version') { out.flags.version = true; continue; }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) { out.flags[k] = v; continue; }
      // 后面紧跟非 flag 值就当值，否则当布尔
      const nx = argv[i + 1];
      if (nx && !nx.startsWith('-')) { out.flags[k] = nx; i++; }
      else out.flags[k] = true;
      continue;
    }
    if (a.startsWith('-') && a.length === 2) {
      const map = { o: 'out', t: 'theme', p: 'png', w: 'width', n: 'name', P: 'port' };
      const key = map[a[1]] || a[1];
      const nx = argv[i + 1];
      if (nx && !nx.startsWith('-')) { out.flags[key] = nx; i++; }
      else out.flags[key] = true;
      continue;
    }
    out._.push(a);
  }
  return out;
}

const HELP = `MDLens —— AI 输出的可读化渲染器

用法
  mdlens render <file.md | -> [选项]      渲染并打开预览
  mdlens live   <file.md>     [选项]      监听文件，改动即刷新
  mdlens serve                [选项]      常驻服务（默认 7788）
  mdlens stop                             停止常驻服务
  mdlens status                           查看服务状态
  mdlens ls                               列出最近渲染的文档
  mdlens html   <file.md | -> [选项]      导出独立 HTML
  mdlens shot   <file.md | -> [选项]      截图 PNG
  mdlens mcp                              以 MCP server 运行（stdio）
  mdlens doctor                           自检环境

输入
  <file.md>   读取该文件
  -           从 stdin 读（管道 / AI agent 输出）
  省略        从 stdin 读（同 -）

选项
  -o, --out <path>      html 命令的输出路径（默认与输入同名 .html）
  -p, --png <path>      shot 的输出路径（默认与输入同名 .png）
  -t, --theme <name>    light | dark | sepia          （默认 dark）
  -w, --width <px>      正文最大宽度 560–1400         （默认 900）
      --chart <type>    auto | bar | line | trend | pie | rose   图表类型（默认 auto）
      --no-chart        不自动把表格生成图表
      --layout <name>   card | paper                   （默认 card）
      --table <name>    mono | tech | gov | cute       （默认 mono）
      --font <px>       正文字号 12–28                 （默认 15）
      --papermatte      云晰柔光：纸感滤镜 + 颗粒（纸质书观感）
      --no-papermatte   关闭柔光（默认关）
      --flow-structure <name>  流程图结构：auto | pipeline | mindmap | org | timeline
      --pm <k=v,...>    柔光参数，如 sepia=12,con=89,noise=2.8
      --port <n>        serve 端口（默认 7788，0 = 随机）
      --no-open         不自动打开浏览器
      --wait <n>        截图前等待毫秒（默认 2600，Mermaid/图表需要时间）

示例
  # AI 直接管道过来
  echo "# 标题\\n正文" | mdlens render -

  # 看一个文档，边改边看
  mdlens live report.md

  # 导出给同事（不装任何东西也能打开）
  mdlens html report.md -o report.html

  # 把图表截成图，贴进群聊
  mdlens shot report.md -p chart.png
`;

// ---------------------------------------------------------------- 输入读取
async function readInput(args) {
  const target = args._[1];
  if (target && target !== '-') {
    const p = path.resolve(target);
    if (!fs.existsSync(p)) throw new Error('文件不存在：' + p);
    return { md: fs.readFileSync(p, 'utf8'), name: path.basename(p), file: p };
  }
  // stdin
  if (process.stdin.isTTY) throw new Error('没有输入：请给文件路径，或把 Markdown 管道进来');
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return { md: Buffer.concat(chunks).toString('utf8'), name: 'stdin.md', file: null };
}

function prefsFromFlags(f) {
  const p = {};
  if (f.theme) p.theme = String(f.theme);
  if (f.layout) p.layout = String(f.layout);
  if (f.table) p.tableTheme = String(f.table);
  if (f.font) p.font = f.font;
  if (f.width) p.width = f.width;
  if (f.lang) p.lang = String(f.lang);
  if (f.chart) p.chartType = String(f.chart);
  if (f['no-chart']) p.chartAuto = false;
  /* 流程图结构：auto | pipeline | mindmap | org | timeline */
  if (f['flow-structure']) p.flowMode = String(f['flow-structure']);
  if (f['flow-mode']) p.flowMode = String(f['flow-mode']);
  /* 柔光：--papermatte 开，--no-papermatte 关；--pm 给细分参数 */
  if (f.papermatte === true) p.papermatte = true;
  if (f['no-papermatte'] === true) p.papermatte = false;
  if (f.pm) {
    const o = {};
    String(f.pm).split(',').forEach((kv) => {
      const [k, v] = kv.split('=');
      const n = parseFloat(v);
      if (k && Number.isFinite(n)) o[k.trim()] = n;
    });
    if (Object.keys(o).length) { p.papermatte = true; p.pm = o; }
  }
  return p;
}

function openBrowser(url) {
  const plat = process.platform;
  try {
    if (plat === 'win32') {
      // 直接 start 会因为引号问题失败，用 cmd 包一层；detached 让 CLI 不被挂住
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (plat === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch (e) {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 命令实现
async function cmdRender(args) {
  const input = await readInput(args);
  if (!input.md.trim()) throw new Error('输入为空');

  /* 默认走「文件」而不是「服务」：
     文件不会过期，服务会。AI 交付给人的东西不该依赖一个活着的进程。 */
  if (args.flags.serve) {
    const r = await client.put(input.md, {
      name: input.name, prefs: prefsFromFlags(args.flags),
    });
    console.log('MDLens 已推送（服务模式）');
    console.log('  url   : ' + r.url);
    if (!args.flags['no-open']) openBrowser(r.url);
    return;
  }

  const out = render.renderToFile(input.md, {
    name: input.name,
    prefs: prefsFromFlags(args.flags),
  });

  console.log('MDLens 渲染完成');
  console.log('  file  : ' + out.path);
  console.log('  size  : ' + (out.bytes / 1024 / 1024).toFixed(2) + ' MB');
  console.log('  chars : ' + input.md.length);

  if (!args.flags['no-open']) {
    const ok = openBrowser(out.fileUrl);
    console.log('  浏览器: ' + (ok ? '已打开' : '未能自动打开，请手动打开上面的 file'));
  }
  console.log('\n单文件、离线可开、无过期风险。');
}

async function cmdLive(args) {
  const target = args._[1];
  if (!target || target === '-') throw new Error('live 需要一个文件路径');

  const p = path.resolve(target);
  if (!fs.existsSync(p)) throw new Error('文件不存在：' + p);

  const read = () => fs.readFileSync(p, 'utf8');
  const r = await client.put(read(), {
    name: path.basename(p),
    prefs: prefsFromFlags(args.flags),
  });

  console.log('MDLens 监听中…');
  console.log('  file  : ' + p);
  console.log('  url   : ' + r.url);
  if (!args.flags['no-open']) openBrowser(r.url);

  // fs.watch 在 Windows 上偶发重复事件，用 debounce 压一下
  let timer = null;
  let last = read();
  fs.watch(p, { persistent: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const now = read();
        if (now === last) return;
        last = now;
        await client.put(now, { id: r.previewId });
        process.stdout.write('.');
      } catch (e) {
        console.error('\n更新失败：' + e.message);
      }
    }, 120);
  });

  console.log('\n文件改动即刷新。按 Ctrl+C 结束。');
  await new Promise(() => { });
}

async function cmdServe(args) {
  const s = await client.ensure();
  const h = await client.health();
  console.log('MDLens 服务运行中（守护进程）');
  console.log('  origin : ' + s.origin);
  console.log('  pid    : ' + (h.pid || s.pid));
  console.log('  docs   : ' + (h.docs != null ? h.docs : '?'));
  console.log('  engine : ' + path.resolve(__dirname, '..', 'engine', 'MDLens.html'));
  console.log('');
  console.log('接口：');
  console.log('  POST ' + s.origin + '/doc            {"md":"...","name":"a.md"}');
  console.log('  GET  ' + s.origin + '/doc/<id>');
  console.log('  GET  ' + s.origin + '/v/<id>          预览页（SSE 自动刷新）');
  console.log('  GET  ' + s.origin + '/events/<id>     SSE 事件流');
  console.log('  GET  ' + s.origin + '/docs            文档列表');
  console.log('  GET  ' + s.origin + '/healthz');
}

async function cmdStop() {
  const before = await client.ping();
  if (!before) { console.log('服务未运行'); return; }
  await client.shutdown();
  console.log('服务已停止（pid ' + before.pid + '）');
}

async function cmdStatus() {
  const h = await client.ping();
  if (!h) { console.log('服务未运行。运行 mdlens serve 启动。'); return; }
  const st = client.STATE;
  console.log('MDLens 服务状态');
  console.log('  pid      : ' + h.pid);
  console.log('  docs     : ' + h.docs);
  console.log('  uptime   : ' + h.uptime + 's');
  console.log('  version  : ' + h.version);
  console.log('  state    : ' + st);
  console.log('  data dir : ' + client.HOME);
}

async function cmdList() {
  // 默认路径产出的自包含文件（不会过期，是主要产物）
  const files = render.listRendered();

  // 守护进程里的实时文档（可选路径，进程活着才有效）
  let live = [];
  try {
    const r = await client.list();
    live = (r && r.docs) || [];
  } catch (e) { /* 守护进程没起过就算了，不该让 ls 失败 */ }

  if (!files.length && !live.length) {
    console.log('还没有渲染产物。');
    console.log('  mdlens render <file.md>');
    return;
  }

  if (files.length) {
    console.log('已渲染的文件（' + files.length + ' 个，离线可开、不会过期）：');
    console.log('');
    for (const f of files.slice(0, 30)) {
      const when = new Date(f.mtime).toLocaleString('zh-CN');
      console.log('  ' + f.id.slice(0, 16) + '  ' + when + '  ' +
        (f.bytes / 1024 / 1024).toFixed(2) + 'MB  ' + f.name);
      console.log('    ' + f.fileUrl);
    }
  }

  if (live.length) {
    if (files.length) console.log('');
    console.log('实时预览文档（' + live.length + ' 个，需守护进程存活）：');
    console.log('');
    const s = await client.ensure();
    for (const d of live.slice(0, 30)) {
      const when = new Date(d.updated).toLocaleString('zh-CN');
      console.log('  ' + d.id + '  ' + when + '  ' + (d.name || ''));
      console.log('    ' + s.origin + '/v/' + d.id);
    }
  }
}

async function cmdHtml(args) {
  const input = await readInput(args);
  if (!input.md.trim()) throw new Error('输入为空');

  const out = render.renderToFile(input.md, {
    name: input.name,
    prefs: prefsFromFlags(args.flags),
  });

  // 指定了输出路径就搬过去
  let finalPath = out.path;
  if (args.flags.out) {
    finalPath = path.resolve(args.flags.out);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.copyFileSync(out.path, finalPath);
    try { fs.unlinkSync(out.path); } catch (e) { }
  }

  console.log('已导出：' + finalPath);
  console.log('  size : ' + (fs.statSync(finalPath).size / 1024 / 1024).toFixed(2) + ' MB');
  console.log('  说明 : 单文件、离线可开、无需安装任何东西');
  return finalPath;
}

async function cmdShot(args) {
  const input = await readInput(args);
  if (!input.md.trim()) throw new Error('输入为空');

  let pw;
  try {
    pw = require('playwright-core');
  } catch (e) {
    throw new Error('截图需要 playwright-core：npm i -D playwright-core\n' +
      '（或改用 mdlens html 导出，再用任意工具截图）');
  }

  const r = await client.put(input.md, {
    name: input.name,
    prefs: prefsFromFlags(args.flags),
  });

  const browser = await pw.chromium.launch({
    channel: lookupChannel(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({
    viewport: { width: Number(args.flags['vw'] || 1280), height: Number(args.flags['vh'] || 900) },
    deviceScaleFactor: Number(args.flags['scale'] || 2),
  });
  await page.goto(r.url, { waitUntil: 'domcontentloaded' });
  await sleep(Number(args.flags.wait || 2600));

  const outPath = path.resolve(args.flags.png || (input.file
    ? input.file.replace(/\.(md|markdown|mdown|mkd)$/i, '') + '.png'
    : 'mdlens-output.png'));

  if (args.flags.full) {
    await page.screenshot({ path: outPath, fullPage: true });
  } else {
    await page.screenshot({ path: outPath });
  }
  await browser.close();

  console.log('已截图：' + outPath);
  return outPath;
}

function lookupChannel() {
  // Windows 上优先复用系统已装的 Edge，避免下载 Chromium
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return 'msedge';
  return undefined; // 交给 playwright 找自带 chromium
}

async function cmdDoctor() {
  const p = require('../package.json');
  const enginePath = path.resolve(__dirname, '..', 'engine', 'MDLens.html');
  const has = fs.existsSync(enginePath);
  console.log('MDLens 环境自检');
  console.log('  version     : ' + p.version);
  console.log('  node        : ' + process.version);
  console.log('  platform    : ' + process.platform + ' ' + os.arch());
  console.log('  engine      : ' + (has ? 'OK  ' + (fs.statSync(enginePath).size / 1024 / 1024).toFixed(2) + ' MB'
    : '缺失 —— 先运行 python scripts/build-engine.py'));
  console.log('  engine path : ' + enginePath);
  try {
    const pw = require('playwright-core');
    console.log('  playwright  : OK（截图可用）');
    try {
      // 只检测可执行文件存在性，不启动浏览器
      const { chromium } = pw;
      console.log('  browser     : ' + (chromium.executablePath() ? 'chromium 已就绪' : '需下载'));
    } catch (e) { console.log('  browser     : 需下载（npx playwright install chromium）'); }
  } catch (e) {
    console.log('  playwright  : 未安装（截图不可用，其余功能正常）');
  }
  console.log('  http server : OK（内置，无外部依赖）');
}

// ---------------------------------------------------------------- 入口
(async () => {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args._[0];

  if (!cmd || args.flags.help) { console.log(HELP); return; }
  if (args.flags.version) {
    console.log(require('../package.json').version);
    return;
  }

  try {
    switch (cmd) {
      case 'render': await cmdRender(args); break;
      case 'live': await cmdLive(args); break;
      case 'serve': await cmdServe(args); break;
      case 'stop': await cmdStop(); break;
      case 'status': await cmdStatus(); break;
      case 'ls': case 'list': await cmdList(); break;
      case 'html': await cmdHtml(args); break;
      case 'shot': await cmdShot(args); break;
      case 'doctor': await cmdDoctor(); break;
      case 'mcp': require('../lib/mcp').run(); break;
      default:
        console.error('未知命令：' + cmd + '\n运行 mdlens --help 查看用法');
        process.exitCode = 2;
    }
  } catch (e) {
    console.error('错误：' + (e && e.message || e));
    process.exitCode = 1;
  }
})();