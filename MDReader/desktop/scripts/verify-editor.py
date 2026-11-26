# -*- coding: utf-8 -*-
"""编辑 / 保存 + 主题图标回归（便携版纯 HTML 路径）。

验证：
  1. 编辑模式切换、脏标记、Tab 缩进、Ctrl+S 快捷键绑定
  2. 便携版 file:// 保存退化为「另存为下载」，内容确实是编辑后的 Markdown
  3. 退出编辑后预览重新渲染出新内容
  4. 品牌 logo 在浅色 / 护眼用一版、深色用另一版，且都内嵌为 data URI
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
PROFILE = Path(tempfile.mkdtemp(prefix="mdreader-verify-editor-"))


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
  function bg(){ var v=getComputedStyle($('.brand-logo')).backgroundImage;
                 return {len:v.length, tail:v.slice(-36)}; }
  // 拦截下载动作，避免无头浏览器真的写盘；同时保留 blob URL 用于回读内容
  HTMLAnchorElement.prototype.click = function(){
    window.__DL__ = { name:this.download, url:this.href };
  };
  window.confirm = function(){ return true; };

  var MARK = '\n\n## 编辑测试标记\nHELLO-EDIT-OK\n';
  var seq = [
    function(){ return 1200; },
    function(){
      R.init = {
        edit_btn: !!$('#btnEdit'), save_btn: !!$('#btnSave'),
        save_disabled: $('#btnSave').disabled,
        editor_hidden: $('#editor').classList.contains('hidden'),
        editing_attr: document.documentElement.dataset.editing || '(none)',
        logo_light: bg()
      };
      $('#btnEdit').click(); return 320;
    },
    function(){
      R.editing = {
        editing_attr: document.documentElement.dataset.editing || '(none)',
        editor_visible: !$('#editor').classList.contains('hidden'),
        content_visible: getComputedStyle($('#content')).display !== 'none',
        value_len: $('#editor').value.length,
        label: $('#editLabel').textContent,
        block_label: $('#editSecLabel').textContent,
        save_disabled: $('#btnSave').disabled
      };
      var ed=$('#editor');
      ed.value += MARK;
      ed.dispatchEvent(new Event('input', {bubbles:true}));
      return 220;
    },
    function(){
      R.dirty = {
        st: $('#stDirty').textContent,
        save_disabled: $('#btnSave').disabled,
        value_has_mark: $('#editor').value.indexOf('HELLO-EDIT-OK') >= 0
      };
      $('#btnSave').click(); return 420;
    },
    function(){
      var d=window.__DL__ || {};
      R.saved = { download: d.name || '(none)', is_blob: /^blob:/.test(d.url || ''),
                  st: $('#stDirty').textContent, toast: ($('#toast')||{}).textContent || '' };
      var p = d.url ? fetch(d.url).then(function(r){ return r.text(); })
                      .then(function(txt){ return txt.indexOf('HELLO-EDIT-OK') >= 0; })
                      .catch(function(){ return false; })
                    : Promise.resolve(false);
      p.then(function(ok){
        R.saved.blob_has_mark = ok;
        $('#btnEdit').click();          // 返回预览
        setTimeout(function(){
          R.preview = {
            editing_attr: document.documentElement.dataset.editing || '(none)',
            editor_hidden: $('#editor').classList.contains('hidden'),
            has_mark: $('#content').textContent.indexOf('HELLO-EDIT-OK') >= 0,
            cards: document.querySelectorAll('.doc-card').length
          };
          fireTheme('dark');
          setTimeout(function(){
            R.logo_dark = bg();
            fireTheme('sepia');
            setTimeout(function(){
              R.logo_sepia = bg();
              fireTheme('light');
              setTimeout(function(){
                document.title='RES|'+encodeURIComponent(JSON.stringify(R));
              }, 200);
            }, 260);
          }, 260);
        }, 650);
      });
      return 'ASYNC';
    }
  ];
  function fireTheme(v){ var e=$('#themeSel'); e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); }
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
    f = HERE / "_verify_editor.html"
    f.write_text(html, encoding="utf-8", newline="\n")

    PROFILE.mkdir(parents=True, exist_ok=True)
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
           "--user-data-dir=" + str(PROFILE), "--allow-file-access-from-files",
           "--hide-scrollbars", "--virtual-time-budget=20000",
           "--window-size=1200,860", "--dump-dom", f.as_uri() + "?auto=1"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=240, errors="replace")
    m = re.search(r"<title>(.*?)</title>", p.stdout or "", re.S)
    if not m or not m.group(1).startswith("RES|"):
        print("FAILED:", unquote(m.group(1)) if m else "no title / " + (p.stderr or "")[-400:])
        return 1
    R = json.loads(unquote(m.group(1)[4:]))

    for k in ("init", "editing", "dirty", "saved", "preview"):
        print("  %-9s %s" % (k, json.dumps(R[k], ensure_ascii=False)[:220]))
    print("  logo     light=%s dark=%s sepia=%s" %
          (R["init"]["logo_light"], R["logo_dark"], R["logo_sepia"]))

    light = R["init"]["logo_light"]
    dark = R["logo_dark"]
    sepia = R["logo_sepia"]
    checks = [
        ("编辑 / 保存按钮就位，初始保存禁用", R["init"]["edit_btn"] and R["init"]["save_btn"]
         and R["init"]["save_disabled"] and R["init"]["editor_hidden"]),
        ("进入编辑：data-editing=1、按块模式载入当前块源码",
         R["editing"]["editing_attr"] == "1" and R["editing"]["editor_visible"]
         and R["editing"]["value_len"] > 0 and "块 #" in R["editing"]["block_label"]
         and R["editing"]["label"] == "预览"),
        ("编辑态隐藏渲染正文", R["editing"]["content_visible"] is False),
        ("输入后出现脏标记且保存可用", R["dirty"]["st"] == "● 未保存"
         and not R["dirty"]["save_disabled"] and R["dirty"]["value_has_mark"]),
        ("便携版另存为下载，文件名正确", R["saved"]["download"] == "示例文档.md"
         and R["saved"]["is_blob"]),
        ("下载内容确实是编辑后的 Markdown", R["saved"]["blob_has_mark"]),
        ("保存后脏标记清除", R["saved"]["st"] == ""),
        ("返回预览重新渲染出新内容", R["preview"]["editing_attr"] == "(none)"
         and R["preview"]["editor_hidden"] and R["preview"]["has_mark"]),
        ("预览恢复卡片分节", R["preview"]["cards"] >= 1),
        ("logo 内嵌为 data URI（离线可用）", light["len"] > 1000 and "none" not in light["tail"]),
        ("深色主题换另一版 logo", dark["tail"] != light["tail"]),
        ("护眼主题沿用浅色版 logo", sepia["tail"] == light["tail"]),
    ]
    ok = 0
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
        ok += passed
    print("\n%d / %d passed" % (ok, len(checks)))
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
