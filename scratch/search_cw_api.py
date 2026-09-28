import sys
sys.path.insert(0, 'Backend')
import database
import requests

settings = database.get_settings()
token = settings.get("chatwoot_access_token")
base_url = settings.get("chatwoot_base_url", "https://crm.elkheta.com").rstrip("/")
account_id = settings.get("chatwoot_account_id", "1")

res = requests.get(f"{base_url}/api/v1/accounts/{account_id}/agents", headers={"api_access_token": token}, timeout=15)
cw_agents = res.json()
if isinstance(cw_agents, dict):
    cw_agents = cw_agents.get("payload", []) or cw_agents.get("data", []) or []

print(f"Total Chatwoot Agents from API: {len(cw_agents)}")

def search_cw(kw):
    print(f"\n--- Chatwoot search for: {kw} ---")
    for a in cw_agents:
        n = a.get('name', '')
        e = a.get('email', '')
        if kw.lower() in n.lower() or kw.lower() in e.lower():
            print(f"ID: {a.get('id'):<5} | Name: {n:<25} | Email: {e}")

search_cw("fargh")
search_cw("merna")
search_cw("mirna")
search_cw("menna")
search_cw("mena")
search_cw("marwa")
search_cw("huda")
search_cw("ayman")
search_cw("hassan")
search_cw("shaban")
