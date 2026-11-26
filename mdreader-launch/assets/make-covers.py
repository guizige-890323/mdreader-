# -*- coding: utf-8 -*-
"""生成公众号封面图（首图 900×383 + 分享缩略图 200×200，深浅两版）。

之所以脚本化：公众号每次发文都要封面，手工做图既慢又容易大小不合规。
配色直接取产品自身的主题变量，保证封面和截图摆在一起不违和。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
FONT_BD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_RG = r"C:\Windows\Fonts\msyh.ttc"

# 取自 src/template.html 的主题变量
DARK = {"bg": (14, 17, 22), "title": (255, 255, 255), "sub": (139, 148, 158), "accent": (88, 166, 255), "chip": (21, 43, 69)}
LIGHT = {"bg": (250, 250, 250), "title": (13, 17, 23), "sub": (110, 119, 129), "accent": (37, 99, 235), "chip": (239, 245, 255)}

W, H = 900, 383


def font(path, size):
    return ImageFont.truetype(path, size, index=0)


def make_cover(theme, name):
    img = Image.new("RGB", (W, H), theme["bg"])
    d = ImageDraw.Draw(img)

    # 左侧 6px 强调竖条
    d.rectangle([0, 0, 5, H], fill=theme["accent"])

    x = 64

    # 顶部标签
    label = "MD Reader · MIT 开源"
    f_lab = font(FONT_BD, 25)
    tw = d.textlength(label, font=f_lab)
    d.rounded_rectangle([x, 62, x + tw + 34, 62 + 44], radius=22, fill=theme["chip"])
    d.text((x + 17, 62 + 9), label, font=f_lab, fill=theme["accent"])

    # 主标题：一行，字号压满宽度
    title = "双击 .md 就能看"
    size = 92
    while d.textlength(title, font=font(FONT_BD, size)) > W - x - 56 and size > 40:
        size -= 2
    d.text((x - 4, 138), title, font=font(FONT_BD, size), fill=theme["title"])

    # 副标题
    sub = "单文件 3.8 MB · 零联网 · 不装依赖"
    d.text((x, 268), sub, font=font(FONT_RG, 31), fill=theme["sub"])

    # 右下角站点
    site = "github.com/guizige-890323/mdreader"
    f_site = font(FONT_RG, 19)
    sw = d.textlength(site, font=f_site)
    d.text((W - sw - 40, H - 52), site, font=f_site, fill=theme["sub"])

    img.save(OUT / name, quality=95)
    print("saved", name, img.size)


def make_thumb(theme, name):
    s = 200
    img = Image.new("RGB", (s, s), theme["bg"])
    d = ImageDraw.Draw(img)

    f_big = font(FONT_BD, 96)
    t = "MD"
    tw = d.textlength(t, font=f_big)
    d.text(((s - tw) / 2, 30), t, font=f_big, fill=theme["title"])

    f_sm = font(FONT_BD, 30)
    t2 = ".md"
    tw2 = d.textlength(t2, font=f_sm)
    d.text(((s - tw2) / 2, 138), t2, font=f_sm, fill=theme["accent"])

    d.rectangle([0, s - 6, s, s], fill=theme["accent"])
    img.save(OUT / name, quality=95)
    print("saved", name, img.size)


if __name__ == "__main__":
    make_cover(DARK, "cover-dark-900x383.png")
    make_cover(LIGHT, "cover-light-900x383.png")
    make_thumb(DARK, "thumb-dark-200x200.png")
    make_thumb(LIGHT, "thumb-light-200x200.png")
