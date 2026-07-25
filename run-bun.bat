@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo  MDproViewer - quick start (Bun)
echo ========================================
echo.

REM --- Check Bun ---
where bun >nul 2>&1
if %errorlevel% equ 0 goto :bun_ok

echo [!] Bun was not found.
echo [*] Trying to install Bun via winget...
echo.

where winget >nul 2>&1
if %errorlevel% neq 0 (
  echo [X] winget is not available.
  echo     Please install Bun manually from:
  echo     https://bun.sh/
  echo     Or: powershell -c "irm bun.sh/install.ps1 ^| iex"
  echo     Then run this file again.
  pause
  exit /b 1
)

winget install --id Oven.Bun -e --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 (
  echo [X] Failed to install Bun via winget.
  echo     Please install Bun manually from https://bun.sh/
  echo     Or: powershell -c "irm bun.sh/install.ps1 ^| iex"
  pause
  exit /b 1
)

REM Refresh PATH from registry (new shell needed otherwise)
call :refresh_path

where bun >nul 2>&1
if %errorlevel% neq 0 (
  if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  )
)

where bun >nul 2>&1
if %errorlevel% neq 0 (
  echo [X] Bun was installed, but this terminal cannot find it yet.
  echo     Close this window and run run-bun.bat again.
  pause
  exit /b 1
)

:bun_ok
echo [OK] Bun:
bun -v
echo.

REM --- Install dependencies if needed ---
if not exist "node_modules\" (
  echo [*] Installing dependencies: bun install
  call bun install
  if %errorlevel% neq 0 (
    echo [X] bun install failed.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [OK] node_modules already exists. Skipping bun install.
  echo.
)

REM --- Build + preview ---
echo [*] Starting: bun run preview
echo     (builds dist, then serves a production-like preview)
echo.
call bun run preview
set "EXITCODE=%errorlevel%"

if %EXITCODE% neq 0 (
  echo.
  echo [X] bun run preview exited with code %EXITCODE%.
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
if exist "%USERPROFILE%\.bun\bin" (
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
)
exit /b 0
