@echo off
title Updating Chatwoot Smart Router...
color 0B
cd /d "%~dp0"

echo ========================================================
echo   Updating Chatwoot Smart Router to Latest Version...
echo ========================================================
echo.

where python >nul 2>&1
if %errorlevel% equ 0 (
    python update.py
    exit /b 0
)

where py >nul 2>&1
if %errorlevel% equ 0 (
    py update.py
    exit /b 0
)

for /d %%i in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%i\python.exe" (
        "%%i\python.exe" update.py
        exit /b 0
    )
)

for /d %%i in ("C:\Python*") do (
    if exist "%%i\python.exe" (
        "%%i\python.exe" update.py
        exit /b 0
    )
)

echo ERROR: Python is not installed or not found in PATH!
pause
exit /b 1
