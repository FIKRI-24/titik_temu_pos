// src/features/auth/AuthContext.jsx
import { createContext, useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useMe, useLogout } from '../../api/hooks.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useMe();
  const logoutMutation = useLogout();
  const navigate = useNavigate();

  const user = isError ? null : data?.user || null;
  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';

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
    try {
      await logoutMutation.mutateAsync();
    } finally {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isAdmin, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
