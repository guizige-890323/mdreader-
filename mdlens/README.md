# MDLens

**AI 输出 → 人类可读。** 给 AI 工具和 Agent 用的 Markdown 渲染管道。

---

## 问题

AI 输出的 Markdown 在终端或聊天窗口里是这样的：

```
| 指标 | Q1 | Q2 | 变化 ||---|--:|--:|--:|| 营收 | 1200 | 1580 | +31.7% |
```

或者更糟 —— 一个 300 行的报告，表格错位、标题没有层级、代码块没有高亮、
流程图变成一堆 `graph LR A-->B` 的字面文本。**人能读，但读得很痛苦。**

这不是 Markdown 的问题，是「渲染」这一步缺失了。

## 解决

MDLens 是一个本地渲染管道。任何 AI 工具把 Markdown 交给它，拿回一个
**人真正想读的页面**：表格有配色、代码有高亮、流程图是图形、标题有层级、
长文自动分节成卡片。

```
┌─────────────┐   Markdown   ┌──────────┐   自包含 HTML   ┌────────┐
│ AI / Agent  │ ───────────► │  MDLens  │ ──────────────► │  人  │
└─────────────┘              └──────────┘                 └────────┘
```

三种接入方式，按场景选：

| 方式 | 适合 | 特点 |
| --- | --- | --- |
| **MCP Server** | Claude Desktop / WorkBuddy / 任何支持 MCP 的客户端 | AI 自主调用，零配置 |
| **CLI** | Shell 脚本、Agent 的 bash 工具、CI | 管道友好，`cat x.md \| mdlens render -` |
| **HTTP 服务** | 自建 UI、编辑器插件、多标签同步 | SSE 实时刷新 |

## 快速开始

```bash
# 1. 构建引擎（从 MDReader 渲染器生成，只需一次）
python scripts/build-engine.py

# 2. 检查环境
node bin/mdlens.js doctor
```

### CLI

```bash
# 管道 —— AI agent 最常用
cat report.md | node bin/mdlens.js render -

# 文件
node bin/mdlens.js render report.md

# 边改边看
node bin/mdlens.js live report.md

# 导出给同事（单文件，双击就开）
node bin/mdlens.js html report.md -o report.html

# 截图（需要 playwright-core）
node bin/mdlens.js shot report.md -p chart.png --full

# 换主题
node bin/mdlens.js render report.md --theme sepia --layout paper
```

### MCP Server

在 `~/.workbuddy/mcp.json`（或 Claude Desktop 的 `claude_desktop_config.json`）里加：

```json
{
  "mcpServers": {
    "mdlens": {
      "command": "node",
      "args": ["/绝对路径/mdlens/bin/mdlens.js", "mcp"]
    }
  }
}
```

重启客户端，在 MCP 连接器里**信任**这个 server，然后就可以直接说：
「把这份报告渲染出来」——AI 会自己调用 `render_markdown`。

**提供的工具：**

| 工具 | 用途 |
| --- | --- |
| `render_markdown` | 渲染一段 Markdown，返回可打开的文件路径 |
| `render_file` | 渲染磁盘上的 `.md` 文件 |
| `open_preview` | 开一个实时预览窗口（长任务用） |
| `update_preview` | 往预览窗推送新内容，保留滚动位置 |
| `export_html` | 导出可分享/归档的单文件 HTML |
| `inspect_markdown` | 只分析结构不渲染，给 AI 决策依据 |

### HTTP 服务

```bash
node bin/mdlens.js serve          # 默认 127.0.0.1:7788
```

```bash
# 写入内容
curl -X POST http://127.0.0.1:7788/doc \
  -H 'Content-Type: application/json' \
  -d '{"md":"# 标题\n内容","name":"demo.md"}'

# 打开预览（SSE 自动刷新）
# → http://127.0.0.1:7788/v/<id>
```

## 渲染能力

继承自 [MD Reader](../MDReader) 的成熟渲染管线：

- **Markdown**：GFM 全支持，表格 / 任务列表 / 脚注 / 删除线
- **代码高亮**：highlight.js，180+ 语言，带语言标签
- **图表**：从表格自动生成 —— 柱状 / 折线 / 趋势 / 环形 / **玫瑰图**
- **流程图**：Mermaid 原生 + 自研 `flow` 文本流程图（`A → B → C` 直接变成图形）
- **Callout**：`> [!NOTE]` / `[!WARNING]` / `[!TIP]` 等
- **主题**：light / dark / sepia
- **版式**：card（分节卡片）/ paper（连续纸张）

## 设计决策

### 为什么默认产出自包含文件，而不是 URL

一开始做的是 HTTP 服务返回 URL，测试时发现一个致命问题：
**服务进程一死，昨天发给用户的链接全部变死链。**

后来改成守护进程（`~/.mdlens/daemon.json` + 磁盘持久化），在标准终端里能work，
但在沙箱/受限环境里 detached 子进程会被父进程回收，仍然会失效。

最终的答案是**不依赖进程**：渲染直接产出一个内联了全部引擎的 HTML 文件
（约 4 MB），用 `file://` 打开。它不需要端口、不需要网络、不会过期，
双击就开，可以直接发给别人或丢进 Git。

