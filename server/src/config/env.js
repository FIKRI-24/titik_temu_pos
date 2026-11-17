// src/config/env.js
import dotenv from 'dotenv';
dotenv.config();

const PLACEHOLDER_SECRET_REGEX =
  /(placeholder|ganti|changeme|example|your[_-]?secret|dev[_-]?secret|jwt[_-]?secret|secret[_-]?key|rahasia|123456)/i;

/**
 * Validate production-critical environment variables before starting the server.
 * Refuses insecure JWT secrets (empty, < 32 chars, trivial/repeated, or placeholder)
 * and wildcard CORS origins with credentials.
 */
export function validateProductionConfig(envObj = process.env) {
  const nodeEnv = envObj.NODE_ENV || 'development';
  if (nodeEnv !== 'production') {
    return;
  }

  const secret = (envObj.JWT_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error(
      'Konfigurasi produksi tidak aman: JWT_SECRET wajib minimal 32 karakter acak.'
    );
  }
  if (PLACEHOLDER_SECRET_REGEX.test(secret) || new Set(secret).size < 6) {
    throw new Error(
      'Konfigurasi produksi tidak aman: JWT_SECRET tidak boleh menggunakan nilai contoh/placeholder atau pola lemah.'
    );
  }

  const origin = (envObj.CLIENT_ORIGIN || envObj.CLIENT_URL || '').trim();
  if (!origin || origin === '*') {
    throw new Error(
      'Konfigurasi produksi tidak aman: CLIENT_ORIGIN wajib diisi URL spesifik (tidak boleh "*").'
    );
  }
}

const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

validateProductionConfig(process.env);

const resolvedDbName =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DB_NAME || 'titik_temu_pos_test'
    : process.env.DB_NAME;

export const config = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: resolvedDbName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173',
};
