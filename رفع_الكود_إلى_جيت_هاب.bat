@echo off
chcp 65001 >nul
title رفع مشروع Chatwoot Router إلى GitHub
color 0A

echo ======================================================================
echo           🚀 تجهيز ورفع كود النظام إلى GitHub للنشر على Render
echo ======================================================================
echo.

:: Check Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Users\ROOT\MinGit\cmd\git.exe" (
        set "PATH=C:\Users\ROOT\MinGit\cmd;%PATH%"
    ) else if exist "C:\Program Files\Git\cmd\git.exe" (
        set "PATH=C:\Program Files\Git\cmd;%PATH%"
    ) else (
        echo ❌ لم يتم العثور على Git مثبت في النظام!
        pause
        exit /b 1
    )
)

echo [1/4] تجهيز مستودع Git المحلي...
cd /d "%~dp0"
if not exist ".git" (
    git init
    git branch -M main
)

echo.
echo [2/4] إضافة الملفات وتجهيز الـ Commit...
git add .
git commit -m "Deploy Chatwoot Smart Router & Dashboard to Cloud" >nul 2>&1

echo.
echo [3/4] تحديد رابط المستودع على GitHub:
echo يرجى نسخ رابط مستودع GitHub الخاص بك ولصقه هنا:
echo (مثال: https://github.com/YourUsername/chatwoot-smart-router.git)
echo.
set /p REPO_URL="🔗 رابط المستودع (GitHub URL): "

if "%REPO_URL%"=="" (
    echo ⚠️ لم تقم بإدخال رابط المستودع! تم إلغاء الرفع.
    pause
    exit /b 1
)

git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%

echo.
echo [4/4] جاري رفع الكود إلى GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo ✅ تم رفع الكود بنجاح إلى GitHub!
    echo الآن يمكنك الدخول إلى dashboard.render.com وربط المستودع بنقرة واحدة.
    echo ======================================================================
) else (
    echo.
    echo ⚠️ حدث خطأ أثناء الرفع! تأكد من تسجيل دخولك إلى GitHub أو صحة الرابط.
)

echo.
pause
