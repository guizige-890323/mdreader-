# -*- coding: utf-8 -*-
"""示例文档单一数据源生成器。

源：src/demo/sample.zh.md / sample.en.md（普通 Markdown，可直接编辑预览）
产物：
  1. src/app.js 中的 var DEMO / var DEMO_EN 数组字面量（自动做 JS 字符串转义）
  2. dist/示例文档.md（国内版随包附带的独立示例，与内嵌 DEMO 逐字一致）
  3. dist-intl/Sample Document.md（国际版附带的英文示例）

用法：python src/gen-demo.py
改示例只需改两个 md，然后依次跑 gen-demo.py → build.py → sync-app.py。
"""
import json
import re
import sys
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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP = HERE / "app.js"
ZH = HERE / "demo" / "sample.zh.md"
EN = HERE / "demo" / "sample.en.md"


def js_lines(md_text):
    """把 md 的每一行变成 JS 双引号字符串字面量（json.dumps 已处理引号/反斜杠）。"""
    lines = md_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while lines and lines[-1] == "":
        lines.pop()
    out = []
    for line in lines:
        s = json.dumps(line, ensure_ascii=False)
        # JS 中 U+2028/U+2029 会终止字符串字面量，必须转义
        s = s.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        out.append("    " + s + ",")
    out[-1] = out[-1][:-1]  # 最后一行去掉逗号
    return lines, "[\n" + "\n".join(out) + "\n  ].join('\\n');"


def check(name, md, lines):
    """基础结构校验，避免 fence 不配对 / 表格列数不齐这类低级错误。"""
    fences = [l for l in lines if re.match(r"^\s*(```|~~~)", l)]
    assert len(fences) % 2 == 0, "%s: 代码围栏不成对（%d 个）" % (name, len(fences))
    # 表格块：连续以 | 开头的行，列数（管道符数量）必须一致
    block = []
    for l in lines + [""]:
        if l.strip().startswith("|"):
            block.append(l)
            continue
        if block:
            widths = {b.count("|") for b in block}
            assert len(widths) == 1, "%s: 表格列数不一致 %s" % (name, widths)
            block = []
    h2 = sum(1 for l in lines if l.startswith("## "))
    tables = sum(1 for l in lines if re.match(r"^\|\s*---", l))
    callouts = sum(1 for l in lines if re.match(r"^>\s*\[!", l))
    codes = len(fences) // 2
    print("  %-6s lines=%-4d h2=%-2d tables=%-2d code=%-2d callout=%-2d bytes=%d"
          % (name, len(lines), h2, tables, codes, callouts, len(md.encode("utf-8"))))
    assert h2 >= 8 and tables >= 6 and codes >= 8 and callouts >= 12, "%s: 丰富度不足" % name


def main():
    zh, en = ZH.read_text(encoding="utf-8"), EN.read_text(encoding="utf-8")
    zh_lines, zh_js = js_lines(zh)
    en_lines, en_js = js_lines(en)
    print("sample sources:")
    check("zh", zh, zh_lines)
    check("en", en, en_lines)
    # 英文示例不能含汉字（英文界面 + 国际版的内容纯净度）
    cjk = [c for c in en if "\u4e00" <= c <= "\u9fff"]
    assert not cjk, "英文示例含汉字: %s" % "".join(sorted(set(cjk)))[:40]

    src = APP.read_text(encoding="utf-8")
    pat_zh = re.compile(r"var DEMO = \[.*?\]\.join\('\\n'\);", re.S)
    pat_en = re.compile(r"var DEMO_EN = \[.*?\]\.join\('\\n'\);", re.S)
    assert len(pat_zh.findall(src)) == 1, "app.js 中 var DEMO 定义不唯一"
    assert len(pat_en.findall(src)) == 1, "app.js 中 var DEMO_EN 定义不唯一"
    # 用 lambda 作 replacement：避免生成内容里的 \n 被 re.sub 当成转义序列解析
    src = pat_zh.sub(lambda m: "var DEMO = " + zh_js, src, count=1)
    src = pat_en.sub(lambda m: "var DEMO_EN = " + en_js, src, count=1)
    APP.write_text(src, encoding="utf-8", newline="\n")
    print("updated: app.js (DEMO / DEMO_EN)")

    (ROOT / "dist" / "示例文档.md").write_text(zh, encoding="utf-8", newline="\n")
    print("updated: dist/示例文档.md")
    intl = ROOT / "dist-intl"
    intl.mkdir(exist_ok=True)
    (intl / "Sample Document.md").write_text(en, encoding="utf-8", newline="\n")
    print("updated: dist-intl/Sample Document.md")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("FAILED:", e, file=sys.stderr)
        sys.exit(1)
