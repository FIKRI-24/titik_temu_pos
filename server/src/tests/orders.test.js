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
import {
  createProduct,
  updateProduct,
  deleteOrDeactivateProduct,
} from '../modules/products/products.service.js';
import { validateVoucher } from '../modules/vouchers/vouchers.service.js';
import { formatInvoiceNumber } from '../utils/invoice.js';

describe('Perhitungan Total, Pembulatan, & Faktur', () => {
  it('menghitung subtotal, diskon persen/nominal, pajak PB1 10% dibulatkan, dan grand total', () => {
    const items = [
      { item: { kuantiti: 2, catatan_khusus: 'Less sugar' }, product: { id: 1, nama_produk: 'A', harga_jual: 25000, harga_pokok: 9000 } },
      { item: { kuantiti: 1 }, product: { id: 2, nama_produk: 'B', harga_jual: 33330, harga_pokok: 12000 } },
    ];
    const res = calculateOrderTotals(items, { kode: 'HEMAT10', tipe: 'persen', nilai: 10 });
    expect(res.total_subtotal).toBe(83330);
    expect(res.diskon_nominal).toBe(8333);
    expect(res.pajak_nominal).toBe(7500);
    expect(res.grand_total).toBe(82497);
  });

  it('membulatkan PB1 dan HEMAT10 secara konsisten pada nilai pecahan', () => {
    // 33333 * 10% = 3333.3 -> 3333; 33335 * 10% = 3333.5 -> 3334
    const p1 = calculateOrderTotals(
      [{ item: { kuantiti: 1 }, product: { id: 1, nama_produk: 'Pecahan 1', harga_jual: 33333, harga_pokok: 10000 } }],
      null
    );
    expect(p1.pajak_nominal).toBe(3333);
    expect(p1.grand_total).toBe(36666);

    const p2 = calculateOrderTotals(
      [{ item: { kuantiti: 1 }, product: { id: 2, nama_produk: 'Pecahan 2', harga_jual: 33335, harga_pokok: 10000 } }],
      { kode: 'HEMAT10', tipe: 'persen', nilai: 10 }
    );
    // diskon = Math.round(3333.5) = 3334 -> dpp = 30001 -> pajak = Math.round(3000.1) = 3000 -> grand = 33001
    expect(p2.diskon_nominal).toBe(3334);
    expect(p2.pajak_nominal).toBe(3000);
    expect(p2.grand_total).toBe(33001);
  });

  it('membatasi diskon KOPI5000 pada subtotal di bawah Rp5.000 menjadi sama dengan subtotal', () => {
    const items = [
      { item: { kuantiti: 1 }, product: { id: 1, nama_produk: 'Mini', harga_jual: 3000, harga_pokok: 1000 } },
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

describe('Validasi Zod & Batas Input Pesanan', () => {
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

  it('menolak qty 0, qty negatif, qty > 99, dan items > 30 baris', () => {
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
        items: [{ product_id: 1, kuantiti: 100 }],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    const thirtyOneItems = Array.from({ length: 31 }, (_, i) => ({
      product_id: i + 1,
      kuantiti: 1,
    }));
    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: thirtyOneItems,
        metode_bayar: 'qris',
      }).success
    ).toBe(false);
  });

  it('menolak nama_pemesan > 60 karakter, catatan_khusus > 120 karakter, dan uang_dibayar > 100.000.000', () => {
    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        nama_pemesan: 'a'.repeat(61),
        items: [validItem],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [{ product_id: 1, kuantiti: 1, catatan_khusus: 'x'.repeat(121) }],
        metode_bayar: 'qris',
      }).success
    ).toBe(false);

    expect(
      createOrderSchema.safeParse({
        tipe_pesanan: 'takeaway',
        items: [validItem],
        metode_bayar: 'tunai',
        uang_dibayar: 100000001,
      }).success
    ).toBe(false);
  });
});

