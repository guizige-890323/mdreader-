# Third-Party Licenses

MD Reader is released under the [MIT License](../LICENSE). It bundles the
following third-party components; each remains under its own license, and the
original copyright notices are retained.

## Bundled into the single-file build

These are inlined into `MDReader/dist/MDReader.html` by `src/build.py`, so they
ship with every distribution.

| Component | Version | License | Source | Used for |
| --- | --- | --- | --- | --- |
| [marked](https://github.com/markedjs/marked) | 15.0.12 | MIT | `src/vendor/marked.min.js` | Markdown → HTML |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.11.1 | BSD-3-Clause | `src/vendor/hljs.min.js`, `hljs.css` | Code syntax highlighting |
| [Mermaid](https://github.com/mermaid-js/mermaid) | 10.9.1 | MIT | `src/vendor/mermaid.min.js` | ```` ```mermaid ```` diagrams |

`mermaid.min.js` is a pre-built bundle that also contains Mermaid's own
transitive dependencies, including:

| Component | License |
| --- | --- |
| [d3](https://github.com/d3/d3) | ISC |
| [dagre-d3-es](https://github.com/tbo47/dagre-es) | MIT |
| [khroma](https://github.com/fabiospampinato/khroma) | MIT |
| [dompurify](https://github.com/cure53/DOMPurify) | Apache-2.0 OR MPL-2.0 |
| [cytoscape](https://github.com/cytoscape/cytoscape.js) | MIT |
| [lodash-es](https://github.com/lodash/lodash) | MIT |
| [dayjs](https://github.com/iamkun/dayjs) | MIT |
| [stylis](https://github.com/thysultan/stylis) | MIT |

For the authoritative list, inspect the banner and license comments inside
`src/vendor/mermaid.min.js`, or run `npx license-checker` against the upstream
package.

## Desktop runtime (not in the portable or iOS builds)

The Windows installer bundles the Electron runtime. Its license text ships
inside the installed application.

| Component | Version | License |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | 45.3.x | MIT |
| [Chromium](https://www.chromium.org/) (contained in Electron) | — | BSD-3-Clause and others |
| [Node.js](https://nodejs.org/) (contained in Electron) | — | MIT |

## Build-time only (not distributed)

| Component | License | Purpose |
| --- | --- | --- |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT | Packages the NSIS installer |
| [NSIS](https://nsis.sourceforge.io/) | zlib/libpng | Installer engine |

## Fonts

MD Reader uses **system fonts only** — no web fonts are downloaded or embedded.
The paper skin requests a serif stack (`Iowan Old Style`, `Georgia`, `SimSun`),
all of which are provided by the operating system.

## Trademarks

"Markdown" is used descriptively. Obsidian, Visual Studio Code and Apple are
trademarks of their respective owners; MD Reader is not affiliated with, or
endorsed by, any of them.

---

## 中文说明

本项目以 MIT 协议开源。上面列出的第三方组件各自保留原协议：

- **marked**（Markdown 解析）— MIT
- **highlight.js**（代码高亮）— BSD-3-Clause
- **Mermaid**（图表）— MIT，其打包文件内还含 d3、dagre-d3-es、khroma、dompurify 等传递依赖
- **Electron**（桌面运行时，仅安装版包含）— MIT

所有组件均以离线文件形式内嵌，运行时不从任何 CDN 加载。字体全部使用系统字体，
不下载、不嵌入任何 Web 字体。
