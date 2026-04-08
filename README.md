# arrstack-media-scanner

> A **read-only, dry-run** Docker tool that scans your self-hosted media library and produces structured JSON reports — perfect for *arr-stack setups (Sonarr / Radarr / Readarr / Lidarr / Audiobookshelf).

---

## What it does

Produces **5 timestamped JSON reports** every run:

| # | Report file | What it finds |
|---|-------------|---------------|
| 1 | `1_stray_files.json` | Files not inside the correct subfolder hierarchy (e.g. loose video files in the series root instead of `SeriesName/Season 01/`) |
| 2 | `2_duplicates_by_name.json` | Duplicate groups matched by **parsed title + season**, after stripping codec, source, studio, and streaming-service tags (e.g. `Movie.A.Webrip.AMZ.1080p` vs `MOVIE.A.HDRIP.720P.YAHOO`). Marks the highest-resolution copy as **KEEP**. |
| 3 | `3_duplicates_by_hash.json` | Exact byte-for-byte duplicates via partial MD5 (first 4 MB + last 4 MB + file size). Safe to remove without further review. |
| 4 | `4_non_hd.json` | Any title group where **no 720p+ copy exists** |
| 5 | `5_non_english.json` | Files with no English audio track. Detected via filename language tags, non-Latin characters, **and** `ffprobe` audio stream metadata. Multi-language files that include an English track are **not** flagged. |

---

## Requirements

- Docker (any recent version)
- The scanner image is built locally — no Docker Hub pull required

---

## Quick start

### Option A — automated setup (recommended)

```bash
git clone https://github.com/BigY0shi/arrstack-media-scanner.git
cd arrstack-media-scanner

# Edit MEDIA_PATH and REPORT_PATH at the top of setup.sh, then:
chmod +x setup.sh && sudo ./setup.sh
```

`setup.sh` will:
1. Build the Docker image
2. Create the reports output directory
3. Install a biweekly cron job (1st and 15th of each month at 04:00)

### Option B — manual

```bash
# 1. Build
docker build -t arrstack-media-scanner:latest .

# 2. Run (adjust paths to match your host)
docker run --rm \
  -v /mnt/HDD2/shared_media/media:/mnt/media:ro \
  -v /mnt/HDD2/shared_media/reports:/mnt/reports \
  arrstack-media-scanner:latest
```

---

## Volume mounts

| Host path | Container path | Mode |
|-----------|----------------|------|
| `/mnt/HDD2/shared_media/media` | `/mnt/media` | `:ro` (read-only) |
| `/mnt/HDD2/shared_media/reports` | `/mnt/reports` | writable |

The scanner recognises these subdirectories automatically:

```
/mnt/media/
  shows/
  movies/
  anime/
  books/
  audiobooks/
  music/          (optional)
```

---

## Expected folder structure

```
shows/
  Breaking Bad/
    Season 01/
      Breaking.Bad.S01E01.mkv

movies/
  The Matrix (1999)/
    The.Matrix.1999.1080p.mkv

anime/
  Attack on Titan/
    Season 01/
      Attack.on.Titan.S01E01.mkv

books/
  Frank Herbert/
    Dune.epub

audiobooks/
  Brandon Sanderson/
    The Way of Kings/
      part1.m4b
```

---

## Scheduling (biweekly cron)

The `setup.sh` script installs this cron entry automatically:

```cron
# arrstack-media-scanner
0 4 1,15 * * docker run --rm -v /mnt/HDD2/shared_media/media:/mnt/media:ro -v /mnt/HDD2/shared_media/reports:/mnt/reports arrstack-media-scanner:latest >> /var/log/arrstack-media-scanner.log 2>&1
```

To adjust the schedule, edit the cron entry with `crontab -e`.

---

## Report format

Each report is a JSON file with a `generated_utc` timestamp and a `categories` object keyed by media type.

**Example — `2_duplicates_by_name.json`**
```json
{
  "generated_utc": "2026-04-08T04:00:00+00:00",
  "categories": {
    "movies": [
      {
        "parsed_title": "movie a",
        "season": null,
        "file_count": 2,
        "files": [
          { "file": "movies/Movie.A.Webrip.AMZ.1080p.PRODUCE.mkv", "resolution": 1080, "action": "KEEP (highest quality)" },
          { "file": "movies/MOVIE.A.HDRIP.720P.YAHOO.mkv",         "resolution": 720,  "action": "REVIEW for removal" }
        ]
      }
    ]
  }
}
```

---

## Safety

- The scanner **never modifies, moves, or deletes** any files.
- The media volume is mounted **read-only** (`/mnt/media:ro`).
- All reports are purely informational — you review them and act manually.

---

## License

MIT — see [LICENSE](LICENSE).
