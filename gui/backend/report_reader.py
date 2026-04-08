"""
report_reader.py  v2.0
----------------------
Reads the JSON report files produced by media_scan.py and returns
structured data for the API.

File naming convention (v2.0):
  {YYYYmmdd_HHMMSS}_{N}_{report_key}.json
  e.g.  20260408_040001_1_stray_files.json
"""
from __future__ import annotations
import json, re
from pathlib import Path

# Timestamp prefix — 8 digits, underscore, 6 digits
TS_RE = re.compile(r'^(\d{8}_\d{6})_')

# Known report keys (v2.0 names)
REPORT_KEYS = [
    'stray_files',
    'duplicates_by_name',
    'duplicates_by_hash',
    'non_hd',
    'non_english',
]


def list_report_sets(report_dir: Path) -> list[dict]:
    '''Return available report sets, newest first.'''
    if not report_dir.exists(): return []
    timestamps: dict[str, dict] = {}
    for f in report_dir.glob('*.json'):
        if f.name == 'cron.log': continue
        m = TS_RE.match(f.name)
        if not m: continue
        ts = m.group(1)
        if ts not in timestamps:
            timestamps[ts] = {'timestamp': ts, 'files': []}
        timestamps[ts]['files'].append(f.name)
    return sorted(timestamps.values(), key=lambda x: x['timestamp'], reverse=True)


def load_report_set(report_dir: Path, ts: str) -> dict | None:
    '''Load all available reports for a given timestamp.'''
    if not report_dir.exists(): return None
    result: dict = {}
    found = 0
    for f in report_dir.glob(f'{ts}_*.json'):
        # Extract report key from filename
        # Pattern: {ts}_{N}_{key_part1}_{key_part2...}.json
        stem = f.stem  # e.g. '20260408_040001_1_stray_files'
        # Remove timestamp prefix
        after_ts = stem[len(ts)+1:]  # e.g. '1_stray_files'
        # Remove leading number
        parts = after_ts.split('_', 1)
        if len(parts) < 2: continue
        key = parts[1]  # e.g. 'stray_files'
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
            result[key] = data
            found += 1
        except Exception:
            continue
    return result if found > 0 else None
