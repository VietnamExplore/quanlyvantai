# Bước 1–2: Phân quyền người dùng & Danh mục

## 1. Hiện trạng công ty

| Loại xe | Số xe | Khách tối đa |
|---|---|---|
| 4 chỗ | 1 | 3 |
| 7 chỗ | 2 | 6 |
| 16 chỗ | 4 | 15 |
| **Tổng xe công ty** | **7** | |
| Xe đối tác bên ngoài | không cố định | dùng khi thiếu xe, hoặc cần xe 29, 35, 45 chỗ |

**Hệ quả cho thiết kế:** công ty có ít xe nên xe đối tác chiếm tỷ trọng lớn. Vì vậy:
- Mỗi chuyến được giao cho **xe công ty + lái xe công ty**, hoặc giao cho **nhà xe đối tác**.
- Chuyến giao đối tác phải ghi được **giá mua vào** để tính lãi/lỗ, và ghi biển số, tên, số điện thoại tài xế đối tác để báo cho khách.
- Danh mục loại xe phải có cả các loại công ty không sở hữu (29, 35, 45 chỗ, limousine) để nhận booking đoàn lớn.

## 2. Vai trò & phân quyền

| Chức năng | Admin | Điều hành xe | Kinh doanh | Kế toán | Lái xe |
|---|:-:|:-:|:-:|:-:|:-:|
| Quản lý người dùng, cấu hình hệ thống | ✅ | | | | |
| Danh mục xe, lái xe, nhà xe đối tác | ✅ | ✅ | 👁 | 👁 | |
| Danh mục khách hàng / đại lý | ✅ | 👁 | ✅ | 👁 | |
| Bảng giá bán | ✅ | 👁 | 👁 | ✅ | |
| Giá mua vào từ đối tác | ✅ | ✅ | 👁 | ✅ | |
| Tạo / sửa booking, báo giá | ✅ | ✅ | ✅ | 👁 | |
| Điều phối: gán xe, lái xe, đối tác | ✅ | ✅ | 👁 | | |
| Nhận chuyến, cập nhật trạng thái (app) | | | | | ✅ chuyến của mình |
| Nhập chi phí chuyến (xăng, cầu đường…) | ✅ | ✅ | | ✅ | ✅ chuyến của mình |
| Thu chi, công nợ, hóa đơn | ✅ | | 👁 | ✅ | |
| Báo cáo doanh thu, lãi/lỗ | ✅ | 👁 | 👁 khách của mình | ✅ | |

✅ toàn quyền · 👁 chỉ xem

- Web quản trị dành cho Admin, Điều hành xe, Kinh doanh và Kế toán.
- App điện thoại chỉ dành cho Lái xe.
- Một người có thể giữ nhiều vai trò, ví dụ vừa Điều hành vừa Kinh doanh.

## 3. Danh mục dữ liệu

### 3.1. Loại xe (`VehicleType`)
| Trường | Ghi chú |
|---|---|
| Mã, Tên | `XE4`: Xe 4 chỗ; `XE7`; `XE16`; `XE29`; `XE45`; `LIMO9`… |
| Số chỗ | Gồm cả ghế lái |
| Số khách tối đa | Dùng để gợi ý loại xe khi nhận booking |
| Hạng bằng lái phù hợp | Admin tự cấu hình theo luật hiện hành. Khi điều phối, hệ thống cảnh báo nếu bằng lái của tài xế không phù hợp |

### 3.2. Xe (`Vehicle`)
| Trường | Ghi chú |
|---|---|
| Biển số | Duy nhất |
| Loại xe | Liên kết `VehicleType` |
| Hãng, đời xe, màu | Ví dụ: Ford Transit 2022, trắng |
| Sở hữu | `CONG_TY` / `DOI_TAC` (xe đối tác hay chạy thì lưu lại để lần sau chọn nhanh) |
| Nhà xe đối tác | Có khi Sở hữu = `DOI_TAC` |
| Trạng thái | `SAN_SANG` / `BAO_DUONG` / `NGUNG_HOAT_DONG` |
| Hạn đăng kiểm, hạn bảo hiểm, hạn phù hiệu | Hệ thống nhắc trước **30 ngày** |
| Số km hiện tại | Phục vụ bảo dưỡng định kỳ |
| Lái xe mặc định | Không bắt buộc |

### 3.3. Lái xe (`Driver`)
| Trường | Ghi chú |
|---|---|
| Họ tên, SĐT, CCCD | |
| Hạng bằng, số bằng, hạn bằng | Nhắc trước 30 ngày |
| Hạn khám sức khỏe | Nhắc trước 30 ngày |
| Thuộc | Công ty, hoặc một nhà xe đối tác |
| Trạng thái | `DANG_LAM` / `NGHI_PHEP` / `NGHI_VIEC` |
| Tài khoản app | Liên kết `User` có vai trò Lái xe |

### 3.4. Nhà xe đối tác (`Partner`)
| Trường | Ghi chú |
|---|---|
| Tên nhà xe, người liên hệ, SĐT, Zalo | |
| MST, địa chỉ, tài khoản ngân hàng | Phục vụ thanh toán và đối soát |
| Loại xe có thể cung cấp | Ví dụ: 16, 29, 45 chỗ |
| Đánh giá, ghi chú | Chất lượng, độ đúng giờ |

### 3.5. Khách hàng (`Customer`)
| Trường | Ghi chú |
|---|---|
| Loại | `KHACH_LE` / `DOANH_NGHIEP` / `DAI_LY` / `KHACH_SAN` |
| Tên, SĐT, email, MST, địa chỉ | |
| Nhân viên kinh doanh phụ trách | Dùng cho báo cáo doanh số |
| Hạn mức công nợ, chiết khấu | |

### 3.6. Địa điểm (`Location`)
| Trường | Ghi chú |
|---|---|
| Tên, loại | `SAN_BAY` / `KHACH_SAN` / `DIEM_THAM_QUAN` / `BEN_XE` / `KHAC` |
| Địa chỉ, tọa độ | Để tính km và mở bản đồ dẫn đường trên app lái xe |

### 3.7. Người dùng (`User`)
| Trường | Ghi chú |
|---|---|
| Tên đăng nhập (SĐT hoặc email), mật khẩu (mã hóa) | |
| Họ tên, vai trò (nhiều vai trò), trạng thái | |
| Liên kết Lái xe | Chỉ với tài khoản lái xe |

## 4. Màn hình Bước 1–2

**Web**
1. Đăng nhập, đổi mật khẩu
2. Quản lý người dùng (Admin)
3. Danh sách xe: lọc theo loại, sở hữu, trạng thái; tô đỏ giấy tờ sắp hết hạn
4. Danh sách lái xe
5. Nhà xe đối tác
6. Khách hàng / đại lý
7. Địa điểm
8. Trang chủ: khung cảnh báo giấy tờ sắp hết hạn

**App lái xe**
1. Đăng nhập bằng số điện thoại và mật khẩu
2. Trang cá nhân: thông tin, hạn bằng lái

## 5. Quyết định đã chốt (03/10/2026)

1. **Tài xế đối tác không dùng app.** Với chuyến giao đối tác, điều hành tự nhập biển số, tên và SĐT tài xế, đồng thời tự cập nhật trạng thái chuyến trên web. App chỉ dành cho lái xe công ty.
2. **Kinh doanh được xem giá mua vào** từ đối tác, để chủ động báo giá có lãi.
3. **Mỗi lái xe có xe mặc định nhưng đổi được.** Khi chọn xe công ty lúc điều phối, hệ thống tự điền lái xe mặc định; điều hành có thể đổi sang người khác.
