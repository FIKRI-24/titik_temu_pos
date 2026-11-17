import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../../api/client.js';

export default function DashboardPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);

  useEffect(() => {
    api
      .get('/health')
      .then((data) => setHealth(data))
      .catch((err) => setHealthError(err.message));
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>
          Selamat datang, {user?.nama_lengkap || 'Pengguna'}
        </h1>
        <p style={{ color: 'var(--color-gray-600)' }}>
          Sistem Kasir Titik Temu Kopi • Terhubung sebagai{' '}
          <strong>{user?.role === 'admin' ? 'Administrator' : 'Kasir'}</strong>
        </p>
      </header>

      <div
        style={{
          background: '#ffffff',
          padding: 24,
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--color-gray-200)',
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Status Koneksi API & Backend</h2>
        {health ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: 'var(--color-hijau-pandan)',
              }}
            />
            <span style={{ color: 'var(--color-hijau-pandan)', fontWeight: 600 }}>
              Backend Terhubung (Status: {health.status})
            </span>
            <span style={{ color: 'var(--color-gray-500)', fontSize: 13 }}>
              Waktu Server: {new Date(health.timestamp).toLocaleTimeString('id-ID')}
            </span>
          </div>
        ) : healthError ? (
          <div style={{ color: 'var(--color-delima)' }}>
            Gagal terhubung ke backend: {healthError}
          </div>
        ) : (
          <div style={{ color: 'var(--color-gray-500)' }}>Memeriksa koneksi backend...</div>
        )}
      </div>
    </div>
  );
}