代价是每个文件 4 MB。这个交换是划算的 —— **「永远不会打不开」比「文件小一点」重要得多。**

HTTP 实时模式保留，因为它解决的是另一个问题：长任务边写边看。
两种模式并存，默认走可靠的。

### 为什么不重写渲染器

MD Reader 的渲染管线已经打磨了十几轮 —— 图表圆角、玫瑰图引导线、
流程图动效、表格四套配色、三种皮肤。重写一遍既没必要也不划算。

做法是给现有 4 MB 引擎打三个精准补丁（见 `scripts/build-engine.py`）：
1. 标记 `data-mdlens`，用 CSS 把顶栏/侧栏/标签栏藏掉（DOM 不删，渲染管线依赖）
2. 在 IIFE 内追加 `window.__MDLENS__` 接口（`show` / `prefs` / `state`）
3. 追加桥接层，支持 URL / postMessage / BroadcastChannel / SSE 四个通道

原渲染逻辑**一行未改**，只是多了一个调用点。

## 目录

```
mdlens/
├── bin/mdlens.js           CLI 入口
├── lib/
│   ├── render.js           Markdown → 自包含 HTML（默认路径）
│   ├── server.js           进程内 HTTP 服务（测试/临时用）
│   ├── daemon.js           常驻守护进程（磁盘持久化）
│   ├── client.js           守护进程发现与自动拉起
│   └── mcp.js              MCP Server（6 个工具）
├── engine/MDLens.html      构建产物（4 MB，勿手改）
├── examples/ai-report.md   真实压测文档（2,397 字，含 4 表格 / Mermaid / Callout）
└── scripts/
    ├── build-engine.py     从 MDReader 生成引擎
    └── test-all.cjs        端到端测试（50 项）
```

## 测试

```bash
node scripts/test-all.cjs
```

**50 项断言，分五组：**

| 组 | 断言数 | 测什么 |
| --- | --- | --- |
| **A · CLI 文件模式** | 6 | 产出路径、单文件完整性、引擎内联、`file://` 地址 |
| **B · HTML 导出** | 3 | 指定路径、主题写入、**无外部依赖**（无 `<script src>`） |
| **C · MCP 协议** | 20 | 握手、协议版本、6 个工具注册、结构分析、渲染返回 |
| **D · 渲染质量**（真实浏览器） | 15 | 标题层级、表格单元格、代码高亮、Callout、流程图节点/连线、顶栏隐藏、视口撑满、文字反差、零 JS 错误 |
| **E · 表格 → 图表自动生成** | 6 | 表格识别为图表容器、**默认自动展开**、图形元素（柱/线/扇区）、网格线、坐标轴标签、类型副标题 |

D 组和 E 组是关键 —— 它们测的不是「函数被调用了」，而是「**人能不能读到**」。

E 组来自一次真实缺陷：AI 报告里的数值表没有自动出图。根因是
`render()` 内部调 `applyChartAuto()` 时 `#content` 还是 `hidden`，
宽度测不到直接 return。修复方式是在 `#content` 变可见**之后**补做一次
`expandAllCharts()`。

## 端到端实测

用一份真实 AI 报告（`examples/ai-report.md`，2397 字）走完整链路的实测数据：

| 指标 | 结果 |
| --- | --- |
| 文档高度 | 5,983 px |
| 二级标题 / 三级标题 | 6 / 4 |
| 表格 / 代码块 | 4 / 2 |
| 流程图节点 / 连线 | 7 / 6 |
| Callout / 任务复选框 | 1 / 5 |
| 图表自动展开 | 2 个 |
| 横向溢出 | **0 px** |
| 文字裁切 | **0 处** |
| JS 错误 | **0** |

MCP 协议层单次调用实测（deepseek 侧）：

```json
{"mode":"file","path":"C:\\Users\\likui\\.mdlens\\view\\曲靖综维工单分布-fa6ccd224f061f5c.html",
 "url":"file:///C:/Users/likui/.mdlens/view/曲靖综维工单分布-fa6ccd224f061f5c.html",
 "chars":824,"mb":4.03,"opened":false,
 "hint":"单文件、离线可开、不会过期。把这个路径交给用户即可。"}
```

该产物离线打开后的验证：文档 3,268 px、2 个图表全展开、流程图为 **7 个图形节点**
（方向 `AUTO TD` —— 横向布局超过 1000 px 时引擎自动改竖向，避免窄窗口溢出）、
零横向溢出、零 JS 错误。

## 已知边界

| 项 | 说明 |
| --- | --- |
| 文件体积 | 每个产物约 4 MB（内联了完整引擎）。要小体积走 `--serve`。 |
| `--serve` 寿命 | 进程退出即失效。适合「现在看」，不适合「发给别人」。 |
| 守护进程 | 在受限沙箱里 detached 子进程可能被父 shell 回收 ﹣ 所以不作默认。 |
| 截图功能 | `shot` 子命令需要 `playwright-core` + 本地 Chromium/Edge。 |

## 数据与隐私

全部本地。不上传、不联网、不收集。
渲染产物在 `~/.mdlens/view/`，自动保留最近 30 个，超出按时间清理。

## License

MIT