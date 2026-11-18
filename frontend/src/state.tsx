import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export type Role = 'ADMINISTRATOR' | 'CHURCH_MANAGER' | 'CLASS_INSTRUCTOR' | 'WORSHIPER' | 'MEMBER';

export type SessionUser = {
  id: string;
  role: Role;
  username?: string;
  email?: string;
  mustChangePassword?: boolean;
  person?: { id: string; firstName: string; lastName: string } | null;
};

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (data: object) => Promise<{ email: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: async () => { throw new Error('Authentication is unavailable.'); },
  register: async () => { throw new Error('Registration is unavailable.'); },
  logout: () => undefined,
  refreshMe: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('church-token'));
  const [user, setUser]   = useState<SessionUser | null>(() => {
    const data = sessionStorage.getItem('church-user');
    return data ? JSON.parse(data) as SessionUser : null;
  });

  const accept = (response: { token: string; user: SessionUser }) => {
    sessionStorage.setItem('church-token', response.token);
    sessionStorage.setItem('church-user', JSON.stringify(response.user));
    setToken(response.token);
    setUser(response.user);
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    login: async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      accept(data);
      return data.user as SessionUser;
    },
    register: async payload => {
      const { data } = await api.post('/auth/register', payload);
      return { email: data.email as string };
    },
    logout: () => {
      sessionStorage.removeItem('church-token');
      sessionStorage.removeItem('church-user');
      setToken(null);
      setUser(null);
    },
    refreshMe: async () => {
      try {
        const { data } = await api.get('/auth/me');
        const updated: SessionUser = {
          id: data.user.id,
          role: data.user.role,
          username: data.user.username,
          email: data.user.email,
          mustChangePassword: data.user.mustChangePassword,
          person: data.user.person,
        };
        sessionStorage.setItem('church-user', JSON.stringify(updated));
        setUser(updated);
      } catch { /* token expired — stay logged out */ }
    },
  }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
