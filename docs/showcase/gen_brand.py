# -*- coding: utf-8 -*-
"""生成展示页用的品牌素材（应用图标 + 设计标语），输出到 docs/assets/brand/。

为什么要有这一步：
  展示页要内嵌 base64，直接塞 1024² 图标（~1MB）和 1920 宽标语（~50KB）
  会让 HTML 白胖；先按「实际渲染尺寸 × 2 倍图」重采样，视觉无损、体积减半。

源文件（唯一真身，改图标/改口号只改这里）：
  · 应用图标 = MDReader/desktop/build/icon-light.png（1024×1024，与桌面版 exe 图标同源）
  · 设计标语 = MDReader/src/slogan-poster.jpg（1920×284，与软件欢迎屏同一张）

运行：python docs/showcase/gen_brand.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'assets' / 'brand'

ICON_SRC = ROOT / 'MDReader' / 'desktop' / 'build' / 'icon-light.png'
SLOGAN_SRC = ROOT / 'MDReader' / 'src' / 'slogan-poster.jpg'

# 图标实际渲染 40×40 → 2x 需要 80，给到 192 是为高分屏 / 未来放大留余量
ICON_SIDE = 192
# 标语实际渲染 660 宽 → 2x 需要 1320，取 1200 兼顾体积
SLOGAN_W = 1200


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    for p in (ICON_SRC, SLOGAN_SRC):
        if not p.exists():
            raise SystemExit('缺少源文件: ' + str(p))

    ic = Image.open(ICON_SRC).convert('RGBA')
    ic.resize((ICON_SIDE, ICON_SIDE), Image.LANCZOS).save(
        OUT / 'app-icon.png', optimize=True)

    sl = Image.open(SLOGAN_SRC).convert('RGB')
    h = round(sl.size[1] * SLOGAN_W / sl.size[0])
    sl.resize((SLOGAN_W, h), Image.LANCZOS).save(
        OUT / 'slogan.jpg', quality=92, optimize=True)

    for f in ('app-icon.png', 'slogan.jpg'):
        p = OUT / f
        im = Image.open(p)
        print('%-14s %-10s %7d B' % (f, '%dx%d' % im.size, p.stat().st_size))
    print('ratio slogan = %.2f (源 %.2f)' % (
        SLOGAN_W / h, sl.size[0] / sl.size[1]))


if __name__ == '__main__':
    main()