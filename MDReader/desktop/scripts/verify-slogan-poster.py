# -*- coding: utf-8 -*-
"""欢迎屏产品口号改为图片海报，并验证深色模式自动反色。
   - 浅色模式：显示图片，无 filter
   - 深色模式：computed filter 含 invert（保持品牌红的 hue-rotate）
   - 同时生成浅色 / 深色两张实拍截图
"""
import json
import re
import tempfile
import subprocess
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DIST = ROOT / "dist"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE = Path(tempfile.mkdtemp(prefix="mdr-slogan-"))

SNAP = """
<script>
(function(){
  function $(s){ return document.querySelector(s); }
  var R = { steps: [] };
  try {
    var img = $('img.w-slogan-img');
    R.has_img = !!img;
    R.src_ok = !!(img && img.src && img.src.indexOf('data:image/jpeg;base64,') === 0);
    R.light_filter = img ? getComputedStyle(img).filter : '';
    document.documentElement.setAttribute('data-theme', 'dark');
    R.dark_filter = img ? getComputedStyle(img).filter : '';
    R.steps.push('ok');
  } catch (e) {
    R.error = String(e && e.stack || e);
  }
  setTimeout(function () { document.title = 'RES|' + encodeURIComponent(JSON.stringify(R)); }, 200);
})();
</script>
"""


def run_dump(html_file):
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=16000",
           "--window-size=1000,760", "--dump-dom", html_file.as_uri()]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED dump:", unquote(m.group(1)) if m else (p.stderr or "")[-400:])
        return None
    return json.loads(unquote(m.group(1)[4:]))


def run_shot(html_file, out_png):
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=16000",
           "--window-size=1000,760", "--screenshot=" + str(out_png), html_file.as_uri()]
    subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")


def main():
    html = (DIST / "MDReader.html").read_text(encoding="utf-8")
    e = html.rindex("</html>")

    f_check = HERE / "_verify_slogan_check.html"
    f_check.write_text(html[:e] + SNAP + html[e:], encoding="utf-8", newline="\n")

    f_light = HERE / "_verify_slogan_light.html"
    f_light.write_text(html[:e] + '<script>document.documentElement.setAttribute("data-theme","light")</script>' + html[e:],
                       encoding="utf-8", newline="\n")
    f_dark = HERE / "_verify_slogan_dark.html"
    f_dark.write_text(html[:e] + '<script>document.documentElement.setAttribute("data-theme","dark")</script>' + html[e:],
                      encoding="utf-8", newline="\n")

    R = run_dump(f_check)
    if R is None:
        return 1
    print("  raw:", json.dumps(R, ensure_ascii=False))

    light_none = (R.get("light_filter") in ("none", "", "none ")) or R.get("light_filter") == "none"
    checks = [
        ("口号为 <img> 图片元素", R.get("has_img") is True),
        ("图片以 data:image/jpeg;base64 内嵌（离线）", R.get("src_ok") is True),
        ("浅色模式无 filter（不反色）", light_none),
        ("深色模式自动反色（filter 含 invert）",
         isinstance(R.get("dark_filter"), str) and "invert" in R.get("dark_filter", "")),
        ("全程无 JS 异常", R.get("error") is None),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))

    out_light = HERE / "_slogan_light.png"
    out_dark = HERE / "_slogan_dark.png"
    run_shot(f_light, out_light)
    run_shot(f_dark, out_dark)
    print("  截图: %s , %s" % (out_light.name, out_dark.name))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
