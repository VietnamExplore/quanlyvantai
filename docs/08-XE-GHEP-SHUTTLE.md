# Xe ghép (shared shuttle bus)

Bán **từng chỗ ngồi** trên các tuyến bus của công ty, ghép nhiều khách lẻ / đoàn nhỏ vào một chuyến xe.
Tích hợp vào phần mềm hiện có: mỗi lượt khách đặt chỗ là **một chuyến trong booking** (dùng lại báo giá, thu tiền,
công nợ, báo cáo, app lái xe, cổng nhà xe), được **gắn vào một chuyến xe ghép**; văn phòng **điều xe một lần cho cả chuyến ghép**.

## Quyết định nghiệp vụ (chốt với công ty 09/10/2026)

| Mục | Cách làm |
|---|---|
| Lịch chạy | Giờ cố định theo tuyến (theo ngày trong tuần, có hiệu lực từ – đến); văn phòng vẫn tạo được chuyến thêm (tăng chuyến, ghép khách sân bay) |
| Điểm đón / trả | Điểm dừng cố định **và** khu vực đón tận khách sạn (khách ghi khách sạn cụ thể; khu vực có thể có phụ phí / ghế) |
| Giá vé | Theo tuyến: người lớn / trẻ em; giá riêng cho khách là đại lý; cộng phụ phí khu vực đón nếu có |
| Xe chạy | Xe + lái xe công ty, hoặc giao nhà xe đối tác với giá thuê cả chuyến |

## Dữ liệu

```
ShuttleRoute (tuyến xe ghép)  ── ShuttleStop (điểm dừng / khu vực đón, theo thứ tự, giờ đón lệch so với giờ xuất bến, phụ phí / ghế)
      │                        └─ ShuttleSchedule (giờ xuất bến cố định, ngày trong tuần, hiệu lực)
      └── ShuttleRun (chuyến xe ghép cụ thể: tuyến + giờ xuất bến + số ghế + xe / lái xe / nhà xe)
                └── BookingTrip (lượt đặt chỗ của một booking: số khách, trẻ em, điểm đón, điểm trả)
```

- Chuyến ghép theo lịch được **tự tạo khi cần** (mở trang Xe ghép hoặc chọn ngày khi nhập booking).
- **Số ghế đã đặt** = tổng khách của các lượt đặt chưa hủy (booking chưa hủy). Không cho đặt vượt số ghế.
- Trạng thái chuyến ghép: **Mở bán / Đóng bán / Hủy**. Tiến trình chạy theo từng lượt khách (lái xe bấm đón từng nhóm).

## Điều xe

- Điều một lần cho cả chuyến ghép: xe công ty + lái xe, hoặc nhà xe đối tác + giá thuê cả chuyến.
- Mọi lượt khách của chuyến tự nhận cùng xe / lái xe / nhà xe; khách đặt thêm sau khi đã điều cũng tự nhận.
- **Chi phí chuyến** (giá thuê nhà xe hoặc chi phí xe công ty dự kiến) **chia cho từng lượt khách theo số khách**
  để báo cáo lợi nhuận, công nợ nhà xe đúng; tự chia lại khi có khách đặt thêm / hủy.
- Lượt khách xe ghép **không hiện ở cột "Chờ điều"** của trang Điều xe và không điều riêng lẻ được (điều ở trang Xe ghép).
- Lịch xe vẫn thấy xe bận trong giờ chạy chuyến ghép (kiểm tra trùng lịch như cũ).

## Màn hình

1. **Danh mục → Tuyến xe ghép**: tuyến, giá vé, điểm dừng / khu vực đón, giờ chạy cố định.
2. **Xe ghép** (vận hành): chọn ngày → các chuyến theo tuyến, thanh ghế đã bán / còn trống; mở chuyến để
   điều xe, xem **danh sách khách theo điểm đón** (in / chép gửi Zalo cho lái xe), đóng / mở bán, hủy, hoàn thành; tạo chuyến thêm.
3. **Booking → Thêm chuyến** với dịch vụ "Xe ghép": chọn tuyến → ngày → giờ chạy (hiện ghế còn) → điểm đón (khách sạn nếu là khu vực)
   → điểm trả → người lớn / trẻ em → giá tự tính.

## Giai đoạn sau (chưa làm)

- App lái xe: màn hình gộp cả chuyến ghép (thứ tự đón, đánh dấu từng nhóm lên xe).
- Bán vé online trên website, ghép tự động khách sân bay theo khung giờ, sơ đồ ghế.
