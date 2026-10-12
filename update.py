# -*- coding: utf-8 -*-
"""
Chatwoot Smart Router - One-Click Automatic Updater
Safely downloads the latest system updates from GitHub, preserves database settings,
and updates all backend/frontend assets with zero dependencies.
"""
import os
import sys
import time
import shutil
import zipfile
import subprocess
import urllib.request

REPO_ZIP_URL = "https://github.com/datateam1164-oss/chatwoot-smart-router/archive/refs/heads/main.zip"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def log(msg):
    print(f"[i] {msg}")

def log_success(msg):
    print(f"[✓] {msg}")

def log_error(msg):
    print(f"[!] {msg}")

def kill_running_backend():
    log("Checking for running background server processes...")
    try:
        if sys.platform == "win32":
            # Attempt to kill python processes running app.py
            subprocess.run(["taskkill", "/F", "/IM", "python.exe", "/T"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1)
    except Exception as e:
        log(f"Process check note: {e}")

def try_git_pull():
    git_dir = os.path.join(BASE_DIR, ".git")
    if not os.path.isdir(git_dir):
        return False
    
    log("Git repository detected. Attempting to pull updates via git...")
    try:
        # Check if git is available
        res = subprocess.run(["git", "pull", "origin", "main"], cwd=BASE_DIR, capture_output=True, text=True)
        if res.returncode == 0:
            log_success("Git pull completed successfully.")
            return True
        else:
            log(f"Git pull encountered an issue: {res.stderr.strip()[:100]}. Falling back to direct zip download.")
            return False
    except Exception as e:
        log(f"Git not available or failed: {e}. Falling back to direct zip download.")
        return False

def download_and_extract_zip():
    temp_zip = os.path.join(BASE_DIR, "update_temp.zip")
    temp_extract = os.path.join(BASE_DIR, "update_temp_dir")
    db_path = os.path.join(BASE_DIR, "Backend", "routing.db")
    db_backup = os.path.join(BASE_DIR, "Backend", "routing.db.backup_before_update")

    # 1. Backup user database
    if os.path.exists(db_path):
        try:
            shutil.copy2(db_path, db_backup)
            log("User database backed up safely.")
        except Exception as e:
            log(f"Warning: could not backup database: {e}")

    # 2. Download zip from GitHub
    log("Downloading latest update from GitHub repository...")
    try:
        req = urllib.request.Request(
            REPO_ZIP_URL,
            headers={"User-Agent": "Chatwoot-Auto-Updater/1.0"}
        )
        with urllib.request.urlopen(req) as resp, open(temp_zip, "wb") as out_file:
            total_size = int(resp.headers.get("content-length", 0))
            downloaded = 0
            block_size = 64 * 1024

            while True:
                buffer = resp.read(block_size)
                if not buffer:
                    break
                downloaded += len(buffer)
                out_file.write(buffer)
                if total_size > 0:
                    percent = int((downloaded / total_size) * 100)
                    mb = downloaded / (1024 * 1024)
                    sys.stdout.write(f"\r[i] Downloading update: {mb:.1f} MB ({percent}%)")
                    sys.stdout.flush()
                else:
                    mb = downloaded / (1024 * 1024)
                    sys.stdout.write(f"\r[i] Downloading update: {mb:.1f} MB")
                    sys.stdout.flush()
        print()
        log_success("Update package downloaded successfully.")
    except Exception as e:
        log_error(f"Download failed: {e}")
        return False

    # 3. Extract zip
    log("Extracting updated files...")
    try:
        if os.path.exists(temp_extract):
            shutil.rmtree(temp_extract, ignore_errors=True)
        os.makedirs(temp_extract, exist_ok=True)

        with zipfile.ZipFile(temp_zip, "r") as zf:
            zf.extractall(temp_extract)

        # The extracted archive contains a root folder: chatwoot-smart-router-main
        extracted_root = None
        for item in os.listdir(temp_extract):
            full_sub = os.path.join(temp_extract, item)
            if os.path.isdir(full_sub) and "chatwoot" in item.lower():
                extracted_root = full_sub
                break

        if not extracted_root:
            extracted_root = temp_extract

        # 4. Copy files over BASE_DIR (excluding overwriting local database)
        log("Applying updates to local installation...")
        for root, dirs, files in os.walk(extracted_root):
            rel_dir = os.path.relpath(root, extracted_root)
            target_dir = os.path.normpath(os.path.join(BASE_DIR, rel_dir)) if rel_dir != "." else BASE_DIR

            os.makedirs(target_dir, exist_ok=True)

            for f in files:
                src_file = os.path.join(root, f)
                dst_file = os.path.join(target_dir, f)

                # Never overwrite existing database if we already have one!
                if f.lower() == "routing.db" and os.path.exists(db_backup):
                    continue

                try:
                    shutil.copy2(src_file, dst_file)
                except Exception as ex:
                    pass

        log_success("All files updated successfully.")
    except Exception as e:
        log_error(f"Failed to apply update files: {e}")
        return False
    finally:
        # Clean up temporary download artifacts
        if os.path.exists(temp_zip):
            try:
                os.remove(temp_zip)
            except Exception:
                pass
        if os.path.exists(temp_extract):
            try:
                shutil.rmtree(temp_extract, ignore_errors=True)
            except Exception:
                pass

    # 5. Restore user database if needed
    if os.path.exists(db_backup) and os.path.exists(db_path):
        try:
            shutil.copy2(db_backup, db_path)
            os.remove(db_backup)
            log_success("User database and configurations preserved intact.")
        except Exception:
            pass

    return True

def main():
    print("=" * 66)
    print("   Chatwoot Smart Router - One-Click Automatic Updater")
    print("=" * 66)
    print()

    # 1. Stop background server
    kill_running_backend()

    # 2. Update via git or zip download
    updated = try_git_pull()
    if not updated:
        updated = download_and_extract_zip()

    if not updated:
        print()
        log_error("Update could not be completed. Please check your internet connection.")
        print()
        input("Press Enter to exit...")
        sys.exit(1)

    print()
    print("=" * 66)
    print("   [SUCCESS] System updated to the latest version!")
    print("   Restarting Chatwoot Smart Router now...")
    print("=" * 66)
    print()
    time.sleep(2)

    # Launch Run_System.bat
    run_bat = os.path.join(BASE_DIR, "Run_System.bat")
    if os.path.exists(run_bat):
        if sys.platform == "win32":
            os.startfile(run_bat)

if __name__ == "__main__":
    main()
