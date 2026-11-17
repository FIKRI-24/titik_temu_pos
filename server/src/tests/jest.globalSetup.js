// src/tests/jest.globalSetup.js
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function globalSetup() {
  const testDbName = process.env.TEST_DB_NAME || 'titik_temu_pos_test';
  const baseCfg = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  };

  const adminPool = new pg.Pool({ ...baseCfg, database: 'postgres' });
  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await adminPool.query(`CREATE DATABASE "${testDbName}" ENCODING 'UTF8'`);
  } finally {
    await adminPool.end();
  }

  const testPool = new pg.Pool({ ...baseCfg, database: testDbName });
  try {
    const migSql = readFileSync(join(__dirname, '..', 'db', 'migrations', '001_create_tables.sql'), 'utf8');
    const seedSql = readFileSync(join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
    await testPool.query(migSql);
    await testPool.query(seedSql);
  } finally {
    await testPool.end();
  }
}
