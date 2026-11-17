// src/modules/orders/orders.service.js
import { pool } from '../../config/db.js';
import {
  calculateDiscount,
  calculateTax,
  calculateGrandTotal,
  formatRupiah,
} from '../../utils/money.js';
import { generateInvoiceNumber } from '../../utils/invoice.js';

/**
 * Pure server-side order total calculator.
 * Never trusts client-provided prices or totals.
 */
export function calculateOrderTotals(itemsWithProducts, voucher = null) {
  let totalSubtotal = 0;
  const lineItems = itemsWithProducts.map(({ item, product }) => {
    const subtotalBaris = product.harga_jual * item.kuantiti;
    totalSubtotal += subtotalBaris;
    return {
      product_id: product.id,
      nama_produk: product.nama_produk,
      harga_satuan: product.harga_jual,
      harga_pokok_satuan: product.harga_pokok,
      kuantiti: item.kuantiti,
      subtotal_baris: subtotalBaris,
      catatan_khusus: item.catatan_khusus?.trim() || null,
    };
  });

  const diskonNominal = calculateDiscount(totalSubtotal, voucher);
  const pajakNominal = calculateTax(totalSubtotal, diskonNominal);
  const grandTotal = calculateGrandTotal(totalSubtotal, diskonNominal, pajakNominal);

  return {
    lineItems,
    total_subtotal: totalSubtotal,
    diskon_nominal: diskonNominal,
    pajak_nominal: pajakNominal,
    grand_total: grandTotal,
  };
}

/**
 * Create a new order inside one atomic DB transaction.
 * Locks products in ascending id order (FOR UPDATE) to prevent deadlocks and negative stock.
 */
