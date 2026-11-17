// src/components/layout/AppLayout.jsx
import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import './layout.css';

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <div className="brand-mark">TT</div>
          <span className="brand-title">Titik Temu</span>
        </div>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-sidebar-nav"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? 'Tutup' : 'Menu'}
        </button>
      </header>

      {mobileMenuOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar-nav"
        className={`app-sidebar ${mobileMenuOpen ? 'open' : ''}`}
      >
        <div className="brand-header">
          <div className="brand-mark">TT</div>
          <div className="brand-info">
            <h1 className="brand-title">Titik Temu</h1>
            <span className="brand-subtitle">POS &amp; Kasir Kafe</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Menu utama">
          <NavLink
            to="/dashboard"
            onClick={closeMenu}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/transaksi"
            onClick={closeMenu}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>Transaksi baru</span>
          </NavLink>

          <NavLink
            to="/riwayat"
            onClick={closeMenu}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>Riwayat pesanan</span>
          </NavLink>

          <NavLink
            to="/menu"
            onClick={closeMenu}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>{isAdmin ? 'Kelola menu' : 'Daftar menu'}</span>
          </NavLink>

          {isAdmin && (
            <>
              <div className="nav-divider" />
              <div className="nav-section-title">Administrasi</div>
              <NavLink
                to="/pengguna"
                onClick={closeMenu}
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
