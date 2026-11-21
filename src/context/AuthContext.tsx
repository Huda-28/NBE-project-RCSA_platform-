import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthSession } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (employeeId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  resetPassword: (newPassword: string, oldPassword?: string) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  hasRole: (roles: string[], unitId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nbe_rcsa_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (token) {
      refreshUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        logout();
      }
    } catch {
      logout();
    }
  };

  const login = async (employeeId: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'فشل تسجيل الدخول.' };
      }

      localStorage.setItem('nbe_rcsa_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'تعذر الاتصال بالخادم.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('nbe_rcsa_token');
    setToken(null);
    setUser(null);
  };

  const resetPassword = async (newPassword: string, oldPassword?: string) => {
    if (!token) return { success: false, error: 'غير مصرح.' };
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ new_password: newPassword, old_password: oldPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'فشل تغيير كلمة المرور.' };
      }

      localStorage.setItem('nbe_rcsa_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: 'خطأ في الاتصال بالخادم.' };
    }
  };

  const hasRole = (roles: string[], unitId?: string): boolean => {
    if (!user) return false;
    const isGlobalAdmin = user.roles.some(r => r.role === 'RISK_ADMIN');
    if (isGlobalAdmin) return true;

    if (unitId) {
      return user.roles.some(r => r.unit_id === unitId && roles.includes(r.role));
    }
    return user.roles.some(r => roles.includes(r.role));
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, resetPassword, refreshUser, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
