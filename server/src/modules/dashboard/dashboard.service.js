// src/modules/dashboard/dashboard.service.js
import { pool } from '../../config/db.js';

/**
 * Get dashboard summary for "today" in Asia/Jakarta timezone.
 * - admin sees entire café
 * - kasir sees only their own orders
 * - omset and count include status IN ('diproses', 'selesai')
 */
export async function getSummary(userId, role, nowDate = new Date()) {
  const isAdmin = role === 'admin';
  const params = [nowDate.toISOString()];
  let userFilterSql = '';
  if (!isAdmin) {
    params.push(userId);
    userFilterSql = `AND o.user_id = $${params.length}`;
  }

  // 1. Today's revenue and order count (half-open interval in Asia/Jakarta)
  const kpiRes = await pool.query(
    `WITH jakarta_bounds AS (
       SELECT
         ((($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date)::timestamp AT TIME ZONE 'Asia/Jakarta') AS start_ts,
         (((($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date + 1)::timestamp) AT TIME ZONE 'Asia/Jakarta') AS end_ts
     )
     SELECT
       COALESCE(SUM(o.grand_total), 0)::int AS total_omset,
       COUNT(o.id)::int AS jumlah_pesanan,
       COUNT(o.id) FILTER (WHERE o.status = 'diproses')::int AS jumlah_diproses,
       COUNT(o.id) FILTER (WHERE o.status = 'selesai')::int AS jumlah_selesai
     FROM jakarta_bounds b
     LEFT JOIN orders o
       ON o.created_at >= b.start_ts
      AND o.created_at < b.end_ts
      AND o.status IN ('diproses', 'selesai')
      ${userFilterSql}`,
    params
  );

  // 2. Top-selling menu today (deterministic tie-breaker: highest qty, then alphabetical product name)
  const topRes = await pool.query(
    `WITH jakarta_bounds AS (
       SELECT
         ((($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date)::timestamp AT TIME ZONE 'Asia/Jakarta') AS start_ts,
         (((($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date + 1)::timestamp) AT TIME ZONE 'Asia/Jakarta') AS end_ts
     )
     SELECT p.id, p.nama_produk, p.unit, SUM(od.kuantiti)::int AS total_qty
     FROM orders o
     CROSS JOIN jakarta_bounds b
     JOIN order_details od ON od.order_id = o.id
     JOIN products p ON p.id = od.product_id
     WHERE o.created_at >= b.start_ts
       AND o.created_at < b.end_ts
       AND o.status IN ('diproses', 'selesai')
       ${userFilterSql}
     GROUP BY p.id, p.nama_produk, p.unit
     ORDER BY total_qty DESC, p.nama_produk ASC
     LIMIT 1`,
    params
  );

  // 3. Low stock warning (active products with stok <= stok_minimum)
  const lowStockRes = await pool.query(
    `SELECT id, kode_produk, nama_produk, stok, stok_minimum, unit
     FROM products
     WHERE status = 'aktif' AND stok <= stok_minimum
     ORDER BY stok ASC, nama_produk ASC`
  );

  const kpi = kpiRes.rows[0];
  return {
    scope: isAdmin ? 'cafe' : 'personal',
    total_omset: kpi.total_omset,
    jumlah_pesanan: kpi.jumlah_pesanan,
    jumlah_diproses: kpi.jumlah_diproses,
    jumlah_selesai: kpi.jumlah_selesai,
    menu_terlaris: topRes.rows[0] || null,
    stok_rendah: {
      count: lowStockRes.rows.length,
      items: lowStockRes.rows,
    },
  };
}

/**
 * Get daily revenue trend for the last N days in Asia/Jakarta (oldest to newest)
 * plus category revenue distribution over the same period.
 */
export async function getTrend(userId, role, days = 7, nowDate = new Date()) {
  const safeDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 30);
  const isAdmin = role === 'admin';
  const params = [safeDays, nowDate.toISOString()];
  let userFilterSql = '';
  if (!isAdmin) {
    params.push(userId);
    userFilterSql = `AND o.user_id = $${params.length}`;
  }

  const trendRes = await pool.query(
    `WITH day_series AS (
       SELECT generate_series(
         ($2::timestamptz AT TIME ZONE 'Asia/Jakarta')::date - ($1::int - 1),
         ($2::timestamptz AT TIME ZONE 'Asia/Jakarta')::date,
         INTERVAL '1 day'
       )::date AS tanggal
     )
     SELECT
       TO_CHAR(d.tanggal, 'YYYY-MM-DD') AS tanggal,
       COALESCE(SUM(o.grand_total), 0)::int AS omset,
       COUNT(o.id)::int AS jumlah_pesanan
     FROM day_series d
     LEFT JOIN orders o
       ON (o.created_at AT TIME ZONE 'Asia/Jakarta')::date = d.tanggal
      AND o.status IN ('diproses', 'selesai')
      ${userFilterSql}
     GROUP BY d.tanggal
     ORDER BY d.tanggal ASC`,
    params
  );

  // Format Indonesian short labels on server for consistency
  const trend = trendRes.rows.map((row) => {
    const dt = new Date(`${row.tanggal}T12:00:00+07:00`);
    const label = dt.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
    });
    return {
      tanggal: row.tanggal,
      label,
      omset: row.omset,
      jumlah_pesanan: row.jumlah_pesanan,
    };
  });

  // Category distribution over the same N-day window
  const catFilterSql = !isAdmin ? `AND user_id = $3` : '';
  const catRes = await pool.query(
    `WITH filtered_orders AS (
       SELECT id
       FROM orders
       WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date >= ($2::timestamptz AT TIME ZONE 'Asia/Jakarta')::date - ($1::int - 1)
         AND (created_at AT TIME ZONE 'Asia/Jakarta')::date <= ($2::timestamptz AT TIME ZONE 'Asia/Jakarta')::date
         AND status IN ('diproses', 'selesai')
         ${catFilterSql}
     )
     SELECT
       c.id,
       c.nama_kategori,
       COALESCE(SUM(od.subtotal_baris), 0)::int AS total_penjualan,
       COALESCE(SUM(od.kuantiti), 0)::int AS total_qty
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     LEFT JOIN order_details od
       ON od.product_id = p.id
      AND od.order_id IN (SELECT id FROM filtered_orders)
     WHERE c.status = 'aktif'
     GROUP BY c.id, c.nama_kategori
     ORDER BY total_penjualan DESC, c.nama_kategori ASC`,
    params
  );

  return {
    days: safeDays,
    trend,
    distribusi_kategori: catRes.rows,
  };
}

/**
 * Get most recent orders.
 * - admin sees all
 * - kasir sees only their own
 */
export async function getRecentOrders(userId, role, limit = 8) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
  const isAdmin = role === 'admin';
  const params = [safeLimit];
  let whereSql = '';

  if (!isAdmin) {
    params.push(userId);
    whereSql = `WHERE o.user_id = $2`;
  }

  const result = await pool.query(
    `SELECT o.id, o.invoice_number, o.tipe_pesanan, o.nomor_meja, o.nama_pemesan,
            o.grand_total, o.metode_bayar, o.status, o.created_at,
            u.nama_lengkap AS kasir_nama
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${whereSql}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $1`,
    params
  );

  return result.rows;
}
