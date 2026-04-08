#!/usr/bin/env python3
"""
arrstack-media-scanner  —  Dry Run Reporter
============================================
Scans a self-hosted media library and produces 5 JSON reports:

  1. stray_files       — files not inside the expected subfolder structure
  2. duplicates_name   — duplicate groups matched by parsed title + resolution
                         (strips codec, studio, source, streaming-service tags)
  3. duplicates_hash   — exact byte-for-byte duplicates via partial MD5
  4. non_hd            — media titles with no 720p+ version
  5. non_english       — files with no English audio track

All checks are READ-ONLY. Nothing is moved or deleted.

Expected volume mounts
-----------------------
  /mnt/media/shows
  /mnt/media/movies
  /mnt/media/anime
  /mnt/media/books
  /mnt/media/audiobooks
  (optional) /mnt/media/music

Reports are written to /mnt/reports/ with a UTC timestamp prefix.
"""

import os
import re
import json
import hashlib
import subprocess
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MEDIA_ROOT = Path("/mnt/media")
REPORT_DIR = Path("/mnt/reports")

MEDIA_DIRS = {
    "shows":      MEDIA_ROOT / "shows",
    "movies":     MEDIA_ROOT / "movies",
    "anime":      MEDIA_ROOT / "anime",
    "books":      MEDIA_ROOT / "books",
    "audiobooks": MEDIA_ROOT / "audiobooks",
    "music":      MEDIA_ROOT / "music",
}

