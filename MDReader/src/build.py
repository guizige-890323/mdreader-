# -*- coding: utf-8 -*-
"""把 vendor 依赖 + i18n 语言包 + app.js + 品牌图内嵌进 template.html，产出完全离线的单文件 MDReader.html

版本默认值（国际化）：
  MDREADER_EDITION=domestic（默认）→ 界面默认简体中文
  MDREADER_EDITION=global          → 界面默认 English
  MDREADER_DEFAULT_LANG=zh-CN|en|auto 可直接指定，优先级更高
  --out <路径> 可把某个版本单独构建到别的目录，例如 dist-intl/MDReader.html
"""
import argparse
import base64
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE.parent / "dist"
VENDOR = HERE / "vendor"

VENDORS = [
    ("marked.min.js", "marked.js v15"),
    ("hljs.min.js", "highlight.js v11"),
    ("mermaid.min.js", "mermaid v10"),
]

# 两组品牌图标 × 明/暗两版 = 4 张 128px PNG，由 desktop/scripts/make-icons.py 生成：
#   minimal 极简（纯黑白） / cartoon 卡通（黑白 + 红耳机 + 蓝眼睛，默认组）
#   light = 黑底白 MD，用于浅色 / 护眼主题；dark = 白底黑 MD，用于深色主题
# 三枚换肤图标：同款 MD LOGO 的浅色/深色/护眼配色，由 tools/gen_skin_icons.py 生成
# 另含公众号二维码 brand-qr.jpg（欢迎屏开发者联系区，build 时 base64 内嵌保持单文件离线）
BRAND_TOKENS = {
    "__BRAND_MIN_LIGHT_DATA__": HERE / "brand-minimal-light.png",
    "__BRAND_MIN_DARK_DATA__": HERE / "brand-minimal-dark.png",
    "__BRAND_CART_LIGHT_DATA__": HERE / "brand-cartoon-light.png",
    "__BRAND_CART_DARK_DATA__": HERE / "brand-cartoon-dark.png",
    "__SKIN_LIGHT_DATA__": HERE / "skin-light.png",
    "__SKIN_DARK_DATA__": HERE / "skin-dark.png",
    "__SKIN_SEPIA_DATA__": HERE / "skin-sepia.png",
}
QR_TOKENS = {
    "__BRAND_QR_DATA__": (HERE / "brand-qr.jpg", "image/jpeg"),
}

# 欢迎屏产品口号海报（用户指定图片，深色模式由 CSS filter 自动反转颜色）
SLOGAN_TOKENS = {
    "__SLOGAN_POSTER_DATA__": (HERE / "slogan-poster.jpg", "image/jpeg"),
}


def inline_js(text: str) -> str:
    # 防止 vendor 代码中出现 </script> 提前闭合 script 标签
    return text.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")


def inline_brand(text: str) -> str:
    for token, f in BRAND_TOKENS.items():
        if not f.exists():
            hint = "python tools/gen_skin_icons.py" if f.name.startswith("skin-") else "python desktop/scripts/make-icons.py"
            raise SystemExit("缺少 %s，请先执行：%s" % (f.name, hint))
        uri = "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode("ascii")
        text = text.replace(token, uri)
    for token, (f, mime) in QR_TOKENS.items():
        if not f.exists():
            raise SystemExit("缺少 %s（公众号二维码素材）" % f.name)
        uri = "data:%s;base64," % mime + base64.b64encode(f.read_bytes()).decode("ascii")
        text = text.replace(token, uri)
    for token, (f, mime) in SLOGAN_TOKENS.items():
        if not f.exists():
            raise SystemExit("缺少 %s（口号海报素材）" % f.name)
        uri = "data:%s;base64," % mime + base64.b64encode(f.read_bytes()).decode("ascii")
        text = text.replace(token, uri)
    assert "__BRAND_" not in text, "品牌图标占位符未全部替换"
    assert "__SKIN_" not in text, "换肤图标占位符未全部替换"
    assert "__SLOGAN_" not in text, "口号海报占位符未全部替换"
    return text


