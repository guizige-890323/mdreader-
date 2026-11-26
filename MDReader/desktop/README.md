# MD Reader · 桌面版工程

把便携版 `dist/MDReader.html` 装进原生应用壳，**渲染层零重写**。

| 平台 | 产物 | 状态 |
| --- | --- | --- |
| Windows 11 | `release/MD Reader Setup 1.3.0.exe`（NSIS 安装包） | ✅ 可在本仓库直接构建 |
| macOS 11+ | `release/MD Reader-1.3.0.dmg` | ✅ 配置就绪，需在 Mac 上执行 `scripts/build-mac.sh` |
| Linux | `.AppImage` | 🔧 配置就绪，未做实机验证 |
| iOS / iPadOS | `../../MDReader-iOS-PWA.zip` | ⚠️ 非本工程产物：走 `../ios/build-pwa.py` 的 PWA 主屏幕包；Electron 不支持 iOS，且 iOS 无"默认打开程序"机制，见 `../../docs/PLATFORM.md` |

---

## 快速开始

```bash
cd MDReader/desktop
npm install
npm start          # 开发模式，直接看窗口效果
npm run build:win   # 打 Windows 安装包
```

国内网络（GitHub 二进制常被拦）：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

若 `npm install` 之后 `node_modules/electron/dist/electron.exe` 不存在（postinstall 被跳过）：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

---

## 满足"装完就能用"的三件事

| 需求 | 实现位置 |
| --- | --- |
| 安装后桌面展示入口和图标 | `package.json` → `nsis.createDesktopShortcut: "always"` + `createStartMenuShortcut: true`，图标 `build/icon.ico` |
| 可以设为 `.md` 默认打开程序 | `package.json` → `fileAssociations` 注册 4 种扩展名；`build/installer.nsh` 额外写 `OpenWithProgids` 与 `Applications\MD Reader.exe\SupportedTypes`，保证「选择其他应用」里能选到 |
| 双击文件真正打开 | `main.js` 单实例锁 + `argv` / `open-file`，路径经 `preload.js` 白名单桥传给渲染层 |

用户设为默认的路径：右键 `.md` → 打开方式 → 选择其他应用 → **MD Reader** → 勾选「始终使用此应用打开 .md 文件」。因为写的是 HKCU，安装不需要管理员权限。

---

## 结构

```
desktop/
├── package.json          electron + electron-builder 全部配置（含文件关联）
├── main.js                主进程：单实例 / 窗口 / 菜单 / 编码识别 / IPC
├── preload.js             安全白名单桥（contextIsolation，页面拿不到 Node）
├── app/                   与便携版共用的渲染产物（由 sync-app.py 同步）
│   ├── MDReader.html
│   ├── 示例文档.md
│   ├── 使用说明.md
│   └── assets/
├── build/
│   ├── icon.ico / icon.png        应用图标
│   ├── mdfile.ico / mdfile.png   .md 文档类型图标
│   └── installer.nsh             NSIS 片段：补 OpenWithProgids / SupportedTypes + 卸载清理
├── scripts/
│   ├── sync-app.py               从 dist/ 同步渲染产物
│   ├── make-icons.py              纯 Pillow 生成图标
│   ├── verify-portable.py         便携版 17 项回归
│   ├── verify-themes.py           主题矩阵 11 项回归（护眼不被皮肤覆盖）
│   └── build-mac.sh               macOS 构建
└── release/                构建输出
```

---

## 主进程做了哪些便携版做不到的事

| 能力 | 说明 |
| --- | --- |
| 单实例复用 | 已开窗口时再双击 md，不弹第二个窗口，直接转发到现有窗口并聚焦 |
| 原生文件对话框 | 应用菜单 `Ctrl+O` / `Ctrl+Shift+O` 走系统选择器 |
| 编码识别 | `TextDecoder` 严格 UTF-8 → GB18030 → 兜底，BOM 单独处理；32 MB 上限保护 |
| 绝对路径 | 拖进来的 `File.path` 与启动参数都保留绝对路径，最近打开可重读磁盘原文 |
| 系统交互 | 外部链接交系统浏览器、在资源管理器中显示、打开安装目录里的使用说明 |
| 安全边界 | `nodeIntegration: false` + `contextIsolation: true`，只暴露白名单方法；`will-navigate` 拦外链 |

`--allow-file-access-from-files` 与便携版 Edge 启动器保持一致，用于文档里的相对图片路径。

---

## 便携版与桌面版如何共用一份代码

`src/app.js` 通过 `window.__MD_DESKTOP__` 判断环境：

```js
function initDesktop() {
  var D = window.__MD_DESKTOP__;
  if (!D) return false;          // 纯 HTML 下直接返回，零影响
  ...
}
```

改动必须过 `python scripts/verify-portable.py`（17 项）与 `python scripts/verify-themes.py`（主题矩阵 11 项）。CI 会跑这两步，后者专门防止主题变量被皮肤层叠覆盖。

---

## 常见问题

**Q：安装包多大？** Electron 自带 Chromium 运行时，会比 2 MB 的便携版大不少。追求极小体积 / U 盘场景请用便携版。

**Q：安装要管理员权限吗？** 不需要，`perMachine: false`，只写当前用户 HKCU 与用户目录。

**Q：SmartScreen 提示"未知发布者"？** 未购买代码签名证书。可自行加签名（在 `package.json` 的 `win` 段配置 `certificateFile` / `certificatePassword`），或在 GitHub Release 里附上 SHA256 校验值。

**Q：安装包为什么比较大？** 内含 Electron/Chromium 运行时。追求极小体积请用免安装便携版（约 2 MB，靠系统自带 Edge）。

---

## 验证清单

发版前逐项确认：

- [ ] `node --check main.js` / `preload.js` / `src/app.js` 全通过
- [ ] `python scripts/verify-portable.py` 输出 `17 / 17 passed`
- [ ] `python scripts/verify-themes.py` 输出 `11 / 11 passed`
- [ ] 安装包装完桌面出现「MD Reader」图标，开始菜单也有
- [ ] 右键 `.md` 的「打开方式」里能看到 MD Reader，文档图标正确
- [ ] 双击 `.md` 冷启动能打开内容；已开窗口时双击第二个文件复用同一窗口
- [ ] 中文 UTF-8 / GB18030 文档都不乱码
- [ ] 最近打开点历史记录读到的是磁盘最新内容（改文件后重开验证）
- [ ] 全程断网可用，无外部请求
