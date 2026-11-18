# -*- coding: utf-8 -*-
"""
把单文件 MDReader.html 包成 iOS/iPadOS 可用的「添加到主屏幕」PWA。

注意：这是 iOS 平台能力范围内最接近「桌面图标」的形态，
并不提供系统级 .md 默认关联（iOS 不允许第三方注册）。
详见 ../../docs/PLATFORM.md。
"""
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]          # 仓库根
HERE = Path(__file__).resolve().parent              # MDReader/ios
SRC_HTML = ROOT / "MDReader" / "dist" / "MDReader.html"
# 主屏 / PWA 图标固定用**默认卡通组**的黑底版（黑底 + 白 MD + 红耳机 + 蓝眼睛），
# 在浅色壁纸上识别度最高；iOS 主屏图标是「添加到主屏幕」时固化的静态资源，
# 不能随应用内设置动态切换，应用内 LOGO 则由设置里的「应用图标」+ 主题联动。
SRC_ICON = ROOT / "MDReader" / "desktop" / "build" / "icon-cartoon-light.png"
OUT = HERE / "site"
VERSION = __import__("json").loads(
    (ROOT / "MDReader" / "desktop" / "package.json").read_text(encoding="utf-8")
)["version"]
OUT_DIR = ROOT / "发布包"
ZIP = OUT_DIR / ("MDReader-iOS-PWA-v%s.zip" % VERSION)

PWA_HEAD = """
<!-- iOS PWA：仅影响「添加到主屏幕」后的表现，不改变阅读器逻辑 -->
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="167x167" href="apple-touch-icon-167.png">
<link rel="apple-touch-icon" sizes="152x152" href="apple-touch-icon-152.png">
<link rel="apple-touch-icon" sizes="120x120" href="apple-touch-icon-120.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="MD Reader">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)">
<script>
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js')['catch'](function () {});
  });
}
</script>
"""

MANIFEST = {
    "name": "MD Reader - Markdown 阅读器",
    "short_name": "MD Reader",
    "description": "本地离线 Markdown 阅读器，表格排序与图表、卡片/纸张双皮肤",
    "start_url": "./index.html",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#fafafa",
    "theme_color": "#2563eb",
    "lang": "zh-CN",
    "icons": [
        {"src": "favicon-32.png", "sizes": "32x32", "type": "image/png",
         "purpose": "any"},
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png",
         "purpose": "any"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png",
         "purpose": "any"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
         "purpose": "maskable"},
    ],
}

SW = """/* 仅在 HTTPS / localhost 生效，用于把整站缓存下来离线可用。
   v3：换默认卡通品牌图标后必须换缓存名，否则旧的 Service Worker 会继续吐旧图标。
   v4：新增国际化界面（语言设置）后升缓存名，确保已装用户拿到新版页面。
   v5：卡片序号徽章改为跟随表格配色且高度统一，样式大改必须换缓存名。
   v6：导出下拉补回 Word，恢复四种格式，菜单与字典变更必须换缓存名。
   v7：内置示例重写为「使用指南 · 功能导览」，内容大改必须换缓存名。
   v8：Word 导出图片/表格适配 A4 版心、流程图长节点自动竖向、新增 4 套流程图风格。
   v9：新增「创建 MD / 剪贴板快速粘贴」与四类图表艺术化重绘（玫瑰图、渐变柱、平滑折线、面积趋势）。
   v10：饼图重设计为零描边圆角环形图（拆分出独立「玫瑰」类型），图表区样式大改必须换缓存名。
   v11：剪贴板浮层状态机重写（按钮不再失灵、二次授权可重试），预览逻辑变更必须换缓存名。
   v13：顶栏分组重排（渲染控件移到右侧、导出紧跟保存），DOM 结构改动必须换缓存名。
   v14：玫瑰图改为外标签 + 同色引导线（每片一根线牵到图外），图表 DOM/样式大改必须换缓存名。
   v22：单图结构选择 + 统一文档风格（图表色板解耦、代码高亮联动、导出变量固化），
        界面与主题变量大改必须换缓存名。 */
const CACHE = 'mdreader-pwa-v23';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './favicon-16.png', './favicon-32.png',
                './icon-192.png', './icon-512.png', './icon-1024.png',
                './icon-maskable-512.png',
                './apple-touch-icon.png', './apple-touch-icon-120.png',
                './apple-touch-icon-152.png', './apple-touch-icon-167.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* 页面走 network-first：改版后能立刻拿到新 HTML / 新图标；断网才回落缓存 */
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
"""

