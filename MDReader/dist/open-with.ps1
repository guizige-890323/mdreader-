# Called by "OpenWithMD.bat": writes target .md content into _autoload.js for startup auto-load.
# IMPORTANT: keep this file pure ASCII (Windows PowerShell 5.1 reads BOM-less files as ANSI).
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$Here
)
$ErrorActionPreference = 'Stop'

$bytes = [System.IO.File]::ReadAllBytes($Target)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
# Fall back to GB18030 / GBK when UTF-8 decoding produces replacement characters.
if ($text.Contains([char]0xFFFD)) {
  try { $text = [System.Text.Encoding]::GetEncoding(936).GetString($bytes) } catch { }
}
$text = $text.TrimStart([char]0xFEFF)

$name = [System.IO.Path]::GetFileName($Target)
$dir = [System.IO.Path]::GetDirectoryName($Target)
# Absolute path lets the reader re-read the file later for the "Recent" list.
$full = [System.IO.Path]::GetFullPath($Target)
$jName = ConvertTo-Json -InputObject $name -Compress
$jDir = ConvertTo-Json -InputObject $dir -Compress
$jPath = ConvertTo-Json -InputObject $full -Compress
$jText = ConvertTo-Json -InputObject $text -Compress
$js = "window.__MD_AUTOLOAD__={name:$jName,dir:$jDir,path:$jPath,text:$jText};"

$out = Join-Path $Here '_autoload.js'
[System.IO.File]::WriteAllText($out, $js, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "autoload ready: $out"
