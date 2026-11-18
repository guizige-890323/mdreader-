# -*- coding: utf-8 -*-
"""打包国际版便携包：dist-intl 运行文件 + src 完整源码 + 英文 README。

与 src/pack.py 保持同样的清洁策略（跳过隐藏目录、_ 前缀临时文件、__pycache__），
区别只在于运行目录用 dist-intl（英文示例文档 = Sample Document.md），
并多放一份 MDReader-International/README.txt 说明如何回到中文。
"""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist-intl"
SRC = ROOT / "src"
import json
try:
    _VER = json.loads((ROOT / "desktop" / "package.json").read_text(encoding="utf-8"))["version"]
except Exception:
    _VER = "0"
OUT_DIR = ROOT.parent / "发布包"
OUT = OUT_DIR / ("MDReader-International-v%s.zip" % _VER)
TOP = "MDReader"

README = """MD Reader - International Edition (English default)

Open dist/MDReader.html in a browser, or double-click the launcher.
The UI starts in English. Switch back to Simplified Chinese in
Settings -> General -> Language. Your own .md files are never translated.

What's new in this build
------------------------
- Create MD: a new "Create MD" button opens a blank document, or one-click
  pastes Markdown copied from an AI chat (hover the button to see a preview).
  Ctrl+S saves it as a real .md file.
- Charts are redrawn after the ECharts gallery, all six types:
  auto (picks by data shape), bar (gradient + rounded caps + value labels),
  line (smooth curve + hollow markers), trend (gradient area),
  pie (rounded DONUT: each sector spans EXACTLY value/total of 360 degrees --
       NEVER an equal-angle split; 33.0% -> 118.8 deg, 0.3% -> 1.08 deg;
       the share legend on the right matches the arcs),
  rose (Nightingale: equal angles, radius/area encoding, rounded sectors,
       center total, external same-colour leader labels).
- Charts, chart type and chosen type survive theme/font changes and tab
  switches per document.

PER-DIAGRAM STRUCTURE + UNIFIED DOCUMENT STYLE (new): the structure picker now sits
on EACH flowchart's own toolbar (top-right), next to the chart-type buttons, and is
remembered per diagram (by source hash). The global setting is only a default; picking
"Auto" on a diagram means "follow the global default". Switching structure replays all
visual edits (text / colour / added / removed nodes) and re-lays out node coordinates.
Chart colours are no longer tied to the table theme: four DOCUMENT STYLES (mono / tech /
gov / cute) now drive section backgrounds, card badges, chart palette, flowchart accent
colours AND code syntax highlighting together, with readable variants derived for light /
dark / sepia. Export HTML/SVG freezes these 23 CSS variables inline so offline files
match the screen exactly.

Flowchart STRUCTURE (new): Settings > Flowchart Structure picks how the diagram is laid out,
independently of its colour theme. 25 looks = 5 structures x 5 styles.
  - Auto        adaptive pick (converging -> pipeline, deep/bushy -> mind map,
                shallow tree -> org chart; explicit RL/BT keeps the pipeline direction)
  - Pipeline    layered stages, one colour band per stage, numbered badges, bezier spine
  - Mind map    root centred, children radiate by subtree weight, no numbering
  - Org chart   top-down equal-width boxes joined by orthogonal elbow connectors
  - Timeline    horizontal axis, cards alternating above and below
Flowchart STYLE: Classic / Minimal / Business / Vivid / Neon (Settings > Flowchart Style).
  Styles change colour and strokes only; they never redraw the layout.
Flowchart VISUAL EDITING (new): click "Edit" on the flowchart toolbar.
  - Drag any node; connectors follow with both endpoints anchored to their nodes
    (bezier, elbow and polyline shapes are preserved, no cumulative drift).
  - Double-click or use the property panel to edit text (up to 4 lines), pick one of
    8 accent colours, reset position, or delete a node (its edges go with it).
  - Add a node, link two nodes by clicking them in turn, undo (30 steps), reset all.
  - Edits are stored in two layers: text/colour/added/removed by document,
    node coordinates by document + structure. Switching structure, theme or font
    size, and reopening the same file all replay the edits.
  - EVERY export uses the LAST EDITED state: Download SVG, Copy source (regenerated
    Mermaid keeps shapes and edge labels), Export HTML, Export Word (the rasterised
    picture is the edited drawing) and Print / Save as PDF. Only the editor UI,
    edit buttons and selection outlines are stripped - never a re-render.
ASCII / BOX-DRAWING ARCHITECTURE DIAGRAMS (new): functional architecture diagrams
drawn with Unicode box-drawing characters (┌─┐│└┘), pasted in prose or a fenced code
block, are recognised by a deterministic pure-JS algorithm -- NO AI, NO model, NO network.
It expands the text into a UAX #11 display-column grid (CJK/fullwidth/emoji = 2 columns),
clusters box bands and vertical slots with ±3 drift tolerance, extracts in-box labels and
inter-layer link evidence, and rebuilds a {nodes, edges} semantic graph rendered by MD FLOW.
Mixed CJK/ASCII, missing top edges, drifting borders, fan-out/merge and left-side external
inputs are tolerated. The verbatim source stays in a collapsible panel hidden on export.
The result is a draggable, editable, exportable vector flowchart -- not a dead bitmap.
Word export scales charts and flowcharts to the A4 text area; long flowchart nodes go vertical.
Export formats: Word (.doc) / HTML / PDF / Markdown.

Built with: python src/gen-demo.py && python src/build.py --edition global --out dist-intl/MDReader.html
"""

SKIP_SUFFIX = {".pyc"}

# dist-intl 只放构建产物（MDReader.html + 英文示例），
# 其余运行所需文件（assets / 启动脚本 / 使用说明）从国内版 dist 原样补齐，
# 保证两个便携包「除示例文档与 HTML 本体外完全等价」。
SHARED = ["assets", "open-with.ps1", "使用说明.md", "启动 MDReader.bat", "用此程序打开MD.bat"]


def skip(rel):
    return (any(p.startswith(".") for p in rel.parts)
            or rel.name.startswith("_")
            or rel.suffix in SKIP_SUFFIX
            or "__pycache__" in rel.parts)


OUT_DIR.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for base, prefix in ((DIST, "dist"), (SRC, "src")):
        for f in sorted(base.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(base)
            if skip(rel):
                continue
            z.write(f, TOP + "/" + prefix + "/" + rel.as_posix())
    # 补齐 dist-intl 里没有的公共运行文件
    for name in SHARED:
        src = ROOT / "dist" / name
        if src.is_dir():
            for f in sorted(src.rglob("*")):
                if f.is_file() and not skip(f.relative_to(src)):
                    z.write(f, TOP + "/dist/" + f.relative_to(ROOT / "dist").as_posix())
        elif src.is_file():
            z.write(src, TOP + "/dist/" + name)
    z.writestr("MDReader-International/README.txt", README)

print("packed:", OUT)
print("size  : %.2f MB" % (OUT.stat().st_size / 1024 / 1024))
with zipfile.ZipFile(OUT) as z:
    names = z.namelist()
print("files :", len(names))
for n in names:
    if n.startswith("MDReader/dist/") or "README" in n:
        print("  ", n)