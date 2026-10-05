import { App, Input, Typography } from 'antd';

/**
 * Sao chép chữ vào bộ nhớ tạm.
 * - HTTPS / localhost: dùng Clipboard API.
 * - Mở bằng địa chỉ IP nội bộ (http://192.168…): trình duyệt chặn Clipboard API → dùng cách cũ (ô chữ ẩn + lệnh copy),
 *   chạy được trên Chrome, Edge, Safari iPhone, Android.
 * Trả về false nếu không sao chép được.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* thử cách dự phòng */
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  // Không để bàn phím điện thoại bật lên / trang cuộn khi chọn chữ
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // Safari iPhone cần chọn theo vùng
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
    window.getSelection()?.removeAllRanges();
  }
}

/** Sao chép kèm thông báo; không sao chép được thì mở hộp chứa sẵn nội dung để người dùng tự sao chép */
export function useCopyText() {
  const { message, modal } = App.useApp();
  return async (text: string, successMsg: string) => {
    if (await copyText(text)) {
      message.success(successMsg);
      return;
    }
    modal.info({
      title: 'Sao chép nội dung',
      width: 560,
      content: (
        <>
          <Typography.Paragraph type="secondary">
            Trình duyệt không cho tự sao chép. Bấm vào ô dưới, chọn tất cả (máy tính: Ctrl+A; điện thoại: giữ ngón tay → Chọn tất cả) rồi Sao chép.
          </Typography.Paragraph>
          <Input.TextArea value={text} autoSize={{ minRows: 6, maxRows: 16 }} readOnly onFocus={(e) => e.target.select()} autoFocus />
        </>
      ),
      okText: 'Đóng',
    });
  };
}
