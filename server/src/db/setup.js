// src/db/setup.js
// Script to setup database: create database if needed, run migrations and seed.sql
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'titik_temu_pos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function createDatabase() {
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const dbName = process.env.DB_NAME || 'titik_temu_pos';
  const client = await adminPool.connect();
  try {
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (result.rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
      process.stdout.write(`Database "${dbName}" dibuat.\n`);
    } else {
      process.stdout.write(`Database "${dbName}" sudah ada.\n`);
    }
  } finally {
    client.release();
    await adminPool.end();
  }
}

async function runMigrations(client) {
  const migrationPath = join(__dirname, 'migrations', '001_create_tables.sql');
  const sql = readFileSync(migrationPath, 'utf8');
  await client.query(sql);
  process.stdout.write('Migrasi tabel selesai.\n');
}

async function runSeed(client) {
  const seedPath = join(__dirname, 'seed.sql');
  const sql = readFileSync(seedPath, 'utf8');
  await client.query(sql);
  process.stdout.write('Seed data (seed.sql) selesai.\n');
}

async function main() {
  process.stdout.write('=== Setup Database Titik Temu Kopi POS ===\n');

  try {
    await createDatabase();

    const client = await pool.connect();
    try {
      await runMigrations(client);
      await runSeed(client);
      process.stdout.write('\n✅ Database setup selesai!\n');
      process.stdout.write('Akun uji:\n');
      process.stdout.write('  Admin   : username=admin    | password=Admin#2026\n');
      process.stdout.write('  Kasir   : username=kasir1   | password=Kasir#2026\n');
    } finally {
      client.release();
    }
  } catch (err) {
    process.stderr.write(`❌ Error: ${err.message}\n`);
    process.stderr.write(err.stack + '\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
