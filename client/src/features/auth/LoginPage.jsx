// src/features/auth/LoginPage.jsx
import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useLogin } from '../../api/hooks.js';
import { useAuth } from './AuthContext.jsx';
import './login.css';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const { isAuthenticated, isLoading, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLogin();

  const fromState = location.state?.from;
  const from =
    fromState?.pathname && fromState.pathname !== '/login'
      ? `${fromState.pathname}${fromState.search || ''}`
      : '/dashboard';
  const sessionExpired = Boolean(location.state?.sessionExpired || sessionExpiredMessage);

  if (!isLoading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('Username dan password harus diisi.');
      return;
    }

    try {
      await loginMutation.mutateAsync({ username: username.trim(), password });
      clearSessionExpiredMessage();
      navigate(from, { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Username atau password tidak sesuai.');
    }
  };

  return (
    <main className="login-stage">
      <div className="login-container">
        {/* Left Editorial Brand Showcase */}
        <section className="login-showcase" aria-label="Informasi Sistem">
          <div className="showcase-content">
            <div className="showcase-badge font-tms">
              <span className="badge-pulse" aria-hidden="true" />
              <span>Titik Temu Kopi · POS</span>
            </div>

            <h1 className="showcase-title font-tms">
              Sistem POS &amp; Pemesanan Kafe
            </h1>

            <p className="showcase-desc">
              Dirancang untuk kelancaran operasional kafe — pencatatan pesanan cepat, manajemen menu presisi, dan pemantauan omset real-time.
            </p>

            <div className="showcase-features">
              <div className="showcase-feature">
                <span className="feature-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                    <line x1="6" y1="1" x2="6" y2="4"></line>
                    <line x1="10" y1="1" x2="10" y2="4"></line>
                    <line x1="14" y1="1" x2="14" y2="4"></line>
                  </svg>
                </span>
                <div className="feature-text">
                  <strong>Kasir Cepat &amp; Struk Otomatis</strong>
                  <p>Dine-in &amp; takeaway, perhitungan pajak PB1 10%, dan multi-format cetak struk.</p>
                </div>
              </div>

              <div className="showcase-feature">
                <span className="feature-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </span>
                <div className="feature-text">
                  <strong>Laporan Penjualan Akurat</strong>
                  <p>Rekonsiliasi transaksi, tren penjualan, dan ekspor ringkasan CSV / PDF.</p>
                </div>
              </div>

              <div className="showcase-feature">
                <span className="feature-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <div className="feature-text">
                  <strong>Keamanan &amp; Hak Akses Sesi</strong>
                  <p>Proteksi cookie HttpOnly, isolasi peran kasir dan admin, serta rate-limiting.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="showcase-footer">
            <span className="font-tms">Titik Temu Kopi · POS</span>
            <span className="footer-dot">•</span>
            <span>Versi 1.0.0</span>
          </div>
        </section>

        {/* Right Form Card */}
        <section className="login-card-section" aria-label="Form Login">
          <div className="login-card">
            <div className="login-header">
              <div className="login-badge-pill font-tms">Titik Temu Kopi · POS</div>
              <h2 className="login-title font-tms">Masuk ke sistem kasir</h2>
              <p className="login-desc">Gunakan akun kasir atau administrator Anda</p>
            </div>

            {sessionExpired && !errorMessage && (
              <div className="login-alert-warning" role="status">
                <span>Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.</span>
              </div>
            )}

            {errorMessage && (
              <div className="login-alert-error" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <div className="input-icon-wrap">
                  <svg className="field-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username"
                    disabled={loginMutation.isPending}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-icon-wrap">
                  <svg className="field-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    disabled={loginMutation.isPending}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-login"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