def default_lang(edition: str) -> str:
    explicit = os.environ.get("MDREADER_DEFAULT_LANG", "").strip()
    if explicit in ("zh-CN", "en", "auto"):
        return explicit
    return "en" if edition == "global" else "zh-CN"


def main():
    ap = argparse.ArgumentParser(description="Build the offline single-file MDReader.html")
    ap.add_argument("--edition", choices=("domestic", "global"),
                    default=os.environ.get("MDREADER_EDITION", "domestic"),
                    help="domestic = Chinese default, global = English default")
    ap.add_argument("--out", default="", help="output html path (default: dist/MDReader.html)")
    args = ap.parse_args()
    lang = default_lang(args.edition)

    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    app = (HERE / "app.js").read_text(encoding="utf-8")
    i18n = (HERE / "i18n.js").read_text(encoding="utf-8")
    flow = (HERE / "mermaid-flow.js").read_text(encoding="utf-8")
    textflow = (HERE / "text-flow.js").read_text(encoding="utf-8")
    asciidia = (HERE / "ascii-diagram.js").read_text(encoding="utf-8")
    expjs = (HERE / "export-runtime.js").read_text(encoding="utf-8")
    app = app.replace("__DEFAULT_LANG__", lang)
    assert "__DEFAULT_LANG__" not in app, "默认语言占位符未替换"

    parts = []
    for filename, label in VENDORS:
        src = (VENDOR / filename).read_text(encoding="utf-8")
        parts.append("/* ==== %s (offline, MIT/Apache) ==== */\n<script>%s</script>" % (label, inline_js(src)))
    vendor_html = "\n".join(parts)
    # 载入顺序：MDFlow → MDTextFlow → app.js（后者渲染时会调用前两者）
    flow_html = "<script>%s</script>" % inline_js(flow)
    textflow_html = "<script>%s</script>" % inline_js(textflow)
    asciidia_html = "<script>%s</script>" % inline_js(asciidia)
    app_html = "<script>%s</script>" % inline_js(app)
    i18n_html = "<script>%s</script>" % inline_js(i18n)

    out = tpl.replace("<!--__VENDOR_JS__-->", vendor_html)
    # 载入顺序：语言包 → MDFlow → MDTextFlow → MDAscii → app.js
    # （MDAscii 复用 MDFlow.render，必须在 flow_html 之后、app_html 之前）
    out = out.replace("<!--__APP_JS__-->", i18n_html + "\n" + flow_html + "\n" + textflow_html + "\n" + asciidia_html + "\n" + app_html)
    # 导出页运行时：以 text/plain 槽位内嵌，主应用不执行，导出时由 app.js 取用
    out = out.replace("<!--__EXPORT_RUNTIME_JS__-->", inline_js(expjs))
    assert "<!--__EXPORT_RUNTIME_JS__-->" not in out, "导出页运行时占位符未替换"
    out = inline_brand(out)
    target = Path(args.out) if args.out else DIST / "MDReader.html"
    if not target.is_absolute():
        target = HERE.parent / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(out, encoding="utf-8", newline="\n")

    print("built: %s" % target)
    print("edition: %s / default lang: %s" % (args.edition, lang))
    print("size : %.2f MB" % (target.stat().st_size / 1024 / 1024))
    for filename, _ in VENDORS:
        print("  + %-18s %7.1f KB" % (filename, (VENDOR / filename).stat().st_size / 1024))
    print("  + i18n.js          %7.1f KB" % ((HERE / "i18n.js").stat().st_size / 1024))
    print("  + mermaid-flow.js  %7.1f KB" % ((HERE / "mermaid-flow.js").stat().st_size / 1024))
    print("  + text-flow.js     %7.1f KB" % ((HERE / "text-flow.js").stat().st_size / 1024))
    print("  + ascii-diagram.js %7.1f KB" % ((HERE / "ascii-diagram.js").stat().st_size / 1024))
    print("  + app.js           %7.1f KB" % ((HERE / "app.js").stat().st_size / 1024))
    print("  + export-runtime.js %7.1f KB" % ((HERE / "export-runtime.js").stat().st_size / 1024))
    for f in BRAND_TOKENS.values():
        print("  + %-18s %7.1f KB" % (f.name, f.stat().st_size / 1024))


if __name__ == "__main__":
    main()
