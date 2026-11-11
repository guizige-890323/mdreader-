# -*- coding: utf-8 -*-
"""把便携版 dist/ 的成品同步进桌面壳的 app/。
桌面版与便携版共用同一份渲染产物，避免两套代码分叉。"""
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent          # desktop/
ROOT = HERE.parent                                     # MDReader/
DIST = ROOT / "dist"
APP = HERE / "app"

APP.mkdir(parents=True, exist_ok=True)

FILES = ["MDReader.html", "示例文档.md", "使用说明.md"]
for name in FILES:
    src, dst = DIST / name, APP / name
    if not src.exists():
        raise SystemExit("缺少便携版文件: %s" % src)
    shutil.copy2(src, dst)
    print("sync: %-16s %8.1f KB" % (name, dst.stat().st_size / 1024))

assets_src, assets_dst = DIST / "assets", APP / "assets"
if assets_src.is_dir():
    if assets_dst.exists():
        shutil.rmtree(assets_dst)
    shutil.copytree(assets_src, assets_dst)
    for f in sorted(assets_dst.rglob("*")):
        if f.is_file():
            print("sync: assets/%-8s %8.1f KB" % (f.name, f.stat().st_size / 1024))

print("done -> %s" % APP)