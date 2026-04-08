"""
cron_manager.py
---------------
Read and write the host crontab from inside the Docker container.

The container needs to be started with:
  --volume /var/spool/cron/crontabs:/var/spool/cron/crontabs
or the simpler approach of mounting the host crontab file directly.

Alternatively, when running without host crontab access, this module
writes a /etc/cron.d/arrstack-media-scanner file (works if the container
runs its own cron daemon, e.g. crond from busybox/alpine).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

CRON_MARKER  = "# arrstack-media-scanner"
CRON_FILE    = Path("/etc/cron.d/arrstack-media-scanner")


def _build_cron_line(expression: str, media_dir: Path, report_dir: Path) -> str:
    cmd = (
        f"docker run --rm "
        f"-v {media_dir}:/mnt/media:ro "
        f"-v {report_dir}:/mnt/reports "
        f"arrstack-media-scanner:latest "
        f">> /var/log/arrstack-media-scanner.log 2>&1"
    )
    return f"{expression} root {cmd}"


def get_cron() -> str | None:
    """Return the current cron expression, or None if not set."""
    if CRON_FILE.exists():
        for line in CRON_FILE.read_text().splitlines():
            if CRON_MARKER in line:
                continue
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                # First non-comment, non-marker line is the schedule
                parts = stripped.split()
                if len(parts) >= 5:
                    return " ".join(parts[:5])
    # Fallback: try reading host crontab via subprocess
    try:
        result = subprocess.run(
            ["crontab", "-l"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if CRON_MARKER in line:
                continue
            if "arrstack-media-scanner" in line and not line.startswith("#"):
                parts = line.strip().split()
                if len(parts) >= 5:
                    return " ".join(parts[:5])
    except Exception:
        pass
    return None


def set_cron(expression: str, media_dir: Path, report_dir: Path) -> None:
    """Install or update the cron entry."""
    cron_line = _build_cron_line(expression, media_dir, report_dir)
    content = f"{CRON_MARKER}\n{cron_line}\n"
    try:
        CRON_FILE.parent.mkdir(parents=True, exist_ok=True)
        CRON_FILE.write_text(content)
    except PermissionError:
        # Fallback: write to user crontab via crontab command
        _set_user_cron(expression, media_dir, report_dir)


def remove_cron() -> None:
    """Remove the cron entry entirely."""
    if CRON_FILE.exists():
        CRON_FILE.unlink()
    try:
        result = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=5
        )
        lines = [
            ln for ln in result.stdout.splitlines()
            if CRON_MARKER not in ln and "arrstack-media-scanner" not in ln
        ]
        subprocess.run(
            ["crontab", "-"],
            input="\n".join(lines) + "\n",
            text=True, timeout=5
        )
    except Exception:
        pass


def _set_user_cron(expression: str, media_dir: Path, report_dir: Path) -> None:
    """Write to the user crontab via the crontab command."""
    try:
        result = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=5
        )
        existing = result.stdout if result.returncode == 0 else ""
        lines = [
            ln for ln in existing.splitlines()
            if CRON_MARKER not in ln and "arrstack-media-scanner" not in ln
        ]
        cmd_line = _build_cron_line(expression, media_dir, report_dir)
        lines += [CRON_MARKER, cmd_line]
        subprocess.run(
            ["crontab", "-"],
            input="\n".join(lines) + "\n",
            text=True, timeout=5
        )
    except Exception as exc:
        raise RuntimeError(f"Could not update crontab: {exc}") from exc
