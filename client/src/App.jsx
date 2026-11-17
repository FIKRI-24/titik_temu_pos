// src/App.jsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';

const LoginPage = lazy(() => import('./features/auth/LoginPage.jsx'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage.jsx'));
const POSPage = lazy(() => import('./features/pos/POSPage.jsx'));
const OrdersPage = lazy(() => import('./features/pos/OrdersPage.jsx'));
const MenuPage = lazy(() => import('./features/menu/MenuPage.jsx'));
const UsersPage = lazy(() => import('./features/users/UsersPage.jsx'));

function PageFallback() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" />
      <p>Memuat halaman...</p>
    </div>
  );
}

function ModulePendingNotice({ title, phase }) {
  return (
    <div
      style={{
        maxWidth: 680,
        margin: '24px auto',
        background: '#fff',
        padding: 24,
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--color-gray-200)',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: 'var(--color-gray-600)' }}>
        Halaman ini sudah terlindungi oleh otentikasi dan kontrol akses. Fitur lengkap akan
        dikerjakan pada {phase}.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="transaksi" element={<POSPage />} />
            <Route path="riwayat" element={<OrdersPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route
              path="pengguna"
              element={
                <ProtectedRoute requireAdmin>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="laporan"
              element={
                <ProtectedRoute requireAdmin>
                  <ModulePendingNotice title="Laporan penjualan" phase="Fase 5" />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
