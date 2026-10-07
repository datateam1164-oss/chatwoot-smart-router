# ═══════════════════════════════════════════════════════════════════════════
# CHATWOOT SMART ROUTER - FAST SQLITE & CRM POWERED ENGINE
# ═══════════════════════════════════════════════════════════════════════════

import requests
import json
import re
import time
import logging
import os
import sys
import threading
import concurrent.futures
from datetime import datetime, timedelta
import pytz
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import database
import crm_service

# Patch requests.Session to always have a timeout
_orig_request = requests.Session.request
def _request_with_timeout(self, method, url, **kwargs):
    kwargs.setdefault('timeout', 25)
    return _orig_request(self, method, url, **kwargs)
requests.Session.request = _request_with_timeout

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try: sys.stderr.reconfigure(encoding='utf-8')
    except Exception: pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(threadName)-18s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

CAIRO_TZ = pytz.timezone("Africa/Cairo")

# Initialize Flask
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_frontend_dist = os.path.join(os.path.dirname(_backend_dir), "Frontend", "dist")
if os.path.exists(os.path.join(_frontend_dist, "index.html")):
    DIST_FOLDER = _frontend_dist
elif os.path.exists(os.path.join(_backend_dir, "dist", "index.html")):
    DIST_FOLDER = os.path.join(_backend_dir, "dist")
else:
    DIST_FOLDER = os.path.join(_backend_dir, "dist")

app = Flask(__name__, static_folder=DIST_FOLDER, static_url_path='')
CORS(app)

# Global in-memory locks & caches
team_cache = {}
inbox_cache = {}
processing_convs = set()
recently_assigned_convs = {}  # {conv_id: timestamp}
cache_lock = threading.Lock()
conv_lock = threading.Lock()
assigned_lock = threading.Lock()
delays_cache = {"data": None, "cached_at": 0}
delays_cache_lock = threading.Lock()

# ── Helper Functions ────────────────────────────────────────────────────────

def get_cw_config():
    settings = database.get_settings()
    base_url = settings.get("chatwoot_base_url", "https://crm.elkheta.com").rstrip("/")
    token = settings.get("chatwoot_access_token", "iyCoaajAwLLRvHGk3PAftUHi")
    account_id = settings.get("chatwoot_account_id", "1")
    return base_url, token, account_id

def _cw_headers():
    _, token, _ = get_cw_config()
    return {
        "api_access_token": token,
        "Content-Type": "application/json"
    }

def _refresh_team_cache():
    base_url, _, account_id = get_cw_config()
    url = f"{base_url}/api/v1/accounts/{account_id}/teams"
    try:
        res = requests.get(url, headers=_cw_headers(), timeout=10)
        if res.status_code == 200:
            teams_data = res.json()
            teams_list = teams_data if isinstance(teams_data, list) else teams_data.get("payload", [])
            with cache_lock:
                team_cache.clear()
                for team in teams_list:
                    tid = str(team.get("id", ""))
                    tname = str(team.get("name", "")).strip()
                    if tid and tname:
                        team_cache[tid] = tname
            return dict(team_cache)
    except Exception as e:
        logger.error(f"❌ _refresh_team_cache error: {e}")
    return dict(team_cache)

def _get_team_name_by_id(team_id):
    if not team_id: return ""
    tid_str = str(team_id)
    with cache_lock:
        if tid_str in team_cache:
            return team_cache[tid_str]
    _refresh_team_cache()
    with cache_lock:
        return team_cache.get(tid_str, "")

def _extract_team_name(conv: dict) -> str:
    team_obj = conv.get("team")
    if isinstance(team_obj, dict):
        name = str(team_obj.get("name", "")).strip()
        if name: return name
    team_id = conv.get("team_id") or (conv.get("meta", {}) or {}).get("team_id")
    if team_id:
        return _get_team_name_by_id(team_id)
    return ""

def _is_unassigned(conv: dict) -> bool:
    if conv.get("assignee_id"): return False
    assignee = conv.get("assignee") or (conv.get("meta", {}) or {}).get("assignee")
    if assignee and isinstance(assignee, dict) and assignee.get("id"):
        return False
    return True

def sync_chatwoot_agents_to_db():
    """Fetches all agents from Chatwoot and registers them in SQLite."""
    base_url, _, account_id = get_cw_config()
    url = f"{base_url}/api/v1/accounts/{account_id}/agents"
    try:
        res = requests.get(url, headers=_cw_headers(), timeout=15)
        if res.status_code == 200:
            agents_list = res.json()
            if isinstance(agents_list, dict):
                agents_list = agents_list.get("payload", []) or agents_list.get("data", [])
            
            logger.info(f"📋 Loaded {len(agents_list)} agents from Chatwoot API.")
            for ag in agents_list:
                ag_id = str(ag.get("id", ""))
                ag_name = str(ag.get("name", "")).strip()
                if not ag_id or not ag_name: continue
                database.upsert_agent({
                    "id": ag_id,
                    "name": ag_name
                })
            return True
        else:
            logger.warning(f"⚠️ Failed to fetch Chatwoot agents: HTTP {res.status_code}")
            return False
    except Exception as e:
        logger.error(f"❌ sync_chatwoot_agents_to_db error: {e}")
        return False

def _agent_in_shift_hours(agent_row: dict) -> bool:
    if agent_row.get("team") == "Data":
        return True  # Data team is always available for testing
    start = agent_row.get("shift_start")
    end = agent_row.get("shift_end")
    if start is None or end is None:
        return False
    now = datetime.now(CAIRO_TZ)
    current_hour = now.hour
    routing_end = end - 1
    if start <= routing_end:
        return start <= current_hour < routing_end
    else:
        return current_hour >= start or current_hour < routing_end

def _agent_in_grace_period(agent_row: dict) -> bool:
    """Returns True if the agent is in the first 30 minutes of their shift start hour."""
    if agent_row.get("team") == "Data":
        return False
    start = agent_row.get("shift_start")
    if start is None:
        return False
    now = datetime.now(CAIRO_TZ)
    return now.hour == start and now.minute < 30

def _agent_has_valid_shift(agent_row: dict) -> bool:
    """Checks if agent is in shift and passed the 30-minute start grace period."""
    if not _agent_in_shift_hours(agent_row):
        return False
    if _agent_in_grace_period(agent_row):
        return False
    return True

def assign_conversation_in_chatwoot(conv_id: str, agent_id: str) -> bool:
    base_url, _, account_id = get_cw_config()
    url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{conv_id}/assignments"
    try:
        res = requests.post(url, json={"assignee_id": int(agent_id)}, headers=_cw_headers(), timeout=10)
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"❌ assign_conversation_in_chatwoot error: {e}")
        return False

def unassign_conversation_in_chatwoot(conv_id: str) -> bool:
    base_url, _, account_id = get_cw_config()
    url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{conv_id}/assignments"
    try:
        # Chatwoot unassigns when assignee_id is 0 or null
        res = requests.post(url, json={"assignee_id": 0}, headers=_cw_headers(), timeout=10)
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"❌ unassign_conversation_in_chatwoot error: {e}")
        return False

# ── Chatwoot Agent Conversation Report (Active Open Chats) ─────────────────
_agent_report_cache = {}
_agent_report_cache_time = 0
_agent_report_lock = threading.Lock()

def fetch_agent_report_counts(force_refresh=False) -> dict:
    global _agent_report_cache_time, _agent_report_cache
    now = time.time()
    with _agent_report_lock:
        if not force_refresh and (now - _agent_report_cache_time < 90) and _agent_report_cache:
            return dict(_agent_report_cache)

    base_url, _, account_id = get_cw_config()
    url = f"{base_url}/api/v2/accounts/{account_id}/reports/conversations"
    counts = {}
    session = requests.Session()
    session.headers.update(_cw_headers())
    page = 1
    while page <= 10:
        try:
            res = session.get(url, params={"type": "agent", "page": page}, timeout=10)
            if res.status_code != 200:
                break
            data = res.json()
            if not data or not isinstance(data, list):
                break
            for item in data:
                ag_id = str(item.get("id", ""))
                metric = item.get("metric", {})
                open_cnt = int(metric.get("open", 0))
                if ag_id:
                    counts[ag_id] = open_cnt
            if len(data) < 25:
                break
            page += 1
        except Exception as e:
            logger.warning(f"⚠️ fetch_agent_report_counts page {page} error: {e}")
            break

    if counts:
        with _agent_report_lock:
            _agent_report_cache = counts
            _agent_report_cache_time = time.time()
        for ag_id, cnt in counts.items():
            try:
                database.update_agent_active_chats(ag_id, cnt)
            except Exception:
                pass
        logger.info(f"📊 Updated Chatwoot report open chat counts for {len(counts)} agents.")

    with _agent_report_lock:
        return dict(_agent_report_cache)

def _periodic_agent_report_updater():
    """Periodically fetches Chatwoot report open chat counts every 90 seconds."""
    time.sleep(5)
    while True:
        try:
            fetch_agent_report_counts(force_refresh=True)
        except Exception as e:
            logger.warning(f"⚠️ _periodic_agent_report_updater error: {e}")
        time.sleep(90)

# ── Routing Engine Core ─────────────────────────────────────────────────────

def is_route_unlabeled_enabled() -> bool:
    settings = database.get_settings()
    return settings.get("route_unlabeled", "false").lower() in ["true", "1", "yes"]

def _get_eligible_agents(matched_label: str = None):
    """
    Returns agents who are:
    1. is_selected == 1 (Checked by supervisor)
    2. is_paused == 0
    3. current_window_chats < chat_limit (Default 10)
    4. Currently in shift
    5. Eligible for the matched_label based on agent's assigned_labels
    """
    all_agents = database.get_all_agents()
    eligible = []
    
    settings = database.get_settings()
    window_minutes = int(settings.get("window_minutes", 30))
    today_counts = database.get_all_agents_today_chats_counts()

    for ag in all_agents:
        if ag.get("team") not in ["Sales", "Data"]:
            continue
        if not ag.get("is_selected", 1):
            continue
        if ag.get("is_paused", 0):
            continue
        
        # Check and reset window timer if 30 mins elapsed
        ag = database.check_and_reset_agent_window(ag, window_minutes=window_minutes)
        
        # Check Daily Max Limit (ماكس شات اليوم)
        daily_limit = ag.get("daily_chat_limit") or 100
        today_cnt = today_counts.get(str(ag["id"]), 0)
        if today_cnt >= int(daily_limit):
            # Agent reached daily limit, skip for the rest of today!
            continue

        # Check 30-Min Window Limit (ليمت النصف ساعة)
        limit = ag.get("chat_limit", 10)
        curr = ag.get("current_window_chats", 0)
        if curr >= limit:
            continue
            
        if not _agent_has_valid_shift(ag):
            continue

        # Per-agent label check
        if matched_label:
            assigned = ag.get("assigned_labels")
            if assigned and isinstance(assigned, str):
                try:
                    assigned = json.loads(assigned)
                except Exception:
                    assigned = []
            elif not assigned:
                assigned = []

            # Per-agent label check
            if len(assigned) > 0:
                assigned_lower = [str(l).strip().lower() for l in assigned]
                matched_clean = matched_label.strip().lower()
                
                is_match = False
                if "بدون ليبل" in matched_clean or "unlabeled" in matched_clean or "no_label" in matched_clean:
                    if any("بدون ليبل" in x or "unlabeled" in x or "بدون تصنيف" in x or "no_label" in x for x in assigned_lower):
                        is_match = True
                else:
                    for x in assigned_lower:
                        if x == matched_clean or matched_clean in x or x in matched_clean:
                            is_match = True
                            break

                if not is_match:
                    continue  # Agent not assigned to handle this label
            else:
                # Agent has NO assigned labels configured:
                # Unlabeled chats require explicit assignment, so skip if chat is unlabeled
                matched_clean = matched_label.strip().lower()
                if "بدون ليبل" in matched_clean or "unlabeled" in matched_clean:
                    continue
            
        eligible.append(ag)
        
    # Least loaded agent in current window first
    eligible = sorted(eligible, key=lambda a: a.get("current_window_chats", 0))
    return eligible

