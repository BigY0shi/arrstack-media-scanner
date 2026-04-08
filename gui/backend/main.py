"""
arrstack-media-scanner  v2.0  --  FastAPI Backend
=================================================
REST + WebSocket API consumed by the React dashboard.

Endpoints
---------
GET  /api/health                    -- liveness check
GET  /api/status                    -- scanner status + last-run summary
GET  /api/config                    -- current config (checks, cron, folder paths)
POST /api/config                    -- save config
POST /api/scan/run                  -- trigger a manual scan (returns run_id)
WS   /api/scan/stream/{run_id}      -- stream live log lines for a scan
GET  /api/reports                   -- list report sets (newest first)
GET  /api/reports/{ts}              -- all JSON reports for a timestamp
GET  /api/history                   -- scan run history
DELETE /api/history                 -- clear scan history
"""

from __future__ import annotations

import asyncio, json, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scanner_bridge import run_scan_async
from cron_manager import set_cron, remove_cron
from report_reader import list_report_sets, load_report_set
from history import load_history, append_history, clear_history

# ---------------------------------------------------------------------------
# Paths / env
# ---------------------------------------------------------------------------

REPORT_DIR   = Path(os.getenv('REPORT_DIR',  '/mnt/reports'))
CONFIG_FILE  = Path(os.getenv('CONFIG_FILE', '/app/data/config.json'))
HISTORY_FILE = Path(os.getenv('HISTORY_FILE','/app/data/history.json'))
FRONTEND_DIR = Path('/app/frontend/dist')
CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

# Default category paths (can be overridden in config)
DEFAULT_CATEGORY_PATHS = {
    'shows':      '/mnt/media/shows',
    'movies':     '/mnt/media/movies',
    'anime':      '/mnt/media/anime',
    'books':      '/mnt/media/books',
    'audiobooks': '/mnt/media/audiobooks',
    'music':      '/mnt/media/music',
}

DEFAULT_CONFIG: dict[str, Any] = {
    'checks': {
        'stray_files':        True,
        'duplicates_by_name': True,
        'duplicates_by_hash': True,
        'non_hd':             True,
        'non_english':        True,
    },
    'cron':         '0 4 1,15 * *',
    'cron_enabled': True,
    'folder_paths': DEFAULT_CATEGORY_PATHS.copy(),
}

_runs: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text())
        except Exception: pass
    return DEFAULT_CONFIG.copy()

def save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))

def get_folder_paths(cfg: dict) -> dict:
    fp = cfg.get('folder_paths', {})
    return {cat: fp.get(cat, DEFAULT_CATEGORY_PATHS.get(cat, f'/mnt/media/{cat}'))
            for cat in DEFAULT_CATEGORY_PATHS}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title='arrstack-media-scanner', version='2.0.0')

app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True,
    allow_methods=['*'], allow_headers=['*'])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ConfigPayload(BaseModel):
    checks: dict[str, bool]
    cron: str
    cron_enabled: bool
    folder_paths: dict[str, str] = {}

# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get('/api/health')
def health():
    return {'status': 'ok', 'version': '2.0.0'}

@app.get('/api/status')
def get_status():
    cfg = load_config()
    history = load_history(HISTORY_FILE)
    last = history[0] if history else None
    folder_paths = get_folder_paths(cfg)
    media_dirs = {cat: Path(p).exists() for cat, p in folder_paths.items()}
    report_sets = list_report_sets(REPORT_DIR)
    active_run = next((r for r in _runs.values() if r.get('status') == 'running'), None)
    return {
        'media_dirs':       media_dirs,
        'report_count':     len(report_sets),
        'last_scan':        last,
        'cron_expression':  cfg.get('cron', DEFAULT_CONFIG['cron']),
        'cron_enabled':     cfg.get('cron_enabled', True),
        'active_checks':    cfg.get('checks', DEFAULT_CONFIG['checks']),
        'folder_paths':     folder_paths,
        'is_scanning':      active_run is not None,
        'active_run_id':    active_run.get('run_id') if active_run else None,
    }

