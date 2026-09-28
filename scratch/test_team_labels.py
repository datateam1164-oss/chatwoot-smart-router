import sys
sys.path.insert(0, 'Backend')
import database

res = database.update_team_labels('Ghada Hesham', ['price_inquiry', 'discount_inquiry'])
print(f"Updated Ghada team: {res} agents")

conn = database.get_db()
c = conn.cursor()
c.execute("SELECT name, coordinator_name, assigned_labels FROM agents WHERE LOWER(TRIM(coordinator_name)) = 'ghada hesham'")
for r in c.fetchall():
    print(r['name'], "|", r['coordinator_name'], "|", r['assigned_labels'])
