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
    last_smart_reassign_ts = 0
    while True:
        try:
            if is_routing_enabled():
                routed = _run_single_routing_loop_safe()
                if routed > 0:
                    logger.info(f"✅ Auto-Cycle Finished: Routed {routed} conversations.")
        except Exception as e:
            logger.error(f"❌ Periodic routing error: {e}")

        try:
            cfg = _get_smart_reassign_config()
            if cfg.get("auto_enabled") and cfg.get("labels") and (time.time() - last_smart_reassign_ts >= 50):
                last_smart_reassign_ts = time.time()
                res = _execute_smart_reassign()
                if res.get("reassigned_count", 0) > 0:
                    logger.info(f"⚡ Auto Smart-Reassign Finished: Reassigned {res['reassigned_count']} delayed conversations.")
            elif not cfg.get("auto_enabled"):
                last_smart_reassign_ts = 0
        except Exception as e:
            logger.error(f"❌ Periodic smart reassign error: {e}")

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

_chat_wait_tracker = {}
_chat_fast_reply_cache = {}
_chat_tracker_lock = threading.Lock()

def _is_chat_delay_exempt(conv):
    """
    Returns (is_exempt: bool, reason_code: str)
    Exempts conversations where:
    1. Agent wrote a Private Note (private=True) or last message is from the agent (message_type=1).
    2. Customer sent a courtesy/closing message ('تمام', 'شكرا', 'ماشي', 'هشوف واكلمك', etc.) without an inquiry.
    3. Customer sent only an emoji/like (👍, ❤️, etc.) or sticker without inquiry text.
    """
    lnm = conv.get("last_non_activity_message") or {}
    msgs = conv.get("messages") or []
    last_m = msgs[-1] if msgs else {}

    # 1. Private note or agent already replied
    if lnm.get("private") is True or last_m.get("private") is True:
        return True, "private_note"
    if lnm.get("message_type") == 1:
        return True, "agent_replied"
    if last_m.get("message_type") == 1:
        last_m_ts = last_m.get("created_at") or 0
        lnm_ts = lnm.get("created_at") or 0
        if last_m_ts >= lnm_ts:
            return True, "agent_replied"

    # 2. Check customer message content & attachments
    content = (lnm.get("content") or "").strip()
    content_type = str(lnm.get("content_type") or "").lower()
    attachments = lnm.get("attachments") or []

    if content_type == "sticker":
        return True, "sticker"

    if attachments:
        all_stickers = True
        for att in attachments:
            ft = str(att.get("file_type") or "").lower()
            ext = str(att.get("extension") or "").lower()
            durl = str(att.get("data_url") or "").lower()
            fsize = int(att.get("file_size") or 0)
            w = att.get("width")
            h = att.get("height")
            is_sticker_att = (
                ft in ("sticker", "ig_reel", "story_mention")
                or ext in ("webp", "gif")
                or durl.endswith(".webp")
                or durl.endswith(".gif")
                or "39178562_1505197616293642" in durl
                or "369239263222822" in durl
                or (0 < fsize <= 18000 and ft == "image")
                or (w and h and w == h and w <= 512 and (ext in ("png", "webp", "gif") or (0 < fsize <= 55000)))
            )
            if is_sticker_att:
                continue
            all_stickers = False
            break
        if all_stickers and not content:
            return True, "sticker"
        if not all_stickers:
            return False, ""

    if not content:
        return True, "sticker_or_reaction"

    # Check if message is purely emojis / symbols / likes
    text_clean = re.sub(r'[^\w\s]', ' ', content).strip().lower()
    text_clean = re.sub(r'\s+', ' ', text_clean)
    if not text_clean:
        return True, "emoji_like"

    text_norm = (
        text_clean.replace('أ', 'ا')
        .replace('إ', 'ا')
        .replace('آ', 'ا')
        .replace('ة', 'ه')
        .replace('ى', 'ي')
        .replace('ً', '')
        .replace('ـ', '')
    )
    # Collapse repeated consecutive letters (e.g. 'تمامم' -> 'تمام', 'شكرااا' -> 'شكرا', 'ماشييي' -> 'ماشي')
    text_dedup = re.sub(r'(.)\1+', r'\1', text_norm)

    explicit_closing_phrases = [
        'لا شكرا', 'مش عايزين نشترك', 'مش عاوزين نشترك', 'مش محتاج حاجه', 'مش محتاج',
        'مش عايز', 'مش عاوز', 'م عايزه', 'م عايز', 'مش عايزه', 'مش عاوزه',
        'خلاص انا هروح دروس', 'خلاص مش محتاج', 'شكرا مش محتاج',
        'خلاص شكرا لحضرتك انا اشتركت', 'انا اشتركت خلاص', 'اشتركت بالفعل', 'اشتركت خلاص', 'تم الاشتراك',
        'تم حل المشكله', 'اتحلت المشكله', 'المشكله اتحلت',
        'هشوف كده وكلمك', 'هشوف كدا وكلمك', 'هشوف واكلمك', 'هفكر واكلمك', 'هكلم حضرتك تاني', 'هكلمك تاني',
        'هرجع لحضرتك', 'هسال وارد عليك'
    ]
    for ecp in explicit_closing_phrases:
        if (ecp in text_norm and len(text_norm) <= len(ecp) + 22) or (ecp in text_dedup and len(text_dedup) <= len(ecp) + 22):
            return True, "courtesy_closing"

    inquiry_indicators = [
        '؟', '?', 'بكام', 'كام', 'سعر', 'اسعار', 'اشتراك', 'اشترك', 'باقه', 'باقات',
        'عرض', 'عروض', 'خصم', 'تخفيض', 'تفاصيل', 'ازاي', 'كيف', 'طريقه', 'ادفع', 'دفع',
        'فودافون', 'انستا', 'فوري', 'كود', 'رقم', 'لينك', 'رابط', 'تسجيل', 'سنتر',
        'منصه', 'حجز', 'احجز', 'هاحجز', 'هحجز', 'عايز', 'عاوز', 'محتاج', 'ليه',
        'امتي', 'متي', 'فين', 'ممكن', 'ينفع', 'رد', 'حد يرد', 'انتوا فين', 'مشكله',
        'شحن', 'تفعيل', 'شرح', 'مواد', 'عربي', 'لغات', 'ثانوي', 'اعدادي', 'ابتدائي'
    ]
    if any(ind in content.lower() or ind in text_norm for ind in inquiry_indicators):
        return False, ""

    digits_count = sum(1 for ch in content if ch.isdigit())
    if digits_count >= 4:
        return False, ""

    courtesy_phrases = {
        'تمام', 'تم', 'ماشي', 'شكرا', 'اشكرك', 'تسلم', 'تسلمي', 'الف شكر', 'شكرا جدا',
        'شكرا جزيلا', 'شكرا لحضرتك', 'شكرا يا فندم', 'تسلم يا غالي', 'تسلم ايدك',
        'تسلم يا باشا', 'شكرا ليك', 'شكرا ليكي', 'تمام يا فندم', 'تمام ماشي',
        'ماشي تمام', 'خلاص تمام', 'اوك تمام', 'تمام اوك', 'اوكي تمام', 'اوكيه',
        'اوكي', 'اوك', 'ok', 'okay', 'k', 'thanks', 'thank you', 'thx', 'ty', 'like',
        'جزاك الله خيرا', 'ربنا يخليك', 'ربنا يباركلك', 'تمام فهمت', 'فهمت خلاص',
        'فهمت', 'وصلت', 'كده تمام', 'كدا تمام', 'تمام كدا', 'تمام كده', 'كله تمام',
        'مفيش مشكله', 'ولا يهمك', 'حبيبي تسلم', 'عفوا', 'العفو', 'ميرسي', 'merci',
        'سلام', 'مع السلامه', 'باي', 'bye', 'خلاص', 'حاضر', 'طيب', 'طيب تمام',
        'ماشي شكرا', 'تمام ماشي شكرا', 'تمام شكرا', 'شكرا تمام', 'ان شاء الله',
        'باذن الله', 'بالتوفيق', 'حبيبي', 'تمام تسلم'
    }

    if text_norm in courtesy_phrases or text_dedup in courtesy_phrases:
        return True, "courtesy_closing"

    words = text_norm.split()
    words_dedup = text_dedup.split()
    courtesy_words = {
        'تمام', 'تم', 'ماشي', 'شكرا', 'اشكرك', 'تسلم', 'تسلمي', 'الف', 'شكر', 'جدا', 'جزيلا',
        'لحضرتك', 'يا', 'فندم', 'غالي', 'ايدك', 'باشا', 'ليك', 'ليكي', 'خلاص', 'اوك',
        'اوكي', 'اوكيه', 'ok', 'okay', 'thanks', 'thank', 'you', 'thx', 'جزاك', 'الله',
        'خيرا', 'ربنا', 'يخليك', 'يباركلك', 'فهمت', 'وصلت', 'كده', 'كدا', 'كله', 'حاضر',
        'طيب', 'عفوا', 'العفو', 'ميرسي', 'merci', 'سلام', 'باي', 'حبيبي', 'ان', 'شاء', 'باذن'
    }
    if 1 <= len(words) <= 5 and all((w in courtesy_words or wd in courtesy_words) for w, wd in zip(words, words_dedup)):
        return True, "courtesy_closing"

    return False, ""


