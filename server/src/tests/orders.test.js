// src/tests/orders.test.js
import { describe, it, expect, afterAll } from '@jest/globals';
import { pool } from '../config/db.js';
import { createOrderSchema } from '../modules/orders/orders.routes.js';
import {
  calculateOrderTotals,
  createOrder,
  getOrderById,
  updateOrderStatus,
} from '../modules/orders/orders.service.js';
import { createProduct, deleteOrDeactivateProduct } from '../modules/products/products.service.js';
import { formatInvoiceNumber, getTodayDateJakarta } from '../utils/invoice.js';

describe('Perhitungan Total & Faktur', () => {
  it('menghitung subtotal, diskon persen/nominal, pajak PB1 10% dibulatkan, dan grand total', () => {
    const items = [
      { item: { kuantiti: 2, catatan_khusus: 'Less sugar' }, product: { id: 1, nama_produk: 'A', harga_jual: 25000, harga_pokok: 9000 } },
      { item: { kuantiti: 1 }, product: { id: 2, nama_produk: 'B', harga_jual: 33330, harga_pokok: 12000 } },
    ];
    // subtotal = 50000 + 33330 = 83330
    // voucher 10% -> diskon = Math.round(83330 * 0.1) = 8333
    // dpp = 83330 - 8333 = 74997
    // pajak = Math.round(74997 * 0.1) = 7500
    // grand = 74997 + 7500 = 82497
    const res = calculateOrderTotals(items, { kode: 'HEMAT10', tipe: 'persen', nilai: 10 });
    expect(res.total_subtotal).toBe(83330);
    expect(res.diskon_nominal).toBe(8333);
    expect(res.pajak_nominal).toBe(7500);
    expect(res.grand_total).toBe(82497);
  });

  it('membatasi diskon nominal maksimal sebesar subtotal', () => {
    const items = [
      { item: { kuantiti: 1 }, product: { id: 1, nama_produk: 'A', harga_jual: 3000, harga_pokok: 1000 } },
    ];
    const res = calculateOrderTotals(items, { kode: 'KOPI5000', tipe: 'nominal', nilai: 5000 });
    expect(res.total_subtotal).toBe(3000);
    expect(res.diskon_nominal).toBe(3000);
    expect(res.pajak_nominal).toBe(0);
    expect(res.grand_total).toBe(0);
  });

  it('memformat nomor faktur INV-POS-YYYYMMDD-XXXX dengan 4 digit berurutan', () => {
    expect(formatInvoiceNumber('20261117', 1)).toBe('INV-POS-20261117-0001');
    expect(formatInvoiceNumber('20261117', 42)).toBe('INV-POS-20261117-0042');
  });
});

describe('Validasi Zod Payload Pesanan', () => {
  const validItem = { product_id: 1, kuantiti: 1 };

  it('menolak dine_in tanpa nomor_meja dan nomor_meja di luar 1..20', () => {
    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'dine_in',
        items: [validItem],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'dine_in',
        nomor_meja: 21,
        items: [validItem],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);
  });

  it('menerima takeaway tanpa nomor_meja', () => {
    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [validItem],
        metode_bayar: 'qris',
      }).success
    ).toBe(true);
  });

  it('menolak qty 0, qty negatif, dan items kosong', () => {
    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [{ product_id: 1, kuantiti: 0 }],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [{ product_id: 1, kuantiti: -2 }],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);
  });
});

