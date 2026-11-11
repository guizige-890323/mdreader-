# -*- coding: utf-8 -*-
"""按 MD 软件 logo 设计语言，批量生成产品功能图标。

设计语言（与品牌 logo 一致）：
  - 圆角方块 tile（圆角半径 ~21%）
  - 单一主色 + 反色字形，两档统一描边/填充
  - 字形粗圆、端部圆润、留白 ~20%，风格统一
  - 语义化：每个图标对应一个明确功能

产物：
  src/assets/feature-icons/<name>.light.svg   白底黑字
  src/assets/feature-icons/<name>.dark.svg    黑底白字
  src/assets/feature-icons/preview.html        总览预览（两组并列）
  src/assets/feature-icons/inline-themeable.txt  可直接内联到 HTML 的主题自适应版（CSS 变量）
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent          # tools
ROOT = HERE.parent                              # MDReader
OUT = ROOT / "src" / "assets" / "feature-icons"
OUT.mkdir(parents=True, exist_ok=True)

# 两档配色（与品牌 logo 一致：近黑深蓝底 / 白字）
LIGHT = dict(tile="#FFFFFF", border="#DCE1E8", glyph="#161A21")
DARK = dict(tile="#161A21", border="none", glyph="#FFFFFF")

# ---- 各功能图标的内层 SVG（{G}=字形色, {T}=tile 反色，用于挖空/刻面）----
GLYPHS = {
    "table": r"""
  <rect x="14" y="9" width="4.6" height="7" rx="1.6" fill="{G}"/>
  <rect x="21" y="6" width="4.6" height="10" rx="1.6" fill="{G}"/>
  <rect x="28" y="11" width="4.6" height="5" rx="1.6" fill="{G}"/>
  <rect x="12" y="20" width="24" height="15" rx="3" fill="none" stroke="{G}" stroke-width="3"/>
  <line x1="20" y1="20" x2="20" y2="35" stroke="{G}" stroke-width="2.4"/>
  <line x1="28" y1="20" x2="28" y2="35" stroke="{G}" stroke-width="2.4"/>
  <line x1="12" y1="27.5" x2="36" y2="27.5" stroke="{G}" stroke-width="2.4"/>
""",
    "paper": r"""
  <rect x="13" y="8" width="22" height="32" rx="3.5" fill="none" stroke="{G}" stroke-width="3"/>
  <line x1="22" y1="16" x2="31" y2="16" stroke="{G}" stroke-width="2.4"/>
  <line x1="22" y1="22" x2="31" y2="22" stroke="{G}" stroke-width="2.4"/>
  <line x1="22" y1="28" x2="31" y2="28" stroke="{G}" stroke-width="2.4"/>
  <line x1="22" y1="34" x2="31" y2="34" stroke="{G}" stroke-width="2.4"/>
  <line x1="20" y1="11" x2="20" y2="37" stroke="{G}" stroke-width="2.6"/>
  <line x1="20" y1="15" x2="24" y2="15" stroke="{G}" stroke-width="2.2"/>
  <line x1="20" y1="21" x2="24" y2="21" stroke="{G}" stroke-width="2.2"/>
  <line x1="20" y1="27" x2="24" y2="27" stroke="{G}" stroke-width="2.2"/>
  <line x1="20" y1="33" x2="24" y2="33" stroke="{G}" stroke-width="2.2"/>
""",
    "card": r"""
  <rect x="12" y="9" width="24" height="30" rx="4.5" fill="none" stroke="{G}" stroke-width="3"/>
  <rect x="15" y="12" width="18" height="7" rx="2.5" fill="{G}"/>
  <circle cx="19.5" cy="15.5" r="2" fill="{T}"/>
  <line x1="24" y1="15.5" x2="30" y2="15.5" stroke="{T}" stroke-width="2"/>
  <line x1="16" y1="24" x2="32" y2="24" stroke="{G}" stroke-width="2.4"/>
  <line x1="16" y1="29" x2="32" y2="29" stroke="{G}" stroke-width="2.4"/>
  <line x1="16" y1="34" x2="27" y2="34" stroke="{G}" stroke-width="2.4"/>
