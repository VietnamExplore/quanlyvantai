#!/usr/bin/env bash
# Tự cập nhật trên VPS từ GitHub (chạy bởi systemd timer transfer-update.timer mỗi 2 phút):
# có bản mới trên nhánh main → sao lưu CSDL → kéo code → build lại → chạy lại.
#   Chạy tay:            /opt/transfer/deploy/update.sh
#   Build lại dù không có bản mới:  /opt/transfer/deploy/update.sh --force
#   Xem nhật ký:         tail -f /var/log/transfer-update.log
set -euo pipefail
ROOT=/opt/transfer
BRANCH=${BRANCH:-main}
cd "$ROOT"

# Chỉ một lần cập nhật chạy cùng lúc
exec 9>/var/lock/transfer-update.lock
flock -n 9 || exit 0

log() { echo "$(date '+%F %T') $*"; }

if git remote get-url origin >/dev/null 2>&1; then
  git fetch -q origin "$BRANCH"
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then exit 0; fi
  log "Có bản mới: ${LOCAL:0:7} → ${REMOTE:0:7}"
else
  [ "${1:-}" = "--force" ] || exit 0
  REMOTE=""
  log "Chưa nối GitHub: build lại mã nguồn hiện có"
fi

cd "$ROOT/deploy"
# Sao lưu CSDL trước khi cập nhật (giữ 10 bản gần nhất)
mkdir -p backups/pre-update
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  F="backups/pre-update/db-$(date +%Y%m%d-%H%M%S).dump"
  docker compose exec -T db pg_dump -U transfer -Fc transfer > "$F"
  log "Đã sao lưu CSDL: $F ($(du -h "$F" | cut -f1))"
  ls -1t backups/pre-update/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

if [ -n "$REMOTE" ]; then
  cd "$ROOT"
  git reset -q --hard "origin/$BRANCH"
  cd "$ROOT/deploy"
fi

# Build (mạng tải thư viện đôi khi chập chờn: thử lại tối đa 3 lần), rồi chạy lại.
# Build lỗi thì bản đang chạy vẫn giữ nguyên.
for attempt in 1 2 3; do
  if docker compose build > /tmp/transfer-build.log 2>&1; then break; fi
  if [ "$attempt" = 3 ]; then
    log "LỖI: build không được sau 3 lần – bản cũ vẫn đang chạy. Chi tiết: /tmp/transfer-build.log"
    tail -20 /tmp/transfer-build.log
    exit 1
  fi
  log "Build lỗi lần $attempt, thử lại sau 30 giây"
  sleep 30
done
# API tự áp dụng thay đổi CSDL khi khởi động
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

# Kiểm tra API đã chạy (tối đa 3 phút)
for i in $(seq 1 36); do
  if docker compose exec -T api node -e "fetch('http://localhost:3000/api/auth/me').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    log "Xong: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'mã nguồn hiện có') – API đang chạy"
    exit 0
  fi
  sleep 5
done
log "LỖI: API chưa chạy sau khi cập nhật – xem: docker compose -f $ROOT/deploy/docker-compose.yml logs api --tail 100"
exit 1
