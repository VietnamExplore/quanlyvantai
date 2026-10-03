import { storage } from './storage';

const SERVER_KEY = 'server_url';
const TOKEN_KEY = 'access_token';

let serverUrl: string | null = null;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Chuẩn hóa địa chỉ máy chủ người dùng nhập: thêm https://, bỏ dấu / và /api ở cuối */
export function normalizeServer(input: string) {
  let s = input.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export async function loadSession() {
  serverUrl = await storage.get(SERVER_KEY);
  token = await storage.get(TOKEN_KEY);
  return { serverUrl, token };
}

export async function setServer(url: string) {
  serverUrl = normalizeServer(url);
  await storage.set(SERVER_KEY, serverUrl);
  return serverUrl;
}

export const getServer = () => serverUrl;

export async function setToken(t: string | null) {
  token = t;
  if (t) await storage.set(TOKEN_KEY, t);
  else await storage.remove(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!serverUrl) throw new ApiError(0, 'Chưa nhập địa chỉ máy chủ');
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    res = await fetch(`${serverUrl}/api${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng điện thoại hoặc địa chỉ máy chủ.');
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') {
    await setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? `Lỗi máy chủ (${res.status})`);
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
