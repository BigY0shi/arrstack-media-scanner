# =============================================================
# arrstack-media-scanner  v2.0  --  GUI Docker Image
# =============================================================
# Stage 1: Build React frontend
# =============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps first (cached layer)
COPY gui/frontend/package.json .
RUN npm install --frozen-lockfile

# Copy source and build
COPY gui/frontend/ .
RUN npm run build

# =============================================================
# Stage 2: Runtime (FastAPI + built frontend + scanner)
# =============================================================
FROM python:3.12-slim

LABEL org.opencontainers.image.title="arrstack-media-scanner"
LABEL org.opencontainers.image.description="Dry-run media library scanner dashboard"
LABEL org.opencontainers.image.source="https://github.com/BigY0shi/arrstack-media-scanner"
LABEL org.opencontainers.image.version="2.0.0"

# System deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg cron \
    && rm -rf /var/lib/apt/lists/*

# Python deps
WORKDIR /app
COPY gui/backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Backend source
COPY gui/backend/ /app/backend/

# Scanner script at the location the bridge expects
COPY media_scan.py /app/media_scan.py

# Pre-built frontend
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Data & report directories
RUN mkdir -p /app/data /mnt/reports

WORKDIR /app/backend

# Expose dashboard port
EXPOSE 8377

# Environment defaults
ENV REPORT_DIR=/mnt/reports \
    MEDIA_ROOT=/mnt/media \
    CONFIG_FILE=/app/data/config.json \
    HISTORY_FILE=/app/data/history.json \
    PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8377/api/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8377", "--workers", "1"]