def _fetch_unassigned_conversations() -> list[dict]:
    base_url, _, account_id = get_cw_config()
    results, page = [], 1
    seen_cids = set()
    while True:
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        params = {"status": "open", "assignee_type": "unassigned", "page": page}
        try:
            res = requests.get(url, params=params, headers=_cw_headers(), timeout=15)
            if res.status_code != 200: break
            data = res.json()
            items = data.get("data", {}).get("payload", []) if isinstance(data, dict) else []
            if not items: break

            for conv in items:
                if not _is_unassigned(conv): continue
                cid = str(conv.get("id", ""))
                if not cid or cid in seen_cids or cid in recently_assigned_convs: continue
                seen_cids.add(cid)

                sender = (conv.get("meta", {}) or {}).get("sender") or {}
                last_msg = ""
                messages = conv.get("messages") or []
                if isinstance(messages, list) and len(messages) > 0:
                    last_msg = messages[-1].get("content", "")
                elif conv.get("last_non_activity_message"):
                    last_msg = (conv.get("last_non_activity_message") or {}).get("content", "")

                results.append({
                    "id": cid,
                    "labels": conv.get("labels", []),
                    "team": _extract_team_name(conv),
                    "sender_phone": sender.get("phone_number", "") or sender.get("identifier", ""),
                    "sender_name": sender.get("name", ""),
                    "last_message": last_msg
                })

            if len(items) < 20: break
            page += 1
            if page > 8: break # Cap batch size per cycle (up to 200 conversations)
        except Exception as e:
            logger.error(f"❌ _fetch_unassigned_conversations error: {e}")
            break
    return results

routing_cycle_lock = threading.Lock()

def _run_single_routing_cycle():
    if not routing_cycle_lock.acquire(blocking=False):
        logger.info("ℹ️ Routing cycle already in progress by another thread. Skipping overlapping cycle.")
        return 0
    try:
        unassigned = _fetch_unassigned_conversations()
        if not unassigned:
            return 0

        settings = database.get_settings()
        route_unlabeled = is_route_unlabeled_enabled()
        labels_order = json.loads(settings.get("valid_labels_order", "[]"))
        labels_order_lower = [l.strip().lower() for l in labels_order]

        # Prioritize conversations:
        # 1. Configured Sales Labels (in priority order of labels_order_lower) come FIRST!
        # 2. Other labeled chats come next.
        # 3. Unlabeled chats come LAST!
        def _get_conv_sort_key(c):
            c_labels = [str(l).strip().lower() for l in c.get("labels", [])]
            if len(c_labels) == 0:
                return (2, 999)
            for idx, pl in enumerate(labels_order_lower):
                if pl in c_labels:
                    return (0, idx)
            return (1, 999)

        unassigned.sort(key=_get_conv_sort_key)

        now_ts = time.time()
        with assigned_lock:
            # 120 seconds TTL is sufficient to protect against Chatwoot unassigned API lag / race conditions
            expired = [k for k, ts in recently_assigned_convs.items() if now_ts - ts > 120]
            for k in expired:
                del recently_assigned_convs[k]

        routed = 0
        for conv in unassigned:
            cid = str(conv["id"])

            # Anti-race condition / API lag guard:
            # If this conversation was assigned by the router within the last 120 seconds, skip to let Chatwoot API catch up
            with assigned_lock:
                if cid in recently_assigned_convs:
                    continue

            with conv_lock:
                if cid in processing_convs: continue
                processing_convs.add(cid)

            try:
                conv_labels = [str(l).strip().lower() for l in conv.get("labels", [])]
                matched_label = None

                if len(conv_labels) == 0:
                    if not route_unlabeled:
                        continue
                    # Chat has NO labels: treat as standard Unlabeled, route only to agents who selected it
                    matched_label = "بدون ليبل (Unlabeled)"
                else:
                    # Chat has labels: check if any match allowed Sales labels
                    for pl in labels_order_lower:
                        if pl in conv_labels:
                            matched_label = pl
                            break

                    if not matched_label:
                        # Conversation does not match allowed Sales labels (e.g. CS, HR, etc.) -> SKIP!
                        continue

                # Check for eligible sales agents for this specific label
                eligible = _get_eligible_agents(matched_label=matched_label)
                if not eligible:
                    logger.warning(f"⚠️ No eligible agents available for label '{matched_label}'.")
                    continue

                best_agent = eligible[0]

                # If this chat was unassigned / pulled and previously assigned today, try to pick another eligible agent
                prev_agent_id = database.get_last_assigned_agent_for_conv(cid)
                if prev_agent_id and len(eligible) > 1:
                    other_agents = [ag for ag in eligible if str(ag["id"]) != str(prev_agent_id)]
                    if other_agents:
                        best_agent = other_agents[0]

                curr_chats = best_agent.get("current_window_chats", 0)
                lim_chats = best_agent.get("chat_limit", 10)
                if curr_chats >= lim_chats:
                    logger.warning(f"⚠️ Agent {best_agent['name']} already at limit ({curr_chats}/{lim_chats}). Skipping.")
                    continue

                # Final guard: verify not in recently_assigned_convs
                with assigned_lock:
                    if cid in recently_assigned_convs:
                        continue

                logger.info(f"🎯 Routing Conv {cid} ({matched_label}) -> Agent: {best_agent['name']} ({curr_chats}/{lim_chats})")

                if assign_conversation_in_chatwoot(cid, best_agent["id"]):
                    database.increment_agent_window_chats(best_agent["id"])
                    database.log_routed_chat(
                        conv_id=cid,
                        agent_id=best_agent["id"],
                        agent_name=best_agent["name"],
                        label=matched_label,
                        sender_phone=conv.get("sender_phone", ""),
                        sender_name=conv.get("sender_name", ""),
                        last_message=conv.get("last_message", "")
                    )
                    with assigned_lock:
                        recently_assigned_convs[cid] = time.time()
                    routed += 1
                    # Fast pacing delay (0.05s) to allow instant distribution without UI freezing
                    time.sleep(0.05)
            finally:
                with conv_lock:
                    processing_convs.discard(cid)

        return routed
    finally:
        routing_cycle_lock.release()

routing_wake_event = threading.Event()

def is_routing_enabled():
    settings = database.get_settings()
    return settings.get("routing_enabled", "false").lower() in ["true", "1", "yes"]

def set_routing_enabled(enabled: bool):
    database.set_setting("routing_enabled", "true" if enabled else "false")
    if enabled:
        routing_wake_event.set()

def _periodic_routing_loop():
    logger.info("🔄 Periodic Routing Engine thread started (Default: Standby/Paused)...")
    while True:
        try:
            if is_routing_enabled():
                routed = _run_single_routing_loop_safe()
                if routed > 0:
                    logger.info(f"✅ Auto-Cycle Finished: Routed {routed} conversations.")
        except Exception as e:
            logger.error(f"❌ Periodic routing error: {e}")
            
        settings = database.get_settings()
        interval = int(settings.get("periodic_interval", 60))
        # Wait for interval or instant wake-up event
        routing_wake_event.wait(timeout=interval)
        routing_wake_event.clear()

def _run_single_routing_loop_safe():
    try:
        return _run_single_routing_cycle()
    except Exception as e:
        logger.error(f"❌ _run_single_routing_cycle error: {e}")
        return 0

# ── Authentication Middleware & Endpoints ───────────────────────────────────

def _get_auth_token_from_request():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    return request.args.get("token") or request.headers.get("X-Auth-Token")

@app.before_request
def authenticate_request():
    # 1. Allow CORS preflight OPTIONS
    if request.method == 'OPTIONS':
        return None

    # 2. Allow non-API routes (static files, frontend pages, webhooks)
    path = request.path
    if not path.startswith('/api/'):
        return None
    
    # 3. Whitelisted public API endpoints
    public_paths = [
        '/api/health',
        '/api/status',
        '/api/auth/login'
    ]
    if path in public_paths:
        return None

    # 4. Check Bearer token
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({
            "success": False, 
            "error": "غير مصرح بالدخول. يرجى تسجيل الدخول أولاً.",
            "unauthorized": True
        }), 401
    
    request.current_user = session
    return None

@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    
    if not username or not password:
        return jsonify({"success": False, "error": "يرجى إدخال اسم المستخدم وكلمة المرور"}), 400
        
    user = database.verify_user_credentials(username, password)
    if not user:
        return jsonify({"success": False, "error": "اسم المستخدم أو كلمة المرور غير صحيحة"}), 401
        
    token = database.create_auth_session(user["id"], user["username"])
    logger.info(f"🔑 User '{username}' logged in successfully.")
    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        },
        "message": "تم تسجيل الدخول بنجاح"
    })

@app.route('/api/auth/me', methods=['GET'])
def api_auth_me():
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({"success": False, "error": "الجلسة منتهية أو غير صالحة"}), 401
    user = database.get_user_by_id(session["user_id"])
    if not user:
        return jsonify({"success": False, "error": "المستخدم غير موجود"}), 404
    return jsonify({
        "success": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    })

@app.route('/api/auth/change-credentials', methods=['POST'])
def api_auth_change_credentials():
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({"success": False, "error": "غير مصرح"}), 401
        
    data = request.get_json(silent=True) or {}
    old_password = str(data.get("old_password", ""))
    new_password = str(data.get("new_password", "")).strip()
    new_username = str(data.get("new_username", "")).strip()
    
    # Verify old password
    user = database.verify_user_credentials(session["username"], old_password)
    if not user:
        return jsonify({"success": False, "error": "كلمة المرور الحالية غير صحيحة"}), 400
        
    database.update_user_credentials(
        user_id=session["user_id"],
        new_username=new_username if new_username else None,
        new_password=new_password if new_password else None
    )
    logger.info(f"🔐 Credentials updated for user ID {session['user_id']} ({session['username']})")
    return jsonify({
        "success": True,
        "message": "تم تحديث بيانات الدخول بنجاح",
        "username": new_username or session["username"]
    })

@app.route('/api/auth/logout', methods=['POST'])
def api_auth_logout():
    token = _get_auth_token_from_request()
    if token:
        database.delete_auth_session(token)
    return jsonify({"success": True, "message": "تم تسجيل الخروج بنجاح"})

@app.route('/api/users', methods=['GET'])
def api_get_users():
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({"success": False, "error": "غير مصرح"}), 401
    users = database.get_all_users()
    return jsonify({"success": True, "users": users})

