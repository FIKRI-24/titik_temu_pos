// src/modules/products/products.service.js
import { pool } from '../../config/db.js';

export function validateCostVsPrice({ harga_jual, harga_pokok, konfirmasi_harga_pokok_tinggi }) {
  if (harga_pokok > harga_jual && !konfirmasi_harga_pokok_tinggi) {
    const err = new Error(
      `Harga pokok (Rp ${harga_pokok.toLocaleString('id-ID')}) melebihi harga jual (Rp ${harga_jual.toLocaleString('id-ID')}). Berikan konfirmasi eksplisit jika tetap ingin menyimpan.`
    );
    err.status = 422;
    err.code = 'CONFIRM_HIGH_COST';
    throw err;
  }
}

export function computeStockAdjustment(currentStock, { mode, nilai }) {
  if (!Number.isInteger(currentStock) || currentStock < 0) {
    const err = new Error('Stok saat ini tidak valid.');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(nilai)) {
    const err = new Error('Nilai penyesuaian stok harus bilangan bulat.');
    err.status = 422;
    throw err;
  }

  if (mode === 'set') {
    if (nilai < 0) {
      const err = new Error('Stok baru tidak boleh kurang dari 0.');
      err.status = 422;
      throw err;
    }
    return {
      stok_sebelum: currentStock,
      stok_sesudah: nilai,
      selisih: nilai - currentStock,
    };
  }

  if (mode === 'selisih') {
    const stokSesudah = currentStock + nilai;
    if (stokSesudah < 0) {
      const err = new Error(
        `Stok tersisa ${currentStock}. Penyesuaian (${nilai}) tidak boleh membuat stok menjadi negatif.`
      );
      err.status = 409;
      throw err;
    }
    return {
      stok_sebelum: currentStock,
      stok_sesudah: stokSesudah,
      selisih: nilai,
    };
  }

  const err = new Error('Mode penyesuaian stok tidak valid.');
  err.status = 422;
  throw err;
}

