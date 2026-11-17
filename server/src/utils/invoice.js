// src/utils/invoice.js
// Invoice number generation: INV-POS-YYYYMMDD-XXXX in Asia/Jakarta timezone

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Get today's DATE in Asia/Jakarta timezone as YYYY-MM-DD
 */
export function getTodayDateJakarta(date = new Date()) {
  return jakartaDateFormatter.format(date);
}

/**
 * Get today's date string in Asia/Jakarta timezone as YYYYMMDD
 */
export function getTodayJakarta(date = new Date()) {
  return getTodayDateJakarta(date).replace(/-/g, '');
}

/**
 * Format counter sequence into INV-POS-YYYYMMDD-XXXX
 */
export function formatInvoiceNumber(dateStrYYYYMMDD, sequence) {
  const seq = String(sequence).padStart(4, '0');
  return `INV-POS-${dateStrYYYYMMDD}-${seq}`;
}

/**
 * Generate next invoice number within a transaction.
 * Uses INSERT ... ON CONFLICT DO UPDATE to atomically increment counter per day.
 */
export async function generateInvoiceNumber(client, date = new Date()) {
  const today = getTodayDateJakarta(date);
  const dateStr = today.replace(/-/g, '');

  const result = await client.query(
    `INSERT INTO order_counters (tanggal, nomor_terakhir)
     VALUES ($1, 1)
     ON CONFLICT (tanggal) DO UPDATE
       SET nomor_terakhir = order_counters.nomor_terakhir + 1
     RETURNING nomor_terakhir`,
    [today]
  );

  return formatInvoiceNumber(dateStr, result.rows[0].nomor_terakhir);
}
