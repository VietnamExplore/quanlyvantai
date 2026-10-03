# Bước 7 – Báo cáo chi tiết & xuất Excel

Menu **Báo cáo** (`/reports`). Chọn kỳ: Tháng này / Tháng trước / Quý này / Năm nay / Tùy chọn.

## Cách tính
- Theo **ngày đón khách**; chỉ chuyến không hủy của booking **Đã xác nhận / Hoàn thành** (giống trang Tổng quan).
- Doanh thu chuyến = thành tiền chuyến sau khi phân bổ giảm giá của booking theo tỷ lệ, chưa gồm VAT.
- Chi phí chuyến: xe đối tác = giá thuê nhà xe + chi phí phát sinh; xe công ty = tổng chi phí thực đã nhập, chưa có thì dùng chi phí dự kiến.
- Chuyến chưa có chi phí nào được cảnh báo (lợi nhuận đang tính cao hơn thực tế).
- Nhân viên kinh doanh (không kiêm Admin / Kế toán / Điều hành) chỉ thấy booking mình phụ trách, không có tab xe / lái xe.

## Các tab
| Tab | Nội dung |
|---|---|
| Chi tiết chuyến | Từng chuyến: booking, mã của khách, khách, dịch vụ, hành trình, xe / nhà xe, doanh thu, chi phí, lợi nhuận; lọc theo từ khóa, dịch vụ, xe công ty / nhà xe / chưa điều |
| Hiệu suất xe | Mỗi xe công ty: số chuyến, ngày hoạt động, tỷ lệ sử dụng (ngày có chuyến / số ngày trong kỳ), giờ chạy, DT/chuyến, lợi nhuận |
| Hiệu suất lái xe | Mỗi lái xe công ty: số chuyến, ngày làm việc, giờ chạy, số khách, chi phí lái xe tự nhập trên app – dùng đối chiếu tính lương |
| Nhà xe đối tác | Số chuyến, giá thuê nhà xe, doanh thu, lợi nhuận |
| Khách hàng / NV kinh doanh | Số booking, chuyến, doanh thu, lợi nhuận, biên lợi nhuận |
| Dịch vụ & loại xe | Doanh thu, số khách theo dịch vụ và loại xe |

## Xuất Excel
- Nút **Xuất Excel** tạo một file `.xlsx` gồm tất cả các tab (mỗi tab một sheet), có tiêu đề, cố định dòng tiêu đề, bộ lọc, định dạng tiền và dòng **Tổng cộng** bằng công thức SUM.
- Các nút xuất ở Công nợ khách hàng, Công nợ nhà xe, Sổ thu chi cũng xuất `.xlsx` cùng kiểu.
- API: `GET /api/reports/trips?from=YYYY-MM-DD&to=YYYY-MM-DD`. File Excel tạo ngay trên trình duyệt (thư viện exceljs, chỉ tải khi bấm xuất).
