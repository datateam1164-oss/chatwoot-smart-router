import sqlite3
import json
import os
import logging
import hashlib
import secrets
from datetime import datetime, timedelta
import pytz

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "routing.db")
CAIRO_TZ = pytz.timezone("Africa/Cairo")

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Agents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        crm_name TEXT,
        shift_start INTEGER,
        shift_end INTEGER,
        shift_text TEXT,
        is_selected INTEGER DEFAULT 1,
        is_paused INTEGER DEFAULT 0,
        chat_limit INTEGER DEFAULT 10,
        current_window_chats INTEGER DEFAULT 0,
        window_start_time TEXT,
        team TEXT,
        active_chats INTEGER DEFAULT 0,
        last_assigned_at TEXT,
        updated_at TEXT
    )
    """)

    # 2. Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # 3. Chats Log table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chats_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conv_id TEXT NOT NULL,
        agent_id TEXT,
        agent_name TEXT,
        label TEXT,
        assigned_at TEXT,
        status TEXT DEFAULT 'assigned'
    )
    """)

    # 4. Agent Mappings table (CRM Name <-> Chatwoot Agent)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_mappings (
        crm_name TEXT PRIMARY KEY,
        chatwoot_agent_id TEXT,
        chatwoot_agent_name TEXT,
        updated_at TEXT
    )
    """)

    # Ensure dynamic columns exist
    cursor.execute("PRAGMA table_info(agents)")
    agent_cols = [r["name"] for r in cursor.fetchall()]
    if "assigned_labels" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN assigned_labels TEXT")
    if "is_manual_shift" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN is_manual_shift INTEGER DEFAULT 0")
    if "crm_shift_start" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN crm_shift_start INTEGER")
    if "crm_shift_end" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN crm_shift_end INTEGER")
    if "crm_shift_text" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN crm_shift_text TEXT")
    if "daily_chat_limit" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN daily_chat_limit INTEGER DEFAULT 100")
    if "coordinator_name" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN coordinator_name TEXT")
    if "manual_selected_date" not in agent_cols:
        cursor.execute("ALTER TABLE agents ADD COLUMN manual_selected_date TEXT")

    cursor.execute("PRAGMA table_info(chats_log)")
    log_cols = [r["name"] for r in cursor.fetchall()]
    if "sender_phone" not in log_cols:
        cursor.execute("ALTER TABLE chats_log ADD COLUMN sender_phone TEXT")
    if "sender_name" not in log_cols:
        cursor.execute("ALTER TABLE chats_log ADD COLUMN sender_name TEXT")
    if "last_message" not in log_cols:
        cursor.execute("ALTER TABLE chats_log ADD COLUMN last_message TEXT")

    # Default settings if not set
    default_settings = {
        "chatwoot_base_url": "https://crm.elkheta.com",
        "chatwoot_access_token": "iyCoaajAwLLRvHGk3PAftUHi",
        "data_team_token": "iyCoaajAwLLRvHGk3PAftUHi",
        "reopen_access_token": "iyCoaajAwLLRvHGk3PAftUHi",
        "chatwoot_account_id": "1",
        "crm_base_url": "https://sales-management-system-obyr.onrender.com",
        "crm_email": "",
        "crm_password": "",
        "crm_token": "",
        "crm_last_sync": "",
        "default_limit": "10",
        "default_daily_limit": "100",
        "window_minutes": "30",
        "periodic_interval": "120",
        "route_unlabeled": "false",
        "valid_labels_order": json.dumps([
            "price_inquiry",
            "discount_inquiry",
            "high_price_complain",
            "package_compare",
            "moasker",
            "taqfel",
            "complete_profile",
            "unclassified"
        ])
    }

    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # 5. Users table for Authentication
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 6. Auth Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    # Insert default admin user if none exists
    cursor.execute("SELECT COUNT(*) as count FROM users")
    if cursor.fetchone()["count"] == 0:
        salt = secrets.token_hex(16)
        pw_hash = hashlib.sha256((salt + "elkheta2026").encode('utf-8')).hexdigest()
        cursor.execute("INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
                       ("admin", pw_hash, salt, "admin"))
        logger.info("🔑 Default admin user created (username: admin)")

    conn.commit()
    conn.close()
    logger.info("✅ SQLite Database initialized at: %s", DB_PATH)

# ── Agents Operations ───────────────────────────────────────────────

def get_all_agents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agents ORDER BY is_selected DESC, name ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def upsert_agent(agent_data):
    conn = get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    cursor.execute("""
    INSERT INTO agents (
        id, name, crm_name, shift_start, shift_end, shift_text,
        crm_shift_start, crm_shift_end, crm_shift_text,
        is_selected, is_paused, chat_limit, team, coordinator_name, updated_at
    ) VALUES (
        :id, :name, :crm_name, :shift_start, :shift_end, :shift_text,
        :shift_start, :shift_end, :shift_text,
        :is_selected, :is_paused, :chat_limit, :team, :coordinator_name, :updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
        name = COALESCE(:name, agents.name),
        crm_name = COALESCE(:crm_name, agents.crm_name),
        crm_shift_start = COALESCE(:shift_start, agents.crm_shift_start),
        crm_shift_end = COALESCE(:shift_end, agents.crm_shift_end),
        crm_shift_text = COALESCE(:shift_text, agents.crm_shift_text),
        shift_start = CASE WHEN agents.is_manual_shift = 1 THEN agents.shift_start ELSE COALESCE(:shift_start, agents.shift_start) END,
        shift_end = CASE WHEN agents.is_manual_shift = 1 THEN agents.shift_end ELSE COALESCE(:shift_end, agents.shift_end) END,
        shift_text = CASE WHEN agents.is_manual_shift = 1 THEN agents.shift_text ELSE COALESCE(:shift_text, agents.shift_text) END,
        is_selected = CASE 
            WHEN agents.manual_selected_date = :today_date THEN agents.is_selected
            ELSE COALESCE(:is_selected, agents.is_selected)
        END,
        team = COALESCE(:team, agents.team),
        coordinator_name = COALESCE(:coordinator_name, agents.coordinator_name),
        updated_at = :updated_at
    """, {
        "id": str(agent_data["id"]),
        "name": agent_data["name"],
        "crm_name": agent_data.get("crm_name") or None,
        "shift_start": agent_data.get("shift_start"),
        "shift_end": agent_data.get("shift_end"),
        "shift_text": agent_data.get("shift_text") or None,
        "is_selected": agent_data.get("is_selected"),
        "is_paused": agent_data.get("is_paused", 0),
        "chat_limit": agent_data.get("chat_limit", 10),
        "team": agent_data.get("team") or None,
        "coordinator_name": agent_data.get("coordinator_name") or None,
        "today_date": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d"),
        "updated_at": now_str
    })
    conn.commit()
    conn.close()

def update_agent_shift(agent_id, shift_start, shift_end, shift_text):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE agents 
        SET shift_start = ?, shift_end = ?, shift_text = ?, is_manual_shift = 1, updated_at = ? 
        WHERE id = ?
    """, (shift_start, shift_end, shift_text, datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def reset_agent_shift(agent_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE agents 
        SET shift_start = crm_shift_start, 
            shift_end = crm_shift_end, 
            shift_text = crm_shift_text, 
            is_manual_shift = 0, 
            updated_at = ? 
        WHERE id = ?
    """, (datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def apply_bulk_labels_preset(agent_ids, labels):
    conn = get_db()
    cursor = conn.cursor()
    labels_json = json.dumps(labels) if isinstance(labels, list) else labels
    now_str = datetime.now(CAIRO_TZ).isoformat()
    for ag_id in agent_ids:
        cursor.execute("UPDATE agents SET assigned_labels = ?, updated_at = ? WHERE id = ?", 
                       (labels_json, now_str, str(ag_id)))
    conn.commit()
    conn.close()

def update_team_labels(coordinator_name: str, labels: list):
    """
    Updates assigned_labels for all agents under a specific coordinator in bulk.
    """
    conn = get_db()
    cursor = conn.cursor()
    labels_json = json.dumps(labels) if isinstance(labels, list) else labels
    now_str = datetime.now(CAIRO_TZ).isoformat()
    coord_clean = coordinator_name.strip()
    
    if not coord_clean or coord_clean.lower() in ["بدون كوردينيتور", "بدون كوردينيتور (عام)", "none", "null"]:
        cursor.execute("""
            UPDATE agents 
            SET assigned_labels = ?, updated_at = ? 
            WHERE coordinator_name IS NULL OR coordinator_name = '' OR coordinator_name = 'بدون كوردينيتور'
        """, (labels_json, now_str))
    else:
        cursor.execute("""
            UPDATE agents 
            SET assigned_labels = ?, updated_at = ? 
            WHERE LOWER(TRIM(coordinator_name)) = LOWER(TRIM(?))
        """, (labels_json, now_str, coord_clean))
        
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected

def get_today_routed_count():
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM chats_log WHERE assigned_at LIKE ?", (f"{today_prefix}%",))
    count = cursor.fetchone()[0]
    conn.close()
    return count

def update_agent_selection(agent_id, is_selected):
    conn = get_db()
    cursor = conn.cursor()
    now_cairo = datetime.now(CAIRO_TZ)
    today_date = now_cairo.strftime("%Y-%m-%d")
    now_str = now_cairo.isoformat()
    cursor.execute("UPDATE agents SET is_selected = ?, manual_selected_date = ?, updated_at = ? WHERE id = ?", 
                   (1 if is_selected else 0, today_date, now_str, str(agent_id)))
    conn.commit()
    conn.close()

def update_team_selection(team, is_selected):
    conn = get_db()
    cursor = conn.cursor()
    val = 1 if is_selected else 0
    now_cairo = datetime.now(CAIRO_TZ)
    today_date = now_cairo.strftime("%Y-%m-%d")
    now_str = now_cairo.isoformat()
    if team == "all":
        cursor.execute("UPDATE agents SET is_selected = ?, manual_selected_date = ?, updated_at = ?", (val, today_date, now_str))
    elif team.lower() == "sales":
        cursor.execute("UPDATE agents SET is_selected = ?, manual_selected_date = ?, updated_at = ? WHERE team = 'Sales'", (val, today_date, now_str))
    elif team.lower() == "data":
        cursor.execute("UPDATE agents SET is_selected = ?, manual_selected_date = ?, updated_at = ? WHERE team = 'Data'", (val, today_date, now_str))
    else:
        cursor.execute("UPDATE agents SET is_selected = ?, manual_selected_date = ?, updated_at = ? WHERE team = ?", (val, today_date, now_str, team))
    conn.commit()
    conn.close()

def update_agents_selection_by_ids(agent_ids, is_selected):
    if not agent_ids: return
    conn = get_db()
    cursor = conn.cursor()
    val = 1 if is_selected else 0
    now_cairo = datetime.now(CAIRO_TZ)
    today_date = now_cairo.strftime("%Y-%m-%d")
    now_str = now_cairo.isoformat()
    placeholders = ",".join("?" for _ in agent_ids)
    cursor.execute(f"""
        UPDATE agents 
        SET is_selected = ?, manual_selected_date = ?, updated_at = ? 
        WHERE id IN ({placeholders})
    """, [val, today_date, now_str] + [str(aid) for aid in agent_ids])
    conn.commit()
    conn.close()

def update_agent_pause(agent_id, is_paused):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE agents SET is_paused = ?, updated_at = ? WHERE id = ?", 
                   (1 if is_paused else 0, datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def update_agent_limit(agent_id, chat_limit):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE agents SET chat_limit = ?, updated_at = ? WHERE id = ?", 
                   (int(chat_limit), datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def update_bulk_agents_limit(agent_ids, chat_limit):
    conn = get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    for ag_id in agent_ids:
        cursor.execute("UPDATE agents SET chat_limit = ?, updated_at = ? WHERE id = ?",
                       (int(chat_limit), now_str, str(ag_id)))
    conn.commit()
    conn.close()

def update_agent_daily_limit(agent_id, daily_limit):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE agents SET daily_chat_limit = ?, updated_at = ? WHERE id = ?", 
                   (int(daily_limit), datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def update_bulk_agents_daily_limit(agent_ids, daily_limit):
    conn = get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    for ag_id in agent_ids:
        cursor.execute("UPDATE agents SET daily_chat_limit = ?, updated_at = ? WHERE id = ?",
                       (int(daily_limit), now_str, str(ag_id)))
    conn.commit()
    conn.close()

def get_all_agents_today_chats_counts():
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT agent_id, COUNT(*) as cnt FROM chats_log 
        WHERE assigned_at LIKE ? AND status = 'assigned'
        GROUP BY agent_id
    """, (f"{today_prefix}%",))
    counts = {str(r["agent_id"]): int(r["cnt"]) for r in cursor.fetchall()}
    conn.close()
    return counts

def mark_chats_as_pulled(cids):
    if not cids: return
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in cids)
    cursor.execute(f"UPDATE chats_log SET status = 'pulled' WHERE conv_id IN ({placeholders})", [str(c) for c in cids])
    conn.commit()
    conn.close()

def get_pulled_conversation_ids_today():
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("SELECT DISTINCT conv_id FROM chats_log WHERE assigned_at LIKE ? AND status = 'pulled'", (f"{today_prefix}%",))
    pulled = {str(r[0]) for r in cursor.fetchall()}
    conn.close()
    return pulled

def get_assigned_conversation_ids_today():
    """Returns conversation IDs that were assigned today to prevent duplicate routing due to Chatwoot cache lag."""
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("SELECT DISTINCT conv_id FROM chats_log WHERE assigned_at LIKE ? AND status = 'assigned'", (f"{today_prefix}%",))
    assigned = {str(r[0]) for r in cursor.fetchall()}
    conn.close()
    return assigned

def is_conversation_assigned_today(conv_id):
    """Checks if a conversation ID has already been assigned today in chats_log."""
    if not conv_id:
        return False
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT 1 FROM chats_log 
        WHERE conv_id = ? AND assigned_at LIKE ? AND status = 'assigned'
        LIMIT 1
    """, (str(conv_id), f"{today_prefix}%"))
    row = cursor.fetchone()
    conn.close()
    return row is not None

def decrement_agent_window_chats(agent_id, count=1):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE agents 
        SET current_window_chats = MAX(0, current_window_chats - ?) 
        WHERE id = ?
    """, (int(count), str(agent_id)))
    conn.commit()
    conn.close()


