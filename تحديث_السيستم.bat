@echo off
chcp 65001 >nul
title تحديث نظام توزيع الشاتات الذكي - Chatwoot Router
color 0A

echo ======================================================================
echo          🚀 جاري تحديث نظام توزيع الشاتات لأحدث إصدار...
echo ======================================================================
echo.

REM 1. إيقاف أي سيرفر قديم شغال لمنع قفل الملفات
echo [1/3] إيقاف النظام الحالي لتطبيق التحديثات...
taskkill /F /IM python.exe /T 2>nul
timeout /t 1 >nul

REM 2. سحب أحدث نسخة من الكود
echo [2/3] جاري تنزيل أحدث الملفات والمميزات من GitHub...
where git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [i] الاتصال وتنزيل التحديثات عبر Git...
    git restore "%~dp0Backend\routing.db" 2>nul
    git pull origin main
) else (
    echo [i] جاري التنزيل المباشر لحزمة التحديث من الإنترنت...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/datateam1164-oss/chatwoot-smart-router/archive/refs/heads/main.zip' -OutFile '%~dp0update_temp.zip'"
    if exist "%~dp0update_temp.zip" (
        powershell -Command "Expand-Archive -Path '%~dp0update_temp.zip' -DestinationPath '%~dp0update_temp' -Force"
        xcopy /E /Y "%~dp0update_temp\chatwoot-smart-router-main\*" "%~dp0" >nul
        rmdir /S /Q "%~dp0update_temp"
        del "%~dp0update_temp.zip"
    )
)

echo.
echo ======================================================================
echo    ✅ تم تحديث النظام بنجاح إلى أحدث إصدار!
echo    🚀 جاري تشغيل النظام الجديد الآن...
echo ======================================================================
echo.

timeout /t 2 >nul
start "" "%~dp0Run_System.bat"

exit
