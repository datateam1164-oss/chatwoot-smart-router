import sys
sys.path.insert(0, 'Backend')
import crm_service
import database
import requests
from datetime import datetime, timedelta
import pytz

CAIRO_TZ = pytz.timezone("Africa/Cairo")
today = datetime.now(CAIRO_TZ)

token = crm_service.get_valid_crm_token()
settings = database.get_settings()
base_url = settings.get("crm_base_url", "https://sales-management-system-obyr.onrender.com").rstrip('/')
headers = {"Authorization": f"Bearer {token}"}

all_crm_employees = {} # email -> details

print("Scanning CRM shift planning for past 14 days...")
for i in range(15):
    d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
    url = f"{base_url}/api/schedules/admin/shift-planning"
    try:
        res = requests.get(url, params={"date": d}, headers=headers, timeout=15)
        if res.status_code == 200:
            details = res.json().get("details", [])
            for item in details:
                email = (item.get("loginEmail") or "").strip().lower()
                name = (item.get("employeeName") or "").strip()
                coord = (item.get("coordinatorName") or "").strip()
                if email and email not in all_crm_employees:
                    all_crm_employees[email] = {
                        "name": name,
                        "email": email,
                        "code": item.get("employeeCode"),
                        "coordinator": coord,
                        "date_seen": d
                    }
                elif email and coord and not all_crm_employees[email].get("coordinator"):
                    all_crm_employees[email]["coordinator"] = coord
        print(f"Date {d}: {len(details)} records (total unique emps: {len(all_crm_employees)})")
    except Exception as e:
        print(f"Error on {d}: {e}")

print(f"\nTotal unique CRM employees found: {len(all_crm_employees)}")

keywords = ['fargh', 'merna', 'menna', 'heba', 'hepa', 'hoda', 'ayman', 'marwa', 'hassan', 'shabaan', 'shaaban']
print("\n=== MATCHING TARGET EMPLOYEES ACROSS PAST CRM SCHEDULES ===")
for email, emp in all_crm_employees.items():
    combined = f"{emp['name']} {emp['email']} {emp.get('code', '')}".lower()
    if any(k in combined for k in keywords):
        print(f"Name: {emp['name']:<25} | Email: {emp['email']:<30} | Coordinator: {emp['coordinator']} | Seen: {emp['date_seen']}")
