FROM python:3.12-slim

# Install ffmpeg (provides ffprobe for audio-stream language detection)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY media_scan.py /app/media_scan.py

# Volume mounts (set at runtime via -v flags):
#   /mnt/media    — media library root (read-only recommended)
#   /mnt/reports  — report output directory (writable)

CMD ["python", "-u", "/app/media_scan.py"]