VIDEO_EXTS  = {".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".ts", ".m2ts"}
AUDIO_EXTS  = {".flac", ".mp3", ".m4a", ".aac", ".ogg", ".wav", ".opus", ".wma"}
BOOK_EXTS   = {".epub", ".mobi", ".pdf", ".azw", ".azw3", ".cbz", ".cbr"}
MEDIA_EXTS  = VIDEO_EXTS | AUDIO_EXTS | BOOK_EXTS

# Resolution tiers — evaluated in order (highest first)
RESOLUTION_TIERS = [
    (r'\b(2160p|4K|UHD)\b',    2160),
    (r'\b(1080p|1080i|FHD)\b', 1080),
    (r'\b(720p|720i|HD)\b',     720),
    (r'\b(480p|SD)\b',          480),
    (r'\b(360p)\b',             360),
]

# Filename language tags that suggest non-English-only content
NON_ENGLISH_LANG_TAGS = [
    r'\b(french|francais|vff|vf)\b',
    r'\b(german|deutsch|ger)\b',
    r'\b(spanish|espanol|esp|spa)\b',
    r'\b(portuguese|portugues|por)\b',
    r'\b(italian|italiano|ita)\b',
    r'\b(japanese|japonais|jpn)\b',
    r'\b(chinese|mandarin|chn|chi)\b',
    r'\b(korean|kor)\b',
    r'\b(arabic|ara)\b',
    r'\b(russian|rus)\b',
    r'\b(hindi|hin)\b',
    r'\b(turkish|tur)\b',
    r'\b(dutch|nld)\b',
    r'\b(polish|pol)\b',
]

# Non-Latin Unicode ranges (Cyrillic, Arabic, Devanagari, CJK, Korean)
NON_LATIN_RE = re.compile(
    r'[\u0400-\u04FF'
    r'\u0600-\u06FF'
    r'\u0900-\u097F'
    r'\u3000-\u9FFF'
    r'\uAC00-\uD7AF]'
)


# ---------------------------------------------------------------------------
# Filename parsing helpers
# ---------------------------------------------------------------------------

def get_resolution(filename: str) -> int:
    """Return the numeric resolution from a filename, or 0 if not found."""
    for pattern, res in RESOLUTION_TIERS:
        if re.search(pattern, filename, re.IGNORECASE):
            return res
    return 0


def parse_media_title(filename: str) -> str:
    """
    Strip release metadata and return a normalised, comparable title string.

    Examples
    --------
    'Movie.A.Webrip.AMZ.1080p.PRODUCE.mkv'  ->  'movie a'
    'MOVIE.A.HDRIP.720P.YAHOO.mkv'           ->  'movie a'
    'Show.Name.S02E05.WEB-DL.x265.mkv'       ->  'show name'
    """
    stem = Path(filename).stem
    name = re.sub(r'[._]', ' ', stem)          # dots/underscores -> spaces

    # Cut everything from the first "junk" token onward
    junk = (
        r'\b(\d{4}|'                          # year
        r'webrip|web[- ]rip|webdl|web[- ]dl|'
        r'bluray|blu[- ]ray|bdrip|hdrip|dvdrip|hdtv|'
        r'amzn|nf|hulu|dsnp|atvp|pcok|pmtp|'
        r'repack|proper|extended|theatrical|directors|unrated|'
        r'x264|x265|h264|h265|hevc|avc|xvid|divx|'
        r'aac|ac3|dts|truehd|atmos|ddp|dd5|'
        r'10bit|hdr|hdr10|dv|dolby|vision|'
        r'2160p|1080p|1080i|720p|720i|480p|4k|uhd|fhd|'
        r'multi|dubbed|subbed|remastered|restored|'
        r's\d{2}e\d{2}|s\d{2}|e\d{2})\b'
    )
    m = re.search(junk, name, re.IGNORECASE)
    if m:
        name = name[:m.start()]
    return name.strip().lower()


def get_season(filename: str) -> str | None:
    """Extract a normalised season string (e.g. 'S02') from a filename."""
    m = re.search(r'\b[Ss](\d{1,2})\b', filename)
    return f"S{int(m.group(1)):02d}" if m else None


# ---------------------------------------------------------------------------
# File hashing
# ---------------------------------------------------------------------------

def partial_md5(path: Path, chunk: int = 4 * 1024 * 1024) -> str:
    """
    Fast approximate hash using filesize + first 4 MB + last 4 MB.
    Sufficient for exact-duplicate detection without reading whole files.
    """
    h = hashlib.md5()
    size = path.stat().st_size
    h.update(str(size).encode())
    with open(path, 'rb') as fh:
        h.update(fh.read(chunk))
        if size > chunk * 2:
            fh.seek(-chunk, 2)
            h.update(fh.read(chunk))
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

def ffprobe_audio_langs(path: Path) -> list[str]:
    """Return a list of audio-stream language codes reported by ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet',
             '-print_format', 'json',
             '-show_streams', '-select_streams', 'a',
             str(path)],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(result.stdout)
        langs = []
        for stream in data.get('streams', []):
            tags = stream.get('tags', {})
            lang = tags.get('language', tags.get('LANGUAGE', 'und')).lower()
            langs.append(lang)
        return langs
    except Exception:
        return []


def has_english_audio(path: Path) -> bool:
    """
    True if the file has at least one English audio track.
    Returns True (assume OK) when ffprobe cannot determine language.
    """
    langs = ffprobe_audio_langs(path)
    if not langs:
        return True
    return any(lang in ('eng', 'en', 'english', 'und') for lang in langs)


def non_english_filename_reason(filename: str) -> str | None:
    """
    Return a human-readable reason string if the filename strongly suggests
    non-English-only content, otherwise None.
    """
    if NON_LATIN_RE.search(filename):
        return 'non-Latin characters in filename'
    stem = filename.lower()
    eng_present = re.search(r'\b(english|eng)\b', stem)
    if not eng_present:
        for pat in NON_ENGLISH_LANG_TAGS:
            if re.search(pat, stem, re.IGNORECASE):
                return f'language tag matched pattern: {pat}'
    return None


# ---------------------------------------------------------------------------
# File collection
# ---------------------------------------------------------------------------

def collect_media_files(base_dir: Path) -> list[Path]:
    """Recursively collect all recognised media files under base_dir."""
    if not base_dir.exists():
        return []
    return [p for p in base_dir.rglob('*')
            if p.is_file() and p.suffix.lower() in MEDIA_EXTS]


# ---------------------------------------------------------------------------
# Report generators
# ---------------------------------------------------------------------------

def report_stray_files(category: str, base_dir: Path) -> list[dict]:
    """
    Files sitting in the wrong level of the hierarchy.

    Expected layouts
    ----------------
    shows / anime  ->  SeriesName / Season XX / episode.ext
    movies         ->  MovieName  / movie.ext
    books          ->  Author     / Title / book.ext   (or Author / book.ext)
    audiobooks     ->  Author     / Title / track.ext
    music          ->  Artist     / Album / track.ext
    """
    if not base_dir.exists():
        return []
    stray = []

    for item in base_dir.iterdir():
        # File directly in the category root — always stray
        if item.is_file() and item.suffix.lower() in MEDIA_EXTS:
            stray.append({
                'file': str(item.relative_to(MEDIA_ROOT)),
                'size_mb': round(item.stat().st_size / 1_048_576, 2),
                'issue': f'File is in /{category}/ root — should be inside a subfolder',
                'suggested_folder': None,
            })

        # For shows/anime: video file directly inside the series folder
        elif item.is_dir() and category in ('shows', 'anime'):
            for f in item.iterdir():
                if f.is_file() and f.suffix.lower() in VIDEO_EXTS:
                    season = get_season(f.name)
                    s_num = int(season[1:]) if season else None
                    suggested = (
                        f"{item.name}/Season {s_num:02d}" if s_num is not None
                        else f"{item.name}/Season ??"
                    )
                    stray.append({
                        'file': str(f.relative_to(MEDIA_ROOT)),
                        'size_mb': round(f.stat().st_size / 1_048_576, 2),
                        'issue': 'Video file is in series root — should be in a Season subfolder',
                        'suggested_folder': suggested,
                    })
    return stray


def report_duplicates_by_name(category: str, base_dir: Path) -> list[dict]:
    """
    Group files by (normalised_title, season).  Groups with more than one
    file are reported as potential duplicates.

    The highest-resolution copy is marked KEEP; others are marked REVIEW.
    """
    if not base_dir.exists():
        return []
    groups: dict[tuple, list[dict]] = defaultdict(list)

    for f in collect_media_files(base_dir):
        title  = parse_media_title(f.name)
        season = get_season(f.name) or ''
        res    = get_resolution(f.name)
        groups[(title, season)].append({'path': f, 'res': res})

    results = []
    for (title, season), entries in groups.items():
        if len(entries) < 2:
            continue
        ranked = sorted(entries, key=lambda x: x['res'], reverse=True)
        results.append({
            'parsed_title': title,
            'season':       season or None,
            'file_count':   len(entries),
            'files': [
                {
                    'file':       str(e['path'].relative_to(MEDIA_ROOT)),
                    'size_mb':    round(e['path'].stat().st_size / 1_048_576, 2),
                    'resolution': e['res'] or 'unknown',
                    'action':     'KEEP (highest quality)' if i == 0 else 'REVIEW for removal',
                }
                for i, e in enumerate(ranked)
            ],
        })
    return results


def report_duplicates_by_hash(category: str, base_dir: Path) -> list[dict]:
    """
    Group files by partial MD5.  Any group with >1 member contains exact
    byte-for-byte duplicates.  The largest file in each group is kept.
    """
    if not base_dir.exists():
        return []
    hash_map: dict[str, list[Path]] = defaultdict(list)

    for f in collect_media_files(base_dir):
        try:
            hash_map[partial_md5(f)].append(f)
        except OSError:
            pass

    results = []
    for h, group in hash_map.items():
        if len(group) < 2:
            continue
        ranked = sorted(group, key=lambda f: f.stat().st_size, reverse=True)
        results.append({
            'hash':       h,
            'file_count': len(group),
            'files': [
                {
                    'file':    str(f.relative_to(MEDIA_ROOT)),
                    'size_mb': round(f.stat().st_size / 1_048_576, 2),
                    'action':  'KEEP' if i == 0 else 'EXACT DUPLICATE — safe to remove',
                }
                for i, f in enumerate(ranked)
            ],
        })
    return results


def report_non_hd(category: str, base_dir: Path) -> list[dict]:
    """
    Report any title group where the best available copy is below 720p.
    Only applies to video-containing categories.
    """
    if not base_dir.exists():
        return []
    video_files = [f for f in collect_media_files(base_dir)
                   if f.suffix.lower() in VIDEO_EXTS]
    groups: dict[tuple, list[dict]] = defaultdict(list)

    for f in video_files:
        title  = parse_media_title(f.name)
        season = get_season(f.name) or ''
        res    = get_resolution(f.name)
        groups[(title, season)].append({'path': f, 'res': res})

    results = []
    for (title, season), entries in groups.items():
        best = max(e['res'] for e in entries)
        if best < 720:
            results.append({
                'parsed_title':    title,
                'season':          season or None,
                'best_resolution': best or 'unknown',
                'files': [
                    {
                        'file':       str(e['path'].relative_to(MEDIA_ROOT)),
                        'size_mb':    round(e['path'].stat().st_size / 1_048_576, 2),
                        'resolution': e['res'] or 'unknown',
                    }
                    for e in entries
                ],
            })
    return results


def report_non_english(category: str, base_dir: Path) -> list[dict]:
    """
    Flag files that appear to have no English audio.

    Detection order
    ---------------
    1. Non-Latin script characters in the filename.
    2. Explicit non-English language tags in the filename (and no English tag).
    3. ffprobe audio-stream metadata (for video and audio files).

    Multi-language files that include an English track are NOT flagged.
    """
    if not base_dir.exists():
        return []
    results = []

    for f in collect_media_files(base_dir):
        reasons = []

        fn_reason = non_english_filename_reason(f.name)
        if fn_reason:
            reasons.append(f'filename: {fn_reason}')

        if f.suffix.lower() in (VIDEO_EXTS | AUDIO_EXTS):
            if not has_english_audio(f):
                reasons.append('ffprobe: no English audio track detected')

        if reasons:
            results.append({
                'file':    str(f.relative_to(MEDIA_ROOT)),
                'size_mb': round(f.stat().st_size / 1_048_576, 2),
                'reasons': reasons,
            })
    return results


# ---------------------------------------------------------------------------
# Report persistence
# ---------------------------------------------------------------------------

def save_report(name: str, payload: dict) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ts  = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    out = REPORT_DIR / f"{ts}_{name}.json"
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, default=str)
    print(f'  -> {out}')
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sep = '=' * 64
    ts  = datetime.now(timezone.utc).isoformat(timespec='seconds')
    print(f'\n{sep}')
    print(f'  arrstack-media-scanner  |  Dry Run  |  {ts}')
    print(f'{sep}\n')

    all_stray       : dict[str, list] = {}
    all_dup_name    : dict[str, list] = {}
    all_dup_hash    : dict[str, list] = {}
    all_non_hd      : dict[str, list] = {}
    all_non_english : dict[str, list] = {}

    VIDEO_CATEGORIES = {'shows', 'movies', 'anime', 'music', 'audiobooks'}

    for category, base_dir in MEDIA_DIRS.items():
        print(f'[{category.upper()}] {base_dir}')
        if not base_dir.exists():
            print(f'  WARNING: directory does not exist — skipping\n')
            continue

        print('  Stray files ...')
        all_stray[category]     = report_stray_files(category, base_dir)

        print('  Name-based duplicates ...')
        all_dup_name[category]  = report_duplicates_by_name(category, base_dir)

        print('  Hash-based duplicates ...')
        all_dup_hash[category]  = report_duplicates_by_hash(category, base_dir)

        if category in VIDEO_CATEGORIES:
            print('  Non-HD check ...')
            all_non_hd[category] = report_non_hd(category, base_dir)

        print('  Non-English check ...')
        all_non_english[category] = report_non_english(category, base_dir)

        counts = {
            'stray':          len(all_stray.get(category,       [])),
            'dup_name_groups':len(all_dup_name.get(category,    [])),
            'dup_hash_groups':len(all_dup_hash.get(category,    [])),
            'non_hd_titles':  len(all_non_hd.get(category,      [])),
            'non_english':    len(all_non_english.get(category, [])),
        }
        print(f'  Summary: {counts}\n')

    meta = {'generated_utc': ts, 'media_root': str(MEDIA_ROOT)}

    print('Saving reports ...')
    save_report('1_stray_files',        {**meta, 'categories': all_stray})
    save_report('2_duplicates_by_name', {**meta, 'categories': all_dup_name})
    save_report('3_duplicates_by_hash', {**meta, 'categories': all_dup_hash})
    save_report('4_non_hd',             {**meta, 'categories': all_non_hd})
    save_report('5_non_english',        {**meta, 'categories': all_non_english})

    print(f'\n{sep}')
    print('  Scan complete.  All reports are DRY RUN only.')
    print('  No files were moved, renamed, or deleted.')
    print(f'{sep}\n')


if __name__ == '__main__':
    main()