""",
    "recent": r"""
  <circle cx="24" cy="24" r="10" fill="none" stroke="{G}" stroke-width="3"/>
  <line x1="24" y1="24" x2="24" y2="16.5" stroke="{G}" stroke-width="3"/>
  <line x1="24" y1="24" x2="30.5" y2="21" stroke="{G}" stroke-width="3"/>
  <path d="M 33.9 14.1 A 14 14 0 1 1 10 24" fill="none" stroke="{G}" stroke-width="3"/>
  <path d="M 10 24 L 14 21.5 M 10 24 L 14 26.5" fill="none" stroke="{G}" stroke-width="3"/>
""",
    "obsidian": r"""
  <path d="M24 9 Q26 9 27.5 11 L37 22 Q39 24 37 26 L27.5 37 Q26 39 24 39 Q22 39 20.5 37 L11 26 Q9 24 11 22 L20.5 11 Q22 9 24 9 Z" fill="{G}"/>
  <line x1="24" y1="9" x2="24" y2="39" stroke="{T}" stroke-width="2"/>
  <line x1="11" y1="24" x2="37" y2="24" stroke="{T}" stroke-width="2"/>
""",
    "library": r"""
  <path d="M 9 17 C 14 13 20 13 24 17 C 28 13 34 13 39 17 L 39 33 C 34 29 28 29 24 33 C 20 29 14 29 9 33 Z" fill="{G}"/>
  <line x1="24" y1="17" x2="24" y2="33" stroke="{T}" stroke-width="2"/>
  <line x1="12" y1="21" x2="21" y2="21" stroke="{T}" stroke-width="1.6"/>
  <line x1="12" y1="25" x2="21" y2="25" stroke="{T}" stroke-width="1.6"/>
  <line x1="27" y1="21" x2="36" y2="21" stroke="{T}" stroke-width="1.6"/>
  <line x1="27" y1="25" x2="36" y2="25" stroke="{T}" stroke-width="1.6"/>
""",
    "blockedit": r"""
  <rect x="10" y="9" width="15" height="22" rx="3" fill="none" stroke="{G}" stroke-width="3"/>
  <line x1="13.5" y1="15" x2="21.5" y2="15" stroke="{G}" stroke-width="2.2"/>
  <line x1="13.5" y1="20" x2="21.5" y2="20" stroke="{G}" stroke-width="2.2"/>
  <line x1="13.5" y1="25" x2="18" y2="25" stroke="{G}" stroke-width="2.2"/>
  <path d="M 36.4 15.6 L 31.2 20.8 L 28.6 27.6 L 35.4 25 L 40.6 19.8 Q 41.8 18.6 40.6 17.2 L 39 15.6 Q 37.6 14.4 36.4 15.6 Z" fill="{G}"/>
  <line x1="10" y1="35.5" x2="24" y2="35.5" stroke="{G}" stroke-width="2.6" stroke-dasharray="0.1 5"/>
""",
    "export3": r"""
  <circle cx="24" cy="21" r="7.2" fill="{G}"/>
  <circle cx="24" cy="21" r="2.6" fill="{T}"/>
  <path d="M 16.6 24.6 L 12 36.5" fill="none" stroke="{G}" stroke-width="3"/>
  <path d="M 31.4 24.6 L 36 36.5" fill="none" stroke="{G}" stroke-width="3"/>
  <path d="M 20 27.8 Q 24 30.8 28 27.8" fill="none" stroke="{G}" stroke-width="3"/>
""",
    "shield": r"""
  <path d="M 24 8 L 36 12.5 L 36 23 C 36 31.5 31 37 24 40 C 17 37 12 31.5 12 23 L 12 12.5 Z" fill="none" stroke="{G}" stroke-width="3"/>
  <path d="M 18 23.5 L 22.5 28 L 30.5 18.5" fill="none" stroke="{G}" stroke-width="3.4"/>