_chat_wait_tracker = {}
_chat_fast_reply_cache = {}
_chat_assignment_cache = {}
_chat_tracker_lock = threading.Lock()


def _extract_agent_assign_Info(messages_list, ag_name="", avail_name="", team_name=""):
    """
    Scans a Chatwoot messages list to find:
    1. Latest timestamp when the conversation was assigned to this agent (assign_ts).
    2. Whether the last non-activity message (or private note) in the full list is from the agent (agent_handled).
    """
    if not messages_list or not isinstance(messages_list, list):
        return 0, False

    ag_norm = " ".join((ag_name or "").strip().lower().split())
    av_norm = " ".join((avail_name or "").strip().lower().split())
    tm_norm = " ".join((team_name or "").strip().lower().split())

    latest_assign_ts = 0
    last_human_msg = None

    for m in messages_list:
        if not isinstance(m, dict):
            continue
        mtype = m.get("message_type")
        is_priv = bool(m.get("private"))
        cts = int(m.get("created_at") or 0)

        if is_priv or mtype in (0, 1):
            if last_human_msg is None or cts >= int(last_human_msg.get("created_at") or 0):
                last_human_msg = m

        if mtype == 2:
            txt_norm = " ".join((m.get("content") or "").strip().lower().split())
            if "assigned to " in txt_norm:
                matched_agent = False
                if ag_norm and ag_norm in txt_norm:
                    matched_agent = True
                elif av_norm and av_norm in txt_norm:
                    matched_agent = True
                elif not tm_norm or f"assigned to {tm_norm}" not in txt_norm:
                    # Fallback if agent display name changed: any 'assigned to X' that isn't the team name
                    matched_agent = True

                if matched_agent and cts > latest_assign_ts:
                    latest_assign_ts = cts

    agent_handled = False
    if last_human_msg is not None:
        if last_human_msg.get("private") is True or last_human_msg.get("message_type") == 1:
            agent_handled = True

    return latest_assign_ts, agent_handled


def _check_if_fast_reply_5m(conv, cid_str, aid, assigned_ts_map, assigned_ts_by_cid, now_ts):
    """
    Determines if an answered/exempt open conversation was replied to within 5 minutes (<= 300s)
    from when it was assigned to the human agent (or from customer's message to the agent).
    Does NOT use (first_reply_created_at - created_at) because the AI bot sends the initial greeting at creation.
    """
    cache_key = f"{cid_str}_{aid}"
    with _chat_tracker_lock:
        if _chat_fast_reply_cache.get(cache_key) or _chat_fast_reply_cache.get(cid_str):
            return True

    lnm = conv.get("last_non_activity_message") or {}
    msgs = conv.get("messages") or []
    last_m = msgs[-1] if msgs else {}
    reply_ts = int(last_m.get("created_at") or lnm.get("created_at") or conv.get("last_activity_at") or 0)

    # 1. Check against previously tracked effective_waiting_since
    with _chat_tracker_lock:
        prev_ws = _chat_wait_tracker.get(cache_key) or _chat_wait_tracker.get(cid_str)
        cached_assign = (_chat_assignment_cache.get((cid_str, aid)) or {}).get("assign_ts", 0)
        if prev_ws and reply_ts and reply_ts >= prev_ws:
            if (reply_ts - prev_ws) <= 300:
                _chat_fast_reply_cache[cache_key] = True
                return True
            else:
                return False

    # 2. Check against router/Chatwoot assignment timestamp if available
    assigned_ts = max(
        assigned_ts_map.get((cid_str, aid), 0),
        assigned_ts_by_cid.get(cid_str, 0),
        cached_assign
    )
    if assigned_ts and reply_ts and reply_ts >= assigned_ts:
        if (reply_ts - assigned_ts) <= 300:
            with _chat_tracker_lock:
                _chat_fast_reply_cache[cache_key] = True
            return True

    return False


