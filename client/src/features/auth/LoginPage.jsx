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

  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLogin();

  const from = location.state?.from?.pathname || '/dashboard';

  if (!isLoading && isAuthenticated) {
    return <Navigate to={from === '/login' ? '/dashboard' : from} replace />;
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
      navigate(from === '/login' ? '/dashboard' : from, { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Username atau password tidak sesuai.');
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-badge">Titik Temu Kopi</div>
          <h1 className="login-title">Masuk ke sistem kasir</h1>
          <p className="login-desc">Gunakan akun kasir atau administrator Anda</p>
        </div>

        {errorMessage && (
          <div className="login-alert-error" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="username">Username</label>
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

          <div className="form-group">
            <label htmlFor="password">Password</label>
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

          <button
            type="submit"
            className="btn-login"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className="login-hint">
          <p className="hint-title">Akun pengujian:</p>
          <div className="hint-accounts">
            <div>
              <strong>Admin:</strong> <code>admin</code> / <code>Admin#2026</code>
            </div>
            <div>
              <strong>Kasir:</strong> <code>kasir1</code> / <code>Kasir#2026</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
