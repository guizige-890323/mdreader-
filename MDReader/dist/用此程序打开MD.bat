@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
set "HERE_N=%HERE:~0,-1%"

if "%~1"=="" (
  echo.
  echo   Usage: drag a .md file onto this bat, or set it as "Open with" app.
  echo   ---------------------------------------------------------------
  echo   Right-click any .md file ^> Open with ^> Choose another app ^>
  echo   More apps ^> Look for another app on this PC ^> pick this bat.
  echo.
  pause
  exit /b
)

set "TARGET=%~f1"
set "AUTO=1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%open-with.ps1" -Target "%TARGET%" -Here "%HERE_N%" >nul
if errorlevel 1 (
  echo Prepare failed, opening reader without auto-load.
  set "AUTO=0"
)

set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if "%AUTO%"=="0" set "EDGE="
set "URL=file:///%HERE:\=/%MDReader.html?auto=1&v=1.2"

if defined EDGE (
  start "" "%EDGE%" --app="%URL%" --window-size=1440,920 --allow-file-access-from-files --disable-features=msEdgeSplitScreen
) else (
  start "" "%HERE%MDReader.html"
)
exit /b
