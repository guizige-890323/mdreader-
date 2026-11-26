# -*- coding: utf-8 -*-
"""按 _feats.json 生成 i18n 词条（英文），并追加进 src/i18n.js 的 en 字典。
   顺序：先写整句（长 key），确保整串精确匹配优先命中；
   短语（tags）也写全，避免被更短的通用词子串替换成中英混杂。"""
import io, json, re

F = json.load(io.open('tools/_probe/_feats.json', encoding='utf-8'))

PRIO = {
    'P0 · 核心差异化': 'P0 · CORE',
    'P1 · 体验领先': 'P1 · LEADING',
    'P2 · 交付完备': 'P2 · COMPLETE',
}
# 标题：与展示页 title 对齐的英文
TITLE = {
    1: 'Create from Markdown',
    2: 'Tables to six charts',
    3: 'Dual-engine flowcharts',
    4: 'One palette, everywhere',
    5: 'Native wiki links',
    6: 'Exports stay alive',
    7: 'MCP connector',
    8: 'Outline & block editing',
    9: 'Two classic layouts',
    10: 'Recent, re-read from disk',
    11: 'All 15 preferences remembered',
    12: 'Focus mode',
    13: 'Original Soft Light',
    14: 'Kind to your eyes',
    15: 'International editions',
}
DESC = {
1: 'Paste Markdown from your AI, hover "Create MD" and it becomes a fully typeset document. Three fallback channels adapt to the environment, so a single Ctrl+V still works under local file://.',
2: 'Select two columns and a chart appears: bar / line / trend / rounded donut / Nightingale rose, with automatic type selection. Donut sectors accumulate angles by percentage, so you can verify them with a protractor.',
3: 'Mermaid, text arrows and Unicode box-drawing all feed one editable vector diagram; 5 structures × 5 styles = 25 looks.',
4: 'Four document styles do more than recolor the accent: section backgrounds, chart palettes, flowchart accents and code keywords all change together.',
5: 'Obsidian [[links]], ![[embeds]], Callouts, YAML frontmatter and #tags render out of the box; drop in a library of thousands of files and it just reads.',
6: 'Standalone HTML keeps its interactions — switch chart types, copy CSV, sort tables; Word and print PDF keep the layout, and SVG plus Markdown source export in one click.',
7: 'mdlens speaks CLI / HTTP / MCP, so AI tools render Markdown straight into pages; the engine is inlined locally.',
8: 'Click any heading in the sidebar outline to jump; editing is split into independent blocks and only the affected one re-renders, so huge tables stay in order.',
9: 'Card = sectioned panel with dark numbered headers; Paper = drafting sheet with binding marks and serif titles. Colors, fonts and radii switch as a set.',
10: 'Up to 30 entries. Clicking history re-reads the file from disk by absolute path rather than opening a stale snapshot; if the file moved it falls back to the cached body.',
11: 'Language, layout, font size 12–22px, four line heights, skin, soft light, chart auto-expand, flowchart structure and style — in three grouped cards, each explained in plain words.',
12: 'Hide the sidebar and toolbar in one click, leaving only the text and reading progress; the render menu still works, because focus should not mean losing features.',
13: 'Soft light covers the toolbar, sidebar, tab bar, reading area and overlays with none left out; the gradient stays continuous, with no visible patch.',
14: 'Eye care is a low-blue warm beige (card #faf3e0 / paper #fdf3d8 with an amber accent), unmistakably different from plain white.',
15: 'Simplified Chinese / English / follow system. Replacements run longest-key first, and missing entries keep the Chinese original instead of showing undefined.',
}
THEM = {
1: 'Copy → open editor → save → drag into reader',
2: 'A previewer that only gives you a static table',
3: 'Diagramming tools need internet, subscriptions and export dead images',
4: 'One document with three blues and two reds',
5: 'Import the whole vault first, then install a pile of community plugins',
6: 'Exporting means a dead image',
7: 'Reading pipes and backticks inside a chat window',
8: 'The whole file in one textarea; one save and the diff explodes',
9: 'A "skin" that just changes a border color',
10: 'A cached snapshot that still shows the old content',
11: 'A screen of jargon switches nobody understands',
12: 'Collapse the panels and the features vanish too',
13: 'Night mode = darker background, brighter text',
14: 'Any white background with a hint of yellow called eye care',
15: 'Half machine-translated UI that translates your text too',
}
US = {
1: 'Copy, hover, click — a document in three steps',
2: 'Angle equals percentage; the data stands up to scrutiny',
3: 'Pure local recognition — no calls, no waiting, still editable',
4: 'Changing style never produces dark text on dark ground',
5: 'Drop in a folder to build the tree; open it and it reads',
6: 'Export = a clone of the current DOM, i.e. your last edit',
7: 'The agent renders; you only proofread',
8: 'Block-level edits dirty only that block',
9: 'Serif / sans, rounded / square — switched as a set',
10: 'What you changed yesterday is what you see today',
11: 'Everything remembered locally — no login, no upload',
12: 'Cut only the noise, not the capability',
13: 'One continuous gradient across the app, stackable with all three themes',
14: 'Three complete themes, not a filter pasted on top',
15: 'UI text only; document bodies stay untouched',
}
TAG = {
'剪贴板检测': 'Clipboard detect', '三通道降级': '3 fallbacks', '一键存 md': 'Save as .md',
'6 型图表': '6 chart types', '精确累计': 'Exact angles', 'CSV / TSV': 'CSV / TSV',
'ASCII 识别': 'ASCII parsing', '5 × 5 外观': '5 × 5 looks', '导出即编辑态': 'Export keeps edits',
'4 套风格': '4 doc styles', '三主题派生': '3 theme variants', '导出不丢色': 'Colors survive export',
'双链 / 嵌入': 'Links / embeds', 'Callout': 'Callout', '整库懒加载': 'Lazy vault',
'HTML / Word': 'HTML / Word', 'PDF / SVG': 'PDF / SVG', '单文件可分发': 'One-file share',
'CLI · HTTP · MCP': 'CLI · HTTP · MCP', '离线引擎': 'Offline engine', 'AI 直连': 'Direct to AI',
'块级编辑': 'Block editing', '换行保真': 'Exact newlines', '大纲跳转': 'Outline jump',
'卡片 / 纸张': 'Card / Paper', '三主题正交': '3 orthogonal themes', '打印友好': 'Print friendly',
'30 条': '30 entries', '按路径重读': 'Re-read by path', '位置记忆': 'Position memory',
'3 组 15 项': '3 groups, 15 items', '本地记忆': 'Local memory', '恢复默认': 'Reset to default',
'零干扰': 'Zero noise', '保留渲染菜单': 'Render menu kept', '一键还原': 'Restore in one click',
'全链路柔化': 'Whole-app softening', '色阶连续': 'Continuous gradient', '可叠加': 'Composable',
'低蓝光暖米黄': 'Low-blue warm beige', '字号 12–22': 'Size 12–22', '行高四档': '4 line heights',
'zh-CN / English': 'zh-CN / English', '长 key 优先': 'Longest key first', '正文不译': 'Body untouched',
}

