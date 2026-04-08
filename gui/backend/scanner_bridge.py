"""
scanner_bridge.py
-----------------
Runs media_scan.py as a subprocess and streams its stdout line-by-line
as an async generator, so the FastAPI WebSocket can relay it in real time.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncIterator

# The canonical scanner lives one directory up from gui/
SCANNER_SCRIPT = Path(__file__).resolve().parents[2] / "media_scan.py"


async def run_scan_async(
    media_dir: Path,
    report_dir: Path,
    checks: dict[str, bool],
) -> AsyncIterator[str]:
    """
    Spawn media_scan.py as a subprocess with the requested check subset
    enabled via environment variables.  Yields stdout lines as they arrive.
    """
    env = os.environ.copy()
    env["MEDIA_ROOT"]  = str(media_dir)
    env["REPORT_DIR"]  = str(report_dir)

    # Pass check toggles as env vars so media_scan.py can honour them
    for check, enabled in checks.items():
        env[f"CHECK_{check.upper()}"] = "1" if enabled else "0"

    cmd = [sys.executable, "-u", str(SCANNER_SCRIPT)]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )

    assert proc.stdout is not None

    while True:
        line_bytes = await proc.stdout.readline()
        if not line_bytes:
            break
        yield line_bytes.decode("utf-8", errors="replace").rstrip()

    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"Scanner exited with code {proc.returncode}")
