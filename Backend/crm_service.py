import requests
import re
import logging
from datetime import datetime
import pytz
import database

logger = logging.getLogger(__name__)
CAIRO_TZ = pytz.timezone("Africa/Cairo")

DEFAULT_CRM_URL = "https://sales-management-system-obyr.onrender.com"

def clean_employee_name(raw_name: str) -> str:
    if not raw_name:
        return ""
    if "|" in raw_name:
        return raw_name.split("|")[-1].strip()
    cleaned = re.sub(r"^#?[A-Za-z0-9]+-", "", raw_name)
    parts = [p.strip() for p in cleaned.split("-") if p.strip()]
    if parts:
        return parts[0]
    return raw_name.strip()

def format_shift_display(start_str: str, end_str: str, working: bool, shift_type: str = ""):
    if not working or not start_str or not end_str:
        return None, None, "Weekend"
    
    try:
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))
        
        # 12-hour format strings
        def to_12h(h, m):
            p = "AM" if h < 12 or h == 24 else "PM"
            disp_h = h % 12
            if disp_h == 0: disp_h = 12
            return f"{disp_h}:{m:02d} {p}" if m else f"{disp_h}:00 {p}"
            
        disp = f"{to_12h(sh, sm)} - {to_12h(eh, em)}"
        # 24-hour end adjustment (midnight = 24)
        if eh == 0: eh = 24
        return sh, eh, disp
    except Exception:
        return None, None, shift_type or "Shift"

def login_crm(email, password, base_url=DEFAULT_CRM_URL):
    if not email or not password:
        return False, "يجب إدخال البريد الإلكتروني وكلمة المرور للـ CRM"
    
    url = f"{base_url.rstrip('/')}/api/auth/login"
    try:
        res = requests.post(url, json={"email": email, "password": password}, timeout=15)
        if res.status_code in [200, 201]:
            data = res.json()
            token = data.get("token") or (data.get("data") or {}).get("token") or data.get("accessToken")
            if token:
                database.set_setting("crm_token", token)
                database.set_setting("crm_email", email)
                database.set_setting("crm_password", password)
                logger.info("✅ Logged in to CRM successfully")
                return True, token
            return False, "لم يتم العثور على التوكن في استجابة الخادم"
        else:
            return False, f"فشل تسجيل الدخول: {res.status_code}"
    except Exception as e:
        logger.error(f"❌ CRM Login Error: {e}")
        return False, str(e)

def get_valid_crm_token():
    settings = database.get_settings()
    token = settings.get("crm_token")
    if token:
        return token
    email = settings.get("crm_email")
    password = settings.get("crm_password")
    if email and password:
        success, res = login_crm(email, password, settings.get("crm_base_url", DEFAULT_CRM_URL))
        if success:
            return res
    return None

def fetch_crm_shift_planning(date_str=None):
    if not date_str:
        date_str = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")

    settings = database.get_settings()
    base_url = settings.get("crm_base_url", DEFAULT_CRM_URL)
    token = get_valid_crm_token()

    if not token:
        return False, "غير مسجل الدخول في نظام الـ CRM.", []

    url = f"{base_url.rstrip('/')}/api/schedules/admin/shift-planning"
    params = {"date": date_str}
    headers = {"Authorization": f"Bearer {token}"}

    try:
        res = requests.get(url, params=params, headers=headers, timeout=20)
        if res.status_code == 401:
            email = settings.get("crm_email")
            password = settings.get("crm_password")
            if email and password:
                success, new_token = login_crm(email, password, base_url)
                if success:
                    headers["Authorization"] = f"Bearer {new_token}"
                    res = requests.get(url, params=params, headers=headers, timeout=20)

        if res.status_code == 200:
            data = res.json()
            details = data.get("details", [])
            return True, "تم جلب الشيفتات بنجاح", details
        else:
            return False, f"خطأ من سيرفر الـ CRM: {res.status_code}", []
    except Exception as e:
        logger.error(f"❌ fetch_crm_shift_planning error: {e}")
        return False, str(e), []

