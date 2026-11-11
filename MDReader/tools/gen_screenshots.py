# -*- coding: utf-8 -*-
"""把 tools/shot-cdp.mjs 截出的 _shots/*.png 压成轮播用 JPEG。

完整链路：
  1) python src/build.py                 先构建（截图基于当时 dist）
  2) node tools/shot-cdp.mjs             无头 Edge + CDP 真实等待，截 6 个界面到 _shots/*.png
  3) python tools/gen_screenshots.py     压缩成 src/assets/screenshots/*.jpg
  4) python src/build.py                 再次构建，把 6 张 JPEG 内嵌进单文件 HTML
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "_shots"
OUT = ROOT / "src" / "assets" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

# 只处理 6 张正式截图，避免把 verify-welcome.png 等验证产物误转成轮播素材
NAMES = ["01-welcome", "02-read", "03-chart", "04-blockedit", "05-paper", "06-dark"]
pngs = [TMP / (n + ".png") for n in NAMES]
missing = [p.name for p in pngs if not p.exists()]
if missing:
    raise SystemExit("缺少截图：%s，请先执行：node tools/shot-cdp.mjs" % ", ".join(missing))

for p in pngs:
    im = Image.open(p).convert("RGB")
    if im.width > 960:
        im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
    jpg = OUT / (p.stem + ".jpg")
    im.save(jpg, "JPEG", quality=82, optimize=True)
    print("  %-18s %6.1f KB  %dx%d" % (jpg.name, jpg.stat().st_size / 1024, im.width, im.height))
print("output ->", OUT)
