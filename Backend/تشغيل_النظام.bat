@echo off
chcp 65001 >nul
title Chatwoot Smart Routing System

echo ====================================================
echo   Starting Chatwoot Routing and Dashboard System...
echo ====================================================

echo [1/3] Starting Backend Server (Port 5005)...
start "Chatwoot Backend" "%~dp0Backend\run_backend.bat"

echo [2/3] Starting Frontend Dashboard (Port 5173)...
start "Chatwoot Frontend" "%~dp0Frontend\run_frontend.bat"

echo [3/3] Opening Dashboard in browser...
ping 127.0.0.1 -n 5 >nul
start http://localhost:5173

exit
