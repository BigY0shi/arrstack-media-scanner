#!/usr/bin/env bash
# =============================================================================
#  arrstack-media-scanner — One-command setup script
#  Run this on the Proxmox host (or any Docker host) to build the image,
#  create the reports directory, and install the biweekly cron job.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these paths to match your environment
# ---------------------------------------------------------------------------
MEDIA_PATH="/mnt/HDD2/shared_media/media"
REPORT_PATH="/mnt/HDD2/shared_media/reports"
IMAGE_NAME="arrstack-media-scanner:latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 1. Build the Docker image
# ---------------------------------------------------------------------------
echo "[1/3] Building Docker image: ${IMAGE_NAME} ..."
docker build -t "${IMAGE_NAME}" "${SCRIPT_DIR}"
echo "      Done."

# ---------------------------------------------------------------------------
# 2. Create the reports output directory
# ---------------------------------------------------------------------------
echo "[2/3] Ensuring reports directory exists: ${REPORT_PATH}"
mkdir -p "${REPORT_PATH}"
echo "      Done."

# ---------------------------------------------------------------------------
# 3. Install biweekly cron job (1st and 15th of each month at 04:00)
# ---------------------------------------------------------------------------
CRON_CMD="0 4 1,15 * * docker run --rm -v ${MEDIA_PATH}:/mnt/media:ro -v ${REPORT_PATH}:/mnt/reports ${IMAGE_NAME} >> /var/log/arrstack-media-scanner.log 2>&1"
CRON_MARKER="# arrstack-media-scanner"

echo "[3/3] Installing cron job..."
( crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" ; echo "${CRON_MARKER}" ; echo "${CRON_CMD}" ) | crontab -
echo "      Cron job installed."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=========================================================="
echo "  Setup complete!"
echo ""
echo "  Run a scan now:"
echo "    docker run --rm \"
echo "      -v ${MEDIA_PATH}:/mnt/media:ro \"
echo "      -v ${REPORT_PATH}:/mnt/reports \"
echo "      ${IMAGE_NAME}"
echo ""
echo "  Reports will appear in: ${REPORT_PATH}/"
echo "=========================================================="
