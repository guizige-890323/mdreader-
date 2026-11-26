# -*- coding: utf-8 -*-
"""
生成三枚「换肤」图标：沿用 MD Reader 产品 LOGO 的原始图形，
只替换底色与图形色，让浅色 / 深色 / 护眼三套皮肤一眼可辨。

做法：以 src/brand-light.png（深底 + 白色 MD 图形）为形状模板，
按亮度在 bg → fg 之间插值重新上色，保留原有 alpha 圆角与抗锯齿，
再缩到 64×64 供顶栏 22px 显示（高 DPI 仍清晰）。

输出：src/skin-light.png / skin-dark.png / skin-sepia.png
由 src/build.py 通过 __SKIN_*_DATA__ 内嵌进单文件 HTML。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "brand-light.png"

# (背景=圆角方块, 前景=MD 图形)
SKINS = {
    "light": ((255, 255, 255), (24, 29, 39)),      # 白底墨黑
    "dark":  ((17, 21, 29),  (255, 255, 255)),    # 深底纯白
    "sepia": ((243, 229, 199), (96, 68, 42)),     # 米黄底暖棕
}


def recolor(src, bg, fg):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    sp = im.load()
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a < 8:
                op[x, y] = (0, 0, 0, 0)
                continue
            # 原图前景近白、背景近黑；线性插值即可保留笔画抗锯齿
            t = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            t = max(0.0, min(1.0, (t - 0.06) / 0.88))
            op[x, y] = (
                round(bg[0] * (1 - t) + fg[0] * t),
                round(bg[1] * (1 - t) + fg[1] * t),
                round(bg[2] * (1 - t) + fg[2] * t),
                a,
            )
    return out.resize((64, 64), Image.LANCZOS)


def main():
    if not SRC.exists():
        raise SystemExit("缺少 %s" % SRC)
    for name, (bg, fg) in SKINS.items():
        dst = ROOT / "src" / ("skin-%s.png" % name)
        recolor(SRC, bg, fg).save(dst, optimize=True)
        print("  ✓ %-18s %5.1f KB  bg=%s fg=%s" %
              (dst.name, dst.stat().st_size / 1024, bg, fg))


if __name__ == "__main__":
    main()
