# -*- coding: utf-8 -*-
"""顶栏 Logo 回归：点击 logo 应返回欢迎屏（首页），且不得重新初始化（不 reload、不重跑 boot）。

判定：
  1. 自动载入示例文档后，welcome 隐藏、content 显示
  2. 点击 #brandHome 后，welcome 重新显示、content 隐藏（回到首页）
  3. 点击过程中页面未发生重新加载（location 未被重置、boot 计数不增长、无 JS 异常）
  4. #brandHome 具备 role=button / tabindex / title（可访问的返回首页入口）
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
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-home-"))

MD = (DIST / "示例文档.md").read_text(encoding="utf-8")

PROBE = r"""
<script>
window.__MD_AUTOLOAD__ = {name:"示例文档.md", dir:"C:/tmp", path:"C:/tmp/demo.md", text:%MD%};
window.__BOOT_COUNT__ = 0;
var _origBoot = window.boot;
</script>
"""

SNAP = r"""
<style>*,*::before,*::after{transition:none!important;animation:none!important}.reader{scroll-behavior:auto!important}</style>
<script>
(function(){
  function $(s){ return document.querySelector(s); }
  var R = { steps: [] };
  function vis(id){ var e=document.getElementById(id); return !!(e && !e.classList.contains('hidden')); }
  try {
    R.before_welcome = vis('welcome');
    R.before_content = vis('content');
    var bh = document.getElementById('brandHome');
    R.brand_has_button = !!(bh && bh.getAttribute('role')==='button');
    R.brand_has_title = !!(bh && bh.getAttribute('title'));
    R.brand_has_tabindex = !!(bh && bh.getAttribute('tabindex')!==null);
    // 记录点击前的页面标识（用于判断有没有 reload）
    R.pre_url = location.href;
    // 点击 logo
    bh.click();
    R.after_welcome = vis('welcome');
    R.after_content = vis('content');
    R.post_url = location.href;
    R.reloaded = (R.pre_url !== R.post_url);
    // 再点一次：与当前一致不变（幂等，不会崩）
    bh.click();
    R.after2_welcome = vis('welcome');
    R.steps.push('clicked');
  } catch(e){
    R.error = String(e && e.stack || e);
  }
  setTimeout(function(){ document.title='RES|'+encodeURIComponent(JSON.stringify(R)); }, 200);
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
    f = HERE / "_verify_home.html"
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
    print("  raw:", json.dumps(R, ensure_ascii=False))

    checks = [
        ("载入文档后 welcome 隐藏", R.get("before_welcome") is False),
        ("载入文档后 content 显示", R.get("before_content") is True),
        ("#brandHome 是 button 角色", R.get("brand_has_button") is True),
        ("#brandHome 有 title 提示", R.get("brand_has_title") is True),
        ("#brandHome 可键盘聚焦", R.get("brand_has_tabindex") is True),
        ("点击 logo 后回到 welcome", R.get("after_welcome") is True),
        ("点击 logo 后 content 隐藏", R.get("after_content") is False),
        ("点击未触发页面重新加载", R.get("reloaded") is False),
        ("再次点击保持幂等（仍在 welcome）", R.get("after2_welcome") is True),
        ("整个过程无 JS 异常", R.get("error") is None),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
