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
# 主屏 / PWA 图标固定用「图片-16」那一版（深色圆角方块 + 白色耳机 MD），
# 在浅色壁纸上识别度最高；软件内部 logo 仍由主题自动在两版之间切换。
SRC_ICON = ROOT / "MDReader" / "desktop" / "build" / "icon-light.png"
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
   v2：更新品牌图标后必须换缓存名，否则旧的 Service Worker 会继续吐旧图标。 */
const CACHE = 'mdreader-pwa-v2';
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

## 应用图标（本包已全部替换为新版品牌图标）

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

主屏图标固定用「深色圆角方块 + 白色耳机 MD」那一版（即 `图片-16.png`），
四周留浅色底板，深浅壁纸上都能看清；**应用内部**左上角和欢迎页的 logo
仍会随主题自动切换：浅色 / 护眼 → `图片-16.png`，深色 → `图片-7.png`。

> 已经添加过主屏幕的用户：iOS 会缓存旧图标，需要**长按删除主屏图标 →
> 重新「添加到主屏幕」**才会看到新图标。Service Worker 缓存名已升到 `v2`
> 且页面改为 network-first，正常刷新即可拿到新版页面。

## 与桌面版的关系

- **Windows 安装版**：桌面图标 + 开始菜单 + 4 种扩展名注册，可设为默认 → `MD Reader Setup 1.3.0.exe`
- **macOS 安装版**：Dock / 应用程序 + `CFBundleDocumentTypes` → 在 Mac 上执行 `desktop/scripts/build-mac.sh`
- **便携版**：`MDReader-便携版-v__VER__.zip`，解压即用
- 三者与本包共用**同一份** `MDReader.html`，渲染功能完全一致

---
*v1.3 · 2026-11-11 · MD Reader iOS 可行范围包*
"""


def build():
    assert SRC_HTML.exists(), SRC_HTML
    assert SRC_ICON.exists(), SRC_ICON

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    html = SRC_HTML.read_text(encoding="utf-8")
    body = html.find("<body")
    assert body > 0, "no <body> found"
    head_end = html.rfind("</head>", 0, body)
    assert head_end > 0, "no real </head> found"
    out_html = html[:head_end] + PWA_HEAD + html[head_end:]
    (OUT / "index.html").write_text(out_html, encoding="utf-8", newline="\n")
    assert PWA_HEAD[:40] in out_html, "head injection failed"

    (OUT / "manifest.webmanifest").write_text(
        json.dumps(MANIFEST, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    (OUT / "sw.js").write_text(SW, encoding="utf-8", newline="\n")
    (OUT / "README.md").write_text(README.replace("__VER__", VERSION), encoding="utf-8", newline="\n")

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
