#!/usr/bin/env bash
# ============================================================
#  GitHub / Git Bash 环境自检   —— 小W 生成
#  用法：在 Git Bash 里执行   bash github-check.sh
#  说明：只读检测，不修改任何配置
# ============================================================
set -u

PASS=0
FAIL=0
ok()  { echo "  [OK]   $1"; PASS=$((PASS+1)); }
bad() { echo "  [!!]   $1"; FAIL=$((FAIL+1)); }

echo ""
echo "=============================================="
echo " Git / GitHub 环境自检"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

echo ""
echo "---- 1. Git 本体 ----"
if command -v git >/dev/null 2>&1; then
  ok "git: $(git --version)  ($(command -v git))"
else
  bad "未找到 git 命令，需重新安装 Git for Windows"
fi

echo ""
echo "---- 2. 提交身份 ----"
NAME=$(git config --global user.name 2>/dev/null || true)
MAIL=$(git config --global user.email 2>/dev/null || true)
[ -n "$NAME" ] && ok "user.name  = $NAME" || bad "user.name 未配置"
[ -n "$MAIL" ] && ok "user.email = $MAIL" || bad "user.email 未配置"

echo ""
echo "---- 3. 换行符策略 ----"
CRLF=$(git config --system --get core.autocrlf 2>/dev/null || git config --global --get core.autocrlf 2>/dev/null || true)
case "$CRLF" in
  true)  ok "core.autocrlf = true（Windows 推荐，与教程默认一致）" ;;
  input) ok "core.autocrlf = input" ;;
  "")    bad "core.autocrlf 未设置" ;;
  *)     ok "core.autocrlf = $CRLF" ;;
esac

echo ""
echo "---- 4. SSH 密钥 ----"
if [ -f "$HOME/.ssh/id_ed25519" ]; then
  ok "私钥存在: ~/.ssh/id_ed25519"
  FP=$(ssh-keygen -lf "$HOME/.ssh/id_ed25519.pub" 2>/dev/null || echo "无法读取指纹")
  ok "指纹: $FP"
else
  bad "缺少 ~/.ssh/id_ed25519（未生成密钥）"
fi

if [ -f "$HOME/.ssh/config" ] && grep -qi "github.com" "$HOME/.ssh/config" 2>/dev/null; then
  ok "~/.ssh/config 已包含 github.com 配置"
else
  bad "~/.ssh/config 未配置 github.com"
fi

echo ""
echo "---- 5. 端口连通 ----"
for hp in github.com:22 github.com:443 ssh.github.com:443; do
  H=${hp%:*}; P=${hp#*:}
  if timeout 6 bash -c "echo > /dev/tcp/$H/$P" 2>/dev/null; then
    ok "$hp 可连通"
  else
    bad "$hp 不通（可能需要代理或换 443 通道）"
  fi
done

echo ""
echo "---- 6. GitHub SSH 认证 ----"
OUT=$(timeout 20 ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new git@github.com 2>&1 || true)
if echo "$OUT" | grep -q "successfully authenticated"; then
  ok "认证成功 -> $(echo "$OUT" | head -1)"
  SSH_OK=1
elif echo "$OUT" | grep -q "Permission denied (publickey)"; then
  bad "握手成功但公钥未注册 —— 需把 ~/.ssh/id_ed25519.pub 加到 GitHub"
  SSH_OK=0
else
  bad "未完成认证: $(echo "$OUT" | head -1)"
  SSH_OK=0
fi

echo ""
echo "---- 7. HTTPS 通道 ----"
if timeout 25 git ls-remote https://github.com/git/git.git HEAD >/dev/null 2>&1; then
  ok "HTTPS 访问 GitHub 正常（公开仓库可直接 clone）"
elif env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
       timeout 25 git ls-remote https://github.com/git/git.git HEAD >/dev/null 2>&1; then
  ok "HTTPS 正常，但当前 shell 有代理变量干扰（已自动绕开）"
  echo "         建议: unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY"
else
  bad "HTTPS 访问失败（检查网络/DNS/防火墙）"
fi

echo ""
echo "=============================================="
echo " 结果: $PASS 项通过, $FAIL 项待处理"
if [ "$FAIL" -eq 0 ]; then
  echo " 环境就绪，可以直接 git clone 了。"
else
  echo " 按上面 [!!] 项逐条处理即可。"
fi
echo "=============================================="
echo ""

# 把本次结果同时存一份到当前目录
OUTFILE="github-check-$(date '+%Y%m%d-%H%M%S').txt"
{
  echo "Git/GitHub 自检结果  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "通过 $PASS 项，待处理 $FAIL 项"
} > "$OUTFILE" 2>/dev/null && echo "结果已保存: $PWD/$OUTFILE"
