import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authStatus, setAuthStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated' | 'error'
  const [authError, setAuthError] = useState(null);
  const [pending2fa, setPending2fa] = useState(null);

  const checkSession = useCallback(async () => {
    setAuthStatus('loading');
    setAuthError(null);
    try {
      const res = await api.auth.me({ timeout: 5000 });
      if (res && res.user && res.user.id) {
        setCurrentUser(res.user);
        setAuthStatus('authenticated');
      } else {
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
      }
    } catch (err) {
      setCurrentUser(null);
      if (err.status === 401 || err.status === 403) {
        setAuthStatus('unauthenticated');
      } else {
        setAuthStatus('error');
        setAuthError(err.message || 'Unable to connect to SmartPocket server.');
      }
    }
  }, []);

  useEffect(() => {
    checkSession();

    const handleUnauthorized = () => {
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
    };

    window.addEventListener('smartpocket:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('smartpocket:unauthorized', handleUnauthorized);
  }, [checkSession]);

  const login = async (email, password) => {
    const res = await api.auth.login({ email, password });
    if (res.requires2fa) {
      setPending2fa(res.tempToken);
      return { requires2fa: true };
    }
    setCurrentUser(res.user);
    setAuthStatus('authenticated');
    return { success: true, user: res.user };
  };

  const register = async (email, password, fullName) => {
    const res = await api.auth.register({ email, password, fullName });
    setCurrentUser(res.user);
    setAuthStatus('authenticated');
    return { success: true, user: res.user };
  };

  const loginDemo = async () => {
    return login('student@example.edu', 'Password123!');
  };

  const verify2fa = async (token) => {
    const res = await api.auth.verify2fa({ tempToken: pending2fa, token });
    setCurrentUser(res.user);
    setPending2fa(null);
    setAuthStatus('authenticated');
    return res;
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (_) {}
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setPending2fa(null);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      authStatus,
      authError,
      pending2fa,
      login,
      register,
      loginDemo,
      verify2fa,
      logout,
      retryAuth: checkSession,
      setCurrentUser
    }}>
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
