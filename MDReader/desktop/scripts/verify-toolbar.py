# -*- coding: utf-8 -*-
"""顶栏冻结回归：点击大纲跳转 / 正文滚动后，工具栏必须完整、固定、层级最高。

覆盖三类退化：
  1. scrollIntoView 牵动祖先滚动链，导致工具栏被滚走或横向偏移
  2. 正文 sticky 元素（表头 / 卡片头）盖住工具栏
  3. 窄窗口下 overflow-x:auto 把右侧按钮裁掉
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
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-toolbar-"))


MD = (DIST / "示例文档.md").read_text(encoding="utf-8")

PROBE = r"""
<script>
window.__MD_AUTOLOAD__ = {name:"示例文档.md", dir:"C:/tmp", path:"C:/tmp/demo.md", text:%MD%};
</script>
"""

SNAP = r"""
<style>*,*::before,*::after{transition:none!important;animation:none!important}
/* 关掉正文平滑滚动：headless 下赋值 scrollTop 后立即读取才拿得到真实位置 */
.reader{scroll-behavior:auto!important}</style>
<script>
(function(){
  var R = {};
  function $(s){ return document.querySelector(s); }
  function rect(e){ var r=e.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)}; }
  function snap(k){
    var tb=$('.toolbar'), rd=$('#reader');
    var btns=Array.prototype.slice.call(tb.querySelectorAll('.btn,select.sel,.searchbox,.brand'));
    var over=btns.filter(function(b){ return b.getBoundingClientRect().right > window.innerWidth+1; });
    var cx=Math.min(window.innerWidth-8, Math.round(tb.getBoundingClientRect().width/2));
    var hit=document.elementFromPoint(cx, 24);
    R[k]={
      tb:rect(tb), scrollLeft:tb.scrollLeft, win_w:window.innerWidth,
      reader_scroll:Math.round(rd.scrollTop),
      overflow_btns:over.length, btn_count:btns.length,
      hit_in_toolbar: !!(hit && (hit===tb || tb.contains(hit))),
      hit_tag: hit ? hit.tagName+'.'+hit.className : '(none)'
    };
  }
  var seq=[
    function(){ return 1200; },
    function(){
      snap('before');
      // 选一个靠后的大纲项，强制正文滚动
      var items=document.querySelectorAll('#sideOutline .outline-item');
      var t=items[Math.min(items.length-1, 3)] || items[0];
      if(t) t.click();
      return 900;
    },
    function(){
      snap('after_outline');
      // 再滚到底，检查 sticky 表头是否盖住顶栏
      var rd=$('#reader'); rd.scrollTop=rd.scrollHeight;
      return 500;
    },
    function(){
      snap('after_scroll_end');
      setTimeout(function(){ document.title='RES|'+encodeURIComponent(JSON.stringify(R)); },200);
      return 'ASYNC';
    }
  ];
  var i=0;
  (function next(){ if(i>=seq.length)return; var d=seq[i++]();
    if(d==='ASYNC')return; if(typeof d==='number')setTimeout(next,d); else next(); })();
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
    f = HERE / "_verify_toolbar.html"
    f.write_text(html, encoding="utf-8", newline="\n")

    PROFILE.mkdir(parents=True, exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=16000",
           "--window-size=1000,760", "--dump-dom", f.as_uri() + "?auto=1"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED:", unquote(m.group(1)) if m else "no title / " + (p.stderr or "")[-400:])
        return 1
    R = json.loads(unquote(m.group(1)[4:]))

    for k in ("before", "after_outline", "after_scroll_end"):
        v = R[k]
        print("  %-18s tb.top=%-4d tb.scrollLeft=%-5d reader=%-6d overflow=%d/%d hit_toolbar=%s (%s)"
              % (k, v["tb"]["top"], v["scrollLeft"], v["reader_scroll"],
                 v["overflow_btns"], v["btn_count"], v["hit_in_toolbar"], v["hit_tag"]))

    a, b, c = R["before"], R["after_outline"], R["after_scroll_end"]
    checks = [
        ("工具栏固定在 top=0", all(v["tb"]["top"] == 0 for v in (a, b, c))),
        ("工具栏高度不变", len({v["tb"]["h"] for v in (a, b, c)}) == 1),
        ("工具栏未被横向滚走", all(v["scrollLeft"] == 0 for v in (a, b, c))),
        ("大纲跳转后正文确实滚动", b["reader_scroll"] > 0 or c["reader_scroll"] > 0),
        ("滚动后工具栏中心点未被遮挡", b["hit_in_toolbar"] and c["hit_in_toolbar"]),
        ("1000px 窗口下工具栏按钮全部可见", c["overflow_btns"] == 0),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
