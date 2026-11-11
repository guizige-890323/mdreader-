# 发布指南

一次完整发版的检查清单与可直接复制的文案。

---

## 一、首次上传前必改（只做一次）

| # | 操作 | 位置 |
| --- | --- | --- |
| 1 | 把 `OWNER` 全局替换成你的 GitHub 用户名 | `README.md`（badge / 链接 / 示例，共 8 处）、`CONTRIBUTING.md`、本文件 |
| 2 | 确认仓库名是 `mdreader`，`package.json` 里 `appId` 用 `cn.mdreader.app` | `desktop/package.json` |
| 3 | 确认 `LICENSE` 里的版权人符合你的署名习惯 | `LICENSE` |
| 4 | 加 Topics（见第四节） | GitHub 仓库页 → About → ⚙ |
| 5 | 填仓库简介（见第四节） | GitHub 仓库页 → About |

```bash
# 查一下还有哪些占位符
grep -rn "OWNER" --include="*.md" --include="*.yml" .

# Linux / macOS 替换
grep -rl "OWNER" --include="*.md" --include="*.yml" . | xargs sed -i 's/OWNER/你的用户名/g'
```

---

## 二、分支与提交

```
main  ← 稳定可运行，只接受测试过的合并
dev   ← 新功能开发自测
```

```bash
git init
git checkout -b dev
git add .
git commit -m "feat: v1.3.0 双排版皮肤 + 桌面安装版 + 最近打开"
git checkout -b main
git merge dev
git remote add origin git@github.com:OWNER/mdreader.git
git push -u origin main
```

提交前自检：

```bash
node --check MDReader/src/app.js
node --check MDReader/desktop/main.js
node --check MDReader/desktop/preload.js
python MDReader/src/build.py
python MDReader/desktop/scripts/sync-app.py
python MDReader/desktop/scripts/verify-portable.py    # 应输出 17 / 17 passed
```

---

## 三、发 Release（下载量只算这里）

> ⚠️ 别人下载 **Release 附件** 才计入 GitHub 下载统计；`git clone` 不计入。

1. 仓库 → **Releases** → **Create a new release**
2. Tag：`v1.3.0`（语义化：主版本.次版本.修订号）
3. Title：`v1.3.0 · 双排版皮肤 + Windows 安装版`
4. 描述：复制下面模板
5. **上传三个附件**（缺一不可）
   - `MD Reader Setup 1.3.0.exe` —— 桌面安装版（主线）
   - `MDReader-Windows11便携版.zip` —— 免安装版（U 盘 / 内网）
   - `MDReader-iOS-PWA.zip` —— iPhone / iPad 主屏幕版（能力范围内的 iOS 方案）
6. 勾 **Set as the latest release** → **Publish release**

### Release 描述模板

```markdown
## v1.3.0 · 双排版皮肤 + 桌面安装版

### 这次更新了什么
- 新增 ▥ 卡片 / ▭ 纸张两套完整排版皮肤（配色、字体、圆角、投影整体切换），顶栏随时切换并记住选择
- 新增「最近打开」：最多 30 条，`Ctrl + R` 打开，按绝对路径重读磁盘原文，文件移走也能从缓存看
- 新增 **Windows 桌面安装版**：安装后自动创建桌面 + 开始菜单图标，注册 `.md` / `.markdown` / `.mdown` / `.mkd` 关联并写入 `OpenWithProgids`（「选择其他应用」里能看到），可直接设为默认打开程序；单实例，双击多个文件复用同一窗口
- 新增 **iOS / iPadOS 主屏幕 PWA 包**：Safari「添加到主屏幕」得到全屏图标；iOS 系统不允许注册默认关联，故不提供
- 便携版继续保留，解压即用、不改注册表
- 修复：卡片分节只认 h1、最近打开点击无反应、A+/A− 字号在两套皮肤下失效、纸张正文过窄、打包夹带测试缓存

### 下载哪个
| 附件 | 适合 |
| --- | --- |
| `MD Reader Setup 1.3.0.exe` | 日常主力机器，要桌面图标和 .md 默认打开 |
| `MDReader-Windows11便携版.zip` | U 盘、临时机器、内网离线、不想装东西 |
| `MDReader-iOS-PWA.zip` | 在 iPhone / iPad 上看 md，接受不能设为默认关联 |

### 设为默认打开程序
Windows：右键 `.md` → 打开方式 → 选择其他应用 → MD Reader → 勾选「始终使用此应用打开 .md 文件」。
macOS：见仓库 `docs/PLATFORM.md`。

### 已知问题
- macOS `.dmg` 需在 Mac 上编译，本 Release 暂不提供；构建脚本已在 `MDReader/desktop/`
- iOS/iPadOS 不支持系统级扩展名默认打开程序，详见 `docs/PLATFORM.md`
- 桌面安装包体积较大（含 Electron 运行时），追求极小体积请用便携版

完整变更见 [CHANGELOG.md](../CHANGELOG.md)。
```

