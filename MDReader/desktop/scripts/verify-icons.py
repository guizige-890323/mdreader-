# -*- coding: utf-8 -*-
"""核对三个交付包里的应用图标是否都来自当前品牌素材。

用法：python MDReader/desktop/scripts/verify-icons.py
检查 Windows NSIS 安装包 / 便携版 / iOS PWA 包，以及软件内部双版 logo。
只做只读校验，不修改任何文件。
"""
import base64
import hashlib
import io
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent          # desktop/scripts
DESKTOP = HERE.parent                          # desktop
MD = DESKTOP.parent                            # MDReader
ROOT = MD.parent                               # 仓库根
BUILD = DESKTOP / "build"
SRC = MD / "src"
IOS = MD / "ios" / "site"

OK, BAD = [], []


def check(name, cond, detail=""):
    (OK if cond else BAD).append(name)
    print("  %s %-46s %s" % ("PASS" if cond else "FAIL", name, detail))


def b64(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")


def size(path):
    with Image.open(path) as im:
        return im.size, im.mode


def has(hay, needle):
    return needle.encode("utf-8") in hay if isinstance(hay, bytes) else needle in hay


print("\n[1] 品牌素材与 Windows 图标派生")
light_png, dark_png = BUILD / "icon-light.png", BUILD / "icon-dark.png"
check("brand-source/light.png / dark.png 存在",
      (DESKTOP / "brand-source/light.png").exists() and
      (DESKTOP / "brand-source/dark.png").exists())
check("icon-light/dark.png = 1024 RGBA",
      all(p.exists() and size(p) == ((1024, 1024), "RGBA") for p in (light_png, dark_png)))
for tag in ("light", "dark"):
    ico = BUILD / ("icon-%s.ico" % tag)
    with Image.open(ico) as im:
        frames = sorted(s[0] for s in im.ico.sizes())
    check("icon-%s.ico 七档尺寸" % tag,
          frames == [16, 24, 32, 48, 64, 128, 256], str(frames))
check("icon.ico / mdfile.ico = icon-dark.ico",
      (BUILD / "icon.ico").read_bytes() == (BUILD / "icon-dark.ico").read_bytes() and
      (BUILD / "mdfile.ico").read_bytes() == (BUILD / "icon-dark.ico").read_bytes())
for name, want in (("installerHeader.bmp", (150, 57)),
                   ("installerSidebar.bmp", (164, 314)),
                   ("uninstallerSidebar.bmp", (164, 314))):
    p = BUILD / name
    check("NSIS %s" % name, p.exists() and size(p)[0] == want,
          str(size(p)[0]) if p.exists() else "缺失")
for name in ("installerIcon.ico", "uninstallerIcon.ico", "installerHeaderIcon.ico"):
    p = BUILD / name
    check("NSIS %s = 新图标" % name,
          p.exists() and p.read_bytes() == (BUILD / "icon-dark.ico").read_bytes())
check("src/brand-light/dark.png = 128px 内嵌 logo",
      all(p.exists() and size(p)[0] == (128, 128) for p in
          (SRC / "brand-light.png", SRC / "brand-dark.png")))

print("\n[2] Windows 安装包")
VERSION = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))["version"]
setup_name = "MD Reader Setup %s.exe" % VERSION
setup = DESKTOP / "release" / setup_name
check(setup_name + " 存在", setup.exists(),
      "%.1f MB" % (setup.stat().st_size / 1024 / 1024) if setup.exists() else "缺失")
candidates = [p for p in DESKTOP.glob("release*/win-unpacked")
              if (p / "MD Reader.exe").exists()]
unpacked = max(candidates, key=lambda p: (p / "MD Reader.exe").stat().st_mtime) \
    if candidates else DESKTOP / "release-new" / "win-unpacked"
app_exe = unpacked / "MD Reader.exe"
print("  (win-unpacked: %s)" % unpacked.relative_to(DESKTOP))
check("win-unpacked/MD Reader.exe 存在", app_exe.exists())
asar = unpacked / "resources" / "app.asar"
if asar.exists():
    data = asar.read_bytes()
    check("app.asar 内嵌浅色 logo（新素材）", has(data, b64(SRC / "brand-light.png")))
    check("app.asar 内嵌深色 logo（新素材）", has(data, b64(SRC / "brand-dark.png")))
else:
    check("app.asar 存在", False, "缺失")
res_icons = unpacked / "resources" / "icons"
check("extraResources/icons 含双版运行时图标",
      all((res_icons / ("icon-%s.%s" % (t, e))).exists()
          for t in ("light", "dark") for e in ("ico", "png")))

# PE 图标资源是未压缩的，可以直接在 exe 字节流里搜 ICO 帧。
# 曾因 signAndEditExecutable:false 跳过 rcedit，导致主程序保留 Electron 默认图标。
def ico_frames(path):
    raw = path.read_bytes()
    count = struct.unpack_from("<H", raw, 4)[0]
    out = []
    for i in range(count):
        e = 6 + 16 * i
        size, off = struct.unpack_from("<II", raw, e + 8)
        out.append(raw[off:off + size])
    return [b for b in out if len(b) > 64]


