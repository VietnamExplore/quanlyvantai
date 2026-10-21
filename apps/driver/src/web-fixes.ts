import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Sửa riêng cho bản web (iPhone: app thêm vào Màn hình chính):
 * 1. Alert.alert của React Native trên web không hiện gì → mọi nút có hỏi xác nhận (Đăng xuất, Nhận chuyến, Hoàn thành…)
 *    không chạy. Thay bằng hộp thoại có sẵn của trình duyệt (OK / Hủy).
 * 2. Ô nhập: bỏ viền xanh / khối nền khi đang gõ, nền vàng / xanh khi Safari tự điền; bỏ vệt xám khi chạm.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b !== cancel);
    // Chỉ thông báo (0 – 1 nút): hiện rồi chạy nút đó
    if (!cancel && actions.length <= 1) {
      window.alert(text);
      actions[0]?.onPress?.();
      return;
    }
    // Một lựa chọn + Hủy: OK = lựa chọn đó
    if (actions.length === 1) {
      if (window.confirm(`${text}\n\nBấm OK để: ${actions[0].text}`)) actions[0].onPress?.();
      else cancel?.onPress?.();
      return;
    }
    // Nhiều lựa chọn: hỏi lần lượt từng lựa chọn
    for (const b of actions) {
      if (window.confirm(`${text}\n\nChọn: ${b.text}?`)) {
        b.onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };

  const css = `
    input, textarea, select { outline: none !important; box-shadow: none; -webkit-appearance: none; appearance: none; background-color: transparent; border-radius: 0; }
    input:focus, textarea:focus { outline: none !important; }
    input:-webkit-autofill, input:-webkit-autofill:focus, input:-webkit-autofill:hover {
      -webkit-box-shadow: 0 0 0 1000px transparent inset !important; box-shadow: 0 0 0 1000px transparent inset !important;
      -webkit-text-fill-color: #0f1b2d !important; transition: background-color 9999s ease-out 0s;
    }
    * { -webkit-tap-highlight-color: transparent; }
    html, body { overscroll-behavior: none; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
