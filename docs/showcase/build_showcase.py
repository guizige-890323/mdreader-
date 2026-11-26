# -*- coding: utf-8 -*-
"""生成 MD Reader 功能展示页（单文件 HTML，截图 base64 内嵌）。

运行：python docs/showcase/build_showcase.py
输出：docs/showcase/MDReader-功能展示.html

内容口径（CR-2026-11-18-06）：15 个亮点，文案唯一来源 = docs/showcase/产品功能总览.md
  · 卡片图 = docs/assets/v2/group-*.webp（由 gen_groups.py 把 26 张原图拼成 15 张组图）
  · 组图统一 1000x640，与 .card-media 的比例配合，contain 无裁切、无大片留白
  · 页面结构：
      Hero（logo + 价值主张 + 徽章 + CTA，一屏内收口）
      → Showcase（15 卡 3D Cover Flow + 可点击索引条）★ 页面唯一的内容主角
      → Tracks（三条主线定位条，只做归类，不复述卡片文案）
      → Compare（能力摊开比）
      → QuickStart（五种形态）
      → Footer
  · CR-06 起撤掉 Hero 内的演示 GIF：那段 GIF 就是 15 卡轮播的录屏，
    与 #showcase 是同一份内容的两遍呈现（用户 2026-11-18 圈图指出「这部分重复了」）。
    撤掉后单文件从 4.5MB 降到 ~1.8MB，首屏也不用再等 GIF 解码。
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'docs' / 'assets'
V2 = ASSETS / 'v2'
BRAND = ASSETS / 'brand'
OUT = Path(__file__).resolve().parent / 'MDReader-功能展示.html'

VERSION = 'v1.7.0'
GITHUB = 'https://github.com/guizige-890323/mdreader'
RELEASES = GITHUB + '/releases'

# 15 个亮点：按「差异化强度 × 用户价值」排 P0 → P1 → P2
CARDS = [
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-clip.webp',
        title='Markdown 复制即创建',
        en='CLIPBOARD → DOC',
        desc='复制 AI 吐出的 Markdown，悬停「创建 MD」就变成一页排版完整的文档。三条通道按环境自动降级，'
             '本地 file:// 下按一次 Ctrl+V 也能成文。',
        them='复制 → 开编辑器 → 存盘 → 再拖进阅读器',
        us='复制、悬停、点击，三步成文',
        tags=['剪贴板检测', '三通道降级', '一键存 md'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-chart.webp',
        title='表格，秒变六种图表',
        en='SIX CHART TYPES',
        desc='选中两列就出图：柱状 / 折线 / 趋势 / 圆角环形 / 南丁格尔玫瑰，外加自动选型。'
             '环形扇区角度按百分比精确累计，图例与角度一一对应，可以拿量角器验算。',
        them='预览器只给一张静态表',
        us='角度即百分比，数据经得起追问',
        tags=['6 型图表', '精确累计', 'CSV / TSV'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-flow.webp',
        title='双引擎流程图',
        en='DUAL-ENGINE FLOW',
        desc='Mermaid 原生、文本箭头、Unicode 框线字符画三条入口，统一落到同一张可拖拽编辑的矢量图；'
             '5 种结构 × 5 套风格 = 25 种外观，两条轴互不干扰。',
        them='画图工具要联网、要订阅、要导出死图',
        us='纯本地算法识别，零调用、零等待、可编辑',
        tags=['ASCII 识别', '5 × 5 外观', '导出即编辑态'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-theme.webp',
        title='一套令牌，五处同频',
        en='ONE PALETTE, EVERYWHERE',
        desc='四套文档风格不是只改强调色：分段背景、图表色板、流程图强调色、代码关键字、表格配色同时换装；'
             '浅色 / 深色 / 护眼各自派生可读变体。',
        them='一份文档里三种蓝、两种红',
        us='换风格不会出现「深底压深字」',
        tags=['4 套风格', '三主题派生', '导出不丢色'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-wiki.webp',
        title='知识库原生双链',
        en='NATIVE WIKI LINKS',
        desc='Obsidian 的 [[双链]]、![[嵌入]]、Callout 提示块、YAML frontmatter、#标签 开箱即渲染；'
             '上千文件的库拖进来就能读，不用先导入、不用装插件。',
        them='先导入整库，再装一堆社区插件',
        us='拖入文件夹即建树，打开就是读得懂的页面',
        tags=['双链 / 嵌入', 'Callout', '整库懒加载'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-export.webp',
        title='导出，仍是活页面',
        en='EXPORT THAT LIVES',
        desc='独立 HTML 保留交互——图表可切型、CSV 可复制、表格可排序；Word 与打印 PDF 保真排版，'
             'SVG 和 Markdown 源码一键带走。',
        them='导出就是一张死了的图',
        us='导出 = 当前 DOM 克隆，即最后编辑态',
        tags=['HTML / Word', 'PDF / SVG', '单文件可分发'],
    ),
    dict(
        prio='P0 · 核心差异化', cls='p0', img='group-mcp.webp',
        title='MCP 连接器',
        en='MCP READY',
        desc='mdlens 同时提供 CLI / HTTP / MCP 三种接入，AI 工具直接把 Markdown 渲染成页面；'
             '引擎内联在本地，不调用任何云端渲染服务。',
        them='在聊天窗口里读竖线和反引号',
        us='Agent 自己渲染，用户只负责校对',
        tags=['CLI · HTTP · MCP', '离线引擎', 'AI 直连'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-outline.webp',
        title='大纲与按块编辑',
        en='OUTLINE & BLOCK EDIT',
        desc='侧栏大纲点标题即跳；编辑切成独立小块，只重渲染受影响那块，几万字的大表格不乱序、不卡顿。'
             '保存后换行符与 frontmatter 分毫不差。',
        them='整篇塞进 textarea，一保存 diff 全炸',
        us='块级改动，只脏那一块',
        tags=['块级编辑', '换行保真', '大纲跳转'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-typo.webp',
        title='两套经典排版',
        en='TWO TYPOGRAPHIC SKINS',
        desc='卡片 = 分节面板 + 深色编号头部 + 字数；纸张 = 描图纸面 + 页边装订刻度 + 衬线标题。'
             '配色、字体、圆角、投影、表格与代码块整体切换。',
        them='所谓皮肤就是换个边框颜色',
        us='衬线 / 无衬线、圆角 / 直角成套换',
        tags=['卡片 / 纸张', '三主题正交', '打印友好'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-recent.webp',
        title='最近，重读磁盘',
        en='RECENT, RE-READ FROM DISK',
        desc='最多 30 条记录。点历史记录时按绝对路径重读磁盘原文，不是打开一张旧快照；'
             '文件被移走或改名，自动退回正文缓存，不会只弹一个报错。',
        them='缓存快照，改完还看老内容',
        us='昨天改过的，今天点进来就是最新',
        tags=['30 条', '按路径重读', '位置记忆'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-settings.webp',
        title='15 项偏好，全部记住',
        en='GRANULAR SETTINGS',
        desc='语言、排版、字号 12–22px、行高四档、皮肤、柔光、应用图标、图表自动展开、文档风格、'
             '流程图结构与风格——分三组卡片，每项都有一句人话解释。',
        them='一屏看不懂的黑话开关',
        us='全部本地记忆，不登录、不上传',
        tags=['3 组 15 项', '本地记忆', '恢复默认'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-focus.webp',
        title='专注模式',
        en='FOCUS MODE',
        desc='一键隐去侧栏与工具条，只留正文和阅读进度；渲染快捷菜单仍然可用，专注不等于砍功能。'
             'Esc 退出后侧栏宽度、选中文件、滚动位置原样恢复。',
        them='折叠面板，功能跟着一起消失',
        us='只砍干扰，不砍能力',
        tags=['零干扰', '保留渲染菜单', '一键还原'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-softlight.webp',
        title='云晰柔光',
        en='SOFT LIGHT',
        desc='柔光覆盖顶栏、侧栏、标签栏、阅读区、弹层，一处不落；色阶连续不出现「贴上去的一块」，'
             '同时把文字对比度守在可读区间，不是无脑降亮度。',
        them='夜间模式 = 背景调暗、文字调亮',
        us='全链路同一条渐变色阶，可与三主题叠加',
        tags=['全链路柔化', '色阶连续', '可叠加'],
    ),
    dict(
        prio='P1 · 体验领先', cls='p1', img='group-eyecare.webp',
        title='爱护你的双眼',
        en='EYE CARE',
        desc='护眼是低蓝光暖米黄（卡片 #faf3e0 / 纸张 #fdf3d8 + 琥珀褐强调），与纯白一眼可辨；'
             '配字号 12–22px 与行高四档，密集表格调宽更透气。',
        them='白底加一点点黄就叫护眼',
        us='三种主题各自成套，不是盖一层滤镜',
        tags=['低蓝光暖米黄', '字号 12–22', '行高四档'],
    ),
    dict(
        prio='P2 · 交付完备', cls='p2', img='group-i18n.webp',
        title='国际化版本',
        en='I18N',
        desc='简体中文 / English / 其他（跟随系统）。运行时按 key 长度降序替换长句优先，'
             '未收录词条保留中文原文，不会冒出大片 undefined。',
        them='半机翻的界面，顺手把正文也翻了',
        us='只翻界面文案，文档正文一个字不动',
        tags=['zh-CN / English', '长 key 优先', '正文不译'],
    ),
]

# 三条主线：只讲「怎么用」，不复述卡片文案
# 三条主线只作「定位条」：一句一句讲清十五张卡各归哪一类。
# 绝不能再逐条罗列亮点——那是轮播的活，罗列一遍就是把同一份内容讲了两遍。
TRACKS = [
    dict(k='Ⅰ', name='读进去', en='READ IN', cls='t1',
         lead='打开就是能读的页面，不是一份源码。'),
    dict(k='Ⅱ', name='看得懂', en='SEE THROUGH', cls='t2',
         lead='数据与逻辑，在文档里当场就能看出来。'),
    dict(k='Ⅲ', name='通万物', en='CONNECT & CARRY', cls='t3',
         lead='从 AI 出来到别人手里，中间不断链。'),
]

COMPARE_HEAD = ['能力', 'MD Reader', 'Typora', 'Obsidian', 'VS Code', '在线转换站']
COMPARE = [
    ['离线可读、零上传', '单 HTML，0 请求', '桌面应用', '桌面应用', '桌面应用', '❌ 需上传'],
    ['复制即创建文档', '内置，三通道降级', '❌', '❌', '❌', '粘贴到网页'],
    ['表格 → 图表', '内置 6 型，角度可验算', '❌', '插件', '插件', '部分'],
    ['文本 / 字符画 → 图形', '内置纯算法，零 AI', '❌', '插件', '❌', 'AI 云端'],
    ['流程图可视化编辑', '拖拽 + 导出即编辑态', '❌', '❌', '插件（只读）', '❌'],
    ['双链 / Callout / frontmatter', '开箱渲染，零插件', '部分', '原生（需建库）', '插件', '❌'],
    ['导出后仍可交互', 'HTML 可点可切', 'PDF / 静态 HTML', 'PDF', '❌', '❌'],
    ['AI 工具直连（MCP）', 'CLI / HTTP / MCP', '❌', '❌', '❌', '❌'],
    ['安装成本', '解压即用 / 免装', '安装包', '安装 + 建库', '安装 + 扩展', '打开网页'],
    ['文件是否出网', '从不', '从不', '从不', '从不', '必然'],
]

QUICK = [
    ('Windows 安装版', 'MDReader-Windows11安装版.exe', '双击安装，注册 4 种扩展名，可设为 .md 默认打开程序', '推荐'),
    ('Windows 便携版', 'MDReader-Windows11便携版.zip', '解压即用，约 2 MB，适合 U 盘、临时机器与内网离线', ''),
    ('网页免装版', 'MDReader.html', '任何有浏览器的机器双击即开，零安装、零联网', ''),
    ('iOS / iPadOS', 'MDReader-iOS-PWA.zip', '局域网托管后「添加到主屏幕」，图标 + 全屏启动', ''),
    ('国际化版', 'MDReader-International-便携版.zip', '界面中英双语，共用同一份引擎，渲染能力完全一致', ''),
]

TPL = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MD Reader · 让 Markdown 阅读成为一种享受</title>
<style>
:root{
  --bg:#f4f6f9; --bg-rgb:244,246,249; --bg2:#e9eef5; --ink:#142034; --ink2:#546376; --ink3:#8b97a7;
  --line:#dfe6ef; --card:#ffffff; --accent:#2f6df6; --accent2:#e8f0ff;
  --p0:#2f6df6; --p1:#0ea5a4; --p2:#8b97a7;
  --cw:664px; --ch:680px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth; overflow-x:hidden}
body{
  margin:0; color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  background:
    radial-gradient(1100px 620px at 12% 0%,rgba(47,109,246,.10),transparent 62%),
    radial-gradient(900px 560px at 92% 30%,rgba(14,165,164,.08),transparent 60%),
    linear-gradient(180deg,var(--bg) 0%,var(--bg2) 100%);
  -webkit-font-smoothing:antialiased;
}
body::before{
  content:""; position:fixed; inset:0; pointer-events:none; opacity:.45; z-index:0;
  background-image:radial-gradient(circle,#c9d3e1 1px,transparent 1px);
  background-size:26px 26px; mask-image:linear-gradient(to bottom,transparent,#000 18%,#000 82%,transparent);
}
.wrap{position:relative; z-index:1; max-width:1240px; margin:0 auto; padding:0 28px}

/* ---------- Header ---------- */
header{
  display:flex; align-items:center; justify-content:space-between; gap:20px;
  padding:22px 0 0; flex-wrap:wrap;
}
.brand{display:flex; align-items:center; gap:11px}
/* 应用图标：与桌面版 icon-light.png 同源（1024 → 192 双倍图），
   不再用「MD」文字方块——那只是占位，跟软件真身对不上号。 */
.logo{
  width:40px; height:40px; border-radius:11px; flex:0 0 auto;
  background:url(__ICON__) center/contain no-repeat;
  box-shadow:0 6px 18px rgba(17,27,43,.22);
}
.brand b{display:block; font-size:14px; letter-spacing:.14em; font-weight:800}
.brand small{display:block; font-size:11px; color:var(--ink3); margin-top:2px}
.hdr-right{display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end}
.pill{font-size:11px; padding:6px 11px; border-radius:999px; border:1px solid var(--line);
  background:rgba(255,255,255,.72); color:var(--ink2); white-space:nowrap}
.pill.solid{background:#111b2b; color:#fff; border-color:#111b2b; font-weight:700}
.legend{display:flex; gap:10px; font-size:11px; color:var(--ink3)}
.legend i{display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:4px}

/* ---------- Hero ---------- */
/* 设计标语图（1920×284 的书法字），与软件欢迎屏同一张素材，
   一眼就能把「网页介绍」和「软件本体」认成同一个产品。
   暗色字在白底上会发灰，用 multiply 让白底透出去；宽度夹到 660 保证 6.76:1 的比例不变形。 */
/* CR-06：Hero 不再是「大图 + 长文案」的落地页，而是给轮播让位的门厅。
   压缩上下留白与徽章间距，让 15 卡舞台在 900px 视口里就能露出上半张卡。 */
.hero{text-align:center; padding:14px 16px 6px}
.eyebrow{font-size:10px; letter-spacing:.28em; color:var(--accent); font-weight:800}
/* h1 现在只承载标语图：清掉原文字标题的 margin/字号/渐变，避免图下多出空白行 */
.hero h1.hero-title{margin:12px 0 8px; font-size:0; line-height:0; letter-spacing:0}
.hero h1.hero-title span{background:none; color:inherit}
.slogan{
  display:block; width:min(620px,86%); height:auto; margin:0 auto;
  mix-blend-mode:multiply;
}
.hero .sub{margin:0 auto; max-width:760px; font-size:13px; line-height:1.65; color:var(--ink2)}
.badges{display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:14px 0 0}
.badge{display:inline-flex; align-items:center; height:26px; border-radius:5px; overflow:hidden;
  font-size:11px; font-weight:700; letter-spacing:.02em; box-shadow:0 1px 2px rgba(20,32,52,.08)}
.badge .l{background:#3d4a5c; color:#fff; padding:0 9px; height:100%; display:flex; align-items:center}
.badge .r{padding:0 10px; height:100%; display:flex; align-items:center; color:#fff}
.badge.blue .r{background:#2f6df6} .badge.green .r{background:#2e7d32}
.badge.teal .r{background:#0ea5a4} .badge.gray .r{background:#64748b}
.badge.orange .r{background:#d97706}
.cta{display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin:16px 0 0}
.btn{
  display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 22px; border-radius:10px;
  font-size:13.5px; font-weight:700; text-decoration:none; border:1px solid transparent;
  transition:transform .18s ease, box-shadow .18s ease, background .18s ease;
}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:#111b2b; color:#fff; box-shadow:0 8px 22px rgba(17,27,43,.22)}
.btn.primary:hover{box-shadow:0 12px 28px rgba(17,27,43,.28)}
.btn.ghost{background:rgba(255,255,255,.86); color:var(--ink); border-color:var(--line)}
.btn.ghost:hover{border-color:var(--accent); color:var(--accent)}
.btn small{font-weight:500; opacity:.72; font-size:11px}

/* ---------- Section 公共 ---------- */
section{scroll-margin-top:18px}
.sec-head{text-align:center; margin:56px 0 22px}
/* CR-07：轮播上方不再有标题块，舞台顶部留白改由 .stage 自己承担（见 .stage margin-top），
   这条规则保留给下面三个区块共用，不再作用于 #showcase。 */
.sec-head .k{font-size:10px; letter-spacing:.26em; color:var(--accent); font-weight:800}
.sec-head h2{margin:9px 0 8px; font-size:clamp(20px,2.2vw,28px); letter-spacing:-.015em}
.sec-head p{margin:0 auto; max-width:660px; font-size:12.8px; line-height:1.72; color:var(--ink2)}

/* ---------- Showcase 轮播 ---------- */
/* 舞台顶部原由 .sec-head 承担 26+12px 过渡，CR-07 删掉标题块后改由自己补，
   否则「下载安装」按钮会直接贴住卡面顶部。 */
.stage{position:relative; height:740px; perspective:1500px; perspective-origin:50% 46%; overflow:hidden;
  width:100vw; margin-left:calc(50% - 50vw); margin-right:calc(50% - 50vw); margin-top:34px}
.stage::before,.stage::after{content:""; position:absolute; top:0; bottom:0; width:clamp(60px,9vw,150px);
  z-index:150; pointer-events:none}
.stage::before{left:0; background:linear-gradient(90deg,var(--bg) 8%,rgba(var(--bg-rgb),0) 100%)}
.stage::after{right:0; background:linear-gradient(270deg,var(--bg) 8%,rgba(var(--bg-rgb),0) 100%)}
.deck{position:absolute; left:50%; top:50%; width:0; height:0; transform:translate(-50%,-50%); transform-style:preserve-3d}
.card{
  position:absolute; left:calc(var(--cw) / -2); top:calc(var(--ch) / -2);
  width:var(--cw); height:var(--ch);
  transform-style:preserve-3d; will-change:transform,opacity;
  transition:transform .46s cubic-bezier(.22,.61,.36,1),opacity .34s ease,filter .34s ease,box-shadow .34s ease;
  background:var(--card); border:1px solid var(--line); border-radius:20px; overflow:hidden;
  box-shadow:0 26px 60px rgba(24,42,72,.16),0 3px 10px rgba(24,42,72,.06);
  cursor:pointer; user-select:none;
}
/* 卡片内部用 flex 分上下两段：截图区按素材 1000:640 定比例（零裁切、铺满宽度），
   文案区吃掉剩余高度。绝不能用百分比高度——会随内容撑破后被 overflow 切掉。 */
.card{display:flex; flex-direction:column}
.card.active{cursor:default; box-shadow:0 34px 76px rgba(24,42,72,.22),0 4px 14px rgba(24,42,72,.08)}
.card-media{flex:0 0 auto; aspect-ratio:1000/640; background:#eef2f7; overflow:hidden; position:relative;
  border-bottom:1px solid var(--line)}
/* 绝对定位 + 显式宽高，contain 才可靠 */
.card-media img{display:block; position:absolute; left:8px; top:6px;
  width:calc(100% - 16px); height:calc(100% - 12px);
  object-fit:contain; object-position:center; border-radius:6px}
.card-info{flex:1 1 auto; min-height:0; padding:13px 24px 15px; display:flex; flex-direction:column; gap:5px; overflow:hidden}
.card-top{display:flex; align-items:center; justify-content:space-between}
.prio{font-size:10px; font-weight:800; letter-spacing:.06em; padding:3px 9px; border-radius:999px}
.p0 .prio{color:var(--p0); background:#eaf1ff}
.p1 .prio{color:#087f7e; background:#e2f6f5}
.p2 .prio{color:#667587; background:#eef1f5}
.num{font-size:10px; color:var(--ink3); font-variant-numeric:tabular-nums; letter-spacing:.1em}
.card h2{margin:0; font-size:23px; letter-spacing:-.01em; line-height:1.15}
.card .en{font-size:9px; letter-spacing:.2em; color:var(--accent); font-weight:800; margin-top:-2px}
.card .desc{margin:0; font-size:12.4px; line-height:1.55; color:var(--ink2)}
/* 对照：旧做法划掉 + 本产品结论，两行合成一个块，省掉一层包裹 */
.vs{padding:7px 11px; border-radius:9px; background:#f7f9fc; border:1px solid #edf1f6;
  display:flex; flex-direction:column; gap:2px; font-size:11.4px; line-height:1.45}
.vs .them{color:var(--ink3); text-decoration:line-through; text-decoration-color:#c3ccd8}
.vs .us{color:var(--ink); font-weight:650}
.vs .us::before{content:"→ "; color:var(--accent); font-weight:800}
.tags{display:flex; gap:6px; margin-top:auto; flex-wrap:wrap}
.tags i{font-style:normal; font-size:10px; color:var(--ink2); padding:3px 8px;
  border:1px solid var(--line); border-radius:6px; background:#fff}

.edge{position:absolute; top:0; bottom:0; width:15%; border:0; background:transparent;
  color:var(--accent); font-size:44px; font-weight:200; cursor:pointer; z-index:200;
  display:grid; place-items:center; opacity:0; transition:opacity .25s ease; -webkit-tap-highlight-color:transparent}
.edge.left{left:0} .edge.right{right:0}
.edge:hover,.edge:focus-visible{opacity:1; outline:none}
.edge span{width:54px; height:54px; border-radius:50%; display:grid; place-items:center;
  background:rgba(255,255,255,.92); border:1px solid var(--line);
  box-shadow:0 8px 24px rgba(24,42,72,.14); line-height:1; padding-bottom:4px}
.controls{display:flex; flex-direction:column; align-items:center; gap:9px; padding:12px 0 4px}
.hint{font-size:11px; color:var(--ink3); letter-spacing:.03em}
.hint b{color:var(--accent); font-weight:700}
.hint.paused b{color:#e07a1f}

/* 索引条：15 个亮点一字排开，点即跳到对应卡片。与轮播互补，不复述文案 */
.chips{display:flex; flex-wrap:wrap; gap:7px; justify-content:center; margin:22px 0 0}
.chip{display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 12px;
  border-radius:999px; border:1px solid var(--line); background:rgba(255,255,255,.8);
  font-size:11.5px; color:var(--ink2); cursor:pointer; transition:all .2s ease}
.chip:hover{border-color:var(--accent); color:var(--accent); transform:translateY(-1px)}
.chip.on{background:#111b2b; border-color:#111b2b; color:#fff}
.chip em{font-style:normal; font-size:9.5px; opacity:.55; font-variant-numeric:tabular-nums}
.chip.on em{opacity:.8}

/* ---------- Tracks 三主线 ---------- */
/* CR-06：这里原本把 15 个亮点逐条罗列（6+5+5 = 16 条），等于把轮播讲过的内容再讲一遍。
   改成三张一行定位条：编号 + 名称 + 一句定位，不再复述任何卡片文案。 */
.tracks{display:grid; grid-template-columns:repeat(3,1fr); gap:14px}
.track{position:relative; border:1px solid var(--line); border-radius:14px;
  background:rgba(255,255,255,.9); padding:20px 20px 18px; overflow:hidden}
.track::before{content:""; position:absolute; left:0; right:0; top:0; height:3px;
  background:linear-gradient(90deg,var(--t),rgba(255,255,255,0))}
.track.t1{--t:#2f6df6} .track.t2{--t:#0ea5a4} .track.t3{--t:#8b5cf6}
.track .no{font-size:11px; font-weight:800; letter-spacing:.2em; color:var(--t)}
.track h3{margin:7px 0 3px; font-size:20px; letter-spacing:-.01em}
.track .en{font-size:9px; letter-spacing:.22em; color:var(--ink3); font-weight:800}
.track .lead{margin:10px 0 0; font-size:12.6px; line-height:1.65; color:var(--ink2)}

/* ---------- Compare 表 ---------- */
.ctable{width:100%; border-collapse:separate; border-spacing:0; font-size:12.2px;
  background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden;
  box-shadow:0 10px 30px rgba(24,42,72,.07)}
.ctable th,.ctable td{padding:11px 14px; text-align:left; border-bottom:1px solid #eef2f7}
.ctable thead th{background:#f7f9fc; font-size:11.5px; color:var(--ink2); font-weight:800; letter-spacing:.02em}
.ctable thead th:nth-child(2){background:#eaf1ff; color:var(--accent)}
.ctable tbody tr:last-child td{border-bottom:0}
.ctable tbody tr:hover td{background:#fbfcfe}
.ctable td:first-child{font-weight:650; color:var(--ink)}
.ctable td:nth-child(2){background:#f8fbff; color:var(--accent); font-weight:750}
.ctable td{color:var(--ink2)}

/* ---------- QuickStart ---------- */
.qgrid{display:grid; grid-template-columns:repeat(3,1fr); gap:14px}
.qcard{border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.9); padding:18px; position:relative}
.qcard.hot{border-color:var(--accent); box-shadow:0 12px 30px rgba(47,109,246,.12)}
.qcard .tag{position:absolute; top:-9px; left:16px; font-size:9.5px; font-weight:800; letter-spacing:.06em;
  color:#fff; background:var(--accent); padding:3px 9px; border-radius:999px}
.qcard h3{margin:2px 0 8px; font-size:14px}
.qcard .file{display:block; font-family:ui-monospace,Consolas,monospace; font-size:11px;
  color:var(--ink2); background:#f5f7fa; border:1px solid #eaeff5; border-radius:7px;
  padding:8px 10px; word-break:break-all; margin-bottom:9px}
.qcard p{margin:0; font-size:11.6px; line-height:1.6; color:var(--ink2)}

/* ---------- Footer ---------- */
footer{margin:56px 0 0; padding:26px 0 40px; border-top:1px solid var(--line);
  display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  font-size:11.5px; color:var(--ink3)}
footer a{color:var(--ink2); text-decoration:none; border-bottom:1px dotted #c6d0de}
footer a:hover{color:var(--accent)}
footer .links{display:flex; gap:14px; flex-wrap:wrap}

@media(max-width:1100px){
  /* 73vw 保证两侧邻卡始终露出可辨识的边，轮播层次不塌；上限 640 维持大屏观感 */
  :root{--cw:min(73vw,600px);--ch:640px}
  .stage{height:720px}
  .card-info{padding:11px 18px 13px; gap:4px}
  .card h2{font-size:20px}
  .card .desc{font-size:11px; line-height:1.45}
  .vs{font-size:10px; line-height:1.4; padding:5px 8px}
  .tags i{font-size:9.5px; padding:2px 7px}
  .tracks{grid-template-columns:1fr}
  .qgrid{grid-template-columns:1fr}
  .ctable{font-size:11px}
  .ctable th,.ctable td{padding:9px 8px}
}
@media(max-width:760px){
  :root{--cw:min(78vw,440px);--ch:600px}
  .wrap{padding:0 16px}
  .stage{height:660px}
  .legend{display:none}
  .hero{padding:22px 4px 14px}
  .hero .sub{font-size:12px}
  .card-info{padding:10px 13px 12px; gap:3px}
  .card h2{font-size:17px}
  .card .desc{font-size:10.5px; line-height:1.4}
  .vs{font-size:9.5px; line-height:1.35; padding:4px 6px}
  .tags i{font-size:9px; padding:2px 6px}
  .edge{width:13%}
  .ctable{display:block; overflow-x:auto; white-space:nowrap}
}
@media(prefers-reduced-motion:reduce){
  .card,.btn,.chip{transition:none}
  html{scroll-behavior:auto}
}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="brand">
      <div class="logo" role="img" aria-label="MD Reader 应用图标"></div>
      <div><b>MD READER</b><small>让 Markdown 阅读成为一种享受</small></div>
    </div>
    <div class="hdr-right">
      <span class="pill solid">__VERSION__</span>
      <span class="pill">离线单文件 · 免费开源</span>
      <span class="legend">
        <span><i style="background:var(--p0)"></i>P0 核心差异</span>
        <span><i style="background:var(--p1)"></i>P1 体验领先</span>
        <span><i style="background:var(--p2)"></i>P2 交付完备</span>
      </span>
    </div>
  </header>

  <!-- ============ Hero ============ -->
  <div class="hero">
    <div class="eyebrow">15 FEATURE HIGHLIGHTS · 2026</div>
    <!-- 设计标语图：与软件欢迎屏同一张书法字素材，替换原「把 AI 的输出，读成作品」文字标题。
         仍用 h1 包住（图替代文字，但语义层级不能丢），alt 承担可访问文本。 -->
    <h1 class="hero-title"><img class="slogan" src="__SLOGAN__" alt="让 Markdown 阅读成为一种享受" width="660" height="98" decoding="async"></h1>
    <p class="sub">
      一个 HTML 文件就是完整程序。断网可用、零上传、免安装——
      对标 Typora / Obsidian / VS Code，我们只做一件事：<b>让每一份 Markdown，打开就是好页面。</b>
      十五个亮点，从「复制即创建」到「导出仍是活页面」。
    </p>
    <div class="badges">
      <span class="badge blue"><span class="l">release</span><span class="r">__VERSION__</span></span>
      <span class="badge green"><span class="l">network</span><span class="r">0 requests</span></span>
      <span class="badge teal"><span class="l">license</span><span class="r">MIT</span></span>
      <span class="badge gray"><span class="l">platform</span><span class="r">Win11 / macOS / iOS</span></span>
      <span class="badge orange"><span class="l">size</span><span class="r">~2 MB 便携版</span></span>
    </div>
    <div class="cta">
      <a class="btn primary" href="__RELEASES__" target="_blank" rel="noopener">下载安装 <small>Windows · macOS</small></a>
      <a class="btn ghost" href="__GITHUB__" target="_blank" rel="noopener">查看源码 <small>MIT</small></a>
      <a class="btn ghost" href="#showcase">功能演示</a>
    </div>
    <!-- CR-06：原 hero-demo 演示 GIF 已移除。那段 GIF 是下方 15 卡轮播的录屏，
         同一份内容在页面里出现两遍（用户圈图指出「这部分重复了」）。
         现在只留可交互的那个版本：能点、能拖、能跳，比录屏更有用，也不再占 2.8MB。 -->
  </div>

  <!-- ============ Showcase ============ -->
  <!-- CR-07：撤掉轮播上方整块 .sec-head（kicker + h2 + 说明）。
       用户 2026-11-19 拖选截图指出「这部分介绍没有必要」——轮播本身看得懂，
       卡片标题、索引条、下方 hint 已经把「是什么 / 怎么操作」讲完了，
       再压一段 h2 加一行解释只是把同一个意思说第二遍。
       语义上不留空洞：section 带 aria-label，屏幕阅读器仍有分区名。 -->
  <section id="showcase" aria-label="功能卡片轮播">
    <div class="stage" id="stage" aria-label="功能卡片轮播">
      <div class="deck" id="deck"></div>
      <button class="edge left" id="edgeL" aria-label="上一项"><span>‹</span></button>
      <button class="edge right" id="edgeR" aria-label="下一项"><span>›</span></button>
    </div>
    <div class="controls">
      <div class="hint" id="hint"><b>自动滚动中</b> · 点击左右两侧翻页 · ← → 键 · 停止操作后恢复</div>
    </div>
    <div class="chips" id="chips"></div>
  </section>

  <!-- ============ Tracks ============ -->
  <section id="tracks">
    <div class="sec-head">
      <div class="k">THREE TRACKS</div>
      <h2>十五个亮点，归到三条主线</h2>
      <p>不是又一份清单，只是一句话定位：你手上是哪种事，就从哪条看起。</p>
    </div>
    <div class="tracks">__TRACKS__</div>
  </section>

  <!-- ============ Compare ============ -->
  <section id="compare">
    <div class="sec-head">
      <div class="k">HONEST COMPARISON</div>
      <h2>跟常见做法摊开比</h2>
      <p>不贬低别人，只把「同一件事各要花多少代价」列清楚，自己判断。</p>
    </div>
    <table class="ctable" id="ctable">
      <thead><tr>__CHEAD__</tr></thead>
      <tbody>__CBODY__</tbody>
    </table>
  </section>

  <!-- ============ QuickStart ============ -->
  <section id="quickstart">
    <div class="sec-head">
      <div class="k">GET STARTED</div>
      <h2>五种形态，60 秒上手</h2>
      <p>共用同一份 MDReader.html，渲染能力完全一致，不存在「精简版」。</p>
    </div>
    <div class="qgrid">__QUICK__</div>
  </section>

  <footer>
    <div>MD Reader · MIT License · Built by 桂子哥 / 小W</div>
    <div class="links">
      <a href="__GITHUB__" target="_blank" rel="noopener">GitHub</a>
      <a href="__RELEASES__" target="_blank" rel="noopener">Releases</a>
      <a href="__DOCS__">设计文档</a>
    </div>
  </footer>
</div>

<script>
/* 卡片数据由构建脚本注入（截图为 base64 内嵌，单文件离线可开） */
const CARDS = __CARDS__;
const N = CARDS.length;
const AUTOPLAY_MS = 2600;   /* CR-06：节奏翻倍（原 5200）。15 张一轮 39s，看得完也不拖沓 */
const TRANS_MS = 460;       /* 与 CSS .card transition 保持一致，随节奏同步减半 */

const deck = document.getElementById('deck');
const stage = document.getElementById('stage');
const chipsBox = document.getElementById('chips');
const hint = document.getElementById('hint');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 构建 DOM */
const cards = CARDS.map((d, i) => {
  const el = document.createElement('article');
  el.className = 'card ' + d.cls;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', d.title);
  const tags = d.tags.map(t => '<i>' + t + '</i>').join('');
  const no = String(i + 1).padStart(2, '0');
  el.innerHTML =
    '<div class="card-media"><img src="' + d.img + '" alt="' + d.title + ' 功能截图"></div>' +
    '<div class="card-info">' +
      '<div class="card-top"><span class="prio">' + d.prio + '</span>' +
      '<span class="num">' + no + ' / ' + String(N).padStart(2, '0') + '</span></div>' +
      '<h2>' + d.title + '</h2><div class="en">' + d.en + '</div>' +
      '<p class="desc">' + d.desc + '</p>' +
      '<div class="vs"><span class="them">' + d.them + '</span>' +
      '<span class="us">' + d.us + '</span></div>' +
      '<div class="tags">' + tags + '</div>' +
    '</div>';
  el.addEventListener('click', () => { act(); go(i); });
  deck.appendChild(el);
  return el;
});

/* 索引条：点即跳卡，同时充当进度指示（省掉与它重复的进度点） */
const chips = CARDS.map((d, i) => {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button';
  b.setAttribute('aria-label', '第 ' + (i + 1) + ' 项：' + d.title);
  b.innerHTML = '<em>' + String(i + 1).padStart(2, '0') + '</em><span>' + d.title + '</span>';
  b.addEventListener('click', () => { act(); go(i); });
  chipsBox.appendChild(b);
  return b;
});

let cur = 0;
let lastAct = Date.now();      /* 自动播放计时基准 */
let lastUserAct = 0;           /* 真实用户操作时间（只用于提示文案） */

const norm = i => ((i % N) + N) % N;
/* 环形位移：距离 d 决定位移/缩放/透明度/倾角 */
/* 步进必须按舞台宽度算：固定 360 会把 a=2/a=3 的卡片挤出舞台，被 overflow:hidden 切成半张。 */
let _cwCache = 0;
function cardBaseW() {
  if (_cwCache) return _cwCache;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;width:var(--cw);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  _cwCache = probe.getBoundingClientRect().width || 760;
  probe.remove();
  return _cwCache;
}
function pose(d) {
  const a = Math.abs(d);
  const sgn = d === 0 ? 0 : Math.sign(d);
  const halfW = stage.clientWidth / 2;
  const cw = cardBaseW();
  // a=2 卡片的半宽 = cw * .31，留 10px 呼吸位
  const fit = (halfW - cw * .31 - 10) / 1.62;
  const stepBase = Math.max(120, Math.min(360, fit));
  return {
    x: sgn * (a === 1 ? stepBase : stepBase * 1.62 + (a - 2) * 46),
    scale: a === 0 ? 1 : a === 1 ? .81 : a === 2 ? .62 : .45,
    op: a === 0 ? 1 : a === 1 ? .9 : a === 2 ? .62 : 0,
    ry: a === 0 ? 0 : -sgn * (a === 1 ? 24 : 30),
    z: 100 - a,
    vis: a > 3 ? 'hidden' : 'visible'
  };
}
function render() {
  cards.forEach((el, i) => {
    const d = norm(i - cur);
    const dd = d > N / 2 ? d - N : d;      /* 转成 [-N/2, N/2] 便于取最短方向 */
    const p = pose(dd);
    el.style.transform =
      'translate3d(' + p.x + 'px,0,' + (p.scale * 120 - 120) + 'px) ' +
      'rotateY(' + p.ry + 'deg) scale(' + p.scale + ')';
    el.style.opacity = p.op;
    el.style.zIndex = p.z;
    el.style.visibility = p.vis;
    el.classList.toggle('active', dd === 0);
    el.setAttribute('aria-hidden', dd === 0 ? 'false' : 'true');
  });
  chips.forEach((b, i) => b.classList.toggle('on', i === cur));
  /* 索引条自动跟随：15 项会折两行，当前项须始终在视野里，否则用户看不到进度 */
  if (chips[cur]) {
    const cb = chipsBox.getBoundingClientRect();
    const b = chips[cur].getBoundingClientRect();
    if (b.top < cb.top || b.bottom > cb.bottom) {
      chips[cur].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}
function go(i) { cur = norm(i); lastAct = Date.now(); render(); }
function act() { lastUserAct = Date.now(); lastAct = Date.now(); }

document.getElementById('edgeL').addEventListener('click', () => { act(); go(cur - 1); });
document.getElementById('edgeR').addEventListener('click', () => { act(); go(cur + 1); });
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { act(); go(cur - 1); }
  else if (e.key === 'ArrowRight') { act(); go(cur + 1); }
});
/* 滑动手势 */
let tx = 0;
stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; act(); }, { passive: true });
stage.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 44) go(cur + (dx < 0 ? 1 : -1));
}, { passive: true });
addEventListener('resize', () => { _cwCache = 0; render(); });

/* 自动播放：自右向左（cur + 1 表示内容向左推进）。
   CR-06：轮询周期由 250ms 收到 120ms —— AUTOPLAY_MS 是「等待阈值」，
   真正的翻页时刻落在下一个 tick 上，250ms 粒度会把 2600 拖成实测 ~2750，
   提速一倍就打了 5% 折扣。120ms 下实测贴到 2620 左右，且仍远低于人眼可辨开销。 */
setInterval(() => {
  if (Date.now() - lastAct >= AUTOPLAY_MS) { cur = norm(cur + 1); lastAct = Date.now(); render(); }
  /* 只有「用户主动操作」才显示已暂停；自动滚动重置 lastAct 不算暂停 */
  const paused = Date.now() - lastUserAct < AUTOPLAY_MS;
  hint.classList.toggle('paused', paused);
  if (paused) {
    const s = Math.max(0, Math.ceil((lastAct + AUTOPLAY_MS - Date.now()) / 1000));
    hint.innerHTML = '<b>已暂停</b> · ' + s + 's 后自动继续 · 点击左右两侧翻页';
  } else {
    hint.innerHTML = '<b>自动滚动中</b> · 点击左右两侧翻页 · ← → 键';
  }
}, 120);

render();
</script>
</body>
</html>
'''


def main():
    cards = []
    for i, d in enumerate(CARDS):
        p = V2 / d['img']
        if not p.exists():
            raise SystemExit('缺少组图: ' + str(p) + '（先跑 gen_groups.py）')
        b64 = base64.b64encode(p.read_bytes()).decode('ascii')
        cards.append(dict(d, img='data:image/webp;base64,' + b64))
        print('[%02d] %-24s %8d B  %s' % (i + 1, d['img'], p.stat().st_size, d['title']))

    chead = ''.join('<th>%s</th>' % h for h in COMPARE_HEAD)
    cbody = ''
    for row in COMPARE:
        tds = ''.join('<td>%s</td>' % c for c in row)
        cbody += '<tr>%s</tr>' % tds

    quick = ''
    for name, fname, desc, tag in QUICK:
        cls = 'qcard hot' if tag else 'qcard'
        tag_html = '<span class="tag">%s</span>' % tag if tag else ''
        quick += ('<div class="%s">%s<h3>%s</h3><code class="file">%s</code><p>%s</p></div>'
                  % (cls, tag_html, name, fname, desc))

    tracks = ''
    for t in TRACKS:
        tracks += ('<div class="track %s"><div class="no">%s</div><h3>%s</h3>'
                   '<div class="en">%s</div><p class="lead">%s</p></div>'
                   % (t['cls'], t['k'], t['name'], t['en'], t['lead']))

    # CR-06：不再内嵌 hero 演示 GIF。它是 15 卡轮播的录屏，与 #showcase 重复；
    # 素材文件本身仍保留在 docs/assets/ 供 README 引用，只是不进这个单文件页面。
    gif_path = ASSETS / 'demo-carousel.gif'
    if gif_path.exists():
        print('[GIF] %-24s 已内嵌跳过（与轮播重复，见 CR-06），素材仍留在 docs/assets/' % gif_path.name)

    # 品牌素材：应用图标（header）与设计标语（hero）。两张都必须内嵌，
    # 否则单文件离线打开会裂图。缺文件时直接退出，避免产出「一半有图」的页面。
    def b64(path, mime):
        if not path.exists():
            raise SystemExit('缺少品牌素材: ' + str(path))
        return 'data:%s;base64,%s' % (mime, base64.b64encode(path.read_bytes()).decode('ascii'))

    icon_uri = b64(BRAND / 'app-icon.png', 'image/png')
    slogan_uri = b64(BRAND / 'slogan.jpg', 'image/jpeg')
    print('[ICO] %-24s %8d B' % ('app-icon.png', (BRAND / 'app-icon.png').stat().st_size))
    print('[SLO] %-24s %8d B' % ('slogan.jpg', (BRAND / 'slogan.jpg').stat().st_size))

    html = (TPL
            .replace('__CARDS__', json.dumps(cards, ensure_ascii=False, separators=(',', ':')))
            .replace('__TRACKS__', tracks)
            .replace('__CHEAD__', chead)
            .replace('__CBODY__', cbody)
            .replace('__QUICK__', quick)
            .replace('__VERSION__', VERSION)
            .replace('__RELEASES__', RELEASES)
            .replace('__GITHUB__', GITHUB)
            .replace('__DOCS__', '../../MDReader/docs/design/README.md')
            .replace('__ICON__', icon_uri)
            .replace('__SLOGAN__', slogan_uri))
    assert '__ICON__' not in html and '__SLOGAN__' not in html, '品牌占位符未全部替换'
    assert '__GIF__' not in html, 'GIF 占位符残留：模板里已无 hero 动图，应同步删干净'
    OUT.write_text(html, encoding='utf-8')
    print('\n已生成: %s  (%.2f MB)' % (OUT, OUT.stat().st_size / 1048576))


if __name__ == '__main__':
    main()