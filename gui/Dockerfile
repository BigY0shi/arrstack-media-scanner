# ─────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY gui/frontend/package.json .
RUN npm install
COPY gui/frontend/ .
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Runtime image (FastAPI + built React + scanner)
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim

# Install ffmpeg (for ffprobe audio-stream checks)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
WORKDIR /app
COPY gui/backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend
COPY gui/backend/ /app/backend/

# Copy scanner script
COPY media_scan.py /app/media_scan.py

# Copy built frontend
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Data directory for config + history
RUN mkdir -p /app/data

WORKDIR /app/backend

EXPOSE 8377

ENV REPORT_DIR=/mnt/reports \
    MEDIA_DIR=/mnt/media \
    CONFIG_FILE=/app/data/config.json \
    HISTORY_FILE=/app/data/history.json

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8377", "--workers", "1"]