@app.route('/api/users', methods=['POST'])
def api_create_user():
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({"success": False, "error": "غير مصرح"}), 401
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()
    role = str(data.get("role", "admin")).strip()
    success, msg = database.create_user(username, password, role)
    if not success:
        return jsonify({"success": False, "error": msg}), 400
    return jsonify({"success": True, "message": msg, "users": database.get_all_users()})

@app.route('/api/users/<user_id>', methods=['DELETE'])
def api_delete_user(user_id):
    token = _get_auth_token_from_request()
    session = database.verify_auth_token(token) if token else None
    if not session:
        return jsonify({"success": False, "error": "غير مصرح"}), 401
    success, msg = database.delete_user(user_id, session["user_id"])
    if not success:
        return jsonify({"success": False, "error": msg}), 400
    return jsonify({"success": True, "message": msg, "users": database.get_all_users()})

# ── REST API Endpoints ──────────────────────────────────────────────────────

@app.route('/health')
@app.route('/api/health')
@app.route('/api/status')
def api_status():
    settings = database.get_settings()
    agents = database.get_all_agents()
    selected_count = sum(1 for a in agents if a.get("is_selected", 1))
    paused_count = sum(1 for a in agents if a.get("is_paused", 0))
    in_shift_count = sum(1 for a in agents if _agent_in_shift_hours(a))
    in_grace_count = sum(1 for a in agents if _agent_in_grace_period(a) and _agent_in_shift_hours(a))
    routing_enabled = is_routing_enabled()
    today_routed = database.get_today_routed_count()

    return jsonify({
        "status": "healthy",
        "routing_enabled": routing_enabled,
        "total_agents": len(agents),
        "selected_agents": selected_count,
        "paused_agents": paused_count,
        "in_shift_agents": in_shift_count,
        "in_grace_agents": in_grace_count,
        "today_routed": today_routed,
        "crm_last_sync": settings.get("crm_last_sync", ""),
        "timestamp": datetime.now(CAIRO_TZ).isoformat()
    })

@app.route('/api/routing/start', methods=['POST'])
def api_routing_start():
    set_routing_enabled(True)
    logger.info("▶️ Routing Engine STARTED by supervisor.")
    return jsonify({"success": True, "routing_enabled": True, "message": "تم تشغيل محرك التوزيع التلقائي بنجاح"})

@app.route('/api/routing/stop', methods=['POST'])
def api_routing_stop():
    set_routing_enabled(False)
    logger.info("⏸️ Routing Engine STOPPED by supervisor.")
    return jsonify({"success": True, "routing_enabled": False, "message": "تم إيقاف التوزيع مؤقتاً"})

@app.route('/api/routing/toggle-unlabeled', methods=['POST'])
def api_toggle_unlabeled():
    data = request.json or {}
    enabled = bool(data.get("enabled", False))
    database.set_setting("route_unlabeled", "true" if enabled else "false")
    logger.info(f"🏷️ Route Unlabeled Chats set to: {enabled}")
    return jsonify({
        "success": True, 
        "route_unlabeled": enabled, 
        "message": "تم تفعيل توزيع الشاتات بدون ليبل" if enabled else "تم تعطيل توزيع الشاتات بدون ليبل"
    })

@app.route('/api/routing/run-cycle', methods=['POST'])
def api_routing_run_cycle():
    """Triggers exactly one distribution cycle immediately on demand (great for testing)."""
    logger.info("⚡ Manual routing cycle triggered on demand.")
    routed = _run_single_routing_loop_safe()
    return jsonify({
        "success": True, 
        "routed_count": routed, 
        "message": f"تم تشغيل دورة التوزيع بنجاح وتوزيع {routed} محادثة." if routed > 0 else "تم تشغيل دورة التوزيع، ولكن لم يتم العثور على محادثات جديدة مطابقة أو موظفين متاحين حالياً."
    })