def update_agent_labels(agent_id, labels):
    conn = get_db()
    cursor = conn.cursor()
    labels_json = json.dumps(labels) if isinstance(labels, list) else labels
    cursor.execute("UPDATE agents SET assigned_labels = ?, updated_at = ? WHERE id = ?", 
                   (labels_json, datetime.now(CAIRO_TZ).isoformat(), str(agent_id)))
    conn.commit()
    conn.close()

def update_agent_active_chats(agent_id, count):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE agents SET active_chats = ? WHERE id = ?", (int(count), str(agent_id)))
    conn.commit()
    conn.close()

def check_and_reset_agent_window(agent_row, window_minutes=30):
    now = datetime.now(CAIRO_TZ)
    window_start_str = agent_row.get("window_start_time")
    
    if not window_start_str:
        return agent_row
        
    try:
        window_start = datetime.fromisoformat(window_start_str)
        if now - window_start >= timedelta(minutes=window_minutes):
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE agents 
                SET current_window_chats = 0, window_start_time = NULL 
                WHERE id = ?
            """, (str(agent_row["id"]),))
            conn.commit()
            conn.close()
            agent_row["current_window_chats"] = 0
            agent_row["window_start_time"] = None
    except Exception:
        pass
            
    return agent_row

def increment_agent_window_chats(agent_id):
    now = datetime.now(CAIRO_TZ)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE agents 
        SET current_window_chats = current_window_chats + 1,
            last_assigned_at = ?,
            window_start_time = COALESCE(window_start_time, ?)
        WHERE id = ? AND current_window_chats < chat_limit
    """, (now.isoformat(), now.isoformat(), str(agent_id)))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

