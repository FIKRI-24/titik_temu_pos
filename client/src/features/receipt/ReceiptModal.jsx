// src/features/receipt/ReceiptModal.jsx
import { useState } from 'react';
import './receipt.css';

function formatRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

function formatWaktu(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const METODE_LABEL = {
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer bank',
  debit: 'Kartu debit',
};

export default function ReceiptModal({ order, onClose, onNewOrder, isNewOrder = false }) {
  const [paperSize, setPaperSize] = useState('80mm');

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="receipt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-dialog-title"
    >
      <div className="receipt-modal-shell">
        <div className="receipt-toolbar no-print">
          <div>
            <h2 id="receipt-dialog-title">Struk transaksi</h2>
            <p className="receipt-toolbar-sub">Siap dicetak atau buat pesanan baru</p>
          </div>
          <div className="paper-size-group" role="group" aria-label="Ukuran kertas cetak">
            {['80mm', '58mm', 'a4'].map((size) => (
              <button
                key={size}
                type="button"
                className={`size-btn ${paperSize === size ? 'active' : ''}`}
                onClick={() => setPaperSize(size)}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="receipt-stage">
          <article className={`receipt-paper receipt-size-${paperSize} ${isNewOrder ? 'receipt-eject' : ''}`}>
            <header className="receipt-header">
              <div className="receipt-brand">TITIK TEMU KOPI</div>
              <div className="receipt-address">Jl. Kopi Hangat No. 17, Jakarta</div>
              <div className="receipt-divider">--------------------------------</div>
            </header>

            <section className="receipt-meta">
              <div className="receipt-row">
                <span>Faktur</span>
                <span className="receipt-strong">{order.invoice_number}</span>
              </div>
              <div className="receipt-row">
                <span>Waktu</span>
                <span>{formatWaktu(order.created_at)} WIB</span>
              </div>
              <div className="receipt-row">
                <span>Kasir</span>
                <span>{order.kasir_nama || '-'}</span>
              </div>
              <div className="receipt-row">
                <span>Layanan</span>
                <span>
                  {order.tipe_pesanan === 'dine_in'
                    ? `Dine-In (Meja ${order.nomor_meja})`
                    : 'Takeaway'}
                </span>
              </div>
              {order.nama_pemesan && (
                <div className="receipt-row">
                  <span>Pemesan</span>
                  <span>{order.nama_pemesan}</span>
                </div>
              )}
              {order.status === 'dibatalkan' && (
                <div className="receipt-cancelled-banner">*** DIBATALKAN ***</div>
              )}
            </section>

            <div className="receipt-divider">--------------------------------</div>

            <section className="receipt-items">
              {(order.items || []).map((item, idx) => (
                <div key={item.id || idx} className="receipt-item">
                  <div className="receipt-item-name">{item.nama_produk}</div>
                  <div className="receipt-row receipt-item-calc">
                    <span>
                      {item.kuantiti} x {formatRp(item.harga_satuan)}
                    </span>
                    <span>{formatRp(item.subtotal_baris)}</span>
                  </div>
                  {item.catatan_khusus && (
                    <div className="receipt-item-note">Catatan: {item.catatan_khusus}</div>
                  )}
                </div>
              ))}
            </section>

            <div className="receipt-divider">--------------------------------</div>

            <section className="receipt-totals">
              <div className="receipt-row">
                <span>Subtotal</span>
                <span>{formatRp(order.total_subtotal)}</span>
              </div>
              {order.diskon_nominal > 0 && (
                <div className="receipt-row">
                  <span>
                    Diskon{order.voucher_kode ? ` (${order.voucher_kode})` : ''}
                  </span>
                  <span>-{formatRp(order.diskon_nominal)}</span>
                </div>
              )}
              <div className="receipt-row">
                <span>PB1 (10%)</span>
                <span>{formatRp(order.pajak_nominal)}</span>
              </div>
              <div className="receipt-row receipt-grand-total">
                <span>TOTAL</span>
                <span>{formatRp(order.grand_total)}</span>
              </div>
            </section>

            <div className="receipt-divider">--------------------------------</div>

            <section className="receipt-payment">
              <div className="receipt-row">
                <span>Metode</span>
                <span>{METODE_LABEL[order.metode_bayar] || order.metode_bayar}</span>
              </div>
              <div className="receipt-row">
                <span>Dibayar</span>
                <span>{formatRp(order.uang_dibayar)}</span>
              </div>
              {order.metode_bayar === 'tunai' && (
                <div className="receipt-row">
                  <span>Kembali</span>
                  <span>{formatRp(order.uang_kembali)}</span>
                </div>
              )}
            </section>

            <footer className="receipt-footer">
              <div className="receipt-divider">--------------------------------</div>
              <p>Terima kasih telah berkunjung</p>
              <p>Sampai jumpa di Titik Temu!</p>
            </footer>
          </article>
        </div>

        <div className="receipt-actions no-print">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {isNewOrder ? 'Tutup' : 'Kembali'}
          </button>
          <button type="button" className="btn-secondary" onClick={handlePrint}>
            Cetak struk ({paperSize.toUpperCase()})
          </button>
          {isNewOrder && onNewOrder && (
            <button type="button" className="btn-primary" onClick={onNewOrder}>
              Pesanan baru
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
