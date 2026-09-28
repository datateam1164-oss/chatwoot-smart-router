# 🚀 دليل نشر نظام التوزيع السحابي على Render (مثل نظام الـ CRM)

هذا الدليل يوضح بالخطوات المبسطة كيفية رفع وتشغيل **Chatwoot Smart Router & Dashboard** على منصة **Render** السحابية ليعمل 24 ساعة متواصلة مع إتاحة الدخول لجميع أفراد فريق العمل برابط دائم.

---

## 📋 المتطلبات البسيطة:
1. حساب على موقع **[Render.com](https://render.com)** (نفس المنصة المرفوع عليها الـ CRM).
2. حساب على **[GitHub.com](https://github.com)** لربط الكود.

---

## 🛠️ الخطوة الأولى: رفع الكود على GitHub

1. ادخل على حسابك في GitHub واضغط على **New Repository** (مستودع جديد).
2. سمّ المستودع مثلاً: `chatwoot-smart-router`.
3. اجعله **Private** (خاص) أو **Public** واضغط **Create Repository**.
4. انسخ رابط المستودع (مثال: `https://github.com/YourUsername/chatwoot-smart-router.git`).
5. في المجلد، سنقوم برفع الكود بأمر واحد:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Render cloud deployment"
   git branch -M main
   git remote add origin https://github.com/YourUsername/chatwoot-smart-router.git
   git push -u origin main
   ```

---

## 🌐 الخطوة الثانية: إنشاء الخدمة على Render

1. ادخل إلى لوحة تحكم Render: **[dashboard.render.com](https://dashboard.render.com)**
2. اضغط على زر **`New +`** في أعلى اليمين واختر **`Web Service`**.
3. اختر **`Build and deploy from a Git repository`**.
4. اختر مستودعك من القائمة: `chatwoot-smart-router` (أو الصق رابطه واضغط Connect).
5. املأ الإعدادات التالية:
   - **Name:** `chatwoot-smart-router` (أو أي اسم تفضله).
   - **Region:** `Frankfurt (EU Central)` (أقرب منطقة لمصر وسريعة جداً).
   - **Branch:** `main`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r Backend/requirements.txt`
   - **Start Command:** `python Backend/app.py`
   - **Instance Type:** `Free` (مجاني).
6. اضغط في الأسفل على **`Deploy Web Service`**.

⏳ انتظر دقيقة إلى دقيقتين حتى يكتمل البناء، وسيظهر لك رابط الموقع الدائم مثل:
👉 **`https://chatwoot-smart-router.onrender.com`**

---

## ⚡ الخطوة الثالثة: إبقاء السيرفر شغال 24/7 (منع خمول الباقة المجانية)

خوادم Render المجانية تدخل في وضع سكون (Sleep) إذا لم يفتحها أحد لمدة 15 دقيقة. لإبقاء محرك التوزيع شغالاً بدون انقطاع 24/7 مجاناً:
1. ادخل على موقع فحص مجاني مثل **[Cron-Job.org](https://cron-job.org)** أو **[UptimeRobot](https://uptimerobot.com)**.
2. أنشئ حساباً مجانياً واضغط **Create Cronjob** أو **Add New Monitor**.
3. ضع الرابط التالي الخاص بك:
   ```
   https://chatwoot-smart-router.onrender.com/api/health
   ```
4. اضبط التكرار على: **كل 10 دقائق (Every 10 minutes)**.
5. احفظ الإعداد ⬅️ سيبقى السيرفر مستيقظاً ومحرك التوزيع يعمل على مدار الساعة!

---

## 👥 إدارة دخول الشباب والتيم:
- افتح رابط السيرفر من أي موبايل أو جهاز.
- سجل الدخول بالحساب الافتراضي: `admin` / `elkheta2026`.
- ادخل على **الإعدادات ⬅️ أمان النظام** وأنشئ يوزرات وباسوردات لفريق العمل ليدخلوا بها.
