@echo off
title Chatwoot Smart Routing System
color 0B

echo ========================================================
echo   Starting Chatwoot Smart Routing System
echo ========================================================
echo.

echo [1/2] Starting server...
start "Chatwoot Server" "%~dp0Backend\run_backend.bat"

echo [2/2] Opening Dashboard in browser...
ping 127.0.0.1 -n 4 >nul
start http://localhost:5005

exit
