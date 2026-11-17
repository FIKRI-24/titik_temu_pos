// src/features/reports/ReportsPage.jsx
import { useState } from 'react';
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
import { api } from '../../api/client.js';
import { useReportOrders, useReportSummary } from '../../api/hooks.js';
import { useToast } from '../../components/ui/ToastContext.jsx';
import './reports.css';

function getTodayJakartaIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(isoDate, daysOffset) {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + daysOffset));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildDefaultFilters() {
  const today = getTodayJakartaIso();
  return {
    dateFrom: addDaysIso(today, -6),
    dateTo: today,
    category: 'all',
    metodeBayar: 'all',
    status: 'all',
  };
}

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

function formatDateTimeWib(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CATEGORY_LABELS = {
  all: 'Semua kategori',
  coffee: 'Coffee',
  'non-coffee': 'Non-Coffee',
  food: 'Food',
  pastry: 'Pastry',
};

const METHOD_LABELS = {
  all: 'Semua metode',
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Debit',
};

const STATUS_LABELS = {
  all: 'Semua status',
  aktif: 'Diproses & Selesai',
  diproses: 'Diproses',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

function CategoryChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div className="chart-tooltip-box">
      <div className="tt-title">{item.nama_kategori}</div>
      <div className="tabular-nums">{formatRp(item.total_penjualan)}</div>
      <div className="tabular-nums">{item.total_qty} item terjual</div>
    </div>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const [filters, setFilters] = useState(buildDefaultFilters);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [exportingType, setExportingType] = useState(null);
  const [exportError, setExportError] = useState('');

  const queryParams = {
    ...filters,
    sortBy,
    sortDir,
    page,
    limit,
  };

  const summaryParams = {
    ...filters,
  };

  const {
    data: summaryData,
    isLoading: summaryLoading,
    isError: summaryIsError,
    error: summaryError,
    refetch: refetchSummary,
  } = useReportSummary(summaryParams);

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersIsError,
    error: ordersError,
    refetch: refetchOrders,
  } = useReportOrders(queryParams);

  const summary = summaryData?.summary;
  const categoriesChart = summaryData?.omset_per_kategori || [];
  const orders = ordersData?.orders || [];
  const totalOrders = ordersData?.total || 0;
  const totalPages = ordersData?.totalPages || 1;
  const todayWib = getTodayJakartaIso();

  const updateFilter = (field, value) => {
    setExportError('');
    setPage(1);
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const applyDatePreset = (daysCount) => {
    setExportError('');
    setPage(1);
    const end = getTodayJakartaIso();
    const start = addDaysIso(end, -(daysCount - 1));
    setFilters((prev) => ({ ...prev, dateFrom: start, dateTo: end }));
  };

  const handleResetFilters = () => {
    setExportError('');
    setPage(1);
    setSortBy('created_at');
    setSortDir('desc');
    setFilters(buildDefaultFilters());
  };

  const handleSort = (columnKey) => {
    setPage(1);
    if (sortBy === columnKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortDir('desc');
    }
  };

  const renderSortArrow = (columnKey) => {
    if (sortBy !== columnKey) return <span className="sort-indicator" aria-hidden="true">↕</span>;
    return (
      <span className="sort-indicator" aria-hidden="true">
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const getAriaSort = (columnKey) => {
    if (sortBy !== columnKey) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const handleExport = async (format) => {
    setExportError('');
    setExportingType(format);
    try {
      const endpoint = format === 'csv' ? '/reports/export.csv' : '/reports/export.pdf';
      const response = await api.getRaw(endpoint, {
        ...filters,
        sortBy,
        sortDir,
      });

      if (!response.ok) {
        let message = `Gagal mengunduh berkas ${format.toUpperCase()}.`;
        try {
          const json = await response.json();
          if (json?.error?.message) {
            message = json.error.message;
          }
        } catch {
          // ignore non-JSON body
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallbackName = `laporan-penjualan-${filters.dateFrom}_${filters.dateTo}.${format}`;
      const filename = match ? match[1] : fallbackName;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      toast.success(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      setExportError(err.message);
      toast.error(err.message);
    } finally {
      setExportingType(null);
    }
  };

  const isPresetToday = filters.dateFrom === todayWib && filters.dateTo === todayWib;
  const isPreset7d =
    filters.dateFrom === addDaysIso(todayWib, -6) && filters.dateTo === todayWib;
  const isPreset30d =
    filters.dateFrom === addDaysIso(todayWib, -29) && filters.dateTo === todayWib;

  const hasQueryError = summaryIsError || ordersIsError;
  const combinedErrorMsg =
    ordersError?.details?.[0]?.message ||
    ordersError?.message ||
    summaryError?.details?.[0]?.message ||
    summaryError?.message ||
    'Gagal memuat data laporan.';

  const startRow = totalOrders === 0 ? 0 : (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, totalOrders);

  return (
    <div className="reports-page">
      <header className="reports-header">
        <div>
          <h1>Laporan penjualan</h1>
          <p className="reports-subtitle">
            Rekapitulasi transaksi, pajak PB1, laba kotor, dan ekspor data (zona WIB)
          </p>
        </div>

        <div className="reports-export-actions">
          <button
            type="button"
            className="btn-report-secondary"
            data-testid="btn-export-csv"
            disabled={exportingType !== null || ordersLoading || hasQueryError || totalOrders === 0}
            onClick={() => handleExport('csv')}
            title={totalOrders === 0 ? 'Belum ada data untuk diekspor' : 'Unduh laporan CSV (UTF-8)'}
          >
            {exportingType === 'csv' ? 'Menyiapkan CSV...' : 'Unduh CSV'}
          </button>
          <button
            type="button"
            className="btn-report-primary"
            data-testid="btn-export-pdf"
            disabled={exportingType !== null || ordersLoading || hasQueryError || totalOrders === 0}
            onClick={() => handleExport('pdf')}
            title={totalOrders === 0 ? 'Belum ada data untuk diekspor' : 'Unduh laporan PDF (A4 Landscape)'}
          >
            {exportingType === 'pdf' ? 'Menyiapkan PDF...' : 'Unduh PDF'}
          </button>
        </div>
      </header>

      {/* Filter Panel */}
      <section className="reports-filter-card" aria-label="Filter laporan penjualan">
        <div className="reports-preset-row">
          <div className="preset-group" role="group" aria-label="Pintasan rentang tanggal">
            <button
              type="button"
              className={`btn-preset ${isPresetToday ? 'active' : ''}`}
              onClick={() => applyDatePreset(1)}
            >
              Hari ini
            </button>
            <button
              type="button"
              className={`btn-preset ${isPreset7d ? 'active' : ''}`}
              onClick={() => applyDatePreset(7)}
            >
              7 hari terakhir
            </button>
            <button
              type="button"
              className={`btn-preset ${isPreset30d ? 'active' : ''}`}
              onClick={() => applyDatePreset(30)}
            >
              30 hari terakhir
            </button>
          </div>

          <button
            type="button"
            className="btn-reset-filter"
            data-testid="btn-reset-filter"
            onClick={handleResetFilters}
          >
            Atur ulang
          </button>
        </div>

        <div className="reports-filters-grid">
          <div className="filter-field">
            <label htmlFor="filter-date-from">Dari tanggal</label>
            <input
              id="filter-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="filter-date-to">Sampai tanggal</label>
            <input
              id="filter-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="filter-category">Kategori menu</label>
            <select
              id="filter-category"
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
            >
              <option value="all">Semua kategori</option>
              <option value="coffee">Coffee</option>
              <option value="non-coffee">Non-Coffee</option>
              <option value="food">Food</option>
              <option value="pastry">Pastry</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="filter-method">Metode bayar</label>
            <select
              id="filter-method"
              value={filters.metodeBayar}
              onChange={(e) => updateFilter('metodeBayar', e.target.value)}
            >
              <option value="all">Semua metode</option>
              <option value="tunai">Tunai</option>
              <option value="qris">QRIS</option>
              <option value="transfer">Transfer</option>
              <option value="debit">Debit</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="filter-status">Status pesanan</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="all">Semua status</option>
              <option value="aktif">Diproses &amp; Selesai</option>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          </div>
        </div>

        <div className="active-filters-bar" aria-live="polite">
          <span className="active-filters-label">Filter aktif:</span>
          <span className="active-filter-chip" data-testid="chip-period">
            {filters.dateFrom} s.d. {filters.dateTo}
          </span>
          {filters.category !== 'all' && (
            <span className="active-filter-chip" data-testid="chip-category">
              Kategori: {CATEGORY_LABELS[filters.category]}
            </span>
          )}
          {filters.metodeBayar !== 'all' && (
            <span className="active-filter-chip" data-testid="chip-method">
              Metode: {METHOD_LABELS[filters.metodeBayar]}
            </span>
          )}
          {filters.status !== 'all' && (
            <span className="active-filter-chip" data-testid="chip-status">
              Status: {STATUS_LABELS[filters.status]}
            </span>
          )}
        </div>

        {filters.category !== 'all' && (
          <p className="filter-context-note">
            Filter kategori menampilkan setiap <strong>pesanan utuh</strong> yang memuat minimal satu item{' '}
            <strong>{CATEGORY_LABELS[filters.category]}</strong>. Total pesanan pada ringkasan tidak digandakan.
          </p>
        )}
      </section>

      {hasQueryError && (
        <div className="report-alert report-alert-error" role="alert">
          <span>{combinedErrorMsg}</span>
          <button
            type="button"
            className="btn-report-secondary"
            onClick={() => {
              refetchSummary();
              refetchOrders();
            }}
          >
            Muat ulang
          </button>
        </div>
      )}

      {exportError && (
        <div className="report-alert report-alert-error" role="alert">
          <span>{exportError}</span>
        </div>
      )}

      {totalOrders > 5000 && (
        <div className="report-alert report-alert-error" role="status">
          <span>
            Hasil terlalu banyak, persempit rentang tanggal atau filter (batas ekspor PDF: 5.000 baris; CSV: 50.000 baris; cocok saat ini: {totalOrders.toLocaleString('id-ID')} baris).
          </span>
        </div>
      )}

      {/* Hierarchical Summary Bar */}
      <section className="reports-summary-grid" aria-label="Ringkasan angka laporan">
        <div className="summary-hero-card">
          <div>
            <div className="summary-hero-eyebrow">Omset bersih (DPP)</div>
            <div className="summary-hero-value tabular-nums" data-testid="summary-omset-bersih">
              {summaryLoading ? '...' : formatRp(summary?.omset_bersih ?? 0)}
            </div>
            <p className="summary-hero-caption">
              Penjualan bersih setelah diskon voucher, sebelum pajak PB1 10%
            </p>
          </div>

          <div className="summary-formula-strip">
            <div className="formula-item">
              <span>Omset bruto</span>
              <strong className="tabular-nums" data-testid="summary-omset-bruto">
                {summaryLoading ? '...' : formatRp(summary?.omset_bruto ?? 0)}
              </strong>
            </div>
            <div className="formula-item">
              <span>Total diskon</span>
              <strong className="tabular-nums" data-testid="summary-total-diskon">
                {summaryLoading ? '...' : `-${formatRp(summary?.total_diskon ?? 0)}`}
              </strong>
            </div>
            <div className="formula-item received">
              <span>Total diterima (+PB1)</span>
              <strong className="tabular-nums" data-testid="summary-total-diterima">
                {summaryLoading ? '...' : formatRp(summary?.total_diterima ?? 0)}
              </strong>
            </div>
          </div>
        </div>

        <div className="summary-secondary-grid">
          <div className="summary-sub-card">
            <span className="summary-sub-label">Total pajak PB1</span>
            <strong className="summary-sub-value tabular-nums" data-testid="summary-total-pajak">
              {summaryLoading ? '...' : formatRp(summary?.total_pajak ?? 0)}
            </strong>
            <span className="summary-sub-basis">
              10% dari omset bersih (disetor terpisah)
            </span>
          </div>

          <div className="summary-sub-card">
            <span className="summary-sub-label">Laba kotor</span>
            <strong className="summary-sub-value tabular-nums" data-testid="summary-laba-kotor">
              {summaryLoading ? '...' : formatRp(summary?.laba_kotor ?? 0)}
            </strong>
            <span className="summary-sub-basis">
              Omset bersih dikurangi HPP snapshot item ({formatRp(summary?.total_hpp ?? 0)})
            </span>
          </div>

          <div className="summary-sub-card">
            <span className="summary-sub-label">Rata-rata nilai transaksi</span>
            <strong className="summary-sub-value tabular-nums" data-testid="summary-avg-trx">
              {summaryLoading ? '...' : formatRp(summary?.rata_rata_transaksi ?? 0)}
            </strong>
            <span className="summary-sub-basis">
              Total diterima / {summary?.jumlah_pesanan ?? 0} pesanan non-batal
            </span>
          </div>

          <div className="summary-sub-card">
            <span className="summary-sub-label">Jumlah pesanan non-batal</span>
            <strong className="summary-sub-value tabular-nums" data-testid="summary-jumlah-pesanan">
              {summaryLoading ? '...' : `${summary?.jumlah_pesanan ?? 0} pesanan`}
            </strong>
            <span className="summary-sub-basis">
              Total {summary?.total_item_terjual ?? 0} item terjual (status Diproses &amp; Selesai)
            </span>
          </div>
        </div>
      </section>
      <p className="summary-footnote">
        Pesanan berstatus <strong>Dibatalkan</strong> dikecualikan dari seluruh metrik ringkasan dan grafik kategori.
      </p>

      {/* Category Revenue Chart */}
      <section className="reports-chart-card" aria-label="Grafik omset per kategori">
        <div className="reports-card-head">
          <h2>Omset per kategori menu (baris item)</h2>
          <span className="reports-card-note">
            Dari subtotal item pesanan non-batal yang cocok filter
          </span>
        </div>

        {summaryLoading ? (
          <div className="reports-empty-box">Memuat grafik kategori...</div>
        ) : categoriesChart.every((c) => c.total_penjualan === 0) ? (
          <div className="reports-empty-box">Belum ada transaksi pada periode ini</div>
        ) : (
          <>
            <div className="reports-chart-wrap" aria-hidden="true">
              <ResponsiveContainer width="100%" height={220} minWidth={0}>
                <BarChart
                  data={categoriesChart}
                  margin={{ top: 20, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2EAE6" />
                  <XAxis
                    dataKey="nama_kategori"
                    tick={{ fontSize: 12, fill: '#2F4E44' }}
                    axisLine={{ stroke: '#C5D5CC' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCompactRp}
                    tick={{ fontSize: 11, fill: '#2F4E44' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<CategoryChartTooltip />} cursor={{ fill: '#EEF3F1' }} />
                  <Bar
                    dataKey="total_penjualan"
                    name="Omset baris kategori"
                    fill="#0E6B5C"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  >
                    <LabelList
                      dataKey="total_penjualan"
                      position="top"
                      formatter={formatCompactRp}
                      style={{ fontSize: 11, fill: '#16241F', fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="sr-only">
              <table aria-label="Ringkasan omset per kategori">
                <caption>Omset baris detail dan kuantitas per kategori</caption>
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Item terjual</th>
                    <th>Subtotal item</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesChart.map((cat) => (
                    <tr key={cat.id}>
                      <td>{cat.nama_kategori}</td>
                      <td>{cat.total_qty}</td>
                      <td>{formatRp(cat.total_penjualan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Transactions Table */}
      <section className="reports-table-card" aria-label="Tabel rincian transaksi laporan">
        <div className="reports-table-toolbar">
          <div>
            <h2>Rincian transaksi</h2>
            <span className="pagination-meta" data-testid="reports-total-count">
              {totalOrders} transaksi cocok dengan filter
            </span>
          </div>

          <div className="reports-table-controls">
            <div className="mobile-sort-control">
              <label htmlFor="mobile-sort-select">Urut:</label>
              <select
                id="mobile-sort-select"
                value={`${sortBy}:${sortDir}`}
                onChange={(e) => {
                  const [col, dir] = e.target.value.split(':');
                  setPage(1);
                  setSortBy(col);
                  setSortDir(dir);
                }}
              >
                <option value="created_at:desc">Terbaru</option>
                <option value="created_at:asc">Terlama</option>
                <option value="grand_total:desc">Grand total tertinggi</option>
                <option value="grand_total:asc">Grand total terendah</option>
                <option value="invoice_number:asc">No. faktur A–Z</option>
                <option value="item_terjual:desc">Item terbanyak</option>
              </select>
            </div>

            <div className="limit-control">
              <label htmlFor="page-limit-select">Baris/hal:</label>
              <select
                id="page-limit-select"
                value={limit}
                onChange={(e) => {
                  setPage(1);
                  setLimit(Number(e.target.value));
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {ordersLoading ? (
          <div className="reports-empty-box">Memuat rincian transaksi...</div>
        ) : orders.length === 0 ? (
          <div className="reports-empty-box">
            <p data-testid="reports-empty-state">Belum ada transaksi pada periode ini</p>
            <div className="empty-cta-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetFilters}
              >
                Atur ulang filter
              </button>
            </div>
          </div>
        ) : (
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th aria-sort={getAriaSort('invoice_number')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('invoice_number')}
                    >
                      No. faktur {renderSortArrow('invoice_number')}
                    </button>
                  </th>
                  <th aria-sort={getAriaSort('created_at')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('created_at')}
                    >
                      Tanggal &amp; jam {renderSortArrow('created_at')}
                    </button>
                  </th>
                  <th aria-sort={getAriaSort('kasir_nama')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('kasir_nama')}
                    >
                      Kasir {renderSortArrow('kasir_nama')}
                    </button>
                  </th>
                  <th aria-sort={getAriaSort('tipe_pesanan')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('tipe_pesanan')}
                    >
                      Tipe pesanan {renderSortArrow('tipe_pesanan')}
                    </button>
                  </th>
                  <th className="num-col" aria-sort={getAriaSort('item_terjual')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('item_terjual')}
                    >
                      Item terjual {renderSortArrow('item_terjual')}
                    </button>
                  </th>
                  <th className="num-col" aria-sort={getAriaSort('total_subtotal')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('total_subtotal')}
                    >
                      Subtotal {renderSortArrow('total_subtotal')}
                    </button>
                  </th>
                  <th className="num-col" aria-sort={getAriaSort('pajak_nominal')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('pajak_nominal')}
                    >
                      Pajak {renderSortArrow('pajak_nominal')}
                    </button>
                  </th>
                  <th className="num-col" aria-sort={getAriaSort('grand_total')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('grand_total')}
                    >
                      Grand total {renderSortArrow('grand_total')}
                    </button>
                  </th>
                  <th aria-sort={getAriaSort('status')}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => handleSort('status')}
                    >
                      Status {renderSortArrow('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className={o.status === 'dibatalkan' ? 'row-cancelled' : ''}
                  >
                    <td data-label="No. faktur">
                      <code className="invoice-code">{o.invoice_number}</code>
                      <span className="sub-meta">{METHOD_LABELS[o.metode_bayar] || o.metode_bayar}</span>
                    </td>
                    <td data-label="Tanggal & jam" className="tabular-nums">
                      {formatDateTimeWib(o.created_at)}
                    </td>
                    <td data-label="Kasir">{o.kasir_nama}</td>
                    <td data-label="Tipe pesanan">
                      {o.tipe_pesanan === 'dine_in' ? `Dine-In · Meja ${o.nomor_meja}` : 'Takeaway'}
                      {o.nama_pemesan && <span className="sub-meta">{o.nama_pemesan}</span>}
                    </td>
                    <td data-label="Item terjual" className="num-col tabular-nums">
                      {o.item_terjual}
                    </td>
                    <td data-label="Subtotal" className="num-col tabular-nums">
                      {formatRp(o.total_subtotal)}
                      {o.diskon_nominal > 0 && (
                        <span className="sub-meta">Diskon -{formatRp(o.diskon_nominal)}</span>
                      )}
                    </td>
                    <td data-label="Pajak PB1" className="num-col tabular-nums">
                      {formatRp(o.pajak_nominal)}
                    </td>
                    <td data-label="Grand total" className="num-col tabular-nums">
                      <strong>{formatRp(o.grand_total)}</strong>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`report-status-pill status-${o.status}`}
                        title={
                          o.status === 'dibatalkan'
                            ? 'Pesanan dibatalkan tidak dihitung dalam ringkasan'
                            : undefined
                        }
                      >
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="reports-pagination">
          <span className="pagination-meta">
            Menampilkan {startRow}–{endRow} dari {totalOrders} transaksi (Halaman {page} dari {totalPages})
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="btn-page"
              data-testid="btn-prev-page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              className="btn-page"
              data-testid="btn-next-page"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
