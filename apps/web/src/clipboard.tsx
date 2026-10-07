import { App, Input, Typography } from 'antd';

/**
 * Sao chép chữ vào bộ nhớ tạm.
 * - HTTPS / localhost: dùng Clipboard API.
 * - Mở bằng địa chỉ IP nội bộ (http://192.168…): trình duyệt chặn Clipboard API → dùng cách cũ (ô chữ ẩn + lệnh copy),
 *   chạy được trên Chrome, Edge, Safari iPhone, Android.
 * Trả về false nếu không sao chép được (khi đó không được báo "đã sao chép": bộ nhớ tạm vẫn còn nội dung cũ).
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
  // Ngăn kéo / hộp thoại antd giữ con trỏ bên trong nó: ô chữ đặt ngoài sẽ bị giành mất con trỏ, lệnh copy chép rỗng
  // → đặt ô chữ ngay trong ngăn / hộp thoại đang mở
  const host = (document.activeElement?.closest('.ant-drawer-content, .ant-modal-content, [role="dialog"]') as HTMLElement | null) ?? document.body;
  const ta = document.createElement('textarea');
  ta.value = text;
  // Không để bàn phím điện thoại bật lên / trang cuộn khi chọn chữ
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
  host.appendChild(ta);
  // Ghi thẳng nội dung khi trình duyệt chép, không phụ thuộc chữ đang được chọn
  let written = false;
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    written = true;
  };
  document.addEventListener('copy', onCopy, true);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // Safari iPhone cần chọn theo vùng
    const ok = document.execCommand('copy');
    const selected = document.activeElement === ta && ta.selectionEnd - ta.selectionStart === text.length;
    return ok && (written || selected);
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', onCopy, true);
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
