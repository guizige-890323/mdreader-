# -*- coding: utf-8 -*-
"""清理测试产物并打包成便携版 zip（dist 运行文件 + src 完整源码）

清洁策略（不靠猜测目录名，避免每换一批测试脚本就漏一次）：
  1. 隐藏目录（以 . 开头）一律视为浏览器 profile / 缓存 —— 主动删除，打包时也跳过
  2. 以 _ 开头的文件一律视为临时注入 / 验证脚本 —— 主动删除，打包时也跳过
  3. __pycache__ / *.pyc 跳过
"""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST, SRC = ROOT / "dist", ROOT / "src"
OUT = ROOT.parent / "MDReader-Windows11便携版.zip"


def clean(base):
    for d in sorted(base.iterdir()):
        if d.is_dir() and d.name.startswith(".") and d.name != ".git":
            shutil.rmtree(d, ignore_errors=True)
            print("clean dir :", d.name)
    for f in sorted(base.iterdir()):
        if f.is_file() and f.name.startswith("_"):
            # _autoload.js 会含用户文档内容，绝不能进包
            f.unlink()
            print("clean file:", f.name)


for base in (DIST, SRC):
    clean(base)

SKIP_SUFFIX = {".pyc"}
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for base, prefix in ((DIST, "dist"), (SRC, "src")):
        for f in sorted(base.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(base)
            if (any(p.startswith(".") for p in rel.parts)
                    or rel.name.startswith("_")
                    or f.suffix in SKIP_SUFFIX
                    or "__pycache__" in rel.parts):
                continue
            z.write(f, "MDReader/" + prefix + "/" + rel.as_posix())

print("packed:", OUT)
print("size  : %.2f MB" % (OUT.stat().st_size / 1024 / 1024))
with zipfile.ZipFile(OUT) as z:
    for n in z.namelist():
        print("  ", n)
