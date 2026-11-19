# -*- coding: utf-8 -*-
"""从两组品牌素材生成全平台图标（极简 / 卡通）。

素材语义（按用户指定）：
  极简 minimal
    brand-source/light.png         黑底圆角方块 + 白色 MD（浅色 / 护眼界面用）
    brand-source/dark.png          白底圆角方块 + 黑色 MD（深色界面用）
  卡通 cartoon（2026-11-13 新增，默认组）
    brand-source/cartoon-light.png 黑底 + 白 MD + 红耳机 + 蓝眼睛（浅色 / 护眼）
    brand-source/cartoon-dark.png  白底 + 黑 MD + 红耳机 + 蓝眼睛（深色）

平台常规尺寸：
  Windows ICO     16 / 24 / 32 / 48 / 64 / 128 / 256（安装包、快捷方式、任务栏、文档类型）
  NSIS 向导       installerIcon / uninstallerIcon / installerHeaderIcon = ICO
                  installerHeader.bmp = 150×57，installerSidebar.bmp = 164×314
  macOS / Linux   1024 PNG（electron-builder 转 icns）
  iOS / PWA        120 / 152 / 167 / 180 / 192 / 512 + maskable（ios/build-pwa.py 派生）
  软件内部 logo    128 PNG × 4（src/build.py 内嵌成 data URI，保证单文件离线）

命名规则：icon-<组>-<明/暗>.{png,ico}，例如 icon-cartoon-dark.ico。
兼容别名 icon-light.* / icon-dark.* 与 brand-light.png / brand-dark.png 一律指向
**默认组（卡通）**，供旧脚本 / 旧版 Electron 壳继续引用。
"""
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent        # MDReader/desktop
ROOT = HERE.parent                                  # MDReader
BUILD = HERE / "build"
SRC = ROOT / "src"
BRAND = HERE / "brand-source"
ICONS = BUILD / "icons"

# 安装向导侧边栏上印的版本号也跟 package.json 走，避免"界面 v1.7 / 图上 v1.3"
VERSION = json.loads((HERE / "package.json").read_text(encoding="utf-8"))["version"]

# 原始极简素材 1024×1024 白底，圆角方块约占 (110,104)–(918,912)
CROP = (110, 104, 918, 912)
BASE = 1024
CORNER_RATIO = 0.205
EDGE_INSET = 0.016          # 内缩留安全边距，顺便切掉原图白底在圆角外的一圈高光
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

SETS = {
    "minimal": {"light": "light.png", "dark": "dark.png"},
    "cartoon": {"light": "cartoon-light.png", "dark": "cartoon-dark.png"},
}
DEFAULT_SET = "cartoon"     # 用户指定：默认改为黑白红蓝卡通款


def rounded_mask(size, ratio, inset):
    """超采样抗锯齿的圆角矩形 alpha 遮罩，四角透明。"""
    s = 4
    big = size * s
    pad = int(big * inset)
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (pad, pad, big - pad - 1, big - pad - 1),
        radius=int(big * ratio), fill=255)
    return m.resize((size, size), Image.LANCZOS)


FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REG = "C:/Windows/Fonts/msyh.ttc"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
    except OSError:
        return ImageFont.load_default()


def load_mark(name):
    """极简组：裁掉原图外围白底，套圆角遮罩。"""
    src = BRAND / name
    assert src.exists(), "缺少品牌素材: %s" % src
    im = Image.open(src).convert("RGB")
    im = im.crop(CROP).resize((BASE, BASE), Image.LANCZOS).convert("RGBA")
    im.putalpha(rounded_mask(BASE, CORNER_RATIO, EDGE_INSET))
    return im