---

## 四、提升曝光的元信息

**仓库简介**（塞用户会搜的关键词，别写"一个小工具"）：

```
Windows 本地 Markdown 阅读器 | 离线零联网 | 卡片/纸张双排版 | 表格排序与图表 | Mermaid | Obsidian 双链 | .md 文件关联 | Electron 桌面版 + 免安装便携版
```

**Topics**：

```
markdown  markdown-viewer  markdown-editor  offline  electron
windows  obsidian  mermaid  table-visualization  file-association
chinese  documentation  viewer
```

英文关键词优先，GitHub 搜索主要匹配英文；`chinese` / `中文` 二选一即可。

---

## 五、迭代节奏

| 变更类型 | 版本 | 例子 |
| --- | --- | --- |
| 修 bug | `v1.3.1` | 拖放失败、编码识别 |
| 新功能（向后兼容） | `v1.4.0` | 跨文档全文搜索 |
| 破坏性改动 | `v2.0.0` | 换渲染内核 |

每次发版**同步更新 `CHANGELOG.md`**，不要一天连发好几个小版本。

---

## 六、引流文案（先讲痛点，别硬广）

### 掘金 / CSDN 文章开头

> 运维同事发来一份 2000 行的《采集异常排查手册.md》，我想看的只是第三节的参数表。
> 开 VS Code 要等插件、传在线编辑器怕内网资料出网、系统自带预览又是一整页黑字滚不到底。
> 于是做了个双击就开的本地阅读器：卡片皮肤按 `##` 把手册切成 8 块带编号的面板，纸张皮肤换成衬线排版适合打印；表格能点表头排序、一键出柱状图；Mermaid 和 Obsidian 双链也能看。
> 一个 HTML 文件 3.4 MB，零联网零上传；也可以装成桌面版，直接把 `.md` 默认交给它打开。
> 项目地址：github.com/OWNER/mdreader

### 知乎 / V2EX 相关话题下的短回复

> 如果只是"看" md 不想开 IDE，可以试试我这个：单文件 HTML，双击即用，不用装依赖也不用联网。表格支持排序和出图，长文档有两种排版皮肤，最近打开会按路径重读磁盘而不是给你旧缓存。想要桌面图标和 `.md` 关联的话有 NSIS 安装包。仓库：github.com/OWNER/mdreader

### B 站 60 秒演示脚本

| 秒 | 画面 |
| --- | --- |
| 0–8 | 双击一个 2000 行 md，秒开窗口，无地址栏 |
| 8–20 | 工具栏切「卡片」→ 8 张编号卡；再切「纸张」→ 衬线排版 |
| 20–32 | 表格点表头排序 → 点「图表」出柱状图 |
| 32–42 | `Ctrl + R` 最近打开，点一条回到上次文档 |
| 42–55 | 右键 md → 打开方式 → 设为默认；桌面图标特写 |
| 55–60 | 结尾：离线零联网 + 仓库地址 |

> 别刷 star / 刷 Release 下载量，GitHub 风控会隐藏统计甚至封号。

---

## 七、维护

- **Dependabot** 已配置（`.github/dependabot.yml`），每周检查 npm 依赖漏洞并自动提 PR
- Issue：bug 优先复现并标 `bug`；需求标 `enhancement`，别承诺时间；重复的温和关闭并引导搜索
- 数据看板：Insights → Traffic（Unique visitors / Clones），Releases 里每个附件后面有下载次数
- 不要硬编码密钥 / token，本仓库也不应该有（程序本身零网络请求）