def _build_delays_report(num_pages=0):
    """
    Fetches ALL open assigned conversations (or num_pages if > 0) and calculates:
    - Delay strictly from max(waiting_since, agent_assigned_ts) so no agent is ever penalized
      for time before the chat was assigned to them.
    - Smart exemptions (private notes, courtesy closings, likes/stickers).
    - Full open chats count & speed_score per agent (only counting today's active chats for positive points
      so hoarding old un-resolved chats from previous days does not inflate score).
    """
    import math
    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()

    now_cairo = datetime.now(CAIRO_TZ)
    today_start_ts = int(now_cairo.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())

    all_agents = database.get_all_agents()
    agents_map = {str(a["id"]): dict(a) for a in all_agents}
    all_mappings = database.get_all_mappings()
    mapping_dict = {str(m["chatwoot_agent_id"]): m["crm_name"] for m in all_mappings if m.get("chatwoot_agent_id")}

    # Load assignment timestamps from local SQLite chats_log
    assigned_ts_map = {}     # (cid_str, aid) -> latest assigned_ts
    assigned_ts_by_cid = {}  # cid_str -> latest assigned_ts
    try:
        conn = database.get_db()
        cur = conn.cursor()
        cur.execute("SELECT conv_id, agent_id, assigned_at FROM chats_log WHERE id > (SELECT COALESCE(MAX(id), 0) - 10000 FROM chats_log)")
        for r in cur.fetchall():
            if r["conv_id"] and r["assigned_at"]:
                try:
                    ts_val = int(datetime.fromisoformat(r["assigned_at"]).timestamp())
                    c_str = str(r["conv_id"])
                    a_str = str(r["agent_id"] or "")
                    if ts_val > assigned_ts_by_cid.get(c_str, 0):
                        assigned_ts_by_cid[c_str] = ts_val
                    if a_str and ts_val > assigned_ts_map.get((c_str, a_str), 0):
                        assigned_ts_map[(c_str, a_str)] = ts_val
                except Exception:
                    pass
        conn.close()
    except Exception:
        pass

    # Pooled HTTP session for fast parallel fetching of all pages
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=2)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(headers)

    def _fetch_page_with_meta(p):
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        for attempt in range(2):
            try:
                res = session.get(
                    url,
                    params={"status": "open", "assignee_type": "assigned", "page": p},
                    timeout=14
                )
                if res.status_code == 200:
                    data = res.json().get("data", {})
                    return data.get("payload", []), data.get("meta", {})
            except Exception as err:
                if attempt == 1:
                    logger.warning(f"⚠️ Error fetching conversations page {p}: {err}")
                time.sleep(0.15)
        return [], {}

    t0 = time.time()
    first_payload, meta_info = _fetch_page_with_meta(1)
    raw_convs = list(first_payload)

    total_assigned_meta = int(meta_info.get("assigned_count") or 0)
    if num_pages and num_pages > 0:
        target_pages = max(1, min(int(num_pages), 100))
    else:
        # Fetch ALL open assigned conversations across all pages
        calc_pages = math.ceil(total_assigned_meta / 25.0) if total_assigned_meta > 0 else 40
        target_pages = max(1, min(calc_pages, 100))

    if target_pages > 1:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(target_pages - 1, 20)) as executor:
            results = executor.map(lambda p: _fetch_page_with_meta(p)[0], range(2, target_pages + 1))
            for page_convs in results:
                if page_convs:
                    raw_convs.extend(page_convs)

    # Deduplicate conversations by ID (in case pagination shifted slightly while fetching)
    deduped_convs = []
    seen_conv_ids = set()
    for c in raw_convs:
        cid_val = c.get("id")
        if cid_val and cid_val not in seen_conv_ids:
            seen_conv_ids.add(cid_val)
            deduped_convs.append(c)

    # Filter strictly to configured Sales labels so non-Sales labels never show up in delays or scores
    settings = database.get_settings()
    window_minutes = int(settings.get("window_minutes", 30))
    route_unlabeled = is_route_unlabeled_enabled()
    try:
        configured_sales_labels = json.loads(settings.get("valid_labels_order", "[]"))
        if not isinstance(configured_sales_labels, list):
            configured_sales_labels = []
    except Exception:
        configured_sales_labels = []

    sales_labels_lower = {str(l).strip().lower() for l in configured_sales_labels if str(l).strip()}

    def _conv_matches_sales_labels(conv_obj):
        if not sales_labels_lower:
            return True
        c_lbls = [str(l).strip().lower() for l in (conv_obj.get("labels") or []) if str(l).strip()]
        if not c_lbls:
            return route_unlabeled or any(
                u in sales_labels_lower for u in ("unlabeled", "no_label", "بدون ليبل", "بدون ليبل (unlabeled)")
            )
        return any(l in sales_labels_lower for l in c_lbls)

    all_convs = [c for c in deduped_convs if _conv_matches_sales_labels(c)]
    excluded_non_sales_count = len(deduped_convs) - len(all_convs)

    today_counts = database.get_all_agents_today_chats_counts()
    pulled_counts = database.get_all_agents_pulled_counts_today()
    for aid_key, ag_obj in agents_map.items():
        agents_map[aid_key] = database.check_and_reset_agent_window(ag_obj, window_minutes=window_minutes)

    now_ts = int(time.time())

    # Pre-identify non-exempt waiting conversations that need exact assignment timestamp verification from /messages
    waiting_candidates = []
    for conv in all_convs:
        ws = int(conv.get("waiting_since") or 0)
        if ws <= 0:
            continue
        is_ex, _ = _is_chat_delay_exempt(conv)
        if is_ex:
            continue

        cid_str = str(conv.get("id"))
        assignee = (conv.get("meta", {}) or {}).get("assignee", {}) or {}
        aid = str(assignee.get("id", ""))
        ag_db = agents_map.get(aid, {})
        ag_name = ag_db.get("name") or assignee.get("name") or ""
        avail_name = assignee.get("available_name") or ""
        team_name = ((conv.get("meta", {}) or {}).get("team") or {}).get("name") or ""
        act_ts = int(conv.get("last_activity_at") or 0)

        # Check inline messages first
        inline_assign_ts, inline_handled = _extract_agent_assign_Info(
            conv.get("messages") or [], ag_name, avail_name, team_name
        )
        if inline_assign_ts > 0:
            with _chat_tracker_lock:
                prev_c = _chat_assignment_cache.get((cid_str, aid), {})
                if inline_assign_ts >= prev_c.get("assign_ts", 0):
                    _chat_assignment_cache[(cid_str, aid)] = {
                        "assign_ts": inline_assign_ts,
                        "agent_handled": inline_handled,
                        "act_ts": act_ts
                    }

        with _chat_tracker_lock:
            cached_info = _chat_assignment_cache.get((cid_str, aid))

        # Fetch /conversations/{cid}/messages if not cached for current activity timestamp
        if not cached_info or cached_info.get("act_ts") != act_ts:
            waiting_candidates.append((cid_str, aid, ag_name, avail_name, team_name, act_ts))

    def _inspect_conv_messages(item):
        c_str, a_id, a_name, av_name, tm_name, a_ts = item
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{c_str}/messages"
        try:
            r = session.get(url, timeout=10)
            if r.status_code == 200:
                msgs_payload = r.json().get("payload", [])
                assign_ts, handled = _extract_agent_assign_Info(msgs_payload, a_name, av_name, tm_name)
                with _chat_tracker_lock:
                    prev_assign = (_chat_assignment_cache.get((c_str, a_id)) or {}).get("assign_ts", 0)
                    _chat_assignment_cache[(c_str, a_id)] = {
                        "assign_ts": max(assign_ts, prev_assign),
                        "agent_handled": handled,
                        "act_ts": a_ts
                    }
        except Exception as e:
            logger.debug(f"Could not fetch messages for waiting conv {c_str}: {e}")

    if waiting_candidates:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(waiting_candidates), 16)) as executor:
            list(executor.map(_inspect_conv_messages, waiting_candidates))

    dur = time.time() - t0
    now_ts = int(time.time())

    pending_chats = []
    agent_stats = {}
    total_exempt_chats = 0

    for conv in all_convs:
        cid = conv.get("id")
        cid_str = str(cid)
        assignee = (conv.get("meta", {}) or {}).get("assignee", {}) or {}
        aid = str(assignee.get("id", ""))
        ag_db = agents_map.get(aid, {})

        ag_name = ag_db.get("name") or assignee.get("name") or "غير محدد"
        crm_name = ag_db.get("crm_name") or mapping_dict.get(aid) or ""
        is_mapped_sales = bool(crm_name and str(crm_name).strip())
        team = ag_db.get("team") or ("Sales" if is_mapped_sales else "CS")
        in_shift = _agent_in_shift_hours(ag_db) if ag_db else False
        in_grace = (_agent_in_grace_period(ag_db) and in_shift) if ag_db else False

        if aid not in agent_stats:
            agent_stats[aid] = {
                "agent_id": aid,
                "agent_name": ag_name,
                "crm_name": crm_name,
                "is_mapped_sales": is_mapped_sales,
                "team": team,
                "open_chats_count": 0,
                "current_window_chats": int(ag_db.get("current_window_chats") or 0),
                "chat_limit": int(ag_db.get("chat_limit") or 10),
                "today_chats_count": int(today_counts.get(aid, 0)),
                "daily_chat_limit": int(ag_db.get("daily_chat_limit") or 100),
                "pulled_today_count": int(pulled_counts.get(aid, 0)),
                "pending_count": 0,
                "critical_count": 0,
                "warning_count": 0,
                "normal_count": 0,
                "exempt_count": 0,
                "fast_5m_count": 0,
                "within_15m_count": 0,
                "delay_15_30_count": 0,
                "delay_30_45_count": 0,
                "delay_over_45_count": 0,
                "speed_score": 0,
                "max_delay_minutes": 0,
                "max_delay_text": "لا يوجد",
                "in_shift": in_shift,
                "in_grace_period": in_grace
            }

        agent_stats[aid]["open_chats_count"] += 1

        waiting_since = int(conv.get("waiting_since") or 0)
        is_exempt, exempt_reason = (False, "")
        if waiting_since > 0:
            is_exempt, exempt_reason = _is_chat_delay_exempt(conv)

        with _chat_tracker_lock:
            cached_info = _chat_assignment_cache.get((cid_str, aid)) or {}

        if not is_exempt and cached_info.get("agent_handled"):
            is_exempt = True
            exempt_reason = "agent_handled"

        if waiting_since > 0 and not is_exempt:
            # Determine exact timestamp when this chat was assigned to this agent
            agent_assigned_ts = max(
                assigned_ts_map.get((cid_str, aid), 0),
                assigned_ts_by_cid.get(cid_str, 0),
                int(cached_info.get("assign_ts") or 0)
            )
            # Effective waiting start is NEVER before the chat was assigned to this agent
            effective_waiting_since = max(waiting_since, agent_assigned_ts)

            cache_key = f"{cid_str}_{aid}"
            with _chat_tracker_lock:
                _chat_wait_tracker[cache_key] = effective_waiting_since
                _chat_wait_tracker[cid_str] = effective_waiting_since
                _chat_fast_reply_cache.pop(cache_key, None)
                _chat_fast_reply_cache.pop(cid_str, None)

            delay_sec = max(0, now_ts - effective_waiting_since)
            delay_min = round(delay_sec / 60.0, 1)

            # New Scoring System:
            # - 0 to 5 min (Fast Tier): +7 points (when replied)
            # - 6 to 15 min (Acceptable Tier): +5 points
            # - > 15 min (Late / Pull Tier): 0 points (and pulled if label is selected)
            if delay_min >= 45.0:
                severity = "critical"
                agent_stats[aid]["critical_count"] += 1
                agent_stats[aid]["delay_over_45_count"] += 1
                chat_points = 0
            elif delay_min >= 30.0:
                severity = "critical"
                agent_stats[aid]["critical_count"] += 1
                agent_stats[aid]["delay_30_45_count"] += 1
                chat_points = 0
            elif delay_min >= 15.0:
                severity = "critical"
                agent_stats[aid]["critical_count"] += 1
                agent_stats[aid]["delay_15_30_count"] += 1
                chat_points = 0
            elif delay_min >= 5.0:
                severity = "warning"
                agent_stats[aid]["warning_count"] += 1
                agent_stats[aid]["within_15m_count"] += 1
                agent_stats[aid]["speed_score"] += 5
                chat_points = 5
            else:
                severity = "normal"
                agent_stats[aid]["normal_count"] += 1
                agent_stats[aid]["within_15m_count"] += 1
                agent_stats[aid]["speed_score"] += 5
                chat_points = 5

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

            reassigned_info = _smart_reassigned_map.get(cid_str)

            pending_chats.append({
                "conv_id": cid,
                "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}",
                "waiting_since": effective_waiting_since,
                "raw_waiting_since": waiting_since,
                "assigned_at_ts": agent_assigned_ts,
                "waiting_since_text": wait_text,
                "delay_minutes": delay_min,
                "severity": severity,
                "points_impact": chat_points,
                "agent_id": aid,
                "agent_name": ag_name,
                "crm_name": crm_name,
                "is_mapped_sales": is_mapped_sales,
                "team": team,
                "in_shift": in_shift,
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "last_message": last_msg[:140] if last_msg else "—",
                "labels": conv.get("labels", []),
                "reassigned_from": reassigned_info
            })
        else:
            # Conversation is either answered (waiting_since == 0) OR exempt (private note, 'تمام/شكرا', like/sticker)
            if is_exempt:
                agent_stats[aid]["exempt_count"] += 1
                total_exempt_chats += 1

            # Only award positive points for conversations active today (or in last 16h) so old stale open chats don't inflate score
            last_act_ts = int(conv.get("last_activity_at") or conv.get("updated_at") or 0)
            is_active_today = (last_act_ts >= today_start_ts) or ((now_ts - last_act_ts) <= 16 * 3600)

            if is_active_today:
                is_fast_5m = _check_if_fast_reply_5m(conv, cid_str, aid, assigned_ts_map, assigned_ts_by_cid, now_ts)
                if is_fast_5m:
                    agent_stats[aid]["fast_5m_count"] += 1
                    agent_stats[aid]["speed_score"] += 7
                else:
                    agent_stats[aid]["within_15m_count"] += 1
                    agent_stats[aid]["speed_score"] += 5

    # Sync open_chats_count display with official Chatwoot open_counts if full scan was performed (num_pages == 0)
    if not num_pages or num_pages <= 0:
        try:
            official_open = fetch_agent_report_counts()
            for aid, ag_st in agent_stats.items():
                off_cnt = int(official_open.get(aid) or 0)
                if off_cnt > ag_st["open_chats_count"]:
                    ag_st["open_chats_count"] = off_cnt
        except Exception:
            pass

    # Sort pending chats by delay descending (longest delay first)
    pending_chats.sort(key=lambda x: x["delay_minutes"], reverse=True)

    # Sort agents summary by speed_score descending (highest score first), then least window chats
    agents_list = list(agent_stats.values())
    agents_list.sort(key=lambda a: (a["speed_score"], -a.get("current_window_chats", 0), -a["critical_count"]), reverse=True)

    critical_total = sum(1 for c in pending_chats if c["severity"] == "critical")
    warning_total = sum(1 for c in pending_chats if c["severity"] == "warning")
    normal_total = sum(1 for c in pending_chats if c["severity"] == "normal")

    most_delayed = "لا يوجد"
    delayed_sorted = sorted(agents_list, key=lambda a: (a["critical_count"], a["pending_count"], a["max_delay_minutes"]), reverse=True)
    if delayed_sorted and delayed_sorted[0]["pending_count"] > 0:
        top_ag = delayed_sorted[0]
        most_delayed = f"{top_ag['agent_name']} ({top_ag['pending_count']} معلقة)"

    top_scored_agent = "لا يوجد"
    sales_agents_list = [a for a in agents_list if a.get("is_mapped_sales") or a.get("team") == "Sales"]
    candidate_pool = sales_agents_list if sales_agents_list else agents_list
    if candidate_pool:
        best_ag = max(candidate_pool, key=lambda a: a["speed_score"])
        top_scored_agent = f"{best_ag['agent_name']} ({best_ag['speed_score']} نقطة)"

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
            "excluded_non_sales_chats": excluded_non_sales_count,
            "total_pending_chats": len(pending_chats),
            "total_exempt_chats": total_exempt_chats,
            "critical_count": critical_total,
            "warning_count": warning_total,
            "normal_count": normal_total,
            "longest_delay_minutes": pending_chats[0]["delay_minutes"] if pending_chats else 0,
            "longest_delay_formatted": longest_delay_formatted,
            "most_delayed_agent": most_delayed,
            "top_scored_agent": top_scored_agent,
            "fetch_duration_seconds": round(dur, 2),
            "timestamp": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p")
        },
        "pending_chats": pending_chats,
        "agents_summary": agents_list
    }

