"""
arrstack-media-scanner  —  FastAPI Backend
==========================================
Exposes REST + WebSocket endpoints consumed by the React dashboard.

Endpoints
---------
GET  /api/status          — scanner status, last-run info
GET  /api/config          — current check toggles + cron expression
POST /api/config          — save check toggles + cron expression
POST /api/scan/run        — trigger a manual scan (returns run_id)
WS   /api/scan/stream/{run_id}  — stream live log lines for a scan
GET  /api/reports         — list available report sets (by timestamp)
GET  /api/reports/{ts}    — return all 5 JSON reports for a timestamp
GET  /api/history         — scan history log entries
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from scanner_bridge import run_scan_async
from cron_manager import get_cron, set_cron, remove_cron
from report_reader import list_report_sets, load_report_set
from history import append_history, load_history

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="arrstack-media-scanner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REPORT_DIR   = Path(os.getenv("REPORT_DIR",  "/mnt/reports"))
MEDIA_DIR    = Path(os.getenv("MEDIA_DIR",   "/mnt/media"))
CONFIG_FILE  = Path(os.getenv("CONFIG_FILE", "/app/data/config.json"))
HISTORY_FILE = Path(os.getenv("HISTORY_FILE","/app/data/history.json"))

CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_CONFIG: dict[str, Any] = {
    "checks": {
        "stray_files":        True,
        "duplicates_by_name": True,
        "duplicates_by_hash": True,
        "non_hd":             True,
        "non_english":        True,
    },
    "cron": "0 4 1,15 * *",
    "cron_enabled": True,
}

# In-memory run registry  {run_id: {"status": ..., "log": [...]}}
_runs: dict[str, dict] = {}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ConfigPayload(BaseModel):
    checks: dict[str, bool]
    cron: str
    cron_enabled: bool


class ScanStartResponse(BaseModel):
    run_id: str


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/api/status")
def get_status():
    cfg = load_config()
    history = load_history(HISTORY_FILE)
    last = history[-1] if history else None
    return {
        "media_dir_exists":   MEDIA_DIR.exists(),
        "report_dir_exists":  REPORT_DIR.exists(),
        "report_count":       len(list_report_sets(REPORT_DIR)),
        "last_scan":          last,
        "cron_expression":    cfg.get("cron", DEFAULT_CONFIG["cron"]),
        "cron_enabled":       cfg.get("cron_enabled", True),
        "active_checks":      cfg.get("checks", DEFAULT_CONFIG["checks"]),
    }


@app.get("/api/config")
def get_config():
    return load_config()


@app.post("/api/config")
def post_config(payload: ConfigPayload):
    cfg = payload.model_dump()
    save_config(cfg)
    # Sync cron
    if cfg["cron_enabled"]:
        set_cron(cfg["cron"], MEDIA_DIR, REPORT_DIR)
    else:
        remove_cron()
    return {"ok": True}


@app.post("/api/scan/run", response_model=ScanStartResponse)
def start_scan():
    run_id = str(uuid.uuid4())
    cfg    = load_config()
    _runs[run_id] = {"status": "pending", "log": [], "started": datetime.now(timezone.utc).isoformat()}

    async def _run():
        _runs[run_id]["status"] = "running"
        checks = cfg.get("checks", DEFAULT_CONFIG["checks"])
        try:
            async for line in run_scan_async(MEDIA_DIR, REPORT_DIR, checks):
                _runs[run_id]["log"].append(line)
            _runs[run_id]["status"] = "done"
            append_history(HISTORY_FILE, {
                "run_id":   run_id,
                "started":  _runs[run_id]["started"],
                "finished": datetime.now(timezone.utc).isoformat(),
                "checks":   checks,
                "status":   "done",
            })
        except Exception as exc:
            _runs[run_id]["status"] = "error"
            _runs[run_id]["log"].append(f"ERROR: {exc}")
            append_history(HISTORY_FILE, {
                "run_id":   run_id,
                "started":  _runs[run_id]["started"],
                "finished": datetime.now(timezone.utc).isoformat(),
                "checks":   checks,
                "status":   "error",
            })

    asyncio.create_task(_run())
    return {"run_id": run_id}


@app.websocket("/api/scan/stream/{run_id}")
async def scan_stream(websocket: WebSocket, run_id: str):
    await websocket.accept()
    if run_id not in _runs:
        await websocket.send_text(json.dumps({"error": "unknown run_id"}))
        await websocket.close()
        return

    sent = 0
    try:
        while True:
            run = _runs[run_id]
            log = run["log"]
            # Send any new log lines
            while sent < len(log):
                await websocket.send_text(json.dumps({"line": log[sent]}))
                sent += 1
            if run["status"] in ("done", "error"):
                await websocket.send_text(json.dumps({"status": run["status"]}))
                break
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@app.get("/api/reports")
def list_reports():
    return list_report_sets(REPORT_DIR)


@app.get("/api/reports/{timestamp}")
def get_report(timestamp: str):
    data = load_report_set(REPORT_DIR, timestamp)
    if data is None:
        raise HTTPException(status_code=404, detail="Report set not found")
    return data


@app.get("/api/history")
def get_history():
    return load_history(HISTORY_FILE)


# ---------------------------------------------------------------------------
# Serve React frontend
# ---------------------------------------------------------------------------
FRONTEND_DIR = Path("/app/frontend/dist")

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return {"error": "Frontend not built"}