frames = ico_frames(BUILD / "icon-dark.ico")
for label, path in (("安装程序 Setup", setup), ("主程序 MD Reader.exe", app_exe)):
    if not path.exists():
        check("%s 的 PE 图标" % label, False, "exe 缺失")
        continue
    data = path.read_bytes()
    hits = sum(1 for b in frames if data.find(b[:min(len(b), 1024)]) >= 0)
    check("%s 内嵌新版图标（非 Electron 默认）" % label,
          hits >= 4, "命中 %d/%d 帧" % (hits, len(frames)))

print("\n[3] 便携版 zip")
portable = ROOT / "MDReader-Windows11便携版.zip"
with zipfile.ZipFile(portable) as z:
    names = z.namelist()
    html = z.read("MDReader/dist/MDReader.html")
    check("便携版 HTML 内嵌浅色 logo", has(html, b64(SRC / "brand-light.png")))
    check("便携版 HTML 内嵌深色 logo", has(html, b64(SRC / "brand-dark.png")))
    check("便携版 src/brand-light.png 与源一致",
          z.read("MDReader/src/brand-light.png") == (SRC / "brand-light.png").read_bytes())
    check("便携版 src/brand-dark.png 与源一致",
          z.read("MDReader/src/brand-dark.png") == (SRC / "brand-dark.png").read_bytes())

print("\n[4] iOS / PWA 包")
pwa = ROOT / "MDReader-iOS-PWA.zip"
EXPECT = {
    "apple-touch-icon.png": (180, 180), "apple-touch-icon-167.png": (167, 167),
    "apple-touch-icon-152.png": (152, 152), "apple-touch-icon-120.png": (120, 120),
    "icon-192.png": (192, 192), "icon-512.png": (512, 512),
    "icon-maskable-512.png": (512, 512), "icon-1024.png": (1024, 1024),
    "favicon-16.png": (16, 16), "favicon-32.png": (32, 32),
}
with zipfile.ZipFile(pwa) as z:
    names = [n.split("/", 1)[-1] for n in z.namelist() if "/" in n]
    for name, want in EXPECT.items():
        p = "MDReader-iOS-PWA/" + name
        if p not in z.namelist():
            check("iOS " + name, False, "缺失")
            continue
        im = Image.open(io.BytesIO(z.read(p)))
        site_p = IOS / name
        same = site_p.exists() and z.read(p) == site_p.read_bytes()
        check("iOS %s %dx%d" % (name, *want),
              im.size == want and same,
              "%s %s" % (im.size, im.mode))
    manifest = json.loads(z.read("MDReader-iOS-PWA/manifest.webmanifest"))
    refs = [i["src"] for i in manifest["icons"]]
    check("manifest 引用的图标全部在包内",
          all("MDReader-iOS-PWA/" + r in z.namelist() for r in refs), str(refs))
    check("manifest 含独立 maskable 图标",
          any(i.get("purpose") == "maskable" for i in manifest["icons"]))
    idx = z.read("MDReader-iOS-PWA/index.html")
    check("iOS HTML 内嵌双版 logo",
          has(idx, b64(SRC / "brand-light.png")) and has(idx, b64(SRC / "brand-dark.png")))
    for s in ("180x180", "167x167", "152x152", "120x120", "favicon-32.png"):
        check("iOS HTML 声明 %s" % s, has(idx, s))
    sw = z.read("MDReader-iOS-PWA/sw.js")
    check("Service Worker 缓存已升到 v2（旧图标不残留）", has(sw, "mdreader-pwa-v2"))
    check("Service Worker 页面走 network-first", has(sw, "mode === 'navigate'"))
    # 主屏图标必须是新版深色耳机 MD，而不是旧的蓝底文档 M
    ati_raw = z.read("MDReader-iOS-PWA/apple-touch-icon.png")
    ati = Image.open(io.BytesIO(ati_raw)).convert("RGB")
    check("apple-touch-icon 为不透明 RGB",
          Image.open(io.BytesIO(ati_raw)).mode == "RGB")
    # 中心恰是白色 MD 笔画，所以按整图深色像素占比判断，而不是取一个点
    px = list(ati.getdata())
    ratio = sum(1 for r, g, b in px if max(r, g, b) < 80) / len(px)
    check("apple-touch-icon 主体为新版深色品牌底",
          ratio > 0.35, "深色像素占比 %.1f%%" % (ratio * 100))

print("\n" + "=" * 70)
print("PASS %d / FAIL %d" % (len(OK), len(BAD)))
if BAD:
    for n in BAD:
        print("  FAILED:", n)
    sys.exit(1)
print("三个交付包的图标均为当前品牌素材 ✅")
