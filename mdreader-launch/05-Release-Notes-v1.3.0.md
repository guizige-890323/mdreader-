# MD Reader v1.3.0

**双击 `.md` 就能看的本地阅读器。一个 HTML 文件就是完整程序，运行时不发起任何网络请求。**

> 这是首个公开版本。有 bug 请提 [Issue](https://github.com/guizige-890323/mdreader/issues)，我会回。

---

## 我该下哪个？

| 你的情况 | 下这个 | 体积 |
| --- | --- | --- |
| **第一次用，只想试试**（推荐） | `MDReader-便携版-v1.3.0.zip` | 1.3 MB |
| 日常主力机，想把 `.md` 双击默认打开 | `MD Reader Setup 1.3.0.exe` | 118 MB |
| 不想安装，但也不想每次点 bat | `MDReader-Win免安装-v1.3.0.zip` | 约 155 MB |
| 在 iPhone / iPad 上看 md | `MDReader-iOS-PWA-v1.3.0.zip` | 2.1 MB |

**便携版用法**：解压到一个文件夹（U 盘也行）→ 双击 `启动 MDReader.bat` → 完成。不需要安装、不需要账号、不需要联网。

> 四个包共用**同一份** `MDReader.html`，渲染能力完全一致，不存在"精简版"。
> 117 MB 的安装包主要体积是 Electron 运行时；如果只是想看文档，1.3 MB 的便携版够用。

---

## 这一版有什么

**单文件离线**：marked、highlight.js、mermaid 全部在构建期内嵌。把 HTML 拷到完全断网的机器上双击就能用。这句话可以自己验证——代码里没有任何一处向外发请求，验证命令写在 [SECURITY.md](https://github.com/guizige-890323/mdreader/blob/main/SECURITY.md)。

**两套排版皮肤**：卡片皮肤按 `##` 把长文档切成带编号的独立卡片，2000 行的手册打开是 8 张卡，直接跳到第三节；纸张皮肤换衬线字体、暖米纸面、页边装订线，适合长文和打印。两套不是换边框，配色、字体、圆角、投影、表格和代码块整套切换。

**表格能排序、能出图**：点表头排序，点「图表」把数值列画成柱状图，一键复制成 CSV。四套表格风格可选。

**自研流程图引擎**：不用 Mermaid 默认的淡紫主题，自己做了分层布局 + 重心法降交叉 + 编号徽章 + 连线流水动效，导出可独立使用的 SVG；未覆盖的语法自动交回原生 Mermaid 兜底。

**Obsidian 语法**：`[[双链]]`、`![[图片]]`、`> [!note]` callout、YAML frontmatter、`#标签` 都能正确显示，不用为了看一篇笔记打开整个 Obsidian。

完整清单见 [CHANGELOG](https://github.com/guizige-890323/mdreader/blob/main/CHANGELOG.md)。

---

## 它不做什么

说在前面，省得你装完失望：

- **不是主力编辑器**。能按块改字并 `Ctrl+S` 写回原文件，但没有语法高亮编辑、多光标、插件。写长文还是回 Typora / Obsidian / VS Code。
- **不是知识库**。不做双链图谱、不做关系视图，只负责把语法正确显示出来。
- **不是云文档**。没有账号、同步、协作——这是设计选择。
- **macOS 没有预编译包**。源码和构建配置在 `MDReader/desktop/`，需要在 Mac 上执行 `npm run build:mac`，作者未实测。
- **iOS 是 PWA**。系统不允许注册 `.md` 默认关联，只能在应用内选文件。

---

## 校验

```bash
# 便携版解压后，HTML 应为
MD5    37fb8d2558d01fb681174ba0587c4f6b  MDReader.html

# 四个附件（想核完整性就看 SHA256）
1a131d76…  MDReader-便携版-v1.3.0.zip          1,281,932 字节
97022c75…  MD Reader Setup 1.3.0.exe        117,578,813 字节
72a6a985…  MDReader-Win免安装-v1.3.0.zip     160,752,050 字节
6a6fd2de…  MDReader-iOS-PWA-v1.3.0.zip        2,197,585 字节
```

四个附件在页面底部「Assets」区。国内下载慢的话，先用 1.3 MB 的便携版。

---

## 协议

MIT。随便改、随便分发、商用也行。第三方依赖的协议清单在 [docs/THIRD-PARTY-LICENSES.md](https://github.com/guizige-890323/mdreader/blob/main/docs/THIRD-PARTY-LICENSES.md)。
