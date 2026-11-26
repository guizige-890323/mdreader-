# -*- coding: utf-8 -*-
"""把工作区 MDReader（v1.7 最新）同步进开源仓库，按白名单收边界。

不复制：node_modules / release* / __pycache__ / _* 临时文件 / _shots / probe-* 一次性脚本
"""
import shutil
import sys
from pathlib import Path

W = Path(r"D:/WorkBuddy/2026-11-08-21-28-36/MDReader")
R = Path(r"F:/豆包工作空间/github开源项目/MD Reader/MDReader")

SKIP_DIR = {"__pycache__", "node_modules", ".epwa", ".git", "_shots"}
SKIP_NAME_PREFIX = ("_",)
SKIP_SUFFIX = {".pyc", ".log"}


def ok(rel: Path) -> bool:
    if any(p in SKIP_DIR for p in rel.parts):
        return False
    if any(p.startswith(SKIP_NAME_PREFIX) for p in rel.parts):
        return False
    if rel.suffix.lower() in SKIP_SUFFIX:
        return False
    if any(p.startswith("release") for p in rel.parts):
        return False
    return True


def copy_tree(sub: str, extra_filter=None):
    src_root = W / sub
    dst_root = R / sub
    if not src_root.is_dir():
        print("  ! missing", sub)
        return 0, 0
    n = 0
    for f in sorted(src_root.rglob("*")):
        if not f.is_file():
            continue
        rel = f.relative_to(src_root)
        if not ok(rel):
            continue
        if extra_filter and not extra_filter(rel):
            continue
        dst = dst_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dst)
        n += 1
    return n, sum(p.stat().st_size for p in dst_root.rglob("*") if p.is_file()) if dst_root.exists() else 0


# desktop 收敛：只留运行必需 + 构建资源 + 可复现脚本
def desktop_filter(rel: Path) -> bool:
    if rel.parts[0] == "scripts":
        return rel.suffix.lower() in {".py", ".cjs", ".md", ".sh"}
    if rel.parts[0] == "build":
        return rel.suffix.lower() in {".ico", ".png", ".bmp", ".nsh", ".exe", ".json"}
    if rel.parts[0] == "app":
        return True
    if rel.parts[0] == "brand-source":
        return rel.suffix.lower() in {".png", ".svg", ".md"}
    return len(rel.parts) == 1


# tools 收敛：留回归与素材生产，剔除 probe-* / shot-cr* 一次性脚本
def tools_filter(rel: Path) -> bool:
    name = rel.name
    if rel.parts[0] == "_fixtures":
        return True
    if name.startswith("probe-"):
        return False
    if name.startswith("shot-cr"):
        return False
    if name.startswith("shot-focus") or name.startswith("shot-pie") or name.startswith("shot-pm") \
       or name.startswith("shot-export") or name.startswith("shot-flow-edit") or name.startswith("shot-toolbar") \
       or name.startswith("shot-showcase-page") or name.startswith("shot-showcase.") or name.startswith("shot-cdp"):
        return False
    return rel.suffix.lower() in {".py", ".cjs", ".mjs", ".md", ".txt"}


def main():
    if not W.is_dir():
        sys.exit("source missing: %s" % W)
    plan = [
        ("src", None),
        ("dist", None),
        ("dist-intl", None),
        ("ios", None),
        ("desktop", desktop_filter),
        ("tools", tools_filter),
    ]
    total = 0
    for sub, flt in plan:
        n, size = copy_tree(sub, flt)
        total += n
        print("  %-10s %4d files  %6.1f MB" % (sub, n, size / 1024 / 1024))
    print("total copied:", total)


if __name__ == "__main__":
    main()
