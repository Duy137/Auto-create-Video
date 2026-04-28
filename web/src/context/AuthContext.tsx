import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, setToken, clearToken, getToken } from '../api/client';

export interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.get<User>('/auth/me')
      .then((userData) => {
        setUser(userData);
      })
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<any>('/auth/login', { username, password });
    setToken(data.access_token);
    setUser(data.user);
    return data.user as User;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const data = await api.post<any>('/auth/register', { username, email, password });
    setToken(data.access_token);
    setUser(data.user);
    return data.user as User;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    register,
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
