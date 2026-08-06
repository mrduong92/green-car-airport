#!/bin/bash
# Backup DB green_car_airport hằng ngày, giữ 14 bản gần nhất.
# Cài tại /usr/local/bin/backup-db.sh, chạy qua cron (xem /etc/cron.d/greenca-db-backup).
set -euo pipefail

BACKUP_DIR=/root/db-backups
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)
ENV_FILE=/var/www/green-car-airport/backend/.env

mkdir -p "$BACKUP_DIR"

DB_NAME=$(grep -E '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(grep -E '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2-)
DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

MYSQL_PWD="$DB_PASS" mysqldump \
  --user="$DB_USER" \
  --host=127.0.0.1 \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --no-tablespaces \
  "$DB_NAME" | gzip -9 > "$OUT"

chmod 600 "$OUT"

# Xoá bản cũ hơn KEEP_DAYS ngày
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -type f -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
