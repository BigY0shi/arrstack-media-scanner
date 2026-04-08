"""
history.py
----------
Persists a log of past scan runs (timestamp, checks included, status).
Stored as a simple JSON array in /app/data/history.json.
"""
from __future__ import annotations

import json
from pathlib import Path

MAX_ENTRIES = 200


def load_history(history_file: Path) -> list[dict]:
    """Return all history entries, newest first."""
    if not history_file.exists():
        return []
    try:
        data = json.loads(history_file.read_text())
        if isinstance(data, list):
            return list(reversed(data))
    except Exception:
        pass
    return []


def append_history(history_file: Path, entry: dict) -> None:
    """Append a new entry to the history log (oldest first in file)."""
    history_file.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict] = []
    if history_file.exists():
        try:
            existing = json.loads(history_file.read_text())
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []
    existing.append(entry)
    # Trim to MAX_ENTRIES
    if len(existing) > MAX_ENTRIES:
        existing = existing[-MAX_ENTRIES:]
    history_file.write_text(json.dumps(existing, indent=2))
