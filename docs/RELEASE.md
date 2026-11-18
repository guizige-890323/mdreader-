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
git tag -a v1.7.0 -m "v1.7.0 · 单图结构 + 统一文档风格 + 界面多语言"
git push origin main
git push origin v1.7.0
```

### 4. 建 GitHub Release

1. 仓库 → **Releases** → **Draft a new release**
2. 选择刚推的 tag，Title 与 tag 同名
3. 描述直接复制[第三节模板](#三release-描述模板)
4. **上传附件**（下载量只统计 Release 附件，`git clone` 不计入）

   | 附件 | 说明 |
   | --- | --- |
   | `MDReader-便携版-v1.7.0.zip` | ≈1.7 MB，建议置顶为「先试这个」 |
   | `MD Reader Setup 1.7.0.exe` | ≈115 MB，桌面安装版 |
   | `MDReader-Win免安装-v1.7.0.zip` | ≈156 MB，Electron 免安装 |
   | `MDReader-iOS-PWA-v1.7.0.zip` | ≈2.4 MB，主屏幕版 |
   | `MDReader-International-v1.7.0.zip` | ≈3.7 MB，英文默认 + 完整源码 |

5. 勾 **Set as the latest release** → **Publish release**

> **首发阶段可以先不传附件**：创建 Release 时只写描述、不上传文件，标题加「（预编译包即将开放）」。这样仓库页有版本记录，但没有会让人扑空的下载按钮。确认要开放时，编辑该 Release 补传五个附件即可，tag 与提交不变。
>
> 安装包需在 Windows 本机构建（`cd MDReader/desktop && npm run build:win`）。CI 只产出便携版与 PWA 两个 artifact，不产出 NSIS 安装包。

---

## 三、Release 描述模板

```markdown
## v1.7.0 · 每张流程图有自己的结构，整篇文档有自己的气质

**MD Reader 是一个 4.6 MB 的 HTML 文件。双击 `.md` 就能看，不联网、不登录、不上传。**
它只做「看文档」这一件事，并且把它做顺手。

### 这次更新了什么

**每张流程图可以单独换结构**
结构选择器从全局设置搬到每张图自己的工具条上（右上角），按源码 hash 记住。
5 种结构（自动 / 流水线 / 思维导图 / 组织图 / 时间轴）× 5 种风格 = 25 种观感，
切换结构会回放你的文字、颜色、增删节点，位置按新结构重新布局。

**整篇文档统一气质**
原来图表配色绑在表格配色上。现在四套「文档风格」（素雅 / 科技 / 政务 / 可爱）
统一驱动分段背景、卡片徽章、图表六色、流程图强调色和代码关键字高亮，
并为浅色 / 深色 / 护眼分别派生可读变体。导出 HTML 会把 23 个变量内联固化，离线打开与屏幕一致。

**Unicode 框线架构图 → 可编辑矢量图**（v1.6）
代码块里用 `┌─┐│└┘` 画的架构图，由纯算法（零 AI、零网络）识别成 `{节点, 连线}` 语义图，
再交给自研流程图引擎渲染。可拖拽、改字、换色、增删节点，能导出 SVG / HTML / Word / PDF。
中英混排按显示列宽切格，±3 列漂移、缺顶边、扇出汇聚、左侧外部输入都能容忍。

**界面多语言**
简体中文 / English / 跟随系统。国际版只是把默认语言设为 English，其余与中文版逐字节相同。

**其他**
- 新建 MD：空白文档，或一键粘贴 AI 对话里的 Markdown，`Ctrl+S` 存成真实文件
- 图表 6 种：自动 / 柱状 / 折线 / 趋势面积 / 环形饼图 / 玫瑰图（饼图严格按占比分角）
- 导出运行时内嵌，导出的 HTML 在断网机器上也能完整还原样式与图形

### 该选哪个包
| 附件 | 适合 | 体积 |
| --- | --- | --- |
| `MDReader-便携版-v1.7.0.zip` | **先试这个**。U 盘、内网、临时机器 | 1.7 MB |
| `MD Reader Setup 1.7.0.exe` | 日常主力机，要桌面图标和 `.md` 默认打开 | 115 MB |
| `MDReader-Win免安装-v1.7.0.zip` | 要原生窗口但不想安装 | 156 MB |
| `MDReader-iOS-PWA-v1.7.0.zip` | iPhone / iPad 主屏幕 | 2.4 MB |
| `MDReader-International-v1.7.0.zip` | 英文环境，含完整源码 | 3.7 MB |

### 已知问题
- macOS `.dmg` 需在 Mac 上编译，本 Release 不提供
- iOS 不支持系统级扩展名默认关联，详见 `docs/PLATFORM.md`
- 不支持 KaTeX / MathJax，这是明确的硬缺口

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
