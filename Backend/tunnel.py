import os
import sys
import subprocess
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE_PATH = os.path.join(BASE_DIR, "cloudflared.exe")

def ensure_cloudflared():
    if not os.path.exists(EXE_PATH):
        print("🌐 جاري تحميل أداة كلاود فلير السحابية لأول مرة...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        try:
            urllib.request.urlretrieve(url, EXE_PATH)
            print("✅ تم تحميل الأداة بنجاح.")
        except Exception as e:
            print(f"❌ فشل تحميل الأداة التلقائي: {e}")
            return False
    return True

def start_tunnel(port=5005):
    if not ensure_cloudflared():
        return
    print("=" * 70)
    print("🚀 جاري استخراج الرابط الأونلاين العام الآن...")
    print("⚠️ تعليمات:")
    print("   1. انسخ الرابط الذي سيظهر بالأسفل (الذي ينتهي بـ: .trycloudflare.com)")
    print("   2. ابعته للشباب، هيفتح معاهم الداشبورد أونلاين فوراً من أي مكان أو موبايل!")
    print("   3. بيانات الدخول: admin / elkheta2026 (أو حساباتهم الشخصية)")
    print("   4. اترك هذه الشاشة السوداء مفتوحة طوال فترة العمل ليبقى الرابط شغالاً.")
    print("=" * 70 + "\n")
    try:
        subprocess.run([EXE_PATH, "tunnel", "--url", f"http://127.0.0.1:{port}"])
    except KeyboardInterrupt:
        print("\nتم إيقاف الرابط الأونلاين.")

if __name__ == "__main__":
    start_tunnel()
