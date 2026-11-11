# -*- coding: utf-8 -*-
"""生成应用图标（1024 PNG + 多尺寸 ICO + .md 文件类型图标）。
纯 Pillow 绘制，无外部素材依赖：圆角深蓝方块 + 折角纸张 + M↓ 字形。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BUILD = Path(__file__).resolve().parent.parent / "build"
BUILD.mkdir(parents=True, exist_ok=True)
S = 1024

BG = (37, 99, 235)        # #2563eb，卡片皮肤强调色
BG_DARK = (24, 55, 145)
PAPER = (255, 255, 255)
INK = (15, 23, 42)
ACCENT = (37, 99, 235)


def rr(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def make_main():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 底：圆角蓝
    rr(d, (32, 32, S - 32, S - 32), 224, BG)
    # 底部渐变感（叠一层半透明深蓝）
    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    rr(od, (32, S // 2, S - 32, S - 32), 224, BG_DARK + (60,))
    im = Image.alpha_composite(im, overlay)
    d = ImageDraw.Draw(im)

    # 纸张（带折角）
    px0, py0, px1, py1 = 232, 176, 792, 848
    d.rounded_rectangle((px0, py0, px1, py1), radius=42, fill=PAPER)
    fold = 150
    d.polygon([(px1 - fold, py0), (px1, py0 + fold), (px1 - fold, py0 + fold)], fill=(226, 232, 240))
    d.line([(px1 - fold, py0), (px1 - fold, py0 + fold), (px1, py0 + fold)], fill=(203, 213, 225), width=6)

    # 文字 "M" + 下箭头（markdown 的 ↓）
    font = None
    for fp in (r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf",
               "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            font = ImageFont.truetype(fp, 330)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    d.text((300, 268), "M", font=font, fill=INK)

    # MD 三横线（正文行）
    for i, w in enumerate((330, 280, 310)):
        y = 640 + i * 54
        d.rounded_rectangle((300, y, 300 + w, y + 18), radius=9, fill=(203, 213, 225))
    # 强调色小条
    d.rounded_rectangle((300, 570, 430, 588), radius=9, fill=ACCENT)

    return im


def make_file_icon():
    """双击 .md 时在资源管理器里显示的文档图标：白纸 + 蓝色 MD 角标"""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 投影
    d.rounded_rectangle((196, 96, 828, 928), radius=48, fill=(15, 23, 42, 40))
    # 纸
    d.rounded_rectangle((184, 80, 816, 912), radius=48, fill=PAPER)
    d.rounded_rectangle((184, 80, 816, 912), radius=48, outline=(203, 213, 225), width=10)
    fold = 180
    d.polygon([(816 - fold, 80), (816, 80 + fold), (816 - fold, 80 + fold)], fill=(241, 245, 249))
    d.line([(816 - fold, 80), (816 - fold, 80 + fold), (816, 80 + fold)], fill=(203, 213, 225), width=9)
    # 蓝色角标
    rr(d, (196, 676, 660, 864), 40, BG)
    font = None
    for fp in (r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"):
        try:
            font = ImageFont.truetype(fp, 130)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    d.text((250, 706), "MD", font=font, fill=PAPER)
    return im


def save_png(im, name):
    p = BUILD / name
    im.save(p, "PNG", optimize=True)
    print("icon: %-16s %7.1f KB" % (name, p.stat().st_size / 1024))
    return p


def save_ico(im, name, sizes=(16, 24, 32, 48, 64, 128, 256)):
    base = im.convert("RGBA").resize((256, 256), Image.LANCZOS)
    ico = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ico.alpha_composite(base)
    p = BUILD / name
    ico.save(p, format="ICO", sizes=[(s, s) for s in sizes])
    print("icon: %-16s %7.1f KB  sizes=%s" % (name, p.stat().st_size / 1024, list(sizes)))
    return p


def main():
    app = make_main()
    save_png(app, "icon.png")
    save_ico(app, "icon.ico")
    save_ico(make_file_icon(), "mdfile.ico")
    # 预览用大图
    save_png(make_file_icon(), "mdfile.png")
    print("done -> %s" % BUILD)


if __name__ == "__main__":
    main()