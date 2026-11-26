# -*- coding: utf-8 -*-
"""把 docs/assets/v2 的 26 张分组合成 15 张「组图」，供功能展示页 / 欢迎屏 / GIF 三处共用。

设计口径（关键，改之前先读）：
  · 源图全部 1000x640 = 1.5625:1，所以「同比例缩放」零裁切，任何跨比例才需要裁；
  · 1 图：直出，不动；
  · 2 图：主图 800x512 + 副图 520x333 右下叠卡（白边 + 阴影），两张都能看清主要区域，
         比「并排各裁一半」信息量高得多；
  · 3 图：主图 660x422 左 + 右侧两张 300x192 纵列；
  · 4 图：2x2 每张 486x311 —— 486/311 = 1.5627，与源图 1.5625 几乎完全一致，零裁切。

输出：
  docs/assets/v2/group-<key>.webp   1000x640（展示页卡片、GIF 舞台）
  MDReader/_shots/welcome/w15-*.webp  816x480（欢迎屏滚动展板，等比缩放零裁切）
  docs/assets/v2/groups.json        组索引，含顺序与配图数
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'docs' / 'assets' / 'v2'
WELCOME = ROOT / 'MDReader' / '_shots' / 'welcome'

W, H = 1000, 640
BG = (238, 242, 247)          # 与展示页 .card-media 同色，缩略图下不显突兀
SHADOW = (24, 42, 72)

# 15 组：(key, 中文名, 英文名, 图数)  顺序即展示顺序
GROUPS = [
    ('clip',      'Markdown 复制即创建', 'CLIPBOARD → DOC',          1),
    ('chart',     '多样图表',            'SIX CHART TYPES',           4),
    ('flow',      '双引擎流程图',        'DUAL-ENGINE FLOW',          4),
    ('theme',     '多色主题，风格统一',  'ONE PALETTE, EVERYWHERE',   3),
    ('wiki',      '知识库原生双链',      'NATIVE WIKI LINKS',         1),
    ('export',    '多样导出，支持编辑的 HTML', 'EXPORT THAT LIVES',    2),
    ('mcp',       'MCP 连接器',          'MCP READY',                 1),
    ('outline',   '文档大纲与块编辑',    'OUTLINE & BLOCK EDIT',      2),
    ('typo',      '设计师经典排版',      'TWO TYPOGRAPHIC SKINS',     2),
    ('recent',    '最近极速打开',        'RECENT, RE-READ FROM DISK', 1),
    ('settings',  '丰富设置',            'GRANULAR SETTINGS',         1),
    ('focus',     '专注模式',            'FOCUS MODE',                1),
    ('softlight', '原创云晰柔光阅读',    'SOFT LIGHT',                1),
    ('eyecare',   '爱护你的双眼',        'EYE CARE',                  1),
    ('i18n',      '国际化版本',          'I18N',                      1),
]


def load(key, n):
    p = SRC / ('%s-%d.webp' % (key, n))
    if not p.exists():
        raise SystemExit('缺少素材: ' + str(p))
    return Image.open(p).convert('RGB')


def fit(im, w, h):
    """同比例缩放（源图 1.5625 与目标比例接近），用 contain 保证零裁切。
    比例差 > 2% 才退化为 cover 居中裁，避免细长条被拉变形。"""
    r_src, r_dst = im.width / im.height, w / h
    if abs(r_src - r_dst) / r_dst <= 0.02:
        return im.resize((w, h), Image.LANCZOS)
    # cover
    s = max(w / im.width, h / im.height)
    im2 = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    l, t = (im2.width - w) // 2, (im2.height - h) // 2
    return im2.crop((l, t, l + w, t + h))


def card(im, w, h, border=5, radius=10):
    """带白边与圆角的贴片（模拟截图卡片），返回 RGBA。"""
    inner = fit(im, w - border * 2, h - border * 2)
    tile = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(255, 255, 255, 255))
    tile.paste(inner, (border, border))
    # 圆角遮罩，把内图角也切掉
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    tile.putalpha(mask)
    return tile


def paste_shadow(canvas, tile, xy, blur=16, opacity=54, dy=7):
    """先画模糊阴影再贴卡片，让叠卡之间有层次而不是糊成一片。"""
    sh = Image.new('RGBA', (tile.width + blur * 4, tile.height + blur * 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [blur * 2, blur * 2, blur * 2 + tile.width, blur * 2 + tile.height],
        radius=12, fill=SHADOW + (opacity,))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh, (xy[0] - blur * 2, xy[1] - blur * 2 + dy))
    canvas.alpha_composite(tile, xy)


def compose(key, n):
    canvas = Image.new('RGBA', (W, H), BG + (255,))
    ims = [load(key, i + 1) for i in range(n)]

    if n == 1:
        canvas.alpha_composite(card(ims[0], W - 24, H - 24, border=0, radius=10), (12, 12))

    elif n == 2:
        # 主图 800x512 居左上，副图 520x333 右下压叠
        paste_shadow(canvas, card(ims[0], 800, 512), (34, 34), blur=18, opacity=46, dy=8)
        paste_shadow(canvas, card(ims[1], 520, 333), (446, 273), blur=20, opacity=64, dy=10)

    elif n == 3:
        paste_shadow(canvas, card(ims[0], 640, 410), (28, 115), blur=18, opacity=46, dy=8)
        paste_shadow(canvas, card(ims[1], 300, 192), (676, 42), blur=14, opacity=50, dy=6)
        paste_shadow(canvas, card(ims[2], 300, 192), (676, 406), blur=14, opacity=50, dy=6)

    elif n == 4:
        # 2x2：486/311 = 1.5627 ≈ 源图 1.5625，零裁切
        cw, ch, gap, ox, oy = 486, 311, 12, 8, 6
        for i, im in enumerate(ims):
            r, c = divmod(i, 2)
            x = ox + c * (cw + gap)
            y = oy + r * (ch + gap)
            paste_shadow(canvas, card(im, cw, ch, border=4, radius=8), (x, y),
                         blur=10, opacity=40, dy=4)
    else:
        raise SystemExit('未支持的图数: %d' % n)

    return canvas.convert('RGB')


def main():
    WELCOME.mkdir(parents=True, exist_ok=True)
    idx, total = [], 0
    for key, name, en, n in GROUPS:
        im = compose(key, n)
        out = SRC / ('group-%s.webp' % key)
        im.save(out, 'WEBP', quality=86, method=6)
        # 欢迎屏：816x480 = 1.7:1，从 1000x640 等比缩放（零裁切，下面再按 1.7 微调）
        wl = im.resize((816, 480), Image.LANCZOS)
        wlp = WELCOME / ('w15-%s.webp' % key)
        wl.save(wlp, 'WEBP', quality=82, method=6)
        b = out.stat().st_size
        total += b
        idx.append(dict(key=key, name=name, en=en, n=n,
                        file=out.name, welcome=wlp.name, bytes=b))
        print('%-10s %-26s n=%d  %6.1f KB  welcome %5.1f KB'
              % (key, name, n, b / 1024, wlp.stat().st_size / 1024))
    (SRC / 'groups.json').write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\ngroup total: %.2f MB' % (total / 1048576))


if __name__ == '__main__':
    main()