""",
}

NAMES = {
    "table": "表格可视化",
    "paper": "纸张模式",
    "card": "卡片模式",
    "recent": "最近打开",
    "obsidian": "Obsidian 友好",
    "library": "整库浏览",
    "blockedit": "按块编辑",
    "export3": "三格式导出",
    "shield": "纯离线安全",
}


def tile(inner, c):
    sw = "0" if c["border"] in (None, "none") else "1.4"
    border = c["border"] if c["border"] not in (None, "none") else "none"
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">\n'
        '  <defs><filter id="ds" x="-30%" y="-30%" width="160%" height="160%">'
        '<feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#0b0e14" flood-opacity="0.20"/></filter></defs>\n'
        f'  <rect x="3" y="3" width="42" height="42" rx="10" ry="10" fill="{c["tile"]}" '
        f'stroke="{border}" stroke-width="{sw}" filter="url(#ds)"/>\n'
        f'  <g fill="{c["glyph"]}" stroke="{c["glyph"]}" stroke-width="3.2" '
        'stroke-linecap="round" stroke-linejoin="round">\n'
        f'{inner}\n'
        '  </g>\n</svg>\n'
    )


def themeable(name, inner):
    """内联到 HTML 的自适应版：字形用 currentColor（= --fi-glyph），挖空用 .fi-cut（= --fi-tile）。"""
    s = inner.format(G="currentColor", T="__CUT__")
    s = s.replace('fill="__CUT__"', 'class="fi-cut"').replace('stroke="__CUT__"', 'class="fi-cut"')
    return (
        f'<svg class="fi-svg" viewBox="0 0 48 48" aria-hidden="true">'
        f'<rect class="fi-tile" x="3" y="3" width="42" height="42" rx="10" ry="10"/>'
        f'<g class="fi-glyph" fill="currentColor" stroke="currentColor" '
        f'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">'
        f'{s}'
        f'</g></svg>'
    )


# 1) 两组固定配色 SVG
for name, inner in GLYPHS.items():
    light = tile(inner.format(G=LIGHT["glyph"], T=LIGHT["tile"]), LIGHT)
    dark = tile(inner.format(G=DARK["glyph"], T=DARK["tile"]), DARK)
    (OUT / f"{name}.light.svg").write_text(light, encoding="utf-8")
    (OUT / f"{name}.dark.svg").write_text(dark, encoding="utf-8")

# 2) 主题自适应内联片段（供 template.html 使用）
snippets = {}
for name, inner in GLYPHS.items():
    snippets[name] = themeable(name, inner)
(OUT / "inline-themeable.txt").write_text(
    "\n\n".join(f"<!-- {NAMES[n]} -->\n{snippets[n]}" for n, s in snippets.items()),
    encoding="utf-8",
)

# 3) 总览预览
cells = []
order = ["table", "paper", "card", "recent", "obsidian", "library", "blockedit", "export3", "shield"]
for name in order:
    cells.append(
        f'    <div class="cell">\n'
        f'      <div class="row"><img src="{name}.light.svg" alt="{NAMES[name]}"><img src="{name}.dark.svg" alt=""></div>\n'
        f'      <div class="name">{NAMES[name]}</div>\n'
        f'      <div class="file">{name}.light.svg / {name}.dark.svg</div>\n'
        f'    </div>'
    )
preview = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>MD Reader · 功能图标总览</title>
<style>
  body{{font-family:"Microsoft YaHei",system-ui,sans-serif;background:#eceff3;margin:0;padding:32px;color:#1f2329}}
  h1{{font-size:20px;margin:0 0 4px}}
  .sub{{color:#6b7480;margin:0 0 24px;font-size:13px}}
  .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;max-width:1180px}}
  .cell{{background:#fff;border:1px solid #e3e7ee;border-radius:14px;padding:18px;text-align:center}}
  .row{{display:flex;gap:14px;justify-content:center;align-items:center;padding:6px 0 12px}}
  .row img{{width:72px;height:72px}}
  .name{{font-weight:600;font-size:14px}}
  .file{{color:#8a929c;font-size:11px;margin-top:3px;font-family:Consolas,monospace}}
</style></head><body>
  <h1>MD Reader · 产品功能图标</h1>
  <p class="sub">统一设计语言：圆角方块 + 粗圆字形 · 左=白底黑字，右=黑底白字</p>
  <div class="grid">
{chr(10).join(cells)}
  </div>
</body></html>
"""
(OUT / "preview.html").write_text(preview, encoding="utf-8")

print("generated:", len(GLYPHS), "icons x 2 treatments")
for n in order:
    print("  -", n, NAMES[n])
print("output ->", OUT)