README = """# MD Reader · iOS / iPadOS 主屏幕版（PWA）

> 这个包是 iOS 能力范围内**最接近「桌面图标」**的形态。
> **iOS 不允许第三方注册 `.md` 系统默认打开程序**，也不存在"桌面"，
> 因此本包不提供、也不可能提供默认关联。详见仓库 `docs/PLATFORM.md`。

## 能做什么 / 不能做什么

| 能力 | iOS / iPadOS（本包） |
| --- | --- |
| 主屏幕图标、全屏启动、无 Safari 地址栏 | ✅ 添加到主屏幕后 |
| 离线渲染 Markdown、表格排序、Mermaid | ✅（HTTPS 托管时由 Service Worker 缓存） |
| Unicode 框线字符架构图自动识别 | ✅ 纯代码算法，不依赖 AI / 不联网；`┌─┐│└┘` 画的功能架构图自动转成可编辑矢量流程图 |
| 单图结构选择 + 统一文档风格 | ✅ 每张流程图右上角可单独选结构；四套风格统一驱动分段背景 / 图表 / 流程图 / 代码高亮 |
| 从「文件」App 选一份 `.md` 打开 | ✅ 应用内点「打开文件」 |
| 「共享 → 用其他应用打开」接收 md | ❌ 需原生 SwiftUI 工程声明 UTI |
| 双击 `.md` 自动用本程序打开 | ❌ 系统层面不允许 |
| 设为 `.md` 默认打开程序 | ❌ 系统层面不允许 |

## 三步用起来

1. 解压本包，在解压目录起一个静态服务：

   ```bash
   cd MDReader-iOS-PWA
   python -m http.server 8000 --bind 0.0.0.0
   ```

   查电脑局域网 IP（Windows：`ipconfig`，看「IPv4 地址」，如 `192.168.1.20`）。
   手机和电脑连同一个 Wi-Fi；不用外网、不用云服务，文档不会离开局域网。

2. iPhone / iPad 用 **Safari** 打开 `http://192.168.1.20:8000/`
   → 点底部「分享」→ **添加到主屏幕** → 确认。

3. 主屏幕出现「MD Reader」图标，点开是全屏应用。要看文档时点应用内**打开文件**，
   从「文件」App 里选 `.md`（每次需手动选，这是 iOS 的限制）。

> 如果托管在 **HTTPS** 站点（或 localhost），`sw.js` 会自动把整站缓存下来，
> 之后断网也能打开；普通局域网 HTTP 下浏览器不允许 Service Worker，需保持服务可达。

## 应用图标（本包默认卡通组：黑白 + 红耳机 + 蓝眼睛）

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `apple-touch-icon.png` | 180×180 | iPhone 主屏（60pt @3x） |
| `apple-touch-icon-167.png` | 167×167 | iPad Pro 主屏（83.5pt @2x） |
| `apple-touch-icon-152.png` | 152×152 | iPad 主屏（76pt @2x） |
| `apple-touch-icon-120.png` | 120×120 | iPhone 主屏（60pt @2x）／设置里的小图标 |
| `icon-192.png` / `icon-512.png` | 192 / 512 | PWA manifest 标准图标 |
| `icon-maskable-512.png` | 512×512 | 自适应图标，主体收进中心安全区 |
| `icon-1024.png` | 1024×1024 | 高分辨率源图，便于自行裁切 |
| `favicon-16.png` / `favicon-32.png` / `favicon.ico` | 16 / 32 / 多尺寸 | 浏览器标签页与地址栏 |

主屏图标固定用**默认卡通组的黑底版**（黑底 + 白 MD + 红耳机 + 蓝眼睛），
四周留浅色底板，深浅壁纸上都能看清。应用内部（欢迎页 / 侧栏 / 标签页 favicon）
的 LOGO 则完全动态：在「系统设置 → 应用图标」可选**极简**（纯黑白）或**卡通**（黑白红蓝），
每组都有明/暗两版，随浅色 / 深色 / 护眼主题自动切换；偏好会记忆，下次打开沿用。
> iOS 系统限制：主屏图标在「添加到主屏幕」时固化，无法跟随应用内设置动态变化，
> 因此本包的主屏图标固定为默认卡通款；应用内切换不影响它。

> 已经添加过主屏幕的用户：iOS 会缓存旧图标，需要**长按删除主屏图标 →
> 重新「添加到主屏幕」**才会看到新图标。Service Worker 缓存名已升到 `v23`
> 且页面改为 network-first，正常刷新即可拿到新版页面（含新增的「单图结构选择 / 统一文档风格」）。

## 界面语言

本包为国内版，默认**简体中文**；在「系统设置 → 通用 / General → 语言 / Language」
可切换到 **English** 或 **其他 / Other（跟随系统）**，偏好会记忆。英文模式下界面全英，
但**你自己打开的 .md 文档不会被翻译**。如需默认英文的国际化版本，用
`python src/build.py --edition global` 重新构建即可。

## 与桌面版的关系

- **Windows 安装版**：桌面图标 + 开始菜单 + 4 种扩展名注册，可设为默认 → `MD Reader Setup 1.7.0.exe`
- **macOS 安装版**：Dock / 应用程序 + `CFBundleDocumentTypes` → 在 Mac 上执行 `desktop/scripts/build-mac.sh`
- **便携版**：`MDReader-便携版-v1.7.0.zip`，解压即用
- 三者与本包共用**同一份** `MDReader.html`，渲染功能完全一致

---
*v1.7 · 2026-11-15 · MD Reader iOS 可行范围包 · 单图结构选择 + 统一文档风格*
"""


