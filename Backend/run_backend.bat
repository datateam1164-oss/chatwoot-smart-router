@echo off
title Chatwoot Smart Router Server
color 0A

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
if exist "%~dp0_internal\certifi\cacert.pem" (
    set "SSL_CERT_FILE=%~dp0_internal\certifi\cacert.pem"
    set "REQUESTS_CA_BUNDLE=%~dp0_internal\certifi\cacert.pem"
)
cd /d "%~dp0"

echo ========================================================
echo   Starting Chatwoot Smart Router Server (Port 5005)
echo ========================================================
echo.

where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto :START_APP
)

where py >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py"
    goto :START_APP
)

for /d %%i in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :START_APP
    )
)
for /d %%i in ("C:\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :START_APP
    )
)

echo ERROR: Python is not installed or not in PATH!
pause
exit /b 1

:START_APP
echo [OK] Using Python: %PY_CMD%
echo [OK] Launching application...
echo.
"%PY_CMD%" app.py
echo.
echo Server stopped.
pause