describe('Transaksi Atomik, Idempotensi, Gapless Invoice, Rollback, & Edge Case DB', () => {
  const createdProductIds = [];
  const createdOrderIds = [];

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM order_details WHERE order_id = ANY($1::int[])`, [createdOrderIds]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [createdOrderIds]);
    }
    for (const pid of createdProductIds) {
      await pool.query(`DELETE FROM stock_adjustments WHERE product_id = $1`, [pid]);
      await deleteOrDeactivateProduct(pid);
    }
    await pool.end();
  });

  it('nomor faktur tetap berurutan tanpa lubang setelah pesanan gagal stok atau rollback', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `GAP-${Date.now()}`,
      nama_produk: 'Menu Uji Urutan Faktur',
      harga_jual: 20000,
      harga_pokok: 8000,
      stok: 5,
      stok_minimum: 1,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    // 1. Failed order (insufficient stock) -> should NOT increment order_counters
    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: p.id, kuantiti: 10 }],
        metode_bayar: 'qris',
      })
    ).rejects.toMatchObject({ status: 409 });

    // 2. First succeeding order
    const o1 = await createOrder(2, {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 1 }],
      metode_bayar: 'qris',
    });
    createdOrderIds.push(o1.id);

    // 3. Another failed order (insufficient cash) -> should NOT increment order_counters
    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: p.id, kuantiti: 1 }],
        metode_bayar: 'tunai',
        uang_dibayar: 1000,
      })
    ).rejects.toMatchObject({ status: 422 });

    // 4. Second succeeding order -> sequence MUST be +1 from o1
    const o2 = await createOrder(2, {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 1 }],
      metode_bayar: 'qris',
    });
    createdOrderIds.push(o2.id);

    const seq1 = parseInt(o1.invoice_number.split('-').pop(), 10);
    const seq2 = parseInt(o2.invoice_number.split('-').pop(), 10);
    expect(seq2).toBe(seq1 + 1);
  });

  it('Idempotency-Key mencegah pesanan ganda saat dua request identik dikirim bersamaan', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `IDEM-${Date.now()}`,
      nama_produk: 'Menu Uji Idempotensi',
      harga_jual: 30000,
      harga_pokok: 12000,
      stok: 10,
      stok_minimum: 2,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    const idemKey = `idem-test-${Date.now()}`;
    const payload = {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 2 }],
      metode_bayar: 'qris',
    };

    const [res1, res2] = await Promise.all([
      createOrder(2, payload, { idempotencyKey: idemKey }),
      createOrder(2, payload, { idempotencyKey: idemKey }),
    ]);

    expect(res1.id).toBe(res2.id);
    expect(res1.invoice_number).toBe(res2.invoice_number);
    createdOrderIds.push(res1.id);

    // Stock deducted ONCE (10 - 2 = 8), NOT twice!
    const stokRes = await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id]);
    expect(stokRes.rows[0].stok).toBe(8);
  });

  it('server selalu menghitung dengan harga menu terbaru walau harga berubah sebelum simpan', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `PRC-${Date.now()}`,
      nama_produk: 'Menu Berubah Harga',
      harga_jual: 20000,
      harga_pokok: 8000,
      stok: 10,
      stok_minimum: 2,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    // Admin updates price from 20000 to 35000
    await updateProduct(p.id, { harga_jual: 35000 });

    const order = await createOrder(2, {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 1 }],
      metode_bayar: 'qris',
    });
    createdOrderIds.push(order.id);

    expect(order.total_subtotal).toBe(35000);
    expect(order.pajak_nominal).toBe(3500);
    expect(order.grand_total).toBe(38500);
    expect(order.items[0].harga_satuan).toBe(35000);
  });

  it('menolak voucher tidak aktif/tidak ada dan menolak pesanan dengan menu nonaktif', async () => {
    await pool.query(
      `INSERT INTO vouchers (kode, tipe, nilai, aktif) VALUES ('MATI10', 'persen', 10, FALSE)
       ON CONFLICT (kode) DO UPDATE SET aktif = FALSE`
    );

    await expect(validateVoucher('MATI10', 50000)).rejects.toMatchObject({ status: 404 });
    await expect(validateVoucher('TIDAKADA', 50000)).rejects.toMatchObject({ status: 404 });

    const p = await createProduct({
      category_id: 1,
      kode_produk: `INACT-${Date.now()}`,
      nama_produk: 'Menu Nonaktif',
      harga_jual: 25000,
      harga_pokok: 10000,
      stok: 10,
      stok_minimum: 2,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);
    await updateProduct(p.id, { status: 'nonaktif' });

    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: p.id, kuantiti: 1 }],
        metode_bayar: 'qris',
      })
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      createOrder(2, {
        tipe_pesanan: 'takeaway',
        items: [{ product_id: 1, kuantiti: 1 }],
        voucher_kode: 'MATI10',
        metode_bayar: 'qris',
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('constraint database menolak kuantiti > 99, > 30 baris item, dan uang_dibayar > 100jt', async () => {
    const p = await createProduct({
      category_id: 1,
      kode_produk: `DBLIM-${Date.now()}`,
      nama_produk: 'Menu Uji Limit DB',
      harga_jual: 1000,
      harga_pokok: 500,
      stok: 200,
      stok_minimum: 1,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    createdProductIds.push(p.id);

    const order = await createOrder(2, {
      tipe_pesanan: 'takeaway',
      items: [{ product_id: p.id, kuantiti: 1 }],
      metode_bayar: 'qris',
    });
    createdOrderIds.push(order.id);

    // Qty > 99 rejected by DB CHECK
    await expect(
      pool.query(
        `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris)
         VALUES ($1, $2, 1000, 500, 100, 100000)`,
        [order.id, p.id]
      )
    ).rejects.toThrow(/check constraint/i);

    // > 30 rows rejected by DB trigger
    for (let i = 2; i <= 30; i++) {
      await pool.query(
        `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris)
         VALUES ($1, $2, 1000, 500, 1, 1000)`,
        [order.id, p.id]
      );
    }
    await expect(
      pool.query(
        `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris)
         VALUES ($1, $2, 1000, 500, 1, 1000)`,
        [order.id, p.id]
      )
    ).rejects.toThrow(/Maksimal 30 baris/i);

    // uang_dibayar > 100.000.000 rejected by DB CHECK
    await expect(
      pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, total_subtotal, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali)
         VALUES ('INV-LIM-1', 2, 'takeaway', 1000, 100, 1100, 'tunai', 100000001, 99998901)`
      )
    ).rejects.toThrow(/check constraint/i);
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

    const order = await createOrder(1, {
      tipe_pesanan: 'dine_in',
      nomor_meja: 4,
      items: [{ product_id: p.id, kuantiti: 3 }],
      metode_bayar: 'debit',
    });
    createdOrderIds.push(order.id);

    let stok = (await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id])).rows[0].stok;
    expect(stok).toBe(5);

    await expect(getOrderById(order.id, 2, 'kasir')).rejects.toMatchObject({ status: 403 });
    await expect(updateOrderStatus(order.id, 2, 'kasir', 'dibatalkan')).rejects.toMatchObject({ status: 403 });

    const cancelled = await updateOrderStatus(order.id, 1, 'admin', 'dibatalkan');
    expect(cancelled.status).toBe('dibatalkan');

    stok = (await pool.query(`SELECT stok FROM products WHERE id = $1`, [p.id])).rows[0].stok;
    expect(stok).toBe(8);

    await expect(updateOrderStatus(order.id, 1, 'admin', 'selesai')).rejects.toMatchObject({ status: 409 });
  });
});
