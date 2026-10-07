import { Platform, type ModalProps, type ViewStyle } from 'react-native';

/** Đang chạy trên iPad (iPadOS) */
export const isPad = Platform.OS === 'ios' && Platform.isPad;

/**
 * iPad xoay được mọi hướng: hộp thoại (Modal) phải khai báo đủ hướng,
 * nếu không iOS sẽ xoay ngược màn hình về dọc khi mở hộp thoại.
 */
export const MODAL_ORIENTATIONS: ModalProps['supportedOrientations'] = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

/** Bàn phím iPhone/iPad không tự đẩy nội dung lên như Android: dùng cho KeyboardAvoidingView */
export const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? ('padding' as const) : undefined;

/** Bề rộng tối đa của nội dung trên màn hình lớn (iPad): thẻ không bị kéo dãn hết bề ngang */
export const CONTENT_MAX_WIDTH = 820;

/** Khung nội dung căn giữa, không rộng quá CONTENT_MAX_WIDTH */
export const contentFrame: ViewStyle = { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' };

/** Bảng trượt từ dưới lên (nhập km, tạm ứng, thu tiền…): trên iPad gọn ở giữa thay vì kéo hết bề ngang */
export const sheetFrame: ViewStyle = { width: '100%', maxWidth: 640, alignSelf: 'center' };

/** Thuộc tính cho ScrollView có ô nhập: iOS tự cuộn để ô nhập không bị bàn phím che, kéo xuống để ẩn bàn phím số */
export const keyboardScroll = {
  automaticallyAdjustKeyboardInsets: true,
  keyboardDismissMode: 'interactive' as const,
  keyboardShouldPersistTaps: 'handled' as const,
};
