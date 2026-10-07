# App lái xe trên iPhone và iPad (iOS / iPadOS)

App lái xe (`apps/driver`) viết bằng Expo – React Native, **cùng một mã nguồn** cho Android, iPhone và iPad.
Mọi tính năng giống bản Android: nhận chuyến, các bước chạy chuyến, km, chi phí + ảnh hóa đơn, thu tiền khách,
xăng dầu, thu nhập, tạm ứng, bảng đón khách (tự xoay ngang), liên hệ khách qua Zalo/WhatsApp…, thông báo.

## Riêng cho iPhone / iPad (từ bản 1.4.0)

| Mục | Cách làm |
|---|---|
| iPad | Bật `supportsTablet`; iPad xoay được mọi hướng, chạy được chia đôi màn hình (Split View). Nội dung căn giữa, rộng tối đa 820px; bảng nhập (km, tạm ứng, thu tiền, liên hệ) gọn ở giữa |
| Bàn phím | iOS không tự đẩy màn hình lên như Android: các bảng nhập dùng `KeyboardAvoidingView`, trang có ô nhập tự cuộn để ô nhập không bị che; kéo xuống để ẩn bàn phím số |
| Hộp thoại | Mọi `Modal` khai báo đủ hướng xoay (`MODAL_ORIENTATIONS`) để iPad không bị xoay ngược khi mở hộp thoại |
| Bảng đón | iPhone: xoay ngang khi mở, trở về dọc khi đóng. iPad: xoay ngang khi mở, đóng thì trả lại tự xoay |
| Máy chủ `http://` | Cho phép kết nối máy chủ không có https (vd `http://192.168.1.217`) và hỏi quyền "Mạng cục bộ" lần đầu – lái xe bấm **Cho phép** |
| Nút Back | iPhone/iPad không có nút Back cứng: dùng nút ‹ trên đầu trang (như hiện tại) |

Mã dùng chung cho iOS nằm ở `apps/driver/src/platform.ts`.

## Điều kiện để cài lên iPhone / iPad

Apple **không cho cài file trực tiếp** như APK của Android. Cần:

1. **Tài khoản Apple Developer Program** (99 USD/năm) – đăng ký tại developer.apple.com bằng Apple ID của công ty
   (đăng ký doanh nghiệp cần mã số D-U-N-S; đăng ký cá nhân thì nhanh hơn).
2. Tài khoản **expo.dev** đang dùng để build APK (owner `vietnamexplore`). Máy Windows build được iOS vì EAS build trên máy Mac của Expo.

## Cách 1 – TestFlight (khuyên dùng)

Phát app cho tối đa 10.000 người qua ứng dụng TestFlight của Apple, không cần lấy mã máy, không đưa app lên App Store công khai.

```bash
cd apps/driver
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --latest
```

- Lần đầu EAS hỏi đăng nhập Apple ID → tự tạo chứng chỉ, provisioning profile, khóa đẩy thông báo (APNs) và app trên App Store Connect.
- Sau khi submit (Apple xử lý 10–30 phút): vào **App Store Connect → TestFlight**, thêm email lái xe vào nhóm "Internal / External testers".
- Lái xe cài app **TestFlight** từ App Store, mở thư mời → Cài đặt app "Lái Xe".
- Nhóm External lần đầu cần Apple duyệt bản thử (thường 1 ngày). Mỗi bản TestFlight dùng được 90 ngày, build bản mới trước khi hết hạn.

## Cách 2 – Cài trực tiếp (Ad Hoc, tối đa 100 máy/năm)

```bash
cd apps/driver
npx eas-cli@latest device:create      # gửi link cho từng lái xe mở trên iPhone/iPad để đăng ký máy
npx eas-cli@latest build -p ios --profile ios-test
```

Build xong EAS đưa link / mã QR, mở bằng Safari trên máy đã đăng ký để cài. Thêm máy mới phải build lại.
iOS 16 trở lên: lái xe phải bật **Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển** một lần.

## Mỗi lần ra bản mới

- Tăng `expo.version` (vd 1.4.0 → 1.5.0) trong `apps/driver/app.json`.
- Tăng `ios.buildNumber` ("1" → "2"…) – App Store Connect không nhận lại số đã dùng. Android tăng `android.versionCode`.

## Thông báo đẩy

Trên iPhone thông báo đẩy đi qua APNs của Apple; EAS tự tạo khóa APNs ở lần build đầu.
Máy chủ vẫn gửi qua Expo Push như Android, không phải sửa gì. Lái xe bấm **Cho phép** khi app hỏi quyền thông báo.

## Lưu ý khi đưa lên App Store công khai (nếu sau này muốn)

App chỉ dùng nội bộ nên TestFlight là đủ. Nếu đưa lên App Store, Apple yêu cầu tài khoản đăng nhập thử cho người duyệt,
và nên chuyển máy chủ sang https (VPS ở bước 8) để bỏ quyền kết nối `http://`.
