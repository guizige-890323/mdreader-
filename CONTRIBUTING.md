# 贡献指南

欢迎提 Issue 和 PR。项目不大，流程尽量轻。

---

## 提 Bug 前

1. 先看右下角状态栏版本号（`MD Reader v1.3 · 本地窗口 / 桌面版 / 预览网页环境`），旧版本先更新再复现
2. 搜一下 [已有 Issue](https://github.com/guizige-890323/mdreader/issues)
3. 尽量给出：系统版本、发行形态（便携版 / 安装版）、复现步骤、能公开的示例 md

> ⚠️ 不要上传含内网 IP、账号、密钥、客户资料的文档。程序本身不联网，但 Issue 是公开的。

---

## 改代码

### 渲染层（两种形态共用）

改 `MDReader/src/template.html`（界面 / 皮肤 CSS）或 `MDReader/src/app.js`（逻辑）后：

```bash
python MDReader/src/build.py                        # 生成 dist/MDReader.html
python MDReader/desktop/scripts/sync-app.py          # 同步进桌面壳
python MDReader/desktop/scripts/verify-portable.py   # 便携版 17 项回归，必须全过
python MDReader/desktop/scripts/verify-themes.py    # 主题矩阵 11 项回归，必须全过
python MDReader/src/pack.py                          # 重新打便携版 zip
```

**硬约束**：`app.js` 里的桌面桥只允许在 `window.__MD_DESKTOP__` 存在时启用。任何改动都必须保证纯 HTML 下行为不变，`verify-portable.py` 是防线。

### 产物提交规则（容易踩）

| 目录 | 是否提交 | 说明 |
| --- | --- | --- |
| `MDReader/dist/` | ✅ **必须提交** | 便携版成品，CI 会校验它与你改的源码一致 |
| `MDReader/desktop/app/` | ❌ 不提交 | `sync-app.py` 生成，已 gitignore |
| `MDReader/desktop/release/` | ❌ 不提交 | electron-builder 输出 |
| `MDReader/ios/site/` | ❌ 不提交 | PWA 生成目录 |
| 根目录 `MDReader-*.zip` | ❌ 不提交 | `pack.py` / `build-pwa.py` 输出 |

提交前自查产物是否已重建：

```bash
git status --short MDReader/dist    # 有输出 = 忘了重建或忘了 git add
```

CI 的「生成物漂移检查」会跑一遍构建，`dist/` 与提交内容不一致就直接失败。

### 桌面层

`MDReader/desktop/main.js`（主进程）、`preload.js`（白名单桥）、`package.json`（构建与文件关联配置）。

```bash
cd MDReader/desktop
npm install
npm start              # 开发模式
npm run build:win       # 打安装包
```

国内网络记得设 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR`，见 README。

### 依赖

`MDReader/src/vendor/` 是三个离线库的固定副本，不通过 npm 管理。升级它们要同步跑 `build.py`，并确认 `MDReader.html` 仍能完全离线运行（断网实测）。

---

## 提交规范

```
feat: 新增 xxx
fix: 修复 xxx
docs: 补充 xxx
chore: 构建 / 依赖调整
```

- 一个 PR 一件事，别把格式化和功能改动混在一起
- 从 `dev` 分支提 PR 到 `main`
- 涉及界面改动的 PR 请附截图

---

## 设计约定

| 约定 | 原因 |
| --- | --- |
| 单文件 HTML 是便携版的交付形态 | 内网 / U 盘场景要能直接双击，不能有外部依赖 |
| 桌面版与便携版共用 `MDReader.html` | 避免两套渲染逻辑分叉，改一处两边都更新 |
| 卡片 / 纸张是完整皮肤，不只是布局 | 配色、字体、圆角、投影、表格与代码块都要跟着切 |
| 卡片模式下标题 `id` 原样保留 | 大纲与锚点跳转不能因为分节而失效 |
| 不发任何外部网络请求 | 这是隐私承诺，不是可选优化 |

---

## 协议

贡献即视为同意以 [MIT](LICENSE) 协议发布。第三方依赖的协议见 `LICENSE` 末尾。