describe('Transaksi Atomik Pesanan, Rollback, Konkurensi, & Pembatalan', () => {
  const createdProductIds = [];
  const createdOrderIds = [];

  afterAll(async () => {
    // Clean up test orders and products
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM order_details WHERE order_id = ANY($1::int[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [createdOrderIds]);
    }
    for (const pid of createdProductIds) {
      await pool.query(`DELETE FROM stock_adjustments WHERE product_id = $1`, [pid]);
      await deleteOrDeactivateProduct(pid);
    }
    const today = getTodayDateJakarta();
    await pool.query(`DELETE FROM order_counters WHERE tanggal = $1`, [today]);
    await pool.end();
  });

  it('menyimpan pesanan 5 item secara atomik, membuat faktur berurutan, dan mengurangi stok', async () => {
    const prods = [];
    for (let i = 1; i <= 5; i++) {
      const p = await createProduct({
        category_id: 1,
        kode_produk: `ORD5-${Date.now()}-${i}`,
        nama_produk: `Menu Lima ${i}`,
        harga_jual: 10000 * i,
        harga_pokok: 4000 * i,
        stok: 10,
        stok_minimum: 2,
        unit: 'cup',
        konfirmasi_harga_pokok_tinggi: false,
      });
      prods.push(p);
      createdProductIds.push(p.id);
    }

    const order = await createOrder(2, {
      tipe_pesanan: 'dine_in',
      nomor_meja: 7,
      nama_pemesan: 'Uji Lima Item',
      items: prods.map((p, idx) => ({
        product_id: p.id,
        kuantiti: idx + 1,
        catatan_khusus: idx === 0 ? 'Less sugar' : null,
      })),
      voucher_kode: 'HEMAT10',
      metode_bayar: 'tunai',
      uang_dibayar: 600000,
    });
    createdOrderIds.push(order.id);

    // Subtotal = 10000*1 + 20000*2 + 30000*3 + 40000*4 + 50000*5 = 550000
    // Diskon 10% = 55000, Pajak 10% * 495000 = 49500, Grand = 544500, Kembali = 55500
    expect(order.invoice_number).toMatch(/^INV-POS-\d{8}-\d{4}$/);
    expect(order.items).toHaveLength(5);
    expect(order.total_subtotal).toBe(550000);
    expect(order.diskon_nominal).toBe(55000);
    expect(order.pajak_nominal).toBe(49500);
    expect(order.grand_total).toBe(544500);
    expect(order.uang_kembali).toBe(55500);

    // Verify stock deducted
    for (let i = 0; i < 5; i++) {
      const r = await pool.query(`SELECT stok FROM products WHERE id = $1`, [prods[i].id]);
      expect(r.rows[0].stok).toBe(10 - (i + 1));
    }
  });

  it('menolak tunai kurang dari grand_total (422) dan stok kurang (409) tanpa mengurangi stok', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `ORDVAL-${Date.now()}`,
      nama_produk: 'Menu Validasi Bayar',
      harga_jual: 20000,
      harga_pokok: 8000,
      stok: 3,
      stok_minimum: 1,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    // Tunai kurang: grand_total = 22000, bayar 20000
    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: p.id, kuantiti: 1 }],
        metode_bayar: 'tunai',
        uang_dibayar: 20000,
      })
    ).rejects.toMatchObject({ status: 422 });

    // Stok kurang: minta 5, tersedia 3
    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: p.id, kuantiti: 5 }],
        metode_bayar: 'qris',
      })
    ).rejects.toMatchObject({ status: 409 });

    const r = await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id]);
    expect(r.rows[0].stok).toBe(3);
  });

  it('melakukan ROLLBACK penuh saat error terjadi di tengah transaksi (tidak ada baris yatim & stok utuh)', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `ORDRB-${Date.now()}`,
      nama_produk: 'Menu Uji Rollback',
      harga_jual: 30000,
      harga_pokok: 10000,
      stok: 5,
      stok_minimum: 1,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    const beforeOrdersCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM orders`)).rows[0].c;

    // Wrap pool.connect to throw an error right when inserting order_details (AFTER orders header & order_counters!)
    const fakePool = {
      async connect() {
        const realClient = await pool.connect();
        const origQuery = realClient.query.bind(realClient);
        return {
          release: () => realClient.release(),
          query: async (sql, params) => {
            if (typeof sql === 'string' && sql.includes('INSERT INTO order_details')) {
              throw new Error('Simulated mid-transaction DB failure');
            }
            return origQuery(sql, params);
          },
        };
      },
    };

    await expect(
      createOrder(
        2,
        {
          tipe_pesanan: 'takeaway',
          items: [{ product_id: p.id, kuantiti: 2 }],
          metode_bayar: 'qris',
        },
        { pool: fakePool }
      )
    ).rejects.toThrow('Simulated mid-transaction DB failure');

    const afterOrdersCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM orders`)).rows[0].c;
    const afterStok = (await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id])).rows[0].stok;

    expect(afterOrdersCount).toBe(beforeOrdersCount);
    expect(afterStok).toBe(5);
  });

  it('dua permintaan bersamaan untuk stok terakhir (stok=1): hanya satu berhasil, satu ditolak 409', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `ORDCONC-${Date.now()}`,
      nama_produk: 'Menu Stok Terakhir',
      harga_jual: 25000,
      harga_pokok: 9000,
      stok: 1,
      stok_minimum: 1,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    const payload = {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 1 }],
      metode_bayar: 'qris',
    };

    const results = await Promise.allSettled([
      createOrder(2, payload),
      createOrder(1, payload),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.status).toBe(409);

    createdOrderIds.push(fulfilled[0].value.id);
    const stokRes = await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id]);
    expect(stokRes.rows[0].stok).toBe(0);
  });

  it('pembatalan pesanan mengembalikan stok dan kasir tidak bisa akses pesanan kasir lain (403)', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `ORDCANC-${Date.now()}`,
      nama_produk: 'Menu Uji Batal',
      harga_jual: 20000,
      harga_pokok: 8000,
      stok: 8,
      stok_minimum: 2,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    // Created by admin (user_id=1)
    const order = await createOrder(1, {
      tipe_pesanan: 'dine_in',
      nomor_meja: 4,
      items: [{ product_id: p.id, kuantiti: 3 }],
      metode_bayar: 'debit',
    });
    createdOrderIds.push(order.id);

    let stok = (await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id])).rows[0].stok;
    expect(stok).toBe(5);

    // Kasir (user_id=2) tries to read or cancel admin's order -> 403
    await expect(getOrderById(order.id, 2, 'kasir')).rejects.toMatchObject({ status: 403 });
    await expect(updateOrderStatus(order.id, 2, 'kasir', 'dibatalkan')).rejects.toMatchObject({ status: 403 });

    // Admin cancels order -> stock restored from 5 to 8
    const cancelled = await updateOrderStatus(order.id, 1, 'admin', 'dibatalkan');
    expect(cancelled.status).toBe('dibatalkan');

    stok = (await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id])).rows[0].stok;
    expect(stok).toBe(8);

    // Cannot change status again once dibatalkan
    await expect(updateOrderStatus(order.id, 1, 'admin', 'selesai')).rejects.toMatchObject({ status: 409 });
  });
});
