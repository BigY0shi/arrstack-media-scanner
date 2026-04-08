"""
scanner_bridge.py  v2.0
-----------------------
Runs media_scan.py as a subprocess and streams stdout line-by-line
as an async generator so the FastAPI WebSocket can relay it in real time.

Accepts a dict of {category: path} for flexible folder configuration.
"""
from __future__ import annotations

import asyncio, os, sys
from pathlib import Path
from typing import AsyncIterator

SCANNER_SCRIPT = Path('/app/media_scan.py')


async def run_scan_async(
    folder_paths: dict[str, str],
    report_dir: Path,
    checks: dict[str, bool],
) -> AsyncIterator[str]:
    env = os.environ.copy()
    env['REPORT_DIR'] = str(report_dir)

    # Map per-category paths to env vars
    cat_env_map = {
        'shows':      'MEDIA_SHOWS',
        'movies':     'MEDIA_MOVIES',
        'anime':      'MEDIA_ANIME',
        'books':      'MEDIA_BOOKS',
        'audiobooks': 'MEDIA_AUDIOBOOKS',
        'music':      'MEDIA_MUSIC',
    }
    for cat, path in folder_paths.items():
        key = cat_env_map.get(cat)
        if key: env[key] = path

    # Pass check toggles
    for check, enabled in checks.items():
        env[f'CHECK_{check.upper()}'] = '1' if enabled else '0'

    python = sys.executable
    proc = await asyncio.create_subprocess_exec(
        python, str(SCANNER_SCRIPT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    async for line in proc.stdout:
        decoded = line.decode('utf-8', errors='replace').rstrip()
        if decoded:
            yield decoded
    await proc.wait()
