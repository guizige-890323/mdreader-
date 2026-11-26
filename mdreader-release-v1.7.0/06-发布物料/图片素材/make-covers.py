# -*- coding: utf-8 -*-
"""生成四平台封面。调性：深底、留白、单一强调色，不做大字报。

产物（同目录）：
  cover-900x383.png          公众号首图
  thumb-200x200.png          公众号分享缩略图
  cover-video-1080x1260.png  视频号封面（3:4）
  cover-douyin-1080x1440.png 抖音封面（9:16）
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
BG = (14, 17, 22)
BG2 = (23, 28, 37)
WHITE = (250, 250, 252)
GREY = (150, 158, 172)
ACCENT = (37, 99, 235)
AMBER = (245, 187, 66)

BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
REG = r"C:\Windows\Fonts\msyh.ttc"


def font(path, size):
    return ImageFont.truetype(path, size)


def vgrad(w, h, top, bottom):
    img = Image.new("RGB", (1, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.point((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.resize((w, h), Image.BILINEAR)


def glow(img, cx, cy, radius, color=(37, 99, 235), peak=64):
    """柔和径向光：同心椭圆逐层叠 alpha，避免出现实心圆硬边。"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    steps = 90
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(peak * (1 - i / steps) ** 2.1)
        if a <= 0:
            continue
        ld.ellipse([cx - r, cy - r * 0.82, cx + r, cy + r * 0.82],
                   fill=(color[0], color[1], color[2], a))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def text(d, xy, s, f, fill, anchor="la", spacing=0):
    if spacing:
        x, y = xy
        for ch in s:
            d.text((x, y), ch, font=f, fill=fill, anchor=anchor)
            w = d.textlength(ch, font=f)
            x += w + spacing
    else:
        d.text(xy, s, font=f, fill=fill, anchor=anchor)


def card_stack(img, box, scale=1.0):
    """右侧三张错位圆角卡片，呼应产品「卡片皮肤」：浅底、编号、正文行。"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    for dx, dy, a_fill, a_line, a_text in [(-40, -44, 8, 26, 16),
                                           (-20, -22, 14, 40, 26),
                                           (0, 0, 232, 255, 150)]:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        b = [x0 + dx, y0 + dy, x0 + dx + w, y0 + dy + h]
        r = int(14 * scale)
        ld.rounded_rectangle(b, radius=r,
                             fill=(255, 255, 255, a_fill) if a_fill < 100 else (252, 252, 253, 246),
                             outline=(255, 255, 255, a_line), width=max(1, int(1.5 * scale)))
        pad = int(20 * scale)
        ly = b[1] + pad
        # 顶部：编号 + 标题粗行
        if a_text > 100:
            ld.rounded_rectangle([b[0] + pad, ly, b[0] + pad + int(6 * scale), ly + int(18 * scale)],
                                 radius=int(2 * scale), fill=ACCENT)
            tw = int((w - pad * 2) * 0.55)
            ld.rounded_rectangle([b[0] + pad + int(14 * scale), ly + int(4 * scale),
                                  b[0] + pad + int(14 * scale) + tw, ly + int(14 * scale)],
                                 radius=int(5 * scale), fill=(60, 66, 78, 235))
            ly += int(30 * scale)
        for k in range(5):
            lw = int((w - pad * 2) * (0.94 - 0.12 * (k % 3)))
            lh = int(6 * scale)
            if ly + lh > b[3] - pad:
                break
            ld.rounded_rectangle([b[0] + pad, ly, b[0] + pad + lw, ly + lh],
                                 radius=lh // 2,
                                 fill=(70, 78, 94, a_text) if a_text > 100 else (255, 255, 255, a_text))
            ly += int(20 * scale)
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    return img


def save(img, name):
    p = OUT / name
    img.save(p, "PNG", optimize=True)
    print("  %-28s %dx%d  %.0f KB" % (name, img.width, img.height, p.stat().st_size / 1024))


# ---------------- 公众号首图 900×383 ----------------
def cover_wechat():
    W, H = 900, 383
    img = vgrad(W, H, BG2, BG)
    img = glow(img, W - 150, -40, 420)
    img = glow(img, W - 250, 340, 260, peak=34)
    d = ImageDraw.Draw(img)

    text(d, (64, 62), "MD READER", font(BOLD, 15), (120, 150, 210), spacing=4)
    d.rounded_rectangle([64, 92, 148, 96], radius=2, fill=ACCENT)

    text(d, (62, 118), "4.6 MB", font(BOLD, 86), WHITE)
    text(d, (64, 224), "双击就能看 .md", font(BOLD, 38), WHITE)
    text(d, (64, 288), "零联网 · 不登录 · 开源免费", font(REG, 21), GREY)
    text(d, (64, 328), "两套皮肤 / 六种图表 / 可编辑流程图", font(REG, 19), (108, 118, 134))

    img = card_stack(img, (600, 128, 806, 292), scale=1.0)
    save(img, "cover-900x383.png")


# ---------------- 分享缩略图 200×200 ----------------
def thumb():
    S = 200
    img = vgrad(S, S, BG2, BG)
    d = ImageDraw.Draw(img)
    text(d, (S / 2, 66), "4.6 MB", font(BOLD, 46), WHITE, anchor="mm")
    text(d, (S / 2, 112), "MD Reader", font(BOLD, 20), (140, 160, 200), anchor="mm")
    d.rounded_rectangle([70, 134, 130, 137], radius=2, fill=ACCENT)
    text(d, (S / 2, 158), "双击就看", font(REG, 15), GREY, anchor="mm")
    save(img, "thumb-200x200.png")


# ---------------- 视频号 1080×1260（3:4） ----------------
def cover_video():
    W, H = 1080, 1260
    img = vgrad(W, H, BG2, BG)
    d = ImageDraw.Draw(img)
    text(d, (W / 2, 300), "4.6 MB", font(BOLD, 230), WHITE, anchor="mm")
    d.rounded_rectangle([W / 2 - 60, 452, W / 2 + 60, 458], radius=3, fill=ACCENT)
    text(d, (W / 2, 560), "能有多能打", font(BOLD, 96), WHITE, anchor="mm")
    text(d, (W / 2, 700), "双击看 .md　零联网　开源免费", font(REG, 38), GREY, anchor="mm")
    img = card_stack(img, (300, 830, 780, 1120), scale=1.6)
    save(img, "cover-video-1080x1260.png")


# ---------------- 抖音 1080×1440（9:16） ----------------
def cover_douyin():
    W, H = 1080, 1440
    img = vgrad(W, H, BG2, BG)
    d = ImageDraw.Draw(img)
    text(d, (W / 2, 330), "看 md 文件", font(BOLD, 64), AMBER, anchor="mm")
    text(d, (W / 2, 470), "别开", font(BOLD, 130), WHITE, anchor="mm")
    text(d, (W / 2, 630), "100 MB 的", font(BOLD, 130), WHITE, anchor="mm")
    text(d, (W / 2, 790), "编辑器", font(BOLD, 130), WHITE, anchor="mm")
    d.rounded_rectangle([W / 2 - 80, 880, W / 2 + 80, 887], radius=3, fill=ACCENT)
    text(d, (W / 2, 960), "4.6 MB · 双击就开", font(BOLD, 46), WHITE, anchor="mm")
    text(d, (W / 2, 1030), "开源 · 免费 · MIT", font(REG, 30), GREY, anchor="mm")
    save(img, "cover-douyin-1080x1440.png")


if __name__ == "__main__":
    print("生成封面：")
    cover_wechat()
    thumb()
    cover_video()
    cover_douyin()
