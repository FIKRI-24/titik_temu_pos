// src/tests/security.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import express from 'express';
import app from '../app.js';
import { validateProductionConfig } from '../config/env.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { getCookieOptions } from '../modules/auth/auth.controller.js';

describe('Fase 6: Hardening Keamanan Produksi', () => {
  it('menolak JWT_SECRET kosong, < 32 karakter, berulang, atau placeholder pada NODE_ENV=production', () => {
    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: '',
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).toThrow(/32 karakter/i);

    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'terlalu_pendek_secret',
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).toThrow(/32 karakter/i);

    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'ganti_dengan_jwt_secret_yang_panjang_sekali_1234',
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).toThrow(/placeholder/i);

    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'placeholder_random_secret_32_characters_long',
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).toThrow(/placeholder/i);

    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(40),
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).toThrow(/lemah/i);

    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: '9c8e2a1f4b7d90e3c6a25f1b8d47e93c5a1b2c3d4e5f6a7b',
        CLIENT_ORIGIN: '*',
      })
    ).toThrow(/CLIENT_ORIGIN/i);

    // Valid strong production secret + origin succeeds
    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: '9c8e2a1f4b7d90e3c6a25f1b8d47e93c5a1b2c3d4e5f6a7b',
        CLIENT_ORIGIN: 'https://kasir.titiktemu.id',
      })
    ).not.toThrow();

    // Development environment allows test/dev secret cleanly
    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'development',
        JWT_SECRET: 'dev-only-short',
      })
    ).not.toThrow();
  });

  it('tidak membocorkan pesan SQL, kode error PG, atau stack trace pada respons error 500 internal', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const testApp = express();
    testApp.get('/boom-pg', (_req, _res, next) => {
      const pgErr = new Error('relation "order_details" does not exist');
      pgErr.code = '42P01';
      next(pgErr);
    });
    testApp.get('/domain-422', (_req, _res, next) => {
      const domErr = new Error('Stok tidak mencukupi.');
      domErr.status = 422;
      domErr.code = 'INSUFFICIENT_STOCK';
      next(domErr);
    });
    testApp.use(errorHandler);

    const srv = http.createServer(testApp);
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${srv.address().port}`;

    try {
      const res500 = await fetch(`${url}/boom-pg`);
      expect(res500.status).toBe(500);
      const body500 = await res500.json();
      expect(body500).toEqual({
        ok: false,
        data: null,
        error: { message: 'Terjadi kesalahan pada server.' },
      });
      const text500 = JSON.stringify(body500);
      expect(text500).not.toMatch(/42P01|order_details|relation|stack/i);

      const res422 = await fetch(`${url}/domain-422`);
      expect(res422.status).toBe(422);
      const body422 = await res422.json();
      expect(body422.error.code).toBe('INSUFFICIENT_STOCK');
    } finally {
      process.env.NODE_ENV = prevEnv;
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  describe('Header Helmet, CORS, dan Opsi Cookie Produksi', () => {
    let srv;
    let baseUrl;

    beforeAll(async () => {
      srv = http.createServer(app);
      await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${srv.address().port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => srv.close(resolve));
    });

    it('mengaktifkan header keamanan Helmet, Cache-Control anti-bfcache, dan flag cookie production', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-powered-by')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('cache-control')).toContain('no-store');

      expect(getCookieOptions(true)).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
      });
    });
  });
});
