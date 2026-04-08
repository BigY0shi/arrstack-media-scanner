#!/usr/bin/env python3
"""
arrstack-media-scanner  v2.0  --  Dry-Run Report Engine
=======================================================
Produces up to 5 structured JSON reports for a self-hosted media library.
All operations are READ-ONLY; nothing is moved, renamed, or deleted.

Reports
-------
  1. stray_files        -- files sitting outside the expected hierarchy
  2. duplicates_by_name -- groups with same parsed title + resolution
  3. duplicates_by_hash -- byte-identical files (partial-MD5 fingerprint)
  4. non_hd             -- video titles with no 720p+ copy
  5. non_english        -- files with no detectable English audio

Configuration (environment variables)
--------------------------------------
  MEDIA_ROOT      parent of all category dirs  (default /mnt/media)
  REPORT_DIR      where JSON reports are saved  (default /mnt/reports)

  Per-category override paths (optional):
    MEDIA_SHOWS        MEDIA_MOVIES       MEDIA_ANIME
    MEDIA_BOOKS        MEDIA_AUDIOBOOKS   MEDIA_MUSIC

  Check toggles (set to '0' to skip a check):
    CHECK_STRAY_FILES        CHECK_DUPLICATES_BY_NAME
    CHECK_DUPLICATES_BY_HASH CHECK_NON_HD   CHECK_NON_ENGLISH

  Filtering:
    MIN_HD_HEIGHT   minimum pixel height for 'HD' (default 720)
    PARTIAL_MB      MB read from head+tail for hash (default 4)
"""

from __future__ import annotations
import hashlib, json, os, re, subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _env_path(var, fallback): return Path(os.getenv(var, fallback))
def _env_bool(var, default=True):
    v = os.getenv(var, '')
    return default if not v else v.strip().lower() not in ('0','false','no','off')
def _env_int(var, default):
    try: return int(os.getenv(var, str(default)))
    except ValueError: return default

MEDIA_ROOT    = _env_path('MEDIA_ROOT', '/mnt/media')
REPORT_DIR    = _env_path('REPORT_DIR', '/mnt/reports')
MIN_HD_HEIGHT = _env_int('MIN_HD_HEIGHT', 720)
PARTIAL_MB    = _env_int('PARTIAL_MB', 4)

# (env_override, is_video, is_audio)
CATEGORIES = {
    'shows':      ('MEDIA_SHOWS',      True,  False),
    'movies':     ('MEDIA_MOVIES',     True,  False),
    'anime':      ('MEDIA_ANIME',      True,  False),
    'books':      ('MEDIA_BOOKS',      False, False),
    'audiobooks': ('MEDIA_AUDIOBOOKS', False, True),
    'music':      ('MEDIA_MUSIC',      False, True),
}

def get_category_path(name):
    return _env_path(CATEGORIES[name][0], str(MEDIA_ROOT / name))

CHECK_STRAY_FILES        = _env_bool('CHECK_STRAY_FILES')
CHECK_DUPLICATES_BY_NAME = _env_bool('CHECK_DUPLICATES_BY_NAME')
CHECK_DUPLICATES_BY_HASH = _env_bool('CHECK_DUPLICATES_BY_HASH')
CHECK_NON_HD             = _env_bool('CHECK_NON_HD')
CHECK_NON_ENGLISH        = _env_bool('CHECK_NON_ENGLISH')

VIDEO_EXT = {'.mkv','.mp4','.avi','.m4v','.ts','.mov','.wmv','.flv','.webm'}
AUDIO_EXT = {'.mp3','.flac','.m4a','.ogg','.opus','.wav','.aac','.wma','.alac'}
BOOK_EXT  = {'.epub','.mobi','.azw','.azw3','.pdf','.cbz','.cbr','.fb2'}
MEDIA_EXT = VIDEO_EXT | AUDIO_EXT | BOOK_EXT
def is_media(p): return p.suffix.lower() in MEDIA_EXT