def load_cartoon(name):
    """卡通组：素材本身已是带透明圆角的 APP 图标（832×824，四周透明）。

    裁掉透明边后**等比**居中贴到 1024 透明画布，避免 832×824 被拉成正方形变形；
    四周保留 2% 安全边距，便于 iOS maskable / Windows 小尺寸裁切。
    """
    src = BRAND / name
    assert src.exists(), "缺少品牌素材: %s" % src
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    assert bbox, "空素材: %s" % src
    im = im.crop(bbox)
    w, h = im.size
    side = int(BASE * 0.96)
    scale = side / max(w, h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    canvas.paste(im, ((BASE - nw) // 2, (BASE - nh) // 2), im)
    return canvas


def paste_mark(canvas, mark, box):
    """把带 alpha 的品牌徽标等比缩放后居中贴到 box。"""
    x0, y0, x1, y1 = box
    side = min(x1 - x0, y1 - y0)
    thumb = mark.resize((side, side), Image.LANCZOS)
    canvas.paste(thumb, (int((x0 + x1 - side) / 2), int((y0 + y1 - side) / 2)), thumb)


def gradient(size, top, bottom):
    """竖向线性渐变（NSIS 向导位图只吃 24-bit BMP）。"""
    w, h = size
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line((0, y, w, y),
               fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return im


def make_wizard_images(mark):
    """NSIS assisted installer 的两张品牌位图 + 3 枚 ICO（统一用默认组）。"""
    header = Image.new("RGB", (150, 57), (28, 34, 46))
    paste_mark(header, mark, (7, 8, 50, 51))
    d = ImageDraw.Draw(header)
    d.text((56, 17), "MD Reader", font=font(15, True), fill=(255, 255, 255))
    d.text((56, 37), "Markdown 阅读器", font=font(9), fill=(176, 184, 198))
    header.save(BUILD / "installerHeader.bmp", format="BMP")

    side = gradient((164, 314), (34, 41, 56), (20, 26, 38))
    paste_mark(side, mark, (26, 42, 138, 154))
    d = ImageDraw.Draw(side)
    d.text((82, 186), "MD Reader", font=font(19, True),
           fill=(255, 255, 255), anchor="mm")
    d.text((82, 212), "本地 Markdown 阅读器", font=font(11),
           fill=(176, 184, 198), anchor="mm")
    d.rounded_rectangle((54, 232, 110, 234), radius=1, fill=(96, 165, 250))
    d.text((82, 252), "离线 · 双皮肤 · 可编辑", font=font(10),
           fill=(160, 170, 186), anchor="mm")
    d.text((82, 294), "v" + VERSION, font=font(9), fill=(140, 150, 165), anchor="mm")
    side.save(BUILD / "installerSidebar.bmp", format="BMP")
    shutil.copyfile(BUILD / "installerSidebar.bmp", BUILD / "uninstallerSidebar.bmp")

    for name in ("installerIcon.ico", "uninstallerIcon.ico", "installerHeaderIcon.ico"):
        shutil.copyfile(BUILD / ("icon-%s-dark.ico" % DEFAULT_SET), BUILD / name)
    print("wizard    installerHeader.bmp 150x57 / installerSidebar.bmp 164x314 + 3 ICO (%s)" % DEFAULT_SET)


def main():
    BUILD.mkdir(exist_ok=True)
    ICONS.mkdir(exist_ok=True)
    marks = {}

    for setname, pair in SETS.items():
        loader = load_cartoon if setname == "cartoon" else load_mark
        for tag in ("light", "dark"):
            im = loader(pair[tag])
            marks[(setname, tag)] = im
            stem = "icon-%s-%s" % (setname, tag)
            ico = BUILD / (stem + ".ico")
            png = BUILD / (stem + ".png")
            im.save(ico, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
            im.save(png)
            print("%-26s %7.1f KB  ICO sizes=%s" %
                  (ico.name, ico.stat().st_size / 1024, ICO_SIZES))
            print("%-26s %7.1f KB  1024px" % (png.name, png.stat().st_size / 1024))

            # 运行时（Electron 主题 / LOGO 组切换）用的窗口 / 任务栏图标
            for ext in (".ico", ".png"):
                shutil.copyfile(BUILD / (stem + ext), ICONS / (stem + ext))
            # 软件内部 logo（内嵌进单文件 HTML）
            inner = SRC / ("brand-%s-%s.png" % (setname, tag))
            im.resize((128, 128), Image.LANCZOS).save(inner)
            print("%-26s %7.1f KB  128px (inline data URI)" %
                  (inner.name, inner.stat().st_size / 1024))

    # 兼容旧名：一律指向默认组（卡通），旧脚本 / 旧版壳无需改动也能拿到新图标
    for tag in ("light", "dark"):
        stem = "icon-%s-%s" % (DEFAULT_SET, tag)
        for ext in (".ico", ".png"):
            shutil.copyfile(BUILD / (stem + ext), BUILD / ("icon-%s%s" % (tag, ext)))
            shutil.copyfile(BUILD / (stem + ext), ICONS / ("icon-%s%s" % (tag, ext)))
        shutil.copyfile(SRC / ("brand-%s-%s.png" % (DEFAULT_SET, tag)),
                        SRC / ("brand-%s.png" % tag))

    # 安装包 / 快捷方式 / .md 文档类型主图标：默认组的「白底」版，浅色桌面上识别度最高
    main_mark = marks[(DEFAULT_SET, "dark")]
    shutil.copyfile(BUILD / ("icon-%s-dark.ico" % DEFAULT_SET), BUILD / "icon.ico")
    shutil.copyfile(BUILD / ("icon-%s-dark.ico" % DEFAULT_SET), BUILD / "mdfile.ico")
    shutil.copyfile(BUILD / ("icon-%s-dark.png" % DEFAULT_SET), BUILD / "icon.png")
    main_mark.resize((256, 256), Image.LANCZOS).save(BUILD / "mdfile.png")
    print("primary icon.ico / mdfile.ico / icon.png / mdfile.png  <- %s-dark" % DEFAULT_SET)

    make_wizard_images(main_mark)


if __name__ == "__main__":
    main()
