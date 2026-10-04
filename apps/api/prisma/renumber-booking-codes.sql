-- Đánh lại mã booking theo mẫu VNECAR + YYMMDD (ngày đi, giờ VN) + "-" + số thứ tự.
-- Số thứ tự chạy liên tục trong năm của ngày đi (theo thứ tự tạo booking), sang năm mới đánh lại từ 1.
-- Ngày đi = giờ đón sớm nhất của booking; booking chưa có chuyến thì lấy ngày tạo.
WITH d AS (
  SELECT b.id,
         to_char((COALESCE(MIN(t."pickupTime"), b."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') AS ymd
  FROM "Booking" b
  LEFT JOIN "BookingTrip" t ON t."bookingId" = b.id
  GROUP BY b.id
),
n AS (
  SELECT id, 'VNECAR' || ymd || '-' || lpad(row_number() OVER (PARTITION BY left(ymd, 2) ORDER BY id)::text, 4, '0') AS code
  FROM d
)
UPDATE "Booking" b SET code = n.code FROM n WHERE n.id = b.id AND b.code IS DISTINCT FROM n.code
RETURNING b.id, b.code;
