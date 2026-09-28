import json

data = json.load(open(r'C:\Users\ROOT\.gemini\antigravity\brain\f6d7e4aa-fc29-4b88-9de3-2a3f4387976a\scratch\crm_cw_matching_report.json', encoding='utf-8'))

keywords = ['farghal', 'merna', 'menna', 'heba', 'hepa', 'hoda', 'ayman', 'marwa', 'hassan', 'shabaan', 'shaaban']

print(f"=== MATCHED CRM ({len(data.get('matched_crm', []))}) ===")
for item in data.get('matched_crm', []):
    name = (item.get('crm_name') or '') + ' ' + (item.get('cw_name') or '') + ' ' + (item.get('crm_email') or '')
    if any(k in name.lower() for k in keywords):
        print(f"CW ID: {item.get('cw_id')} | CW Name: {item.get('cw_name')} | CRM Name: {item.get('crm_name')} | Email: {item.get('crm_email')}")

print(f"\n=== UNMATCHED CW AGENTS ({len(data.get('unmatched_cw_agents', []))}) ===")
for item in data.get('unmatched_cw_agents', []):
    name = (item.get('name') or '') + ' ' + (item.get('email') or '')
    if any(k in name.lower() for k in keywords):
        print(f"CW ID: {item.get('id')} | CW Name: {item.get('name')} | Email: {item.get('email')}")
