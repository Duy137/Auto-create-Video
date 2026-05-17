import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../api/client';

export interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role: string;
  roles: string[];
  permissions: string[];
  is_active?: boolean;
  tier: 'starter' | 'pro' | 'studio';
  quota_used_month: number;
  quota_limit: number;
}

interface UpdateMePayload {
  display_name?: string | null;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, email: string, password: string) => Promise<User>;
  updateMe: (payload: UpdateMePayload) => Promise<User>;
  changePassword: (current_password: string, new_password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check session via cookies (sent automatically)
    api.get<User>('/auth/me')
      .then((userData) => {
        setUser(userData);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<any>('/auth/login', { username, password });
    // Browser sets cookies automatically
    setUser(data.user);
    return data.user as User;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const data = await api.post<any>('/auth/register', { username, email, password });
    // Browser sets cookies automatically
    setUser(data.user);
    return data.user as User;
  }, []);

  const updateMe = useCallback(async (payload: UpdateMePayload) => {
    const updated = await api.patch<User>('/auth/me', payload);
    setUser(updated);
    return updated;
  }, []);

  const changePassword = useCallback(async (current_password: string, new_password: string) => {
    await api.post('/auth/change-password', { current_password, new_password });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch (err) {
      console.warn('Logout failed on server', err);
    }
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    updateMe,
    changePassword,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider');
  }
  return context;
}
