import urllib.request
import json
import sys
sys.path.insert(0, 'Backend')
import database

# Generate token directly
token = database.create_auth_session(1, 'admin')
print(f"Generated session token: {token[:10]}...")

# Test POST /api/teams/labels
team_req = urllib.request.Request(
    'http://localhost:5005/api/teams/labels',
    data=json.dumps({
        "coordinator_name": "Ghada Hesham",
        "labels": ["price_inquiry", "taqfel"]
    }).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
)
with urllib.request.urlopen(team_req) as resp:
    res_data = json.loads(resp.read().decode('utf-8'))
    print("Team Labels API Response:", res_data)
