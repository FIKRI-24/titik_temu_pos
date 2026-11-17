// src/tests/reports.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import zlib from 'zlib';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';
import { getTodayDateJakarta } from '../utils/invoice.js';
import { formatRupiah } from '../utils/money.js';
import {
  addDaysIsoDate,
  reportFilterQuerySchema,
} from '../modules/reports/reports.routes.js';
import {
  getReportOrders,
  getReportSummary,
  generateReportCsv,
  generateReportPdf,
  formatCsvCell,
  sanitizeExportFilename,
  MAX_CSV_ROWS,
  MAX_PDF_ROWS,
} from '../modules/reports/reports.service.js';
import { getSummary as getDashboardSummary } from '../modules/dashboard/dashboard.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function decodePdfHex(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * Inflate FlateDecode streams inside a PDFKit buffer and decode TJ hex text runs.
 */
function extractPdfReadableText(pdfBuffer) {
  const latin1 = pdfBuffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const textChunks = [];
  let match;
  while ((match = streamRegex.exec(latin1)) !== null) {
    const rawBytes = Buffer.from(match[1], 'latin1');
    let content;
    try {
      content = zlib.inflateSync(rawBytes).toString('latin1');
    } catch {
      content = match[1];
    }
    const tjRegex = /\[([^\]]+)\]\s*TJ/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(content)) !== null) {
      let line = '';
      const hexRegex = /<([0-9a-fA-F]+)>/g;
      let hexMatch;
      while ((hexMatch = hexRegex.exec(tjMatch[1])) !== null) {
        line += decodePdfHex(hexMatch[1]);
      }
      if (line) textChunks.push(line);
    }
  }
  return textChunks.join('\n');
}

/**
 * Minimal RFC-4180 CSV parser for verification tests (strips UTF-8 BOM).
 */
