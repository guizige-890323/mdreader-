# -*- coding: utf-8 -*-
"""从两版品牌素材生成全平台图标。

素材语义（按用户指定）：
  brand-source/light.png = 图片-16.png，深色圆角方块 + 白色 MD 图案
                           → 用于「浅色 / 护眼」主题（亮界面里放深色徽标）
  brand-source/dark.png  = 图片-7.png，白色圆角方块 + 黑色 MD 图案
                           → 用于「深色」主题（暗界面里放白色徽标）

平台常规尺寸：
  Windows ICO     16 / 24 / 32 / 48 / 64 / 128 / 256（安装包、快捷方式、任务栏、文档类型）
  NSIS 向导       installerIcon / uninstallerIcon / installerHeaderIcon = ICO
                  installerHeader.bmp = 150×57，installerSidebar.bmp = 164×314
  macOS / Linux   1024 PNG（electron-builder 转 icns）
  iOS / PWA        120 / 152 / 167 / 180 / 192 / 512 + maskable（ios/build-pwa.py 派生）
  软件内部 logo    128 PNG（src/build.py 内嵌成 data URI，保证单文件离线）
"""
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent        # MDReader/desktop
ROOT = HERE.parent                                  # MDReader
BUILD = HERE / "build"
SRC = ROOT / "src"
BRAND = HERE / "brand-source"
ICONS = BUILD / "icons"

# 原始素材 1024×1024 白底，圆角方块约占 (110,104)–(918,912)
CROP = (110, 104, 918, 912)
BASE = 1024
CORNER_RATIO = 0.205
EDGE_INSET = 0.016          # 内缩留安全边距，顺便切掉原图白底在圆角外的一圈高光
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


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
    src = BRAND / name
    assert src.exists(), "缺少品牌素材: %s" % src
    im = Image.open(src).convert("RGB")
    im = im.crop(CROP).resize((BASE, BASE), Image.LANCZOS).convert("RGBA")
    # 原图白色外围不透明；套圆角遮罩后四角透明，图标在任何系统主题下都是干净的圆角方块
    im.putalpha(rounded_mask(BASE, CORNER_RATIO, EDGE_INSET))
    return im


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
    """NSIS assisted installer 的两张品牌位图，替换默认的 nsis3-metro.bmp。
    统一为「深色」安装视觉：深底 + 白色 MD 徽标（与 icon-dark 一致）。"""
    # MUI_HEADERIMAGE：150 × 57（深底 + 白字）
    header = Image.new("RGB", (150, 57), (28, 34, 46))
    paste_mark(header, mark, (7, 8, 50, 51))
    d = ImageDraw.Draw(header)
    d.text((56, 17), "MD Reader", font=font(15, True), fill=(255, 255, 255))
    d.text((56, 37), "Markdown 阅读器", font=font(9), fill=(176, 184, 198))
    header.save(BUILD / "installerHeader.bmp", format="BMP")

    # MUI_WELCOMEFINISHPAGE_BITMAP：164 × 314（深渐变底 + 白字 + 浅蓝点缀）
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
    d.text((82, 294), "v1.3.0", font=font(9), fill=(140, 150, 165), anchor="mm")
    side.save(BUILD / "installerSidebar.bmp", format="BMP")
    shutil.copyfile(BUILD / "installerSidebar.bmp", BUILD / "uninstallerSidebar.bmp")

    for name in ("installerIcon.ico", "uninstallerIcon.ico", "installerHeaderIcon.ico"):
        shutil.copyfile(BUILD / "icon-dark.ico", BUILD / name)
    print("wizard    installerHeader.bmp 150x57 / installerSidebar.bmp 164x314 + 3 ICO (dark)")


def main():
    BUILD.mkdir(exist_ok=True)
    ICONS.mkdir(exist_ok=True)
    marks = {}

    for tag in ("light", "dark"):
        im = load_mark(tag + ".png")
        marks[tag] = im
        ico = BUILD / ("icon-%s.ico" % tag)
        png = BUILD / ("icon-%s.png" % tag)
        im.save(ico, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
        im.save(png)
        print("%-22s %7.1f KB  ICO sizes=%s" %
              (ico.name, ico.stat().st_size / 1024, ICO_SIZES))
        print("%-22s %7.1f KB  1024px" % (png.name, png.stat().st_size / 1024))

        # 运行时主题切换用的窗口 / 任务栏图标（extraResources）
        for ext in (".ico", ".png"):
            shutil.copyfile(BUILD / ("icon-%s%s" % (tag, ext)),
                            ICONS / ("icon-%s%s" % (tag, ext)))
        # 软件内部 logo（内嵌进单文件 HTML）
        inner = SRC / ("brand-%s.png" % tag)
        im.resize((128, 128), Image.LANCZOS).save(inner)
        print("%-22s %7.1f KB  128px (inline data URI)" %
              (inner.name, inner.stat().st_size / 1024))

    # 安装包 / 快捷方式 / .md 文档类型主图标：统一用「深色」品牌图标（白底方块 + 黑色 MD）。
    # 用户在深色桌面下，白底方块比原来的近黑方块更醒目；不再使用黑色底。
    shutil.copyfile(BUILD / "icon-dark.ico", BUILD / "icon.ico")
    shutil.copyfile(BUILD / "icon-dark.ico", BUILD / "mdfile.ico")
    shutil.copyfile(BUILD / "icon-dark.png", BUILD / "icon.png")
    marks["dark"].resize((256, 256), Image.LANCZOS).save(BUILD / "mdfile.png")
    print("primary icon.ico / mdfile.ico / icon.png / mdfile.png  <- icon-dark")

    make_wizard_images(marks["dark"])


if __name__ == "__main__":
    main()
