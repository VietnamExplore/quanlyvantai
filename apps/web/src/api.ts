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
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

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
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
