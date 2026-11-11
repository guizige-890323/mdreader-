# -*- coding: utf-8 -*-
"""把 vendor 依赖 + app.js + 两版品牌 logo 内嵌进 template.html，产出完全离线的单文件 MDReader.html"""
import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE.parent / "dist"
VENDOR = HERE / "vendor"

VENDORS = [
    ("marked.min.js", "marked.js v15"),
    ("hljs.min.js", "highlight.js v11"),
    ("mermaid.min.js", "mermaid v10"),
]

# 两版品牌图标：light（浅色/护眼主题用）与 dark（深色主题用），由 desktop/scripts/make-icons.py 生成
# 三枚换肤图标：同款 MD LOGO 的浅色/深色/护眼配色，由 tools/gen_skin_icons.py 生成
# 另含公众号二维码 brand-qr.jpg（欢迎屏开发者联系区，build 时 base64 内嵌保持单文件离线）
BRAND_TOKENS = {
    "__BRAND_LIGHT_DATA__": HERE / "brand-light.png",
    "__BRAND_DARK_DATA__": HERE / "brand-dark.png",
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


def main():
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    app = (HERE / "app.js").read_text(encoding="utf-8")
    flow = (HERE / "mermaid-flow.js").read_text(encoding="utf-8")
    textflow = (HERE / "text-flow.js").read_text(encoding="utf-8")

    parts = []
    for filename, label in VENDORS:
        src = (VENDOR / filename).read_text(encoding="utf-8")
        parts.append("/* ==== %s (offline, MIT/Apache) ==== */\n<script>%s</script>" % (label, inline_js(src)))
    vendor_html = "\n".join(parts)
    # 载入顺序：MDFlow → MDTextFlow → app.js（后者渲染时会调用前两者）
    flow_html = "<script>%s</script>" % inline_js(flow)
    textflow_html = "<script>%s</script>" % inline_js(textflow)
    app_html = "<script>%s</script>" % inline_js(app)

    out = tpl.replace("<!--__VENDOR_JS__-->", vendor_html)
    out = out.replace("<!--__APP_JS__-->", flow_html + "\n" + textflow_html + "\n" + app_html)
    out = inline_brand(out)
    DIST.mkdir(parents=True, exist_ok=True)
    target = DIST / "MDReader.html"
    target.write_text(out, encoding="utf-8", newline="\n")

    print("built: %s" % target)
    print("size : %.2f MB" % (target.stat().st_size / 1024 / 1024))
    for filename, _ in VENDORS:
        print("  + %-18s %7.1f KB" % (filename, (VENDOR / filename).stat().st_size / 1024))
    print("  + mermaid-flow.js  %7.1f KB" % ((HERE / "mermaid-flow.js").stat().st_size / 1024))
    print("  + text-flow.js     %7.1f KB" % ((HERE / "text-flow.js").stat().st_size / 1024))
    print("  + app.js           %7.1f KB" % ((HERE / "app.js").stat().st_size / 1024))
    for f in BRAND_TOKENS.values():
        print("  + %-18s %7.1f KB" % (f.name, f.stat().st_size / 1024))


if __name__ == "__main__":
    main()
