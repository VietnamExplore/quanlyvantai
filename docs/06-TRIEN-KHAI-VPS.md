# Bước 8 – Đưa phần mềm lên VPS

Gói triển khai nằm trong thư mục `deploy/` và đã được chạy thử đầy đủ trên máy văn phòng:
build, khởi tạo dữ liệu, đăng nhập, tải file 100 MB, sao lưu, và chuyển dữ liệu thật sang.

| Thành phần | Vai trò |
|---|---|
| `db` | PostgreSQL 17. Không mở cổng ra Internet |
| `api` | API NestJS. Mỗi lần khởi động tự áp dụng thay đổi cơ sở dữ liệu (`prisma migrate deploy`). Tự sao lưu hằng ngày vào `deploy/backups/` và dọn nhật ký / thông báo cũ |
| `web` | Caddy: phục vụ giao diện web, chuyển `/api` sang API, **tự cấp và gia hạn HTTPS**, cho tải file tối đa 100 MB |

## 1. Chuẩn bị
- **VPS**: Ubuntu 24.04, tối thiểu 2 vCPU, 4 GB RAM, 40 GB SSD. Nên chọn máy đặt tại Việt Nam hoặc Singapore.
- **Tên miền**: tạo bản ghi **A**, ví dụ `xe.congtycuaban.vn`, trỏ về IP của VPS. Nên làm trước 15–30 phút để tên miền kịp nhận.

## 2. Cài Docker trên VPS
Đăng nhập VPS bằng SSH: `ssh root@IP-VPS`.
```bash
curl -fsSL https://get.docker.com | sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 3. Đưa mã nguồn lên VPS
Trên máy văn phòng (PowerShell, trong `D:\TRANSFER`):
```bash
git archive -o transfer.zip HEAD
scp transfer.zip root@IP-VPS:/opt/
```
Trên VPS:
```bash
apt-get install -y unzip && mkdir -p /opt/transfer && cd /opt/transfer && unzip -o ../transfer.zip
cd deploy && cp .env.example .env && nano .env
```
Điền các giá trị trong `.env`:
- `DOMAIN`: tên miền đã trỏ ở bước 1.
- `POSTGRES_PASSWORD`: tạo bằng lệnh `openssl rand -hex 24`.
- `JWT_SECRET`: tạo bằng lệnh `openssl rand -hex 48`.

## 4. Chạy
```bash
cd /opt/transfer/deploy
docker compose up -d --build
docker compose ps
```
Sau khoảng 1 phút, mở `https://tên-miền`.

## 5. Dữ liệu ban đầu: chọn MỘT trong hai cách
**A. Chuyển toàn bộ dữ liệu đang dùng ở máy văn phòng lên (khuyên dùng).**

Cách này chuyển cả tài khoản, booking, lương, file bảng đón…

Trên máy văn phòng (PowerShell, trong `D:\TRANSFER`):
```bash
docker compose exec -T db pg_dump -U transfer -Fc transfer -f /tmp/transfer.dump
docker compose cp db:/tmp/transfer.dump ./transfer.dump
tar czf uploads.tar.gz -C apps/api uploads
scp transfer.dump uploads.tar.gz root@IP-VPS:/opt/transfer/deploy/
```
Trên VPS:
```bash
cd /opt/transfer/deploy
docker compose stop api
docker compose cp transfer.dump db:/tmp/transfer.dump
docker compose exec db pg_restore -U transfer -d transfer --clean --if-exists --no-owner /tmp/transfer.dump
docker compose run --rm -v "$PWD:/in" --entrypoint sh api -c "tar xzf /in/uploads.tar.gz -C /data"
docker compose start api
```
Mật khẩu các tài khoản giữ nguyên như trên máy văn phòng.

**B. Bắt đầu với dữ liệu trống.** Đặt `SEED_ADMIN_PASSWORD` trong `.env`, rồi chạy:
```bash
docker compose exec api npx prisma db seed
```
Đăng nhập bằng `admin` và **đổi mật khẩu ngay**.

## 6. App lái xe
Ở màn hình đăng nhập của app, lái xe nhập địa chỉ máy chủ là `tên-miền`, ví dụ `xe.congtycuaban.vn`. Không cần cài lại APK.

Sau khi chạy trên VPS, có thể tắt Cloudflare Tunnel trên máy văn phòng.

## 7. Cập nhật phiên bản mới
Làm lại bước 3 (`git archive` → `scp` → `unzip -o`), **không** ghi đè `.env`. Sau đó chạy:
```bash
cd /opt/transfer/deploy && docker compose up -d --build
```
Thay đổi cơ sở dữ liệu được áp dụng tự động khi API khởi động.

## 8. Sao lưu và khôi phục
- Sao lưu tự động hằng ngày vào `/opt/transfer/deploy/backups/`: `db-….dump` (cơ sở dữ liệu) và `uploads-….tar.gz` (file tải lên).
- Cài giờ chạy, số bản giữ lại, sao lưu ngay, tải bản sao lưu: trên web, menu **Hệ thống → Sao lưu & dọn dẹp** (chỉ Admin).
- Sao lưu lỗi thì Admin nhận thông báo trên chuông.
- **Nên tải bản sao lưu về máy khác định kỳ**, ví dụ mỗi tuần, vì VPS hỏng thì bản sao lưu trên đó cũng mất:
  `scp root@IP-VPS:/opt/transfer/deploy/backups/db-*.dump .`
- Khôi phục: làm như mục 5A với file `db-….dump` và `uploads-….tar.gz` tương ứng.

## 9. Xử lý sự cố
- Xem log: `docker compose logs -f api` (hoặc `web`, `db`).
- Không có HTTPS: kiểm tra tên miền đã trỏ đúng IP và cổng 80, 443 đã mở. Xem `docker compose logs web`.
- Khởi động lại toàn bộ: `docker compose restart`.
