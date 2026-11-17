// src/utils/invoice.js
// Invoice number generation: INV-POS-YYYYMMDD-XXXX

/**
 * Get today's date string in Asia/Jakarta timezone as YYYYMMDD
 */
export function getTodayJakarta() {
  const now = new Date();
  const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const y = jakartaTime.getFullYear();
  const m = String(jakartaTime.getMonth() + 1).padStart(2, '0');
  const d = String(jakartaTime.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Get today's DATE in Asia/Jakarta timezone as YYYY-MM-DD
 */
export function getTodayDateJakarta() {
  const now = new Date();
  const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const y = jakartaTime.getFullYear();
  const m = String(jakartaTime.getMonth() + 1).padStart(2, '0');
  const d = String(jakartaTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate next invoice number within a transaction
 * Uses INSERT ... ON CONFLICT DO UPDATE to atomically increment counter
 */
export async function generateInvoiceNumber(client) {
  const today = getTodayDateJakarta();
  const dateStr = getTodayJakarta();

  const result = await client.query(
    `INSERT INTO order_counters (tanggal, nomor_terakhir)
     VALUES ($1, 1)
     ON CONFLICT (tanggal) DO UPDATE
       SET nomor_terakhir = order_counters.nomor_terakhir + 1
     RETURNING nomor_terakhir`,
    [today]
  );

  const seq = String(result.rows[0].nomor_terakhir).padStart(4, '0');
  return `INV-POS-${dateStr}-${seq}`;
}
