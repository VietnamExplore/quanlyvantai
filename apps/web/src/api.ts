const TOKEN_KEY = 'transfer_token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* trình duyệt chặn lưu trữ: phải đăng nhập lại khi tải lại trang */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Nội dung lỗi đầy đủ từ máy chủ (ví dụ danh sách cảnh báo cần xác nhận) */
    public data?: { warnings?: string[]; needConfirm?: boolean },
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** Tải file về (kèm đăng nhập), trả về Blob để hiển thị / mở */
export async function apiBlob(path: string): Promise<Blob> {
  const token = tokenStore.get();
  const res = await fetch('/api' + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message ?? 'Không tải được file');
  }
  return res.blob();
}

/** Gửi một file lên máy chủ (multipart, trường "file") */
export async function apiUpload<T = unknown>(path: string, file: File): Promise<T> {
  const token = tokenStore.get();
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api' + path, { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? 'Không tải lên được file'));
  return data as T;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const url = new URL('/api' + path, window.location.origin);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const token = tokenStore.get();
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401 && path !== '/auth/login') {
    tokenStore.clear();
    window.dispatchEvent(new Event('auth:logout'));
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? 'Có lỗi xảy ra');
    throw new ApiError(res.status, msg, data ?? undefined);
  }
  return data as T;
}
