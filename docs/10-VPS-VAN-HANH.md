# Vận hành trên VPS

| | |
|---|---|
| Máy chủ | VPS Ubuntu 24.04 – IP 36.50.27.37 (3 CPU, 3,8 GB RAM + swap 2 GB, 33 GB) |
| Phần mềm điều hành | https://dieuxe.vietnamexplore.vn |
| Cổng nhà xe đối tác | https://nhaxe.vietnamexplore.vn (tự mở /partner) |
| Mã nguồn | https://github.com/VietnamExplore/quanlyvantai (riêng tư), nhánh `main` |
| Thư mục trên VPS | `/opt/transfer` (bản sao Git của repo) |
| Cấu hình bí mật | `/opt/transfer/deploy/.env` – chỉ root đọc, **không** có trên GitHub |

DNS: bản ghi A `dieuxe`, `nhaxe` → 36.50.27.37, Cloudflare để **DNS only** (đám mây xám) – Caddy tự xin / gia hạn chứng chỉ HTTPS (Let's Encrypt).

## Cập nhật tự động

1. Sửa code trên máy văn phòng → `git push` lên nhánh `main`.
2. Trên VPS, `transfer-update.timer` chạy `deploy/update.sh` mỗi 2 phút: có bản mới thì
   **sao lưu CSDL** (`deploy/backups/pre-update/`, giữ 10 bản) → kéo code → build (lỗi mạng thì thử lại 3 lần,
   build hỏng vẫn giữ bản đang chạy) → chạy lại → kiểm tra API.
3. API tự áp dụng thay đổi cơ sở dữ liệu (Prisma migrate) khi khởi động.

Nhật ký: `tail -f /var/log/transfer-update.log`. Build lại tay: `/opt/transfer/deploy/update.sh --force`.

## Lệnh thường dùng (trên VPS)

```bash
cd /opt/transfer/deploy
docker compose ps                     # trạng thái
docker compose logs api --tail 100    # nhật ký API
docker compose logs web --tail 100    # nhật ký Caddy (HTTPS)
docker compose restart api            # khởi động lại API
```

## Sao lưu

- Hằng ngày: API tự sao lưu CSDL + file đính kèm vào `deploy/backups/` (cài ở trang Hệ thống, có thể đẩy lên Google Drive).
- Trước mỗi lần cập nhật: `deploy/backups/pre-update/db-*.dump`.
- Khôi phục một bản: `docker compose exec -T db pg_restore -U transfer -d transfer --clean --if-exists < backups/pre-update/db-….dump`

## Quay lại bản trước

```bash
cd /opt/transfer && git log --oneline -5      # chọn mã bản muốn quay lại
git revert <mã>  # nên làm trên máy văn phòng rồi push; VPS tự cập nhật
```

## Bảo mật

- Đăng nhập VPS bằng khóa SSH; root đã đổi mật khẩu. Tường lửa ufw chỉ mở 22, 80, 443; fail2ban chặn dò mật khẩu SSH.
- VPS chỉ có khóa **đọc** repo (Deploy key), không sửa được mã nguồn trên GitHub.
- CSDL không mở ra Internet.
