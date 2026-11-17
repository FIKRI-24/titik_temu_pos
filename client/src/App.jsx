// src/App.jsx
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx';
import NotFoundPage from './components/layout/NotFoundPage.jsx';

const LoginPage = lazy(() => import('./features/auth/LoginPage.jsx'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage.jsx'));
const POSPage = lazy(() => import('./features/pos/POSPage.jsx'));
const OrdersPage = lazy(() => import('./features/pos/OrdersPage.jsx'));
const MenuPage = lazy(() => import('./features/menu/MenuPage.jsx'));
const UsersPage = lazy(() => import('./features/users/UsersPage.jsx'));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage.jsx'));

const ROUTE_TITLES = {
  '/login': 'Masuk — Titik Temu Kopi POS',
  '/dashboard': 'Dashboard — Titik Temu Kopi POS',
  '/transaksi': 'Kasir Pemesanan — Titik Temu Kopi POS',
  '/riwayat': 'Riwayat Transaksi — Titik Temu Kopi POS',
  '/menu': 'Kelola Menu & Stok — Titik Temu Kopi POS',
  '/pengguna': 'Kelola Pengguna — Titik Temu Kopi POS',
  '/laporan': 'Laporan Penjualan — Titik Temu Kopi POS',
};

function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = ROUTE_TITLES[pathname] || 'Halaman Tidak Ditemukan — Titik Temu Kopi POS';
  }, [pathname]);
  return null;
}

function PageFallback() {
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" />
      <p>Memuat halaman...</p>
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TitleManager />
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
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}