NON_LATIN_RE = re.compile(
    r'[\u0400-\u04ff\u0600-\u06ff\u4e00-\u9fff\u3040-\u309f'
    r'\u30a0-\u30ff\uac00-\ud7af\u0900-\u097f\u0e00-\u0e7f]'
)
_JUNK_RE = re.compile(
    r'\b(\d{4}|webrip|web[- ]rip|webdl|web[- ]dl|bluray|blu[- ]ray|bdrip|hdrip'
    r'|dvdrip|hdtv|remux|amzn|nf|hulu|dsnp|atvp|pcok|pmtp|hbo|peacock|paramount'
    r'|repack|proper|extended|theatrical|directors|unrated|hybrid'
    r'|x264|x265|h264|h265|hevc|avc|xvid|divx|av1|vp9'
    r'|aac|ac3|dts|truehd|atmos|ddp|dd5|flac|mp3|eac3'
    r'|10bit|12bit|hdr|hdr10|dv|dolby|vision|sdr|hlg'
    r'|2160p|1080p|1080i|720p|720i|480p|576p|4k|uhd|fhd|hd'
    r'|multi|dubbed|subbed|remastered|restored|criterion'
    r'|s\d{2}e\d{2}|s\d{2}e\d{2}-e\d{2}|s\d{2})\b', re.IGNORECASE)
_RES_RE = re.compile(r'\b(2160p|4k|uhd|1080p|1080i|720p|720i|480p|576p)\b', re.IGNORECASE)
_HEIGHT_MAP = {'2160p':2160,'4k':2160,'uhd':2160,'1080p':1080,'1080i':1080,
               '720p':720,'720i':720,'480p':480,'576p':576}

def parse_resolution(fn):
    m = _RES_RE.search(fn); return m.group(0).lower() if m else None
def resolution_height(res):
    return 0 if res is None else _HEIGHT_MAP.get(res.lower(), 0)
def parse_media_title(fn):
    name = re.sub(r'[._ -]+', ' ', Path(fn).stem)
    m = _JUNK_RE.search(name)
    return (name[:m.start()] if m else name).strip().lower()
def get_season(fn):
    m = re.search(r'\b[Ss](\d{1,2})\b', fn)
    return f'S{int(m.group(1)):02d}' if m else None

# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------
def partial_md5(path):
    chunk = PARTIAL_MB * 1_048_576; h = hashlib.md5()
    try:
        size = path.stat().st_size
        with open(path,'rb') as fh:
            h.update(fh.read(chunk))
            if size > chunk*2: fh.seek(-chunk,2); h.update(fh.read(chunk))
        h.update(str(size).encode())
    except OSError: pass
    return h.hexdigest()

# ---------------------------------------------------------------------------
# ffprobe
# ---------------------------------------------------------------------------
def ffprobe_audio_langs(path):
    try:
        r = subprocess.run(['ffprobe','-v','quiet','-print_format','json',
            '-show_streams','-select_streams','a',str(path)],
            capture_output=True, text=True, timeout=30)
        data = json.loads(r.stdout)
        return [s.get('tags',{}).get('language',s.get('tags',{}).get('LANGUAGE','und')).lower()
                for s in data.get('streams',[])]
    except Exception: return []

def has_english_audio(path):
    langs = ffprobe_audio_langs(path)
    return True if not langs else any(l in ('eng','en','english','und') for l in langs)

def non_english_filename_reason(fn):
    if NON_LATIN_RE.search(fn): return 'non-Latin characters in filename'
    stem = fn.lower()
    if re.search(r'\b(english|eng)\b', stem): return None
    for tag in ('.fre.','.ger.','.spa.','.ita.','.por.','.rus.','.jpn.',
                '.kor.','.chi.','.ara.','.hin.','.pol.','.dut.','.swe.',
                '.nor.','.fin.','.dan.','.tur.','.heb.','.vie.',
                'french','german','spanish','italian','portuguese',
                'russian','japanese','korean','chinese','arabic'):
        if tag in stem: return f"language tag '{tag.strip('.')}' in filename"
    return None