def sync_shifts_to_database():
    now = datetime.now(CAIRO_TZ)
    date_str = now.strftime("%Y-%m-%d")
    success, msg, details = fetch_crm_shift_planning(date_str)
    
    if not success:
        logger.warning(f"⚠️ CRM Sync Failed: {msg}")
        return {"success": False, "message": msg, "synced_count": 0}

    # Load Chatwoot agents from API / DB to match
    settings = database.get_settings()
    token = settings.get("chatwoot_access_token")
    base_url = settings.get("chatwoot_base_url", "https://crm.elkheta.com").rstrip("/")
    account_id = settings.get("chatwoot_account_id", "1")
    try:
        cw_res = requests.get(f"{base_url}/api/v1/accounts/{account_id}/agents", headers={"api_access_token": token}, timeout=15)
        cw_data = cw_res.json()
        if isinstance(cw_data, list):
            cw_agents = cw_data
        elif isinstance(cw_data, dict):
            cw_agents = cw_data.get("payload", []) or cw_data.get("data", []) or []
        else:
            cw_agents = []
    except Exception as e:
        logger.error(f"❌ Error fetching CW agents: {e}")
        cw_agents = database.get_all_agents()

    cw_by_email = {a.get("email", "").strip().lower(): a for a in cw_agents if a.get("email")}
    cw_by_name = {a.get("name", "").strip().lower(): a for a in cw_agents if a.get("name")}

    # Custom mappings
    mappings_list = database.get_all_mappings()
    mapping_dict = {m["crm_name"].strip().lower(): m["chatwoot_agent_id"] for m in mappings_list}
    cw_by_id = {str(a.get("id")): a for a in cw_agents}

    synced_count = 0
    matched_results = []

    for item in details:
        crm_name = item.get("employeeName", "").strip()
        crm_code = item.get("employeeCode", "").strip()
        crm_email = item.get("loginEmail", "").strip().lower()
        working = item.get("working", True)
        shift_start_str = item.get("shiftStart", "")
        shift_end_str = item.get("shiftEnd", "")
        shift_type = item.get("shiftType", "")
        coordinator_name = (item.get("coordinatorName") or "").strip()

        sh, eh, shift_disp = format_shift_display(shift_start_str, shift_end_str, working, shift_type)

        matched_cw = None
        # 1. Check custom mappings
        if crm_name.lower() in mapping_dict:
            matched_cw = cw_by_id.get(str(mapping_dict[crm_name.lower()]))
        elif crm_code.lower() in mapping_dict:
            matched_cw = cw_by_id.get(str(mapping_dict[crm_code.lower()]))

        # 2. Check exact Email match (Highest accuracy!)
        if not matched_cw and crm_email and crm_email in cw_by_email:
            matched_cw = cw_by_email[crm_email]

        # 3. Check exact Name match
        if not matched_cw and crm_name.lower() in cw_by_name:
            matched_cw = cw_by_name[crm_name.lower()]

        # 4. Fuzzy / partial match
        if not matched_cw:
            for cw_n, ag in cw_by_name.items():
                if len(cw_n) > 4 and (cw_n in crm_name.lower() or crm_name.lower() in cw_n):
                    matched_cw = ag
                    break

        if matched_cw:
            ag_id = str(matched_cw.get("id"))
            ag_name = matched_cw.get("name")
            
            # Save or update agent in DB
            database.upsert_agent({
                "id": ag_id,
                "name": ag_name,
                "crm_name": crm_name,
                "shift_start": sh,
                "shift_end": eh,
                "shift_text": shift_disp,
                "team": "Sales",
                "coordinator_name": coordinator_name or None,
                "is_selected": 1 if working else 0
            })
            synced_count += 1
            matched_results.append({
                "crm_name": crm_name,
                "cw_name": ag_name,
                "shift": shift_disp,
                "working": working
            })

    database.set_setting("crm_last_sync", now.isoformat())
    logger.info(f"✅ CRM Sync completed: {synced_count} sales agents updated with today's shifts.")
    return {
        "success": True,
        "message": f"تمت مزامنة {synced_count} موظف سيلز بنجاح وفق جداول اليوم",
        "synced_count": synced_count,
        "total_records": len(details),
        "results": matched_results
    }
