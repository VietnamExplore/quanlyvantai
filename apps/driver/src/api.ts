import { useEffect, useState } from 'react';
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

/**
 * Tải ảnh cần đăng nhập về thành data URI để hiện bằng <Image>
 * (<Image> kèm header đăng nhập không ổn định trên Android).
 */
export async function loadAuthImage(path: string): Promise<string> {
  if (!serverUrl) throw new ApiError(0, 'Chưa nhập địa chỉ máy chủ');
  let res: Response;
  try {
    res = await fetch(`${serverUrl}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'Không tải được ảnh. Kiểm tra mạng điện thoại.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message ?? `Không tải được ảnh (${res.status})`);
  }
  // Đọc dạng arrayBuffer rồi tự mã hóa base64 (tránh Blob của React Native: chậm và báo cảnh báo)
  const type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  return `data:${type};base64,${toBase64(new Uint8Array(await res.arrayBuffer()))}`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

/** Hook: tải ảnh cần đăng nhập (null = đang tải / không có) */
export function useAuthImage(path: string | null, reloadKey = 0) {
  const [state, setState] = useState<{ uri: string | null; loading: boolean; error: string | null }>({ uri: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ uri: null, loading: true, error: null });
    loadAuthImage(path)
      .then((uri) => alive && setState({ uri, loading: false, error: null }))
      .catch((e) => alive && setState({ uri: null, loading: false, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [path, reloadKey]);
  return state;
}

/** Gửi một file ảnh lên máy chủ (trường "file") */
export async function apiUpload<T = unknown>(path: string, file: { uri: string; name: string; type: string }): Promise<T> {
  if (!serverUrl) throw new ApiError(0, 'Chưa nhập địa chỉ máy chủ');
  const body = new FormData();
  // React Native gửi file theo dạng { uri, name, type }
  body.append('file', file as unknown as Blob);
  let res: Response;
  try {
    res = await fetch(`${serverUrl}/api${path}`, { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'Không gửi được ảnh. Kiểm tra mạng điện thoại.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, Array.isArray(data?.message) ? data.message.join('\n') : (data?.message ?? `Lỗi máy chủ (${res.status})`));
  return data as T;
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