@app.route('/api/reports/delays', methods=['GET'])
def api_reports_delays():
    refresh = request.args.get('refresh', 'false').lower() in ['true', '1', 'yes']
    pages = request.args.get('pages', 0)
    try:
        pages = int(pages)
    except (ValueError, TypeError):
        pages = 0

    now = time.time()
    report_data = None
    with delays_cache_lock:
        if not refresh and delays_cache.get("data") is not None:
            if delays_cache.get("pages") == pages and (now - delays_cache.get("cached_at", 0) < 25):  # 25 seconds TTL
                report_data = dict(delays_cache["data"])

    if report_data is None:
        report_data = _build_delays_report(num_pages=pages)
        with delays_cache_lock:
            delays_cache["data"] = report_data
            delays_cache["cached_at"] = now
            delays_cache["pages"] = pages
        report_data = dict(report_data)

    # Always attach fresh smart_reassign config, configured_sales_labels, and recent transfer history
    report_data["smart_reassign_config"] = _get_smart_reassign_config()
    try:
        settings = database.get_settings()
        report_data["configured_sales_labels"] = json.loads(settings.get("valid_labels_order", "[]"))
    except Exception:
        report_data["configured_sales_labels"] = []
    report_data["smart_reassign_history"] = _smart_reassign_history[:25]

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