# ── Settings Operations ──────────────────────────────────────────────

def get_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in cursor.fetchall()}
    conn.close()
    return settings

def set_setting(key, value):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                   (key, str(value), str(value)))
    conn.commit()
    conn.close()

def set_multiple_settings(settings_dict):
    conn = get_db()
    cursor = conn.cursor()
    for k, v in settings_dict.items():
        cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                       (k, str(v), str(v)))
    conn.commit()
    conn.close()

# ── Agent Mappings ───────────────────────────────────────────────────

def get_all_mappings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agent_mappings ORDER BY crm_name ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def save_mapping(crm_name, chatwoot_agent_id, chatwoot_agent_name):
    conn = get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    cursor.execute("""
    INSERT INTO agent_mappings (crm_name, chatwoot_agent_id, chatwoot_agent_name, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(crm_name) DO UPDATE SET
        chatwoot_agent_id = ?,
        chatwoot_agent_name = ?,
        updated_at = ?
    """, (crm_name, str(chatwoot_agent_id), chatwoot_agent_name, now_str,
          str(chatwoot_agent_id), chatwoot_agent_name, now_str))
    
    cursor.execute("UPDATE agents SET crm_name = ? WHERE id = ?", (crm_name, str(chatwoot_agent_id)))
    
    conn.commit()
    conn.close()

