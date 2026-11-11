# -*- coding: utf-8 -*-
"""清理测试产物并打包成便携版 zip（dist 运行文件 + src 完整源码）"""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST, SRC = ROOT / "dist", ROOT / "src"
OUT = ROOT.parent / "MDReader-Windows11便携版.zip"

# 打包前移除运行时产生的临时数据（_autoload.js 会含用户文档内容，绝不能进包）
for f in DIST.glob("_*"):
    if f.is_file():
        f.unlink()
        print("clean:", f.name)

# 清理测试产物：Edge 浏览器 profile 目录（.edge* / .e13* / .es* / .esk / .egeo / .eshot …）
# 以及提取附件样式时产生的临时文件（_att*.css / _att.png / _shot_*.png / _v*.py / _v*.html …）
TEST_DIR_PATTERNS = (".edge*", ".e[0-9]*", ".es*", ".sk*", ".geo*", ".shot*")
# src/ 下所有以 _ 开头的文件都是临时的验证 / 提取脚本（正式源码无此类命名），
# 一律清掉，避免把测试代码打进交付包。
for f in SRC.glob("_*"):
    if f.is_file():
        f.unlink()
        print("clean file:", f.name)

SKIP_SUFFIX = {".pyc"}
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for base, prefix in ((DIST, "dist"), (SRC, "src")):
        for f in sorted(base.rglob("*")):
            if not f.is_file() or f.suffix in SKIP_SUFFIX or "__pycache__" in f.parts:
                continue
            z.write(f, "MDReader/" + prefix + "/" + f.relative_to(base).as_posix())

print("packed:", OUT)
print("size  : %.2f MB" % (OUT.stat().st_size / 1024 / 1024))
with zipfile.ZipFile(OUT) as z:
    for n in z.namelist():
        print("  ", n)
