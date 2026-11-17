// src/utils/date.js
// Date utilities for Asia/Jakarta timezone

/**
 * Get start of today in UTC for database queries (Asia/Jakarta)
 */
export function getTodayRangeJakarta() {
  const now = new Date();
  // Get today's date in Jakarta
  const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  const jakartaNow = new Date(jakartaStr);
  
  // Start of today in Jakarta = midnight Jakarta = subtract offset
  const jakartaOffset = 7 * 60; // +7 hours in minutes
  const utcOffset = now.getTimezoneOffset(); // local offset
  
  // Build today string
  const y = jakartaNow.getFullYear();
  const m = String(jakartaNow.getMonth() + 1).padStart(2, '0');
  const d = String(jakartaNow.getDate()).padStart(2, '0');
  
  // Start and end as ISO strings with Jakarta offset
  const startOfDay = new Date(`${y}-${m}-${d}T00:00:00+07:00`);
  const endOfDay = new Date(`${y}-${m}-${d}T23:59:59.999+07:00`);
  
  return { start: startOfDay.toISOString(), end: endOfDay.toISOString() };
}

/**
 * Format a date to Jakarta timezone string for display
 */
export function formatDateJakarta(date) {
  return new Date(date).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
