/* ============================================================
   MD Reader · 安全桥接层
   contextIsolation 开启，页面拿不到 Node，只暴露下列白名单方法。
   便携版（纯 HTML）里 window.__MD_DESKTOP__ 不存在，逻辑完全不受影响。
   ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__MD_DESKTOP__', {
  /* 冷启动时积压的 .md 路径 */
  takePending: () => ipcRenderer.invoke('md:take-pending'),

  /* 后续双击 / 单实例转发过来的文件 */
  onOpenFiles: (cb) => {
    ipcRenderer.on('md:open-files', (_e, files) => cb(files));
  },
  onOpenDir: (cb) => {
    ipcRenderer.on('md:open-dir', (_e, dir) => cb(dir));
  },
  onLayout: (cb) => {
    ipcRenderer.on('md:layout', (_e, mode) => cb(mode));
  },
  onReload: (cb) => {
    ipcRenderer.on('md:reload', () => cb());
  },
  onShowHelp: (cb) => {
    ipcRenderer.on('md:show-help', () => cb());
  },

  /* 文本 / 二进制 / 目录读取 */
  readFile: (p) => ipcRenderer.invoke('md:read-file', p),
  readBinary: (p) => ipcRenderer.invoke('md:read-binary', p),
  listDir: (d) => ipcRenderer.invoke('md:list-dir', d),

  /* 系统交互 */
  openDialog: (dirMode) => ipcRenderer.invoke('md:open-dialog', !!dirMode),
  showInFolder: (p) => ipcRenderer.invoke('md:show-in-folder', p),
  openExternal: (u) => ipcRenderer.invoke('md:open-external', u),
  openHelp: () => ipcRenderer.invoke('md:open-help'),
  appInfo: () => ipcRenderer.invoke('md:app-info'),
  platform: process.platform
});
