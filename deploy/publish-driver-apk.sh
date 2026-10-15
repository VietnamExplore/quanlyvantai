#!/usr/bin/env bash
# Đưa file cài app lái xe (APK) lên VPS để lái xe tải bằng link / mã QR (https://<tên miền>/tai-app).
# Chạy trên máy văn phòng:  bash deploy/publish-driver-apk.sh <file.apk> <phiên bản, vd 1.7.0> <versionCode, vd 17> ["ghi chú có gì mới"]
# (Admin cũng có thể tải file lên trong phần mềm: Danh mục → Lái xe → Mã QR tải app.)
set -euo pipefail
APK="$1"; VERSION="$2"; CODE="$3"; NOTES="${4:-}"
HOST="${VPS_HOST:-vne-vps}"
[ -f "$APK" ] || { echo "Không thấy file $APK"; exit 1; }
NAME="laixe-$(date +%s)-$VERSION.apk"
SIZE=$(stat -c %s "$APK")
JSON=$(NAME="$NAME" VERSION="$VERSION" CODE="$CODE" SIZE="$SIZE" NOTES="$NOTES" node -e '
  const e = process.env;
  process.stdout.write(JSON.stringify({ version: e.VERSION, versionCode: Number(e.CODE), file: e.NAME, size: Number(e.SIZE), notes: e.NOTES || null, updatedAt: new Date().toISOString() }));')
TMP=$(mktemp -d)
printf '%s' "$JSON" > "$TMP/release.json"
cat > "$TMP/publish.sh" <<EOS
set -euo pipefail
cd /opt/transfer/deploy
docker compose exec -T api mkdir -p /data/uploads/app < /dev/null
docker compose cp "/root/$NAME" "api:/data/uploads/app/$NAME" < /dev/null
docker compose exec -T -u root api chown node:node "/data/uploads/app/$NAME" < /dev/null 2>/dev/null || true
rm -f "/root/$NAME"
# Ghi cài đặt (tham số psql: không vướng ký tự đặc biệt trong ghi chú)
docker compose exec -T db psql -q -U transfer -d transfer -v "val=\$(cat /root/release.json)" <<'SQL'
INSERT INTO "Setting"(key, value) VALUES ('driverApp.release', :'val') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
rm -f /root/release.json /root/publish-apk.sh
# Chỉ giữ bản vừa đưa lên và bản ngay trước
docker compose exec -T api sh -c "cd /data/uploads/app && ls -1t *.apk | tail -n +3 | xargs -r rm -f; ls -l" < /dev/null
EOS
scp -q "$APK" "$HOST:/root/$NAME"
scp -q "$TMP/release.json" "$HOST:/root/release.json"
scp -q "$TMP/publish.sh" "$HOST:/root/publish-apk.sh"
rm -rf "$TMP"
ssh "$HOST" bash /root/publish-apk.sh
echo "Đã phát hành app lái xe $VERSION"
