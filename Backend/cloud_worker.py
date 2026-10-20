# ═══════════════════════════════════════════════════════════════════════════
# 24/7 HEADLESS CLOUD WORKER FOR CHATWOOT SMART ROUTER & HF DATASET SYNC
# ═══════════════════════════════════════════════════════════════════════════

import os
import sys
import time
import logging

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import database
import crm_service
import hf_sync
import app as router_app

logger = logging.getLogger("CloudWorker")


def run_cloud_worker():
    max_seconds = int(os.environ.get("CLOUD_WORKER_MAX_SECONDS", "0"))
    loop_interval = int(os.environ.get("CLOUD_WORKER_INTERVAL", "35"))
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

    last_smart_reassign_ts = 0
    last_cloud_push_ts = 0
    last_cw_counts_ts = 0

    while True:
        cycle_start = time.time()
        needs_push = False

        # A. Poll UI changes & pending commands from Static Space (ar7222-chatwoot-smart-router.static.hf.space)
        try:
            if hf_sync.poll_and_apply_cloud_ui_changes(router_app):
                needs_push = True
        except Exception as e:
            logger.error(f"❌ Cloud UI poll error: {e}")

        # Safety Guard: If the local PC server (app.py) is currently active, enter Standby Mode to prevent duplicate routing
        if hf_sync.is_local_server_active():
            logger.info("⏸️ Local PC server (app.py) is active — Cloud Worker standing by to prevent duplicate routing.")
            elapsed_total = time.time() - start_ts
            if max_seconds > 0 and elapsed_total >= max_seconds:
                break
            time.sleep(loop_interval)
            continue

        # B. Periodically update official Chatwoot open chat counts
        if time.time() - last_cw_counts_ts >= 90:
            last_cw_counts_ts = time.time()
            try:
                counts = router_app.fetch_agent_report_counts()
                if counts:
                    database.update_agents_active_chats_bulk(counts)
            except Exception as e:
                logger.warning(f"⚠️ Chatwoot open counts refresh warning: {e}")

        # C. Run Smart Routing Cycle if enabled
        try:
            if router_app.is_routing_enabled():
                routed = router_app._run_single_routing_loop_safe()
                if routed > 0:
                    logger.info(f"✅ Cloud Worker Routed {routed} conversations.")
                    needs_push = True
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
                    needs_push = True
        except Exception as e:
            logger.error(f"❌ Cloud smart reassign error: {e}")

        # E. Push fresh live state (delays report, scores +7/+5/0, agents, logs) to HF Dataset every 2 mins or on change
        try:
            if needs_push or (time.time() - last_cloud_push_ts >= 120):
                last_cloud_push_ts = time.time()
                hf_sync.export_and_push_to_cloud(router_app, num_pages=8)
        except Exception as e:
            logger.error(f"❌ Cloud dataset push error: {e}")

        elapsed_total = time.time() - start_ts
        if max_seconds > 0 and elapsed_total >= max_seconds:
            logger.info(f"🏁 Cloud Worker reached max runtime ({int(elapsed_total)}s). Exiting cleanly for next scheduled run.")
            break

        sleep_for = max(5, loop_interval - int(time.time() - cycle_start))
        time.sleep(sleep_for)


if __name__ == "__main__":
    run_cloud_worker()
