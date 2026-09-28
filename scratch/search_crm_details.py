import sys
sys.path.insert(0, 'Backend')
import crm_service
import json

success, msg, details = crm_service.fetch_crm_shift_planning()
print(f"Fetch success: {success}, msg: {msg}, Total records: {len(details)}")

def search_crm(query):
    print(f"\n--- Searching CRM for '{query}' ---")
    matches = []
    q = query.lower()
    for item in details:
        emp_name = (item.get("employeeName") or "").strip()
        login_email = (item.get("loginEmail") or "").strip()
        coord_name = (item.get("coordinatorName") or "").strip()
        coord_code = (item.get("coordinatorCode") or "").strip()
        emp_code = (item.get("employeeCode") or "").strip()
        
        if q in emp_name.lower() or q in login_email.lower() or q in emp_code.lower():
            matches.append(item)
            print(f"Name: {emp_name:<25} | Email: {login_email:<30} | Coordinator: {coord_name} ({coord_code}) | Working: {item.get('working')}")
    if not matches:
        print("No matches found.")

search_crm("farghal")
search_crm("merna")
search_crm("menna")
search_crm("heba")
search_crm("hepa")
search_crm("hoda")
search_crm("ayman")
search_crm("marwa")
search_crm("hassan")
search_crm("shabaan")
search_crm("shaaban")