@app.route('/api/agents', methods=['GET'])
def api_get_agents():
    settings = database.get_settings()
    window_minutes = int(settings.get("window_minutes", 30))
    agents = database.get_all_agents()
    today_counts = database.get_all_agents_today_chats_counts()
    
    with _agent_report_lock:
        cw_counts = dict(_agent_report_cache)

    # Update windows and add computed shift status
    now = datetime.now(CAIRO_TZ)
    result = []
    for ag in agents:
        ag = database.check_and_reset_agent_window(ag, window_minutes=window_minutes)
        in_hours = _agent_in_shift_hours(ag)
        in_grace = _agent_in_grace_period(ag) and in_hours
        ag["in_shift"] = in_hours
        ag["in_grace_period"] = in_grace
        ag["can_receive_now"] = _agent_has_valid_shift(ag)
        ag["current_hour"] = now.hour

        # Compute real-time window timing details (من كام لكام ومتبقي كام دقيقة)
        w_start_str = ag.get("window_start_time")
        curr_win = ag.get("current_window_chats", 0)
        if w_start_str and curr_win > 0:
            try:
                w_start = datetime.fromisoformat(w_start_str)
                w_end = w_start + timedelta(minutes=window_minutes)
                rem_sec = max(0, int((w_end - now).total_seconds()))
                ag["window_start_time"] = w_start.isoformat()
                ag["window_end_time"] = w_end.isoformat()
                ag["window_remaining_seconds"] = rem_sec
                ag["window_remaining_minutes"] = max(1, (rem_sec + 59) // 60) if rem_sec > 0 else 0
            except Exception:
                ag["window_end_time"] = None
                ag["window_remaining_seconds"] = 0
                ag["window_remaining_minutes"] = 0
        else:
            ag["window_end_time"] = None
            ag["window_remaining_seconds"] = 0
            ag["window_remaining_minutes"] = 0
        
        daily_lim = ag.get("daily_chat_limit")
        if daily_lim is None:
            daily_lim = 100
        ag["daily_chat_limit"] = int(daily_lim)
        
        today_cnt = today_counts.get(str(ag["id"]), 0)
        ag["today_chats_count"] = today_cnt
        ag["is_daily_max_reached"] = (today_cnt >= int(daily_lim))

        # Attach active / open chats from Chatwoot report
        ag_id_str = str(ag["id"])
        open_chats = cw_counts.get(ag_id_str)
        if open_chats is None:
            open_chats = ag.get("active_chats", 0)
        ag["active_chats"] = int(open_chats)
        ag["chatwoot_open_chats"] = int(open_chats)

        # Deserialized assigned_labels
        raw_labels = ag.get("assigned_labels")
        if raw_labels and isinstance(raw_labels, str):
            try:
                ag["assigned_labels"] = json.loads(raw_labels)
            except Exception:
                ag["assigned_labels"] = []
        elif not raw_labels:
            ag["assigned_labels"] = []
            
        result.append(ag)
        
    return jsonify({"success": True, "agents": result})

@app.route('/api/agents/refresh-cw-counts', methods=['POST'])
def api_refresh_cw_counts():
    counts = fetch_agent_report_counts(force_refresh=True)
    return jsonify({
        "success": True, 
        "message": f"تم تحديث أرقام الشاتات المفتوحة من شات ووت بنجاح ({len(counts)} موظف).",
        "counts": counts
    })

@app.route('/api/agents/<agent_id>/toggle-select', methods=['POST'])
def api_toggle_select(agent_id):
    data = request.json or {}
    is_selected = data.get("is_selected", True)
    database.update_agent_selection(agent_id, is_selected)
    return jsonify({"success": True, "is_selected": is_selected})

@app.route('/api/agents/bulk-select', methods=['POST'])
def api_bulk_select():
    data = request.json or {}
    agent_ids = data.get("agent_ids")
    is_selected = bool(data.get("is_selected", True))
    if agent_ids and isinstance(agent_ids, list):
        database.update_agents_selection_by_ids(agent_ids, is_selected)
        logger.info(f"👥 Bulk select updated for {len(agent_ids)} specific agents: is_selected={is_selected}")
        return jsonify({"success": True, "count": len(agent_ids), "is_selected": is_selected})

    team = data.get("team", "all")
    database.update_team_selection(team, is_selected)
    logger.info(f"👥 Bulk select updated: team='{team}', is_selected={is_selected}")
    return jsonify({"success": True, "team": team, "is_selected": is_selected})

@app.route('/api/agents/<agent_id>/toggle-pause', methods=['POST'])
def api_toggle_pause(agent_id):
    data = request.json or {}
    is_paused = data.get("is_paused", True)
    database.update_agent_pause(agent_id, is_paused)
    return jsonify({"success": True, "is_paused": is_paused})

@app.route('/api/agents/<agent_id>/update-limit', methods=['POST'])
def api_update_limit(agent_id):
    data = request.json or {}
    chat_limit = data.get("limit", 10)
    database.update_agent_limit(agent_id, chat_limit)
    return jsonify({"success": True, "chat_limit": chat_limit})

@app.route('/api/agents/<agent_id>/update-labels', methods=['POST'])
def api_update_agent_labels(agent_id):
    data = request.json or {}
    labels = data.get("labels", [])
    if not isinstance(labels, list):
        return jsonify({"success": False, "error": "Labels must be a list"}), 400
    database.update_agent_labels(agent_id, labels)
    logger.info(f"🏷️ Updated assigned labels for Agent {agent_id}: {labels}")
    return jsonify({
        "success": True, 
        "agent_id": agent_id, 
        "assigned_labels": labels, 
        "message": "تم حفظ تصنيفات الموظف بنجاح"
    })

@app.route('/api/agents/<agent_id>/update-shift', methods=['POST'])
def api_update_shift(agent_id):
    data = request.json or {}
    shift_start = data.get("shift_start")
    shift_end = data.get("shift_end")
    shift_text = data.get("shift_text", "")
    if shift_start is None or shift_end is None:
        return jsonify({"success": False, "error": "Missing shift start or end"}), 400
    database.update_agent_shift(agent_id, int(shift_start), int(shift_end), str(shift_text))
    logger.info(f"✏️ Manual shift updated for Agent {agent_id}: {shift_text}")
    return jsonify({"success": True, "message": "تم تحديث الشيفت يدوياً وتثبيت الإذن بنجاح"})

@app.route('/api/agents/<agent_id>/reset-shift', methods=['POST'])
def api_reset_shift(agent_id):
    database.reset_agent_shift(agent_id)
    logger.info(f"🔄 Shift reset to CRM for Agent {agent_id}")
    return jsonify({"success": True, "message": "تمت استعادة شيفت الـ CRM الأصلي بنجاح"})

@app.route('/api/agents/apply-preset', methods=['POST'])
def api_apply_preset():
    data = request.json or {}
    agent_ids = data.get("agent_ids", [])
    labels = data.get("labels", [])
    if not isinstance(agent_ids, list) or not isinstance(labels, list):
        return jsonify({"success": False, "error": "Invalid format"}), 400
    database.apply_bulk_labels_preset(agent_ids, labels)
    logger.info(f"📋 Applied preset labels {labels} to {len(agent_ids)} agents.")
    return jsonify({"success": True, "message": f"تم تطبيق القالب على {len(agent_ids)} موظف بنجاح"})

@app.route('/api/teams/labels', methods=['POST'])
def api_update_team_labels():
    data = request.json or {}
    coordinator_name = str(data.get("coordinator_name", "")).strip()
    labels = data.get("labels", [])
    if not isinstance(labels, list):
        return jsonify({"success": False, "error": "Labels must be a list"}), 400
    affected = database.update_team_labels(coordinator_name, labels)
    logger.info(f"🏷️ Updated assigned labels for team '{coordinator_name}' ({affected} agents): {labels}")
    return jsonify({
        "success": True,
        "coordinator_name": coordinator_name,
        "affected": affected,
        "assigned_labels": labels,
        "message": f"تم بنجاح تحديث تصنيفات التيم ({affected} موظف)"
    })

@app.route('/api/agents/<agent_id>/pull-chats', methods=['POST'])
def api_pull_chats(agent_id):
    """
    Pulls open conversations assigned to this agent in Chatwoot and unassigns them.
    Supports max_count from request payload to pull a specific number of chats.
    """
    data = request.json or {}
    max_count = data.get("max_count")
    try:
        max_count = int(max_count) if max_count is not None and str(max_count).strip() != "" else None
        if max_count is not None and max_count <= 0:
            max_count = None
    except (ValueError, TypeError):
        max_count = None

    base_url, _, account_id = get_cw_config()
    
    # 1. Get candidate conversation IDs from chats_log
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT conv_id FROM chats_log 
        WHERE agent_id = ? 
        ORDER BY id DESC LIMIT 50
    """, (str(agent_id),))
    candidate_cids = [r["conv_id"] for r in cursor.fetchall()]
    conn.close()

    # 2. Also check open assigned conversations from Chatwoot directly
    try:
        cw_res = requests.get(
            f"{base_url}/api/v1/accounts/{account_id}/conversations",
            params={"status": "open", "assignee_type": "assigned"},
            headers=_cw_headers(),
            timeout=8
        )
        if cw_res.status_code == 200:
            cw_payload = cw_res.json().get("data", {}).get("payload", [])
            for c in cw_payload:
                aid = (c.get("meta", {}) or {}).get("assignee", {}).get("id")
                cid = str(c.get("id", ""))
                if aid == int(agent_id) and cid and cid not in candidate_cids:
                    candidate_cids.append(cid)
    except Exception as e:
        logger.warning(f"⚠️ Could not scan open assigned convs from CW: {e}")

    if not candidate_cids:
        return jsonify({
            "success": True,
            "unassigned_count": 0,
            "message": "لا توجد محادثات مفتوحة مسجلة لهذا الموظف لسحبها."
        })

    # 3. Check candidate conversations in parallel to verify which ones are currently open & assigned to this agent
    def check_and_unassign(cid):
        try:
            r = requests.get(f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}", headers=_cw_headers(), timeout=6)
            if r.status_code == 200:
                c = r.json()
                aid = (c.get("meta", {}) or {}).get("assignee", {}).get("id")
                status = c.get("status")
                if aid == int(agent_id) and status == "open":
                    if unassign_conversation_in_chatwoot(cid):
                        return cid
        except Exception as err:
            logger.error(f"❌ Error unassigning conv {cid}: {err}")
        return None

    pulled_cids = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(check_and_unassign, cid) for cid in candidate_cids]
        for future in concurrent.futures.as_completed(futures):
            res_cid = future.result()
            if res_cid:
                pulled_cids.append(res_cid)
                if max_count and len(pulled_cids) >= max_count:
                    break

    unassigned_count = len(pulled_cids)
    if unassigned_count > 0:
        database.decrement_agent_window_chats(agent_id, unassigned_count)
        database.mark_chats_as_pulled(pulled_cids)
        with assigned_lock:
            for cid in pulled_cids:
                recently_assigned_convs.pop(str(cid), None)
        logger.info(f"🔄 Successfully pulled {unassigned_count} chats from agent ID {agent_id}: {pulled_cids}")
        return jsonify({
            "success": True,
            "unassigned_count": unassigned_count,
            "pulled_conversations": pulled_cids,
            "message": f"تم بنجاح سحب {unassigned_count} محادثة من الموظف وإعادتها لقائمة الانتظار في شات ووت (بدون إسناد لموظف آخر)."
        })
    else:
        return jsonify({
            "success": True,
            "unassigned_count": 0,
            "message": "لم يتم العثور على محادثات مفتوحة مسندة لهذا الموظف لسحبها (قد تكون أغلقت أو سُحبت مسبقاً)."
        })

@app.route('/api/agents/<agent_id>/update-daily-limit', methods=['POST'])
def api_update_agent_daily_limit(agent_id):
    data = request.json or {}
    daily_limit = data.get("daily_limit", 100)
    try:
        daily_limit = int(daily_limit)
        if daily_limit < 1: daily_limit = 1
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid daily limit"}), 400

    database.update_agent_daily_limit(agent_id, daily_limit)
    logger.info(f"🎯 Agent {agent_id} daily chat limit updated to {daily_limit}")
    return jsonify({"success": True, "agent_id": agent_id, "daily_chat_limit": daily_limit})

@app.route('/api/agents/bulk-daily-limit', methods=['POST'])
def api_bulk_daily_limit():
    data = request.json or {}
    daily_limit = data.get("daily_limit", 100)
    team = data.get("team", "all")
    agent_ids = data.get("agent_ids")

    try:
        daily_limit = int(daily_limit)
        if daily_limit < 1: daily_limit = 1
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid daily limit"}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    if agent_ids and isinstance(agent_ids, list):
        for aid in agent_ids:
            cursor.execute("UPDATE agents SET daily_chat_limit = ?, updated_at = ? WHERE id = ?", (daily_limit, now_str, str(aid)))
    elif team == "all":
        cursor.execute("UPDATE agents SET daily_chat_limit = ?, updated_at = ?", (daily_limit, now_str))
    else:
        cursor.execute("UPDATE agents SET daily_chat_limit = ?, updated_at = ? WHERE team = ?", (daily_limit, now_str, team))
    
    cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                   ("default_daily_limit", str(daily_limit), str(daily_limit)))
    conn.commit()
    conn.close()

    logger.info(f"🎯 Bulk daily limit updated to {daily_limit} for {team}")
    return jsonify({
        "success": True,
        "daily_chat_limit": daily_limit,
        "message": f"تم بنجاح تحديد ماكس شات اليوم ({daily_limit} شات) لجميع الموظفين المحددين."
    })

@app.route('/api/agents/bulk-limit', methods=['POST'])
def api_bulk_limit():
    data = request.json or {}
    chat_limit = data.get("limit", 10)
    team = data.get("team", "all")
    agent_ids = data.get("agent_ids")

    try:
        chat_limit = int(chat_limit)
        if chat_limit < 1:
            chat_limit = 1
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid limit"}), 400

    conn = database.get_db()
    cursor = conn.cursor()
    now_str = datetime.now(CAIRO_TZ).isoformat()
    if agent_ids and isinstance(agent_ids, list):
        for aid in agent_ids:
            cursor.execute("UPDATE agents SET chat_limit = ?, updated_at = ? WHERE id = ?", (chat_limit, now_str, str(aid)))
    elif team == "all":
        cursor.execute("UPDATE agents SET chat_limit = ?, updated_at = ?", (chat_limit, now_str))
    else:
        cursor.execute("UPDATE agents SET chat_limit = ?, updated_at = ? WHERE team = ?", (chat_limit, now_str, team))
    
    cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                   ("default_limit", str(chat_limit), str(chat_limit)))
    conn.commit()
    conn.close()

    logger.info(f"⚙️ Bulk limit updated to {chat_limit} for {team}")
    return jsonify({
        "success": True,
        "chat_limit": chat_limit,
        "message": f"تم بنجاح تحديد الماكس شات ({chat_limit} شاتات) لجميع الموظفين المحددين."
    })


@app.route('/api/agents/<agent_id>/chats', methods=['GET'])
def api_agent_chats(agent_id):
    """
    Returns routed conversations assigned to this agent today from chats_log.
    """
    limit = request.args.get('limit', 100, type=int)
    chats = database.get_agent_routed_chats(agent_id, limit=limit)
    return jsonify({
        "success": True,
        "agent_id": str(agent_id),
        "count": len(chats),
        "chats": chats
    })

# ── Reports & Delay Monitoring ───────────────────────────────────────────────

def _build_delays_report(num_pages=6):
    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()
    
    all_agents = database.get_all_agents()
    agents_map = {str(a["id"]): dict(a) for a in all_agents}
    
    def _fetch_page(p):
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        try:
            res = requests.get(
                url, 
                params={"status": "open", "assignee_type": "assigned", "page": p}, 
                headers=headers, 
                timeout=12
            )
            if res.status_code == 200:
                data = res.json()
                return data.get("data", {}).get("payload", [])
        except Exception as err:
            logger.warning(f"⚠️ Error fetching conversations page {p}: {err}")
        return []

    t0 = time.time()
    all_convs = []
    num_pages = max(1, min(num_pages, 80))
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(num_pages, 16)) as executor:
        results = executor.map(_fetch_page, range(1, num_pages + 1))
        for page_convs in results:
            all_convs.extend(page_convs)
            
    dur = time.time() - t0
    now_ts = int(time.time())
    
    pending_chats = []
    agent_stats = {}
    
    for conv in all_convs:
        cid = conv.get("id")
        assignee = (conv.get("meta", {}) or {}).get("assignee", {}) or {}
        aid = str(assignee.get("id", ""))
        ag_db = agents_map.get(aid, {})
        
        ag_name = ag_db.get("name") or assignee.get("name") or "غير محدد"
        crm_name = ag_db.get("crm_name") or ""
        team = ag_db.get("team") or "Sales"
        in_shift = _agent_in_shift_hours(ag_db) if ag_db else False
        in_grace = (_agent_in_grace_period(ag_db) and in_shift) if ag_db else False
        
        if aid not in agent_stats:
            agent_stats[aid] = {
                "agent_id": aid,
                "agent_name": ag_name,
                "crm_name": crm_name,
                "team": team,
                "open_chats_count": 0,
                "pending_count": 0,
                "critical_count": 0,
                "warning_count": 0,
                "normal_count": 0,
                "max_delay_minutes": 0,
                "max_delay_text": "لا يوجد",
                "in_shift": in_shift,
                "in_grace_period": in_grace
            }
        
        agent_stats[aid]["open_chats_count"] += 1
        
        waiting_since = conv.get("waiting_since") or 0
        if waiting_since and waiting_since > 0:
            delay_sec = max(0, now_ts - waiting_since)
            delay_min = round(delay_sec / 60.0, 1)
            
            if delay_min >= 15.0:
                severity = "critical"
                agent_stats[aid]["critical_count"] += 1
            elif delay_min >= 5.0:
                severity = "warning"
                agent_stats[aid]["warning_count"] += 1
            else:
                severity = "normal"
                agent_stats[aid]["normal_count"] += 1
                
            agent_stats[aid]["pending_count"] += 1
            if delay_min > agent_stats[aid]["max_delay_minutes"]:
                agent_stats[aid]["max_delay_minutes"] = delay_min
                if delay_min < 1:
                    agent_stats[aid]["max_delay_text"] = "أقل من دقيقة"
                elif delay_min < 60:
                    agent_stats[aid]["max_delay_text"] = f"{int(delay_min)} دقيقة"
                else:
                    hrs = int(delay_min // 60)
                    mns = int(delay_min % 60)
                    agent_stats[aid]["max_delay_text"] = f"{hrs} س و {mns} د"
            
            # Format waiting text
            if delay_min < 1:
                wait_text = "أقل من دقيقة"
            elif delay_min < 60:
                wait_text = f"منذ {int(delay_min)} دقيقة"
            else:
                hrs = int(delay_min // 60)
                mns = int(delay_min % 60)
                wait_text = f"منذ {hrs} ساعة و {mns} دقيقة"
                
            sender = (conv.get("meta", {}) or {}).get("sender", {}) or {}
            last_msg_obj = conv.get("last_non_activity_message") or {}
            last_msg = last_msg_obj.get("content") or ""
            
            customer_name = sender.get("name") or sender.get("identifier") or "عميل بدون اسم"
            customer_phone = sender.get("phone_number") or ""
            
            pending_chats.append({
                "conv_id": cid,
                "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}",
                "waiting_since": waiting_since,
                "waiting_since_text": wait_text,
                "delay_minutes": delay_min,
                "severity": severity,
                "agent_id": aid,
                "agent_name": ag_name,
                "crm_name": crm_name,
                "team": team,
                "in_shift": in_shift,
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "last_message": last_msg[:140] if last_msg else "—",
                "labels": conv.get("labels", [])
            })

    # Sort pending chats by delay descending (longest delay first)
    pending_chats.sort(key=lambda x: x["delay_minutes"], reverse=True)
    
    # Sort agents summary by critical count then pending count then max delay
    agents_list = list(agent_stats.values())
    agents_list.sort(key=lambda a: (a["critical_count"], a["pending_count"], a["max_delay_minutes"]), reverse=True)
    
    critical_total = sum(1 for c in pending_chats if c["severity"] == "critical")
    warning_total = sum(1 for c in pending_chats if c["severity"] == "warning")
    normal_total = sum(1 for c in pending_chats if c["severity"] == "normal")
    
    most_delayed = "لا يوجد"
    if agents_list and agents_list[0]["pending_count"] > 0:
        top_ag = agents_list[0]
        most_delayed = f"{top_ag['agent_name']} ({top_ag['pending_count']} معلقة)"

    longest_delay_formatted = "0 دقيقة"
    if pending_chats:
        top_delay = pending_chats[0]["delay_minutes"]
        if top_delay < 1:
            longest_delay_formatted = "أقل من دقيقة"
        elif top_delay < 60:
            longest_delay_formatted = f"{int(top_delay)} دقيقة"
        else:
            longest_delay_formatted = f"{int(top_delay // 60)} س و {int(top_delay % 60)} د"

    return {
        "success": True,
        "summary": {
            "total_scanned_chats": len(all_convs),
            "total_pending_chats": len(pending_chats),
            "critical_count": critical_total,
            "warning_count": warning_total,
            "normal_count": normal_total,
            "longest_delay_minutes": pending_chats[0]["delay_minutes"] if pending_chats else 0,
            "longest_delay_formatted": longest_delay_formatted,
            "most_delayed_agent": most_delayed,
            "fetch_duration_seconds": round(dur, 2),
            "timestamp": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p")
        },
        "pending_chats": pending_chats,
        "agents_summary": agents_list
    }

@app.route('/api/reports/delays', methods=['GET'])
def api_reports_delays():
    refresh = request.args.get('refresh', 'false').lower() in ['true', '1', 'yes']
    pages = request.args.get('pages', 6)
    try:
        pages = int(pages)
    except (ValueError, TypeError):
        pages = 6
        
    now = time.time()
    with delays_cache_lock:
        if not refresh and delays_cache.get("data") is not None:
            if delays_cache.get("pages") == pages and (now - delays_cache.get("cached_at", 0) < 20):  # 20 seconds TTL
                return jsonify(delays_cache["data"])
                
    report_data = _build_delays_report(num_pages=pages)
    with delays_cache_lock:
        delays_cache["data"] = report_data
        delays_cache["cached_at"] = now
        delays_cache["pages"] = pages
        
    return jsonify(report_data)

@app.route('/api/conversations/<conv_id>/unassign', methods=['POST'])
def api_unassign_conversation(conv_id):
    data = request.json or {}
    agent_id = data.get("agent_id")
    
    # 1. Unassign in Chatwoot
    success = unassign_conversation_in_chatwoot(conv_id)
    if not success:
        return jsonify({"success": False, "error": "فشل فك إسناد المحادثة في Chatwoot. يرجى التأكد من اتصال السيرفر."}), 500
        
    # 2. Mark in chats_log as pulled
    database.mark_chats_as_pulled([conv_id])
    
    # 3. Decrement agent window if agent_id known
    if agent_id:
        database.decrement_agent_window_chats(agent_id, 1)
        
    # 4. Invalidate delays cache
    with delays_cache_lock:
        delays_cache["data"] = None
        delays_cache["cached_at"] = 0
        
    logger.info(f"📥 Conversation #{conv_id} unassigned/pulled by supervisor.")
    return jsonify({
        "success": True,
        "conv_id": conv_id,
        "message": f"تم سحب المحادثة #{conv_id} بنجاح وإعادتها لقائمة الانتظار."
    })

@app.route('/api/crm/sync', methods=['POST'])
def api_crm_sync():
    """Triggers an immediate sync with the CRM."""
    result = crm_service.sync_shifts_to_database()
    return jsonify(result)

@app.route('/api/crm/login', methods=['POST'])
def api_crm_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    base_url = data.get("base_url") or "https://sales-management-system-obyr.onrender.com"
    
    success, res = crm_service.login_crm(email, password, base_url)
    if success:
        return jsonify({"success": True, "message": "تم تسجيل الدخول في نظام الـ CRM بنجاح"})
    else:
        return jsonify({"success": False, "error": res}), 400

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if request.method == 'POST':
        data = request.json or {}
        database.set_multiple_settings(data)
        return jsonify({"success": True, "message": "تم حفظ الإعدادات بنجاح"})
    else:
        settings = database.get_settings()
        # Don't expose passwords in plain text if not needed
        if "crm_password" in settings and settings["crm_password"]:
            settings["crm_has_password"] = True
        return jsonify({"success": True, "settings": settings})

@app.route('/api/mappings', methods=['GET', 'POST'])
def api_mappings():
    if request.method == 'POST':
        data = request.json or {}
        crm_name = data.get("crm_name")
        chatwoot_agent_id = data.get("chatwoot_agent_id")
        chatwoot_agent_name = data.get("chatwoot_agent_name")
        if not crm_name or not chatwoot_agent_id:
            return jsonify({"success": False, "error": "Missing fields"}), 400
        database.save_mapping(crm_name, chatwoot_agent_id, chatwoot_agent_name)
        return jsonify({"success": True, "message": "تم حفظ الربط بنجاح"})
    else:
        mappings = database.get_all_mappings()
        return jsonify({"success": True, "mappings": mappings})

@app.route('/api/labels', methods=['GET', 'POST'])
def api_labels():
    if request.method == 'POST':
        data = request.json or {}
        labels = data.get("labels", [])
        if not isinstance(labels, list):
            return jsonify({"success": False, "error": "Labels must be a list"}), 400
        database.set_setting("valid_labels_order", json.dumps(labels))
        return jsonify({"success": True, "message": "تم حفظ تصنيفات السيلز بنجاح", "labels": labels})
    else:
        # Fetch all available labels from Chatwoot API
        base_url, token, account_id = get_cw_config()
        url = f"{base_url}/api/v1/accounts/{account_id}/labels"
        cw_labels = []
        try:
            res = requests.get(url, headers=_cw_headers(), timeout=10)
            if res.status_code == 200:
                raw_data = res.json()
                items = raw_data.get("payload", []) if isinstance(raw_data, dict) else raw_data
                for item in items:
                    if isinstance(item, dict) and item.get("title"):
                        cw_labels.append({
                            "id": item.get("id"),
                            "title": item.get("title"),
                            "description": item.get("description", ""),
                            "color": item.get("color", "#3b82f6")
                        })
        except Exception as e:
            logger.error(f"❌ Error fetching Chatwoot labels: {e}")

        settings = database.get_settings()
        selected_labels = json.loads(settings.get("valid_labels_order", "[]"))
        return jsonify({
            "success": True,
            "all_labels": cw_labels,
            "selected_labels": selected_labels
        })

# ── Pending Conversations Management ──────────────────────────────────────

pending_summary_cache = {"data": None, "timestamp": 0}
pending_summary_lock = threading.Lock()

def _fetch_pending_summary(force_refresh=False):
    now = time.time()
    with pending_summary_lock:
        if not force_refresh and pending_summary_cache["data"] and (now - pending_summary_cache["timestamp"] < 30):
            return pending_summary_cache["data"]

    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()

    # 1. Fetch total unassigned pending count
    total_unassigned_pending = 0
    try:
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        res = requests.get(url, params={"status": "pending", "assignee_type": "unassigned", "page": 1}, headers=headers, timeout=10)
        if res.status_code == 200:
            meta = res.json().get("data", {}).get("meta", {})
            total_unassigned_pending = meta.get("unassigned_count", 0)
    except Exception as e:
        logger.error(f"❌ Error fetching total pending count: {e}")

    # 2. Get list of all known labels (from Chatwoot and settings)
    labels_to_check = set()
    cw_label_colors = {}
    try:
        url = f"{base_url}/api/v1/accounts/{account_id}/labels"
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            raw_labels = res.json().get("payload", [])
            for item in raw_labels:
                if isinstance(item, dict) and item.get("title"):
                    title = item.get("title").strip()
                    labels_to_check.add(title)
                    cw_label_colors[title] = item.get("color", "#3b82f6")
    except Exception as e:
        logger.error(f"❌ Error fetching labels list: {e}")

    settings = database.get_settings()
    configured_labels = json.loads(settings.get("valid_labels_order", "[]"))
    for l in configured_labels:
        labels_to_check.add(l)

    # 3. Parallel fetch unassigned pending count for each label
    def _get_count_for_label(lbl):
        try:
            url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
            res = requests.get(url, params={"status": "pending", "assignee_type": "unassigned", "labels[]": lbl, "page": 1}, headers=headers, timeout=10)
            if res.status_code == 200:
                meta = res.json().get("data", {}).get("meta", {})
                return lbl, meta.get("unassigned_count", 0)
        except Exception:
            pass
        return lbl, 0

    label_counts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_get_count_for_label, lbl) for lbl in labels_to_check]
        for f in concurrent.futures.as_completed(futures):
            lbl, cnt = f.result()
            label_counts[lbl] = cnt

    # Format result: Sort labels with pending > 0 first, then by count descending
    labels_result = []
    sum_labeled = 0
    for lbl in sorted(label_counts.keys(), key=lambda x: (label_counts[x] > 0, label_counts[x]), reverse=True):
        cnt = label_counts[lbl]
        if cnt > 0:
            sum_labeled += cnt
        labels_result.append({
            "label": lbl,
            "title": lbl,
            "pending_count": cnt,
            "is_sales_label": (lbl in configured_labels),
            "color": cw_label_colors.get(lbl, "#3b82f6")
        })

    # Estimate / calculate unlabeled pending count
    unlabeled_count = max(0, total_unassigned_pending - sum_labeled)
    labels_result.insert(0, {
        "label": "unlabeled",
        "title": "بدون ليبل (Unlabeled)",
        "pending_count": unlabeled_count,
        "is_sales_label": True,
        "color": "#64748b"
    })

    result_data = {
        "success": True,
        "total_unassigned_pending": total_unassigned_pending,
        "labels": labels_result,
        "timestamp": datetime.now(CAIRO_TZ).isoformat()
    }

    with pending_summary_lock:
        pending_summary_cache["data"] = result_data
        pending_summary_cache["timestamp"] = now

    return result_data

def _reopen_pending_conversations(label: str, count: int) -> tuple[bool, int, str]:
    if count <= 0:
        return False, 0, "العدد المحدد يجب أن يكون أكبر من صفر"

    settings = database.get_settings()
    reopen_token = settings.get("reopen_access_token") or settings.get("data_team_token") or settings.get("chatwoot_access_token", "iyCoaajAwLLRvHGk3PAftUHi")
    base_url = settings.get("chatwoot_base_url", "https://crm.elkheta.com").rstrip("/")
    account_id = settings.get("chatwoot_account_id", "1")
    reopen_headers = {
        "api_access_token": reopen_token,
        "Content-Type": "application/json"
    }

    target_cids = []
    page = 1
    max_pages = max(10, (count // 25) + 3)
    is_unlabeled = (label in ["unlabeled", "no_label", "بدون ليبل"])

    while len(target_cids) < count and page <= max_pages:
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        params = {"status": "pending", "assignee_type": "unassigned", "page": page}
        if not is_unlabeled:
            params["labels[]"] = label

        try:
            res = requests.get(url, params=params, headers=reopen_headers, timeout=12)
            if res.status_code != 200:
                break
            payload = res.json().get("data", {}).get("payload", [])
            if not payload:
                break

            for conv in payload:
                cid = conv.get("id")
                if not cid or cid in target_cids:
                    continue

                if is_unlabeled:
                    c_labels = conv.get("labels", [])
                    if c_labels and len(c_labels) > 0:
                        continue  # Has labels, not unlabeled

                target_cids.append(cid)
                if len(target_cids) >= count:
                    break

            if len(payload) < 25:
                break
            page += 1
        except Exception as e:
            logger.error(f"❌ Error fetching pending convs for reopen: {e}")
            break

    if not target_cids:
        return False, 0, f"لم يتم العثور على محادثات معلقة متاحة للتصنيف '{label}'"

    # Reopen target conversations using DATA TEAM Admin Token and keep them strictly unassigned in open status
    def _toggle_open(cid):
        toggle_url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}/toggle_status"
        try:
            r = requests.post(toggle_url, json={"status": "open"}, headers=reopen_headers, timeout=10)
            if r.status_code in [200, 201]:
                # Immediately unassign so it stays in unassigned queue (never goes to any user)
                unassign_url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}/assignments"
                requests.post(unassign_url, json={"assignee_id": 0}, headers=reopen_headers, timeout=10)
                return True
        except Exception as e:
            logger.error(f"❌ Error in _toggle_open for {cid}: {e}")
            return False
        return False

    success_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        results = executor.map(_toggle_open, target_cids)
        success_count = sum(1 for ok in results if ok)

    # Invalidate cache
    with pending_summary_lock:
        pending_summary_cache["data"] = None

    logger.info(f"🔓 Reopened {success_count}/{len(target_cids)} pending conversations for label '{label}'")
    return True, success_count, f"تمت إعادة فتح {success_count} محادثة بنجاح للتصنيف '{label}' وتحويلها إلى قيد التوزيع (Open)."

@app.route('/api/pending-conversations/summary', methods=['GET'])
def api_pending_summary():
    force = request.args.get('force', 'false').lower() in ['true', '1']
    data = _fetch_pending_summary(force_refresh=force)
    return jsonify(data)

@app.route('/api/pending-conversations/reopen', methods=['POST'])
def api_pending_reopen():
    body = request.get_json(silent=True) or {}
    label = str(body.get("label", "")).strip()
    try:
        count = int(body.get("count", 10))
    except (ValueError, TypeError):
        count = 10

    if not label:
        return jsonify({"success": False, "error": "التصنيف (Label) مطلوب"}), 400

    ok, reopened, msg = _reopen_pending_conversations(label, count)
    if not ok:
        return jsonify({"success": False, "error": msg, "reopened_count": 0}), 400

    # Wake up routing thread if routing is enabled
    if is_routing_enabled():
        routing_wake_event.set()

    return jsonify({
        "success": True,
        "message": msg,
        "reopened_count": reopened,
        "label": label
    })

@app.route('/api/logs', methods=['GET'])
def api_logs():
    logs = database.get_recent_chat_logs(limit=100)
    return jsonify({"success": True, "logs": logs})

@app.route('/webhook', methods=['POST'])
def chatwoot_webhook():
    """
    Listens to live incoming webhooks from Chatwoot.
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}
        event = payload.get("event", "unknown")
        logger.info(f"📨 Webhook event received from Chatwoot: {event}")
        if is_routing_enabled():
            routing_wake_event.set()
        return jsonify({"status": "success", "event": event}), 200
    except Exception as e:
        logger.error(f"❌ Webhook handling error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ── Resolve & Quality Audit Engine ──────────────────────────────────────────

_resolve_audit_cache = {}
_resolve_audit_lock = threading.Lock()

def classify_resolved_chat(first_reply, last_non_activity_msg):
    """
    Intelligently classifies a resolved chat into:
    1. no_reply: Agent never replied (Critical violation)
    2. unanswered_inquiry: Client asked a question or sent a sales inquiry (Violation)
    3. unanswered_client: Last message from client was unanswered (Violation)
    4. natural_closing: Client sent courtesy closing phrase like 'تمام شكرا' (Compliant / Exempt)
    5. agent_replied: Agent was the last speaker (Compliant)
    """
    if not first_reply:
        return 'no_reply', '🚨 لم يتم الرد نهائياً على العميل وتم إغلاق الشات', True

    if not last_non_activity_msg:
        return 'no_reply', '🚨 لا توجد رسائل مسجلة في الشات وتم إغلاقه', True

    msg_type = last_non_activity_msg.get('message_type')
    content = (last_non_activity_msg.get('content') or '').strip()

    if msg_type == 1:
        return 'agent_replied', '✅ تم الرد والإغلاق بنجاح (آخر رسالة من الموظف)', False

    # Customer was the last speaker (msg_type == 0)
    text_clean = re.sub(r'[^\w\s]', ' ', content).strip().lower()
    
    closing_phrases = [
        'تمام شكرا', 'شكرا تمام', 'شكرا جدا', 'الف شكر', 'تسلم', 'تسلمي', 'تسلم يا غالي',
        'تسلم ايدك', 'تسلم يا باشا', 'شكرا يا فندم', 'شكرا ليك', 'شكرا ليكي', 'شكرا جزيلا',
        'شكرا لحضرتك', 'تمام يا فندم', 'تمام ماشي', 'ماشي تمام', 'خلاص تمام', 'اوك تمام',
        'تمام اوك', 'اوكي تمام', 'اوكيه', 'اوكي', 'اوك', 'ok', 'thanks', 'thank you', 'thx',
        'جزاك الله خيرا', 'ربنا يخليك', 'ربنا يباركلك', 'تمام فهمت', 'فهمت خلاص', 'كده تمام',
        'كدا تمام', 'تمام كدة', 'تمام كده', 'لا شكرا', 'مش محتاج حاجه', 'مش محتاج حاجة',
        'مفيش مشكلة', 'ولا يهمك', 'حبيبي تسلم', 'عفوا', 'سلام', 'مع السلامة', 'باي', 'bye',
        'تمام', 'ماشي', 'خلاص'
    ]

    inquiry_indicators = [
        '؟', '?', 'بكام', 'كام', 'سعر', 'اسعار', 'اشتراك', 'اشترك', 'باقة', 'باقات',
        'عرض', 'عروض', 'خصم', 'تخفيض', 'تفاصيل', 'ازاي', 'كيف', 'طريقة', 'ادفع', 'دفع',
        'فودافون كاش', 'فودافون', 'انستا باي', 'انستاباي', 'كود', 'رقم', 'لينك', 'رابط',
        'تسجيل', 'سنتر', 'منصة', 'حجز', 'احجز', 'ليه', 'امتى', 'متى', 'فين', 'ممكن',
        'ينفع', 'رد', 'حد يرد', 'انتوا فين'
    ]

    has_inquiry = any(ind in content.lower() for ind in inquiry_indicators)

    is_closing = False
    for cp in closing_phrases:
        if text_clean == cp or (len(text_clean) <= len(cp) + 8 and cp in text_clean):
            is_closing = True
            break

    # If inquiry exists and it's not a tiny courtesy message
    if has_inquiry and not (is_closing and len(text_clean) <= 12):
        return 'unanswered_inquiry', f'⚠️ سؤال معلق لم يُرد عليه: "{content[:60]}"', True

    if is_closing:
        return 'natural_closing', f'💬 إغلاق طبيعي (رسالة شكر/تأكيد: "{content[:40]}")', False

    return 'unanswered_client', f'⚠️ آخر رسالة من العميل بدون رد: "{content[:60]}"', True

def check_if_resolved_after_shift(resolved_at_dt, shift_start, shift_end, threshold_hours=1.0):
    """
    Checks if a conversation was resolved significantly after the agent's shift ended.
    threshold_hours: how many hours after shift_end to consider 'significantly after' (default 1.0 hour).
    Returns: (is_after_shift, hours_diff, description)
    """
    if not resolved_at_dt or shift_start is None or shift_end is None:
        return False, 0.0, ""
    
    res_hour = resolved_at_dt.hour + (resolved_at_dt.minute / 60.0)
    
    # Same-day shift, e.g. 10 to 18 (10 AM to 6 PM)
    if shift_start < shift_end:
        if res_hour >= shift_end:
            diff = res_hour - shift_end
            if diff >= threshold_hours:
                return True, round(diff, 1), f"بعد الشيفت بـ {round(diff, 1)} ساعة"
        elif res_hour < shift_start:
            diff = (24 - shift_end) + res_hour
            if diff >= threshold_hours:
                return True, round(diff, 1), f"بعد الشيفت بـ {round(diff, 1)} ساعة"
    # Overnight shift, e.g. 18 to 2 (6 PM to 2 AM)
    elif shift_start > shift_end:
        if shift_end <= res_hour < shift_start:
            diff = res_hour - shift_end
            if diff >= threshold_hours:
                return True, round(diff, 1), f"بعد الشيفت بـ {round(diff, 1)} ساعة"
                
    return False, 0.0, ""

def fetch_cw_agent_reports_for_range(ts_start, ts_end, agent_ids):
    """Fetches official Chatwoot reporting summary for all agents in the date range."""
    cw_reports = {}
    base_url, token, account_id = get_cw_config()
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
    session.mount('https://', adapter)
    session.headers.update(_cw_headers())
    
    def _fetch_one(ag_id):
        url = f"{base_url}/api/v2/accounts/{account_id}/reports/summary?type=agent&since={ts_start}&until={ts_end}&id={ag_id}"
        try:
            r = session.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                return ag_id, data.get('conversations_count', 0), data.get('resolutions_count', 0)
        except Exception:
            pass
        return ag_id, 0, 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(_fetch_one, agent_ids)
        for ag_id, conv_cnt, res_cnt in results:
            cw_reports[ag_id] = {"conversations_count": conv_cnt, "resolutions_count": res_cnt}
    return cw_reports

def fetch_conversations_from_chatwoot_direct(date_start, date_end=None, target_agent_id=None, max_pages=200):
    dt_start = CAIRO_TZ.localize(datetime.strptime(date_start, '%Y-%m-%d'))
    end_date_str = date_end or date_start
    dt_end = CAIRO_TZ.localize(datetime.strptime(end_date_str, '%Y-%m-%d')) + timedelta(days=1)
    ts_start = int(dt_start.timestamp())
    ts_end = int(dt_end.timestamp())

    # Get known sales agents from DB
    all_db_agents = database.get_all_agents()
    sales_agent_map = {str(a['id']): a['name'] for a in all_db_agents}

    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=2)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(headers)

    matched_convs = []
    seen_cids = set()

    def fetch_page(p):
        for attempt in range(2):
            try:
                r = session.get(f"{base_url}/api/v1/accounts/{account_id}/conversations?status=resolved&page={p}", timeout=14)
                if r.status_code == 200:
                    return p, r.json().get('data', {}).get('payload', [])
            except Exception as e:
                if attempt == 1:
                    logger.warning(f"⚠️ Error fetching Chatwoot resolved page {p}: {e}")
                time.sleep(0.2)
        return p, []

    chunk_size = 10
    current_page = 1
    stop = False

    while current_page <= max_pages and not stop:
        page_chunk = list(range(current_page, current_page + chunk_size))
        with concurrent.futures.ThreadPoolExecutor(max_workers=chunk_size) as ex:
            futures = [ex.submit(fetch_page, p) for p in page_chunk]
            results = [f.result() for f in futures]

        results.sort(key=lambda x: x[0])

        all_empty = True
        for page_num, items in results:
            if not items:
                continue
            all_empty = False

            # Check if all items on this page are already older than target date start
            page_acts = [c.get('last_activity_at') or c.get('updated_at') or c.get('created_at') for c in items]
            page_acts = [a for a in page_acts if a]
            if page_acts and max(page_acts) < ts_start:
                stop = True
                break

            for c in items:
                act = c.get('last_activity_at') or c.get('updated_at') or c.get('created_at')
                if not act:
                    continue

                if act < ts_start:
                    continue

                if ts_start <= act < ts_end:
                    cid = str(c.get('id'))
                    if cid in seen_cids:
                        continue
                    seen_cids.add(cid)

                    assignee = (c.get('meta', {}) or {}).get('assignee') or {}
                    ag_id = str(assignee.get('id') or '')
                    ag_name = assignee.get('name') or sales_agent_map.get(ag_id)

                    if target_agent_id and ag_id != str(target_agent_id):
                        continue

                    # Filter to known sales agents if any exist, or include all agents
                    if ag_id and (ag_id in sales_agent_map or not sales_agent_map):
                        matched_convs.append((c, ag_id, ag_name or f"Agent #{ag_id}"))

        if all_empty and current_page > 5:
            break

        current_page += chunk_size

    return matched_convs

