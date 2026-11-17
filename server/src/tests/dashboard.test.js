// src/tests/dashboard.test.js
import { describe, it, expect, afterAll } from '@jest/globals';
import { pool } from '../config/db.js';
import {
  getSummary,
  getTrend,
  getRecentOrders,
} from '../modules/dashboard/dashboard.service.js';

describe('Modul Dashboard (KPI, Batas Hari Jakarta, Hari Kosong, Pembatalan, & Hak Akses)', () => {
  const tempOrderIds = [];

  afterAll(async () => {
    if (tempOrderIds.length > 0) {
      await pool.query(`DELETE FROM order_details WHERE order_id = ANY($1::int[])`, [tempOrderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [tempOrderIds]);
    }
    await pool.end();
  });

  it('menghitung batas hari tepat di zona Asia/Jakarta (00:30 WIB masuk hari baru meski masih hari sebelumnya di UTC)', async () => {
    // 2026-12-10 23:30 WIB == 2026-12-10T16:30:00Z
    const oPrev = await pool.query(
      `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, total_subtotal, pajak_nominal, grand_total, metode_bayar, uang_dibayar, status, created_at)
       VALUES ('INV-TZ-PREV', 2, 'takeaway', 20000, 2000, 22000, 'qris', 22000, 'selesai', '2026-12-10T23:30:00+07:00')
       RETURNING id`
    );
    tempOrderIds.push(oPrev.rows[0].id);

    // 2026-12-11 00:30 WIB == 2026-12-10T17:30:00Z (still Dec 10 in UTC, but Dec 11 in Jakarta!)
    const oMidnightKasir = await pool.query(
      `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, total_subtotal, pajak_nominal, grand_total, metode_bayar, uang_dibayar, status, created_at)
       VALUES ('INV-TZ-0030', 2, 'takeaway', 30000, 3000, 33000, 'qris', 33000, 'diproses', '2026-12-11T00:30:00+07:00')
       RETURNING id`
    );
    tempOrderIds.push(oMidnightKasir.rows[0].id);

    // Admin order on 2026-12-11 02:00 WIB
    const oAdmin = await pool.query(
      `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, total_subtotal, pajak_nominal, grand_total, metode_bayar, uang_dibayar, status, created_at)
       VALUES ('INV-TZ-ADM', 1, 'takeaway', 50000, 5000, 55000, 'tunai', 55000, 'selesai', '2026-12-11T02:00:00+07:00')
       RETURNING id`
    );
    tempOrderIds.push(oAdmin.rows[0].id);

    // Cancelled order on 2026-12-11 03:00 WIB (must NOT be counted!)
    const oCancelled = await pool.query(
      `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, total_subtotal, pajak_nominal, grand_total, metode_bayar, uang_dibayar, status, created_at)
       VALUES ('INV-TZ-CANC', 2, 'takeaway', 100000, 10000, 110000, 'qris', 110000, 'dibatalkan', '2026-12-11T03:00:00+07:00')
       RETURNING id`
    );
    tempOrderIds.push(oCancelled.rows[0].id);

    // Order details for tie-breaker on 2026-12-11 (Americano qty=2 vs Espresso Single qty=2 -> Americano wins alphabetically)
    await pool.query(
      `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris)
       VALUES ($1, 1, 20000, 8000, 2, 40000), ($2, 2, 25000, 9000, 2, 50000)`,
      [oMidnightKasir.rows[0].id, oAdmin.rows[0].id]
    );
    // Cancelled order detail (qty=10) must NOT affect top-selling menu
    await pool.query(
      `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris)
       VALUES ($1, 4, 28000, 10000, 10, 280000)`,
      [oCancelled.rows[0].id]
    );

    const dec11Jakarta = new Date('2026-12-11T10:00:00+07:00');

    // Admin sees both non-cancelled Dec 11 orders (33000 + 55000 = 88000), NOT Dec 10 and NOT cancelled
    const adminSum = await getSummary(1, 'admin', dec11Jakarta);
    expect(adminSum.scope).toBe('cafe');
    expect(adminSum.total_omset).toBe(88000);
    expect(adminSum.jumlah_pesanan).toBe(2);
    expect(adminSum.menu_terlaris.nama_produk).toBe('Americano');
    expect(adminSum.menu_terlaris.total_qty).toBe(2);

    // Kasir (user_id=2) sees ONLY their own non-cancelled Dec 11 order (33000)
    const kasirSum = await getSummary(2, 'kasir', dec11Jakarta);
    expect(kasirSum.scope).toBe('personal');
    expect(kasirSum.total_omset).toBe(33000);
    expect(kasirSum.jumlah_pesanan).toBe(1);
    expect(kasirSum.menu_terlaris.nama_produk).toBe('Espresso Single');
  });

  it('hari tanpa transaksi mengembalikan 0 dan menu_terlaris null tanpa error', async () => {
    const emptyDay = new Date('2027-01-15T12:00:00+07:00');
    const sum = await getSummary(1, 'admin', emptyDay);

    expect(sum.total_omset).toBe(0);
    expect(sum.jumlah_pesanan).toBe(0);
    expect(sum.menu_terlaris).toBeNull();
    expect(sum.stok_rendah.count).toBeGreaterThanOrEqual(2); // Seeder has 2 low-stock items
  });

  it('tren 7 hari menghasilkan 7 hari berurutan terlama-ke-terbaru dengan 0 untuk hari kosong', async () => {
    const dec11Jakarta = new Date('2026-12-11T10:00:00+07:00');
    const res = await getTrend(1, 'admin', 7, dec11Jakarta);

    expect(res.trend).toHaveLength(7);
    expect(res.trend[0].tanggal).toBe('2026-12-05');
    expect(res.trend[5].tanggal).toBe('2026-12-10');
    expect(res.trend[5].omset).toBe(22000);
    expect(res.trend[6].tanggal).toBe('2026-12-11');
    expect(res.trend[6].omset).toBe(88000);
    expect(res.trend[1].omset).toBe(0);
  });

  it('getRecentOrders membatasi daftar transaksi milik kasir sendiri', async () => {
    const kasirRecent = await getRecentOrders(2, 'kasir', 8);
    expect(kasirRecent.length).toBeGreaterThan(0);
    // Every returned order must belong to kasir (we can check against admin's INV-TZ-ADM)
    expect(kasirRecent.some((o) => o.invoice_number === 'INV-TZ-ADM')).toBe(false);
  });
});