@app.get('/api/config')
def get_config():
    cfg = load_config()
    if 'folder_paths' not in cfg:
        cfg['folder_paths'] = DEFAULT_CATEGORY_PATHS.copy()
    return cfg

@app.post('/api/config')
def post_config(payload: ConfigPayload):
    cfg = payload.model_dump()
    # Fill in any missing folder paths with defaults
    for cat, default_path in DEFAULT_CATEGORY_PATHS.items():
        if cat not in cfg['folder_paths']:
            cfg['folder_paths'][cat] = default_path
    save_config(cfg)
    if cfg['cron_enabled']:
        set_cron(cfg['cron'], cfg['folder_paths'], REPORT_DIR)
    else:
        remove_cron()
    return {'ok': True}

@app.post('/api/scan/run')
async def start_scan():
    # Prevent concurrent scans
    for r in _runs.values():
        if r.get('status') == 'running':
            return {'run_id': r['run_id'], 'already_running': True}

    run_id = str(uuid.uuid4())
    cfg    = load_config()
    folder_paths = get_folder_paths(cfg)
    _runs[run_id] = {
        'run_id':  run_id,
        'status':  'pending',
        'log':     [],
        'started': datetime.now(timezone.utc).isoformat(),
    }

    async def _run():
        _runs[run_id]['status'] = 'running'
        checks = cfg.get('checks', DEFAULT_CONFIG['checks'])
        try:
            async for line in run_scan_async(folder_paths, REPORT_DIR, checks):
                _runs[run_id]['log'].append(line)
            _runs[run_id]['status'] = 'done'
            finished = datetime.now(timezone.utc).isoformat()
            _runs[run_id]['finished'] = finished
            append_history(HISTORY_FILE, {
                'run_id':   run_id,
                'started':  _runs[run_id]['started'],
                'finished': finished,
                'checks':   checks,
                'status':   'done',
            })
        except Exception as exc:
            _runs[run_id]['status'] = 'error'
            _runs[run_id]['log'].append(f'ERROR: {exc}')
            finished = datetime.now(timezone.utc).isoformat()
            append_history(HISTORY_FILE, {
                'run_id':   run_id,
                'started':  _runs[run_id]['started'],
                'finished': finished,
                'checks':   checks,
                'status':   'error',
            })

    asyncio.create_task(_run())
    return {'run_id': run_id, 'already_running': False}

@app.websocket('/api/scan/stream/{run_id}')
async def scan_stream(websocket: WebSocket, run_id: str):
    await websocket.accept()
    if run_id not in _runs:
        await websocket.send_text(json.dumps({'error': 'unknown run_id'}))
        await websocket.close(); return

    sent = 0
    try:
        while True:
            log = _runs[run_id]['log']
            while sent < len(log):
                await websocket.send_text(json.dumps({'line': log[sent]}))
                sent += 1
            status = _runs[run_id]['status']
            if status in ('done', 'error'):
                await websocket.send_text(json.dumps({'status': status}))
                break
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass

@app.get('/api/reports')
def get_reports():
    return list_report_sets(REPORT_DIR)

@app.get('/api/reports/{ts}')
def get_report(ts: str):
    data = load_report_set(REPORT_DIR, ts)
    if data is None:
        raise HTTPException(status_code=404, detail='Report set not found')
    return data

@app.get('/api/history')
def get_history():
    return load_history(HISTORY_FILE)

@app.delete('/api/history')
def delete_history():
    clear_history(HISTORY_FILE)
    return {'ok': True}

# ---------------------------------------------------------------------------
# Serve React SPA
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    assets_dir = FRONTEND_DIR / 'assets'
    if assets_dir.exists():
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        # Serve known static files directly
        static = FRONTEND_DIR / full_path
        if static.exists() and static.is_file():
            return FileResponse(static)
        index = FRONTEND_DIR / 'index.html'
        if index.exists():
            return FileResponse(index)
        return JSONResponse({'error': 'Frontend not built'}, status_code=404)
