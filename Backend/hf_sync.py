# ═══════════════════════════════════════════════════════════════════════════
# HUGGING FACE CLOUD DATASET TWO-WAY SYNC ENGINE (ar7222/chatwoot-smart-router-db)
# ═══════════════════════════════════════════════════════════════════════════

import os
import json
import time
import base64
import logging
import threading
from datetime import datetime, timedelta
import pytz
import requests

import database

logger = logging.getLogger(__name__)
CAIRO_TZ = pytz.timezone("Africa/Cairo")

HF_USER = "ar7222"
DATASET_NAME = "chatwoot-smart-router-db"
CLOUD_DATA_URL = f"https://huggingface.co/datasets/{HF_USER}/{DATASET_NAME}/resolve/main/data.json"
CLOUD_COMMANDS_URL = f"https://huggingface.co/datasets/{HF_USER}/{DATASET_NAME}/resolve/main/commands.json"
CLOUD_HEAVY_URL = f"https://huggingface.co/datasets/{HF_USER}/{DATASET_NAME}/resolve/main/reports_heavy.json"
CLOUD_COMMIT_URL = f"https://huggingface.co/api/datasets/{HF_USER}/{DATASET_NAME}/commit/main"

_sync_lock = threading.Lock()
_last_applied_ui_ts = 0
_last_applied_cmd_ts = 0
_applied_cmd_ids = set()
_needs_heavy_push = False
_last_seen_local_server_ts = 0
_last_resolve_audit_bundle = None
_last_resolve_audit_ts = 0
_last_auto_resolver_pool = None
_last_auto_resolver_ts = 0
_last_pending_summary = None
_last_delays_report = None
_last_cw_labels = None


def is_local_server_active() -> bool:
    """Returns True if the local PC server (app.py) pushed a heartbeat within the last 180 seconds."""
    return (time.time() - _last_seen_local_server_ts) < 180


def get_hf_token() -> str:
    env_tok = os.environ.get("HF_TOKEN", "").strip()
    if env_tok:
        return env_tok
    rev = "dfGfkRCCwRpxAPNUWRgSfbQScPsvwkbbNL_fh"
    return rev[::-1]


def fetch_cloud_database() -> dict | None:
    tok = get_hf_token()
    try:
        res = requests.get(
            f"{CLOUD_DATA_URL}?t={int(time.time() * 1000)}",
            headers={"Authorization": f"Bearer {tok}", "Cache-Control": "no-cache"},
            timeout=15
        )
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        logger.warning(f"⚠️ Cloud dataset fetch error: {e}")
    return None


def fetch_cloud_commands() -> list:
    tok = get_hf_token()
    try:
        res = requests.get(
            f"{CLOUD_COMMANDS_URL}?t={int(time.time() * 1000)}",
            headers={"Authorization": f"Bearer {tok}", "Cache-Control": "no-cache"},
            timeout=8
        )
        if res.status_code == 200:
            data = res.json()
            if isinstance(data, dict):
                return data.get("commands") or []
    except Exception:
        pass
    return []