# ── Chat Logs ────────────────────────────────────────────────────────

def log_routed_chat(conv_id, agent_id, agent_name, label, sender_phone="", sender_name="", last_message=""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO chats_log (conv_id, agent_id, agent_name, label, sender_phone, sender_name, last_message, assigned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (str(conv_id), str(agent_id), agent_name, label, str(sender_phone or ""), str(sender_name or ""), str(last_message or "")[:300], datetime.now(CAIRO_TZ).isoformat()))
    conn.commit()
    conn.close()

def get_recent_chat_logs(limit=100):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chats_log ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_agent_routed_chats(agent_id, limit=100):
    conn = get_db()
    cursor = conn.cursor()
    today_prefix = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT * FROM chats_log 
        WHERE agent_id = ? AND assigned_at LIKE ? 
        ORDER BY id DESC LIMIT ?
    """, (str(agent_id), f"{today_prefix}%", limit))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

# ── Authentication Operations ────────────────────────────────────────

def verify_user_credentials(username, password):
    if not username or not password:
        return None
    username_clean = str(username).strip()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash, salt, role FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))", (username_clean,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    # 1. Test exact password
    test_hash = hashlib.sha256((row["salt"] + password).encode('utf-8')).hexdigest()
    if test_hash == row["password_hash"]:
        return {"id": row["id"], "username": row["username"], "role": row["role"]}
    # 2. Test trimmed password (in case of accidental spaces on mobile/copy-paste)
    test_hash_trim = hashlib.sha256((row["salt"] + password.strip()).encode('utf-8')).hexdigest()
    if test_hash_trim == row["password_hash"]:
        return {"id": row["id"], "username": row["username"], "role": row["role"]}
    return None

def create_auth_session(user_id, username, days=30):
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(CAIRO_TZ) + timedelta(days=days)).isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO auth_sessions (token, user_id, username, expires_at) VALUES (?, ?, ?, ?)",
                   (token, user_id, username, expires_at))
    conn.commit()
    conn.close()
    return token

def verify_auth_token(token):
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT token, user_id, username, expires_at FROM auth_sessions WHERE token = ?", (token,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    try:
        exp_time = datetime.fromisoformat(row["expires_at"])
        if exp_time < datetime.now(CAIRO_TZ):
            cursor.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
            conn.commit()
            conn.close()
            return None
    except Exception:
        pass
    conn.close()
    return {"user_id": row["user_id"], "username": row["username"]}

def delete_auth_session(token):
    if not token:
        return
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_user_credentials(user_id, new_username=None, new_password=None):
    conn = get_db()
    cursor = conn.cursor()
    if new_username and new_username.strip():
        cursor.execute("UPDATE users SET username = ? WHERE id = ?", (new_username.strip(), user_id))
        cursor.execute("UPDATE auth_sessions SET username = ? WHERE user_id = ?", (new_username.strip(), user_id))
    if new_password and new_password.strip():
        salt = secrets.token_hex(16)
        pw_hash = hashlib.sha256((salt + new_password).encode('utf-8')).hexdigest()
        cursor.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (pw_hash, salt, user_id))
    conn.commit()
    conn.close()
    return True

def get_all_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, created_at FROM users ORDER BY id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_user(username, password, role="admin"):
    username = username.strip()
    if not username or not password:
        return False, "اسم المستخدم وكلمة المرور مطلوبان"
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        return False, "اسم المستخدم موجود بالفعل"
    salt = secrets.token_hex(16)
    pw_hash = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    cursor.execute("INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
                   (username, pw_hash, salt, role))
    conn.commit()
    conn.close()
    return True, "تم إنشاء المستخدم بنجاح"

def delete_user(user_id, current_user_id):
    if int(user_id) == int(current_user_id):
        return False, "لا يمكنك حذف حسابك الحالي المسجل به"
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True, "تم حذف المستخدم بنجاح"



