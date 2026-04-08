# arrstack-media-scanner

> A **read-only, dry-run** Docker tool that scans your self-hosted media library and produces structured JSON reports — perfect for \*arr-stack setups (Sonarr / Radarr / Readarr / Lidarr / Audiobookshelf).

---

## What it does

Produces **5 timestamped JSON reports** every run:

| # | Report | What it finds |
|---|--------|---------------|
| 1 | `stray_files` | Files not inside the expected subfolder hierarchy (e.g. a loose video file sitting directly in the series root instead of `SeriesName/Season 01/`) |
| 2 | `duplicates_by_name` | Duplicate groups matched by **parsed title + season**, after stripping codec, source, studio, and streaming-service tags (e.g. `Movie.A.Webrip.AMZ.1080p` vs `MOVIE.A.HDRIP.720P.YAHOO`). Marks the highest-resolution copy **KEEP**. |
| 3 | `duplicates_by_hash` | Exact byte-for-byte duplicates via partial MD5 (first 4 MB + last 4 MB + file size). Safe to remove without further review. |
| 4 | `non_hd` | Video titles whose best available copy is below 720p. |
| 5 | `non_english` | Files with no detectable English audio track, detected via filename tags, non-Latin characters, and `ffprobe` audio stream metadata. Multi-language files that include an English track are left alone. |

**Nothing is ever moved, renamed, or deleted.**

---

## GUI Dashboard (recommended)

The easiest way to use arrstack-media-scanner is through the included web dashboard — a FastAPI + React app that runs as a standalone Docker container on port **8377**.

### Features

- **Dashboard** — live scan log streamed over WebSocket, at-a-glance stat cards (clickable), inline check toggles
- **Reports** — browse all report sets, view each of the 5 report types in a clean table/accordion UI
- **History** — log of every scan run with status, duration, and which checks were enabled
- **Settings** — toggle individual checks, configure per-category folder paths, set a cron schedule
- **Dark mode + Darker mode** — no light mode, ever

### Deploy the dashboard

```bash
git clone https://github.com/BigY0shi/arrstack-media-scanner.git
cd arrstack-media-scanner

docker build -f gui/Dockerfile -t arrstack-scanner-gui:latest .

docker run -d \
  --name arrstack-scanner \
  -p 8377:8377 \
  -v /path/to/folder/media:/mnt/media:ro \
  -v /path/to/folder/reports:/mnt/reports \
  -v arrstack-data:/app/data \
  arrstack-scanner-gui:latest
```

Then open **http://your-server-ip:8377** in your browser.

> **Tip:** On first launch, go to **Settings → Media Folder Paths** to verify (or override) the path for each media category.

### Volume mounts (dashboard)

| Host path | Container path | Purpose |
|-----------|----------------|---------|
| `/path/to/folder/media` | `/mnt/media` | Media library root (read-only) |
| `/path/to/folder/reports` | `/mnt/reports` | Where JSON reports are written |
| `arrstack-data` (named volume) | `/app/data` | Persists config + scan history |

---

## Headless / CLI mode

If you prefer to run the scanner without the dashboard (e.g. triggered by cron directly):

### Option A — one-command setup

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
# Build
docker build -t arrstack-media-scanner:latest .

# Run (adjust paths to match your host)
docker run --rm \
  -v /path/to/folder/media:/mnt/media:ro \
  -v /path/to/folder/reports:/mnt/reports \
  arrstack-media-scanner:latest
```

---

## Media directory structure

The scanner expects (and checks for) this hierarchy inside the container:

```
/mnt/media/
  shows/
  movies/
  anime/
  books/
  audiobooks/
  music/          # optional
```

Each category path can be overridden independently — either via the **Settings** page in the dashboard, or via environment variables:

| Category | Environment variable | Default |
|----------|---------------------|---------|
| Shows | `MEDIA_SHOWS` | `/mnt/media/shows` |
| Movies | `MEDIA_MOVIES` | `/mnt/media/movies` |
| Anime | `MEDIA_ANIME` | `/mnt/media/anime` |
| Books | `MEDIA_BOOKS` | `/mnt/media/books` |
| Audiobooks | `MEDIA_AUDIOBOOKS` | `/mnt/media/audiobooks` |
| Music | `MEDIA_MUSIC` | `/mnt/media/music` |

---

## Configuration

### Check toggles

Disable individual checks via environment variables (set to `0` to skip):

```bash
CHECK_STRAY_FILES=1
CHECK_DUPLICATES_BY_NAME=1
CHECK_DUPLICATES_BY_HASH=1
CHECK_NON_HD=1
CHECK_NON_ENGLISH=1
```

In the GUI dashboard, these are toggled from the **Dashboard** page (inline pills) or the **Settings** page.

### Other options

| Variable | Default | Description |
|----------|---------|-------------|
| `REPORT_DIR` | `/mnt/reports` | Where JSON reports are written |
| `MIN_HD_HEIGHT` | `720` | Minimum pixel height to be considered HD |
| `PARTIAL_MB` | `4` | MB read from head + tail for hash fingerprint |

---

## Report format

Each report is a JSON file named `{timestamp}_{N}_{key}.json`, e.g.:

```
20260408_040001_1_stray_files.json
20260408_040001_2_duplicates_by_name.json
20260408_040001_3_duplicates_by_hash.json
20260408_040001_4_non_hd.json
20260408_040001_5_non_english.json
```

All timestamps are UTC. All file paths in reports are relative to the category root.

---

## Requirements

- Docker (any recent version)
- Media files accessible as a volume mount
- `ffmpeg` / `ffprobe` — included automatically in the Docker image

---

## License

MIT — see [LICENSE](LICENSE).
