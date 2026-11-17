// src/modules/users/users.service.js
import bcrypt from 'bcrypt';
import { pool } from '../../config/db.js';

const BCRYPT_ROUNDS = 10;

export async function getAllUsers() {
  const result = await pool.query(
    `SELECT id, username, nama_lengkap, role, status, created_at
     FROM users
     ORDER BY id ASC`
  );
  return result.rows;
}

export async function createUser({ username, password, nama_lengkap, role }) {
  const existing = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );

  if (existing.rows.length > 0) {
    const err = new Error(`Username '${username}' sudah digunakan. Pilih username lain.`);
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await pool.query(
    `INSERT INTO users (username, password_hash, nama_lengkap, role, status)
     VALUES ($1, $2, $3, $4, 'aktif')
     RETURNING id, username, nama_lengkap, role, status, created_at`,
    [username, passwordHash, nama_lengkap, role]
  );

  return result.rows[0];
}

export async function updateUser(id, actorUserId, { nama_lengkap, role, status }) {
  const targetRes = await pool.query(
    `SELECT id, username, nama_lengkap, role, status FROM users WHERE id = $1`,
    [id]
  );

  if (targetRes.rows.length === 0) {
    const err = new Error('Pengguna tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  const target = targetRes.rows[0];

  if (id === actorUserId) {
    if (status === 'nonaktif') {
      const err = new Error('Anda tidak dapat menonaktifkan akun yang sedang digunakan.');
      err.status = 400;
      throw err;
    }
    if (role && role !== target.role) {
      const err = new Error('Anda tidak dapat mengubah role akun yang sedang digunakan.');
      err.status = 400;
      throw err;
    }
  }

  const nextNama = nama_lengkap ?? target.nama_lengkap;
  const nextRole = role ?? target.role;
  const nextStatus = status ?? target.status;

  const result = await pool.query(
    `UPDATE users
     SET nama_lengkap = $1, role = $2, status = $3
     WHERE id = $4
     RETURNING id, username, nama_lengkap, role, status, created_at`,
    [nextNama, nextRole, nextStatus, id]
  );

  return result.rows[0];
}

export async function resetPassword(id, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2
     RETURNING id, username, nama_lengkap, role, status`,
    [passwordHash, id]
  );

  if (result.rows.length === 0) {
    const err = new Error('Pengguna tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  return result.rows[0];
}
