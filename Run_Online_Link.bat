@echo off
chcp 65001 >nul
title Cloudflare Online Link Generator - Chatwoot Router
color 0B

echo ======================================================================
echo       🌐 مولّد الرابط الأونلاين للسيستم (Cloudflare Online Link)
echo ======================================================================
echo.
echo [i] جاري فحص وتشغيل النفق السحابي الآمن لربط السيستم بالإنترنت...
echo.

if not exist "%~dp0cloudflared.exe" (
    echo [i] جاري تحميل أداة كلاود فلير لأول مرة...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
    if not exist "%~dp0cloudflared.exe" (
        echo ❌ فشل التحميل التلقائي للأداة. يرجى التأكد من اتصال الإنترنت.
        pause
        exit /b 1
    )
)

echo [✓] الأداة جاهزة.
echo.
echo ======================================================================
echo 🚀 جاري استخراج الرابط الأونلاين العام الآن...
echo.
echo ⚠️  تعليمات الاستخدام:
echo    1. انسخ الرابط الذي سيظهر بالأسفل (الذي ينتهي بـ: .trycloudflare.com)
echo    2. ابعته للشباب، هيفتح معاهم الداشبورد أونلاين فوراً من أي مكان أو موبايل!
echo    3. بيانات الدخول: admin / elkheta2026
echo    4. اترك هذه الشاشة السوداء مفتوحة طوال فترة العمل ليبقى الرابط شغالاً.
echo ======================================================================
echo.

"%~dp0cloudflared.exe" tunnel --url http://127.0.0.1:5005

pause
