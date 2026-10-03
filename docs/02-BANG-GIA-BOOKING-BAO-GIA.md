# Bước 3: Bảng giá, Booking & Báo giá

Thiết kế theo mô hình phổ biến của các công ty lữ hành. Sẽ chỉnh dần theo thực tế công ty sau khi dùng thử.

## 1. Loại dịch vụ

| Mã | Dịch vụ | Cách tính giá gợi ý |
|---|---|---|
| `DON_TIEN_SAN_BAY` | Đón / tiễn sân bay | Giá theo tuyến |
| `THEO_TUYEN` | Đưa đón theo tuyến (A → B) | Giá theo tuyến |
| `CITY_TOUR` | City tour (nửa ngày / cả ngày) | Giá theo tuyến (gói city tour) |
| `THUE_THEO_NGAY` | Thuê xe theo ngày | Giá thuê ngày theo loại xe |
| `TOUR_NHIEU_NGAY` | Tour nhiều ngày | Giá thuê ngày × số ngày + lưu đêm tài xế |

## 2. Ba loại bảng giá

### 2.1. Giá theo tuyến
Mỗi tuyến (ví dụ "Sân bay Tân Sơn Nhất → Trung tâm Q1") có **một giá bán cho mỗi loại xe**, kèm **giá mua đối tác tham khảo** để biết lãi ngay khi báo giá.

| Tuyến | Xe 4 | Xe 7 | Xe 16 | Xe 29 (thuê ngoài) |
|---|---|---|---|---|
| Sân bay → Q1 | 300.000 | 350.000 | 600.000 | 1.200.000 (mua 1.000.000) |

### 2.2. Giá thuê theo ngày (theo loại xe)
| Trường | Ví dụ xe 16 chỗ |
|---|---|
| Giá 1 ngày (gói 10 giờ / 100 km) | 1.800.000 |
| Giá nửa ngày (gói 4 giờ / 50 km) | 1.100.000 |
| Vượt km | 15.000 đ/km |
| Vượt giờ | 120.000 đ/giờ |
| Lưu đêm tài xế (tour nhiều ngày) | 300.000 đ/đêm |

### 2.3. Phụ thu
| Phụ thu | Cách áp dụng |
|---|---|
| Ban đêm (22h–5h) | Tự động theo giờ đón, tính % giá |
| Lễ, Tết | Tự động khi ngày đón nằm trong danh sách ngày lễ, tính % giá |
| Thủ công | Ví dụ: cầu đường, bến bãi, đón thêm điểm. Nhân viên chọn tay khi báo giá |

## 3. Booking

- Một **booking** = một đơn của khách, gồm **nhiều chuyến**. Ví dụ đoàn 3 ngày: đón sân bay, city tour, tiễn sân bay.
- Mỗi chuyến chỉ **một xe**. Đoàn cần 2 xe thì tạo 2 chuyến (có nút "Nhân bản").
- Khi thêm chuyến, hệ thống **tự tính giá gợi ý**. Nhân viên **được sửa giá** và thêm/bớt dòng phụ thu.
- Tổng tiền = Tổng các chuyến − Giảm giá + VAT (nếu xuất hóa đơn).
- Mã booking tự sinh: `BK2610-0001` (năm, tháng, số thứ tự).

### Trạng thái booking
```
NHÁP → ĐÃ BÁO GIÁ → ĐÃ XÁC NHẬN → HOÀN THÀNH
  └──────────┴─────────────┴──→ HỦY (ghi lý do)
```
- **Đã xác nhận:** các chuyến được chuyển sang cho Điều hành xếp xe (Bước 4).
- Booking đã hoàn thành hoặc đã hủy thì không sửa được nữa.

## 4. Báo giá
- **In / lưu PDF:** trang báo giá có thông tin công ty, khách hàng, bảng chuyến và tổng tiền, in thẳng từ trình duyệt.
- **Sao chép gửi Zalo:** một nút tạo sẵn nội dung báo giá dạng chữ để dán vào Zalo hoặc email.
- Thông tin công ty (tên, địa chỉ, MST, tài khoản ngân hàng, ghi chú cuối báo giá) do Admin cài đặt.

## 5. Phân quyền
| Chức năng | Admin | Điều hành | Kinh doanh | Kế toán |
|---|:-:|:-:|:-:|:-:|
| Tạo / sửa booking, báo giá | ✅ | ✅ | ✅ | 👁 |
| Sửa bảng giá, phụ thu, ngày lễ | ✅ | 👁 | 👁 | ✅ |
| Thông tin công ty | ✅ | | | |
