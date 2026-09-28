import sys
sys.path.insert(0, 'Backend')
import database

conn = database.get_db()
c = conn.cursor()
c.execute("SELECT id, name FROM agents WHERE LOWER(TRIM(coordinator_name)) = 'ghada hesham' LIMIT 1")
first_agent = c.fetchone()
print(f"Testing individual override for: {first_agent['name']} ({first_agent['id']})")

database.update_agent_labels(first_agent['id'], ['moasker'])

c.execute("SELECT name, assigned_labels FROM agents WHERE LOWER(TRIM(coordinator_name)) = 'ghada hesham'")
for r in c.fetchall():
    print(r['name'], "|", r['assigned_labels'])
