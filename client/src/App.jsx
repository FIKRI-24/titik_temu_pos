// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';

import LoginPage from './features/auth/LoginPage.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import UsersPage from './features/users/UsersPage.jsx';
import MenuPage from './features/menu/MenuPage.jsx';

function ModulePendingNotice({ title, phase }) {
  return (
    <div style={{ maxWidth: 680, margin: '24px auto', background: '#fff', padding: 24, borderRadius: 'var(--radius-card)', border: '1px solid var(--color-gray-200)' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: 'var(--color-gray-600)' }}>
        Halaman ini sudah terlindungi oleh otentikasi dan kontrol akses. Fitur lengkap akan dikerjakan pada {phase}.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
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
          <Route path="menu" element={<MenuPage />} />
          <Route
            path="transaksi"
            element={<ModulePendingNotice title="Transaksi kasir" phase="Fase 3" />}
          />
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
    </AuthProvider>
  );
}