export async function getProducts({ category, q, aktif, role, page = 1, limit = 100 }) {
  const conditions = [];
  const params = [];

  // Kasir NEVER sees inactive products
  if (role !== 'admin') {
    conditions.push(`p.status = 'aktif'`);
    conditions.push(`c.status = 'aktif'`);
  } else if (aktif === 'true') {
    conditions.push(`p.status = 'aktif'`);
  } else if (aktif === 'false') {
    conditions.push(`p.status = 'nonaktif'`);
  }

  if (category && category !== 'all') {
    const catNum = Number(category);
    if (Number.isInteger(catNum) && catNum > 0) {
      params.push(catNum);
      conditions.push(`p.category_id = $${params.length}`);
    } else {
      params.push(String(category));
      conditions.push(`c.slug = $${params.length}`);
    }
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(p.nama_produk ILIKE $${params.length} OR p.kode_produk ILIKE $${params.length})`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${whereSql}`,
    params
  );

  const queryParams = [...params, safeLimit, offset];
  const result = await pool.query(
    `SELECT p.id, p.category_id, c.nama_kategori, c.slug AS kategori_slug,
            p.kode_produk, p.nama_produk, p.harga_jual, p.harga_pokok,
            p.stok, p.stok_minimum, p.unit, p.status, p.created_at,
            (p.stok <= p.stok_minimum) AS stok_rendah,
            EXISTS(SELECT 1 FROM order_details od WHERE od.product_id = p.id) AS pernah_dipesan
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY p.id ASC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );

  return {
    products: result.rows,
    total: countRes.rows[0].total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function getProductById(id, role) {
  const result = await pool.query(
    `SELECT p.id, p.category_id, c.nama_kategori, c.slug AS kategori_slug,
            p.kode_produk, p.nama_produk, p.harga_jual, p.harga_pokok,
            p.stok, p.stok_minimum, p.unit, p.status, p.created_at,
            (p.stok <= p.stok_minimum) AS stok_rendah,
            EXISTS(SELECT 1 FROM order_details od WHERE od.product_id = p.id) AS pernah_dipesan
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [id]
  );

  const product = result.rows[0];
  if (!product || (role !== 'admin' && product.status !== 'aktif')) {
    const err = new Error('Menu tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  return product;
}

export async function createProduct(data) {
  validateCostVsPrice(data);

  const catRes = await pool.query(`SELECT id FROM categories WHERE id = $1`, [data.category_id]);
  if (catRes.rows.length === 0) {
    const err = new Error('Kategori yang dipilih tidak ditemukan.');
    err.status = 400;
    throw err;
  }

  const dup = await pool.query(
    `SELECT id FROM products WHERE LOWER(kode_produk) = LOWER($1)`,
    [data.kode_produk.trim()]
  );
  if (dup.rows.length > 0) {
    const err = new Error(`Kode produk '${data.kode_produk.trim()}' sudah digunakan. Gunakan kode lain.`);
    err.status = 409;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO products (category_id, kode_produk, nama_produk, harga_jual, harga_pokok, stok, stok_minimum, unit, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'aktif')
     RETURNING id`,
    [
      data.category_id,
      data.kode_produk.trim().toUpperCase(),
      data.nama_produk.trim(),
      data.harga_jual,
      data.harga_pokok,
      data.stok,
      data.stok_minimum,
      data.unit.trim(),
    ]
  );

  return getProductById(result.rows[0].id, 'admin');
}

export async function updateProduct(id, data) {
  const existing = await getProductById(id, 'admin');

  const nextHargaJual = data.harga_jual ?? existing.harga_jual;
  const nextHargaPokok = data.harga_pokok ?? existing.harga_pokok;

  validateCostVsPrice({
    harga_jual: nextHargaJual,
    harga_pokok: nextHargaPokok,
    konfirmasi_harga_pokok_tinggi: data.konfirmasi_harga_pokok_tinggi,
  });

  if (data.category_id !== undefined) {
    const catRes = await pool.query(`SELECT id FROM categories WHERE id = $1`, [data.category_id]);
    if (catRes.rows.length === 0) {
      const err = new Error('Kategori yang dipilih tidak ditemukan.');
      err.status = 400;
      throw err;
    }
  }

  const nextKode = data.kode_produk !== undefined ? data.kode_produk.trim().toUpperCase() : existing.kode_produk;
  if (nextKode.toLowerCase() !== existing.kode_produk.toLowerCase()) {
    const dup = await pool.query(
      `SELECT id FROM products WHERE LOWER(kode_produk) = LOWER($1) AND id <> $2`,
      [nextKode, id]
    );
    if (dup.rows.length > 0) {
      const err = new Error(`Kode produk '${nextKode}' sudah digunakan. Gunakan kode lain.`);
      err.status = 409;
      throw err;
    }
  }

  await pool.query(
    `UPDATE products
     SET category_id = $1,
         kode_produk = $2,
         nama_produk = $3,
         harga_jual = $4,
         harga_pokok = $5,
         stok_minimum = $6,
         unit = $7,
         status = $8
     WHERE id = $9`,
    [
      data.category_id ?? existing.category_id,
      nextKode,
      data.nama_produk !== undefined ? data.nama_produk.trim() : existing.nama_produk,
      nextHargaJual,
      nextHargaPokok,
      data.stok_minimum ?? existing.stok_minimum,
      data.unit !== undefined ? data.unit.trim() : existing.unit,
      data.status ?? existing.status,
      id,
    ]
  );

  return getProductById(id, 'admin');
}

export async function updateProductStock(id, userId, { mode, nilai, catatan }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockRes = await client.query(
      `SELECT id, nama_produk, stok, stok_minimum, unit
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (lockRes.rows.length === 0) {
      const err = new Error('Menu tidak ditemukan.');
      err.status = 404;
      throw err;
    }

    const current = lockRes.rows[0];
    const adj = computeStockAdjustment(current.stok, { mode, nilai });

    await client.query(
      `UPDATE products SET stok = $1 WHERE id = $2`,
      [adj.stok_sesudah, id]
    );

    const logRes = await client.query(
      `INSERT INTO stock_adjustments (product_id, user_id, mode, nilai_input, stok_sebelum, stok_sesudah, selisih, catatan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, product_id, mode, nilai_input, stok_sebelum, stok_sesudah, selisih, catatan, created_at`,
      [id, userId, mode, nilai, adj.stok_sebelum, adj.stok_sesudah, adj.selisih, catatan?.trim() || null]
    );

    await client.query('COMMIT');

    const updatedProduct = await getProductById(id, 'admin');
    return {
      product: updatedProduct,
      adjustment: logRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getStockHistory(productId) {
  const result = await pool.query(
    `SELECT sa.id, sa.mode, sa.nilai_input, sa.stok_sebelum, sa.stok_sesudah,
            sa.selisih, sa.catatan, sa.created_at, u.nama_lengkap AS diubah_oleh
     FROM stock_adjustments sa
     JOIN users u ON u.id = sa.user_id
     WHERE sa.product_id = $1
     ORDER BY sa.created_at DESC
     LIMIT 20`,
    [productId]
  );
  return result.rows;
}

export async function deleteOrDeactivateProduct(id) {
  const existing = await getProductById(id, 'admin');

  if (existing.pernah_dipesan) {
    await pool.query(`UPDATE products SET status = 'nonaktif' WHERE id = $1`, [id]);
    const updated = await getProductById(id, 'admin');
    return {
      action: 'deactivated',
      product: updated,
      message: `Menu "${existing.nama_produk}" pernah dipesan sehingga dinonaktifkan, bukan dihapus permanen.`,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM stock_adjustments WHERE product_id = $1`, [id]);
    await client.query(`DELETE FROM products WHERE id = $1`, [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    action: 'deleted',
    id,
    message: `Menu "${existing.nama_produk}" berhasil dihapus.`,
  };
}