pairs = []   # (zh, en)
seen = set()
def add(zh, en):
    zh = (zh or '').strip(); en = (en or '').strip()
    if not zh or not en or zh == en: return
    if zh in seen: return
    # 纯 ASCII 的 key 不需要翻译
    if not re.search(r'[\u4e00-\u9fff]', zh): return
    seen.add(zh); pairs.append((zh, en))

for i, f in enumerate(F, 1):
    add(f['prio'], PRIO.get(f['prio'], f['prio']))
    add(TITLE[i], TITLE[i])  # 占位：标题译文单独处理（见下方 titles）
for i, f in enumerate(F, 1):
    add(f['desc'], DESC[i])
    add(f['them'], THEM[i])
    add(f['us'], US[i])
    for t in f['tags']:
        add(t, TAG.get(t, t))

# 标题：原文不是上面 TITLE 里的英文，需要从 template 拿中文标题
titles = ['MD 复制即创建','表格秒变六种图表','双引擎流程图','一套令牌五处同频','知识库原生双链',
          '导出仍是活页面','MCP 连接器','大纲与块编辑','两套经典排版','最近，重读磁盘',
          '15 项偏好全记住','专注模式','原创云晰柔光','爱护你的双眼','国际化版本']
for i, t in enumerate(titles, 1):
    zh = t
    # 覆盖式：先删掉可能被 add 过的同 key
    seen.discard(zh)
    pairs = [(a,b) for (a,b) in pairs if a != zh]
    add(zh, TITLE[i])

# 导航与可访问性
NAV = [
    ('上一个功能亮点', 'Previous feature'),
    ('下一个功能亮点', 'Next feature'),
    ('项功能', 'feature'),
    ('功能截图', 'feature screenshot'),
    ('核心差异化', 'Core differentiator'),
    ('体验领先', 'Leading experience'),
    ('交付完备', 'Complete delivery'),
]
for zh, en in NAV:
    add(zh, en)

print('total pairs =', len(pairs))
for zh, en in pairs:
    print('  ' + zh[:50] + '  =>  ' + en[:60])
io.open('tools/_probe/_pairs.json','w',encoding='utf-8').write(json.dumps(pairs, ensure_ascii=False, indent=1))
