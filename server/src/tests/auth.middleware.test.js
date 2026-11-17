// src/tests/auth.middleware.test.js
import { describe, it, expect, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCookieOptions } from '../modules/auth/auth.controller.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Middleware requireAuth', () => {
  it('menolak permintaan tanpa cookie token dengan status 401', () => {
    const req = { cookies: {} };
    const res = createMockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toContain('Sesi tidak ditemukan');
  });

  it('menolak token tidak valid dengan status 401', () => {
    const req = { cookies: { token: 'invalid.jwt.token' } };
    const res = createMockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('menolak token kedaluwarsa dengan status 401', () => {
    const expiredToken = jwt.sign(
      { id: 1, username: 'admin', role: 'admin' },
      config.jwt.secret,
      { expiresIn: -10 }
    );
    const req = { cookies: { token: expiredToken } };
    const res = createMockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('meneruskan request dan mengisi req.user jika token valid', () => {
    const validToken = jwt.sign(
      { id: 2, username: 'kasir1', nama_lengkap: 'Budi Santoso', role: 'kasir' },
      config.jwt.secret,
      { expiresIn: '8h' }
    );
    const req = { cookies: { token: validToken } };
    const res = createMockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      id: 2,
      username: 'kasir1',
      role: 'kasir',
    });
  });
});

describe('Middleware requireRole', () => {
  it('menolak jika req.user tidak ada dengan status 401', () => {
    const req = {};
    const res = createMockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('menolak kasir mengakses endpoint khusus admin dengan status 403', () => {
    const req = { user: { id: 2, username: 'kasir1', role: 'kasir' } };
    const res = createMockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toContain('tidak memiliki izin');
  });

  it('mengizinkan admin mengakses endpoint khusus admin', () => {
    const req = { user: { id: 1, username: 'admin', role: 'admin' } };
    const res = createMockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('mengizinkan kasir mengakses endpoint yang menerima admin dan kasir', () => {
    const req = { user: { id: 2, username: 'kasir1', role: 'kasir' } };
    const res = createMockRes();
    const next = jest.fn();

    requireRole('admin', 'kasir')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('Konfigurasi Cookie & Keamanan', () => {
  it('mengaktifkan cookie secure: true saat NODE_ENV=production', () => {
    const prodOpts = getCookieOptions(true);
    expect(prodOpts.httpOnly).toBe(true);
    expect(prodOpts.sameSite).toBe('lax');
    expect(prodOpts.secure).toBe(true);

    const devOpts = getCookieOptions(false);
    expect(devOpts.secure).toBe(false);
  });
});
