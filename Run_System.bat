@echo off
chcp 65001 >nul
title Chatwoot Smart Routing System
color 0B

echo ======================================================================
echo           🚀 Starting Chatwoot Smart Routing System
echo ======================================================================
echo.

echo [1/3] Starting backend server on port 5005...
start "Chatwoot Server" "%~dp0Backend\run_backend.bat"

echo [2/3] Waiting for server to initialize...
timeout /t 4 >nul

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "LOCAL_IP=%%a"
    goto :IP_FOUND
)
set "LOCAL_IP= localhost"

:IP_FOUND
set "LOCAL_IP=%LOCAL_IP: =%"

echo.
echo ======================================================================
echo  ✅ System is LIVE!
echo ----------------------------------------------------------------------
echo  🖥️ Local Dashboard:
echo     👉 http://localhost:5005
echo.
echo  📱 Team Access Link (Local Network / Wi-Fi):
echo     👉 http://%LOCAL_IP%:5005
echo ======================================================================
echo.

echo [3/3] Opening Dashboard in browser...
start http://localhost:5005

timeout /t 5 >nul
exit