# ── Smart Delayed Chats Reassignment Engine (الأعلى سكور + سقف الـ 30 دقيقة واليوم + فحص لحظي قبل السحب) ──

_smart_reassign_lock = threading.Lock()
_smart_reassign_history = []   # Recent transfers log
_smart_reassigned_map = {}     # conv_id_str -> { from_agent_name, to_agent_name, timestamp }


def _get_smart_reassign_config():
    settings = database.get_settings()
    raw_labels = settings.get("smart_reassign_labels")
    if raw_labels is not None:
        try:
            labels = json.loads(raw_labels)
            if not isinstance(labels, list):
                labels = []
        except Exception:
            labels = []
    else:
        # Default to configured valid sales labels
        try:
            labels = json.loads(settings.get("valid_labels_order", "[]"))
        except Exception:
            labels = []

    try:
        min_delay = float(settings.get("smart_reassign_min_delay", 15))
    except (ValueError, TypeError):
        min_delay = 15.0

    try:
        max_open = int(settings.get("smart_reassign_max_open_chats", 45))
    except (ValueError, TypeError):
        max_open = 45

    match_label = str(settings.get("smart_reassign_match_agent_label", "true")).lower() in ["true", "1", "yes"]
    auto_enabled = str(settings.get("smart_reassign_auto_enabled", "false")).lower() in ["true", "1", "yes"]

    return {
        "labels": labels,
        "min_delay_minutes": min_delay,
        "max_open_chats": max_open,
        "match_agent_label": match_label,
        "auto_enabled": auto_enabled
    }


def _agent_matches_chat_label(ag, matched_label, all_chat_labels=None):
    """
    Strictly checks if an agent belongs to the same label classification (`assigned_labels`)
    as the pulled chat's Sales label(s).
    """
    if not matched_label and not all_chat_labels:
        return False
    assigned = ag.get("assigned_labels")
    if assigned and isinstance(assigned, str):
        try:
            assigned = json.loads(assigned)
        except Exception:
            assigned = []
    elif not assigned:
        assigned = []

    if not assigned:
        # Strict: Agent must have explicit assigned_labels configured to receive pulled chats
        return False

    assigned_lower = [str(l).strip().lower() for l in assigned if str(l).strip()]
    if not assigned_lower:
        return False

    matched_clean = str(matched_label or "").strip().lower()
    is_unlabeled_chat = ("بدون ليبل" in matched_clean or "unlabeled" in matched_clean or "no_label" in matched_clean)

    if is_unlabeled_chat:
        return any("بدون ليبل" in x or "unlabeled" in x or "بدون تصنيف" in x or "no_label" in x for x in assigned_lower)

    # Check primary matched Sales label
    for x in assigned_lower:
        if x == matched_clean or matched_clean in x or x in matched_clean:
            return True

    # If the chat has multiple Sales labels, check if any of its Sales labels match the agent's classification
    if all_chat_labels:
        for cl in all_chat_labels:
            cl_clean = str(cl or "").strip().lower()
            if not cl_clean:
                continue
            for x in assigned_lower:
                if x == cl_clean or cl_clean in x or x in cl_clean:
                    return True

    return False


def _chat_matches_pullable_labels(chat_labels, pullable_labels):
    """
    Returns (is_match: bool, matched_label_str: str)
    Checks if a delayed chat's labels match the supervisor's selected pullable Sales labels.
    """
    if not pullable_labels:
        return False, ""
    pullable_set = {str(l).strip().lower() for l in pullable_labels if str(l).strip()}
    if not pullable_set:
        return False, ""

    c_labels = [str(l).strip() for l in (chat_labels or []) if str(l).strip()]
    if not c_labels:
        if any(u in pullable_set for u in ("unlabeled", "no_label", "بدون ليبل", "بدون ليبل (unlabeled)")):
            return True, "بدون ليبل (Unlabeled)"
        return False, ""

    for lbl in c_labels:
        if lbl.lower() in pullable_set:
            return True, lbl
    return False, ""


def _verify_chat_still_delayed_live(session, base_url, account_id, cid_str, expected_aid, expected_aname, min_delay_minutes):
    """
    Performs an instant live pre-pull check against Chatwoot API right before pulling a conversation
    to guarantee the agent has NOT replied, written a Private Note, or resolved the chat in the meantime.
    Returns: (is_still_delayed: bool, reason_if_not: str)
    """
    try:
        conv_url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid_str}"
        r_conv = session.get(conv_url, timeout=8)
        if r_conv.status_code != 200:
            return True, ""  # Proceed if endpoint hiccuped transiently
        live_conv = r_conv.json()
        if str(live_conv.get("status") or "").lower() != "open":
            return False, "الشات تم إغلاقه (Resolved/Pending) قبل السحب"

        live_assignee = ((live_conv.get("meta") or {}).get("assignee") or {})
        live_aid = str(live_assignee.get("id") or "")
        if expected_aid and live_aid and live_aid != str(expected_aid):
            return False, "الشات تم نقله لموظف آخر بالفعل"

        live_ws = int(live_conv.get("waiting_since") or 0)
        if live_ws <= 0:
            return False, "قام الموظف بالرد على الشات قبل السحب مباشرة ✅"

        is_ex, _ = _is_chat_delay_exempt(live_conv)
        if is_ex:
            return False, "الشات أصبح معفياً (رسالة إغلاق/شكر أو ملاحظة خاصة) ✅"

        # Also inspect live /messages to ensure no fresh Private Note or agent reply was just posted
        msgs_url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid_str}/messages"
        r_msgs = session.get(msgs_url, timeout=8)
        if r_msgs.status_code == 200:
            msgs_payload = r_msgs.json().get("payload", [])
            avail_name = live_assignee.get("available_name") or ""
            team_name = ((live_conv.get("meta") or {}).get("team") or {}).get("name") or ""
            assign_ts, handled = _extract_agent_assign_Info(msgs_payload, expected_aname, avail_name, team_name)
            if handled:
                return False, "قام الموظف بالرد أو كتابة Private Note قبل السحب مباشرة ✅"
            if assign_ts > 0:
                eff_ws = max(live_ws, assign_ts)
                live_delay_min = (time.time() - eff_ws) / 60.0
                if live_delay_min < float(min_delay_minutes):
                    return False, f"مدة التأخير الفعلية منذ التوزيع ({round(live_delay_min, 1)} د) أقل من الحد المطلوب"
    except Exception as e:
        logger.warning(f"⚠️ Live pre-pull check warning for conv #{cid_str}: {e}")
    return True, ""


