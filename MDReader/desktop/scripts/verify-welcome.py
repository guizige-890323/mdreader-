# -*- coding: utf-8 -*-
"""欢迎屏「功能亮点」改造回归：
   - 连续循环滚动跑马灯（#reelFeats / .w-reel.marquee / #dotsFeats）已彻底移除
   - 改为静态响应式网格 #gridFeats，含 10 张卡（2 张重点新功能 + 8 张原有）
   - 2 张重点卡带「新」标签，文本转流程图 / Mermaid 流动美化 在列
   - 全程无 JS 异常
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
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-welcome-"))

SNAP = r"""
<style>*,*::before,*::after{transition:none!important;animation:none!important}.reader{scroll-behavior:auto!important}</style>
<script>
(function(){
  function $(s){ return document.querySelector(s); }
  function $all(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
  var R = { steps: [] };
  try {
    R.has_marquee = !!$('#reelFeats') || !!$('.w-reel.marquee') || !!$('#dotsFeats');
    R.has_grid = !!$('#gridFeats');
    var cards = $all('#gridFeats .w-card');
    R.card_count = cards.length;
    var feats = $all('#gridFeats .w-card.feat');
    R.feat_count = feats.length;
    R.feat_tags = feats.map(function(c){ var t=c.querySelector('.w-tag'); return t?t.textContent:''; });
    R.titles = cards.map(function(c){ var b=c.querySelector('b'); return b?b.textContent:''; });
    R.has_textflow = R.titles.indexOf('文本转流程图') >= 0;
    R.has_mermaid = R.titles.indexOf('Mermaid 流动美化') >= 0;

    R.has_shot_reel = !!$('#reelShots') || !!$('.w-reel.shots') || !!$('#dotsShots');
    R.has_shotgrid = !!$('#shotGrid');
    R.shot_count = $all('#shotGrid .shot-card').length;
    R.shot_sub_all = $all('.w-sec-sub').map(function(s){ return s.textContent; });
    R.steps.push('scanned');
  } catch(e){
    R.error = String(e && e.stack || e);
  }
  setTimeout(function(){ document.title='RES|'+encodeURIComponent(JSON.stringify(R)); }, 200);
})();
</script>
"""


def main():
    html = (DIST / "MDReader.html").read_text(encoding="utf-8")
    e = html.rindex("</html>")
    html = html[:e] + SNAP + html[e:]
    f = HERE / "_verify_welcome.html"
    f.write_text(html, encoding="utf-8", newline="\n")

    PROFILE.mkdir(parents=True, exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=16000",
           "--window-size=1000,760", "--dump-dom", f.as_uri()]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED:", unquote(m.group(1)) if m else "no title / " + (p.stderr or "")[-400:])
        return 1
    R = json.loads(unquote(m.group(1)[4:]))
    print("  raw:", json.dumps(R, ensure_ascii=False))

    checks = [
        ("跑马灯元素已彻底移除（无 #reelFeats/.marquee/#dotsFeats）", R.get("has_marquee") is False),
        ("静态网格 #gridFeats 存在", R.get("has_grid") is True),
        ("共 10 张功能卡（2 重点 + 8 原有）", R.get("card_count") == 10),
        ("2 张重点卡带 feat 样式", R.get("feat_count") == 2),
        ("重点卡均带「新」标签", R.get("feat_tags") == ["新", "新"]),
        ("含「文本转流程图」", R.get("has_textflow") is True),
        ("含「Mermaid 流动美化」", R.get("has_mermaid") is True),
        ("截图轮播元素已彻底移除（无 #reelShots/.w-reel.shots/#dotsShots）", R.get("has_shot_reel") is False),
        ("静态网格 #shotGrid 存在", R.get("has_shotgrid") is True),
        ("共 6 张截图卡", R.get("shot_count") == 6),
        ("存在「真实界面截图」副标题且不再含「横向滚动播放」",
         (lambda L: "真实界面截图" in L and all("横向滚动播放" not in s for s in L))(R.get("shot_sub_all") or [])),
        ("全程无 JS 异常", R.get("error") is None),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
