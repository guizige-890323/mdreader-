# -*- coding: utf-8 -*-
"""主题矩阵回归：2 套排版皮肤 × 3 个主题，确认「护眼」不会被皮肤变量覆盖回「浅色」。

背景：html[data-layout="card"] / "paper" 与 html[data-theme="sepia"] 优先级相同，
若皮肤基础块写在主题块之后，会把护眼配色整体覆盖（深色因有双属性选择器而幸免）。
本脚本用真实无头 Edge 读计算样式，把这条约束固化成断言。
"""
import json
import re
import tempfile
import subprocess
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
DIST = ROOT / "dist"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-themes-"))


MD = (DIST / "示例文档.md").read_text(encoding="utf-8")

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
  function CS(e,p){ return e?getComputedStyle(e).getPropertyValue(p).trim():'NULL'; }
  function VAR(n){ return CS(document.documentElement,n); }
  function fire(id,v){ var e=$(id); if(!e) return; e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); }
  function snap(k){
    R[k] = {
      canvas: CS($('.reader'),'background-color'),
      paper: CS($('.reader-inner>.paper'),'background-color'),
      text: CS($('#content p'),'color'),
      accent: VAR('--accent'),
      rule: VAR('--rule'),
      badge: $('.card-id') ? CS($('.card-id'),'background-color') : '(none)',
      label: ($('#stTheme')||{}).textContent || ''
    };
  }
  var seq = [
    function(){ return 1200; },
    function(){ fire('#themeSel','light');  return 280; },
    function(){ snap('card_light');  fire('#themeSel','sepia'); return 320; },
    function(){ snap('card_sepia');  fire('#themeSel','dark');  return 320; },
    function(){ snap('card_dark');   fire('#themeSel','light'); fire('#layoutSel','paper'); return 420; },
    function(){ snap('paper_light'); fire('#themeSel','sepia'); return 320; },
    function(){ snap('paper_sepia'); fire('#themeSel','dark');  return 320; },
    function(){ snap('paper_dark');  fire('#themeSel','light');
      setTimeout(function(){ document.title='RES|'+encodeURIComponent(JSON.stringify(R)); }, 250);
      return 'ASYNC'; }
  ];
  var i=0;
  (function next(){ if(i>=seq.length) return; var d=seq[i++]();
    if(d==='ASYNC') return; if(typeof d==='number') setTimeout(next,d); else next(); })();
})();
</script>
"""

# 只比较在两种皮肤下都存在的属性
KEYS = ["canvas", "paper", "text", "accent", "rule"]


def main():
    html = (DIST / "MDReader.html").read_text(encoding="utf-8")
    idx = html.find("/* MD Reader v1.0")
    s = html.rfind("<script>", 0, idx)
    html = html[:s] + PROBE.replace("%MD%", json.dumps(MD)) + html[s:]
    e = html.rindex("</html>")
    html = html[:e] + SNAP + html[e:]
    f = HERE / "_verify_themes.html"
    f.write_text(html, encoding="utf-8", newline="\n")

    PROFILE.mkdir(parents=True, exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=18000",
           "--window-size=1360,900", "--dump-dom", f.as_uri() + "?auto=1"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED:", unquote(m.group(1)) if m else "no title / " + (p.stderr or "")[-400:])
        return 1
    R = json.loads(unquote(m.group(1)[4:]))

    checks = []
    for layout in ("card", "paper"):
        light, sepia, dark = (R["%s_%s" % (layout, t)] for t in ("light", "sepia", "dark"))
        diff = [k for k in KEYS if light[k] != sepia[k]]
        checks.append(("%s：护眼与浅色至少 4 项颜色不同（实际 %d/%d）" % (layout, len(diff), len(KEYS)),
                       len(diff) >= 4))
        checks.append(("%s：护眼状态栏标注正确" % layout, sepia["label"] == "护眼主题"))
        checks.append(("%s：护眼与深色也不同" % layout, sepia["canvas"] != dark["canvas"]))
        checks.append(("%s：浅色与深色是两种极端" % layout, light["canvas"] != dark["canvas"]))
    checks += [
        ("卡片浅色基准仍是 #fafafa / 纯白", R["card_light"]["canvas"] == "rgb(250, 250, 250)"
         and R["card_light"]["paper"] == "rgb(255, 255, 255)"),
        ("纸张浅色基准仍是暖米", R["paper_light"]["paper"] == "rgb(253, 251, 246)"),
        ("深色基准未被破坏", R["card_dark"]["canvas"] == "rgb(9, 9, 11)"
         and R["paper_dark"]["canvas"] == "rgb(21, 19, 15)"),
    ]

    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
