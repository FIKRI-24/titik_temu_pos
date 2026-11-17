// src/features/pos/POSPage.jsx
import { useState, useMemo } from 'react';
import {
  useCategories,
  useProducts,
  useValidateVoucher,
  useCreateOrder,
} from '../../api/hooks.js';
import { useToast } from '../../components/ui/ToastContext.jsx';
import ReceiptModal from '../receipt/ReceiptModal.jsx';
import './pos.css';

const QUICK_NOTES = ['Less sugar', 'Extra ice', 'No onion'];
const QUICK_CASH = [50000, 100000, 150000, 200000];
const FEATURED_CODES = new Set(['COF-004', 'FOD-001']);

const CATEGORY_ACCENT = {
  coffee: '#0E6B5C',
  'non-coffee': '#2C6E91',
  food: '#C47D1A',
  pastry: '#8B4F6B',
};

function formatRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export default function POSPage() {
  const toast = useToast();

  // Menu filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Ticket / Cart state
  const [cart, setCart] = useState([]); // [{ product, kuantiti, catatan_khusus }]
  const [tipePesanan, setTipePesanan] = useState('dine_in');
  const [nomorMeja, setNomorMeja] = useState('');
  const [namaPemesan, setNamaPemesan] = useState('');

  // Voucher state
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null); // { kode, tipe, nilai }

  // Payment state
  const [metodeBayar, setMetodeBayar] = useState('tunai');
  const [uangDibayarInput, setUangDibayarInput] = useState('');

  // Receipt modal after checkout
  const [completedOrder, setCompletedOrder] = useState(null);

  // Mobile ticket drawer toggle
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false);

  // Queries & Mutations
  const { data: catData } = useCategories();
  const {
    data: prodData,
    isLoading: prodLoading,
    isError: prodError,
    refetch: refetchProducts,
  } = useProducts({ aktif: 'true' });

  const validateVoucherMutation = useValidateVoucher();
  const createOrderMutation = useCreateOrder();

  const categories = catData?.categories || [];
  const allProducts = prodData?.products || [];

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (selectedCategory !== 'all' && String(p.category_id) !== String(selectedCategory)) {
        return false;
      }
      if (q && !p.nama_produk.toLowerCase().includes(q) && !p.kode_produk.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allProducts, selectedCategory, search]);

  // Cart totals calculation (matches server formula: PB1 = Math.round((subtotal - discount) * 0.1))
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.harga_jual * item.kuantiti, 0),
    [cart]
  );

  const diskonNominal = useMemo(() => {
    if (!appliedVoucher || subtotal === 0) return 0;
    if (appliedVoucher.tipe === 'persen') {
      return Math.min(Math.round((subtotal * appliedVoucher.nilai) / 100), subtotal);
    }
    return Math.min(appliedVoucher.nilai, subtotal);
  }, [appliedVoucher, subtotal]);

  const pajakNominal = useMemo(
    () => Math.round((subtotal - diskonNominal) * 0.1),
    [subtotal, diskonNominal]
  );

  const grandTotal = useMemo(
    () => subtotal - diskonNominal + pajakNominal,
    [subtotal, diskonNominal, pajakNominal]
  );

  const totalItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.kuantiti, 0),
    [cart]
  );

  const uangDibayarNum = parseInt(uangDibayarInput, 10) || 0;
  const kembalian = metodeBayar === 'tunai' ? uangDibayarNum - grandTotal : 0;

  // Cart operations
  const addToCart = (product) => {
    if (product.stok <= 0) return;

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.product.id === product.id);
      if (existingIdx >= 0) {
        const currentQty = prev[existingIdx].kuantiti;
        if (currentQty + 1 > product.stok) {
          toast.warning(
            `Stok ${product.nama_produk} tersisa ${product.stok}. Kurangi jumlah atau pilih menu lain.`
          );
          return prev;
        }
        return prev.map((c, idx) =>
          idx === existingIdx ? { ...c, kuantiti: c.kuantiti + 1 } : c
        );
      }
      return [...prev, { product, kuantiti: 1, catatan_khusus: '' }];
    });
  };

  const updateCartQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const nextQty = c.kuantiti + delta;
          if (nextQty > c.product.stok) {
            toast.warning(`Stok ${c.product.nama_produk} tersisa ${c.product.stok}.`);
            return c;
          }
          return { ...c, kuantiti: nextQty };
        })
        .filter((c) => c.kuantiti > 0)
    );
  };

  const updateCartNote = (productId, note) => {
    setCart((prev) =>
      prev.map((c) => (c.product.id === productId ? { ...c, catatan_khusus: note } : c))
    );
  };

  const toggleQuickNote = (productId, chip) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.product.id !== productId) return c;
        const parts = c.catatan_khusus
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const exists = parts.some((p) => p.toLowerCase() === chip.toLowerCase());
        const nextParts = exists
          ? parts.filter((p) => p.toLowerCase() !== chip.toLowerCase())
          : [...parts, chip];
        return { ...c, catatan_khusus: nextParts.join(', ') };
      })
    );
  };

  const resetOrderForm = () => {
    setCart([]);
    setTipePesanan('dine_in');
    setNomorMeja('');
    setNamaPemesan('');
    setVoucherInput('');
    setAppliedVoucher(null);
    setMetodeBayar('tunai');
    setUangDibayarInput('');
    setMobileTicketOpen(false);
  };

  const handleApplyVoucher = async (e) => {
    e.preventDefault();
    const kode = voucherInput.trim();
    if (!kode) {
      toast.error('Masukkan kode voucher terlebih dahulu.');
      return;
    }
    try {
      const res = await validateVoucherMutation.mutateAsync({ kode, subtotal });
      setAppliedVoucher(res.voucher);
      toast.success(`Voucher ${res.voucher.kode} diterapkan.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error('Pilih minimal satu menu sebelum menyimpan pesanan.');
      return;
    }

    if (tipePesanan === 'dine_in' && !nomorMeja) {
      toast.error('Pilih nomor meja (1 sampai 20) untuk pesanan Dine-In.');
      return;
    }

    if (metodeBayar === 'tunai') {
      if (uangDibayarInput === '' || Number.isNaN(parseInt(uangDibayarInput, 10))) {
        toast.error('Masukkan nominal uang diterima untuk pembayaran tunai.');
        return;
      }
      if (uangDibayarNum < grandTotal) {
        toast.error(
          `Uang tunai kurang ${formatRp(grandTotal - uangDibayarNum)} dari grand total.`
        );
        return;
      }
    }

    const payload = {
      tipe_pesanan: tipePesanan,
      nomor_meja: tipePesanan === 'dine_in' ? parseInt(nomorMeja, 10) : null,
      nama_pemesan: namaPemesan.trim() || null,
      items: cart.map((c) => ({
        product_id: c.product.id,
        kuantiti: c.kuantiti,
        catatan_khusus: c.catatan_khusus.trim() || null,
      })),
      voucher_kode: appliedVoucher?.kode || null,
      metode_bayar: metodeBayar,
      ...(metodeBayar === 'tunai' ? { uang_dibayar: uangDibayarNum } : {}),
    };

    try {
      const res = await createOrderMutation.mutateAsync(payload);
      toast.success(`Pesanan ${res.order.invoice_number} tersimpan.`);
      setCompletedOrder(res.order);
      resetOrderForm();
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  return (
    <div className="pos-workspace">
      {/* Left: Menu Selection */}
      <section className="pos-menu-panel" aria-label="Daftar menu kasir">
        <div className="pos-menu-header">
          <div>
            <h1>Kasir pemesanan</h1>
            <p className="page-subtitle">Pilih menu untuk ditambahkan ke tiket pesanan.</p>
          </div>
        </div>

        <div className="pos-filters">
          <div className="pos-search">
            <label htmlFor="pos-search-input" className="sr-only">
              Cari menu
            </label>
            <input
              id="pos-search-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau kode menu..."
            />
          </div>
          <div className="filter-pills" role="group" aria-label="Kategori menu">
            <button
              type="button"
              className={`pill-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              Semua
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pill-btn ${selectedCategory === String(c.id) ? 'active' : ''}`}
                onClick={() => setSelectedCategory(String(c.id))}
              >
                {c.nama_kategori}
              </button>
            ))}
          </div>
        </div>

        {prodLoading && (
          <div className="state-box">
            <p>Memuat daftar menu...</p>
          </div>
        )}

        {prodError && (
          <div className="state-box state-error" role="alert">
            <p>Gagal memuat menu. Periksa koneksi server.</p>
            <button type="button" className="btn-secondary" onClick={() => refetchProducts()}>
              Coba lagi
            </button>
          </div>
        )}

        {!prodLoading && !prodError && filteredProducts.length === 0 && (
          <div className="state-box">
            <p>Tidak ada menu aktif yang cocok dengan pencarian.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
              }}
            >
              Tampilkan semua menu
            </button>
          </div>
        )}

        {!prodLoading && !prodError && filteredProducts.length > 0 && (
          <div className="pos-menu-grid">
            {filteredProducts.map((p) => {
              const outOfStock = p.stok <= 0;
              const inCart = cart.find((c) => c.product.id === p.id);
              const accent = CATEGORY_ACCENT[p.kategori_slug] || '#0E6B5C';
              const isFeatured = FEATURED_CODES.has(p.kode_produk);

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addToCart(p)}
                  className={`pos-menu-card ${isFeatured ? 'featured' : ''} ${
                    outOfStock ? 'out-of-stock' : ''
                  } ${inCart ? 'in-cart' : ''}`}
                >
                  <span
                    className="menu-cat-stripe"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  />
                  <div className="pos-card-top">
                    <span className="pos-card-cat">{p.nama_kategori}</span>
                    {inCart && (
                      <span className="pos-cart-badge tabular-nums">{inCart.kuantiti}</span>
                    )}
                  </div>
                  <div className="pos-card-name">{p.nama_produk}</div>
                  <div className="pos-card-bottom">
                    <span className="pos-card-price tabular-nums">
                      {formatRp(p.harga_jual)}
                    </span>
                    <span
                      className={`pos-card-stock tabular-nums ${
                        outOfStock
                          ? 'stock-empty'
                          : p.stok_rendah
                          ? 'stock-low'
                          : ''
                      }`}
                    >
                      {outOfStock ? 'Habis' : `Stok ${p.stok}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Mobile bottom bar to toggle ticket */}
      <div className="mobile-ticket-bar">
        <button
          type="button"
          className="btn-primary mobile-ticket-toggle"
          onClick={() => setMobileTicketOpen((v) => !v)}
        >
          <span>
            {mobileTicketOpen
              ? 'Tutup tiket pesanan'
              : `Tiket pesanan (${totalItemCount} item)`}
          </span>
          <span className="tabular-nums">{formatRp(grandTotal)}</span>
        </button>
      </div>

      {/* Right: Paper Receipt-Style Order Ticket */}
      <aside
        className={`pos-ticket-panel ${mobileTicketOpen ? 'open' : ''}`}
        aria-label="Tiket pesanan"
      >
        <div className="ticket-paper">
          <div className="ticket-header">
            <div>
              <h2>Tiket pesanan</h2>
              <span className="ticket-sub">{totalItemCount} item dipilih</span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                className="btn-link-danger"
                onClick={resetOrderForm}
              >
                Kosongkan
              </button>
            )}
          </div>

          {/* Tipe pesanan & Meja */}
          <div className="ticket-section">
            <div className="service-toggle" role="group" aria-label="Tipe pesanan">
              <button
                type="button"
                className={`toggle-btn ${tipePesanan === 'dine_in' ? 'active' : ''}`}
                onClick={() => setTipePesanan('dine_in')}
              >
                Dine-In
              </button>
              <button
                type="button"
                className={`toggle-btn ${tipePesanan === 'takeaway' ? 'active' : ''}`}
                onClick={() => {
                  setTipePesanan('takeaway');
                  setNomorMeja('');
                }}
              >
                Takeaway
              </button>
            </div>

            <div className="ticket-meta-inputs">
              {tipePesanan === 'dine_in' && (
                <div className="ticket-field">
                  <label htmlFor="pos-meja">Nomor meja *</label>
                  <select
                    id="pos-meja"
                    value={nomorMeja}
                    onChange={(e) => setNomorMeja(e.target.value)}
                    required
                  >
                    <option value="">Pilih meja</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Meja {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="ticket-field">
                <label htmlFor="pos-pemesan">Nama pemesan</label>
                <input
                  id="pos-pemesan"
                  type="text"
                  value={namaPemesan}
                  onChange={(e) => setNamaPemesan(e.target.value)}
                  placeholder="Opsional"
                  maxLength={100}
                />
              </div>
            </div>
          </div>

          <div className="ticket-dashed-sep" />

          {/* Cart Items */}
          <div className="ticket-items">
            {cart.length === 0 ? (
              <div className="ticket-empty">
                Belum ada item. Ketuk menu di sebelah kiri untuk mulai mencatat pesanan.
              </div>
            ) : (
              cart.map(({ product, kuantiti, catatan_khusus }) => (
                <div key={product.id} className="ticket-item">
                  <div className="ticket-item-row">
                    <div className="ticket-item-info">
                      <span className="ticket-item-name">{product.nama_produk}</span>
                      <span className="ticket-item-unit tabular-nums">
                        {formatRp(product.harga_jual)} / {product.unit}
                      </span>
                    </div>
                    <div className="qty-stepper">
                      <button
                        type="button"
                        aria-label={`Kurangi ${product.nama_produk}`}
                        onClick={() => updateCartQty(product.id, -1)}
                      >
                        -
                      </button>
                      <span className="tabular-nums">{kuantiti}</span>
                      <button
                        type="button"
                        aria-label={`Tambah ${product.nama_produk}`}
                        onClick={() => updateCartQty(product.id, 1)}
                      >
                        +
                      </button>
                    </div>
                    <div className="ticket-item-sub tabular-nums">
                      {formatRp(product.harga_jual * kuantiti)}
                    </div>
                  </div>

                  <div className="ticket-note-row">
                    <input
                      type="text"
                      value={catatan_khusus}
                      onChange={(e) => updateCartNote(product.id, e.target.value)}
                      placeholder="Catatan khusus..."
                      aria-label={`Catatan untuk ${product.nama_produk}`}
                    />
                    <div className="quick-note-chips">
                      {QUICK_NOTES.map((chip) => {
                        const active = catatan_khusus
                          .toLowerCase()
                          .includes(chip.toLowerCase());
                        return (
                          <button
                            key={chip}
                            type="button"
                            className={`note-chip ${active ? 'active' : ''}`}
                            onClick={() => toggleQuickNote(product.id, chip)}
                          >
                            {chip}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="ticket-dashed-sep" />

          {/* Voucher */}
          <form onSubmit={handleApplyVoucher} className="voucher-form">
            <label htmlFor="pos-voucher" className="sr-only">
              Kode voucher
            </label>
            <input
              id="pos-voucher"
              type="text"
              value={voucherInput}
              onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
              placeholder="Kode voucher (mis. HEMAT10)"
              disabled={!!appliedVoucher || cart.length === 0}
            />
            {appliedVoucher ? (
              <button
                type="button"
                className="btn-action btn-danger-outline"
                onClick={() => {
                  setAppliedVoucher(null);
                  setVoucherInput('');
                }}
              >
                Hapus
              </button>
            ) : (
              <button
                type="submit"
                className="btn-action"
                disabled={validateVoucherMutation.isPending || cart.length === 0}
              >
                Pakai
              </button>
            )}
          </form>

          {/* Totals Breakdown */}
          <div className="ticket-totals tabular-nums">
            <div className="total-line">
              <span>Subtotal</span>
              <span>{formatRp(subtotal)}</span>
            </div>
            {diskonNominal > 0 && (
              <div className="total-line discount-line">
                <span>Diskon ({appliedVoucher?.kode})</span>
                <span>-{formatRp(diskonNominal)}</span>
              </div>
            )}
            <div className="total-line">
              <span>Pajak PB1 (10%)</span>
              <span>{formatRp(pajakNominal)}</span>
            </div>
            <div className="total-line grand-total-line">
              <span>Grand total</span>
              <span>{formatRp(grandTotal)}</span>
            </div>
          </div>

          <div className="ticket-dashed-sep" />

          {/* Payment */}
          <div className="ticket-payment">
            <span className="payment-label">Metode pembayaran</span>
            <div className="payment-methods" role="group" aria-label="Metode pembayaran">
              {[
                ['tunai', 'Tunai'],
                ['qris', 'QRIS'],
                ['transfer', 'Transfer'],
                ['debit', 'Debit'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`pay-method-btn ${metodeBayar === key ? 'active' : ''}`}
                  onClick={() => setMetodeBayar(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {metodeBayar === 'tunai' ? (
              <div className="cash-section">
                <div className="ticket-field">
                  <label htmlFor="pos-uang-diterima">Uang diterima (Rp)</label>
                  <input
                    id="pos-uang-diterima"
                    type="number"
                    min="0"
                    step="100"
                    value={uangDibayarInput}
                    onChange={(e) => setUangDibayarInput(e.target.value)}
                    placeholder="Masukkan nominal tunai"
                  />
                </div>

                <div className="quick-cash-row">
                  <button
                    type="button"
                    className="quick-cash-btn"
                    disabled={grandTotal === 0}
                    onClick={() => setUangDibayarInput(String(grandTotal))}
                  >
                    Uang pas
                  </button>
                  {QUICK_CASH.map((nom) => (
                    <button
                      key={nom}
                      type="button"
                      className="quick-cash-btn tabular-nums"
                      onClick={() => setUangDibayarInput(String(nom))}
                    >
                      {(nom / 1000).toLocaleString('id-ID')}rb
                    </button>
                  ))}
                </div>

                {uangDibayarInput !== '' && grandTotal > 0 && (
                  <div
                    className={`change-display tabular-nums ${
                      kembalian < 0 ? 'change-short' : 'change-ok'
                    }`}
                  >
                    {kembalian < 0
                      ? `Uang kurang ${formatRp(Math.abs(kembalian))}`
                      : `Kembalian: ${formatRp(kembalian)}`}
                  </div>
                )}
              </div>
            ) : (
              <div className="non-cash-note tabular-nums">
                Pembayaran {metodeBayar.toUpperCase()} otomatis sebesar{' '}
                <strong>{formatRp(grandTotal)}</strong>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-primary btn-checkout"
            disabled={cart.length === 0 || createOrderMutation.isPending}
            onClick={handleSubmitOrder}
          >
            {createOrderMutation.isPending ? 'Menyimpan pesanan...' : 'Simpan & bayar'}
          </button>
        </div>
      </aside>

      {/* Receipt Modal */}
      {completedOrder && (
        <ReceiptModal
          order={completedOrder}
          isNewOrder
          onClose={() => setCompletedOrder(null)}
          onNewOrder={() => {
            setCompletedOrder(null);
            resetOrderForm();
          }}
        />
      )}
    </div>
  );
}
