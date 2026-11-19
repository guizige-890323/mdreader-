#!/usr/bin/env bash
# ============================================================
# MD Reader · macOS 构建脚本
# 必须在 macOS 上执行：.icns / hdiutil / 签名都依赖 Apple 工具链。
# 用法： cd MDReader/desktop && bash scripts/build-mac.sh
# 产物： release/MD Reader-<package.json 的 version>.dmg
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 检查环境"
command -v node >/dev/null || { echo "缺少 Node.js 22+"; exit 1; }
command -v python3 >/dev/null || { echo "缺少 Python 3"; exit 1; }
[ "$(uname -s)" = "Darwin" ] || { echo "本脚本只能在 macOS 上运行"; exit 1; }

echo "==> 同步便携版渲染产物"
python3 scripts/sync-app.py

echo "==> 校验 JS 语法"
node --check main.js
node --check preload.js
node --check app/../main.js 2>/dev/null || true

echo "==> 安装依赖"
npm install --no-audit --no-fund

echo "==> 构建 .dmg"
npx electron-builder --mac

echo "==> 完成"
ls -lh release/*.dmg 2>/dev/null || true
cat <<'TIP'

安装后把 .app 拖进 Applications。
把 .md 设为默认打开程序：
  访达选中任意 .md → ⌘I 显示简介 → 打开方式选 MD Reader → 「全部更改…」
TIP