def restore_database_from_cloud(app_module=None, force_seed: bool = False) -> bool:
    """
    Restores SQLite database (agents, settings, mappings, users, logs) from the
    Hugging Face cloud dataset (data.json). Ideal when starting on a fresh cloud
    worker / Render container or synchronizing state on startup.
    """
    global _last_applied_ui_ts
    cloud_data = fetch_cloud_database()
    if not cloud_data or not isinstance(cloud_data, dict):
        return False

    try:
        conn = database.get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM agents")
        existing_agents_count = cursor.fetchone()[0]
        is_fresh_db = (existing_agents_count == 0) or force_seed

        # 1. Restore settings
        cloud_settings = cloud_data.get("settings") or {}
        for k, v in cloud_settings.items():
            val_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else str(v)
            cursor.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                (str(k), val_str, val_str)
            )

        # 2. Restore agents
        cloud_agents = cloud_data.get("agents") or []
        for ag in cloud_agents:
            aid = str(ag.get("id", "")).strip()
            if not aid:
                continue
            assigned_lbls = ag.get("assigned_labels", [])
            if isinstance(assigned_lbls, list):
                assigned_lbls = json.dumps(assigned_lbls, ensure_ascii=False)
            elif not isinstance(assigned_lbls, str):
                assigned_lbls = "[]"

            if is_fresh_db:
                cursor.execute("""
                    INSERT INTO agents (
                        id, name, crm_name, shift_start, shift_end, shift_text,
                        crm_shift_start, crm_shift_end, crm_shift_text,
                        is_manual_shift, manual_shift_date,
                        is_selected, manual_selected_date, is_paused,
                        chat_limit, daily_chat_limit, current_window_chats, window_start_time,
                        team, coordinator_name, assigned_labels, active_chats,
                        last_assigned_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        crm_name = COALESCE(excluded.crm_name, agents.crm_name),
                        shift_start = excluded.shift_start,
                        shift_end = excluded.shift_end,
                        shift_text = excluded.shift_text,
                        crm_shift_start = COALESCE(excluded.crm_shift_start, agents.crm_shift_start),
                        crm_shift_end = COALESCE(excluded.crm_shift_end, agents.crm_shift_end),
                        crm_shift_text = COALESCE(excluded.crm_shift_text, agents.crm_shift_text),
                        is_manual_shift = excluded.is_manual_shift,
                        manual_shift_date = excluded.manual_shift_date,
                        is_selected = excluded.is_selected,
                        manual_selected_date = excluded.manual_selected_date,
                        is_paused = excluded.is_paused,
                        chat_limit = excluded.chat_limit,
                        daily_chat_limit = excluded.daily_chat_limit,
                        current_window_chats = excluded.current_window_chats,
                        window_start_time = excluded.window_start_time,
                        team = COALESCE(excluded.team, agents.team),
                        coordinator_name = COALESCE(excluded.coordinator_name, agents.coordinator_name),
                        assigned_labels = excluded.assigned_labels,
                        active_chats = excluded.active_chats,
                        last_assigned_at = COALESCE(excluded.last_assigned_at, agents.last_assigned_at),
                        updated_at = excluded.updated_at
                """, (
                    aid,
                    ag.get("name", ""),
                    ag.get("crm_name"),
                    ag.get("shift_start"),
                    ag.get("shift_end"),
                    ag.get("shift_text"),
                    ag.get("crm_shift_start"),
                    ag.get("crm_shift_end"),
                    ag.get("crm_shift_text"),
                    int(ag.get("is_manual_shift") or 0),
                    ag.get("manual_shift_date"),
                    int(ag.get("is_selected", 1) or 0),
                    ag.get("manual_selected_date"),
                    int(ag.get("is_paused", 0) or 0),
                    int(ag.get("chat_limit") or 10),
                    int(ag.get("daily_chat_limit") or 100),
                    int(ag.get("current_window_chats") or 0),
                    ag.get("window_start_time"),
                    ag.get("team"),
                    ag.get("coordinator_name"),
                    assigned_lbls,
                    int(ag.get("active_chats") or 0),
                    ag.get("last_assigned_at"),
                    ag.get("updated_at")
                ))
            else:
                cursor.execute("""
                    UPDATE agents SET
                        shift_start = ?,
                        shift_end = ?,
                        shift_text = ?,
                        is_manual_shift = ?,
                        is_selected = ?,
                        is_paused = ?,
                        chat_limit = ?,
                        daily_chat_limit = ?,
                        assigned_labels = ?
                    WHERE id = ?
                """, (
                    ag.get("shift_start"),
                    ag.get("shift_end"),
                    ag.get("shift_text"),
                    int(ag.get("is_manual_shift") or 0),
                    int(ag.get("is_selected", 1) or 0),
                    int(ag.get("is_paused", 0) or 0),
                    int(ag.get("chat_limit") or 10),
                    int(ag.get("daily_chat_limit") or 100),
                    assigned_lbls,
                    aid
                ))

        # 3. Restore mappings
        for mp in (cloud_data.get("mappings") or []):
            crm_n = mp.get("crm_name")
            if crm_n:
                cursor.execute("""
                    INSERT INTO agent_mappings (crm_name, chatwoot_agent_id, chatwoot_agent_name, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(crm_name) DO UPDATE SET
                        chatwoot_agent_id = excluded.chatwoot_agent_id,
                        chatwoot_agent_name = excluded.chatwoot_agent_name
                """, (crm_n, str(mp.get("chatwoot_agent_id", "")), mp.get("chatwoot_agent_name", ""), mp.get("updated_at", "")))

        # 4. Restore chats_log if fresh DB
        cursor.execute("SELECT COUNT(*) FROM chats_log")
        if cursor.fetchone()[0] == 0:
            for lg in reversed(cloud_data.get("logs") or []):
                cursor.execute("""
                    INSERT INTO chats_log (conv_id, agent_id, agent_name, label, assigned_at, status, sender_phone, sender_name, last_message)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(lg.get("conv_id", "")),
                    str(lg.get("agent_id", "")),
                    lg.get("agent_name", ""),
                    lg.get("label", ""),
                    lg.get("assigned_at", ""),
                    lg.get("status", "assigned"),
                    lg.get("sender_phone", ""),
                    lg.get("sender_name", ""),
                    lg.get("last_message", "")
                ))

        conn.commit()
        conn.close()

        # Restore smart_reassign_history in memory if app_module provided
        if app_module is not None:
            hist = (cloud_data.get("delays_report") or {}).get("smart_reassign_history")
            if isinstance(hist, list) and not app_module._smart_reassign_history:
                app_module._smart_reassign_history.extend(hist[:30])

        global _last_resolve_audit_bundle, _last_resolve_audit_ts, _last_auto_resolver_pool, _last_auto_resolver_ts, _last_pending_summary, _last_delays_report, _last_cw_labels, _needs_heavy_push
        existing_audit = cloud_data.get("resolve_audit")
        if existing_audit and isinstance(existing_audit, dict) and existing_audit.get("data"):
            _last_resolve_audit_bundle = existing_audit
            if _last_resolve_audit_ts == 0:
                _last_resolve_audit_ts = time.time()

        existing_ar = cloud_data.get("auto_resolver_pool")
        if existing_ar and isinstance(existing_ar, dict) and existing_ar.get("items"):
            _last_auto_resolver_pool = existing_ar
            if _last_auto_resolver_ts == 0:
                _last_auto_resolver_ts = time.time()

        existing_ps = cloud_data.get("pending_summary")
        if existing_ps and isinstance(existing_ps, dict) and existing_ps.get("labels"):
            _last_pending_summary = existing_ps

        existing_dr = cloud_data.get("delays_report")
        if existing_dr and isinstance(existing_dr, dict) and existing_dr.get("summary"):
            _last_delays_report = existing_dr

        existing_lbls = (cloud_data.get("labels") or {}).get("all_labels")
        if existing_lbls and isinstance(existing_lbls, list):
            _last_cw_labels = existing_lbls

        _last_applied_ui_ts = int(cloud_data.get("ui_updated_at") or 0)
        logger.info(f"☁️ Restored state from Hugging Face Cloud Dataset ({len(cloud_agents)} agents).")
        return True
    except Exception as e:
        logger.error(f"❌ Error restoring DB from cloud: {e}")
        return False


def _execute_bulk_resolve_in_chatwoot(app_module, conv_ids: list) -> int:
    if not conv_ids:
        return 0
    import concurrent.futures
    base_url, _, account_id = app_module.get_cw_config()
    headers = app_module._cw_headers()

    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10, max_retries=1)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(headers)

    def _resolve_one(cid):
        url = f"{base_url}/api/v1/accounts/{account_id}/conversations/{cid}/toggle_status"
        for attempt in range(2):
            try:
                r = session.post(url, json={"status": "resolved"}, timeout=15)
                if r.status_code in (200, 201):
                    return True
                if r.status_code == 429:
                    time.sleep(0.8)
            except Exception as e:
                if attempt == 0:
                    time.sleep(0.4)
                    continue
                logger.warning(f"⚠️ Error resolving conv {cid}: {e}")
        return False

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(_resolve_one, conv_ids))
    return sum(1 for ok in results if ok)


def _build_auto_resolver_pool(app_module, max_pages: int = 30, min_hours: float = 0.0) -> dict:
    raw_convs = app_module._fetch_conversations_for_resolver(target_status="both", max_pages=max_pages, sort_order="asc")
    now_ts = int(time.time())
    min_seconds = min_hours * 3600
    base_url, _, account_id = app_module.get_cw_config()
    items = []
    for c in raw_convs:
        cid = str(c.get("id", ""))
        if not cid:
            continue
        act_ts = int(c.get("last_activity_at") or c.get("updated_at") or c.get("created_at") or 0)
        if not act_ts:
            continue
        diff_sec = max(0, now_ts - act_ts)
        if diff_sec < min_seconds:
            continue
        diff_hours = round(diff_sec / 3600.0, 1)
        diff_days = round(diff_hours / 24.0, 1)
        meta = c.get("meta") or {}
        sender = meta.get("sender") or {}
        assignee = meta.get("assignee") or {}
        last_msg = (c.get("last_non_activity_message") or {}).get("content") or ""
        items.append({
            "id": cid,
            "status": str(c.get("status", "pending")).lower(),
            "labels": c.get("labels") or [],
            "inactive_hours": diff_hours,
            "inactive_days": diff_days,
            "last_activity_timestamp": act_ts,
            "sender_name": sender.get("name") or sender.get("identifier") or "Unknown",
            "sender_phone": sender.get("phone_number") or "",
            "assignee_name": assignee.get("name") or "Unassigned",
            "last_message": last_msg[:90],
            "chatwoot_url": f"{base_url}/app/accounts/{account_id}/conversations/{cid}"
        })
    items.sort(key=lambda x: x["inactive_hours"], reverse=True)
    return {
        "total_scanned": len(raw_convs),
        "updated_at": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p"),
        "items": items[:1600]
    }


def poll_and_apply_cloud_ui_changes(app_module) -> bool:
    """
    Checks if the user modified settings, agents, or triggered any live command
    from the Static Space UI (`commands.json` / `ui_updated_at` / `pending_commands`).
    Applies them to SQLite and executes live Chatwoot commands immediately.
    Returns True if any change or command was processed.
    """
    global _last_applied_ui_ts, _last_applied_cmd_ts, _applied_cmd_ids, _needs_heavy_push, _last_seen_local_server_ts, _last_delays_report, _last_auto_resolver_pool, _last_resolve_audit_bundle, _last_resolve_audit_ts
    fast_cmds = fetch_cloud_commands()
    new_fast_cmds = [
        c for c in fast_cmds
        if isinstance(c, dict) and (c.get("id") or str(c.get("ts") or 0)) not in _applied_cmd_ids and int(c.get("ts") or 0) > 0
    ]

    cloud_data = fetch_cloud_database()
    if not cloud_data or not isinstance(cloud_data, dict):
        if not new_fast_cmds:
            return False
        cloud_data = {}

    if cloud_data:
        _last_seen_local_server_ts = float(cloud_data.get("local_server_active_ts") or 0)
    ui_ts = int(cloud_data.get("ui_updated_at") or 0)
    legacy_cmds = [
        c for c in (cloud_data.get("pending_commands") or [])
        if isinstance(c, dict) and (c.get("id") or str(c.get("ts") or 0)) not in _applied_cmd_ids and int(c.get("ts") or 0) > _last_applied_cmd_ts
    ]
    pending_cmds = new_fast_cmds + legacy_cmds

    if ui_ts <= _last_applied_ui_ts and not pending_cmds:
        return False

    logger.info(f"☁️ Detected Cloud UI update (ui_ts={ui_ts}, commands={len(pending_cmds)}). Applying...")
    if ui_ts > _last_applied_ui_ts:
        action_only_types = {
            "set_routing", "run_cycle", "smart_reassign", "unassign_conv", "pull_agent_chats",
            "crm_sync", "auto_resolver_execute", "reopen_pending", "refresh_pending", "refresh_cw_counts",
            "refresh_delays", "refresh_resolve_audit"
        }
        has_non_action = (len(legacy_cmds) == 0) or any(
            isinstance(c, dict) and c.get("action") not in action_only_types for c in legacy_cmds
        )
        if has_non_action:
            restore_database_from_cloud(app_module=app_module, force_seed=False)
        _last_applied_ui_ts = max(_last_applied_ui_ts, ui_ts)

    for c in pending_cmds:
        cid_key = c.get("id") or str(c.get("ts") or 0)
        _applied_cmd_ids.add(cid_key)
        _last_applied_cmd_ts = max(_last_applied_cmd_ts, int(c.get("ts") or 0))
    if len(_applied_cmd_ids) > 1000:
        _applied_cmd_ids.clear()

    for cmd in pending_cmds:
        if not isinstance(cmd, dict):
            continue
        action = cmd.get("action")
        payload = cmd.get("payload") or {}
        try:
            if action == "set_routing":
                enabled_flag = bool(payload.get("enabled"))
                app_module.set_routing_enabled(enabled_flag)
                logger.info(f"☁️ Executed cloud command 'set_routing': enabled={enabled_flag}")
                if enabled_flag:
                    try:
                        routed = app_module._run_single_routing_loop_safe()
                        logger.info(f"⚡ Immediate routing cycle on Start: routed={routed}")
                    except Exception as sr_err:
                        logger.warning(f"⚠️ Immediate cycle on start warning: {sr_err}")
            elif action == "run_cycle":
                routed = app_module._run_single_routing_loop_safe()
                logger.info(f"☁️ Executed cloud command 'run_cycle': routed={routed}")
            elif action == "smart_reassign":
                target_cid = payload.get("conv_id") or payload.get("convId")
                cfg_override = payload.get("config") or payload
                res = app_module._execute_smart_reassign(target_conv_id=target_cid, override_config=cfg_override)
                logger.info(f"☁️ Executed cloud command 'smart_reassign': reassigned={res.get('reassigned_count', 0)}")
            elif action == "unassign_conv":
                cid = payload.get("conv_id")
                aid = payload.get("agent_id")
                if cid and app_module.unassign_conversation_in_chatwoot(cid):
                    database.mark_chats_as_pulled([str(cid)])
                    if aid:
                        database.decrement_agent_window_chats(str(aid), 1)
                        with app_module._agent_report_lock:
                            cur_open = int(app_module._agent_report_cache.get(str(aid), 0) or 0)
                            app_module._agent_report_cache[str(aid)] = max(0, cur_open - 1)
                        database.update_agent_active_chats(str(aid), max(0, cur_open - 1))
                    if _last_delays_report and isinstance(_last_delays_report, dict):
                        _last_delays_report["pending_chats"] = [
                            ch for ch in (_last_delays_report.get("pending_chats") or [])
                            if str(ch.get("conv_id")) != str(cid)
                        ]
                    logger.info(f"☁️ Executed cloud command 'unassign_conv' for #{cid}")
            elif action == "pull_agent_chats":
                aid = payload.get("agent_id")
                max_cnt = payload.get("max_count")
                if aid:
                    pulled_ids = app_module._pull_agent_open_chats(aid, max_count=max_cnt)
                    if _last_delays_report and isinstance(_last_delays_report, dict):
                        pulled_set = set(str(x) for x in pulled_ids)
                        _last_delays_report["pending_chats"] = [
                            ch for ch in (_last_delays_report.get("pending_chats") or [])
                            if str(ch.get("agent_id")) != str(aid) and str(ch.get("conv_id")) not in pulled_set
                        ]
                        for as_item in (_last_delays_report.get("agents_summary") or []):
                            if str(as_item.get("agent_id")) == str(aid):
                                as_item["open_chats_count"] = max(0, int(as_item.get("open_chats_count") or 0) - len(pulled_ids))
                    logger.info(f"☁️ Executed cloud command 'pull_agent_chats' for agent {aid}: pulled={len(pulled_ids)}")
            elif action == "crm_sync":
                import crm_service
                crm_service.sync_shifts_to_database()
                logger.info("☁️ Executed cloud command 'crm_sync'")
            elif action == "auto_resolver_execute":
                cids = [str(x) for x in (payload.get("conversation_ids") or []) if x]
                resolved_cnt = _execute_bulk_resolve_in_chatwoot(app_module, cids)
                if _last_auto_resolver_pool and isinstance(_last_auto_resolver_pool.get("items"), list):
                    cids_set = set(cids)
                    _last_auto_resolver_pool["items"] = [
                        it for it in _last_auto_resolver_pool["items"]
                        if str(it.get("id")) not in cids_set
                    ]
                    _last_auto_resolver_pool["updated_at"] = datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p")
                if _last_delays_report and isinstance(_last_delays_report, dict):
                    cids_set = set(cids)
                    _last_delays_report["pending_chats"] = [
                        ch for ch in (_last_delays_report.get("pending_chats") or [])
                        if str(ch.get("conv_id")) not in cids_set
                    ]
                _needs_heavy_push = True
                logger.info(f"☁️ Executed cloud command 'auto_resolver_execute': resolved={resolved_cnt}/{len(cids)}")
            elif action == "reopen_pending":
                lbl = str(payload.get("label") or "").strip()
                cnt = int(payload.get("count") or 10)
                if lbl:
                    ok, reopened_cnt, msg = app_module._reopen_pending_conversations(lbl, cnt)
                    logger.info(f"☁️ Executed cloud command 'reopen_pending' ({lbl}, {cnt}): ok={ok}, reopened={reopened_cnt}")
                    if ok and reopened_cnt > 0 and app_module.is_routing_enabled():
                        try:
                            routed_now = app_module._run_single_routing_loop_safe()
                            logger.info(f"⚡ Immediately routed {routed_now} reopened chats!")
                        except Exception as re_err:
                            logger.warning(f"⚠️ Immediate route after reopen warning: {re_err}")
                    try:
                        global _last_pending_summary
                        _last_pending_summary = app_module._fetch_pending_summary(force_refresh=False)
                    except Exception:
                        pass
            elif action == "refresh_pending":
                try:
                    _last_pending_summary = app_module._fetch_pending_summary(force_refresh=True)
                    logger.info("☁️ Executed cloud command 'refresh_pending'")
                except Exception as rp_err:
                    logger.warning(f"⚠️ refresh_pending warning: {rp_err}")
            elif action == "refresh_cw_counts":
                try:
                    counts = app_module.fetch_agent_report_counts(force_refresh=True)
                    logger.info(f"☁️ Executed cloud command 'refresh_cw_counts' ({len(counts)} agents)")
                except Exception as cw_err:
                    logger.warning(f"⚠️ refresh_cw_counts warning: {cw_err}")
            elif action == "refresh_delays":
                try:
                    pgs = int(payload.get("pages") or 0)
                    fresh_d = app_module._build_delays_report(num_pages=pgs)
                    if isinstance(fresh_d, dict) and fresh_d.get("summary"):
                        _last_delays_report = fresh_d
                    logger.info("☁️ Executed cloud command 'refresh_delays'")
                except Exception as rd_err:
                    logger.warning(f"⚠️ refresh_delays warning: {rd_err}")
            elif action == "refresh_resolve_audit":
                try:
                    audit_today = _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="today", source="chatwoot"))
                    audit_sys_today = _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="today", source="system"))
                    existing_ranges = (_last_resolve_audit_bundle or {}).get("ranges") or {}
                    existing_ranges["system_today"] = audit_sys_today
                    _last_resolve_audit_bundle = {
                        "success": True,
                        "data": audit_today,
                        "ranges": existing_ranges
                    }
                    _last_resolve_audit_ts = time.time()
                    _needs_heavy_push = True
                    logger.info("☁️ Executed cloud command 'refresh_resolve_audit'")
                except Exception as ra_err:
                    logger.warning(f"⚠️ refresh_resolve_audit warning: {ra_err}")
        except Exception as e:
            logger.error(f"❌ Cloud command '{action}' execution error: {e}")

    return True


def _compact_audit_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return payload
    for ch in (payload.get("all_violations") or []):
        if ch.get("last_content"):
            ch["last_content"] = ch["last_content"][:80]
    for ch in (payload.get("all_after_shift") or []):
        if ch.get("last_content"):
            ch["last_content"] = ch["last_content"][:80]
    for ag in (payload.get("agents") or []):
        chats = ag.get("chats") or []
        important = [c for c in chats if c.get("is_violation") or c.get("is_after_shift")][:40]
        others = [c for c in chats if not c.get("is_violation") and not c.get("is_after_shift")][:6]
        kept = important + others
        for c in kept:
            if c.get("last_content"):
                c["last_content"] = c["last_content"][:75]
        ag["chats"] = kept
    return payload


def export_and_push_to_cloud(app_module, num_pages: int = 0, summary: str = "Sync live Chatwoot router state", is_local_server: bool = False, fast_only: bool = False) -> bool:
    """
    Builds a fresh snapshot of SQLite + live Chatwoot delays/scores and commits
    it to ar7222/chatwoot-smart-router-db (data.json).
    When fast_only=True, reuses cached heavy reports so commit finishes in <1s.
    Slow Chatwoot network calls run OUTSIDE _sync_lock and BEFORE reading SQLite
    settings/agents so user actions (Start/Stop/Select) are NEVER blocked or overwritten.
    """
    global _last_resolve_audit_bundle, _last_resolve_audit_ts, _last_auto_resolver_pool, _last_auto_resolver_ts, _last_pending_summary, _last_delays_report, _last_cw_labels, _needs_heavy_push

    # 1. Perform slow Chatwoot network calls OUTSIDE _sync_lock so fast commands never wait or get dropped
    if not fast_only:
        try:
            with app_module._agent_report_lock:
                has_cw_counts = bool(app_module._agent_report_cache)
            if not has_cw_counts:
                app_module.fetch_agent_report_counts()
        except Exception:
            pass

        try:
            cw_labels_fresh = app_module.fetch_chatwoot_labels()
            if cw_labels_fresh:
                _last_cw_labels = cw_labels_fresh
        except Exception:
            pass

        try:
            fresh_delays = app_module._build_delays_report(num_pages=num_pages)
            if isinstance(fresh_delays, dict) and fresh_delays.get("summary"):
                _last_delays_report = fresh_delays
        except Exception as e:
            logger.warning(f"⚠️ Cloud sync delays_report warning: {e}")

        try:
            fresh_ps = app_module._fetch_pending_summary(force_refresh=True)
            if isinstance(fresh_ps, dict) and fresh_ps.get("labels"):
                _last_pending_summary = fresh_ps
        except Exception as e:
            logger.warning(f"⚠️ Cloud sync pending_summary warning: {e}")

        now_ts = time.time()
        has_valid_audit = (
            isinstance(_last_resolve_audit_bundle, dict)
            and isinstance(_last_resolve_audit_bundle.get("data"), dict)
            and len((_last_resolve_audit_bundle.get("data") or {}).get("agents") or []) > 0
        )
        if not has_valid_audit or (now_ts - _last_resolve_audit_ts >= 900):
            try:
                existing_ranges = (_last_resolve_audit_bundle or {}).get("ranges") or {}
                expected_yest = (datetime.now(CAIRO_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")
                cached_yest = existing_ranges.get("chatwoot_yesterday") or {}
                cached_yest_date = (cached_yest.get("summary") or {}).get("date", "")
                day_changed = (cached_yest_date != expected_yest)

                audit_today = _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="today", source="chatwoot"))
                audit_sys_today = _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="today", source="system"))
                audit_yesterday = (
                    _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="yesterday", source="chatwoot"))
                    if (day_changed or not cached_yest)
                    else cached_yest
                )
                audit_2days = (
                    _compact_audit_payload(app_module.audit_conversations_for_agents(date_str="2days", source="chatwoot"))
                    if (day_changed or not existing_ranges.get("chatwoot_2days"))
                    else existing_ranges.get("chatwoot_2days")
                )
                _last_resolve_audit_bundle = {
                    "success": True,
                    "data": audit_today,
                    "ranges": {
                        "chatwoot_yesterday": audit_yesterday,
                        "chatwoot_2days": audit_2days,
                        "system_today": audit_sys_today
                    }
                }
                _last_resolve_audit_ts = now_ts
            except Exception as e:
                logger.warning(f"⚠️ Cloud sync resolve_audit refresh warning: {e}")

        has_valid_ar = (
            isinstance(_last_auto_resolver_pool, dict)
            and isinstance(_last_auto_resolver_pool.get("items"), list)
        )
        if not has_valid_ar or (now_ts - _last_auto_resolver_ts >= 900):
            try:
                _last_auto_resolver_pool = _build_auto_resolver_pool(app_module, max_pages=30, min_hours=0.0)
                _last_auto_resolver_ts = now_ts
            except Exception as e:
                logger.warning(f"⚠️ Cloud sync auto_resolver_pool warning: {e}")

        # Before acquiring lock and reading SQLite, apply any UI changes/commands that arrived during the slow Chatwoot scan!
        if not is_local_server:
            try:
                poll_and_apply_cloud_ui_changes(app_module)
            except Exception:
                pass

    # 2. Acquire lock (fast pushes wait up to 10s so user actions are NEVER dropped)
    acquired = _sync_lock.acquire(timeout=10) if fast_only else _sync_lock.acquire(blocking=False)
    if not acquired:
        return False

    try:
        settings = database.get_settings()
        all_agents = database.get_all_agents()
        today_counts = database.get_all_agents_today_chats_counts()
        pulled_counts = database.get_all_agents_pulled_counts_today()
        window_minutes = int(settings.get("window_minutes", 30))

        with app_module._agent_report_lock:
            cw_counts = dict(app_module._agent_report_cache)

        enriched_agents = []
        for ag in all_agents:
            ag = database.check_and_reset_agent_window(ag, window_minutes=window_minutes)
            aid = str(ag["id"])
            ag_copy = dict(ag)
            assigned = ag_copy.get("assigned_labels")
            if isinstance(assigned, str):
                try:
                    ag_copy["assigned_labels"] = json.loads(assigned)
                except Exception:
                    ag_copy["assigned_labels"] = []
            elif not isinstance(assigned, list):
                ag_copy["assigned_labels"] = []

            ag_copy["in_shift"] = app_module._agent_has_valid_shift(ag_copy)
            ag_copy["in_grace_period"] = app_module._agent_in_grace_period(ag_copy)
            ag_copy["today_chats_count"] = today_counts.get(aid, 0)
            ag_copy["pulled_today_count"] = pulled_counts.get(aid, 0)
            ag_copy["daily_chat_limit"] = ag_copy.get("daily_chat_limit") or 100
            open_cnt = cw_counts.get(aid)
            if open_cnt is None:
                open_cnt = ag_copy.get("chatwoot_open_chats") if ag_copy.get("chatwoot_open_chats") is not None else ag_copy.get("active_chats", 0)
            ag_copy["active_chats"] = int(open_cnt or 0)
            ag_copy["chatwoot_open_chats"] = int(open_cnt or 0)
            enriched_agents.append(ag_copy)

        mappings = database.get_all_mappings()
        logs = database.get_recent_chat_logs(limit=300)
        conn_u = database.get_db()
        users = [
            dict(r)
            for r in conn_u.execute("SELECT id, username, password_hash, salt, role, created_at FROM users ORDER BY id ASC").fetchall()
        ]
        conn_u.close()

        try:
            valid_labels_order = json.loads(settings.get("valid_labels_order", "[]"))
        except Exception:
            valid_labels_order = []

        cw_labels = _last_cw_labels or []

        delays_report = _last_delays_report or {
            "success": True,
            "summary": {
                "total_scanned_chats": 0,
                "total_pending_chats": 0,
                "total_exempt_chats": 0,
                "critical_count": 0,
                "warning_count": 0,
                "normal_count": 0,
                "longest_delay_formatted": "0 دقيقة",
                "most_delayed_agent": "لا يوجد",
                "top_scored_agent": "لا يوجد",
                "timestamp": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p")
            },
            "pending_chats": [],
            "agents_summary": [],
            "configured_sales_labels": valid_labels_order,
            "smart_reassign_config": app_module._get_smart_reassign_config(),
            "smart_reassign_history": list(app_module._smart_reassign_history[:35])
        }
        delays_report["smart_reassign_config"] = app_module._get_smart_reassign_config()
        delays_report["configured_sales_labels"] = valid_labels_order
        delays_report["smart_reassign_history"] = list(app_module._smart_reassign_history[:35])

        delays_open_map = {
            str(item.get("agent_id")): int(item.get("open_chats_count") or 0)
            for item in (delays_report.get("agents_summary") or [])
            if item.get("agent_id")
        }
        for ag_item in enriched_agents:
            aid_s = str(ag_item.get("id"))
            best_open = max(int(ag_item.get("chatwoot_open_chats") or 0), int(ag_item.get("active_chats") or 0), delays_open_map.get(aid_s, 0))
            ag_item["active_chats"] = best_open
            ag_item["chatwoot_open_chats"] = best_open

        pending_summary = _last_pending_summary or {"success": True, "total_unassigned_pending": 0, "labels": []}

        selected_in_shift = [
            a for a in enriched_agents if a.get("is_selected") and not a.get("is_paused") and a.get("in_shift")
        ]
        status_obj = {
            "routing_enabled": settings.get("routing_enabled", "false").lower() in ["true", "1", "yes"],
            "route_unlabeled": settings.get("route_unlabeled", "false").lower() in ["true", "1", "yes"],
            "total_agents": len([a for a in enriched_agents if a.get("team") in ["Sales", "Data"]]),
            "selected_agents": len([a for a in enriched_agents if a.get("is_selected") and a.get("team") in ["Sales", "Data"]]),
            "active_in_shift": len(selected_in_shift),
            "routed_today": sum(today_counts.values()),
            "pulled_today": sum(pulled_counts.values()),
            "window_minutes": window_minutes,
            "worker_heartbeat": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %I:%M:%S %p")
        }

        if not _last_resolve_audit_bundle:
            _last_resolve_audit_bundle = {
                "success": True,
                "data": {
                    "summary": {
                        "date": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d"),
                        "total_routed": sum(today_counts.values()),
                        "total_resolved": 0,
                        "total_open": 0,
                        "total_violations": 0,
                        "total_after_shift_resolves": 0,
                        "total_unanswered_inquiries": 0,
                        "total_no_reply": 0,
                        "total_compliant": 0,
                        "resolution_rate": 0,
                        "compliance_rate": 100,
                        "audited_at": datetime.now(CAIRO_TZ).strftime("%I:%M %p")
                    },
                    "agents": [],
                    "all_violations": [],
                    "all_after_shift": []
                },
                "ranges": {}
            }

        if not _last_auto_resolver_pool:
            _last_auto_resolver_pool = {"total_scanned": 0, "updated_at": "", "items": []}

        cloud_data = {
            "version": 1,
            "updated_at": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %H:%M:%S"),
            "ui_updated_at": _last_applied_ui_ts,
            "local_server_active_ts": time.time() if is_local_server else _last_seen_local_server_ts,
            "pending_commands": [],
            "status": status_obj,
            "settings": settings,
            "agents": enriched_agents,
            "mappings": mappings,
            "logs": logs,
            "users": users,
            "labels": {
                "selected_labels": valid_labels_order,
                "all_labels": cw_labels if cw_labels else [{"title": l} for l in valid_labels_order]
            },
            "delays_report": delays_report,
            "pending_summary": pending_summary
        }

        json_bytes = json.dumps(cloud_data, ensure_ascii=False).encode("utf-8")
        b64_content = base64.b64encode(json_bytes).decode("ascii")

        lines = [
            json.dumps({"key": "header", "value": {"summary": summary}}),
            json.dumps({"key": "file", "value": {"content": b64_content, "path": "data.json", "encoding": "base64"}})
        ]

        if fast_only:
            cmd_clear_bytes = json.dumps({"commands": [], "cleared_at": int(time.time() * 1000)}).encode("utf-8")
            b64_cmd = base64.b64encode(cmd_clear_bytes).decode("ascii")
            lines.append(json.dumps({"key": "file", "value": {"content": b64_cmd, "path": "commands.json", "encoding": "base64"}}))

        if not fast_only or _needs_heavy_push:
            _needs_heavy_push = False
            heavy_payload = {
                "updated_at": datetime.now(CAIRO_TZ).strftime("%Y-%m-%d %H:%M:%S"),
                "resolve_audit": _last_resolve_audit_bundle,
                "auto_resolver_pool": _last_auto_resolver_pool
            }
            b64_heavy = base64.b64encode(json.dumps(heavy_payload, ensure_ascii=False).encode("utf-8")).decode("ascii")
            lines.append(json.dumps({"key": "file", "value": {"content": b64_heavy, "path": "reports_heavy.json", "encoding": "base64"}}))

        ndjson_body = "\n".join(lines)

        tok = get_hf_token()
        r = requests.post(
            CLOUD_COMMIT_URL,
            headers={
                "Authorization": f"Bearer {tok}",
                "Content-Type": "application/x-ndjson"
            },
            data=ndjson_body.encode("utf-8"),
            timeout=90
        )
        if r.status_code in (200, 201):
            logger.info("☁️ Successfully synced live Chatwoot state to Hugging Face Dataset (data.json).")
            return True
        else:
            logger.warning(f"⚠️ Failed to commit data.json to HF ({r.status_code}): {r.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"❌ export_and_push_to_cloud error: {e}")
        return False
    finally:
        _sync_lock.release()
