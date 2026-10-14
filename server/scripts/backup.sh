#!/usr/bin/env bash
# Daily backup of the database and the uploaded photos. Keeps the last 14 days.
# Run by cron (see DEPLOY.md):  0 3 * * * /var/www/lale-gulleri/server/scripts/backup.sh
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lale-gulleri}"
STAMP="$(date +%Y-%m-%d_%H%M)"

# read DATABASE_URL from .env
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$SERVER_DIR/.env" | head -1 | cut -d= -f2-)"
mkdir -p "$BACKUP_DIR"

pg_dump --format=custom --no-owner "$DATABASE_URL" > "$BACKUP_DIR/db_$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$SERVER_DIR" uploads

find "$BACKUP_DIR" -type f -mtime +14 -delete
echo "Backup done: $BACKUP_DIR ($STAMP)"
