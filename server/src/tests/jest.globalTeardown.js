// src/tests/jest.globalTeardown.js
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';

export default async function globalTeardown() {
  const testDbName = process.env.TEST_DB_NAME || 'titik_temu_pos_test';
  const adminPool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
  } finally {
    await adminPool.end();
  }
}
