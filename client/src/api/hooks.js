// src/api/hooks.js
// TanStack Query hooks for all API calls

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

// ============================================================
// AUTH
// ============================================================
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// ============================================================
// USERS
// ============================================================
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }) => api.patch(`/users/${id}/reset-password`, { password }),
  });
}

function cleanParams(params) {
  if (!params) return undefined;
  const cleaned = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      cleaned[k] = v;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// ============================================================
// CATEGORIES
// ============================================================
export function useCategories(params) {
  const cleaned = cleanParams(params);
  return useQuery({
    queryKey: ['categories', cleaned],
    queryFn: () => api.get('/categories', cleaned),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/categories/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ============================================================
// PRODUCTS
// ============================================================
export function useProducts(params) {
  const cleaned = cleanParams(params);
  return useQuery({
    queryKey: ['products', cleaned],
    queryFn: () => api.get('/products', cleaned),
  });
}

export function useProduct(id) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => api.get(`/products/${id}`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/products/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateStok() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/products/${id}/stok`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock-history'] });
    },
  });
}

export function useProductStockHistory(productId) {
  return useQuery({
    queryKey: ['stock-history', productId],
    queryFn: () => api.get(`/products/${productId}/stok-history`),
    enabled: !!productId,
  });
}

// ============================================================
// VOUCHERS
// ============================================================
export function useValidateVoucher() {
  return useMutation({
    mutationFn: (data) => api.post('/vouchers/validate', data),
  });
}

// ============================================================
// ORDERS
// ============================================================
export function useOrders(params) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.get('/orders', params),
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get(`/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ============================================================
// DASHBOARD
// ============================================================
export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get('/dashboard/summary'),
    refetchInterval: 30 * 1000,
  });
}

export function useDashboardTrend(days = 7) {
  return useQuery({
    queryKey: ['dashboard', 'trend', days],
    queryFn: () => api.get('/dashboard/trend', { days }),
    refetchInterval: 30 * 1000,
  });
}

export function useDashboardRecent(limit = 8) {
  return useQuery({
    queryKey: ['dashboard', 'recent', limit],
    queryFn: () => api.get('/dashboard/recent', { limit }),
    refetchInterval: 30 * 1000,
  });
}

// ============================================================
// REPORTS
// ============================================================
export function useReportOrders(params) {
  return useQuery({
    queryKey: ['reports', 'orders', params],
    queryFn: () => api.get('/reports/orders', params),
    enabled: !!params,
  });
}

export function useReportSummary(params) {
  return useQuery({
    queryKey: ['reports', 'summary', params],
    queryFn: () => api.get('/reports/summary', params),
    enabled: !!params,
  });
}
