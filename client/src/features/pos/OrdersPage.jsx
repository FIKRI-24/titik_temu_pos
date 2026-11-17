// src/features/pos/OrdersPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useOrders, useUpdateOrderStatus } from '../../api/hooks.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../../components/ui/ToastContext.jsx';
import ReceiptModal from '../receipt/ReceiptModal.jsx';
import './orders.css';

function formatRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL = {
  diproses: 'Diproses',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading, isError, error, refetch } = useOrders({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    q: search.trim() || undefined,
    page,
    limit,
  });

  const updateStatusMutation = useUpdateOrderStatus();

  const [receiptOrder, setReceiptOrder] = useState(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleOpenReceipt = async (orderId) => {
    setLoadingReceiptId(orderId);
    try {
      const res = await api.get(`/orders/${orderId}`);
      setReceiptOrder(res.order);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const handleMarkDone = async (order) => {
    try {
      await updateStatusMutation.mutateAsync({ id: order.id, status: 'selesai' });
      toast.success(`Pesanan ${order.invoice_number} ditandai selesai.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await updateStatusMutation.mutateAsync({
        id: cancelTarget.id,
        status: 'dibatalkan',
      });
      toast.success(
        `Pesanan ${cancelTarget.invoice_number} dibatalkan dan stok dikembalikan.`
      );
      setCancelTarget(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="orders-page">
      <div className="page-header">
        <div>
          <h1>Riwayat transaksi</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Seluruh pesanan kafe. Cetak ulang struk atau ubah status pesanan.'
              : 'Daftar transaksi yang Anda catat. Cetak ulang struk atau ubah status.'}
          </p>
        </div>
        <Link to="/transaksi" className="btn-primary link-btn">
          Transaksi baru
        </Link>
      </div>

      <div className="orders-toolbar">
        <div className="search-box">
          <label htmlFor="orders-search" className="sr-only">
            Cari nomor faktur atau pemesan
          </label>
          <input
            id="orders-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari no. faktur atau nama pemesan..."
          />
        </div>

        <div className="filter-pills" role="group" aria-label="Filter status pesanan">
          {[
            ['all', 'Semua status'],
            ['diproses', 'Diproses'],
            ['selesai', 'Selesai'],
            ['dibatalkan', 'Dibatalkan'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pill-btn ${statusFilter === key ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="state-box">
          <p>Memuat riwayat pesanan...</p>
        </div>
      )}

      {isError && (
        <div className="state-box state-error" role="alert">
          <p>{error?.message || 'Gagal memuat riwayat transaksi.'}</p>
          <button type="button" className="btn-secondary" onClick={() => refetch()}>
            Coba lagi
          </button>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="state-box">
          <p>
            {statusFilter !== 'all' || search.trim()
              ? 'Tidak ada pesanan yang cocok dengan filter.'
              : 'Belum ada pesanan tercatat. Buat pesanan pertama.'}
          </p>
          {(statusFilter !== 'all' || search.trim()) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStatusFilter('all');
                setSearch('');
                setPage(1);
              }}
            >
              Reset filter
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <>
          <div className="table-card">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>No. faktur</th>
                  <th>Waktu</th>
                  {isAdmin && <th>Kasir</th>}
                  <th>Layanan</th>
                  <th className="num-col">Item</th>
                  <th className="num-col">Grand total</th>
                  <th>Metode</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <code className="code-badge">{o.invoice_number}</code>
                      {o.nama_pemesan && (
                        <div className="pemesan-sub">{o.nama_pemesan}</div>
                      )}
                    </td>
                    <td className="tabular-nums">{formatDateTime(o.created_at)}</td>
                    {isAdmin && <td>{o.kasir_nama}</td>}
                    <td>
                      {o.tipe_pesanan === 'dine_in'
                        ? `Dine-In • Meja ${o.nomor_meja}`
                        : 'Takeaway'}
                    </td>
                    <td className="num-col tabular-nums">{o.total_item}</td>
                    <td className="num-col tabular-nums">
                      <strong>{formatRp(o.grand_total)}</strong>
                    </td>
                    <td className="method-cell">{o.metode_bayar.toUpperCase()}</td>
                    <td>
                      <span className={`order-status-pill status-${o.status}`}>
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          type="button"
                          className="btn-action"
                          disabled={loadingReceiptId === o.id}
                          onClick={() => handleOpenReceipt(o.id)}
                        >
                          {loadingReceiptId === o.id ? 'Memuat...' : 'Cetak ulang'}
                        </button>
                        {o.status === 'diproses' && (
                          <>
                            <button
                              type="button"
                              className="btn-action btn-success-outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() => handleMarkDone(o)}
                            >
                              Selesai
                            </button>
                            <button
                              type="button"
                              className="btn-action btn-danger-outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() => setCancelTarget(o)}
                            >
                              Batalkan
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Halaman {page} dari {totalPages} ({total} pesanan)
              </span>
              <div className="action-group">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel confirmation modal */}
      {cancelTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
        >
          <div className="modal-panel">
            <h2 id="cancel-order-title">Batalkan pesanan?</h2>
            <p className="confirm-text">
              Pesanan <strong>{cancelTarget.invoice_number}</strong> senilai{' '}
              <strong>{formatRp(cancelTarget.grand_total)}</strong> akan dibatalkan, stok
              item akan dikembalikan ke inventaris, dan nominal tidak dihitung ke omset.
              Aksi ini tidak dapat dibatalkan kembali.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancelTarget(null)}
              >
                Kembali
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmCancel}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? 'Membatalkan...' : 'Ya, batalkan pesanan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </div>
  );
}
