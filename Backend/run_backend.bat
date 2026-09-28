@echo off
chcp 65001 >nul
title Chatwoot Smart Router Server
color 0A

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
if exist "%~dp0_internal\certifi\cacert.pem" (
    set "SSL_CERT_FILE=%~dp0_internal\certifi\cacert.pem"
    set "REQUESTS_CA_BUNDLE=%~dp0_internal\certifi\cacert.pem"
)
cd /d "%~dp0"

echo ======================================================================
echo           🚀 تشغيل سيرفر التوزيع الذكي ولوحة التحكم (Port 5005)
echo ======================================================================
echo.

:: 1. البحث عن بايثون في متغيرات البيئة PATH
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
    goto :CHECK_DEPS
)

:: 2. البحث عن py launcher
where py >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py -3"
    goto :CHECK_DEPS
)

:: 3. البحث في المسارات القياسية للتثبيت على الويندوز
for /d %%i in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :CHECK_DEPS
    )
)
for /d %%i in ("C:\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :CHECK_DEPS
    )
)
for /d %%i in ("%ProgramFiles%\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :CHECK_DEPS
    )
)
for /d %%i in ("%ProgramFiles(x86)%\Python*") do (
    if exist "%%i\python.exe" (
        set "PY_CMD=%%i\python.exe"
        goto :CHECK_DEPS
    )
)

:PYTHON_NOT_FOUND
echo ======================================================================
echo ❌ تنبيه: لم يتم العثور على بايثون (Python) مثبت على هذا الجهاز!
echo.
echo هل تريد تثبيت بايثون تلقائياً الآن؟
echo اضغط [Y] للموافقة على التثبيت التلقائي، أو [N] للإلغاء:
set /p USER_CHOICE="اختيارك (Y/N): "
if /i "%USER_CHOICE%"=="Y" (
    echo.
    echo ⏳ جاري تثبيت بايثون عبر Windows Package Manager (winget)...
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    echo.
    echo ✅ اكتمل التثبيت! يرجى إعادة تشغيل هذا الملف الآن لتفعيل المسار.
    pause
    exit /b 0
) else (
    echo.
    echo يمكنك تحميل وتثبيت بايثون يدوياً من:
    echo 👉 https://www.python.org/downloads/
    echo وتأكد من تفعيل خيار: [x] Add Python to PATH أثناء التثبيت.
    pause
    exit /b 1
)

:CHECK_DEPS
echo [✓] تم التعرف على بيئة بايثون: %PY_CMD%

:: فحص المكاتب المطلوبة
"%PY_CMD%" -c "import flask, flask_cors, requests, pytz, openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [i] جاري تثبيت متطلبات التشغيل لأول مرة على هذا الجهاز...
    echo     (قد يستغرق ذلك دقيقة واحدة)...
    "%PY_CMD%" -m pip install --quiet -r requirements.txt
    if %errorlevel% neq 0 (
        echo ⚠️ حدث تنبيه أثناء تثبيت المكاتب، جاري المحاولة بدون quiet...
        "%PY_CMD%" -m pip install -r requirements.txt
    )
)

echo [✓] جميع المتطلبات جاهزة.
echo.
echo ======================================================================
echo 🌐 جاري تشغيل محرك التوزيع... (اترك هذه الشاشة مفتوحة في الخلفية)
echo ======================================================================
echo.

"%PY_CMD%" app.py
pause
