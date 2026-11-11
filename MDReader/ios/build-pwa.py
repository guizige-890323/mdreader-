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
SRC_ICON = ROOT / "MDReader" / "desktop" / "build" / "icon.png"
OUT = HERE / "site"
ZIP = ROOT / "MDReader-iOS-PWA.zip"

PWA_HEAD = """
<!-- iOS PWA：仅影响「添加到主屏幕」后的表现，不改变阅读器逻辑 -->
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="MD Reader">
<meta name="theme-color" content="#2563eb">
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
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png",
         "purpose": "any maskable"},
    ],
}

SW = """/* 仅在 HTTPS / localhost 生效，用于把整站缓存下来离线可用 */
const CACHE = 'mdreader-pwa-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
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

## 与桌面版的关系

- **Windows 安装版**：桌面图标 + 开始菜单 + 4 种扩展名注册，可设为默认 → `MD Reader Setup 1.3.0.exe`
- **macOS 安装版**：Dock / 应用程序 + `CFBundleDocumentTypes` → 在 Mac 上执行 `desktop/scripts/build-mac.sh`
- **便携版**：`MDReader-Windows11便携版.zip`，解压即用
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
    (OUT / "README.md").write_text(README, encoding="utf-8", newline="\n")

    src = Image.open(SRC_ICON).convert("RGBA")
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180)):
        im = src.resize((size, size), Image.LANCZOS)
        if name == "apple-touch-icon.png":
            # iOS 主屏图标不接受透明通道，铺白底
            bg = Image.new("RGB", (size, size), (255, 255, 255))
            bg.paste(im, (0, 0), im)
            bg.save(OUT / name)
        else:
            im.save(OUT / name)

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
