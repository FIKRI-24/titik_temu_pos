// src/components/layout/NotFoundPage.jsx
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="forbidden-screen" aria-labelledby="not-found-title">
      <div className="forbidden-content">
        <p className="forbidden-code">404</p>
        <h1 id="not-found-title">Halaman tidak ditemukan</h1>
        <p className="page-subtitle">
          Alamat yang Anda tuju tidak tersedia atau telah dipindahkan.
        </p>
        <Link to="/dashboard" className="forbidden-link">
          Kembali ke dashboard
        </Link>
      </div>
    </main>
  );
}