def audit_conversations_for_agents(date_str=None, end_date_str=None, target_agent_id=None, source="chatwoot", force_refresh=False):
    """
    Audits conversations for all agents or a specific agent on a specific date or date range.
    source='chatwoot' pulls directly from Chatwoot API (all handled conversations).
    source='system' pulls from local SQLite chats_log (router-assigned conversations).
    """
    now_cairo = datetime.now(CAIRO_TZ)
    if not date_str or date_str in ["today", "النهاردة", "اليوم"]:
        date_str = now_cairo.strftime("%Y-%m-%d")
    elif date_str in ["yesterday", "أمس", "امبارح"]:
        date_str = (now_cairo - timedelta(days=1)).strftime("%Y-%m-%d")
    elif date_str in ["2days", "last2days", "يومين", "يومان"]:
        date_str = (now_cairo - timedelta(days=1)).strftime("%Y-%m-%d")
        end_date_str = now_cairo.strftime("%Y-%m-%d")

    if not end_date_str:
        end_date_str = date_str

    cache_key = f"{source}_{target_agent_id or 'ALL'}_{date_str}_{end_date_str}"
    now_ts = time.time()
    with _resolve_audit_lock:
        cached = _resolve_audit_cache.get(cache_key)
        if not force_refresh and cached and (now_ts - cached.get("timestamp", 0) < 900):
            return cached.get("payload")

    base_url, token, account_id = get_cw_config()
    audited_chats = []

    all_db_agents = database.get_all_agents()
    db_agent_dict = {str(a['id']): a for a in all_db_agents}
    open_counts = fetch_agent_report_counts()

    # Time boundaries
    dt_s = CAIRO_TZ.localize(datetime.strptime(date_str, '%Y-%m-%d'))
    dt_e = CAIRO_TZ.localize(datetime.strptime(end_date_str, '%Y-%m-%d')) + timedelta(days=1)
    ts_start = int(dt_s.timestamp())
    ts_end = int(dt_e.timestamp())

    if source == "chatwoot":
        # Direct fetch from Chatwoot API
        raw_matches = fetch_conversations_from_chatwoot_direct(date_str, date_end=end_date_str, target_agent_id=target_agent_id)
        for c, ag_id, ag_name in raw_matches:
            cid = str(c.get("id"))
            st = c.get("status", "resolved")
            fr = c.get("first_reply_created_at")
            lnm = c.get("last_non_activity_message") or {}
            meta = c.get("meta", {}) or {}
            sender = meta.get("sender") or {}
            s_name = sender.get("name") or ""
            s_phone = sender.get("phone_number") or sender.get("identifier") or ""
            last_content = (lnm.get("content") or "").strip()
            last_sender_type = lnm.get("message_type")

            cls_code, cls_desc, is_viol = classify_resolved_chat(fr, lnm)

            act_ts = c.get("last_activity_at") or c.get("updated_at") or c.get("created_at")
            act_dt = datetime.fromtimestamp(act_ts, CAIRO_TZ) if act_ts else None
            act_dt_str = act_dt.isoformat() if act_dt else ""

            # Check if resolved significantly after shift end
            db_ag = db_agent_dict.get(ag_id, {})
            shift_s = db_ag.get("shift_start")
            shift_e = db_ag.get("shift_end")
            is_after_s, diff_hours, desc_s = check_if_resolved_after_shift(act_dt, shift_s, shift_e)

            labels_list = c.get("labels") or []
            label_str = ", ".join(labels_list) if isinstance(labels_list, list) else str(labels_list)

            coord_str = db_ag.get("coordinator_name") or db_ag.get("coordinator") or "—"
            shift_display = db_ag.get("shift_text") or db_ag.get("shift") or "—"

            audited_chats.append({
                "conv_id": cid,
                "agent_id": ag_id,
                "agent_name": ag_name,
                "coordinator": coord_str,
                "shift": shift_display,
                "label": label_str,
                "assigned_at": act_dt_str,
                "status": st,
                "first_reply_created_at": fr,
                "last_content": last_content,
                "last_sender_type": last_sender_type,
                "classification": cls_code,
                "classification_label": cls_desc,
                "is_violation": is_viol,
                "is_after_shift": is_after_s,
                "hours_after_shift": diff_hours,
                "after_shift_desc": desc_s,
                "resolved_time_str": act_dt.strftime("%I:%M %p") if act_dt else "",
                "sender_name": s_name,
                "sender_phone": s_phone,
                "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}"
            })
    else:
        # System-routed logs from local database
        routed_chats = database.get_routed_chats_for_audit(date_str=date_str, end_date_str=end_date_str, agent_id=target_agent_id)
        headers = _cw_headers()
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
        session.mount("https://", adapter)
        session.headers.update(headers)

        def _inspect_one_chat(ch):
            cid = ch.get("conv_id")
            ag_id = str(ch.get("agent_id") or "")
            ag_name = ch.get("agent_name") or "Unknown"
            assigned_at = ch.get("assigned_at") or ""
            label = ch.get("label") or ""

            url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}"
            try:
                res = session.get(url, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    st = data.get("status", "unknown")
                    fr = data.get("first_reply_created_at")
                    lnm = data.get("last_non_activity_message") or {}
                    meta = data.get("meta", {}) or {}
                    sender = meta.get("sender") or {}
                    s_name = sender.get("name") or ch.get("sender_name") or ""
                    s_phone = sender.get("phone_number") or sender.get("identifier") or ch.get("sender_phone") or ""

                    last_content = (lnm.get("content") or "").strip()
                    last_sender_type = lnm.get("message_type")

                    if st == "resolved":
                        cls_code, cls_desc, is_viol = classify_resolved_chat(fr, lnm)
                    elif st == "open":
                        cls_code, cls_desc, is_viol = "still_open", "🟢 قيد المتابعة (شات مفتوح)", False
                    elif st == "pending":
                        cls_code, cls_desc, is_viol = "pending", "⏳ شات معلق (Pending)", False
                    else:
                        cls_code, cls_desc, is_viol = st, f"حالة الشات: {st}", False

                    act_ts = data.get("last_activity_at") or data.get("updated_at")
                    act_dt = datetime.fromtimestamp(act_ts, CAIRO_TZ) if act_ts else None

                    db_ag = db_agent_dict.get(ag_id, {})
                    shift_s = db_ag.get("shift_start")
                    shift_e = db_ag.get("shift_end")
                    is_after_s, diff_hours, desc_s = check_if_resolved_after_shift(act_dt, shift_s, shift_e)

                    coord_str = db_ag.get("coordinator_name") or db_ag.get("coordinator") or "—"
                    shift_display = db_ag.get("shift_text") or db_ag.get("shift") or "—"

                    return {
                        "conv_id": cid,
                        "agent_id": ag_id,
                        "agent_name": ag_name,
                        "coordinator": coord_str,
                        "shift": shift_display,
                        "label": label,
                        "assigned_at": assigned_at,
                        "status": st,
                        "first_reply_created_at": fr,
                        "last_content": last_content,
                        "last_sender_type": last_sender_type,
                        "classification": cls_code,
                        "classification_label": cls_desc,
                        "is_violation": is_viol,
                        "is_after_shift": is_after_s,
                        "hours_after_shift": diff_hours,
                        "after_shift_desc": desc_s,
                        "resolved_time_str": act_dt.strftime("%I:%M %p") if act_dt else "",
                        "sender_name": s_name,
                        "sender_phone": s_phone,
                        "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}"
                    }
            except Exception as e:
                logger.warning(f"⚠️ Error inspecting conv {cid}: {e}")

            db_ag_fallback = db_agent_dict.get(ag_id, {})
            return {
                "conv_id": cid,
                "agent_id": ag_id,
                "agent_name": ag_name,
                "coordinator": db_ag_fallback.get("coordinator_name") or db_ag_fallback.get("coordinator") or "—",
                "shift": db_ag_fallback.get("shift_text") or db_ag_fallback.get("shift") or "—",
                "label": label,
                "assigned_at": assigned_at,
                "status": "unknown",
                "classification": "unknown",
                "classification_label": "تعذر جلب حالة الشات",
                "is_violation": False,
                "is_after_shift": False,
                "hours_after_shift": 0.0,
                "after_shift_desc": "",
                "resolved_time_str": "",
                "sender_name": ch.get("sender_name") or "",
                "sender_phone": ch.get("sender_phone") or "",
                "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}"
            }

        max_workers = min(10, max(1, len(routed_chats)))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_inspect_one_chat, ch) for ch in routed_chats]
            for f in concurrent.futures.as_completed(futures):
                res = f.result()
                if res:
                    audited_chats.append(res)

    # Sort audited chats by assigned_at desc
    audited_chats.sort(key=lambda c: c.get("assigned_at", ""), reverse=True)

    # Group by Agent
    all_db_agents = database.get_all_agents()
    db_agent_dict = {str(a['id']): a for a in all_db_agents}
    open_counts = fetch_agent_report_counts()

    agents_map = {}
    for ch in audited_chats:
        ag_id = ch["agent_id"]
        if ag_id not in agents_map:
            db_ag = db_agent_dict.get(ag_id, {})
            agents_map[ag_id] = {
                "agent_id": ag_id,
                "agent_name": ch["agent_name"],
                "crm_name": db_ag.get("crm_name") or ch["agent_name"],
                "coordinator": db_ag.get("coordinator_name") or db_ag.get("coordinator") or "—",
                "shift": db_ag.get("shift_text") or db_ag.get("shift") or "—",
                "shift_start": db_ag.get("shift_start"),
                "shift_end": db_ag.get("shift_end"),
                "team": db_ag.get("team") or "Sales",
                "total_routed": 0,
                "total_resolved": 0,
                "total_open": 0,
                "total_violations": 0,
                "after_shift_resolves_count": 0,
                "unanswered_inquiries_count": 0,
                "no_reply_count": 0,
                "natural_closing_count": 0,
                "properly_resolved_count": 0,
                "chats": []
            }
        ag = agents_map[ag_id]
        ag["total_routed"] += 1
        st = ch.get("status")
        cls = ch.get("classification")
        if st == "resolved":
            ag["total_resolved"] += 1
            if ch.get("is_after_shift"):
                ag["after_shift_resolves_count"] += 1
            if ch.get("is_violation"):
                ag["total_violations"] += 1
                if cls == "no_reply":
                    ag["no_reply_count"] += 1
                elif cls in ["unanswered_inquiry", "unanswered_client"]:
                    ag["unanswered_inquiries_count"] += 1
            else:
                ag["properly_resolved_count"] += 1
                if cls == "natural_closing":
                    ag["natural_closing_count"] += 1
        elif st == "open":
            ag["total_open"] += 1

        ag["chats"].append(ch)

    # Also include sales agents who had 0 resolved chats
    if not target_agent_id:
        for db_ag in all_db_agents:
            ag_id = str(db_ag['id'])
            if db_ag.get('team') not in ['Sales', 'Data']:
                continue
            if ag_id not in agents_map:
                open_cnt = open_counts.get(ag_id, 0)
                agents_map[ag_id] = {
                    "agent_id": ag_id,
                    "agent_name": db_ag.get("name") or f"Agent #{ag_id}",
                    "crm_name": db_ag.get("crm_name") or db_ag.get("name"),
                    "coordinator": db_ag.get("coordinator_name") or db_ag.get("coordinator") or "—",
                    "shift": db_ag.get("shift_text") or db_ag.get("shift") or "—",
                    "shift_start": db_ag.get("shift_start"),
                    "shift_end": db_ag.get("shift_end"),
                    "team": db_ag.get("team") or "Sales",
                    "total_routed": open_cnt,
                    "total_resolved": 0,
                    "total_open": open_cnt,
                    "total_violations": 0,
                    "after_shift_resolves_count": 0,
                    "unanswered_inquiries_count": 0,
                    "no_reply_count": 0,
                    "natural_closing_count": 0,
                    "properly_resolved_count": 0,
                    "chats": []
                }

    # If source == "chatwoot": fetch official reporting metrics (conversations_count) from Chatwoot API
    if source == "chatwoot" and agents_map:
        try:
            target_ids = list(agents_map.keys())
            cw_reports = fetch_cw_agent_reports_for_range(ts_start, ts_end, target_ids)
            for ag_id, ag in agents_map.items():
                if ag["total_open"] == 0:
                    ag["total_open"] = open_counts.get(ag_id, 0)
                rep = cw_reports.get(ag_id)
                if rep and rep.get("conversations_count", 0) > 0:
                    ag["total_routed"] = rep["conversations_count"]
                else:
                    ag["total_routed"] = ag["total_resolved"] + ag["total_open"]
                # Safety check
                if ag["total_routed"] < ag["total_resolved"]:
                    ag["total_routed"] = ag["total_resolved"] + ag["total_open"]
        except Exception as e:
            logger.warning(f"⚠️ fetch_cw_agent_reports_for_range error: {e}")
            for ag_id, ag in agents_map.items():
                if ag["total_open"] == 0:
                    ag["total_open"] = open_counts.get(ag_id, 0)
                ag["total_routed"] = ag["total_resolved"] + ag["total_open"]

    # Compute rates for agents
    agent_summaries = []
    all_violations = []

    for ag_id, ag in agents_map.items():
        res_cnt = ag["total_resolved"]
        tot_cnt = ag["total_routed"]
        prop_cnt = ag["properly_resolved_count"]
        ag["resolution_rate"] = round((res_cnt / tot_cnt * 100), 1) if tot_cnt > 0 else 0
        ag["compliance_rate"] = round((prop_cnt / res_cnt * 100), 1) if res_cnt > 0 else 100
        agent_summaries.append(ag)

    # Sort agents: agents with violations or off-shift resolves first, then by total resolved desc
    agent_summaries.sort(key=lambda a: (a["total_violations"], a["after_shift_resolves_count"], a["total_resolved"]), reverse=True)

    # Collect all violation and after-shift chats across all audited agents
    all_violations = []
    all_after_shift = []
    for ch in audited_chats:
        if ch.get("is_violation"):
            all_violations.append(ch)
        if ch.get("is_after_shift"):
            all_after_shift.append(ch)

    total_routed = sum(a["total_routed"] for a in agent_summaries)
    total_resolved = sum(a["total_resolved"] for a in agent_summaries)
    total_open = sum(a["total_open"] for a in agent_summaries)
    total_violations = sum(a["total_violations"] for a in agent_summaries)
    total_after_shift = sum(a["after_shift_resolves_count"] for a in agent_summaries)
    total_inquiries = sum(a["unanswered_inquiries_count"] for a in agent_summaries)
    total_no_reply = sum(a["no_reply_count"] for a in agent_summaries)
    total_compliant = sum(a["properly_resolved_count"] for a in agent_summaries)

    is_range = (date_str != end_date_str)
    date_display = f"{date_str} إلى {end_date_str}" if is_range else date_str

    payload = {
        "summary": {
            "date": date_display,
            "date_start": date_str,
            "date_end": end_date_str,
            "is_range": is_range,
            "source": source,
            "total_routed": total_routed,
            "total_resolved": total_resolved,
            "total_open": total_open,
            "total_violations": total_violations,
            "total_after_shift_resolves": total_after_shift,
            "total_unanswered_inquiries": total_inquiries,
            "total_no_reply": total_no_reply,
            "total_compliant": total_compliant,
            "resolution_rate": round((total_resolved / total_routed * 100), 1) if total_routed > 0 else 0,
            "compliance_rate": round((total_compliant / total_resolved * 100), 1) if total_resolved > 0 else 100,
            "audited_at": datetime.now(CAIRO_TZ).strftime("%I:%M %p")
        },
        "agents": agent_summaries,
        "all_violations": all_violations,
        "all_after_shift": all_after_shift
    }

    with _resolve_audit_lock:
        _resolve_audit_cache[cache_key] = {"timestamp": now_ts, "payload": payload}

    return payload

