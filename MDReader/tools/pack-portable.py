# -*- coding: utf-8 -*-
"""打包 Windows 便携版 zip。

为什么要这个脚本：便携版此前是手工压缩的，曾经漏掉
  启动 MDReader.bat / 用此程序打开MD.bat / open-with.ps1 / assets/
导致用户按「使用说明.md」找不到启动器。凡是手工步骤都会漏，所以落成脚本。

产出：<仓库根>/../发布包/MDReader-便携版-v<版本>.zip
内容：dist/ 下全部运行文件（扁平结构，解压即用），不含源码与临时文件。
"""
import json
import re
import zipfile
from pathlib import Path


def _utf8_stdout():
    """Windows CI 的 stdout 是 cp1252，打印中文路径（如 dist/示例文档.md）会
    UnicodeEncodeError 直接让构建挂掉。脚本入口统一把输出流切到 UTF-8。"""
    import sys
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


_utf8_stdout()

HERE = Path(__file__).resolve().parent          # MDReader/tools
ROOT = HERE.parent                              # MDReader/
DIST = ROOT / "dist"
OUT_DIR = ROOT.parent / "发布包"

# 便携版必须齐备的文件，缺一个就拒绝打包（宁可报错，也不要出一个残缺的包）
REQUIRED = [
    "MDReader.html",
    "启动 MDReader.bat",
    "用此程序打开MD.bat",
    "open-with.ps1",
    "示例文档.md",
    "使用说明.md",
]

SKIP_DIRS = {"__pycache__", ".git"}


def read_version() -> str:
    pkg = ROOT / "desktop" / "package.json"
    text = pkg.read_text(encoding="utf-8")
    m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    if not m:
        raise SystemExit("无法从 desktop/package.json 读取版本号")
    return m.group(1)


def main() -> None:
    version = read_version()
    missing = [n for n in REQUIRED if not (DIST / n).is_file()]
    if missing:
        raise SystemExit(
            "dist/ 缺少便携版必需文件：\n  " + "\n  ".join(missing)
            + "\n请先把这些文件放进 dist/ 再打包。"
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / ("MDReader-便携版-v%s.zip" % version)

    files = []
    for f in sorted(DIST.rglob("*")):
        if not f.is_file():
            continue
        rel = f.relative_to(DIST)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
            continue
        if rel.name.startswith("_") or f.suffix == ".pyc":
            continue
        files.append((f, rel.as_posix()))

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for src, arc in files:
            z.write(src, arc)

    size_mb = target.stat().st_size / 1024 / 1024
    print("packed: %s" % target)
    print("size  : %.2f MB（%d 个文件）" % (size_mb, len(files)))
    for _, arc in files:
        print("  +", arc)


if __name__ == "__main__":
    main()
