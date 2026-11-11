@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE (
  echo Edge not found. Opening in default browser...
  start "" "%HERE%MDReader.html"
  exit /b
)
set "URL=file:///%HERE:\=/%MDReader.html?v=1.3"
start "" "%EDGE%" --app="%URL%" --window-size=1440,920 --allow-file-access-from-files --disable-features=msEdgeSplitScreen
exit /b
