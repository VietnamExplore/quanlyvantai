# Hợp đồng vận chuyển & lệnh vận chuyển (mục 4.3)

Căn cứ: Nghị định 158/2024/NĐ-CP (Điều 7: xe hợp đồng; Điều 17: nội dung tối thiểu hợp đồng), sửa đổi bởi NĐ 218/2026/NĐ-CP (hiệu lực 10/8/2026);
Thông tư 36/2024/TT-BGTVT (Phụ lục IV: Lệnh vận chuyển, Phụ lục V: Danh sách hành khách).

## Hợp đồng vận chuyển (theo booking)
- Booking → nút **Hợp đồng vận chuyển**: bên thuê (tên, CCCD / MST, địa chỉ, SĐT, người đại diện), ngày ký, cự ly từng chuyến (km), phương thức thanh toán, điều khoản bổ sung.
- Số hợp đồng tự cấp `0001/2026/HĐVC` (đánh lại từ 1 mỗi năm), không đổi khi sửa.
- Bản in: Điều 1–3 tự lấy từ booking (hành trình, thời gian, số khách, xe, giá trị + bằng chữ), Điều 4 trở đi từ Cài đặt (có mẫu sẵn); trang sau là **Danh sách hành khách** đúng mẫu Phụ lục V (chưa nhập danh sách thì để dòng trống ghi tay).
- Bản điện tử `/e/hd/<mã>` (QR trên bản in): không cần đăng nhập; lái xe xuất trình khi kiểm tra; bên thuê nhập họ tên + tick đồng ý để xác nhận (lưu thời điểm, IP). Sửa nội dung sau khi khách xác nhận → khách phải xác nhận lại (đổi km thì không).
- Lượt **xe ghép** không đưa vào hợp đồng thuê xe (xe hợp đồng bị cấm bán vé / gom khách lẻ).
- Hợp đồng không xóa được cùng booking (lưu ≥ 3 năm).
- App lái xe: nút **Hợp đồng** ở chi tiết chuyến; cổng nhà xe: nút **Hợp đồng** + link trong nội dung chép gửi lái xe.

## Lệnh vận chuyển (mẫu Phụ lục IV)
- Chuyến thuê xe: Điều xe → chi tiết chuyến → **Lệnh vận chuyển** (`/transport-orders/trip/:id`), số lệnh = mã booking + số chuyến, kèm số + QR hợp đồng.
- Chuyến xe ghép: Xe ghép → chuyến → **Lệnh vận chuyển** (`/transport-orders/run/:id`), số lệnh `XGyymmdd-<id>`, tuyến, mã tuyến, các điểm dừng, số khách đã xác nhận.

## Cài đặt → Hợp đồng vận chuyển
Người đại diện, chức vụ, CCCD, số giấy phép kinh doanh vận tải, số điện thoại tiếp nhận phản ánh (bắt buộc trên hợp đồng), điều khoản hợp đồng.

## Lưu ý
- QR / link hợp đồng điện tử dùng địa chỉ đang mở phần mềm: khi chạy trong mạng nội bộ thì chỉ mở được trong mạng đó; muốn CSGT / khách quét được từ bên ngoài phải đưa phần mềm lên VPS có tên miền.
- Từ 01/01/2028 (NĐ 218/2026): xe hợp đồng phải chia sẻ dữ liệu hợp đồng với Bộ Công an trước mỗi chuyến – cần kết nối khi có hướng dẫn kỹ thuật.
