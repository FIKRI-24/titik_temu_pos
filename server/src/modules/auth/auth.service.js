// src/modules/auth/auth.service.js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db.js';
import { config } from '../../config/env.js';

const GENERIC_ERROR = 'Username atau password tidak sesuai.';
// Valid 60-character bcrypt hash used solely for constant-time comparison when user is not found
const DUMMY_HASH = '$2b$10$qVPXUda55w2Krh017znKsukS6Pt/D3sQdneIdd4m1Myfv3yoIg2dq';

export async function login(username, password) {
  const result = await pool.query(
    `SELECT id, username, password_hash, nama_lengkap, role, status
     FROM users WHERE username = $1`,
    [username]
  );

  const user = result.rows[0];
  const hashToCompare = user ? user.password_hash : DUMMY_HASH;
  const match = await bcrypt.compare(password, hashToCompare);

  if (!user || !match) {
    const err = new Error(GENERIC_ERROR);
    err.status = 401;
    throw err;
  }

  if (user.status === 'nonaktif') {
    const err = new Error('Akun Anda telah dinonaktifkan. Hubungi administrator.');
    err.status = 403;
    throw err;
  }

  const payload = {
    id: user.id,
    username: user.username,
    nama_lengkap: user.nama_lengkap,
    role: user.role,
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  return { token, user: payload };
}

export async function getMe(userId) {
  const result = await pool.query(
    `SELECT id, username, nama_lengkap, role, status, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}
