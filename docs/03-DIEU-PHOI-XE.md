# Bước 4: Điều phối xe

## 1. Mục tiêu
Điều hành xếp xe cho mọi chuyến của booking **đã xác nhận**:
- **Xe công ty** + lái xe công ty (lái xe nhận chuyến trên app ở Bước 5), hoặc
- **Nhà xe đối tác**: nhập biển số, tài xế, SĐT và **giá thuê thực tế** (thành chi phí của chuyến).

## 2. Màn hình "Điều xe"

```
┌ Chọn ngày ◀ 03/10 ▶ ─────────────────────────────────────────────┐
│ CHỜ ĐIỀU XE (5)      │  LỊCH XE CÔNG TY  0h ... 6h ... 12h ... 18h ... 24h │
│ ▸ 07:00 BK2610-0003  │  51B-123.45 (16 chỗ) ██BK..03██      ██BK..07██      │
│   Sân bay → KS A     │  51A-678.90 (7 chỗ)        ██BK..05██               │
│   Xe 16 chỗ · 12 khách│  ...                                                │
│ ▸ ...                │  XE ĐỐI TÁC: Nhà xe Phương Nam · 51F-xxx · BK..09   │
└──────────────────────┴─────────────────────────────────────────────────────┘
```
- Bấm vào một chuyến để mở **khung điều xe** bên phải.
- Tab **Danh sách chuyến** để xem dạng bảng, lọc theo ngày và trạng thái.

## 3. Khung điều xe
- **Xe công ty:** hệ thống gợi ý các xe đủ chỗ, kèm nhãn *Rảnh* hoặc *Trùng lịch*. Chọn xe thì tự điền lái xe mặc định, đổi được.
- **Xe đối tác:** chỉ hiện các nhà xe có cung cấp loại xe phù hợp. Nhập biển số, tài xế, SĐT, giá thuê, và xem ngay **lãi thực tế**.
- **Kiểm tra tự động trước khi lưu:**

| Kiểm tra | Mức |
|---|---|
| Xe không đủ chỗ cho số khách | ⛔ Chặn |
| Xe hoặc lái xe đã có chuyến khác trùng giờ | ⚠ Cảnh báo, phải xác nhận mới lưu |
| Xe đang bảo dưỡng / ngừng hoạt động | ⚠ Cảnh báo |
| Hạng bằng lái không phù hợp loại xe | ⚠ Cảnh báo |
| Lái xe nghỉ phép / nghỉ việc | ⚠ Cảnh báo |
| Đăng kiểm, bảo hiểm, phù hiệu hoặc bằng lái hết hạn trước ngày chạy | ⚠ Cảnh báo |

- **Sao chép lệnh điều xe:** tạo sẵn nội dung gồm giờ đón, điểm đón/trả, khách, SĐT, chuyến bay, ghi chú, để gửi Zalo cho tài xế hoặc nhà xe.

## 4. Trạng thái chuyến
```
CHỜ ĐIỀU → ĐÃ GÁN XE → TÀI XẾ ĐÃ NHẬN → ĐANG ĐẾN ĐÓN → ĐÃ ĐÓN KHÁCH → HOÀN THÀNH
              └── Hủy điều xe → quay lại CHỜ ĐIỀU
```
- Xe công ty: lái xe tự cập nhật trên app (Bước 5). Trước khi có app, Điều hành cập nhật thay.
- Xe đối tác: Điều hành cập nhật trên web.
- Mọi thay đổi được ghi **nhật ký** (ai, lúc nào).
- Khi tất cả chuyến của booking hoàn thành, booking **tự chuyển Hoàn thành**.

## 5. Chi phí
- Giao xe đối tác: **giá thuê đối tác** thay cho "chi phí dự kiến". Báo cáo lợi nhuận dùng con số này.
- Xe công ty: giữ chi phí dự kiến; chi phí thực (xăng, cầu đường…) nhập ở Bước 6.

## 6. Phân quyền
| | Admin | Điều hành | Kinh doanh | Kế toán |
|---|:-:|:-:|:-:|:-:|
| Xem lịch xe, danh sách chuyến | ✅ | ✅ | 👁 | 👁 |
| Điều xe, đổi xe, cập nhật trạng thái | ✅ | ✅ | | |
