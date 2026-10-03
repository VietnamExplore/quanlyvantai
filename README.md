# Phần mềm Quản lý Vận tải Hành khách

Tài liệu thiết kế nằm trong thư mục [docs/](docs/).

## Chạy trên máy phát triển

Yêu cầu: Node.js 22 trở lên, Docker Desktop đang chạy.

```bash
npm install                                   # cài thư viện (lần đầu)
copy apps\api\.env.example apps\api\.env      # tạo file cấu hình (lần đầu)
npm run db:up                                 # bật PostgreSQL
npm run db:migrate                            # tạo / cập nhật bảng
npm run db:seed                               # tạo loại xe + tài khoản admin (lần đầu)
npm run dev:api                               # API:  http://localhost:3000/api
npm run dev -w web                            # Web:  http://localhost:5173
```

Tài khoản admin ban đầu lấy theo `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` trong `apps/api/.env`.
Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/api` | Backend NestJS + Prisma (PostgreSQL) |
| `apps/web` | Web quản trị React + Ant Design |
| `apps/driver` | App lái xe (Expo), sẽ làm ở Bước 5 |
| `docs` | Tài liệu thiết kế từng bước |
