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

python "%~dp0Backend\tunnel.py"

pause

