#!/usr/bin/env bash
# Chạy trong container "backup": sao lưu mỗi ngày lúc 02:00 vào deploy/backups/
#   db-YYYYMMDD-HHMM.dump        (pg_dump dạng nén, khôi phục bằng pg_restore)
#   uploads-YYYYMMDD-HHMM.tar.gz (file bảng đón khách đã tải lên)
# Chạy sao lưu ngay:  docker compose exec backup bash /backup.sh now
set -euo pipefail

backup_once() {
  local ts
  ts=$(date +%Y%m%d-%H%M)
  pg_dump -Fc -f "/backups/db-$ts.dump.tmp" && mv "/backups/db-$ts.dump.tmp" "/backups/db-$ts.dump"
  tar czf "/backups/uploads-$ts.tar.gz" -C /data uploads
  find /backups -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  echo "$(date '+%F %T') Đã sao lưu: db-$ts.dump, uploads-$ts.tar.gz"
}

if [ "${1:-}" = "now" ]; then
  backup_once
  exit 0
fi

while true; do
  now=$(date +%s)
  next=$(date -d 'tomorrow 02:00' +%s)
  [ "$(date +%H)" -lt 2 ] && next=$(date -d 'today 02:00' +%s)
  echo "$(date '+%F %T') Lần sao lưu tiếp theo: $(date -d "@$next" '+%F %T')"
  sleep $((next - now))
  backup_once || echo "$(date '+%F %T') LỖI sao lưu"
done