# ---------------------------------------------------------------------------
# Walkers
# ---------------------------------------------------------------------------
def walk_media_files(base):
    if not base.exists(): return []
    return [p for p in base.rglob('*') if p.is_file() and is_media(p)]

# ---------------------------------------------------------------------------
# Report 1 -- Stray files
# ---------------------------------------------------------------------------
def _depth(base, f): return len(f.relative_to(base).parts) - 1

def report_stray_files(cat, base):
    results = []
    for f in walk_media_files(base):
        d = _depth(base, f); reason = None
        if cat in ('shows','anime'):
            if d == 0: reason = 'Directly in category root (missing show folder)'
            elif d > 3: reason = f'Unexpectedly deep nesting (depth {d})'
        elif cat == 'movies':
            if d > 2: reason = f'Unexpectedly deep nesting (depth {d})'
        elif cat in ('books','audiobooks'):
            if d == 0: reason = 'Directly in category root (missing author/title folder)'
        elif cat == 'music':
            if d < 2: reason = 'Missing artist or album subfolder'
        if reason:
            results.append({'category':cat,'file':str(f.relative_to(base.parent)),
                            'depth':d,'reason':reason,'size_mb':round(f.stat().st_size/1_048_576,2)})
    return results

# ---------------------------------------------------------------------------
# Report 2 -- Duplicates by name
# ---------------------------------------------------------------------------
def report_duplicates_by_name(cat, base):
    groups = defaultdict(list)
    for f in walk_media_files(base):
        t = parse_media_title(f.name); s = get_season(f.name) or ''
        if t: groups[f'{cat}|{t}|{s}'].append(f)
    results = []
    for key, files in groups.items():
        if len(files) < 2: continue
        _, title, season = key.split('|',2)
        ranked = sorted(files, key=lambda p: resolution_height(parse_resolution(p.name)), reverse=True)
        results.append({'category':cat,'parsed_title':title,'season':season or None,
            'file_count':len(ranked),'files':[
                {'file':str(f.relative_to(base.parent)),'resolution':parse_resolution(f.name),
                 'size_mb':round(f.stat().st_size/1_048_576,2),
                 'action':'KEEP' if i==0 else 'REVIEW -- lower/equal quality duplicate'}
                for i,f in enumerate(ranked)]})
    return results

# ---------------------------------------------------------------------------
# Report 3 -- Duplicates by hash
# ---------------------------------------------------------------------------
def report_duplicates_by_hash(cat, base):
    hmap = defaultdict(list)
    files = walk_media_files(base); total = len(files)
    for idx, f in enumerate(files, 1):
        if total > 0 and idx % 50 == 0:
            print(f'  [{cat}] hashing {idx}/{total}...', flush=True)
        hmap[partial_md5(f)].append(f)
    results = []
    for h, group in hmap.items():
        if len(group) < 2: continue
        ranked = sorted(group, key=lambda p: p.stat().st_size, reverse=True)
        results.append({'hash':h,'category':cat,'file_count':len(group),'files':[
            {'file':str(f.relative_to(base.parent)),'size_mb':round(f.stat().st_size/1_048_576,2),
             'action':'KEEP' if i==0 else 'EXACT DUPLICATE -- safe to remove'}
            for i,f in enumerate(ranked)]})
    return results

# ---------------------------------------------------------------------------
# Report 4 -- Non-HD
# ---------------------------------------------------------------------------
def report_non_hd(cat, base):
    if not CATEGORIES.get(cat,(None,False))[1]: return []
    groups = defaultdict(list)
    for f in walk_media_files(base):
        if f.suffix.lower() not in VIDEO_EXT: continue
        t = parse_media_title(f.name); s = get_season(f.name) or ''
        if t: groups[f'{t}|{s}'].append(f)
    results = []
    for key, files in groups.items():
        bh = max(resolution_height(parse_resolution(f.name)) for f in files)
        if bh < MIN_HD_HEIGHT:
            title, season = key.split('|',1)
            results.append({'category':cat,'parsed_title':title,'season':season or None,
                'best_resolution':f'{bh}p' if bh else 'unknown','files':[
                {'file':str(f.relative_to(base.parent)),'resolution':parse_resolution(f.name),
                 'size_mb':round(f.stat().st_size/1_048_576,2)} for f in sorted(files,key=lambda p:p.name)]})
    return results

