// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { fail } from '../utils/response.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return fail(res, 'Sesi tidak ditemukan. Silakan login kembali.', 401);
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch {
    return fail(res, 'Sesi tidak valid atau sudah berakhir. Silakan login kembali.', 401);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 'Sesi tidak ditemukan.', 401);
    }
    if (!roles.includes(req.user.role)) {
      return fail(res, 'Anda tidak memiliki izin untuk mengakses fitur ini.', 403);
    }
    next();
  };
}
