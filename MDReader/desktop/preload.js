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
  onEdit: (cb) => {
    ipcRenderer.on('md:edit', () => cb());
  },
  onSave: (cb) => {
    ipcRenderer.on('md:save', () => cb());
  },
  onNew: (cb) => {
    ipcRenderer.on('md:new', () => cb());
  },
  onNewFromClipboard: (cb) => {
    ipcRenderer.on('md:new-from-clipboard', () => cb());
  },

  /* 文本 / 二进制 / 目录读取 */
  readFile: (p) => ipcRenderer.invoke('md:read-file', p),
  readBinary: (p) => ipcRenderer.invoke('md:read-binary', p),
  listDir: (d) => ipcRenderer.invoke('md:list-dir', d),

  /* 系统交互 */
  openDialog: (dirMode) => ipcRenderer.invoke('md:open-dialog', !!dirMode),
  writeFile: (p, text, enc) => ipcRenderer.invoke('md:write-file', p, text, enc),
  /* 新建文档另存为：弹系统保存对话框并写盘（UTF-8） */
  saveAs: (suggestName, text) => ipcRenderer.invoke('md:save-as', suggestName, text),
  /* 读取系统剪贴板文本（用于「创建 MD」悬停快速粘贴） */
  readClipboard: () => ipcRenderer.invoke('md:read-clipboard'),
  /* 同时带 LOGO 组，让桌面窗口 / 任务栏图标跟随「应用图标」设置与深浅主题 */
  setTheme: (t, logo) => ipcRenderer.invoke('md:set-theme', { theme: t, logo: logo || 'cartoon' }),
  /* 界面语言：同步桌面壳原生菜单 / 对话框的中英文 */
  setLang: (lang) => ipcRenderer.invoke('md:set-lang', lang),
  showInFolder: (p) => ipcRenderer.invoke('md:show-in-folder', p),
  openExternal: (u) => ipcRenderer.invoke('md:open-external', u),
  openHelp: () => ipcRenderer.invoke('md:open-help'),
  appInfo: () => ipcRenderer.invoke('md:app-info'),
  platform: process.platform
});
