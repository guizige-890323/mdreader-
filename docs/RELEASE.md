# 发布指南

面向维护者的发版清单，以及从本仓库 fork 出自己版本时需要改的位置。

- 维护者发一个新版本 → [第二节](#二发一个新版本)
- 你想基于本项目做自己的发行版 → [第一节](#一fork-者需要改什么)
- 只想了解版本号规则 → [第五节](#五版本号规则)

---

## 一、fork 者需要改什么

本仓库的链接、徽章、作者信息都指向 `guizige-890323/mdreader`。如果你要发布自己的分支，改下面这几处即可，**不需要动其他文件**：

| # | 位置 | 改成 |
| --- | --- | --- |
| 1 | `README.md` / `README.en.md` 顶部徽章与安装链接 | 你的 `用户名/仓库名` |
| 2 | `README.md` / `README.en.md` 的 clone 示例 | 同上 |
| 3 | `MDReader/desktop/package.json` 的 `name` / `build.appId` | 建议改成 `com.<你>.mdreader`，避免与其他安装包冲突 |
| 4 | `LICENSE` 的版权行 | 你的署名 |
| 5 | `SECURITY.md` / `CODE_OF_CONDUCT.md` 的联系方式 | 你的邮箱 |

一次性核对残留（把 `guizige-890323` 换成你要找的串）：

```bash
grep -rn "guizige-890323" --include="*.md" --include="*.yml" --include="*.json" .
```

> ⚠️ 不要用 `sed` 全局替换本文件——本文档里的示例命令本身包含该字符串，替换后命令会失效。逐处手工改更安全。

程序本身不含任何硬编码的仓库地址，fork 后无需改代码。

---

## 二、发一个新版本

仓库只有 `main` 一条长期分支：**小改动直接提 PR 到 `main`，较大的功能先在 fork 或临时分支自测再合入**。不设 `dev` 常驻分支，避免两条线长期并存。

### 1. 提交前自检

```bash
# 语法
node --check MDReader/src/app.js
node --check MDReader/desktop/main.js
node --check MDReader/desktop/preload.js
node --check MDReader/src/mermaid-flow.js
node --check MDReader/src/text-flow.js

# 重建产物（dist 是提交进仓库的，改源码后必须重建）
python MDReader/src/build.py
python MDReader/desktop/scripts/sync-app.py

# 产物漂移自查：应为空输出
git status --short MDReader/dist

# 回归（需要本机有 Edge / Chrome）
python MDReader/desktop/scripts/verify-portable.py    # 期望 17 / 17 passed
python MDReader/desktop/scripts/verify-themes.py      # 期望 11 / 11 passed
```

`git status --short MDReader/dist` 有输出说明你改了源码但没重建，或者重建后忘了 `git add`。CI 会在这一步拦下来。

### 2. 更新 CHANGELOG

`CHANGELOG.md` 是**唯一**版本记录，顶部加新版本段，写清「新增 / 改进 / 修复 / 验证」。不要另建子目录里的变更日志。

### 3. 打 tag 并推送

```bash
git tag -a v1.3.0 -m "v1.3.0 · 双排版皮肤 + 多标签 + 桌面安装版"
git push origin main
git push origin v1.3.0
```

### 4. 建 GitHub Release

1. 仓库 → **Releases** → **Draft a new release**
2. 选择刚推的 tag，Title 与 tag 同名
3. 描述直接复制[第三节模板](#三release-描述模板)
4. **上传附件**（下载量只统计 Release 附件，`git clone` 不计入）
   - `MD Reader Setup 1.3.0.exe` —— 桌面安装版（主线）
   - `MDReader-便携版-v1.3.0.zip` —— 免安装版（U 盘 / 内网）
   - `MDReader-iOS-PWA-v1.3.0.zip` —— iPhone / iPad 主屏幕版
5. 勾 **Set as the latest release** → **Publish release**

> 安装包需在 Windows 本机构建（`cd MDReader/desktop && npm run build:win`）。CI 目前不产出 NSIS 安装包，只产出便携版与 PWA 两个 artifact。

---

## 三、Release 描述模板

```markdown
## v1.3.0 · 双排版皮肤 + 多标签 + 桌面安装版

### 这次更新了什么
- 新增 ▥ 卡片 / ▭ 纸张两套完整排版皮肤（配色、字体、圆角、投影整体切换），顶栏随时切换并记住选择
- 新增多标签：同时打开多个 md，标签栏吸顶、可横向滚动，切换保留各自滚动位置
- 新增「最近打开」：最多 30 条，`Ctrl + R` 打开，按绝对路径重读磁盘原文
- 新增 **Windows 桌面安装版**：桌面 / 开始菜单图标，注册 `.md` / `.markdown` / `.mdown` / `.mkd` 关联并写入 `OpenWithProgids`
- 新增自研流程图引擎 MD FLOW：四方向布局、回边处理、连线流水动效，未覆盖语法自动回退原生 Mermaid
- 新增文本转流程图：`→` / `⇒` 等符号箭头或 `[节点]` 写法放进 ```` ```flow ```` 代码块一键成图
- 表格支持四套风格（黑白极简 / 蓝色科技 / 红色政商 / 粉色卡通），与三主题、两排版自由叠加
- 修复：卡片分节只认 h1、最近打开点击无反应、A+/A− 在两套皮肤下失效、护眼主题被皮肤覆盖、桌面图标仍是 Electron 默认

### 下载哪个
| 附件 | 适合 |
| --- | --- |
| `MD Reader Setup 1.3.0.exe` | 日常主力机器，要桌面图标和 .md 默认打开 |
| `MDReader-便携版-v1.3.0.zip` | U 盘、临时机器、内网离线、不想装东西 |
| `MDReader-iOS-PWA-v1.3.0.zip` | 在 iPhone / iPad 上看 md，接受不能设为默认关联 |

### 设为默认打开程序
Windows：右键 `.md` → 打开方式 → 选择其他应用 → MD Reader → 勾选「始终使用此应用打开 .md 文件」。
macOS：见仓库 `docs/PLATFORM.md`。

### 已知问题
- macOS `.dmg` 需在 Mac 上编译，本 Release 暂不提供
- iOS / iPadOS 不支持系统级扩展名默认打开程序，详见 `docs/PLATFORM.md`
- 桌面安装包体积较大（含 Electron 运行时），追求极小体积请用便携版

完整变更见 [CHANGELOG.md](../CHANGELOG.md)。
```

---

## 四、仓库元信息

**About 简介**（塞用户会搜的关键词，别写「一个小工具」）：

```
Windows 本地 Markdown 阅读器 | 离线零联网 | 卡片/纸张双排版 | 表格排序与图表 | Mermaid | Obsidian 双链 | .md 文件关联 | Electron 桌面版 + 免安装便携版
```

**Topics**：

```
markdown  markdown-viewer  offline  electron  windows  obsidian
mermaid  table-visualization  file-association  chinese  documentation  viewer
```

英文关键词优先，GitHub 搜索主要匹配英文；`chinese` / `中文` 二选一即可。

---

## 五、版本号规则

| 变更类型 | 版本 | 例子 |
| --- | --- | --- |
| 修 bug | `v1.3.1` | 拖放失败、编码识别 |
| 新功能（向后兼容） | `v1.4.0` | 跨文档全文搜索 |
| 破坏性改动 | `v2.0.0` | 换渲染内核 |

每次发版**同步更新 `CHANGELOG.md`**，不要一天连发好几个小版本。

---

## 六、日常维护

- **Dependabot** 已配置（`.github/dependabot.yml`），每周检查 npm 依赖漏洞并自动提 PR
- CI（`.github/workflows/ci.yml`）在每次 push / PR 到 `main` 时跑：JS 语法检查 → 单文件构建 → 桌面壳同步 → **生成物漂移检查** → 便携版与主题回归
- Issue：bug 优先复现并标 `bug`；需求标 `enhancement`，别承诺时间；重复的温和关闭并引导搜索
- 数据看板：Insights → Traffic（Unique visitors / Clones），Releases 里每个附件后面有下载次数
- 不要硬编码密钥 / token，本仓库也不应该有（程序本身零网络请求）
