# Bước 6: Chi phí chuyến, Thu chi, Công nợ

## 1. Chi phí thực tế của chuyến
- Mỗi chuyến có nhiều dòng chi phí: **loại chi phí** (danh mục, thêm mới được), số tiền, ngày chi, ghi chú.
- Danh mục mặc định: Xăng dầu, Cầu đường, Bến bãi / gửi xe, Ăn ở tài xế, Lương / tiền chuyến tài xế, Rửa xe, Khác.
- Ai nhập: Điều hành, Kế toán, Admin (trên web); **lái xe nhập chi phí chuyến của mình trên app**.
- **Chi phí của chuyến dùng cho báo cáo lợi nhuận:**
  - Xe đối tác: giá thuê đối tác + các chi phí phát sinh.
  - Xe công ty: tổng chi phí thực đã nhập; **chưa nhập dòng nào thì tạm dùng "chi phí dự kiến"**.

## 2. Thu tiền khách
- Mỗi booking có nhiều lần thu: số tiền, hình thức (tiền mặt / chuyển khoản / thẻ / khác), ngày thu, số chứng từ, ghi chú.
- Hoàn tiền: nhập số âm.
- Booking hiển thị **Tổng tiền · Đã thu · Còn phải thu**, kèm nhãn *Chưa thu / Thu một phần / Đã thu đủ*.
- "Đặt cọc" trên booking vẫn là **số tiền yêu cầu cọc** in trên báo giá; tiền thực nhận ghi ở phần Thu tiền.

## 3. Công nợ khách hàng
- Gom theo khách hàng / đại lý (khách lẻ gom theo tên + SĐT).
- Phải thu = tổng các booking đã xác nhận/hoàn thành − đã thu.
- **Hạn thanh toán** = ngày kết thúc chuyến cuối + *số ngày công nợ* của khách (khai báo ở danh mục Khách hàng, mặc định 0).
- Cảnh báo **quá hạn** và **vượt hạn mức công nợ**.

## 4. Công nợ nhà xe đối tác
- Phải trả = tổng giá thuê các chuyến đã giao cho nhà xe − đã thanh toán.
- Ghi nhận các lần **thanh toán cho nhà xe**, xem chi tiết từng chuyến để đối soát.

## 5. Sổ thu chi
- Liệt kê theo khoảng ngày: **Thu** (tiền khách), **Chi** (trả nhà xe, chi phí chuyến). Có tổng thu, tổng chi, chênh lệch.

## 6. Phân quyền
| | Admin | Điều hành | Kinh doanh | Kế toán | Lái xe |
|---|:-:|:-:|:-:|:-:|:-:|
| Nhập chi phí chuyến | ✅ | ✅ | | ✅ | ✅ chuyến của mình |
| Thu tiền khách | ✅ | | ✅ | ✅ | |
| Xóa phiếu thu / chi phí | ✅ | | | ✅ | |
| Thanh toán nhà xe | ✅ | | | ✅ | |
| Xem công nợ khách | ✅ | ✅ | 👁 khách của mình | ✅ | |
| Xem công nợ nhà xe, sổ thu chi | ✅ | ✅ | | ✅ | |
