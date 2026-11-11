# 平台能力边界说明

需求原文提到"适配 Windows 和 iOS 的 PC 应用版本，安装后桌面展示入口和图标，可设为 MD 默认打开程序"。这里把三个平台的能力差异讲清楚，避免交付一个看起来支持、实际做不到的东西。

---

## 一、先厘清一个概念

| 说法 | 实际对应的系统 |
| --- | --- |
| Windows PC 应用 | Windows 10/11 桌面程序 ✅ |
| "iOS 的 PC 应用" | **iOS/iPadOS 是移动系统，没有 PC 版本**；苹果的桌面系统是 **macOS** |
| 桌面展示图标 | Windows 桌面 / macOS 应用程序与 Dock |
| 设为 `.md` 默认打开程序 | 只有 Windows 与 macOS 提供这套系统级注册机制 |

所以本项目的交付是 **Windows 安装版（已完成）+ macOS 安装版（同源代码，构建脚本已备好）+ iOS/iPadOS 主屏幕 PWA 包（能力范围内做到图标，不假装支持默认关联）**。

---

## 二、能力对照

| 能力 | Windows 11 | macOS 11+ | iOS / iPadOS |
| --- | --- | --- | --- |
| 安装后桌面图标 | ✅ NSIS `createDesktopShortcut: always` | ✅ .app 拖进 Dock / 应用程序文件夹 | ⚠️ PWA「添加到主屏幕」图标，无"桌面"概念 |
| 开始菜单 / 应用列表 | ✅ | ✅ Launchpad | ⚠️ 主屏幕 |
| 注册 `.md` 等扩展名关联 | ✅ 安装时写 `HKCU\Software\Classes`，4 种扩展名 | ✅ `CFBundleDocumentTypes` | ⚠️ 只能声明"可打开此类文档"，不能注册默认 |
| 设为系统默认打开程序 | ✅ 右键"打开方式"或设置里选 | ✅ 访达「显示全部更改…」 | ❌ **系统不允许**第三方注册全局扩展名默认程序，每次都要用户在共享表单里手动选一次 |
| 双击文件冷启动 / 复用已开窗口 | ✅ 单实例锁 + argv | ✅ `open-file` 事件 | ⚠️ 走 `UIApplication openInPlace` / 共享扩展 |
| 读取任意本地 md | ✅ | ✅（沙箱外需用户授权） | ⚠️ 只能在自己的沙箱或用户通过文件选择器授予的路径 |
| 离线、零网络请求 | ✅ | ✅ | ✅（若做） |

---

## 三、Windows 文件关联是怎么实现的

`desktop/package.json` 里声明：

```json
"fileAssociations": [
  { "ext": "md", "name": "Markdown Document", "mimeType": "text/markdown", "role": "Viewer", "icon": "build/mdfile.ico" },
  { "ext": "markdown" }, { "ext": "mdown" }, { "ext": "mkd" }
]
```

electron-builder 的 NSIS 安装器会写入 `HKCU\Software\Classes\.md` 等项，并把 `shell\open\command` 指向安装后的 exe，同时传 `%1`（文件路径）。卸载时自动清理。因为是 HKCU 而不是 HKLM，**不需要管理员权限**。

> **一个容易踩的坑**：electron-builder 内置的 `APP_ASSOCIATE` 宏只写 `.md` 的默认 ProgId，**不写 `OpenWithProgids`，也不注册 `Applications\<exe>\SupportedTypes`**。结果就是双击能打开，但「右键 → 打开方式 → 选择其他应用」列表里根本找不到 MD Reader，用户没法把它设为默认。
> 因此 `desktop/build/installer.nsh` 的 `customInstall` 里额外补了 4 种扩展名的 `OpenWithProgids` 值、`Applications\MD Reader.exe\SupportedTypes` 与 `shell\open\command`，并调用 `SHChangeNotify` 刷新资源管理器缓存；`customUnInstall` 精确删除这些项，不碰其他应用。实测安装后注册表：
> ```
> .md 默认 = Markdown Document
> .md\OpenWithProgids 含 Markdown Document
> Applications\MD Reader.exe\SupportedTypes = .md / .markdown / .mdown / .mkd
> command = "…\MD Reader.exe" "%1"
> 桌面 MD Reader.lnk = True
> ```

