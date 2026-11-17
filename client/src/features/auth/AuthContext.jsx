// src/features/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMe, useLogout } from '../../api/hooks.js';
import { useToast } from '../../components/ui/ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useMe();
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const user = isError ? null : data?.user || null;
  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';

  const wasAuthenticatedRef = useRef(false);
  const locationRef = useRef(location);
  locationRef.current = location;
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage('');
  }, []);

  useEffect(() => {
    if (user) {
      wasAuthenticatedRef.current = true;
    }
  }, [user]);

  // Handle mid-session 401 session expiration cleanly
  useEffect(() => {
    function handleSessionExpired() {
      if (!wasAuthenticatedRef.current) return;
      wasAuthenticatedRef.current = false;

      const returnTo =
        locationRef.current.pathname === '/login'
          ? null
          : {
              pathname: locationRef.current.pathname,
              search: locationRef.current.search,
            };

      setSessionExpiredMessage('Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.');
      toast.warning('Sesi Anda telah berakhir. Silakan login kembali.');
      navigate('/login', {
        state: { from: returnTo, sessionExpired: true },
        replace: true,
      });
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    }

    window.addEventListener('app:session-expired', handleSessionExpired);
    return () => window.removeEventListener('app:session-expired', handleSessionExpired);
  }, [queryClient, navigate, toast]);

  // Re-verify session if browser restores page from bfcache (Back button)
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) {
        queryClient.invalidateQueries({ queryKey: ['me'] });
        refetch();
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [queryClient, refetch]);

  async function logout() {
    wasAuthenticatedRef.current = false;
    setSessionExpiredMessage('');
    try {
      await logoutMutation.mutateAsync();
    } finally {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        isLoading,
        logout,
        sessionExpiredMessage,
        clearSessionExpiredMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
