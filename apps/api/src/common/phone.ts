/** Số điện thoại chỉ còn chữ số, đầu +84 / 84 đổi về 0: "+84 912-345-678" → "0912345678" */
export function normalizePhone(input?: string | null) {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}
