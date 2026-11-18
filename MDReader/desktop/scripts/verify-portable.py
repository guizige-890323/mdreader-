# -*- coding: utf-8 -*-
"""回归验证：确认桌面桥接入后，便携版（纯 HTML / file://）行为完全不变。

用无头 Edge 加载 dist/MDReader.html，检查：
  1. __MD_DESKTOP__ 不存在、html 上没有 data-desktop
  2. 卡片皮肤默认生效、可切到纸张再切回、卡片数不叠加
  3. A+/A- 字号在两套皮肤下都生效
  4. 最近打开面板、大纲、表格、Mermaid 均在
  5. 状态栏版本与环境标签正确
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
DIST = ROOT / "dist"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-portable-"))

MD = (DIST / "示例文档.md").read_text(encoding="utf-8")

# 期望值不写死：版本号跟 package.json 走，卡片数跟示例文档的二级标题数走。
# 否则每次改版本或改示例文档，这三条断言都会假失败（v1.7 收口时踩过）。
VERSION = json.loads((ROOT / "desktop" / "package.json").read_text(encoding="utf-8"))["version"]
SHORT_VERSION = ".".join(VERSION.split(".")[:2])   # 状态栏只显示到次版本号
# 卡片数 = 二级标题节数 + 首节导语卡（第一个 ## 之前的内容也单独成卡）
EXPECT_CARDS = sum(1 for line in MD.splitlines() if line.startswith("## ")) + 1

PROBE = r"""
<script>
window.__MD_AUTOLOAD__ = {name:"示例文档.md", dir:"C:/tmp", path:"C:/tmp/demo.md", text:%MD%};
</script>
"""

SNAP = r"""
<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>
<script>
(function(){
  var R = {};
  function $(s){ return document.querySelector(s); }
  function $$(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function CS(e,p){ return e?getComputedStyle(e).getPropertyValue(p).trim():'NULL'; }
  function fire(id,v){ var e=$(id); if(!e) return; e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); }
  var seq = [
    function(){ return 1100; },
    function(){
      R.env = {
        has_desktop_api: !!window.__MD_DESKTOP__,
        data_desktop: document.documentElement.dataset.desktop || '(none)',
        stBuild: ($('#stBuild')||{}).textContent || '',
        layout: ($('#layoutSel')||{}).value || '',
        cards: $$('.doc-card').length,
        outline: $$('#sideOutline .outline-item').length,
        tables: $$('#content table').length,
        mermaid: $$('.mermaid-box').length,
        paper_bg: CS($('.reader-inner>.paper'),'background-color'),
        canvas: CS($('.reader'),'background-color'),
        font: CS($('#content p'),'font-size')
      };
      fire('#layoutSel','paper'); return 600;
    },
    function(){
      R.paper = {
        cards: $$('.doc-card').length,
        paper_bg: CS($('.reader-inner>.paper'),'background-color'),
        radius: CS($('.reader-inner>.paper'),'border-radius'),
        head_font: CS($('#content h1'),'font-family').slice(0,40),
        font: CS($('#content p'),'font-size')
      };
      $('#btnFontUp').click();
      setTimeout(function(){}, 0);
      return 400;
    },
    function(){
      R.font_up = { paper: CS($('#content p'),'font-size') };
      fire('#layoutSel','card'); return 500;
    },
    function(){
      R.back = { cards: $$('.doc-card').length, font: CS($('#content p'),'font-size'),
                 paper_bg: CS($('.reader-inner>.paper'),'background-color'),
                 nested_cards: $$('.doc-card .doc-card').length };
      var b = $('#btnRecent'); if (b) b.click();
      setTimeout(function(){
        R.recent = { open: !$('#recentWrap').classList.contains('hidden'),
                     items: $$('#recentList .rc-item').length };
        document.title = 'RES|' + encodeURIComponent(JSON.stringify(R));
      }, 400);
      return 'ASYNC';
    }
  ];
  var i=0;
  (function next(){ if(i>=seq.length) return; var d=seq[i++]();
    if(d==='ASYNC') return; if(typeof d==='number') setTimeout(next,d); else next(); })();
})();
</script>
"""


def main():
    html = (DIST / "MDReader.html").read_text(encoding="utf-8")
    idx = html.find("/* MD Reader v1.0")
    s = html.rfind("<script>", 0, idx)
    html = html[:s] + PROBE.replace("%MD%", json.dumps(MD)) + html[s:]
    e = html.rindex("</html>")
    html = html[:e] + SNAP + html[e:]

    f = HERE / "_verify_portable.html"
    f.write_text(html, encoding="utf-8", newline="\n")
    PROFILE.mkdir(exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=16000",
           "--window-size=1360,900", "--dump-dom", f.as_uri() + "?auto=1"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED:", unquote(m.group(1)) if m else "no title / " + (p.stderr or "")[-400:])
        return 1
    R = json.loads(unquote(m.group(1)[4:]))

    # profile 会持久化字号（localStorage），基准值逐次漂移 → 用相对增量校验
    def px(s):
        try:
            return float(str(s).replace("px", ""))
        except Exception:
            return -999.0

    base = px(R["env"]["font"])
    checks = [
        ("便携版未注入桌面 API", R["env"]["has_desktop_api"] is False),
        ("无 data-desktop 标记", R["env"]["data_desktop"] == "(none)"),
        ("版本与环境标签", R["env"]["stBuild"] == "MD Reader v%s · 本地窗口" % SHORT_VERSION),
        ("默认卡片皮肤", R["env"]["layout"] == "card"),
        ("分节 %d 张卡片" % EXPECT_CARDS, R["env"]["cards"] == EXPECT_CARDS),
        ("大纲项数 %s ≥ 10（示例文档含新增章节）" % R["env"]["outline"], R["env"]["outline"] >= 10),
        ("表格与 Mermaid 正常", R["env"]["tables"] >= 1 and R["env"]["mermaid"] >= 1),
        ("卡片画布 #fafafa", R["env"]["canvas"] == "rgb(250, 250, 250)"),
        ("卡片纸面纯白", R["env"]["paper_bg"] == "rgb(255, 255, 255)"),
        ("纸张画布暖米", R["paper"]["paper_bg"] == "rgb(253, 251, 246)"),
        ("纸张 2px 圆角", R["paper"]["radius"] == "2px"),
        ("纸张衬线标题", "Iowan" in R["paper"]["head_font"] or "Palatino" in R["paper"]["head_font"]),
        ("纸张正文比卡片 +0.5px", abs(px(R["paper"]["font"]) - (base + 0.5)) < 0.01),
        ("A+ 在纸张皮肤生效 (+1px)", abs(px(R["font_up"]["paper"]) - (base + 1.5)) < 0.01),
        ("切回卡片不叠加", R["back"]["nested_cards"] == 0 and R["back"]["cards"] == EXPECT_CARDS),
        ("字号跟随切回卡片 (+1px)", abs(px(R["back"]["font"]) - (base + 1)) < 0.01),
        ("最近打开面板可用", R["recent"]["open"] and R["recent"]["items"] >= 1),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())