// src/config/db.js
import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  process.stderr.write(`Unexpected error on idle client: ${err.message}\n`);
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    return true;
  } finally {
    client.release();
  }
}
