#!/usr/bin/env bash
# 一键推送 v1.7.0 到 GitHub（先手动建空仓 https://github.com/new，名字 mdreader，Public，不勾任何初始化文件）
set -e

REPO="/f/豆包工作空间/github开源项目/MD Reader"
REMOTE="git@github.com:guizige-890323/mdreader.git"

cd "$REPO"

echo "== 1/4 检查远端仓库是否已建 =="
if ! env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY git ls-remote "$REMOTE" >/dev/null 2>&1; then
  echo "✗ 远端仓库还不存在或不可访问。"
  echo "  请先打开 https://github.com/new ，Repository name 填 mdreader，选 Public，"
  echo "  不要勾 Add a README / .gitignore / license，点 Create repository，然后重跑本脚本。"
  exit 1
fi
echo "✓ 远端可访问"

echo "== 2/4 配置 remote =="
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git remote -v

echo "== 3/4 推送 main =="
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY git push -u origin main

echo "== 4/4 推送 tag v1.7.0 =="
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY git push origin v1.7.0

echo
echo "✓ 完成。打开 https://github.com/guizige-890323/mdreader 确认："
echo "  - 文件数 199"
echo "  - 右侧出现 v1.7.0 的 Releases 区块（空 Release 区正常，附件还没传）"
