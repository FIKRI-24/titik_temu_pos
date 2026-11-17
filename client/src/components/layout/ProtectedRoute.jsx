// src/components/layout/ProtectedRoute.jsx
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';

export function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="loading-screen" role="status" aria-live="polite">
        <div className="loading-spinner" />
        <p>Memeriksa sesi...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="forbidden-screen forbidden-inline" role="alert" aria-labelledby="forbidden-title">
        <div className="forbidden-content">
          <p className="forbidden-code">403</p>
          <h1 id="forbidden-title">Tidak punya akses</h1>
          <p className="page-subtitle">Halaman ini hanya tersedia untuk administrator.</p>
          <Link to="/dashboard" className="forbidden-link">
            Kembali ke dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
