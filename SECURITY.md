# Security Policy

## Supported versions

MD Reader is a local, offline application. Security fixes are issued for the
latest minor release only.

| Version | Supported |
| --- | --- |
| 1.3.x | ✅ |
| < 1.3 | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report privately by email to **527400412@qq.com** with the subject prefix
`[SECURITY]`, and include:

1. Affected version and distribution (portable / Windows installer / iOS PWA)
2. Steps to reproduce, or a minimal Markdown file / document that triggers it
3. What an attacker could achieve (for example: read local files, execute code,
   exfiltrate data)
4. Your environment (OS version, app version)

You will get an acknowledgement within **7 days**. If the report is confirmed,
a fix and a coordinated disclosure date will be agreed with you; credit will be
given in the release notes unless you prefer to stay anonymous.

## Scope

In scope:

- `MDReader/src/` — the renderer, including the custom Mermaid renderer
  (`mermaid-flow.js`) and the text-to-diagram parser (`text-flow.js`)
- `MDReader/desktop/` — the Electron shell (`main.js`, `preload.js`) and its
  IPC surface
- The portable launcher scripts (`.bat`, `.ps1`) and the NSIS installer
- Anything that causes the app to make an outbound network request

Out of scope:

- Vulnerabilities in third-party dependencies that are already fixed upstream
  (please report them to the upstream project; Dependabot tracks them here)
- Issues that require an already-compromised machine, or physical access
- Social-engineering scenarios
- Denial of service caused by deliberately pathological Markdown input, unless
  it crashes the app persistently

## Design guarantees

These are deliberate properties of the project. A report that any of them has
been broken is treated as a security issue:

- **No outbound network requests.** marked, highlight.js and Mermaid are inlined
  at build time; the running application performs no external `fetch`.
- **No document upload.** Documents are parsed in the local renderer process
  only.
- **Electron hardening.** `nodeIntegration: false`, `contextIsolation: true`, and
  a `contextBridge` allow-list; external links are handed to the system browser.
- **No registry writes** in the portable distribution — deleting the folder
  removes every trace.
- Recents and preferences live in `localStorage` (portable) or
  `%APPDATA%\mdreader` (desktop) and never leave the machine.

## Verifying the offline claim yourself

Search the source for any network call:

```bash
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|https?://" MDReader/src/*.js \
  | grep -v "^\s*//"
```

The only expected matches are URLs in comments, documentation strings, or
third-party source that is never invoked with a remote endpoint.

---

## 中文说明

**发现安全问题不要开公开 Issue**，直接发邮件到 **527400412@qq.com**，标题带
`[SECURITY]`，附上版本、复现步骤和影响范围。7 天内会给答复。

本项目承诺「零联网、零上传」——如果你发现任何越过这条线的情况，那就属于
安全漏洞，按上面的流程上报即可。
