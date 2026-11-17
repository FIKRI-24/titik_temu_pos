// src/components/ui/ErrorBoundary.jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="forbidden-screen" role="alert">
          <div className="forbidden-content">
            <p className="forbidden-code">!</p>
            <h1>Terjadi gangguan tampilan</h1>
            <p className="page-subtitle">
              Aplikasi mengalami kendala saat merender halaman. Silakan muat ulang atau
              kembali ke beranda.
            </p>
            <div className="empty-cta-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Muat ulang halaman
              </button>
              <a
                href="/dashboard"
                className="btn-secondary"
                onClick={() => this.setState({ hasError: false })}
              >
                Kembali ke dashboard
              </a>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
