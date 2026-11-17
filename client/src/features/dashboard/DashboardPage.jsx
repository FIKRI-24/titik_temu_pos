// src/features/dashboard/DashboardPage.jsx
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import {
  useDashboardSummary,
  useDashboardTrend,
  useDashboardRecent,
} from '../../api/hooks.js';
import { useAuth } from '../auth/AuthContext.jsx';
import './dashboard.css';

function formatRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

function formatCompactRp(n) {
  const val = Number(n || 0);
  if (val === 0) return '0';
  if (val >= 1000000) {
    return `${(val / 1000000).toFixed(1).replace('.0', '')}jt`;
  }
  if (val >= 1000) {
    return `${Math.round(val / 1000)}rb`;
  }
  return String(val);
}

function formatTimeWib(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL = {
  diproses: 'Diproses',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

function TrendTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{item.label}</div>
      <div className="chart-tooltip-val tabular-nums">{formatRp(item.omset)}</div>
      <div className="chart-tooltip-count tabular-nums">
        {item.jumlah_pesanan} pesanan
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const {
    data: summary,
    isLoading: sumLoading,
    isError: sumError,
    refetch: refetchSummary,
  } = useDashboardSummary();

  const {
    data: trendData,
    isLoading: trendLoading,
    isError: trendError,
    refetch: refetchTrend,
  } = useDashboardTrend(7);

  const {
    data: recentData,
    isLoading: recentLoading,
    isError: recentError,
    refetch: refetchRecent,
  } = useDashboardRecent(8);

  const trend = trendData?.trend || [];
  const categoriesDist = trendData?.distribusi_kategori || [];
  const recentOrders = recentData?.orders || [];

  const maxCatTotal = Math.max(
    1,
    ...categoriesDist.map((c) => Number(c.total_penjualan || 0))
  );

  const handleRetryAll = () => {
    refetchSummary();
    refetchTrend();
    refetchRecent();
  };

  return (
    <div className="dashboard-page">
      <header className="dash-header">
        <div>
          <h1>Ringkasan hari ini</h1>
          <p className="page-subtitle">
            {user?.nama_lengkap} •{' '}
            {isAdmin ? 'Data seluruh kafe (zona WIB)' : 'Transaksi milik Anda (zona WIB)'}
          </p>
        </div>

        <Link to="/transaksi" className="btn-primary dash-cta">
          Transaksi baru
        </Link>
      </header>

      {(sumError || trendError || recentError) && (
        <div className="state-box state-error" role="alert">
          <p>Gagal memuat sebagian data dashboard.</p>
          <button type="button" className="btn-secondary" onClick={handleRetryAll}>
            Muat ulang
          </button>
        </div>
      )}

      {/* Top Hero Row: Omset (large) + 7-day Trend Chart (wide) */}
      <section className="dash-hero-grid" aria-label="KPI utama dan tren omset">
        <div className="kpi-hero-card">
          <span className="kpi-label">Omset hari ini</span>
          {sumLoading ? (
            <div className="kpi-loading">Memuat...</div>
          ) : (
            <>
              <div className="kpi-hero-value tabular-nums" data-testid="kpi-omset">
                {formatRp(summary?.total_omset ?? 0)}
              </div>
              <p className="kpi-hero-sub">
                {summary?.jumlah_pesanan > 0 ? (
                  <>
                    Dari <strong>{summary.jumlah_pesanan}</strong> pesanan diproses &amp;
                    selesai
                  </>
                ) : (
                  'Belum ada omset hari ini.'
                )}
              </p>
            </>
          )}
          <div className="kpi-hero-footer">
            <Link to="/riwayat" className="kpi-link">
              Lihat riwayat transaksi
            </Link>
          </div>
        </div>

        <div className="trend-card">
          <div className="card-head-row">
            <h2>Tren omset 7 hari terakhir</h2>
            <span className="card-note">Diperbarui tiap 30 detik</span>
          </div>

          {trendLoading ? (
            <div className="chart-placeholder">Memuat grafik...</div>
          ) : trend.length === 0 ? (
            <div className="chart-placeholder">Belum ada data tren.</div>
          ) : (
            <div className="chart-container" role="img" aria-label="Grafik batang tren omset 7 hari terakhir">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={trend}
                  margin={{ top: 22, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2EAE6" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#2F4E44' }}
                    axisLine={{ stroke: '#C5D5CC' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCompactRp}
                    tick={{ fontSize: 11, fill: '#4E7066' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: '#EEF3F1' }} />
                  <Bar
                    dataKey="omset"
                    name="Omset"
                    fill="#0E6B5C"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  >
                    <LabelList
                      dataKey="omset"
                      position="top"
                      formatter={formatCompactRp}
                      style={{ fontSize: 11, fill: '#16241F', fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Middle Row: 3 Secondary Cards */}
      <section className="dash-secondary-grid" aria-label="Ringkasan operasional">
        <div className="kpi-sub-card">
          <span className="kpi-label">Pesanan hari ini</span>
          {sumLoading ? (
            <div className="kpi-loading">Memuat...</div>
          ) : (
            <>
              <div className="kpi-sub-value tabular-nums" data-testid="kpi-orders">
                {summary?.jumlah_pesanan ?? 0}
              </div>
              {summary?.jumlah_pesanan > 0 ? (
                <p className="kpi-sub-desc tabular-nums">
                  {summary.jumlah_diproses} diproses • {summary.jumlah_selesai} selesai
                </p>
              ) : (
                <p className="kpi-sub-desc">Belum ada pesanan hari ini.</p>
              )}
            </>
          )}
        </div>

        <div className="kpi-sub-card">
          <span className="kpi-label">Menu terlaris hari ini</span>
          {sumLoading ? (
            <div className="kpi-loading">Memuat...</div>
          ) : summary?.menu_terlaris ? (
            <>
              <div className="kpi-sub-title" data-testid="kpi-top-menu">
                {summary.menu_terlaris.nama_produk}
              </div>
              <p className="kpi-sub-desc tabular-nums">
                Terjual <strong>{summary.menu_terlaris.total_qty}</strong>{' '}
                {summary.menu_terlaris.unit}
              </p>
            </>
          ) : (
            <>
              <div className="kpi-empty-title" data-testid="kpi-top-menu">
                Belum ada penjualan
              </div>
              <p className="kpi-sub-desc">Catat pesanan pertama untuk melihat menu terlaris.</p>
            </>
          )}
        </div>

        <div
          className={`kpi-sub-card ${
            (summary?.stok_rendah?.count || 0) > 0 ? 'kpi-warning-card' : ''
          }`}
        >
          <span className="kpi-label">Peringatan stok rendah</span>
          {sumLoading ? (
            <div className="kpi-loading">Memuat...</div>
          ) : (
            <>
              <div className="kpi-sub-row">
                <span className="kpi-sub-value tabular-nums" data-testid="kpi-low-stock">
                  {summary?.stok_rendah?.count ?? 0}
                </span>
                <span className="kpi-unit-label">menu aktif</span>
              </div>
              {summary?.stok_rendah?.items?.length > 0 ? (
                <ul className="low-stock-mini-list">
                  {summary.stok_rendah.items.slice(0, 4).map((item) => (
                    <li key={item.id}>
                      {isAdmin ? (
                        <Link to="/menu" className="low-stock-link">
                          <span>{item.nama_produk}</span>
                          <span className="tabular-nums">
                            {item.stok} / min {item.stok_minimum}
                          </span>
                        </Link>
                      ) : (
                        <div className="low-stock-row">
                          <span>{item.nama_produk}</span>
                          <span className="tabular-nums">
                            sisa {item.stok} {item.unit}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="kpi-sub-desc">Semua stok menu berada di batas aman.</p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Bottom Row: Recent Orders Table + Category Distribution */}
      <section className="dash-bottom-grid" aria-label="Transaksi terbaru dan distribusi kategori">
        <div className="recent-card">
          <div className="card-head-row">
            <h2>Transaksi terbaru</h2>
            <Link to="/riwayat" className="kpi-link">
              Semua transaksi
            </Link>
          </div>

          {recentLoading ? (
            <div className="state-box">
              <p>Memuat transaksi terbaru...</p>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="empty-inline">
              <p>Belum ada pesanan hari ini. Buat pesanan pertama.</p>
              <Link to="/transaksi" className="btn-secondary link-btn">
                Buat pesanan
              </Link>
            </div>
          ) : (
            <div className="recent-table-wrap">
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>Faktur</th>
                    <th>Waktu</th>
                    {isAdmin && <th>Kasir</th>}
                    <th>Layanan</th>
                    <th className="num-col">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td data-label="Faktur">
                        <code className="code-badge">{o.invoice_number}</code>
                      </td>
                      <td data-label="Waktu" className="tabular-nums">
                        {formatTimeWib(o.created_at)}
                      </td>
                      {isAdmin && <td data-label="Kasir">{o.kasir_nama}</td>}
                      <td data-label="Layanan">
                        {o.tipe_pesanan === 'dine_in'
                          ? `Meja ${o.nomor_meja}`
                          : 'Takeaway'}
                      </td>
                      <td data-label="Total" className="num-col tabular-nums">
                        <strong>{formatRp(o.grand_total)}</strong>
                      </td>
                      <td data-label="Status">
                        <span className={`order-status-pill status-${o.status}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="category-dist-card">
          <div className="card-head-row">
            <h2>Penjualan kategori (7 hari)</h2>
          </div>

          {trendLoading ? (
            <div className="chart-placeholder">Memuat distribusi...</div>
          ) : categoriesDist.length === 0 ? (
            <p className="kpi-sub-desc">Belum ada data kategori.</p>
          ) : (
            <ul className="cat-dist-list">
              {categoriesDist.map((cat) => {
                const pct = Math.round((cat.total_penjualan / maxCatTotal) * 100);
                return (
                  <li key={cat.id} className="cat-dist-item">
                    <div className="cat-dist-top">
                      <span className="cat-dist-name">{cat.nama_kategori}</span>
                      <span className="cat-dist-val tabular-nums">
                        {formatRp(cat.total_penjualan)} ({cat.total_qty} item)
                      </span>
                    </div>
                    <div className="cat-dist-track" aria-hidden="true">
                      <div className="cat-dist-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
