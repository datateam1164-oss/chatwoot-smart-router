import sqlite3

conn = sqlite3.connect('Backend/routing.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute("SELECT id, name, crm_name, team, coordinator_name FROM agents")
agents = c.fetchall()

print(f"Total agents in DB: {len(agents)}")

def search_agents(keyword):
    print(f"\n--- Search DB for: {keyword} ---")
    found = False
    for a in agents:
        name = a['name'] or ''
        crm = a['crm_name'] or ''
        if keyword.lower() in name.lower() or keyword.lower() in crm.lower():
            print(f"ID: {a['id']:<5} | Name: {name:<25} | CRM: {crm:<20} | Team: {a['team']} | Coord: {a['coordinator_name']}")
            found = True
    if not found:
        print("Not found.")

search_agents("merna")
search_agents("farghal")
search_agents("mirna")
search_agents("hoda")
search_agents("houda")
search_agents("ayman")
search_agents("maryam")
search_agents("mariam")
search_agents("marwa")
search_agents("menna")
search_agents("heba")
search_agents("hepa")
