# Changelog

所有版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`。

---

## v1.3.0 — 2026-11-11

**双排版皮肤 · 最近打开 · 桌面安装版**

### 新增

| 项目 | 说明 |
| --- | --- |
| ▥ 卡片皮肤 | 浅灰画布 `#fafafa` + 12px 圆角白纸面，8px 小卡、蓝色强调、深色编号块；按 `##` 自动分节（无 `##` 时回落 `h1`，再回落单卡） |
| ▭ 纸张皮肤 | 暖米画布 `#f5f2ea` + 象牙纸面 `#fdfbf6`，2px 圆角、无投影、衬线标题、暗红强调、页边装订竖线 |
| 最近打开 | 最多 30 条，`Ctrl + R` / 顶栏 🕘 打开；按绝对路径 **重读磁盘原文**，读不到时退回正文缓存；支持筛选、单条删除、清空 |
| 桌面安装版 | Electron + NSIS：桌面 / 开始菜单快捷方式、`.md` / `.markdown` / `.mdown` / `.mkd` 文件关联、单实例、原生菜单、编码识别 |
| iOS 主屏幕包 | `MDReader-iOS-PWA.zip`：manifest / apple-touch-icon / Service Worker，Safari「添加到主屏幕」得到全屏图标；明确不提供系统级默认关联 |
| macOS 构建配置 | 同一份源码产出 `.dmg` 的配置与脚本，需在 macOS 上编译 |

### 修复

- 卡片分节最初只按 `h1` 切，含多个 `##` 的手册只出 1 张卡；改为优先 `h2`，实测示例文档 8 张卡，切换 4 轮不叠加包裹层
- 最近打开点击无反应：`recKey` 用 `\u0000` 拼接键值，写进 HTML 属性时被解析器丢弃 → 改用数组下标 `data-i` + `S.recentView`
- `fileUrl()` 在路径拼接产生多重斜杠时生成 `file:///D:////…`，`fetch` 失败；加 `.replace(/\/{2,}/g, '/')` 归一化
- 皮肤改造引入的回归：`--fs-lead` 定义在 `html` 上会被提前解析成固定 15px，导致 A+/A− 失效；改为 `calc(var(--fs,15px) + var(--fs-bump,0px))`，实测卡片 15→17px、纸张 15.5→17.5px
- 纸张外壳 1000px 导致正文比卡片窄 96px；提到 1024px，正文 854px，与参考件的 860px 对齐
- 打包脚本清理规则漏掉 `.e13*` / `.es_*` 等 Edge 测试 profile → 安装包被污染到 4.9 MB；补齐 glob 后回到 2.07 MB
- 安装版「选择其他应用」列表里看不到 MD Reader：electron-builder 自带的 `APP_ASSOCIATE` 只写默认 ProgId，不写 `OpenWithProgids` / `Applications\<exe>\SupportedTypes`；在 `build/installer.nsh` 的 `customInstall` 补齐 4 种扩展名注册并在 `customUnInstall` 精确清理，实测安装后注册表链路完整

### 验证

- 无头 Edge 实测 5 组状态（card / paper / card 回切 / card 暗色 / paper 暗色）计算样式全部对齐参考件
- 便携版 17 项回归全通过（桌面桥接入后纯 HTML 行为不变）
- 从 zip 解压后 Windows 原生解压中文文件名正常；启动实测状态栏 `MD Reader v1.3 · 本地窗口`
- 最近打开用「投毒缓存 + 真实路径 + 独立 profile」证明读的是磁盘新内容而非旧快照
- Windows 安装包静默安装实测：桌面 `MD Reader.lnk` 生成、`.md` 默认 ProgId 指向 `"…\MD Reader.exe" "%1"`、`OpenWithProgids` 含 MD Reader、`SupportedTypes` 覆盖 4 种扩展名、窗口标题「MD Reader · Markdown 阅读器」正常出现
- iOS PWA 包用无头 Edge 验证注入 manifest / apple-touch-icon 后页面仍正常启动（状态栏 `MD Reader v1.3`）

---

## v1.2.0 — 2026-11-09

- 修复文件拖拽无反应：capture 阶段拦截并阻止浏览器默认导航；`webkitGetAsEntry` 逐条容错、目录递归 5 秒超时、`dataTransfer.files` 同步快照兜底；任何失败都给明确提示
- 状态栏显示版本号 + 运行环境（本地窗口 / 预览网页环境）
- 环境提示条移到欢迎页顶部（原来在首屏以下看不见）
- 左侧空状态新增可点击的「选择 MD 文件 / 选择文件夹」按钮
- 窄窗口工具栏不再被裁切；启动器 URL 带版本号防缓存

## v1.1.0 — 2026-11-08

- 文件扩展名关联（右键「打开方式」）修复
- 拖到 bat 上直接打开单个文档

## v1.0.0 — 2026-11-08

首个可用版本：GFM 渲染、表格可视化、代码高亮、Mermaid、Obsidian 语法、文件树 / 大纲 / 查找、明暗护眼三主题、导出 HTML / 打印 PDF。