def _execute_smart_reassign(target_conv_id=None, override_config=None):
    """
    Pulls delayed Sales conversations (> min_delay_minutes, matching selected pullable Sales labels)
    after a live pre-pull verification check, and routes each to the #1 highest-scored in-shift agent
    WHO HAS THE SAME LABEL CLASSIFICATION (`assigned_labels`) and whose 30-minute rolling window
    (current_window_chats < chat_limit) and daily limit (today_count < daily_limit) have available capacity.
    """
    if not _smart_reassign_lock.acquire(blocking=False):
        return {"success": False, "error": "عملية سحب وتوزيع أخرى قيد التنفيذ حالياً، يرجى الانتظار ثواني."}

    try:
        cfg = _get_smart_reassign_config()
        if override_config and isinstance(override_config, dict):
            if "labels" in override_config and isinstance(override_config["labels"], list):
                cfg["labels"] = override_config["labels"]
            if "min_delay_minutes" in override_config:
                try:
                    cfg["min_delay_minutes"] = float(override_config["min_delay_minutes"])
                except Exception:
                    pass
            if "match_agent_label" in override_config:
                cfg["match_agent_label"] = bool(override_config["match_agent_label"])
        # Always enforce same label classification as a mandatory rule
        cfg["match_agent_label"] = True

        # Always run a fresh or recently cached report scan
        now = time.time()
        with delays_cache_lock:
            cached_rep = delays_cache.get("data")
            cached_at = delays_cache.get("cached_at", 0)

        if cached_rep and (now - cached_at < 15):
            report_data = cached_rep
        else:
            report_data = _build_delays_report(num_pages=0)
            with delays_cache_lock:
                delays_cache["data"] = report_data
                delays_cache["cached_at"] = time.time()
                delays_cache["pages"] = 0

        pending_chats = report_data.get("pending_chats", [])
        agents_summary_map = {str(a["agent_id"]): dict(a) for a in report_data.get("agents_summary", [])}
        configured_sales_labels = [str(l).strip().lower() for l in (report_data.get("configured_sales_labels") or []) if str(l).strip()]

        # Filter target chats to reassign
        chats_to_reassign = []
        if target_conv_id is not None:
            t_str = str(target_conv_id)
            for ch in pending_chats:
                if str(ch.get("conv_id")) == t_str:
                    c_lbls = [str(l).strip() for l in (ch.get("labels") or []) if str(l).strip()]
                    m_lbl = ""
                    # Pick the primary Sales label according to configured priority order
                    for sl in configured_sales_labels:
                        for cl in c_lbls:
                            if cl.lower() == sl:
                                m_lbl = cl
                                break
                        if m_lbl:
                            break
                    if not m_lbl:
                        m_lbl = c_lbls[0] if c_lbls else "بدون ليبل (Unlabeled)"
                    chats_to_reassign.append((ch, m_lbl))
                    break
            if not chats_to_reassign:
                return {"success": False, "error": f"المحادثة #{target_conv_id} لم تعد متأخرة أو تم الرد عليها بالفعل."}
        else:
            if not cfg["labels"]:
                return {"success": False, "error": "يرجى تحديد ليبل سيلز واحد على الأقل من قائمة الليبلات المسموح بسحبها."}
            for ch in pending_chats:
                if float(ch.get("delay_minutes") or 0) < cfg["min_delay_minutes"]:
                    continue
                ok_lbl, m_lbl = _chat_matches_pullable_labels(ch.get("labels"), cfg["labels"])
                if not ok_lbl:
                    continue
                chats_to_reassign.append((ch, m_lbl))

        if not chats_to_reassign:
            return {
                "success": True,
                "reassigned_count": 0,
                "transfers": [],
                "message": "لا توجد محادثات متأخرة مطابقة لليبلات السيلز ووقت التأخير المحددين حالياً."
            }

        # Build live pool of all DB agents + rolling 30-min window + daily limit + live speed_score
        settings = database.get_settings()
        window_minutes = int(settings.get("window_minutes", 30))
        today_counts = database.get_all_agents_today_chats_counts()
        all_db_agents = database.get_all_agents()

        candidate_agents = []
        for ag in all_db_agents:
            aid_str = str(ag["id"])
            if ag.get("team") not in ["Sales", "Data"]:
                continue
            if not ag.get("is_selected", 1):
                continue
            if ag.get("is_paused", 0):
                continue

            # Update rolling 30-minute window count
            ag = database.check_and_reset_agent_window(ag, window_minutes=window_minutes)
            if not _agent_has_valid_shift(ag):
                continue

            daily_lim = int(ag.get("daily_chat_limit") or 100)
            today_cnt = int(today_counts.get(aid_str, 0))
            if today_cnt >= daily_lim:
                continue

            rep_st = agents_summary_map.get(aid_str, {})
            speed_sc = int(rep_st.get("speed_score") if rep_st.get("speed_score") is not None else 0)
            open_cnt = int(rep_st.get("open_chats_count") or ag.get("active_chats") or 0)

            ag_copy = dict(ag)
            ag_copy["live_speed_score"] = speed_sc
            ag_copy["live_open_chats"] = open_cnt
            ag_copy["live_today_count"] = today_cnt
            ag_copy["daily_limit"] = daily_lim
            ag_copy["window_limit"] = int(ag.get("chat_limit") or 10)
            ag_copy["current_window_chats"] = int(ag.get("current_window_chats") or 0)
            candidate_agents.append(ag_copy)

        if not candidate_agents:
            return {
                "success": False,
                "error": "لا يوجد موظفو سيلز متاحون داخل الشيفت حالياً لاستلام المحادثات."
            }

        base_url, _, account_id = get_cw_config()
        session = requests.Session()
        session.headers.update(_cw_headers())

        transfers = []
        skipped = []
        now_ts = int(time.time())
        now_str = datetime.now(CAIRO_TZ).strftime("%I:%M:%S %p")

        # Sort chats to reassign by longest delay first (High Priority queue)
        chats_to_reassign.sort(key=lambda x: float(x[0].get("delay_minutes") or 0), reverse=True)

        for ch, matched_label in chats_to_reassign:
            cid = str(ch.get("conv_id"))
            old_aid = str(ch.get("agent_id") or "")
            old_aname = ch.get("agent_name") or "غير محدد"
            delay_min = ch.get("delay_minutes") or 0
            chat_sales_labels = [
                str(l).strip() for l in (ch.get("labels") or [])
                if str(l).strip().lower() in configured_sales_labels
            ]

            # 1. LIVE PRE-PULL VERIFICATION: Confirm the agent hasn't replied or written a Private Note right before pulling
            still_delayed, skip_reason = _verify_chat_still_delayed_live(
                session, base_url, account_id, cid, old_aid, old_aname, cfg["min_delay_minutes"]
            )
            if not still_delayed:
                skipped.append({
                    "conv_id": cid,
                    "label": matched_label,
                    "reason": skip_reason
                })
                logger.info(f"⏭️ Skipped pulling conv #{cid}: {skip_reason}")
                continue

            # 2. Filter eligible receivers STRICTLY by:
            #    - Not the same agent (c_id != old_aid)
            #    - 30-Minute Rolling Window: current_window_chats < window_limit (whether 20, 10, or 5)
            #    - Full Day Limit: live_today_count < daily_limit
            #    - MANDATORY Same Label Classification: _agent_matches_chat_label(cand, matched_label, chat_sales_labels)
            eligible_pool = []
            for cand in candidate_agents:
                c_id = str(cand["id"])
                if c_id == old_aid:
                    continue
                if cand["current_window_chats"] >= cand["window_limit"]:
                    continue
                if cand["live_today_count"] >= cand["daily_limit"]:
                    continue
                if not _agent_matches_chat_label(cand, matched_label, chat_sales_labels):
                    continue
                eligible_pool.append(cand)

            if not eligible_pool:
                skipped.append({
                    "conv_id": cid,
                    "label": matched_label,
                    "reason": f"لا يوجد موظف متاح حالياً من نفس تصنيف الليبل ({matched_label}) لم يستنفد سقف الـ 30 دقيقة أو سقف اليوم"
                })
                continue

            # 3. Rank eligible receivers:
            #    #1 Highest speed_score first
            #    Tie-breaker: Least chats in current 30-minute window, then least chats today
            eligible_pool.sort(
                key=lambda cand: (
                    cand["live_speed_score"],
                    -cand["current_window_chats"],
                    -cand["live_today_count"]
                ),
                reverse=True
            )
            best_receiver = eligible_pool[0]
            new_aid = str(best_receiver["id"])
            new_aname = best_receiver.get("name") or f"Agent #{new_aid}"

            # 4. Assign in Chatwoot directly to the new agent
            if assign_conversation_in_chatwoot(cid, new_aid):
                database.mark_chats_as_pulled([cid])
                if old_aid:
                    database.decrement_agent_window_chats(old_aid, 1)
                database.increment_agent_window_chats(new_aid)
                database.log_routed_chat(
                    conv_id=cid,
                    agent_id=new_aid,
                    agent_name=new_aname,
                    label=matched_label,
                    sender_phone=ch.get("customer_phone", ""),
                    sender_name=ch.get("customer_name", ""),
                    last_message=ch.get("last_message", "")
                )

                # Reset assignment timer for the new agent so their 15m window starts fresh from 0 right now!
                with _chat_tracker_lock:
                    _chat_assignment_cache[(cid, new_aid)] = {
                        "assign_ts": now_ts,
                        "agent_handled": False,
                        "act_ts": now_ts
                    }
                    _chat_wait_tracker[f"{cid}_{new_aid}"] = now_ts
                    _chat_wait_tracker[cid] = now_ts

                with assigned_lock:
                    recently_assigned_convs[cid] = time.time()

                # Update live counts in memory so the next chat in this batch respects 30m & daily limits
                best_receiver["current_window_chats"] += 1
                best_receiver["live_today_count"] += 1
                best_receiver["live_open_chats"] += 1

                transfer_item = {
                    "conv_id": cid,
                    "label": matched_label,
                    "customer_name": ch.get("customer_name") or "",
                    "delay_minutes": delay_min,
                    "from_agent_id": old_aid,
                    "from_agent_name": old_aname,
                    "to_agent_id": new_aid,
                    "to_agent_name": new_aname,
                    "to_agent_score": best_receiver["live_speed_score"],
                    "to_agent_window_chats": f"{best_receiver['current_window_chats']}/{best_receiver['window_limit']}",
                    "to_agent_open_chats": best_receiver["live_open_chats"],
                    "timestamp": now_str
                }
                _smart_reassigned_map[cid] = {
                    "from_agent_name": old_aname,
                    "to_agent_name": new_aname,
                    "timestamp": now_str
                }
                transfers.append(transfer_item)
                _smart_reassign_history.insert(0, transfer_item)
                if len(_smart_reassign_history) > 100:
                    del _smart_reassign_history[100:]

                logger.info(
                    f"⚡ Smart Reassigned delayed conv #{cid} ({matched_label}, {delay_min}m delay) "
                    f"from {old_aname} -> {new_aname} (score: {best_receiver['live_speed_score']}, "
                    f"30m window: {best_receiver['current_window_chats']}/{best_receiver['window_limit']})"
                )
                time.sleep(0.06)
            else:
                skipped.append({
                    "conv_id": cid,
                    "label": matched_label,
                    "reason": "فشل الاتصال بـ Chatwoot أثناء التحويل"
                })

        # Invalidate delays cache so UI reflects updated assignments immediately
        if transfers:
            with delays_cache_lock:
                delays_cache["data"] = None
                delays_cache["cached_at"] = 0

        return {
            "success": True,
            "reassigned_count": len(transfers),
            "skipped_count": len(skipped),
            "transfers": transfers,
            "skipped": skipped,
            "history": _smart_reassign_history[:25],
            "message": (
                f"تم فحص الشاتات لحظياً وسحب وتحويل {len(transfers)} محادثة متأخرة للأعلى سكور ضمن سقف الـ 30 دقيقة."
                if transfers else (
                    f"لم يتم سحب أي شات ({skipped[0]['reason']})" if skipped else "لا توجد شاتات متأخرة مطابقة للسحب."
                )
            )
        }
    finally:
        _smart_reassign_lock.release()


