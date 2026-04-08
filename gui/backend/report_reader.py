"""
report_reader.py
----------------
Reads the JSON report files produced by media_scan.py and returns
structured data for the API.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPORT_NAMES = [
    "1_stray_files",
    "2_duplicates_by_name",
    "3_duplicates_by_hash",
    "4_non_hd",
    "5_non_english",
]

TS_RE = re.compile(r'^(\d{8}_\d{6})_')


def list_report_sets(report_dir: Path) -> list[dict]:
    """
    Return a list of available report sets, each identified by their
    UTC timestamp string (e.g. "20260415_040002").
    Sorted newest first.
    """
    if not report_dir.exists():
        return []

    timestamps: dict[str, dict] = {}
    for f in report_dir.glob("*.json"):
        m = TS_RE.match(f.name)
        if not m:
            continue
        ts = m.group(1)
        if ts not in timestamps:
            timestamps[ts] = {"timestamp": ts, "files": []}
        timestamps[ts]["files"].append(f.name)

    result = sorted(timestamps.values(), key=lambda x: x["timestamp"], reverse=True)
    return result


def load_report_set(report_dir: Path, timestamp: str) -> dict | None:
    """
    Load all 5 report files for a given timestamp into a single dict.
    Returns None if no files for that timestamp are found.
    """
    if not report_dir.exists():
        return None

    out: dict = {"timestamp": timestamp}
    found = False

    for name in REPORT_NAMES:
        path = report_dir / f"{timestamp}_{name}.json"
        if path.exists():
            try:
                out[name] = json.loads(path.read_text())
                found = True
            except Exception as exc:
                out[name] = {"error": str(exc)}
        else:
            out[name] = None

    return out if found else None
