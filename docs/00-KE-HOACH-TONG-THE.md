# Phần mềm Quản lý Vận tải Hành khách — Kế hoạch tổng thể

## 1. Quyết định đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| Ngôn ngữ | TypeScript cho toàn bộ hệ thống |
| Backend API | NestJS + Prisma ORM + PostgreSQL |
| Web quản trị (văn phòng, điều phối) | React + Vite + Ant Design (giao diện tiếng Việt) |
| App tài xế | React Native (Expo), chạy cả Android và iOS |
| Realtime | Socket.IO: bảng điều phối cập nhật tức thì |
| Thông báo đẩy | Expo Push (FCM cho Android, APNs cho iOS) |
| Triển khai | VPS/Cloud, Docker Compose, Nginx, HTTPS |
| Website công ty (PHP) | Giữ nguyên, kết nối với hệ thống mới qua REST API |

## 2. Kiến trúc

```
 Website công ty (PHP/WordPress) ──┐  form đặt xe gọi API
                                   ▼
 Web quản trị (React) ──REST/WS──► API (NestJS) ──► PostgreSQL
                                   ▲    │
 App tài xế (Expo) ────REST/WS─────┘    └──► Push (FCM/APNs), Zalo/SMS (sau)
```

## 3. Cấu trúc mã nguồn (monorepo, pnpm workspaces)

```
D:\TRANSFER
├── apps/
│   ├── api/       # NestJS backend
│   ├── web/       # React web quản trị
│   └── driver/    # Expo app tài xế
├── packages/
│   └── shared/    # Kiểu dữ liệu, enum trạng thái, schema validate dùng chung
├── docs/          # Tài liệu thiết kế từng bước
└── docker-compose.yml
```

## 4. Luồng nghiệp vụ trung tâm: vòng đời một chuyến

```
Booking:  NHAP → BAO_GIA → XAC_NHAN → HOAN_THANH | HUY
Chuyến:   CHO_DIEU → DA_GAN → TAI_XE_NHAN → DANG_DEN_DON → DA_DON_KHACH → HOAN_THANH
                       │            │
                       └─ TAI_XE_TU_CHOI → quay lại CHO_DIEU
          (HUY: hủy được ở mọi bước trước HOAN_THANH)
```

Một booking có thể gồm nhiều chuyến (ví dụ: tour 3 ngày, hoặc đón sân bay kèm tiễn sân bay).

## 5. Lộ trình từng bước

| Bước | Nội dung | Kết quả |
|---|---|---|
| **0** | Cài môi trường, dựng khung monorepo, Docker PostgreSQL | Chạy được API, web và app trống |
| **1** | Đăng nhập, phân quyền (Admin, Sales, Điều phối, Kế toán, Tài xế) | Đăng nhập web và app |
| **2** | Danh mục: Xe, Tài xế, Loại xe, Địa điểm, Khách hàng/Đại lý | CRUD đầy đủ, nhắc hạn giấy tờ |
| **3** | Bảng giá + Booking + Báo giá | Tạo booking, tính giá, xuất báo giá |
| **4** | Điều phối: lịch timeline, gán xe/tài xế, kiểm tra trùng lịch | Bảng điều phối realtime |
| **5** | App tài xế: nhận/từ chối chuyến, cập nhật trạng thái, push, chụp chứng từ | Tài xế chạy chuyến trên điện thoại |
| **6** | Chi phí chuyến, thanh toán, công nợ | Lãi/lỗ theo chuyến |
| **7** | Báo cáo, dashboard | Doanh thu, hiệu suất xe và tài xế |
| **8** | Triển khai VPS; tích hợp form đặt xe trên website PHP | Chạy thật |
| Sau đó | GPS realtime, Zalo OA/SMS, hóa đơn điện tử, cổng đại lý | Mở rộng |

## 6. Nguyên tắc làm việc

- Mỗi bước có tài liệu ngắn `docs/NN-ten-buoc.md`: yêu cầu, thiết kế dữ liệu, màn hình.
- Xong mỗi bước: chạy thử, kiểm tra, rồi mới sang bước tiếp theo.
- Dùng Git từ đầu để theo dõi mọi thay đổi.