@app.route('/api/reports/smart-reassign/config', methods=['GET', 'POST'])
def api_smart_reassign_config():
    if request.method == 'POST':
        body = request.get_json(silent=True) or {}
        if "labels" in body and isinstance(body["labels"], list):
            database.set_setting("smart_reassign_labels", json.dumps(body["labels"], ensure_ascii=False))
        if "min_delay_minutes" in body:
            database.set_setting("smart_reassign_min_delay", str(body["min_delay_minutes"]))
        if "max_open_chats" in body:
            database.set_setting("smart_reassign_max_open_chats", str(body["max_open_chats"]))
        if "match_agent_label" in body:
            database.set_setting("smart_reassign_match_agent_label", "true" if body["match_agent_label"] else "false")
        if "auto_enabled" in body:
            is_on = bool(body["auto_enabled"])
            database.set_setting("smart_reassign_auto_enabled", "true" if is_on else "false")
            if is_on:
                routing_wake_event.set()

    cfg = _get_smart_reassign_config()
    settings = database.get_settings()
    try:
        configured_sales_labels = json.loads(settings.get("valid_labels_order", "[]"))
    except Exception:
        configured_sales_labels = []

    return jsonify({
        "success": True,
        "config": cfg,
        "configured_sales_labels": configured_sales_labels,
        "history": _smart_reassign_history[:25]
    })


@app.route('/api/reports/smart-reassign/execute', methods=['POST'])
def api_smart_reassign_execute():
    body = request.get_json(silent=True) or {}
    conv_id = body.get("conv_id")
    override_cfg = body.get("config") if isinstance(body.get("config"), dict) else body
    # Save config if provided
    if isinstance(override_cfg, dict):
        if "labels" in override_cfg and isinstance(override_cfg["labels"], list):
            database.set_setting("smart_reassign_labels", json.dumps(override_cfg["labels"], ensure_ascii=False))
        if "min_delay_minutes" in override_cfg:
            database.set_setting("smart_reassign_min_delay", str(override_cfg["min_delay_minutes"]))
        if "max_open_chats" in override_cfg:
            database.set_setting("smart_reassign_max_open_chats", str(override_cfg["max_open_chats"]))
        if "match_agent_label" in override_cfg:
            database.set_setting("smart_reassign_match_agent_label", "true" if override_cfg["match_agent_label"] else "false")
        if "auto_enabled" in override_cfg:
            database.set_setting("smart_reassign_auto_enabled", "true" if override_cfg["auto_enabled"] else "false")

    res = _execute_smart_reassign(target_conv_id=conv_id, override_config=override_cfg)
    status_code = 200 if res.get("success") else 400
    return jsonify(res), status_code

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

_cw_labels_cache = {"labels": [], "timestamp": 0}
_cw_labels_lock = threading.Lock()

@app.route('/api/labels', methods=['GET', 'POST'])
def api_labels():
    if request.method == 'POST':
        data = request.json or {}
        labels = data.get("labels", [])
        if not isinstance(labels, list):
            return jsonify({"success": False, "error": "Labels must be a list"}), 400
        database.set_setting("valid_labels_order", json.dumps(labels))
        with _cw_labels_lock:
            _cw_labels_cache["timestamp"] = 0  # Invalidate on save
        return jsonify({"success": True, "message": "تم حفظ تصنيفات السيلز بنجاح", "labels": labels})
    else:
        # Check cache (valid for 5 minutes / 300 seconds)
        force_refresh = request.args.get("refresh") == "true"
        now = time.time()
        cw_labels = []

        with _cw_labels_lock:
            if not force_refresh and _cw_labels_cache["labels"] and (now - _cw_labels_cache["timestamp"] < 300):
                cw_labels = _cw_labels_cache["labels"]

        if not cw_labels:
            # Fetch available labels from Chatwoot API
            base_url, token, account_id = get_cw_config()
            url = f"{base_url}/api/v1/accounts/{account_id}/labels"
            try:
                res = requests.get(url, headers=_cw_headers(), timeout=12)
                if res.status_code == 200:
                    raw_data = res.json()
                    items = raw_data.get("payload", []) if isinstance(raw_data, dict) else raw_data
                    fetched = []
                    for item in items:
                        if isinstance(item, dict) and item.get("title"):
                            fetched.append({
                                "id": item.get("id"),
                                "title": item.get("title"),
                                "description": item.get("description", ""),
                                "color": item.get("color", "#3b82f6")
                            })
                    if fetched:
                        cw_labels = fetched
                        with _cw_labels_lock:
                            _cw_labels_cache["labels"] = cw_labels
                            _cw_labels_cache["timestamp"] = now
            except Exception as e:
                logger.warning(f"⚠️ Error fetching Chatwoot labels (using cached if available): {e}")
                with _cw_labels_lock:
                    if _cw_labels_cache["labels"]:
                        cw_labels = _cw_labels_cache["labels"]

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

