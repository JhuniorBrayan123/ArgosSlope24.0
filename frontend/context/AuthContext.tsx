'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: string;
  name: string;
  role: string;
  email: string;
  lastLoginAt?: string;
  avatar?: string;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string, remember: boolean) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: async () => false,
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const API_URL = process.env.NEXT_PUBLIC_API_URL 
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/auth` 
    : 'http://localhost:5001/api/auth';

  useEffect(() => {
    // Safety timeout: force loading off after 5s to prevent infinite loading
    const safetyTimer = setTimeout(() => setIsLoading(false), 5000);

    // Check session on mount
    const checkSession = async () => {
      try {
        const accessToken = localStorage.getItem('argos_access_token');
        if (accessToken) {
          try {
            const res = await fetch(`${API_URL}/me`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (res.ok) {
              const userData = await res.json();
              setUser({
                id: userData.id,
                name: userData.fullName,
                email: userData.email,
                role: userData.role,
                lastLoginAt: userData.lastLoginAt
              });
            } else {
              // Token might be expired, try to refresh
              await attemptRefresh();
            }
          } catch {
            clearSession();
          }
        } else {
          await attemptRefresh(); // Try refresh if no access token but refresh token exists
        }
      } catch {
        clearSession();
      } finally {
        clearTimeout(safetyTimer);
        setIsLoading(false);
      }
    };

    checkSession();

    return () => clearTimeout(safetyTimer);
  }, []);

  const attemptRefresh = async () => {
    const refreshToken = localStorage.getItem('argos_refresh_token');
    if (!refreshToken) {
      clearSession();
      return;
    }

    try {
      const res = await fetch(`${API_URL}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('argos_access_token', data.accessToken);
        localStorage.setItem('argos_refresh_token', data.refreshToken);
        setUser({
            id: data.user.id,
            name: data.user.fullName,
            email: data.user.email,
            role: data.user.role,
            lastLoginAt: data.user.lastLoginAt
        });
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
  }

  const PUBLIC_ROUTES = ['/login', '/register', '/recover'];

  useEffect(() => {
    if (!isLoading && !user && !PUBLIC_ROUTES.includes(pathname)) {
      router.replace('/login');
    }
  }, [user, isLoading, pathname, router]);

  const login = async (email: string, password: string, remember: boolean = true): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe: remember })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('argos_access_token', data.accessToken);
        if (remember) {
          localStorage.setItem('argos_refresh_token', data.refreshToken);
        } else {
          sessionStorage.setItem('argos_refresh_token', data.refreshToken); // Or keep it in memory
        }

        setUser({
          id: data.user.id,
          name: data.user.fullName,
          email: data.user.email,
          role: data.user.role,
          lastLoginAt: data.user.lastLoginAt
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('argos_refresh_token') || sessionStorage.getItem('argos_refresh_token');
    if (refreshToken) {
      try {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
      } catch (e) {
        // Ignore error
      }
    }
    clearSession();
    router.push('/login');
  };

  const clearSession = () => {
    setUser(null);
    localStorage.removeItem('argos_access_token');
    localStorage.removeItem('argos_refresh_token');
    sessionStorage.removeItem('argos_refresh_token');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