def build():
    assert SRC_HTML.exists(), SRC_HTML
    assert SRC_ICON.exists(), SRC_ICON

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    html = SRC_HTML.read_text(encoding="utf-8")
    # 不能用 find("<body")：模板里 CSS 注释与 JS 字符串都出现过 <body>，
    # 会把正文起点判到脚本中间。真正的 </head> 一定早于第一个真实 <body>，
    # 所以直接取文档里第一个 </head> 作为注入点。
    head_end = html.find("</head>")
    assert head_end > 0, "no real </head> found"
    assert html.find("<body") > 0, "no <body> found"
    out_html = html[:head_end] + PWA_HEAD + html[head_end:]
    (OUT / "index.html").write_text(out_html, encoding="utf-8", newline="\n")
    assert PWA_HEAD[:40] in out_html, "head injection failed"

    (OUT / "manifest.webmanifest").write_text(
        json.dumps(MANIFEST, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    (OUT / "sw.js").write_text(SW, encoding="utf-8", newline="\n")
    (OUT / "README.md").write_text(README, encoding="utf-8", newline="\n")

    src = Image.open(SRC_ICON).convert("RGBA")

    def plain(size):
        """保留圆角透明的原始徽标，供浏览器 / PWA 使用。"""
        return src.resize((size, size), Image.LANCZOS)

    def on_backplate(size, scale, bg=(247, 249, 252)):
        """不透明底板 + 居中徽标。

        iOS 主屏图标不接受 alpha，且深浅壁纸都要能看清；
        maskable 图标则要求主体落在中心 80% 安全圆内。
        """
        canvas = Image.new("RGB", (size, size), bg)
        side = int(size * scale)
        thumb = src.resize((side, side), Image.LANCZOS)
        off = (size - side) // 2
        canvas.paste(thumb, (off, off), thumb)
        return canvas

    for name, size in (("favicon-16.png", 16), ("favicon-32.png", 32),
                       ("icon-192.png", 192), ("icon-512.png", 512),
                       ("icon-1024.png", 1024)):
        plain(size).save(OUT / name)
    src.save(OUT / "favicon.ico", format="ICO",
             sizes=[(s, s) for s in (16, 24, 32, 48)])

    for name, size in (("apple-touch-icon.png", 180),
                       ("apple-touch-icon-167.png", 167),
                       ("apple-touch-icon-152.png", 152),
                       ("apple-touch-icon-120.png", 120)):
        on_backplate(size, 0.86).save(OUT / name)

    on_backplate(512, 0.64).save(OUT / "icon-maskable-512.png")

    ZIP.parent.mkdir(parents=True, exist_ok=True)
    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in sorted(OUT.iterdir()):
            z.write(f, "MDReader-iOS-PWA/" + f.name)

    print("site  ->", OUT)
    for f in sorted(OUT.iterdir()):
        print("   %-26s %8.1f KB" % (f.name, f.stat().st_size / 1024))
    print("zip   ->", ZIP, "%.2f MB" % (ZIP.stat().st_size / 1024 / 1024))


if __name__ == "__main__":
    build()
