# -*- coding: utf-8 -*-
"""把 vendor 依赖 + app.js 内嵌进 template.html，产出完全离线的单文件 MDReader.html"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE.parent / "dist"
VENDOR = HERE / "vendor"

VENDORS = [
    ("marked.min.js", "marked.js v15"),
    ("hljs.min.js", "highlight.js v11"),
    ("mermaid.min.js", "mermaid v10"),
]


def inline_js(text: str) -> str:
    # 防止 vendor 代码中出现 </script> 提前闭合 script 标签
    return text.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")


def main():
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    app = (HERE / "app.js").read_text(encoding="utf-8")

    parts = []
    for filename, label in VENDORS:
        src = (VENDOR / filename).read_text(encoding="utf-8")
        parts.append("/* ==== %s (offline, MIT/Apache) ==== */\n<script>%s</script>" % (label, inline_js(src)))
    vendor_html = "\n".join(parts)
    app_html = "<script>%s</script>" % inline_js(app)

    out = tpl.replace("<!--__VENDOR_JS__-->", vendor_html).replace("<!--__APP_JS__-->", app_html)
    DIST.mkdir(parents=True, exist_ok=True)
    target = DIST / "MDReader.html"
    target.write_text(out, encoding="utf-8", newline="\n")

    print("built: %s" % target)
    print("size : %.2f MB" % (target.stat().st_size / 1024 / 1024))
    for filename, _ in VENDORS:
        print("  + %-18s %7.1f KB" % (filename, (VENDOR / filename).stat().st_size / 1024))
    print("  + app.js           %7.1f KB" % ((HERE / "app.js").stat().st_size / 1024))


if __name__ == "__main__":
    main()
