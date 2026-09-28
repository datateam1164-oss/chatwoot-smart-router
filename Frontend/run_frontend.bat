@echo off
chcp 65001 >nul
title Chatwoot Frontend Dashboard
color 0B
cd /d "%~dp0"
npm run dev
pause