export async function createOrder(userId, data, deps = {}) {
  const invoiceGenerator = deps.invoiceGenerator || generateInvoiceNumber;
  const dbPool = deps.pool || pool;
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // Aggregate requested quantity per product_id and sort ascending for deadlock-free locking
    const qtyByProductId = new Map();
    for (const item of data.items) {
      qtyByProductId.set(item.product_id, (qtyByProductId.get(item.product_id) || 0) + item.kuantiti);
    }
    const sortedProductIds = Array.from(qtyByProductId.keys()).sort((a, b) => a - b);

    // Lock all involved products in ascending id order
    const lockRes = await client.query(
      `SELECT id, nama_produk, harga_jual, harga_pokok, stok, status
       FROM products
       WHERE id = ANY($1::int[])
       ORDER BY id ASC
       FOR UPDATE`,
      [sortedProductIds]
    );

    const productMap = new Map();
    for (const row of lockRes.rows) {
      productMap.set(row.id, row);
    }

    // Validate existence, active status, and sufficient stock
    for (const pid of sortedProductIds) {
      const product = productMap.get(pid);
      if (!product) {
        const err = new Error(`Menu dengan ID ${pid} tidak ditemukan.`);
        err.status = 404;
        throw err;
      }
      if (product.status !== 'aktif') {
        const err = new Error(`Menu "${product.nama_produk}" sedang nonaktif dan tidak dapat dipesan.`);
        err.status = 409;
        throw err;
      }
      const neededQty = qtyByProductId.get(pid);
      if (product.stok < neededQty) {
        const err = new Error(
          product.stok === 0
            ? `Stok ${product.nama_produk} habis. Hapus atau pilih menu lain.`
            : `Stok ${product.nama_produk} tersisa ${product.stok}. Kurangi jumlah atau pilih menu lain.`
        );
        err.status = 409;
        throw err;
      }
    }

    // Validate voucher if provided
    let voucher = null;
    let voucherKode = null;
    if (data.voucher_kode && data.voucher_kode.trim()) {
      const normalizedVoucher = data.voucher_kode.trim().toUpperCase();
      const vRes = await client.query(
        `SELECT kode, tipe, nilai, aktif
         FROM vouchers
         WHERE UPPER(kode) = $1 AND aktif = TRUE`,
        [normalizedVoucher]
      );
      if (vRes.rows.length === 0) {
        const err = new Error(`Kode voucher '${normalizedVoucher}' tidak ditemukan atau tidak aktif.`);
        err.status = 404;
        throw err;
      }
      voucher = vRes.rows[0];
      voucherKode = voucher.kode;
    }

    // Calculate all monetary totals strictly on server
    const itemsWithProducts = data.items.map((item) => ({
      item,
      product: productMap.get(item.product_id),
    }));
    const totals = calculateOrderTotals(itemsWithProducts, voucher);

    // Payment validation
    let uangDibayar;
    let uangKembali;

    if (data.metode_bayar === 'tunai') {
      if (data.uang_dibayar === undefined || data.uang_dibayar === null) {
        const err = new Error('Nominal uang diterima harus diisi untuk pembayaran tunai.');
        err.status = 422;
        throw err;
      }
      if (data.uang_dibayar < totals.grand_total) {
        const err = new Error(
          `Uang tunai (${formatRupiah(data.uang_dibayar)}) kurang dari grand total (${formatRupiah(totals.grand_total)}).`
        );
        err.status = 422;
        throw err;
      }
      uangDibayar = data.uang_dibayar;
      uangKembali = uangDibayar - totals.grand_total;
    } else {
      uangDibayar = totals.grand_total;
      uangKembali = 0;
    }

    const nomorMeja = data.tipe_pesanan === 'dine_in' ? data.nomor_meja : null;
    const namaPemesan = data.nama_pemesan?.trim() || null;

    // Generate atomic sequential invoice number
    const invoiceNumber = await invoiceGenerator(client);

    // Insert order header
    const orderRes = await client.query(
      `INSERT INTO orders (
         invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan,
         total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total,
         metode_bayar, uang_dibayar, uang_kembali, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'diproses')
       RETURNING id`,
      [
        invoiceNumber,
        userId,
        data.tipe_pesanan,
        nomorMeja,
        namaPemesan,
        totals.total_subtotal,
        totals.diskon_nominal,
        voucherKode,
        totals.pajak_nominal,
        totals.grand_total,
        data.metode_bayar,
        uangDibayar,
        uangKembali,
      ]
    );
    const orderId = orderRes.rows[0].id;

    // Insert order details with price snapshots
    for (const line of totals.lineItems) {
      await client.query(
        `INSERT INTO order_details (
           order_id, product_id, harga_satuan, harga_pokok_satuan,
           kuantiti, subtotal_baris, catatan_khusus
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderId,
          line.product_id,
          line.harga_satuan,
          line.harga_pokok_satuan,
          line.kuantiti,
          line.subtotal_baris,
          line.catatan_khusus,
        ]
      );
    }

    // Deduct stock per distinct product in sorted order
    for (const pid of sortedProductIds) {
      const neededQty = qtyByProductId.get(pid);
      await client.query(
        `UPDATE products SET stok = stok - $1 WHERE id = $2`,
        [neededQty, pid]
      );
    }

    await client.query('COMMIT');

    return getOrderById(orderId, userId, 'admin', dbPool);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrders(userId, role, { status, q, page = 1, limit = 20 }) {
  const conditions = [];
  const params = [];

  if (role !== 'admin') {
    params.push(userId);
    conditions.push(`o.user_id = $${params.length}`);
  }

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(o.invoice_number ILIKE $${params.length} OR COALESCE(o.nama_pemesan, '') ILIKE $${params.length})`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM orders o ${whereSql}`,
    params
  );

  const queryParams = [...params, safeLimit, offset];
  const result = await pool.query(
    `SELECT o.id, o.invoice_number, o.user_id, u.nama_lengkap AS kasir_nama,
            o.tipe_pesanan, o.nomor_meja, o.nama_pemesan,
            o.total_subtotal, o.diskon_nominal, o.voucher_kode, o.pajak_nominal, o.grand_total,
            o.metode_bayar, o.uang_dibayar, o.uang_kembali, o.status, o.created_at,
            COALESCE(SUM(od.kuantiti), 0)::int AS total_item
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN order_details od ON od.order_id = o.id
     ${whereSql}
     GROUP BY o.id, u.nama_lengkap
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );

  return {
    orders: result.rows,
    total: countRes.rows[0].total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function getOrderById(orderId, userId, role, dbPool = pool) {
  const orderRes = await dbPool.query(
    `SELECT o.id, o.invoice_number, o.user_id, u.nama_lengkap AS kasir_nama, u.username AS kasir_username,
            o.tipe_pesanan, o.nomor_meja, o.nama_pemesan,
            o.total_subtotal, o.diskon_nominal, o.voucher_kode, o.pajak_nominal, o.grand_total,
            o.metode_bayar, o.uang_dibayar, o.uang_kembali, o.status, o.created_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );

  const order = orderRes.rows[0];
  if (!order) {
    const err = new Error('Pesanan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  if (role !== 'admin' && order.user_id !== userId) {
    const err = new Error('Anda tidak memiliki izin melihat detail pesanan ini.');
    err.status = 403;
    throw err;
  }

  const detailsRes = await dbPool.query(
    `SELECT od.id, od.product_id, p.kode_produk, p.nama_produk, p.unit,
            od.harga_satuan, od.harga_pokok_satuan, od.kuantiti, od.subtotal_baris, od.catatan_khusus
     FROM order_details od
     JOIN products p ON p.id = od.product_id
     WHERE od.order_id = $1
     ORDER BY od.id ASC`,
    [orderId]
  );

  return {
    ...order,
    items: detailsRes.rows,
  };
}

export async function updateOrderStatus(orderId, userId, role, newStatus) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lockOrderRes = await client.query(
      `SELECT id, invoice_number, user_id, status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (lockOrderRes.rows.length === 0) {
      const err = new Error('Pesanan tidak ditemukan.');
      err.status = 404;
      throw err;
    }

    const order = lockOrderRes.rows[0];
    if (role !== 'admin' && order.user_id !== userId) {
      const err = new Error('Anda tidak memiliki izin mengubah status pesanan ini.');
      err.status = 403;
      throw err;
    }

    if (order.status !== 'diproses') {
      const err = new Error(
        `Pesanan ${order.invoice_number} sudah berstatus '${order.status}' dan tidak dapat diubah lagi.`
      );
      err.status = 409;
      throw err;
    }

    await client.query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, orderId]);

    // If cancelled, restore stock for all items in sorted product_id order
    if (newStatus === 'dibatalkan') {
      const detailsRes = await client.query(
        `SELECT product_id, SUM(kuantiti)::int AS qty
         FROM order_details
         WHERE order_id = $1
         GROUP BY product_id
         ORDER BY product_id ASC`,
        [orderId]
      );

      if (detailsRes.rows.length > 0) {
        const pids = detailsRes.rows.map((r) => r.product_id);
        const lockedProdsRes = await client.query(
          `SELECT id, stok FROM products WHERE id = ANY($1::int[]) ORDER BY id ASC FOR UPDATE`,
          [pids]
        );
        const stokMap = new Map(lockedProdsRes.rows.map((p) => [p.id, p.stok]));

        for (const item of detailsRes.rows) {
          const stokSebelum = stokMap.get(item.product_id) ?? 0;
          const stokSesudah = stokSebelum + item.qty;

          await client.query(`UPDATE products SET stok = $1 WHERE id = $2`, [
            stokSesudah,
            item.product_id,
          ]);

          await client.query(
            `INSERT INTO stock_adjustments
               (product_id, user_id, mode, nilai_input, stok_sebelum, stok_sesudah, selisih, catatan)
             VALUES ($1, $2, 'selisih', $3, $4, $5, $6, $7)`,
            [
              item.product_id,
              userId,
              item.qty,
              stokSebelum,
              stokSesudah,
              item.qty,
              `Pengembalian stok pembatalan ${order.invoice_number}`,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
    return getOrderById(orderId, userId, role);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