function parseCsv(buffer) {
  let text = buffer.toString('utf8');
  if (text.startsWith('\uFEFF')) {
    text = text.slice(1);
  }
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('Fase 5: Laporan, Rekonsiliasi, Ekspor CSV/PDF, Keamanan, & Performa', () => {
  const seedRaw = readFileSync(join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
  const todayWib = getTodayDateJakarta();
  const yesterdayWib = addDaysIsoDate(todayWib, -1);
  const sixDaysAgoWib = addDaysIsoDate(todayWib, -6);

  let server;
  let baseUrl;
  let adminCookie;
  let kasirCookie;

  beforeAll(async () => {
    await pool.query(seedRaw);

    const adminToken = jwt.sign(
      { id: 1, username: 'admin', nama_lengkap: 'Admin Titik Temu', role: 'admin' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    const kasirToken = jwt.sign(
      { id: 2, username: 'kasir1', nama_lengkap: 'Budi Santoso', role: 'kasir' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    adminCookie = `token=${adminToken}`;
    kasirCookie = `token=${kasirToken}`;

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.query(seedRaw);
    await pool.end();
  });

  describe('1. Hak Akses & Validasi Input (Zod + Anti SQL Injection)', () => {
    it('menolak unauthenticated (401) dan kasir (403) di semua endpoint /api/reports/*', async () => {
      const endpoints = [
        '/api/reports/orders',
        '/api/reports/summary',
        '/api/reports/export.csv',
        '/api/reports/export.pdf',
      ];

      for (const ep of endpoints) {
        const unauthRes = await fetch(`${baseUrl}${ep}`);
        expect(unauthRes.status).toBe(401);

        const kasirRes = await fetch(`${baseUrl}${ep}`, {
          headers: { Cookie: kasirCookie },
        });
        expect(kasirRes.status).toBe(403);
        const body = await kasirRes.json();
        expect(body.ok).toBe(false);
      }

      const adminRes = await fetch(`${baseUrl}/api/reports/summary`, {
        headers: { Cookie: adminCookie },
      });
      expect(adminRes.status).toBe(200);
    });

    it('menolak input jahat pada sortBy, sortDir, category, metodeBayar, status, & tanggal tanpa bocor SQL', async () => {
      const maliciousQueries = [
        'sortBy=grand_total;DROP TABLE orders--',
        'sortBy=1=1 OR 1=1',
        'sortDir=desc;SELECT 1',
        'category=coffee OR 1=1',
        'metodeBayar=bitcoin',
        'status=hacked',
        'dateFrom=2026-02-30',
        `dateFrom=${todayWib}&dateTo=${yesterdayWib}`,
        'dateFrom=2025-01-01&dateTo=2026-06-01', // > 366 hari
        'limit=500',
        'page=0',
      ];

      // Verify SQL/table/stack leak detector catches actual leaks (never silently permissive)
      const sqlLeakPattern =
        /(syntax error|relation\s+"|column\s+"|invalid input syntax|SQLSTATE|pg_|postgresql|\bSELECT\b|\bFROM\b|\bDROP\s+TABLE\b|\bUNION\s+SELECT\b|\b(?:orders|order_details|order_counters|products|categories|users|vouchers|stock_adjustments)\b|\bat\s+\S+\s*\(.*:\d+:\d+\)|node_modules[\\/]|Error:\s)/;
      expect('ERROR: syntax error at or near "DROP"').toMatch(sqlLeakPattern);
      expect('relation "order_details" does not exist').toMatch(sqlLeakPattern);
      expect('at Pool.query (node_modules/pg/lib/pool.js:42:11)').toMatch(sqlLeakPattern);
      expect('SELECT * FROM orders').toMatch(sqlLeakPattern);

      for (const qs of maliciousQueries) {
        const res = await fetch(`${baseUrl}/api/reports/orders?${qs}`, {
          headers: { Cookie: adminCookie },
        });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.ok).toBe(false);
        const text = JSON.stringify(body);
        expect(text).not.toMatch(sqlLeakPattern);
      }
    });

    it('menyanitasi nama berkas Content-Disposition dari karakter injeksi header', () => {
      expect(sanitizeExportFilename('laporan-2026-11-11_2026-11-17.csv')).toBe(
        'laporan-2026-11-11_2026-11-17.csv'
      );
      const safe = sanitizeExportFilename('../bad;\r\n"name".pdf');
      expect(safe).not.toMatch(/[\r\n;"/\\]/);
      expect(safe).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });

  describe('2. Rekonsiliasi Dashboard & 10 Kombinasi Filter vs Query SQL Manual', () => {
    it('menyamakan angka "Total diterima hari ini" Dashboard Admin dengan Laporan hari ini', async () => {
      const dashSummary = await getDashboardSummary(1, 'admin');
      const filtersToday = reportFilterQuerySchema.parse({
        dateFrom: todayWib,
        dateTo: todayWib,
      });
      const reportSummary = await getReportSummary(filtersToday);

      expect(reportSummary.summary.total_diterima).toBe(dashSummary.total_omset);
      expect(reportSummary.summary.jumlah_pesanan).toBe(dashSummary.jumlah_pesanan);
      expect(reportSummary.summary.total_diterima).toBe(338140);
      expect(reportSummary.summary.jumlah_pesanan).toBe(4);
    });

    it('memverifikasi >= 10 kombinasi filter (ringkasan, paginasi, SQL manual, CSV, & PDF identik)', async () => {
      // Seed additional edge orders cleanly for filter coverage:
      // A: cancelled order today (excluded from summary/chart, shown in table/CSV/PDF when status=all/dibatalkan)
      // B: KOPI5000 order today resulting in grand_total = 0 (included in summary & rata_rata_transaksi!)
      // C: multi-item same category (3 different Coffee products -> order counted ONCE, category chart sums all 3)
      await pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
         VALUES
           ($1, 2, 'dine_in', 7, 'Tes Batal', 50000, 0, NULL, 5000, 55000, 'qris', 55000, 0, 'dibatalkan', ($2::date + TIME '00:05:00') AT TIME ZONE 'Asia/Jakarta'),
           ($3, 1, 'takeaway', NULL, 'Tes Nol', 3000, 3000, 'KOPI5000', 0, 0, 'tunai', 0, 0, 'selesai', ($2::date + TIME '00:06:00') AT TIME ZONE 'Asia/Jakarta'),
           ($4, 2, 'dine_in', 8, 'Multi Kopi', 77000, 0, NULL, 7700, 84700, 'transfer', 84700, 0, 'selesai', ($2::date + TIME '00:07:00') AT TIME ZONE 'Asia/Jakarta')`,
        [
          `INV-POS-${todayWib.replace(/-/g, '')}-9001`,
          todayWib,
          `INV-POS-${todayWib.replace(/-/g, '')}-9002`,
          `INV-POS-${todayWib.replace(/-/g, '')}-9003`,
        ]
      );

      const insIdsRes = await pool.query(
        `SELECT id, invoice_number FROM orders WHERE invoice_number LIKE '%-900%' ORDER BY invoice_number ASC`
      );
      const [ordCancel, ordZero, ordMultiCoffee] = insIdsRes.rows;

      await pool.query(
        `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris, catatan_khusus)
         VALUES
           ($1, 2, 25000, 9000, 2, 50000, NULL),
           ($2, 1, 3000, 1000, 1, 3000, NULL),
           ($3, 1, 20000, 8000, 1, 20000, 'Es sedikit'),
           ($3, 2, 25000, 9000, 1, 25000, NULL),
           ($3, 3, 32000, 12000, 1, 32000, NULL)`,
        [ordCancel.id, ordZero.id, ordMultiCoffee.id]
      );

      const filterCombinations = [
        { name: '1. Default 7 hari', query: {} },
        { name: '2. Rentang 1 hari (hari ini, semua status)', query: { dateFrom: todayWib, dateTo: todayWib, status: 'all' } },
        { name: '3. Kategori Coffee (EXISTS tanpa duplikasi, limit=2)', query: { dateFrom: sixDaysAgoWib, dateTo: todayWib, category: 'coffee', limit: 2, page: 1 } },
        { name: '4. Kombinasi 4-filter (Coffee + QRIS + Selesai + 1 hari kemarin)', query: { dateFrom: yesterdayWib, dateTo: yesterdayWib, category: 'coffee', metodeBayar: 'qris', status: 'selesai' } },
        { name: '5. Non-Coffee + Tunai + Aktif', query: { dateFrom: sixDaysAgoWib, dateTo: todayWib, category: 'non-coffee', metodeBayar: 'tunai', status: 'aktif' } },
        { name: '6. Food + Diproses + 7 hari', query: { dateFrom: sixDaysAgoWib, dateTo: todayWib, category: 'food', status: 'diproses' } },
        { name: '7. Pastry + Transfer + Semua status', query: { dateFrom: sixDaysAgoWib, dateTo: todayWib, category: 'pastry', metodeBayar: 'transfer', status: 'all' } },
        { name: '8. Khusus status Dibatalkan', query: { dateFrom: todayWib, dateTo: todayWib, status: 'dibatalkan' } },
        { name: '9. Hari ini + Transfer + Selesai (multi-item coffee)', query: { dateFrom: todayWib, dateTo: todayWib, metodeBayar: 'transfer', status: 'selesai' } },
        { name: '10. Periode kosong masa depan', query: { dateFrom: addDaysIsoDate(todayWib, 10), dateTo: addDaysIsoDate(todayWib, 12) } },
      ];

      for (const combo of filterCombinations) {
        const filters = reportFilterQuerySchema.parse(combo.query);
        const [summaryRes, ordersPage1, csvBuf, pdfBuf] = await Promise.all([
          getReportSummary(filters),
          getReportOrders(filters),
          generateReportCsv(filters),
          generateReportPdf(filters),
        ]);

        // Manual independent SQL reference check
        const manualParams = [filters.dateFrom, filters.dateTo];
        let manualWhere = `
          o.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Jakarta')
          AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
        `;
        if (filters.category !== 'all') {
          manualParams.push(filters.category);
          manualWhere += ` AND EXISTS (
            SELECT 1 FROM order_details od JOIN products p ON p.id = od.product_id JOIN categories c ON c.id = p.category_id
            WHERE od.order_id = o.id AND c.slug = $${manualParams.length}
          )`;
        }
        if (filters.metodeBayar !== 'all') {
          manualParams.push(filters.metodeBayar);
          manualWhere += ` AND o.metode_bayar = $${manualParams.length}`;
        }

        const tableWhere =
          filters.status === 'aktif'
            ? `${manualWhere} AND o.status IN ('diproses', 'selesai')`
            : filters.status === 'all'
              ? manualWhere
              : `${manualWhere} AND o.status = '${filters.status}'`;

        const summaryWhere =
          filters.status === 'dibatalkan'
            ? 'FALSE'
            : filters.status === 'all' || filters.status === 'aktif'
              ? `${manualWhere} AND o.status IN ('diproses', 'selesai')`
              : `${manualWhere} AND o.status = '${filters.status}'`;

        const manualTableCountRes = await pool.query(
          `SELECT COUNT(*)::int AS total FROM orders o WHERE ${tableWhere}`,
          manualParams
        );
        const manualSumRes = await pool.query(
          `SELECT
             COUNT(*)::int AS jumlah_pesanan,
             COALESCE(SUM(o.total_subtotal), 0)::bigint AS omset_bruto,
             COALESCE(SUM(o.diskon_nominal), 0)::bigint AS total_diskon,
             COALESCE(SUM(o.total_subtotal - o.diskon_nominal), 0)::bigint AS omset_bersih,
             COALESCE(SUM(o.pajak_nominal), 0)::bigint AS total_pajak,
             COALESCE(SUM(o.grand_total), 0)::bigint AS total_diterima
           FROM orders o WHERE ${summaryWhere}`,
          manualWhere === 'FALSE' || summaryWhere === 'FALSE' ? [] : manualParams
        );
        const manualHppRes = await pool.query(
          `SELECT COALESCE(SUM(od.harga_pokok_satuan::bigint * od.kuantiti::bigint), 0)::bigint AS total_hpp
           FROM orders o
           JOIN order_details od ON od.order_id = o.id
           WHERE ${summaryWhere}`,
          summaryWhere === 'FALSE' ? [] : manualParams
        );

        const expSum = manualSumRes.rows[0];
        const expOmsetBersih = Number(expSum.omset_bersih);
        const expLabaKotor = expOmsetBersih - Number(manualHppRes.rows[0].total_hpp);
        const expTotalDiterima = Number(expSum.total_diterima);
        const expCount = Number(expSum.jumlah_pesanan);
        const expAvg = expCount > 0 ? Math.round(expTotalDiterima / expCount) : 0;

        // Summary equals manual SQL across ALL matching rows (even when ordersPage1 has limit=2!)
        expect(ordersPage1.total).toBe(manualTableCountRes.rows[0].total);
        expect(summaryRes.summary.jumlah_pesanan).toBe(expCount);
        expect(summaryRes.summary.omset_bruto).toBe(Number(expSum.omset_bruto));
        expect(summaryRes.summary.total_diskon).toBe(Number(expSum.total_diskon));
        expect(summaryRes.summary.omset_bersih).toBe(expOmsetBersih);
        expect(summaryRes.summary.total_pajak).toBe(Number(expSum.total_pajak));
        expect(summaryRes.summary.total_diterima).toBe(expTotalDiterima);
        expect(summaryRes.summary.laba_kotor).toBe(expLabaKotor);
        expect(summaryRes.summary.rata_rata_transaksi).toBe(expAvg);

        // CSV equals exact unpaginated table count and column sums (skip line 0 `sep=,` & line 1 header)
        const csvRows = parseCsv(csvBuf);
        expect(csvRows[0]).toEqual(['sep=', '']);
        const dataCsvRows = csvRows.slice(2);
        expect(dataCsvRows).toHaveLength(ordersPage1.total);

        const nonCancelledCsvRows = dataCsvRows.filter((r) => r[12] !== 'Dibatalkan');
        if (filters.status === 'dibatalkan') {
          expect(summaryRes.summary.total_diterima).toBe(0);
        } else {
          const csvGrandSum = nonCancelledCsvRows.reduce((s, r) => s + Number(r[11]), 0);
          expect(csvGrandSum).toBe(summaryRes.summary.total_diterima);
        }

        // PDF starts with %PDF-1. and embeds exact summary numbers
        expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        const pdfText = extractPdfReadableText(pdfBuf);
        expect(pdfText).toContain('TITIK TEMU KOPI - LAPORAN PENJUALAN');
        if (ordersPage1.total === 0) {
          expect(pdfText).toContain('Belum ada transaksi pada periode ini.');
        } else {
          expect(pdfText).toContain(formatRupiah(summaryRes.summary.omset_bersih));
          expect(pdfText).toContain(formatRupiah(summaryRes.summary.total_diterima));
        }
      }

      // Explicitly check Multi-Coffee order is NOT duplicated and KOPI5000 = 0 counts in avg
      const multiFilter = reportFilterQuerySchema.parse({
        dateFrom: todayWib,
        dateTo: todayWib,
        metodeBayar: 'transfer',
        status: 'selesai',
      });
      const multiOrders = await getReportOrders(multiFilter);
      const multiSum = await getReportSummary(multiFilter);
      expect(multiOrders.total).toBe(1);
      expect(multiOrders.orders[0].item_terjual).toBe(3);
      expect(multiSum.summary.jumlah_pesanan).toBe(1);
      expect(multiSum.summary.omset_bruto).toBe(77000);
      expect(multiSum.omset_per_kategori.find((c) => c.slug === 'coffee').total_qty).toBe(3);
    }, 20000);
  });

  describe('3. Batas Tengah Malam WIB, CSV Formula Injection, & PDF Multi-Halaman', () => {
    it('memisahkan transaksi 23:59:30 WIB dan 00:01:00 WIB ke hari kalender masing-masing', async () => {
      await pool.query(seedRaw);
      const d1 = '2026-10-10';
      const d2 = '2026-10-11';

      await pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
         VALUES
           ('INV-POS-20261010-0001', 2, 'takeaway', NULL, 'Akhir Hari', 20000, 0, NULL, 2000, 22000, 'tunai', 22000, 0, 'selesai', '2026-10-10 23:59:30+07:00'::timestamptz),
           ('INV-POS-20261011-0001', 2, 'takeaway', NULL, 'Awal Hari', 25000, 0, NULL, 2500, 27500, 'tunai', 30000, 2500, 'selesai', '2026-10-11 00:01:00+07:00'::timestamptz)`
      );

      const d1Summary = await getReportSummary(
        reportFilterQuerySchema.parse({ dateFrom: d1, dateTo: d1 })
      );
      const d2Summary = await getReportSummary(
        reportFilterQuerySchema.parse({ dateFrom: d2, dateTo: d2 })
      );

      expect(d1Summary.summary.jumlah_pesanan).toBe(1);
      expect(d1Summary.summary.total_diterima).toBe(22000);
      expect(d2Summary.summary.jumlah_pesanan).toBe(1);
      expect(d2Summary.summary.total_diterima).toBe(27500);
    });

    it('mencegah CSV/formula injection, menjaga UTF-8 BOM, angka mentah, dan teks multi-baris', async () => {
      expect(formatCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
      expect(formatCsvCell('+1+1')).toBe("'+1+1");
      expect(formatCsvCell('-500')).toBe("'-500");
      expect(formatCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
      expect(formatCsvCell('Budi, "VIP"\nMeja 1')).toBe('"Budi, ""VIP""\nMeja 1"');
      expect(formatCsvCell(28000, { isNumeric: true })).toBe('28000');

      const dInject = '2026-10-15';
      await pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
         VALUES
           ('INV-POS-20261015-0001', 2, 'takeaway', NULL, '=1+1, "Test"', 28000, 0, NULL, 2800, 30800, 'tunai', 35000, 4200, 'selesai', '2026-10-15 11:15:00+07:00'::timestamptz)`
      );

      const csvBuf = await generateReportCsv(
        reportFilterQuerySchema.parse({ dateFrom: dInject, dateTo: dInject })
      );
      expect(csvBuf[0]).toBe(0xef);
      expect(csvBuf[1]).toBe(0xbb);
      expect(csvBuf[2]).toBe(0xbf);

      const parsed = parseCsv(csvBuf);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual(['sep=', '']);
      expect(parsed[2][5]).toBe("'=1+1, \"Test\"");
      expect(parsed[2][8]).toBe('28000');
      expect(parsed[2][11]).toBe('30800');
      expect(parsed[2][1]).toMatch(/^2026-10-15 11:15:00 WIB$/);
    });

    it('menghasilkan PDF A4 landscape multi-halaman dengan header berulang, wrap teks panjang, dan nomor halaman', async () => {
      const longDate = '2026-09-01';
      const values = [];
      const params = [];
      for (let i = 1; i <= 36; i += 1) {
        const idx = (i - 1) * 3;
        values.push(
          `($${idx + 1}, 2, 'dine_in', 4, $${idx + 2}, 40000, 0, NULL, 4000, 44000, 'qris', 44000, 0, 'selesai', $${idx + 3}::timestamptz)`
        );
        params.push(
          `INV-POS-20260901-${String(i).padStart(4, '0')}`,
          `Pelanggan Ke-${String(i).padStart(2, '0')} Nama Panjang Utk Uji Wrapping Kolom`,
          `2026-09-01 ${String(8 + Math.floor(i / 6)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}:00+07:00`
        );
      }

      const insRes = await pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
         VALUES ${values.join(', ')}
         RETURNING id`,
        params
      );

      const detailValues = insRes.rows.map((r, i) => `($${i + 1}, 1, 20000, 8000, 2, 40000, NULL)`).join(', ');
      await pool.query(
        `INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris, catatan_khusus)
         VALUES ${detailValues}`,
        insRes.rows.map((r) => r.id)
      );

      const pdfBuf = await generateReportPdf(
        reportFilterQuerySchema.parse({ dateFrom: longDate, dateTo: longDate })
      );
      const raw = pdfBuf.toString('latin1');
      const pageMatches = raw.match(/\/Type\s*\/Page\b/g) || [];
      expect(pageMatches.length).toBeGreaterThanOrEqual(2);

      const text = extractPdfReadableText(pdfBuf);
      expect(text).toContain('Halaman 1 dari');
      expect(text).toContain(`Halaman 2 dari ${pageMatches.length}`);
      const headerOccurrences = (text.match(/No\. Faktur/g) || []).length;
      expect(headerOccurrences).toBeGreaterThanOrEqual(pageMatches.length);
      expect(text).toContain('Rp 1.440.000');
      expect(text).toContain('Rp 1.584.000');
    });
  });

  describe('4. Uji Performa & EXPLAIN pada 5.000 Pesanan Sintetis', () => {
    it('mengeksekusi summary, pagination, dan ekspor CSV 5.000 pesanan dalam waktu wajar + indeks', async () => {
      await pool.query(seedRaw);

      // Insert 5,000 synthetic orders across 60 days using PostgreSQL generate_series (fast)
      await pool.query(`
        WITH gen AS (
          SELECT
            gs,
            ('INV-BENCH-2026-' || LPAD(gs::text, 5, '0')) AS inv,
            (CASE WHEN gs % 3 = 0 THEN 1 ELSE 2 END) AS uid,
            (ARRAY['tunai','qris','transfer','debit'])[1 + (gs % 4)] AS method,
            (CASE WHEN gs % 25 = 0 THEN 'dibatalkan' WHEN gs % 10 = 0 THEN 'diproses' ELSE 'selesai' END) AS st,
            (TIMESTAMPTZ '2026-08-01 08:00:00+07' + (gs || ' minutes')::interval) AS ts
          FROM generate_series(1, 5000) AS gs
        ),
        ins_orders AS (
          INSERT INTO orders (
            invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan,
            total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total,
            metode_bayar, uang_dibayar, uang_kembali, status, created_at
          )
          SELECT
            inv, uid, 'takeaway', NULL, 'Benchmark User ' || gs,
            50000, 0, NULL, 5000, 55000,
            method, 55000, 0, st, ts
          FROM gen
          RETURNING id
        )
        INSERT INTO order_details (order_id, product_id, harga_satuan, harga_pokok_satuan, kuantiti, subtotal_baris, catatan_khusus)
        SELECT id, 1 + (id % 16), 25000, 9000, 2, 50000, NULL
        FROM ins_orders
      `);
      await pool.query('ANALYZE orders; ANALYZE order_details;');

      const benchFilter = reportFilterQuerySchema.parse({
        dateFrom: '2026-08-01',
        dateTo: '2026-09-01',
        category: 'all',
        metodeBayar: 'all',
        status: 'all',
        limit: 50,
        page: 1,
      });

      const t0 = performance.now();
      const summaryRes = await getReportSummary(benchFilter);
      const tSummaryMs = performance.now() - t0;

      const t1 = performance.now();
      const pageRes = await getReportOrders(benchFilter);
      const tOrdersMs = performance.now() - t1;

      const t2 = performance.now();
      const csvBuf = await generateReportCsv(benchFilter);
      const tCsvMs = performance.now() - t2;

      const t3 = performance.now();
      const pdfBuf = await generateReportPdf(benchFilter);
      const tPdfMs = performance.now() - t3;

      expect(pageRes.total).toBe(5000);
      expect(summaryRes.summary.jumlah_pesanan).toBe(4800); // 200 cancelled excluded (5000 / 25)
      expect(parseCsv(csvBuf).slice(2)).toHaveLength(5000);
      expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      const pdfPages5k = pdfBuf.toString('latin1').match(/\/Type\s*\/Page\b/g) || [];
      expect(pdfPages5k.length).toBeGreaterThanOrEqual(150);

      expect(tSummaryMs).toBeLessThan(1000);
      expect(tOrdersMs).toBeLessThan(1000);
      expect(tCsvMs).toBeLessThan(3000);
      expect(tPdfMs).toBeLessThan(20000);

      // Exceed PDF max (5.001 rows) -> HTTP 422 without truncation
      await pool.query(
        `INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
         VALUES ('INV-BENCH-2026-05001', 2, 'takeaway', NULL, 'Overflow PDF', 50000, 0, NULL, 5000, 55000, 'tunai', 55000, 0, 'selesai', '2026-08-15 10:00:00+07:00'::timestamptz)`
      );
      const overPdfRes = await fetch(
        `${baseUrl}/api/reports/export.pdf?dateFrom=2026-08-01&dateTo=2026-09-01`,
        { headers: { Cookie: adminCookie } }
      );
      expect(overPdfRes.status).toBe(422);
      const overPdfBody = await overPdfRes.json();
      expect(overPdfBody.error.code).toBe('EXPORT_LIMIT_EXCEEDED');
      expect(overPdfBody.error.message).toBe(
        'Hasil terlalu banyak, persempit rentang tanggal atau filter.'
      );
      expect(MAX_PDF_ROWS).toBe(5000);

      // Exceed CSV max (50.001 rows) -> HTTP 422 without truncation
      await pool.query(`
        INSERT INTO orders (invoice_number, user_id, tipe_pesanan, nomor_meja, nama_pemesan, total_subtotal, diskon_nominal, voucher_kode, pajak_nominal, grand_total, metode_bayar, uang_dibayar, uang_kembali, status, created_at)
        SELECT
          'INV-BENCH-2026-' || LPAD(gs::text, 5, '0'),
          2, 'takeaway', NULL, 'Overflow CSV',
          10000, 0, NULL, 1000, 11000, 'tunai', 11000, 0, 'selesai',
          TIMESTAMPTZ '2026-08-20 08:00:00+07'
        FROM generate_series(5002, 50001) AS gs
      `);
      const overCsvRes = await fetch(
        `${baseUrl}/api/reports/export.csv?dateFrom=2026-08-01&dateTo=2026-09-01`,
        { headers: { Cookie: adminCookie } }
      );
      expect(overCsvRes.status).toBe(422);
      const overCsvBody = await overCsvRes.json();
      expect(overCsvBody.error.code).toBe('EXPORT_LIMIT_EXCEEDED');
      expect(overCsvBody.error.message).toBe(
        'Hasil terlalu banyak, persempit rentang tanggal atau filter.'
      );
      expect(MAX_CSV_ROWS).toBe(50000);

      const explainRes = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT o.id, o.invoice_number, o.grand_total
        FROM orders o
        WHERE o.created_at >= ('2026-08-01'::date::timestamp AT TIME ZONE 'Asia/Jakarta')
          AND o.created_at < (('2026-08-07'::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
          AND o.status IN ('diproses', 'selesai')
        ORDER BY o.created_at DESC
        LIMIT 20 OFFSET 0
      `);
      const planText = explainRes.rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(planText).toMatch(/Index/i);
    }, 30000);
  });
});
