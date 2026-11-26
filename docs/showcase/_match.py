"""纯 Python 模板匹配：把用户截图按亮度剖面在全页截图中定位。
无 numpy，用 1D 行/列剖面 + 多尺度，足够定位区块。"""
import sys, json
from PIL import Image

TPL = r'C:\Users\likui\.workbuddy\clipboard-images\clipboard-2026-11-18T01-42-18-987Z-a7126c6d.png'
PAGE = sys.argv[1]

tpl = Image.open(TPL).convert('L')
page = Image.open(PAGE).convert('L')
TW, TH = tpl.size
PW, PH = page.size
print('template %dx%d   page %dx%d' % (TW, TH, PW, PH))

def profile_row(im, step=1):
    w, h = im.size
    px = im.load()
    out = []
    for y in range(0, h, step):
        s = 0; n = 0
        for x in range(0, w, max(1, w // 200)):
            s += px[x, y]; n += 1
        out.append(s / n)
    return out

def profile_col(im, y0, y1):
    w, h = im.size
    px = im.load()
    out = []
    for x in range(w):
        s = 0; n = 0
        for y in range(max(0, y0), min(h, y1), max(1, (y1 - y0) // 200 or 1)):
            s += px[x, y]; n += 1
        out.append(s / n if n else 0)
    return out

def znorm(v):
    m = sum(v) / len(v)
    var = sum((a - m) ** 2 for a in v) / len(v)
    sd = var ** 0.5 or 1
    return [(a - m) / sd for a in v]

trow = znorm(profile_row(tpl))
prow = profile_row(page)

# 1) 行剖面滑动：找最佳 y（按尺度和步长粗搜）
best = []
for scale in [1.0, 0.9, 0.8, 0.75, 0.67, 1.1, 1.2]:
    th = int(TH * scale)
    if th >= PH: continue
    t = trow
    # 重采样模板行剖面到 th 长度
    t2 = [t[min(len(t) - 1, int(i * len(t) / th))] for i in range(th)]
    for y0 in range(0, PH - th + 1):
        win = prow[y0:y0 + th]
        s = 0
        for a, b in zip(t2, win):
            d = a - b
            s += d * d
        best.append((s / th, y0, scale))
best.sort()
print('\n行剖面最佳匹配 TOP6:')
for score, y0, sc in best[:6]:
    print('  y=%4d scale=%.2f  sse=%.3f' % (y0, sc, score))

# 2) 用最佳候选做列剖面验证
seen = []
for score, y0, sc in best[:6]:
    if any(abs(y0 - s) < 25 and abs(sc - c) < .05 for s, c in seen): continue
    seen.append((y0, sc))
    th = int(TH * sc); tw = int(TW * sc)
    tcol = profile_col(tpl, 0, TH)
    t2 = [tcol[min(len(tcol) - 1, int(i * len(tcol) / tw))] for i in range(tw)]
    t2 = znorm(t2)
    pcol = znorm(profile_col(page, y0, y0 + th))
    bs, bx = 1e9, 0
    for x0 in range(0, PW - tw + 1):
        s = 0
        for a, b in zip(t2, pcol[x0:x0 + tw]):
            d = a - b; s += d * d
        if s / tw < bs: bs, bx = s / tw, x0
    print('  → y=%4d x=%4d scale=%.2f  列sse=%.3f   (区域 %dx%d)' % (y0, bx, sc, bs, tw, th))