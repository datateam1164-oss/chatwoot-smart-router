import sqlite3
import json

conn = sqlite3.connect('Backend/routing.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute("SELECT id, name, crm_name, team, coordinator_name FROM agents")
agents = [dict(r) for r in c.fetchall()]

search_keywords = [
    'ميرنا', 'فرغلي', 'منة', 'منه', 'هبة', 'هبه', 'هدى', 'هدي', 'أيمن', 'ايمن',
    'مروة', 'مروه', 'مصطفى', 'مصطفي', 'شعبان', 'مريم', 'حسن',
    'merna', 'menna', 'heba', 'hoda', 'marwa', 'mariam', 'maryam'
]

print("=== SEARCHING AGENTS IN DATABASE ===")
for a in agents:
    name_lower = (a['name'] or '').lower()
    crm_lower = (a['crm_name'] or '').lower()
    for kw in search_keywords:
        if kw.lower() in name_lower or kw.lower() in crm_lower:
            print(f"ID: {a['id']:<5} | CW: {a['name']:<25} | CRM: {str(a['crm_name']):<25} | Coord: {str(a['coordinator_name'])}")
            break