# ---------------------------------------------------------------------------
# Report 5 -- Non-English
# ---------------------------------------------------------------------------
def report_non_english(cat, base):
    results = []
    for f in walk_media_files(base):
        is_vid = f.suffix.lower() in VIDEO_EXT
        is_aud = f.suffix.lower() in AUDIO_EXT
        if not (is_vid or is_aud): continue
        fn_reason = non_english_filename_reason(f.name)
        probe_ok = has_english_audio(f)
        probe_reason = None
        if not probe_ok:
            langs = ffprobe_audio_langs(f)
            probe_reason = f"Audio tracks: {', '.join(langs) if langs else 'unknown'}"
        # If filename suggests non-English but probe says English is present, skip
        if fn_reason and probe_ok: continue
        if not fn_reason and probe_ok: continue
        parts = [p for p in [fn_reason, probe_reason] if p]
        results.append({'category':cat,'file':str(f.relative_to(base.parent)),
            'size_mb':round(f.stat().st_size/1_048_576,2),
            'reason':'; '.join(parts) if parts else 'No English audio track detected'})
    return results

# ---------------------------------------------------------------------------
# Report persistence
# ---------------------------------------------------------------------------
def save_report(name, payload):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORT_DIR / f'{name}.json'
    with open(out,'w',encoding='utf-8') as fh: json.dump(payload,fh,indent=2,default=str)
    print(f'  -> saved: {out}', flush=True)
    return out

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    sep = '='*70
    ts  = datetime.now(timezone.utc).isoformat(timespec='seconds')
    print(f'\n{sep}\n arrstack-media-scanner  v2.0  |  {ts} UTC\n{sep}', flush=True)
    active_cats = {name: get_category_path(name) for name in CATEGORIES}
    missing = [n for n,p in active_cats.items() if not p.exists()]
    if missing: print(f'  [WARN] not found (will skip): {", ".join(missing)}', flush=True)
    rts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    summary = {}

    def _run_check(num, label, check_flag, fn_name, result_key, count_key):
        if not check_flag:
            print(f'\n[{num}/5] {label} -- SKIPPED', flush=True); return
        print(f'\n[{num}/5] {label}...', flush=True)
        all_results = []
        for cat, base in active_cats.items():
            if base.exists():
                found = fn_name(cat, base); all_results.extend(found)
                if found: print(f'  {cat}: {len(found)}', flush=True)
        ts2 = datetime.now(timezone.utc).isoformat(timespec='seconds')
        payload = {'report': result_key, 'generated': ts2, count_key: len(all_results),
                   ('items' if count_key=='item_count' else 'groups'): all_results}
        save_report(f'{rts}_{num}_{result_key}', payload)
        summary[result_key] = {'count': len(all_results)}

    _run_check('1','Scanning for stray files',CHECK_STRAY_FILES,
               report_stray_files,'stray_files','item_count')
    _run_check('2','Scanning for name-based duplicates',CHECK_DUPLICATES_BY_NAME,
               report_duplicates_by_name,'duplicates_by_name','group_count')
    _run_check('3','Computing file hashes for exact duplicates',CHECK_DUPLICATES_BY_HASH,
               report_duplicates_by_hash,'duplicates_by_hash','group_count')
    _run_check('4','Scanning for non-HD video titles',CHECK_NON_HD,
               report_non_hd,'non_hd','item_count')
    _run_check('5','Scanning for non-English audio',CHECK_NON_ENGLISH,
               report_non_english,'non_english','item_count')

    print(f'\n{sep}\n SCAN COMPLETE', flush=True)
    for k,v in summary.items(): print(f'  {k}: {v["count"]} item(s)', flush=True)
    print(sep, flush=True)
    print(json.dumps({'event':'done','summary':summary}), flush=True)

if __name__ == '__main__': main()
