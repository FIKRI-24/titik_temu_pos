// src/features/menu/MenuPage.jsx
import { useState } from 'react';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useUpdateStok,
  useDeleteProduct,
  useProductStockHistory,
} from '../../api/hooks.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../../components/ui/ToastContext.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import './menu.css';

function formatRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export default function MenuPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [aktifFilter, setAktifFilter] = useState(isAdmin ? 'all' : 'true');

  // Queries
  const { data: catData, isLoading: catLoading } = useCategories(
    isAdmin ? { all: 'true' } : undefined
  );
  const {
    data: prodData,
    isLoading: prodLoading,
    isError: prodError,
    error: prodErrObj,
    refetch,
  } = useProducts({
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    q: search.trim() || undefined,
    aktif: isAdmin ? aktifFilter : 'true',
  });

  // Mutations
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const updateStok = useUpdateStok();
  const deleteProduct = useDeleteProduct();

  const categories = catData?.categories || [];
  const activeCategories = categories.filter((c) => c.status === 'aktif');
  const products = prodData?.products || [];
  const lowStockCount = products.filter((p) => p.status === 'aktif' && p.stok_rendah).length;

  // Modals state
  const [menuModal, setMenuModal] = useState(null); // { mode: 'create' | 'edit', product?: ... }
  const [menuForm, setMenuForm] = useState({
    category_id: '',
    kode_produk: '',
    nama_produk: '',
    harga_jual: '',
    harga_pokok: '',
    stok: '0',
    stok_minimum: '5',
    unit: 'cup',
  });
  const [highCostConfirmPayload, setHighCostConfirmPayload] = useState(null);

  const [stokModal, setStokModal] = useState(null); // product
  const [stokForm, setStokForm] = useState({ mode: 'selisih', nilai: '', catatan: '' });

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);

  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const { data: historyData } = useProductStockHistory(stokModal?.id);
  const stockHistory = historyData?.history || [];

  // Open create/edit product modal
  const openCreateMenu = () => {
    setMenuForm({
      category_id: activeCategories[0]?.id ? String(activeCategories[0].id) : '',
      kode_produk: '',
      nama_produk: '',
      harga_jual: '',
      harga_pokok: '',
      stok: '10',
      stok_minimum: '5',
      unit: 'cup',
    });
    setMenuModal({ mode: 'create' });
  };

  const openEditMenu = (p) => {
    setMenuForm({
      category_id: String(p.category_id),
      kode_produk: p.kode_produk,
      nama_produk: p.nama_produk,
      harga_jual: String(p.harga_jual),
      harga_pokok: String(p.harga_pokok),
      stok: String(p.stok),
      stok_minimum: String(p.stok_minimum),
      unit: p.unit,
    });
    setMenuModal({ mode: 'edit', product: p });
  };

  const submitMenuPayload = async (payload, confirmedHighCost = false) => {
    const finalPayload = {
      ...payload,
      konfirmasi_harga_pokok_tinggi: confirmedHighCost,
    };

    try {
      if (menuModal.mode === 'create') {
        const res = await createProduct.mutateAsync(finalPayload);
        toast.success(`Menu "${res.product.nama_produk}" berhasil ditambahkan.`);
      } else {
        const { stok: _ignored, ...updateData } = finalPayload;
        const res = await updateProduct.mutateAsync({
          id: menuModal.product.id,
          ...updateData,
        });
        toast.success(`Menu "${res.product.nama_produk}" diperbarui.`);
      }
      setHighCostConfirmPayload(null);
      setMenuModal(null);
    } catch (err) {
      if (err.code === 'CONFIRM_HIGH_COST') {
        setHighCostConfirmPayload(payload);
        return;
      }
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  const handleMenuFormSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      category_id: parseInt(menuForm.category_id, 10),
      kode_produk: menuForm.kode_produk.trim(),
      nama_produk: menuForm.nama_produk.trim(),
      harga_jual: parseInt(menuForm.harga_jual, 10),
      harga_pokok: parseInt(menuForm.harga_pokok, 10),
      stok: parseInt(menuForm.stok, 10),
      stok_minimum: parseInt(menuForm.stok_minimum, 10),
      unit: menuForm.unit.trim(),
    };

    if (Number.isNaN(payload.harga_jual) || Number.isNaN(payload.harga_pokok)) {
      toast.error('Harga jual dan harga pokok harus diisi angka bulat.');
      return;
    }

    if (payload.harga_pokok > payload.harga_jual) {
      setHighCostConfirmPayload(payload);
      return;
    }

    await submitMenuPayload(payload, false);
  };

  // Stock adjustment
  const openStokModal = (p) => {
    setStokModal(p);
    setStokForm({ mode: 'selisih', nilai: '', catatan: '' });
  };

  const parsedStokNilai = parseInt(stokForm.nilai, 10);
  const previewNextStok = (() => {
    if (!stokModal || Number.isNaN(parsedStokNilai)) return null;
    if (stokForm.mode === 'set') return parsedStokNilai;
    return stokModal.stok + parsedStokNilai;
  })();

  const handleStokSubmit = async (e) => {
    e.preventDefault();
    if (!stokModal) return;
    if (Number.isNaN(parsedStokNilai)) {
      toast.error('Masukkan nilai angka bulat untuk penyesuaian stok.');
      return;
    }
    try {
      const res = await updateStok.mutateAsync({
        id: stokModal.id,
        mode: stokForm.mode,
        nilai: parsedStokNilai,
        catatan: stokForm.catatan.trim() || undefined,
      });
      toast.success(
        `Stok "${stokModal.nama_produk}" diperbarui: ${res.adjustment.stok_sebelum} → ${res.adjustment.stok_sesudah} ${stokModal.unit}.`
      );
      setStokModal(res.product);
      setStokForm({ mode: 'selisih', nilai: '', catatan: '' });
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  // Toggle status / delete menu
  const handleToggleProductStatus = async (p) => {
    const nextStatus = p.status === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await updateProduct.mutateAsync({ id: p.id, status: nextStatus });
      toast.success(
        nextStatus === 'nonaktif'
          ? `Menu "${p.nama_produk}" dinonaktifkan.`
          : `Menu "${p.nama_produk}" diaktifkan kembali.`
      );
      setDeactivateTarget(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteOrDeactivate = async (p) => {
    try {
      const res = await deleteProduct.mutateAsync(p.id);
      toast.success(res.message);
      setDeactivateTarget(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Category actions
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const res = await createCategory.mutateAsync({ nama_kategori: newCatName.trim() });
      toast.success(`Kategori "${res.category.nama_kategori}" ditambahkan.`);
      setNewCatName('');
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  const handleSaveCategoryEdit = async (e) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      await updateCategory.mutateAsync({
        id: editingCat.id,
        nama_kategori: editingCat.nama_kategori.trim(),
      });
      toast.success('Nama kategori diperbarui.');
      setEditingCat(null);
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  const handleToggleCategoryStatus = async (c) => {
    const nextStatus = c.status === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await updateCategory.mutateAsync({ id: c.id, status: nextStatus });
      toast.success(
        nextStatus === 'nonaktif'
          ? `Kategori "${c.nama_kategori}" dinonaktifkan.`
          : `Kategori "${c.nama_kategori}" diaktifkan kembali.`
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteCategory = async (c) => {
    try {
      await deleteCategory.mutateAsync(c.id);
      toast.success(`Kategori "${c.nama_kategori}" dihapus.`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const hasActiveFilter =
    search.trim() !== '' || selectedCategory !== 'all' || (isAdmin && aktifFilter !== 'all');

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    if (isAdmin) setAktifFilter('all');
  };

  return (
    <div className="menu-page">
      <div className="page-header">
        <div>
          <h1>{isAdmin ? 'Kelola menu & stok' : 'Daftar menu'}</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Atur daftar menu kafe, kategori, harga jual/pokok, dan pantau stok bahan terjual.'
              : 'Lihat daftar menu aktif, harga, dan ketersediaan stok saat ini.'}
          </p>
        </div>

        {isAdmin && (
          <div className="header-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCatModalOpen(true)}
            >
              Kelola kategori
            </button>
            <button type="button" className="btn-primary" onClick={openCreateMenu}>
              Tambah menu
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="menu-toolbar">
        <div className="search-box">
          <label htmlFor="menu-search" className="sr-only">
            Cari menu
          </label>
          <input
            id="menu-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama menu atau kode (mis. COF-001)..."
          />
        </div>

        <div className="filter-pills" role="group" aria-label="Filter kategori">
          <button
            type="button"
            className={`pill-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Semua kategori
          </button>
          {(isAdmin ? categories : activeCategories).map((c) => (
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

        {isAdmin && (
          <div className="status-filter">
            <label htmlFor="aktif-filter" className="sr-only">
              Filter status menu
            </label>
            <select
              id="aktif-filter"
              value={aktifFilter}
              onChange={(e) => setAktifFilter(e.target.value)}
            >
              <option value="all">Semua status</option>
              <option value="true">Menu aktif saja</option>
              <option value="false">Menu nonaktif saja</option>
            </select>
          </div>
        )}
      </div>

      {/* Info strip */}
      {!prodLoading && !prodError && (
        <div className="menu-summary-strip">
          <span>
            Menampilkan <strong>{products.length}</strong> menu
          </span>
          {lowStockCount > 0 && (
            <span className="low-stock-alert-pill">
              {lowStockCount} menu stok rendah / habis
            </span>
          )}
        </div>
      )}

      {/* States */}
      {(prodLoading || catLoading) && (
        <div className="state-box">
          <p>Memuat daftar menu...</p>
        </div>
      )}

      {prodError && (
        <div className="state-box state-error" role="alert">
          <p>{prodErrObj?.message || 'Gagal memuat daftar menu.'}</p>
          <button type="button" className="btn-secondary" onClick={() => refetch()}>
            Coba lagi
          </button>
        </div>
      )}

      {!prodLoading && !prodError && products.length === 0 && (
        <div className="state-box">
          <p>
            {hasActiveFilter
              ? 'Tidak ada menu yang cocok dengan pencarian atau filter.'
              : 'Belum ada menu terdaftar.'}
          </p>
          <div className="empty-cta-row">
            {hasActiveFilter ? (
              <button type="button" className="btn-secondary" onClick={resetFilters}>
                Atur ulang filter
              </button>
            ) : isAdmin ? (
              <button type="button" className="btn-primary" onClick={openCreateMenu}>
                Tambah menu
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Menu Table */}
      {!prodLoading && !prodError && products.length > 0 && (
        <div className="table-card">
          <table className="menu-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama menu</th>
                <th>Kategori</th>
                <th className="num-col">Harga jual</th>
                {isAdmin && <th className="num-col">Harga pokok</th>}
                <th className="num-col">Stok</th>
                <th>Status</th>
                {isAdmin && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.status === 'nonaktif' ? 'row-inactive' : ''}>
                  <td data-label="Kode">
                    <code className="code-badge">{p.kode_produk}</code>
                  </td>
                  <td data-label="Nama menu">
                    <div className="menu-name-cell">
                      <span className="menu-name">{p.nama_produk}</span>
                      {p.harga_pokok > p.harga_jual && (
                        <span className="badge-kunyit" title="Harga pokok melebihi harga jual">
                          Margin negatif
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Kategori">{p.nama_kategori}</td>
                  <td data-label="Harga jual" className="num-col tabular-nums">
                    {formatRp(p.harga_jual)}
                  </td>
                  {isAdmin && (
                    <td data-label="Harga pokok" className="num-col tabular-nums text-muted">
                      {formatRp(p.harga_pokok)}
                    </td>
                  )}
                  <td data-label="Stok" className="num-col tabular-nums">
                    <div className="stock-cell">
                      <span>
                        {p.stok} {p.unit}
                      </span>
                      {p.stok === 0 ? (
                        <span className="badge-delima">Habis</span>
                      ) : p.stok_rendah ? (
                        <span className="badge-kunyit">
                          Stok rendah (min {p.stok_minimum})
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className={`status-pill status-${p.status}`}>
                      {p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td data-label="Aksi">
                      <div className="action-group">
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => openStokModal(p)}
                        >
                          Sesuaikan stok
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => openEditMenu(p)}
                        >
                          Ubah
                        </button>
                        {p.status === 'aktif' ? (
                          <button
                            type="button"
                            className="btn-action btn-danger-outline"
                            onClick={() => setDeactivateTarget(p)}
                          >
                            {p.pernah_dipesan ? 'Nonaktifkan' : 'Hapus / Nonaktifkan'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-action btn-success-outline"
                            onClick={() => handleToggleProductStatus(p)}
                            disabled={updateProduct.isPending}
                          >
                            Aktifkan
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Tambah / Ubah Menu */}
      {menuModal && (
        <Modal
          titleId="menu-modal-title"
          panelClassName="modal-panel modal-wide"
          onClose={() => setMenuModal(null)}
        >
            <h2 id="menu-modal-title">
              {menuModal.mode === 'create'
                ? 'Tambah menu baru'
                : `Ubah menu: ${menuModal.product.nama_produk}`}
            </h2>

            <form onSubmit={handleMenuFormSubmit} className="modal-form">
              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="menu-kode">Kode produk</label>
                  <input
                    id="menu-kode"
                    type="text"
                    value={menuForm.kode_produk}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, kode_produk: e.target.value })
                    }
                    placeholder="Contoh: COF-006"
                    required
                    minLength={2}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="menu-kategori">Kategori</label>
                  <select
                    id="menu-kategori"
                    value={menuForm.category_id}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, category_id: e.target.value })
                    }
                    required
                  >
                    <option value="">Pilih kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama_kategori}
                        {c.status === 'nonaktif' ? ' (Nonaktif)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="menu-nama">Nama menu</label>
                <input
                  id="menu-nama"
                  type="text"
                  value={menuForm.nama_produk}
                  onChange={(e) =>
                    setMenuForm({ ...menuForm, nama_produk: e.target.value })
                  }
                  placeholder="Contoh: Cold Brew Caramel"
                  required
                  minLength={2}
                />
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="menu-harga-jual">Harga jual (Rp)</label>
                  <input
                    id="menu-harga-jual"
                    type="number"
                    min="0"
                    step="1"
                    value={menuForm.harga_jual}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, harga_jual: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="menu-harga-pokok">Harga pokok (Rp)</label>
                  <input
                    id="menu-harga-pokok"
                    type="number"
                    min="0"
                    step="1"
                    value={menuForm.harga_pokok}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, harga_pokok: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {Number(menuForm.harga_pokok) > Number(menuForm.harga_jual) &&
                menuForm.harga_jual !== '' && (
                  <div className="warning-banner" role="alert">
                    Perhatian: Harga pokok melebihi harga jual. Sistem akan meminta
                    konfirmasi sebelum menyimpan.
                  </div>
                )}

              <div className="form-grid-3">
                {menuModal.mode === 'create' && (
                  <div className="form-field">
                    <label htmlFor="menu-stok">Stok awal</label>
                    <input
                      id="menu-stok"
                      type="number"
                      min="0"
                      step="1"
                      value={menuForm.stok}
                      onChange={(e) => setMenuForm({ ...menuForm, stok: e.target.value })}
                      required
                    />
                  </div>
                )}
                <div className="form-field">
                  <label htmlFor="menu-stok-min">Batas stok minimum</label>
                  <input
                    id="menu-stok-min"
                    type="number"
                    min="0"
                    step="1"
                    value={menuForm.stok_minimum}
                    onChange={(e) =>
                      setMenuForm({ ...menuForm, stok_minimum: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="menu-unit">Satuan unit</label>
                  <input
                    id="menu-unit"
                    type="text"
                    value={menuForm.unit}
                    onChange={(e) => setMenuForm({ ...menuForm, unit: e.target.value })}
                    placeholder="cup / porsi / pcs"
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMenuModal(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createProduct.isPending || updateProduct.isPending}
                >
                  {createProduct.isPending || updateProduct.isPending
                    ? 'Menyimpan...'
                    : 'Simpan menu'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Konfirmasi Harga Pokok > Harga Jual */}
      {highCostConfirmPayload && (
        <Modal
          titleId="high-cost-title"
          onClose={() => setHighCostConfirmPayload(null)}
        >
            <h2 id="high-cost-title">Konfirmasi harga pokok lebih tinggi</h2>
            <p className="confirm-text">
              Harga pokok ({formatRp(highCostConfirmPayload.harga_pokok)}) lebih besar
              dari harga jual ({formatRp(highCostConfirmPayload.harga_jual)}). Apakah Anda
              yakin tetap ingin menyimpan menu ini?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setHighCostConfirmPayload(null)}
              >
                Periksa kembali
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => submitMenuPayload(highCostConfirmPayload, true)}
                disabled={createProduct.isPending || updateProduct.isPending}
              >
                Ya, tetap simpan
              </button>
            </div>
        </Modal>
      )}

      {/* Modal Penyesuaian Stok */}
      {stokModal && (
        <Modal
          titleId="stok-modal-title"
          panelClassName="modal-panel modal-wide"
          onClose={() => setStokModal(null)}
        >
            <h2 id="stok-modal-title">Sesuaikan stok: {stokModal.nama_produk}</h2>
            <p className="stok-current-info">
              Stok saat ini:{' '}
              <strong className="tabular-nums">
                {stokModal.stok} {stokModal.unit}
              </strong>{' '}
              (minimum: {stokModal.stok_minimum} {stokModal.unit})
            </p>

            <form onSubmit={handleStokSubmit} className="modal-form">
              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="stok-mode">Metode penyesuaian</label>
                  <select
                    id="stok-mode"
                    value={stokForm.mode}
                    onChange={(e) => setStokForm({ ...stokForm, mode: e.target.value })}
                  >
                    <option value="selisih">Tambah / kurangi (selisih)</option>
                    <option value="set">Set nilai stok akhir</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="stok-nilai">
                    {stokForm.mode === 'selisih'
                      ? 'Nilai selisih (mis. 10 atau -2)'
                      : 'Nilai stok baru'}
                  </label>
                  <input
                    id="stok-nilai"
                    type="number"
                    step="1"
                    value={stokForm.nilai}
                    onChange={(e) => setStokForm({ ...stokForm, nilai: e.target.value })}
                    placeholder={stokForm.mode === 'selisih' ? '+10 atau -3' : '25'}
                    required
                    autoFocus
                  />
                </div>
              </div>

              {previewNextStok !== null && (
                <div
                  className={`stok-preview ${previewNextStok < 0 ? 'stok-preview-error' : ''}`}
                >
                  Perkiraan stok akhir:{' '}
                  <strong className="tabular-nums">
                    {stokModal.stok} → {previewNextStok} {stokModal.unit}
                  </strong>
                  {previewNextStok < 0 && ' (tidak boleh negatif)'}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="stok-catatan">Catatan penyesuaian (opsional)</label>
                <input
                  id="stok-catatan"
                  type="text"
                  value={stokForm.catatan}
                  onChange={(e) => setStokForm({ ...stokForm, catatan: e.target.value })}
                  placeholder="Contoh: Restock pagi / bahan kedaluwarsa"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStokModal(null)}
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={updateStok.isPending || (previewNextStok !== null && previewNextStok < 0)}
                >
                  {updateStok.isPending ? 'Menyimpan...' : 'Simpan penyesuaian'}
                </button>
              </div>
            </form>

            {stockHistory.length > 0 && (
              <div className="stok-history-box">
                <h3>Riwayat penyesuaian terbaru</h3>
                <ul className="stok-history-list">
                  {stockHistory.slice(0, 5).map((h) => (
                    <li key={h.id}>
                      <span className="tabular-nums">
                        {h.stok_sebelum} → <strong>{h.stok_sesudah}</strong> (
                        {h.selisih >= 0 ? `+${h.selisih}` : h.selisih})
                      </span>
                      <span className="history-meta">
                        {h.catatan || h.mode} • {h.diubah_oleh}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </Modal>
      )}

      {/* Modal Konfirmasi Nonaktifkan / Hapus Menu */}
      {deactivateTarget && (
        <Modal
          titleId="deact-menu-title"
          onClose={() => setDeactivateTarget(null)}
        >
            <h2 id="deact-menu-title">
              {deactivateTarget.pernah_dipesan
                ? 'Nonaktifkan menu?'
                : 'Nonaktifkan atau hapus menu?'}
            </h2>
            <p className="confirm-text">
              {deactivateTarget.pernah_dipesan ? (
                <>
                  Menu <strong>{deactivateTarget.nama_produk}</strong> sudah pernah
                  dipesan sehingga tidak boleh dihapus permanen agar riwayat transaksi tetap
                  utuh. Nonaktifkan menu ini agar tidak muncul di daftar kasir?
                </>
              ) : (
                <>
                  Menu <strong>{deactivateTarget.nama_produk}</strong> belum pernah
                  dipesan. Anda dapat menonaktifkannya sementara atau menghapusnya permanen.
                </>
              )}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeactivateTarget(null)}
              >
                Batal
              </button>
              {!deactivateTarget.pernah_dipesan && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => handleDeleteOrDeactivate(deactivateTarget)}
                  disabled={deleteProduct.isPending}
                >
                  Hapus permanen
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleToggleProductStatus(deactivateTarget)}
                disabled={updateProduct.isPending}
              >
                Nonaktifkan saja
              </button>
            </div>
        </Modal>
      )}

      {/* Modal Kelola Kategori */}
      {catModalOpen && (
        <Modal
          titleId="cat-modal-title"
          panelClassName="modal-panel modal-wide"
          onClose={() => setCatModalOpen(false)}
        >
            <h2 id="cat-modal-title">Kelola kategori menu</h2>

            <form onSubmit={handleCreateCategory} className="cat-add-form">
              <label htmlFor="new-cat-name" className="sr-only">
                Nama kategori baru
              </label>
              <input
                id="new-cat-name"
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nama kategori baru (mis. Signature)"
                minLength={2}
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={createCategory.isPending}
              >
                Tambah
              </button>
            </form>

            <ul className="cat-list">
              {categories.map((c) => (
                <li key={c.id} className="cat-item">
                  {editingCat?.id === c.id ? (
                    <form onSubmit={handleSaveCategoryEdit} className="cat-edit-form">
                      <input
                        type="text"
                        value={editingCat.nama_kategori}
                        onChange={(e) =>
                          setEditingCat({ ...editingCat, nama_kategori: e.target.value })
                        }
                        required
                        minLength={2}
                      />
                      <button type="submit" className="btn-action">
                        Simpan
                      </button>
                      <button
                        type="button"
                        className="btn-action"
                        onClick={() => setEditingCat(null)}
                      >
                        Batal
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="cat-info">
                        <strong>{c.nama_kategori}</strong>
                        <span className="cat-count">
                          {c.jumlah_menu_aktif} menu aktif
                          {c.status === 'nonaktif' ? ' • Nonaktif' : ''}
                        </span>
                      </div>
                      <div className="action-group">
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() =>
                            setEditingCat({ id: c.id, nama_kategori: c.nama_kategori })
                          }
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          className={`btn-action ${
                            c.status === 'aktif'
                              ? 'btn-danger-outline'
                              : 'btn-success-outline'
                          }`}
                          onClick={() => handleToggleCategoryStatus(c)}
                        >
                          {c.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        {c.jumlah_menu_total === 0 && (
                          <button
                            type="button"
                            className="btn-action btn-danger-outline"
                            onClick={() => handleDeleteCategory(c)}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCatModalOpen(false)}
              >
                Tutup
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
