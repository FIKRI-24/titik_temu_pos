// src/tests/seeder.test.js
import { describe, it, expect, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Konsistensi Seeder & Simulasi Waktu Asia/Jakarta', () => {
  const seedRaw = readFileSync(join(__dirname, '..', 'db', 'seed.sql'), 'utf8');

  afterAll(async () => {
    // Restore pristine seed after time-simulated tests
    await pool.query(seedRaw);
    await pool.end();
  });

  it.each([
    ['00:30 WIB', '2026-11-17 00:30:00+07:00', '2026-11-17'],
    ['08:00 WIB', '2026-11-17 08:00:00+07:00', '2026-11-17'],
    ['23:30 WIB', '2026-11-17 23:30:00+07:00', '2026-11-17'],
  ])('seeder pada simulasi waktu %s tidak memiliki pesanan di masa depan dan 5 query konsistensi = 0', async (_label, simTs, expectedDate) => {
    const simSql = seedRaw.replaceAll('NOW()', `'${simTs}'::timestamptz`);
    await pool.query(simSql);

    // 1. Check no order is in the future relative to simulated time
    const futureRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE created_at > $1::timestamptz`,
      [simTs]
    );
    expect(futureRes.rows[0].c).toBe(0);

    // 2. Check today's orders belong to expected Jakarta date & match invoice_number + order_counters
    const todayOrdersRes = await pool.query(
      `SELECT invoice_number, (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS jkt_date
       FROM orders
       WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = $1::date`,
      [expectedDate]
    );
    expect(todayOrdersRes.rows).toHaveLength(4);
    for (const row of todayOrdersRes.rows) {
      expect(row.jkt_date).toBe(expectedDate);
      expect(row.invoice_number).toContain(expectedDate.replace(/-/g, ''));
    }

    const counterRes = await pool.query(
      `SELECT nomor_terakhir FROM order_counters WHERE tanggal = $1::date`,
      [expectedDate]
    );
    expect(counterRes.rows[0].nomor_terakhir).toBe(4);

    // 3. Five consistency queries must all be 0
    const consistencyRes = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE grand_total <> total_subtotal - diskon_nominal + pajak_nominal) AS a_grand_mismatch,
        (SELECT COUNT(*)::int FROM orders o WHERE o.total_subtotal <> COALESCE((SELECT SUM(od.subtotal_baris) FROM order_details od WHERE od.order_id = o.id), 0)) AS b_sub_mismatch,
        (SELECT COUNT(*)::int FROM orders WHERE pajak_nominal <> ROUND((total_subtotal - diskon_nominal) * 0.1)) AS c_tax_mismatch,
        (SELECT COUNT(*)::int FROM orders WHERE tipe_pesanan = 'dine_in' AND nomor_meja IS NULL) AS d_dine_in_no_table,
        (SELECT COUNT(*)::int FROM products WHERE stok < 0) AS e_negative_stock
    `);
    expect(consistencyRes.rows[0]).toEqual({
      a_grand_mismatch: 0,
      b_sub_mismatch: 0,
      c_tax_mismatch: 0,
      d_dine_in_no_table: 0,
      e_negative_stock: 0,
    });
  });
});
