import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { api, ApiError, currentArea, tokenStore } from './api';
import type { AuthUser, Role } from './types';
import { disableWebPush } from './webpush';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const OFFICE_ROLES: Role[] = ['ADMIN', 'DIEU_HANH', 'KINH_DOANH', 'KE_TOAN'];
/** Tài khoản chỉ là nhà xe đối tác (không kiêm vai trò văn phòng): chỉ dùng cổng /partner */
export const isPartnerOnly = (u: AuthUser | null) => !!u && u.roles.includes('NHA_XE') && !u.roles.some((r) => OFFICE_ROLES.includes(r));

/** Tài khoản nhà xe ở trang văn phòng: chuyển phiên sang cổng nhà xe rồi mở /partner (không đá phiên văn phòng ở tab khác) */
function moveToPartnerPortal(token: string) {
  tokenStore.set(token, 'partner');
  tokenStore.clear('office');
  window.location.replace('/partner');
}

/**
 * Bản cũ lưu phiên nhà xe chung khóa với văn phòng. Mở cổng nhà xe mà chưa có phiên riêng:
 * nếu phiên cũ là tài khoản nhà xe thì chuyển sang khóa của cổng nhà xe (không phải đăng nhập lại).
 */
async function migrateLegacyPartnerToken() {
  if (currentArea() !== 'partner' || tokenStore.get('partner')) return;
  const legacy = tokenStore.get('office');
  if (!legacy) return;
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${legacy}` } });
    if (!res.ok) return;
    if (isPartnerOnly((await res.json()) as AuthUser)) {
      tokenStore.set(legacy, 'partner');
      tokenStore.clear('office');
    }
  } catch {
    /* mất mạng: bỏ qua, người dùng đăng nhập lại */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Không kết nối được máy chủ khi mở trang (giữ phiên, cho bấm thử lại)
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Chỉ đăng xuất khi máy chủ trả lời "chưa đăng nhập" (401). Máy chủ đang khởi động lại / mất mạng (502, 503…)
    // thì giữ phiên và thử lại mỗi 2 giây (tối đa ~30 giây) để người dùng không bị đăng xuất khi cập nhật phần mềm.
    let alive = true;
    let attempt = 0;
    const load = () =>
      api<AuthUser>('/auth/me')
        .then((u) => {
          if (!alive) return;
          if (currentArea() === 'office' && isPartnerOnly(u)) return moveToPartnerPortal(tokenStore.get()!);
          setUser(u);
          setLoading(false);
        })
        .catch((e) => {
          if (!alive) return;
          if (e instanceof ApiError && e.status === 401) {
            tokenStore.clear();
            setLoading(false);
          } else if (++attempt < 15) {
            setTimeout(load, 2000);
          } else {
            setLoading(false);
            setOffline(true);
          }
        });
    void migrateLegacyPartnerToken().then(() => {
      if (!alive) return;
      if (tokenStore.get()) load();
      else setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    // Tài khoản nhà xe đăng nhập ở trang văn phòng: chuyển sang cổng nhà xe (phiên riêng)
    if (currentArea() === 'office' && isPartnerOnly(res.user)) return moveToPartnerPortal(res.accessToken);
    tokenStore.set(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    // Máy này thôi nhận thông báo đẩy của tài khoản (gọi trước khi xóa phiên đăng nhập)
    await disableWebPush();
    tokenStore.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r)), [user]);

  if (offline) {
    return (
      <Result
        status="warning"
        title="Chưa kết nối được máy chủ"
        subTitle="Máy chủ có thể đang khởi động lại hoặc mạng đang gián đoạn. Phiên đăng nhập của bạn vẫn được giữ."
        extra={
          <Button
            type="primary"
            onClick={() => {
              setOffline(false);
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            Thử lại
          </Button>
        }
      />
    );
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