单实例逻辑在 `desktop/main.js`：
- 冷启动：`process.argv` 里挑出 `.md` 路径 → 暂存 `pendingFiles` → 窗口 `did-finish-load` 后通过 `md:open-files` 发给渲染层
- 已在运行：`second-instance` 事件把新文件路径转发给已有窗口并 `focus()`
- macOS：`open-file` 事件

用户设为默认：右键 md → 打开方式 → 选择其他应用 → MD Reader → 勾选"始终使用此应用打开 .md 文件"。

---

## 四、macOS 要做什么

同一份 `desktop/` 源码，在一台 Mac 上执行：

```bash
cd MDReader/desktop
npm install
npm run build:mac     # → release/MD Reader-1.3.0.dmg
```

`electron-builder` 会根据 `fileAssociations` 自动生成 `Info.plist` 的 `CFBundleDocumentTypes` 与 `CFBundleTypeExtensions`，`.md` 图标由 `build/icon.png` 生成 `.icns`。

> 为什么不能在 Windows 上直接产出可安装的 dmg：签名、`.icns`、`hdiutil` 都依赖 macOS 工具链。GitHub Actions 的 `macos-latest` runner 可以自动出包，见 `.github/workflows/ci.yml` 里的 `build-mac` job（需手动触发）。

---

## 五、iOS 能做到什么、做不到什么

**本仓库已交付的最可行方案：PWA 主屏幕包** `MDReader-iOS-PWA.zip`（由 `MDReader/ios/build-pwa.py` 生成）。它把同一份 `MDReader.html` 加上 manifest / apple-touch-icon / Service Worker，局域网起一个静态服务后，用 Safari「添加到主屏幕」即可得到全屏、无地址栏的图标。HTTPS 托管时 `sw.js` 会把整站缓存下来，断网也能打开。

```bash
cd MDReader-iOS-PWA
python -m http.server 8000 --bind 0.0.0.0
# iPhone Safari 打开 http://<电脑局域网IP>:8000/ → 分享 → 添加到主屏幕
```

**原生 App 能做到**（需另起 SwiftUI + WKWebView 工程，复用同一份 `MDReader.html`）：
- 在 `Info.plist` 声明 `CFBundleDocumentTypes` 支持 `net.daringfireball.markdown` UTI
- 出现在「共享 → 用其他应用打开」列表里
- 用 `UIDocumentPickerViewController` 主动选文件导入
- 完全离线渲染

**做不到**：
- 成为 `.md` 的系统默认打开程序（iOS 没有这个机制）
- 后台扫描整个文档库（沙箱限制）
- 用 Electron（Electron 不支持 iOS）
- 静默访问任意绝对路径

**结论**：如果目标是"在 iPad 上看 md"，用已交付的 PWA 包即可；要进「共享表单」列表则另起 SwiftUI 工程。如果目标是"双击 md 自动用本程序打开 / 设为默认"，那只在 Windows / macOS 成立，iOS 系统层面无解。要不要做原生 iOS 版，取决于你是否需要移动端阅读，而不是"默认打开程序"这个诉求。

---

## 六、便携版依然在

`MDReader/dist/` 保持原样：解压即用、免安装、不改注册表，适合 U 盘和内网离线机器。桌面安装版只是多了一层壳，iOS PWA 包只是加了 manifest 与图标，**三者共用同一份 `MDReader.html`，功能完全一致**。改渲染层时三边同时更新（`build.py` → `sync-app.py` / `ios/build-pwa.py`）。