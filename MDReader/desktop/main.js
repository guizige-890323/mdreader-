/* ============================================================
   MD Reader · 桌面版主进程
   - 直接复用便携版单文件 app/MDReader.html，渲染层零重写
   - 单实例、命令行 / 双击 .md 打开文件、系统文件关联
   - 通过 preload 白名单桥接读写本地文件，不开放 Node 给页面
   ============================================================ */
'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const MD_EXT = /\.(md|markdown|mdown|mkd|mdown|mdtext)$/i;
const APP_HTML = path.join(__dirname, 'app', 'MDReader.html');

let win = null;
let pendingFiles = [];
let isReady = false;

/* ---------- 与便携版一致的 file:// 跨文件访问能力（相对图片 / fetch 重读） ---------- */
app.commandLine.appendSwitch('allow-file-access-from-files');

/* ---------- 编码识别：UTF-8 → GB18030 → 兜底 ---------- */
function decodeFile(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { ok: true, text: buf.toString('utf8', 3), enc: 'UTF-8 BOM', size: buf.length };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { ok: true, text, enc: 'UTF-8', size: buf.length };
  } catch (_) { /* 非 UTF-8，继续 */ }
  try {
    const text = new TextDecoder('gb18030', { fatal: false }).decode(buf);
    return { ok: true, text, enc: 'GB18030', size: buf.length };
  } catch (_) { /* 不支持该编码 */ }
  return { ok: true, text: buf.toString('utf8'), enc: 'UTF-8(?)', size: buf.length };
}

function isMd(p) {
  return typeof p === 'string' && MD_EXT.test(p);
}

function collectFromArgv(argv) {
  const out = [];
  for (const a of (argv || [])) {
    if (!isMd(a)) continue;
    const abs = path.isAbsolute(a) ? a : path.resolve(process.cwd(), a);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push(abs);
  }
  return out;
}

function pushFiles(files) {
  const valid = files.filter(isMd);
  if (!valid.length) return;
  if (isReady && win && !win.isDestroyed()) {
    win.webContents.send('md:open-files', valid);
  } else {
    pendingFiles.push(...valid);
  }
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

/* ---------- 单实例：第二次双击 md 时复用已有窗口 ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _cwd) => {
    pushFiles(collectFromArgv(argv));
  });

  /* macOS：Finder 双击 / 拖到 Dock 图标 */
  app.on('open-file', (event, p) => {
    event.preventDefault();
    if (isMd(p)) pushFiles([p]);
  });

  app.whenReady().then(() => {
    /* 首次启动也可能带文件参数（双击 .md 冷启动） */
    pendingFiles = collectFromArgv(process.argv.slice(1));
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- 窗口 ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 940,
    minHeight: 620,
    title: 'MD Reader',
    backgroundColor: '#fafafa',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());

  /* 外部链接走系统浏览器，不在应用内开新窗口 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  win.loadFile(APP_HTML, { query: { desktop: '1' } }).catch((e) => {
    dialog.showErrorBox('MD Reader 启动失败', '找不到 app/MDReader.html\n\n' + e.message);
  });

  win.webContents.once('did-finish-load', () => {
    isReady = true;
    if (pendingFiles.length) {
      const files = pendingFiles.slice();
      pendingFiles = [];
      win.webContents.send('md:open-files', files);
    }
  });
}

/* ---------- 应用菜单（保留常用快捷键，隐藏菜单栏） ---------- */
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: () => chooseAndOpen() },
        { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: () => chooseAndOpen(true) },
        { type: 'separator' },
        { label: '重新读取', accelerator: 'F5', click: () => win && win.webContents.send('md:reload') },
        { label: '打印 / 另存为 PDF', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'copy', label: '复制' }, { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '卡片皮肤', accelerator: 'CmdOrCtrl+1', click: () => win && win.webContents.send('md:layout', 'card') },
        { label: '纸张皮肤', accelerator: 'CmdOrCtrl+2', click: () => win && win.webContents.send('md:layout', 'paper') },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '使用说明', click: () => win && win.webContents.send('md:show-help') },
        { label: '关于 MD Reader', click: () => showAbout() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function chooseAndOpen(dirMode) {
  if (!win) return;
  const props = dirMode
    ? ['openDirectory', 'multiSelections']
    : ['openFile', 'multiSelections'];
  dialog.showOpenDialog(win, {
    title: dirMode ? '选择包含 Markdown 的文件夹' : '打开 Markdown 文件',
    properties: props,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]
  }).then((res) => {
    if (res.canceled || !res.filePaths.length) return;
    if (dirMode) {
      win.webContents.send('md:open-dir', res.filePaths[0]);
    } else {
      win.webContents.send('md:open-files', res.filePaths.filter(isMd));
    }
  });
}

function showAbout() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: '关于 MD Reader',
    message: 'MD Reader v1.3.0 · 桌面版',
    detail: '零安装、零联网、零上传的本地 Markdown 阅读器。\n\n'
      + '卡片 / 纸张双排版皮肤、表格可视化、Mermaid、Obsidian 语法、最近打开。\n'
      + '全部解析在本机完成，程序不发起任何网络请求。\n\n'
      + '内核：marked 15 / highlight.js 11 / mermaid 10 · Electron ' + process.versions.electron,
    buttons: ['好的']
  });
}

/* ---------- 渲染进程白名单 API ---------- */
ipcMain.handle('md:take-pending', () => {
  const files = pendingFiles.slice();
  pendingFiles = [];
  return files;
});

ipcMain.handle('md:read-file', (_e, p) => {
  try {
    if (typeof p !== 'string' || !p) return { ok: false, error: '无效路径' };
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) return { ok: false, error: '文件不存在' };
    if (fs.statSync(abs).size > 32 * 1024 * 1024) return { ok: false, error: '文件超过 32 MB' };
    return decodeFile(abs);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('md:read-binary', (_e, p) => {
  try {
    if (typeof p !== 'string' || !p) return { ok: false };
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) return { ok: false };
    return { ok: true, data: fs.readFileSync(abs).toString('base64') };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('md:list-dir', (_e, dir) => {
  try {
    if (typeof dir !== 'string' || !fs.existsSync(dir)) return { ok: false, files: [] };
    const out = [];
    (function walk(d, prefix, depth) {
      if (depth > 12 || out.length > 4000) return;
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        const rel = prefix ? prefix + '/' + ent.name : ent.name;
        if (ent.isDirectory()) walk(path.join(d, ent.name), rel, depth + 1);
        else if (MD_EXT.test(ent.name)) out.push({ rel, abs: path.join(d, ent.name) });
      }
    })(dir, '', 0);
    return { ok: true, files: out };
  } catch (e) { return { ok: false, files: [], error: e.message }; }
});

ipcMain.handle('md:show-in-folder', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
  return true;
});

ipcMain.handle('md:open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  return true;
});

ipcMain.handle('md:open-help', async () => {
  const candidates = [
    path.join(process.resourcesPath || '', '使用说明.md'),
    path.join(__dirname, 'app', '使用说明.md')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { await shell.openPath(p); return true; }
  }
  dialog.showMessageBox(win, {
    type: 'info', title: '使用说明',
    message: '完整说明随便携版提供（使用说明.md）',
    detail: '也可以在应用内点「✨ 查看示例文档」快速了解全部功能。',
    buttons: ['好的']
  });
  return false;
});

ipcMain.handle('md:open-dialog', async (_e, dirMode) => {
  const props = dirMode ? ['openDirectory'] : ['openFile', 'multiSelections'];
  const res = await dialog.showOpenDialog(win, {
    properties: props,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }]
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('md:app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  userData: app.getPath('userData')
}));
