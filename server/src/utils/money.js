// src/utils/money.js
// Money calculation utilities (integer rupiah only, no float)

/**
 * Calculate tax (PB1 10%) rounded to nearest rupiah
 * Tax base = subtotal - discount
 */
export function calculateTax(subtotal, discount) {
  const taxBase = subtotal - discount;
  return Math.round(taxBase * 0.1);
}

/**
 * Calculate grand total
 */
export function calculateGrandTotal(subtotal, discount, tax) {
  return subtotal - discount + tax;
}

/**
 * Calculate discount from voucher
 */
export function calculateDiscount(subtotal, voucher) {
  if (!voucher) return 0;
  if (voucher.tipe === 'persen') {
    const disc = Math.round(subtotal * voucher.nilai / 100);
    return Math.min(disc, subtotal);
  }
  if (voucher.tipe === 'nominal') {
    return Math.min(voucher.nilai, subtotal);
  }
  return 0;
}

/**
 * Format integer to Rupiah string
 */
export function formatRupiah(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}
