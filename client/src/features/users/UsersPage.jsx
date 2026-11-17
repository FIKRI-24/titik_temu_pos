// src/features/users/UsersPage.jsx
import { useState } from 'react';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useResetPassword,
} from '../../api/hooks.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../../components/ui/ToastContext.jsx';
import './users.css';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useUsers();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    nama_lengkap: '',
    role: 'kasir',
    password: '',
  });
  const [editForm, setEditForm] = useState({
    nama_lengkap: '',
    role: 'kasir',
  });
  const [newPassword, setNewPassword] = useState('');

  const users = data?.users || [];

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await createUser.mutateAsync(createForm);
      toast.success(`Pengguna "${res.user.username}" berhasil ditambahkan.`);
      setShowCreateModal(false);
      setCreateForm({ username: '', nama_lengkap: '', role: 'kasir', password: '' });
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  const openEditModal = (u) => {
    setEditTarget(u);
    setEditForm({ nama_lengkap: u.nama_lengkap, role: u.role });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await updateUser.mutateAsync({ id: editTarget.id, ...editForm });
      toast.success(`Data pengguna "${editTarget.username}" diperbarui.`);
      setEditTarget(null);
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  const handleToggleStatus = async (u) => {
    const nextStatus = u.status === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await updateUser.mutateAsync({ id: u.id, status: nextStatus });
      toast.success(
        nextStatus === 'nonaktif'
          ? `Akun "${u.username}" dinonaktifkan.`
          : `Akun "${u.username}" diaktifkan kembali.`
      );
      setConfirmDeactivate(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await resetPassword.mutateAsync({ id: resetTarget.id, password: newPassword });
      toast.success(`Password untuk "${resetTarget.username}" berhasil direset.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.details?.[0]?.message || err.message);
    }
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1>Kelola pengguna</h1>
          <p className="page-subtitle">
            Tambah akun kasir atau admin, ubah role, nonaktifkan akun, dan reset password.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          Tambah pengguna
        </button>
      </div>

      {isLoading && (
        <div className="state-box">
          <p>Memuat daftar pengguna...</p>
        </div>
      )}

      {isError && (
        <div className="state-box state-error" role="alert">
          <p>{error?.message || 'Gagal memuat data pengguna.'}</p>
          <button type="button" className="btn-secondary" onClick={() => refetch()}>
            Coba lagi
          </button>
        </div>
      )}

      {!isLoading && !isError && users.length === 0 && (
        <div className="state-box">
          <p>Belum ada pengguna terdaftar. Tambahkan pengguna pertama.</p>
        </div>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <div className="table-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Nama lengkap</th>
                <th>Role</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="username-cell">{u.username}</span>
                      {isSelf && <span className="self-tag">Anda</span>}
                    </td>
                    <td>{u.nama_lengkap}</td>
                    <td>
                      <span className={`role-pill role-${u.role}`}>
                        {u.role === 'admin' ? 'Admin' : 'Kasir'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill status-${u.status}`}>
                        {u.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => openEditModal(u)}
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => {
                            setResetTarget(u);
                            setNewPassword('');
                          }}
                        >
                          Reset password
                        </button>
                        {!isSelf && (
                          u.status === 'aktif' ? (
                            <button
                              type="button"
                              className="btn-action btn-danger-outline"
                              onClick={() => setConfirmDeactivate(u)}
                            >
                              Nonaktifkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-action btn-success-outline"
                              onClick={() => handleToggleStatus(u)}
                              disabled={updateUser.isPending}
                            >
                              Aktifkan
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Tambah Pengguna */}
      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
          <div className="modal-panel">
            <h2 id="create-user-title">Tambah pengguna baru</h2>
            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-field">
                <label htmlFor="create-username">Username</label>
                <input
                  id="create-username"
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="Contoh: kasir2"
                  required
                  minLength={3}
                />
              </div>
              <div className="form-field">
                <label htmlFor="create-nama">Nama lengkap</label>
                <input
                  id="create-nama"
                  type="text"
                  value={createForm.nama_lengkap}
                  onChange={(e) => setCreateForm({ ...createForm, nama_lengkap: e.target.value })}
                  placeholder="Contoh: Siti Aminah"
                  required
                  minLength={2}
                />
              </div>
              <div className="form-field">
                <label htmlFor="create-role">Role</label>
                <select
                  id="create-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                >
                  <option value="kasir">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="create-password">Password awal (min. 8 karakter)</label>
                <input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimal 8 karakter"
                  required
                  minLength={8}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createUser.isPending}
                >
                  {createUser.isPending ? 'Menyimpan...' : 'Simpan pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Pengguna */}
      {editTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
          <div className="modal-panel">
            <h2 id="edit-user-title">Ubah pengguna: {editTarget.username}</h2>
            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-field">
                <label htmlFor="edit-nama">Nama lengkap</label>
                <input
                  id="edit-nama"
                  type="text"
                  value={editForm.nama_lengkap}
                  onChange={(e) => setEditForm({ ...editForm, nama_lengkap: e.target.value })}
                  required
                  minLength={2}
                />
              </div>
              <div className="form-field">
                <label htmlFor="edit-role">Role</label>
                <select
                  id="edit-role"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  disabled={editTarget.id === currentUser?.id}
                >
                  <option value="kasir">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
                {editTarget.id === currentUser?.id && (
                  <small className="field-hint">Role akun yang sedang aktif tidak dapat diubah.</small>
                )}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditTarget(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={updateUser.isPending}
                >
                  {updateUser.isPending ? 'Menyimpan...' : 'Simpan perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resetTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-pw-title">
          <div className="modal-panel">
            <h2 id="reset-pw-title">Reset password: {resetTarget.username}</h2>
            <form onSubmit={handleResetSubmit} className="modal-form">
              <div className="form-field">
                <label htmlFor="reset-password-input">Password baru (min. 8 karakter)</label>
                <input
                  id="reset-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setResetTarget(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetPassword.isPending}
                >
                  {resetPassword.isPending ? 'Menyimpan...' : 'Simpan password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Konfirmasi Nonaktifkan Akun */}
      {confirmDeactivate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-deact-title">
          <div className="modal-panel">
            <h2 id="confirm-deact-title">Nonaktifkan akun?</h2>
            <p className="confirm-text">
              Akun <strong>{confirmDeactivate.username}</strong> ({confirmDeactivate.nama_lengkap}) tidak akan bisa login lagi setelah dinonaktifkan.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmDeactivate(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleToggleStatus(confirmDeactivate)}
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? 'Memproses...' : 'Ya, nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
