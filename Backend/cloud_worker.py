# ═══════════════════════════════════════════════════════════════════════════
# 24/7 HEADLESS CLOUD WORKER FOR CHATWOOT SMART ROUTER & HF DATASET SYNC
# ═══════════════════════════════════════════════════════════════════════════

import os
import sys
import time
import logging
import threading

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import database
import crm_service
import hf_sync
import app as router_app

logger = logging.getLogger("CloudWorker")


def _heavy_reports_sync_loop():
    """Background daemon thread that refreshes delays_report, pending_summary, and resolve_audit without blocking fast UI commands."""
    time.sleep(10)
    while True:
        try:
            if not hf_sync.is_local_server_active():
                hf_sync.export_and_push_to_cloud(router_app, num_pages=0, fast_only=False)
        except Exception as e:
            logger.error(f"❌ Heavy reports background sync error: {e}")
        time.sleep(90)


def run_cloud_worker():
    max_seconds = int(os.environ.get("CLOUD_WORKER_MAX_SECONDS", "0"))
    fast_poll_interval = 4
    start_ts = time.time()

    logger.info("☁️ Starting 24/7 Cloud Worker (Chatwoot <-> Hugging Face Dataset)...")
    database.init_db()

    # 1. Seed SQLite from Hugging Face Cloud Dataset (ar7222/chatwoot-smart-router-db)
    hf_sync.restore_database_from_cloud(router_app, force_seed=True)

    # 2. Refresh Chatwoot teams & agents and sync CRM shifts
    try:
        router_app._refresh_team_cache()
        router_app.sync_chatwoot_agents_to_db()
    except Exception as e:
        logger.warning(f"⚠️ Initial Chatwoot agent sync warning: {e}")

    try:
        settings = database.get_settings()
        if settings.get("crm_email") and settings.get("crm_password"):
            crm_service.sync_shifts_to_database()
    except Exception as e:
        logger.warning(f"⚠️ Initial CRM shift sync warning: {e}")

    # Start non-blocking background thread for heavy reports (delays, pending counts, resolve audit)
    bg_thread = threading.Thread(target=_heavy_reports_sync_loop, daemon=True)
    bg_thread.start()

    last_smart_reassign_ts = 0
    last_cw_counts_ts = 0
    last_routing_ts = 0

    while True:
        cycle_start = time.time()
        needs_fast_push = False

        # A. Poll UI changes & pending commands every 4 seconds (reopen_pending, refresh_pending, run_cycle, etc.)
        try:
            if hf_sync.poll_and_apply_cloud_ui_changes(router_app):
                needs_fast_push = True
        except Exception as e:
            logger.error(f"❌ Cloud UI poll error: {e}")

        # Safety Guard: If the local PC server (app.py) is currently active, enter Standby Mode to prevent duplicate routing
        if hf_sync.is_local_server_active():
            logger.info("⏸️ Local PC server (app.py) is active — Cloud Worker standing by to prevent duplicate routing.")
            elapsed_total = time.time() - start_ts
            if max_seconds > 0 and elapsed_total >= max_seconds:
                break
            time.sleep(15)
            continue

        # B. Periodically update official Chatwoot open chat counts (every 90s)
        if time.time() - last_cw_counts_ts >= 90:
            last_cw_counts_ts = time.time()
            try:
                counts = router_app.fetch_agent_report_counts()
                if counts:
                    database.update_agents_active_chats_bulk(counts)
            except Exception as e:
                logger.warning(f"⚠️ Chatwoot open counts refresh warning: {e}")

        # C. Run Smart Routing Cycle every 15s if enabled
        if time.time() - last_routing_ts >= 15:
            last_routing_ts = time.time()
            try:
                if router_app.is_routing_enabled():
                    routed = router_app._run_single_routing_loop_safe()
                    if routed > 0:
                        logger.info(f"✅ Cloud Worker Routed {routed} conversations.")
                        needs_fast_push = True
            except Exception as e:
                logger.error(f"❌ Cloud routing cycle error: {e}")

        # D. Run Auto Smart-Reassign (Delayed >15m -> Same-Label Highest Score Agent) if enabled
        try:
            cfg = router_app._get_smart_reassign_config()
            if cfg.get("auto_enabled") and cfg.get("labels") and (time.time() - last_smart_reassign_ts >= 50):
                last_smart_reassign_ts = time.time()
                res = router_app._execute_smart_reassign()
                if res.get("reassigned_count", 0) > 0:
                    logger.info(f"⚡ Cloud Worker Reassigned {res['reassigned_count']} delayed conversations.")
                    needs_fast_push = True
        except Exception as e:
            logger.error(f"❌ Cloud smart reassign error: {e}")

        # E. Push fast state immediately (< 0.8s) whenever a UI command or routing event occurred
        if needs_fast_push:
            try:
                hf_sync.export_and_push_to_cloud(router_app, fast_only=True, summary="Fast sync after command/routing")
            except Exception as e:
                logger.error(f"❌ Cloud fast push error: {e}")

        elapsed_total = time.time() - start_ts
        if max_seconds > 0 and elapsed_total >= max_seconds:
            logger.info(f"🏁 Cloud Worker reached max runtime ({int(elapsed_total)}s). Exiting cleanly for next scheduled run.")
            break

        sleep_for = max(2, fast_poll_interval - int(time.time() - cycle_start))
        time.sleep(sleep_for)


if __name__ == "__main__":
    run_cloud_worker()
