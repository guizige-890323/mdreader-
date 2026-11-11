'use strict';
/*
 * afterPack 钩子：在 NSIS 打包之前，用本地 rcedit 把新版品牌图标与版本信息
 * 写进 MD Reader.exe。
 *
 * 为什么不用 electron-builder 自带的 signAndEditExecutable：
 *   该开关会触发从 GitHub 下载 winCodeSign，而当前构建环境无法访问 github.com，
 *   导致构建失败。改为自带 build/rcedit-x64.exe（离线），由本钩子完成相同工作。
 *
 * 触发条件：仅 win32 平台、且 appOutDir 下存在 MD Reader.exe。
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, 'MD Reader.exe');
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] 跳过：未找到', exePath);
    return;
  }

  const rcedit = path.join(__dirname, '..', 'build', 'rcedit-x64.exe');
  const icon = path.join(__dirname, '..', 'build', 'icon.ico');
  if (!fs.existsSync(rcedit) || !fs.existsSync(icon)) {
    throw new Error('[afterPack] 缺少 rcedit 或 icon：' + rcedit + ' / ' + icon);
  }

  const args = [
    exePath,
    '--set-icon', icon,
    '--set-version-string', 'FileDescription', 'MD Reader',
    '--set-version-string', 'ProductName', 'MD Reader',
    '--set-version-string', 'LegalCopyright', 'Copyright © 2026 MDReader Contributors',
    '--set-file-version', '1.3.0',
    '--set-product-version', '1.3.0',
  ];

  console.log('[afterPack] 用 rcedit 写入图标 / 版本 ->', exePath);
  execFileSync(rcedit, args, { stdio: 'inherit' });
  console.log('[afterPack] 图标与版本信息已应用 ✅');
};
