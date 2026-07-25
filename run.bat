@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo  MDproViewer - quick start
echo ========================================
echo.

REM --- Check Node.js ---
where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ok

echo [!] Node.js was not found.
echo [*] Trying to install Node.js LTS via winget...
echo.

where winget >nul 2>&1
if %errorlevel% neq 0 (
  echo [X] winget is not available.
  echo     Please install Node.js LTS manually from:
  echo     https://nodejs.org/
  echo     Then run this file again.
  pause
  exit /b 1
)

winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 (
  echo [X] Failed to install Node.js via winget.
  echo     Please install Node.js LTS manually from https://nodejs.org/
  pause
  exit /b 1
)

REM Refresh PATH from registry (new shell needed otherwise)
call :refresh_path

where node >nul 2>&1
if %errorlevel% neq 0 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  )
)

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [X] Node.js was installed, but this terminal cannot find it yet.
  echo     Close this window and run run.bat again.
  pause
  exit /b 1
)

:node_ok
echo [OK] Node.js:
node -v
echo [OK] npm:
call npm -v
echo.

REM --- Install dependencies if needed ---
if not exist "node_modules\" (
  echo [*] Installing dependencies: npm install
  call npm install
  if %errorlevel% neq 0 (
    echo [X] npm install failed.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [OK] node_modules already exists. Skipping npm install.
  echo.
)

REM --- Build + preview ---
echo [*] Starting: npm run preview
echo     (builds dist, then serves a production-like preview)
echo.
call npm run preview
set "EXITCODE=%errorlevel%"

if %EXITCODE% neq 0 (
  echo.
  echo [X] npm run preview exited with code %EXITCODE%.
  pause
)

exit /b %EXITCODE%

REM ---------- helpers ----------
:refresh_path
set "SYSPATH="
set "USERPATH="
for /f "skip=2 tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%B"
for /f "skip=2 tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USERPATH=%%B"
if defined SYSPATH (
  if defined USERPATH (
    set "PATH=%SYSPATH%;%USERPATH%"
  ) else (
    set "PATH=%SYSPATH%"
  )
)
exit /b 0
