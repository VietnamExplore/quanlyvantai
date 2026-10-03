/** Đổi các trường ngày dạng chuỗi "YYYY-MM-DD" sang Date; null giữ nguyên để xóa giá trị. */
export function withDates<T extends object>(dto: T, keys: (keyof T)[]): T {
  const out: any = { ...dto };
  for (const k of keys) {
    if (out[k] !== undefined) out[k] = out[k] ? new Date(out[k]) : null;
  }
  return out;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
