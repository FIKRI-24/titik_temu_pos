// src/tests/products.test.js
import { describe, it, expect, afterAll } from '@jest/globals';
import { pool } from '../config/db.js';
import {
  createProductSchema,
  updateStockSchema,
} from '../modules/products/products.routes.js';
import {
  validateCostVsPrice,
  computeStockAdjustment,
  createProduct,
  updateProductStock,
  deleteOrDeactivateProduct,
} from '../modules/products/products.service.js';
import { generateSlug } from '../modules/categories/categories.service.js';

describe('Validasi Zod Produk & Stok', () => {
  const basePayload = {
    category_id: 1,
    kode_produk: 'TEST-001',
    nama_produk: 'Kopi Uji',
    harga_jual: 25000,
    harga_pokok: 10000,
    stok: 15,
    stok_minimum: 5,
    unit: 'cup',
  };

  it('menerima payload produk yang valid', () => {
    const res = createProductSchema.safeParse(basePayload);
    expect(res.success).toBe(true);
  });

  it('menolak harga_jual negatif, harga_pokok negatif, stok negatif, dan stok_minimum negatif', () => {
    expect(createProductSchema.safeParse({ ...basePayload, harga_jual: -100 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...basePayload, harga_pokok: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...basePayload, stok: -5 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...basePayload, stok_minimum: -1 }).success).toBe(false);
  });

  it('menolak penyesuaian stok mode set bernilai negatif', () => {
    expect(updateStockSchema.safeParse({ mode: 'set', nilai: -2 }).success).toBe(false);
    expect(updateStockSchema.safeParse({ mode: 'selisih', nilai: -2 }).success).toBe(true);
  });
});

describe('Aturan Bisnis Produk & Stok', () => {
  it('mewajibkan konfirmasi eksplisit jika harga pokok > harga jual', () => {
    expect(() =>
      validateCostVsPrice({
        harga_jual: 20000,
        harga_pokok: 25000,
        konfirmasi_harga_pokok_tinggi: false,
      })
    ).toThrow(/konfirmasi eksplisit/i);

    expect(() =>
      validateCostVsPrice({
        harga_jual: 20000,
        harga_pokok: 25000,
        konfirmasi_harga_pokok_tinggi: true,
      })
    ).not.toThrow();
  });

  it('menghitung penyesuaian stok mode selisih dan set serta mencegah stok negatif', () => {
    expect(computeStockAdjustment(10, { mode: 'selisih', nilai: 5 })).toEqual({
      stok_sebelum: 10,
      stok_sesudah: 15,
      selisih: 5,
    });

    expect(computeStockAdjustment(10, { mode: 'selisih', nilai: -3 })).toEqual({
      stok_sebelum: 10,
      stok_sesudah: 7,
      selisih: -3,
    });

    expect(computeStockAdjustment(10, { mode: 'set', nilai: 4 })).toEqual({
      stok_sebelum: 10,
      stok_sesudah: 4,
      selisih: -6,
    });

    expect(() => computeStockAdjustment(2, { mode: 'selisih', nilai: -5 })).toThrow(/negatif/i);
    expect(() => computeStockAdjustment(2, { mode: 'set', nilai: -1 })).toThrow(/kurang dari 0/i);
  });

  it('membuat slug kategori dengan benar', () => {
    expect(generateSlug('  Non-Coffee & Tea  ')).toBe('non-coffee-tea');
  });
});

describe('Integritas DB Constraint & Konkurensi Penyesuaian Stok', () => {
  let tempProductId = null;

  afterAll(async () => {
    if (tempProductId) {
      await deleteOrDeactivateProduct(tempProductId);
    }
    await pool.end();
  });

  it('constraint database menolak harga_jual, harga_pokok, stok, dan stok_minimum negatif', async () => {
    await expect(
      pool.query(
        `INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit)
         VALUES (1, 'DBCHK-1', 'Bad Price', -1, 1000, 10, 5, 'cup')`
      )
    ).rejects.toThrow(/check constraint/i);

    await expect(
      pool.query(
        `INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit)
         VALUES (1, 'DBCHK-2', 'Bad Cost', 1000, -1, 10, 5, 'cup')`
      )
    ).rejects.toThrow(/check constraint/i);

    await expect(
      pool.query(
        `INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit)
         VALUES (1, 'DBCHK-3', 'Bad Stok', 1000, 500, -1, 5, 'cup')`
      )
    ).rejects.toThrow(/check constraint/i);

    await expect(
      pool.query(
        `INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit)
         VALUES (1, 'DBCHK-4', 'Bad Min Stok', 1000, 500, 10, -1, 'cup')`
      )
    ).rejects.toThrow(/check constraint/i);
  });

  it('menangani dua permintaan penyesuaian stok bersamaan dengan aman (SELECT FOR UPDATE)', async () => {
    const created = await createProduct({
      category_id: 1,
      kode_produk: `CONC-${Date.now()}`,
      nama_produk: 'Uji Konkurensi Stok',
      harga_jual: 30000,
      harga_pokok: 12000,
      stok: 7,
      stok_minimum: 5,
      unit: 'cup',
      konfirmasi_harga_pokok_tinggi: false,
    });
    tempProductId = created.id;

    // Two concurrent deductions of 5 from stock 7: only ONE can succeed (leaving 2), the other must fail (409)
    const results = await Promise.allSettled([
      updateProductStock(tempProductId, 1, { mode: 'selisih', nilai: -5, catatan: 'Uji race 1' }),
      updateProductStock(tempProductId, 1, { mode: 'selisih', nilai: -5, catatan: 'Uji race 2' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.status).toBe(409);

    const check = await pool.query(`SELECT stok FROM products WHERE id = $1`, [tempProductId]);
    expect(check.rows[0].stok).toBe(2);
  });
});