@app.route('/api/reports/resolve-audit', methods=['GET', 'POST'])
def api_resolve_audit():
    req_json = request.get_json(silent=True) or {}
    agent_id = request.args.get("agent_id") or req_json.get("agent_id")
    date_str = request.args.get("date") or request.args.get("date_start") or request.args.get("startDate") or req_json.get("date") or req_json.get("date_start") or req_json.get("startDate")
    end_date_str = request.args.get("date_end") or request.args.get("endDate") or req_json.get("date_end") or req_json.get("endDate")
    source = request.args.get("source") or req_json.get("source") or "chatwoot"
    force_refresh = str(request.args.get("force_refresh", "")).lower() in ["true", "1", "yes"]
    if not force_refresh:
        force_refresh = bool(req_json.get("force_refresh", False))

    try:
        data = audit_conversations_for_agents(
            date_str=date_str,
            end_date_str=end_date_str,
            target_agent_id=agent_id,
            source=source,
            force_refresh=force_refresh
        )
        return jsonify({"success": True, "data": data})
    except Exception as e:
        logger.error(f"❌ api_resolve_audit error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# Serve Frontend static files
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(404)
def handle_404(e):
    if not request.path.startswith('/api/'):
        return send_from_directory(app.static_folder, 'index.html')
    return jsonify({"error": "Endpoint not found"}), 404

# ── Main Entrypoint ─────────────────────────────────────────────────────────

_single_instance_socket = None

def _enforce_single_instance():
    """Prevents multiple instances of app.py from running concurrently."""
    global _single_instance_socket
    if os.environ.get('RENDER') or os.environ.get('SPACE_ID') or os.environ.get('HF_SPACE_ID') or os.environ.get('PORT'):
        return
    import socket
    _single_instance_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # Dedicated lock port for the router process
        _single_instance_socket.bind(('127.0.0.1', 5055))
    except socket.error:
        logger.critical("🛑 CRITICAL: Another instance of Chatwoot Smart Router is already running! Exiting.")
        print("\n" + "="*70)
        print("❌ خطأ: يوجد نسخة أخرى من البرنامج تعمل بالفعل في الخلفية!")
        print("❌ تم إيقاف هذا التشغيل تلقائياً لتجنب تكرار التوزيع والتضارب بين العمليات.")
        print("="*70 + "\n")
        sys.exit(1)

if __name__ == '__main__':
    _enforce_single_instance()
    logger.info("🚀 Initializing Chatwoot Smart Router...")
    database.init_db()
    # Safety: Start with routing STOPPED until supervisor clicks Start in Dashboard
    set_routing_enabled(False)
    
    # 1. Load initial agents and teams from Chatwoot
    _refresh_team_cache()
    sync_chatwoot_agents_to_db()

    # 2. Try initial CRM sync if credentials exist
    try:
        settings = database.get_settings()
        if settings.get("crm_email") and settings.get("crm_password"):
            crm_service.sync_shifts_to_database()
    except Exception as e:
        logger.warning(f"⚠️ Initial CRM sync skipped: {e}")

    # 3. Start periodic routing loop in background
    periodic_thread = threading.Thread(target=_periodic_routing_loop, daemon=True, name="PeriodicRouter")
    periodic_thread.start()

    # 4. Start periodic Chatwoot report counts updater in background
    report_thread = threading.Thread(target=_periodic_agent_report_updater, daemon=True, name="CWReportUpdater")
    report_thread.start()

    port = int(os.environ.get('PORT', 5005))
    logger.info(f"🌐 Chatwoot Routing Engine is LIVE on port {port}.")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
