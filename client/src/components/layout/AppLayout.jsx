// src/components/layout/AppLayout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import './layout.css';

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-header">
          <div className="brand-mark">TT</div>
          <div className="brand-info">
            <h1 className="brand-title">Titik Temu</h1>
            <span className="brand-subtitle">POS & Kasir Kafe</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Menu utama">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>Dashboard</span>
          </NavLink>

          {isAdmin && (
            <>
              <div className="nav-divider" />
              <div className="nav-section-title">Administrasi</div>
              <NavLink
                to="/pengguna"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span>Kelola pengguna</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {user?.nama_lengkap ? user.nama_lengkap.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-meta">
              <span className="user-name">{user?.nama_lengkap || 'Pengguna'}</span>
              <span className="user-role-badge">
                {user?.role === 'admin' ? 'Administrator' : 'Kasir'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            title="Keluar dari sesi"
          >
            Keluar
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
