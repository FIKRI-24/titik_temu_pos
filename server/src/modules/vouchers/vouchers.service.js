// src/modules/vouchers/vouchers.service.js
import { pool } from '../../config/db.js';
import { calculateDiscount } from '../../utils/money.js';

export async function validateVoucher(kode, subtotal) {
  const normalized = String(kode || '').trim().toUpperCase();
  if (!normalized) {
    const err = new Error('Kode voucher harus diisi.');
    err.status = 422;
    throw err;
  }

  const result = await pool.query(
    `SELECT kode, tipe, nilai, aktif
     FROM vouchers
     WHERE UPPER(kode) = $1 AND aktif = TRUE`,
    [normalized]
  );

  const voucher = result.rows[0];
  if (!voucher) {
    const err = new Error(`Kode voucher '${normalized}' tidak ditemukan atau tidak aktif.`);
    err.status = 404;
    throw err;
  }

  const diskonNominal = calculateDiscount(subtotal, voucher);

  return {
    kode: voucher.kode,
    tipe: voucher.tipe,
    nilai: voucher.nilai,
    diskon_nominal: diskonNominal,
  };
}

export async function getAllVouchers() {
  const result = await pool.query(
    `SELECT kode, tipe, nilai, aktif FROM vouchers ORDER BY kode ASC`
  );
  return result.rows;
}