# ── Bulk Auto Resolver Engine ─────────────────────────────────────────────

def _fetch_conversations_for_resolver(target_status="pending", max_pages=20, sort_order="asc"):
    """
    Fetches conversations across pages for the resolver engine.
    target_status can be 'pending', 'open', or 'both'.
    sort_order: 'asc' (oldest first, recommended to find stale chats) or 'desc' (newest first).
    """
    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()

    statuses = ["pending"] if target_status == "pending" else (["open"] if target_status == "open" else ["pending", "open"])
    all_convs = []

    sort_param = "last_activity_at_asc" if sort_order == "asc" else "last_activity_at_desc"

    def _fetch_page(st, page_num):
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations"
        params = {"status": st, "page": page_num, "sort_by": sort_param}
        try:
            r = requests.get(url, params=params, headers=headers, timeout=12)
            if r.status_code == 200:
                data = r.json()
                return data.get("data", {}).get("payload", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        except Exception as e:
            logger.warning(f"⚠️ Error fetching resolver page {page_num} ({st}): {e}")
        return []

    tasks = []
    for st in statuses:
        for p in range(1, max_pages + 1):
            tasks.append((st, p))

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_fetch_page, st, p) for st, p in tasks]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res:
                all_convs.extend(res)

    # Deduplicate by conversation ID
    seen = set()
    deduped = []
    for c in all_convs:
        cid = str(c.get("id"))
        if cid and cid not in seen:
            seen.add(cid)
            deduped.append(c)

    return deduped

@app.route('/api/auto-resolver/scan', methods=['POST'])
def api_auto_resolver_scan():
    """
    Scans and previews conversations matching status, label, and inactivity criteria.
    """
    body = request.get_json(silent=True) or {}
    target_status = str(body.get("status", "pending")).strip().lower()
    label_mode = str(body.get("label_mode", "all")).strip().lower()
    specific_label = str(body.get("specific_label", "")).strip().lower()
    sort_order = str(body.get("sort_order", "asc")).strip().lower()

    try:
        hours_threshold = float(body.get("hours_threshold", 48))
    except (ValueError, TypeError):
        hours_threshold = 48.0

    try:
        max_pages = int(body.get("max_pages", 20))
        max_pages = max(1, min(max_pages, 160))
    except (ValueError, TypeError):
        max_pages = 20

    raw_convs = _fetch_conversations_for_resolver(target_status=target_status, max_pages=max_pages, sort_order=sort_order)

    now_ts = int(time.time())
    seconds_threshold = hours_threshold * 3600

    matched = []
    base_url, _, account_id = get_cw_config()

    for c in raw_convs:
        cid = str(c.get("id"))
        st = str(c.get("status", "")).lower()

        # Inactivity check: based on last_activity_at or updated_at or created_at
        act_ts = c.get("last_activity_at") or c.get("updated_at") or c.get("created_at") or 0
        if not act_ts:
            continue

        diff_seconds = now_ts - int(act_ts)
        if diff_seconds < seconds_threshold:
            continue

        diff_hours = round(diff_seconds / 3600.0, 1)
        diff_days = round(diff_hours / 24.0, 1)

        # Label check
        labels_raw = c.get("labels", [])
        labels = [str(l).strip().lower() for l in labels_raw] if isinstance(labels_raw, list) else []

        if label_mode == "unlabeled":
            if len(labels) > 0:
                continue
        elif label_mode == "specific":
            if specific_label not in labels:
                continue

        meta = c.get("meta") or {}
        sender = meta.get("sender") or {}
        assignee = meta.get("assignee") or {}
        last_msg = (c.get("last_non_activity_message") or {}).get("content") or ""

        matched.append({
            "id": cid,
            "status": st,
            "labels": labels_raw,
            "inactive_hours": diff_hours,
            "inactive_days": diff_days,
            "last_activity_timestamp": act_ts,
            "sender_name": sender.get("name") or sender.get("identifier") or "Unknown",
            "sender_phone": sender.get("phone_number") or "",
            "assignee_name": assignee.get("name") or "Unassigned",
            "last_message": last_msg[:120],
            "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}"
        })

    matched.sort(key=lambda x: x["inactive_hours"], reverse=True)

    return jsonify({
        "success": True,
        "total_scanned": len(raw_convs),
        "total_matched": len(matched),
        "hours_threshold": hours_threshold,
        "target_status": target_status,
        "label_mode": label_mode,
        "matched_sample": matched[:1500],
        "all_matched_ids": [m["id"] for m in matched]
    })


@app.route('/api/auto-resolver/execute', methods=['POST'])
def api_auto_resolver_execute():
    """
    Executes bulk resolve on specified conversation IDs with connection pooling,
    adaptive concurrency, and automatic retry on transient timeouts.
    """
    body = request.get_json(silent=True) or {}
    conv_ids = body.get("conversation_ids", [])

    if not isinstance(conv_ids, list) or not conv_ids:
        return jsonify({"success": False, "error": "No conversation IDs provided for resolution."}), 400

    base_url, token, account_id = get_cw_config()
    headers = _cw_headers()

    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=8, pool_maxsize=8, max_retries=1)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(headers)

    def _resolve_one(cid):
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}/toggle_status"
        for attempt in range(2):
            try:
                time.sleep(0.08)  # gentle pacing
                r = session.post(url, json={"status": "resolved"}, timeout=(10, 35))
                if r.status_code in [200, 201]:
                    return True
                elif r.status_code == 429:  # rate limit
                    time.sleep(1.5)
            except requests.exceptions.RequestException as e:
                if attempt == 0:
                    time.sleep(1.0)
                    continue
                logger.error(f"❌ Error resolving conversation {cid}: {e}")
        return False

    t0 = time.time()
    success_count = 0
    # Use max_workers=4 to prevent overwhelming Chatwoot Puma workers
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = executor.map(_resolve_one, conv_ids)
        success_count = sum(1 for ok in results if ok)

    duration = round(time.time() - t0, 2)
    failed_count = len(conv_ids) - success_count

    logger.info(f"🧹 Auto Resolver completed: {success_count}/{len(conv_ids)} resolved in {duration}s")

    return jsonify({
        "success": True,
        "resolved_count": success_count,
        "failed_count": failed_count,
        "total_requested": len(conv_ids),
        "duration_seconds": duration,
        "message": f"Successfully resolved {success_count} conversations in {duration} seconds."
    })


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

    if msg_type == 1 or last_non_activity_msg.get('private') is True:
        return 'agent_replied', '✅ تم الرد والإغلاق بنجاح (آخر رسالة من الموظف)', False

    is_ex, ex_reason = _is_chat_delay_exempt({"last_non_activity_message": last_non_activity_msg})
    if is_ex:
        disp = content[:40] if content else "لايك / ملصق 👍"
        return 'natural_closing', f'💬 إغلاق طبيعي (رسالة شكر/تأكيد: "{disp}")', False

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
