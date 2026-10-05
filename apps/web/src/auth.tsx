import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { api, ApiError, tokenStore } from './api';
import type { AuthUser, Role } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Không kết nối được máy chủ khi mở trang (giữ phiên, cho bấm thử lại)
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    // Chỉ đăng xuất khi máy chủ trả lời "chưa đăng nhập" (401). Máy chủ đang khởi động lại / mất mạng (502, 503…)
    // thì giữ phiên và thử lại mỗi 2 giây (tối đa ~30 giây) để người dùng không bị đăng xuất khi cập nhật phần mềm.
    let alive = true;
    let attempt = 0;
    const load = () =>
      api<AuthUser>('/auth/me')
        .then((u) => alive && (setUser(u), setLoading(false)))
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
    load();
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
    tokenStore.set(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
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
