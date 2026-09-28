import sys
sys.path.insert(0, 'Backend')
import database

conn = database.get_db()
c = conn.cursor()
c.execute("SELECT id, name, crm_name FROM agents WHERE coordinator_name = 'nada tarek 2'")
for r in c.fetchall():
    print(r['name'], "->", r['crm_name'])
