// src/modules/reports/reports.service.js
import PDFDocument from 'pdfkit';
import { pool } from '../../config/db.js';
import { formatRupiah } from '../../utils/money.js';

export const MAX_CSV_ROWS = 50000;
export const MAX_PDF_ROWS = 5000;

export function sanitizeExportFilename(rawName) {
  const cleaned = String(rawName || 'laporan-penjualan')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^\.+/, '');
  return cleaned || 'laporan-penjualan';
}

const SORT_COLUMN_MAP = Object.freeze({
  created_at: 'o.created_at',
  invoice_number: 'o.invoice_number',
  kasir_nama: 'u.nama_lengkap',
  tipe_pesanan: 'o.tipe_pesanan',
  item_terjual: 'item_terjual',
  total_subtotal: 'o.total_subtotal',
  pajak_nominal: 'o.pajak_nominal',
  grand_total: 'o.grand_total',
  status: 'o.status',
});

const CATEGORY_LABELS = Object.freeze({
  all: 'Semua Kategori',
  coffee: 'Coffee',
  'non-coffee': 'Non-Coffee',
  food: 'Food',
  pastry: 'Pastry',
});

const METHOD_LABELS = Object.freeze({
  all: 'Semua Metode',
  tunai: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Debit',
});

const STATUS_LABELS = Object.freeze({
  all: 'Semua Status',
  aktif: 'Diproses & Selesai',
  diproses: 'Diproses',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
});

const WIB_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatDateTimeWibParts(isoOrDate) {
  const parts = {};
  for (const p of WIB_PARTS_FORMATTER.formatToParts(new Date(isoOrDate))) {
    parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    dmy: `${parts.day}/${parts.month}/${parts.year}`,
    hm: `${hour}:${parts.minute}`,
    hms: `${hour}:${parts.minute}:${parts.second}`,
  };
}

export function formatCsvTimestampWib(isoOrDate) {
  const { ymd, hms } = formatDateTimeWibParts(isoOrDate);
  return `${ymd} ${hms} WIB`;
}

export function formatPdfTimestampWib(isoOrDate) {
  const { dmy, hm } = formatDateTimeWibParts(isoOrDate);
  return `${dmy} ${hm} WIB`;
}

/**
 * Neutralize spreadsheet formula triggers (=, +, -, @, tab, CR) on text fields,
 * then quote according to RFC 4180 CSV rules.
 */
export function formatCsvCell(value, { isNumeric = false } = {}) {
  if (value === null || value === undefined) {
    return '';
  }
  if (isNumeric) {
    return String(Number(value));
  }
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Build parameterized WHERE clause for Asia/Jakarta inclusive date bounds [start_ts, end_ts).
 * Always uses EXISTS for category filter so multi-item orders never duplicate rows or totals.
 */
export function buildReportWhere(filters, { summaryOnly = false } = {}) {
  const params = [filters.dateFrom, filters.dateTo];
  const conditions = [
    `o.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
    `o.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')`,
  ];

  if (filters.category && filters.category !== 'all') {
    params.push(filters.category);
    conditions.push(`EXISTS (
      SELECT 1
      FROM order_details od_f
      JOIN products p_f ON p_f.id = od_f.product_id
      JOIN categories c_f ON c_f.id = p_f.category_id
      WHERE od_f.order_id = o.id
        AND c_f.slug = $${params.length}
    )`);
  }

  if (filters.metodeBayar && filters.metodeBayar !== 'all') {
    params.push(filters.metodeBayar);
    conditions.push(`o.metode_bayar = $${params.length}`);
  }

  if (summaryOnly) {
    // Cancelled orders NEVER enter any report summary metrics
    if (filters.status === 'dibatalkan') {
      conditions.push('FALSE');
    } else if (filters.status === 'diproses' || filters.status === 'selesai') {
      params.push(filters.status);
      conditions.push(`o.status = $${params.length}`);
    } else {
      conditions.push(`o.status IN ('diproses', 'selesai')`);
    }
  } else if (filters.status === 'aktif') {
    conditions.push(`o.status IN ('diproses', 'selesai')`);
  } else if (
    filters.status === 'diproses' ||
    filters.status === 'selesai' ||
    filters.status === 'dibatalkan'
  ) {
    params.push(filters.status);
    conditions.push(`o.status = $${params.length}`);
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  };
}

function resolveSortOrder(sortBy, sortDir) {
  const col = SORT_COLUMN_MAP[sortBy];
  if (!col) {
    const err = new Error('Kolom pengurutan tidak valid.');
    err.status = 422;
    throw err;
  }
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  if (col === 'o.created_at') {
    return `${col} ${dir}, o.id ${dir}`;
  }
  return `${col} ${dir}, o.created_at DESC, o.id DESC`;
}

/**
 * Paginated orders table for Reports page.
 */
export async function getReportOrders(filters, dbPool = pool) {
  const { whereSql, params } = buildReportWhere(filters, { summaryOnly: false });
  const orderBySql = resolveSortOrder(filters.sortBy, filters.sortDir);
  const limit = filters.limit;
  const page = filters.page;
  const offset = (page - 1) * limit;

  const countRes = await dbPool.query(
    `SELECT COUNT(*)::int AS total FROM orders o WHERE ${whereSql}`,
    params
  );
  const total = countRes.rows[0].total;

  const queryParams = [...params, limit, offset];
  const limitIdx = queryParams.length - 1;
  const offsetIdx = queryParams.length;

  let rowsRes;
  if (filters.sortBy === 'item_terjual') {
    rowsRes = await dbPool.query(
      `SELECT o.id,
              o.invoice_number,
              o.created_at,
              u.nama_lengkap AS kasir_nama,
              o.tipe_pesanan,
              o.nomor_meja,
              o.nama_pemesan,
              o.metode_bayar,
              o.total_subtotal,
              o.diskon_nominal,
              o.pajak_nominal,
              o.grand_total,
              o.status,
              COALESCE(SUM(od.kuantiti), 0)::int AS item_terjual
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN order_details od ON od.order_id = o.id
       WHERE ${whereSql}
       GROUP BY o.id, u.nama_lengkap
       ORDER BY ${orderBySql}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      queryParams
    );
  } else {
    rowsRes = await dbPool.query(
      `WITH paged AS (
         SELECT o.id,
                o.invoice_number,
                o.created_at,
                u.nama_lengkap AS kasir_nama,
                o.tipe_pesanan,
                o.nomor_meja,
                o.nama_pemesan,
                o.metode_bayar,
                o.total_subtotal,
                o.diskon_nominal,
                o.pajak_nominal,
                o.grand_total,
                o.status
         FROM orders o
         JOIN users u ON u.id = o.user_id
         WHERE ${whereSql}
         ORDER BY ${orderBySql}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
       )
       SELECT p.*,
              COALESCE(od_agg.item_terjual, 0)::int AS item_terjual
       FROM paged p
       LEFT JOIN LATERAL (
         SELECT SUM(od.kuantiti)::int AS item_terjual
         FROM order_details od
         WHERE od.order_id = p.id
       ) od_agg ON TRUE`,
      queryParams
    );
  }

  return {
    filters: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      category: filters.category,
      metodeBayar: filters.metodeBayar,
      status: filters.status,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    },
    orders: rowsRes.rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Unpaginated list for CSV/PDF exports matching screen filter and sort order.
 */
export async function getAllFilteredReportOrders(filters, dbPool = pool) {
  const { whereSql, params } = buildReportWhere(filters, { summaryOnly: false });
  const orderBySql = resolveSortOrder(filters.sortBy, filters.sortDir);

  const result = await dbPool.query(
    `SELECT o.id,
            o.invoice_number,
            o.created_at,
            u.nama_lengkap AS kasir_nama,
            o.tipe_pesanan,
            o.nomor_meja,
            o.nama_pemesan,
            o.metode_bayar,
            o.total_subtotal,
            o.diskon_nominal,
            o.pajak_nominal,
            o.grand_total,
            o.status,
            COALESCE(SUM(od.kuantiti), 0)::int AS item_terjual
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN order_details od ON od.order_id = o.id
     WHERE ${whereSql}
     GROUP BY o.id, u.nama_lengkap
     ORDER BY ${orderBySql}`,
    params
  );

  return result.rows;
}

/**
 * Summary metrics + category revenue breakdown across ALL matching non-cancelled orders.
 */
export async function getReportSummary(filters, dbPool = pool) {
  const { whereSql: summaryWhereSql, params } = buildReportWhere(filters, {
    summaryOnly: true,
  });

  const summaryRes = await dbPool.query(
    `WITH matching_orders AS (
       SELECT o.id, o.total_subtotal, o.diskon_nominal, o.pajak_nominal, o.grand_total
       FROM orders o
       WHERE ${summaryWhereSql}
     ),
     order_agg AS (
       SELECT
         COUNT(*)::int AS jumlah_pesanan,
         COALESCE(SUM(total_subtotal), 0)::bigint AS omset_bruto,
         COALESCE(SUM(diskon_nominal), 0)::bigint AS total_diskon,
         COALESCE(SUM(total_subtotal - diskon_nominal), 0)::bigint AS omset_bersih,
         COALESCE(SUM(pajak_nominal), 0)::bigint AS total_pajak,
         COALESCE(SUM(grand_total), 0)::bigint AS total_diterima
       FROM matching_orders
     ),
     hpp_agg AS (
       SELECT
         COALESCE(SUM(od.harga_pokok_satuan::bigint * od.kuantiti::bigint), 0)::bigint AS total_hpp,
         COALESCE(SUM(od.kuantiti), 0)::int AS total_item_terjual
       FROM order_details od
       JOIN matching_orders mo ON mo.id = od.order_id
     )
     SELECT
       oa.jumlah_pesanan,
       oa.omset_bruto,
       oa.total_diskon,
       oa.omset_bersih,
       oa.total_pajak,
       oa.total_diterima,
       ha.total_hpp,
       ha.total_item_terjual
     FROM order_agg oa
     CROSS JOIN hpp_agg ha`,
    params
  );

  const row = summaryRes.rows[0];
  const jumlahPesanan = Number(row.jumlah_pesanan);
  const omsetBruto = Number(row.omset_bruto);
  const totalDiskon = Number(row.total_diskon);
  const omsetBersih = Number(row.omset_bersih);
  const totalPajak = Number(row.total_pajak);
  const totalDiterima = Number(row.total_diterima);
  const totalHpp = Number(row.total_hpp);
  const totalItemTerjual = Number(row.total_item_terjual);
  const labaKotor = omsetBersih - totalHpp;
  const rataRataTransaksi =
    jumlahPesanan > 0 ? Math.round(totalDiterima / jumlahPesanan) : 0;

  const catRes = await dbPool.query(
    `WITH matching_orders AS (
       SELECT o.id
       FROM orders o
       WHERE ${summaryWhereSql}
     )
     SELECT
       c.id,
       c.nama_kategori,
       c.slug,
       COALESCE(SUM(od.subtotal_baris), 0)::bigint AS total_penjualan,
       COALESCE(SUM(od.kuantiti), 0)::int AS total_qty
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     LEFT JOIN order_details od
       ON od.product_id = p.id
      AND EXISTS (SELECT 1 FROM matching_orders mo WHERE mo.id = od.order_id)
     GROUP BY c.id, c.nama_kategori, c.slug
     ORDER BY total_penjualan DESC, c.nama_kategori ASC`,
    params
  );

  return {
    filters: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      category: filters.category,
      metodeBayar: filters.metodeBayar,
      status: filters.status,
    },
    summary: {
      jumlah_pesanan: jumlahPesanan,
      total_item_terjual: totalItemTerjual,
      omset_bruto: omsetBruto,
      total_diskon: totalDiskon,
      omset_bersih: omsetBersih,
      total_pajak: totalPajak,
      total_diterima: totalDiterima,
      rata_rata_transaksi: rataRataTransaksi,
      total_hpp: totalHpp,
      laba_kotor: labaKotor,
    },
    omset_per_kategori: catRes.rows.map((c) => ({
      id: c.id,
      nama_kategori: c.nama_kategori,
      slug: c.slug,
      total_penjualan: Number(c.total_penjualan),
      total_qty: Number(c.total_qty),
    })),
  };
}

export async function countMatchingReportOrders(filters, dbPool = pool) {
  const { whereSql, params } = buildReportWhere(filters, { summaryOnly: false });
  const res = await dbPool.query(
    `SELECT COUNT(*)::int AS total FROM orders o WHERE ${whereSql}`,
    params
  );
  return res.rows[0].total;
}

/**
 * Generate RFC 4180 CSV with UTF-8 BOM + `sep=,` Excel directive, raw integer numbers,
 * WIB timestamps, formula-injection protection, and unpaginated rows matching active filters.
 */
export async function generateReportCsv(filters, dbPool = pool) {
  const totalCount = await countMatchingReportOrders(filters, dbPool);
  if (totalCount > MAX_CSV_ROWS) {
    const err = new Error('Hasil terlalu banyak, persempit rentang tanggal atau filter.');
    err.status = 422;
    err.code = 'EXPORT_LIMIT_EXCEEDED';
    throw err;
  }

  const rows = await getAllFilteredReportOrders(filters, dbPool);

  const headers = [
    'No. Faktur',
    'Tanggal & Jam (WIB)',
    'Kasir',
    'Tipe Pesanan',
    'Nomor Meja',
    'Nama Pemesan',
    'Metode Bayar',
    'Item Terjual',
    'Subtotal',
    'Diskon',
    'Pajak PB1',
    'Grand Total',
    'Status',
  ];

  const lines = ['sep=,', headers.map((h) => formatCsvCell(h)).join(',')];

  for (const r of rows) {
    const tipeLabel = r.tipe_pesanan === 'dine_in' ? 'Dine-In' : 'Takeaway';
    const metodeLabel = METHOD_LABELS[r.metode_bayar] || r.metode_bayar;
    const statusLabel = STATUS_LABELS[r.status] || r.status;

    lines.push(
      [
        formatCsvCell(r.invoice_number),
        formatCsvCell(formatCsvTimestampWib(r.created_at)),
        formatCsvCell(r.kasir_nama),
        formatCsvCell(tipeLabel),
        formatCsvCell(r.nomor_meja ?? '', { isNumeric: r.nomor_meja !== null && r.nomor_meja !== undefined }),
        formatCsvCell(r.nama_pemesan ?? ''),
        formatCsvCell(metodeLabel),
        formatCsvCell(r.item_terjual, { isNumeric: true }),
        formatCsvCell(r.total_subtotal, { isNumeric: true }),
        formatCsvCell(r.diskon_nominal, { isNumeric: true }),
        formatCsvCell(r.pajak_nominal, { isNumeric: true }),
        formatCsvCell(r.grand_total, { isNumeric: true }),
        formatCsvCell(statusLabel),
      ].join(',')
    );
  }

  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
}

/**
 * Generate A4 Landscape PDF report using PDFKit with repeating table headers,
 * wrapped multi-line columns, summary metrics, active filters, and page numbers.
 */
export async function generateReportPdf(filters, dbPool = pool) {
  const totalCount = await countMatchingReportOrders(filters, dbPool);
  if (totalCount > MAX_PDF_ROWS) {
    const err = new Error('Hasil terlalu banyak, persempit rentang tanggal atau filter.');
    err.status = 422;
    err.code = 'EXPORT_LIMIT_EXCEEDED';
    throw err;
  }

  const [reportSummary, rows] = await Promise.all([
    getReportSummary(filters, dbPool),
    getAllFilteredReportOrders(filters, dbPool),
  ]);

  const { summary } = reportSummary;

  const columns = [
    { key: 'invoice', label: 'No. Faktur', width: 112, align: 'left' },
    { key: 'waktu', label: 'Tanggal & Jam', width: 92, align: 'left' },
    { key: 'kasir', label: 'Kasir', width: 88, align: 'left' },
    { key: 'layanan', label: 'Layanan / Pemesan', width: 92, align: 'left' },
    { key: 'item', label: 'Item', width: 38, align: 'right' },
    { key: 'subtotal', label: 'Subtotal', width: 80, align: 'right' },
    { key: 'pajak', label: 'Pajak PB1', width: 70, align: 'right' },
    { key: 'grand', label: 'Grand Total', width: 85, align: 'right' },
    { key: 'metode', label: 'Metode', width: 52, align: 'left' },
    { key: 'status', label: 'Status', width: 60, align: 'left' },
  ]; // total width = 769 pt on A4 landscape (841.89 - 72 margins = 769.89 pt)

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    info: {
      Title: `Laporan Penjualan Titik Temu Kopi (${filters.dateFrom} s.d. ${filters.dateTo})`,
      Author: 'Titik Temu Kopi POS',
    },
  });

  const chunks = [];
  const pdfPromise = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const leftMargin = 36;
  const tableWidth = columns.reduce((acc, c) => acc + c.width, 0);
  const bottomLimit = doc.page.height - 46;

  // Report Header
  doc.fillColor('#16241F').font('Helvetica-Bold').fontSize(15);
  doc.text('TITIK TEMU KOPI - LAPORAN PENJUALAN', leftMargin, 32);

  doc.font('Helvetica').fontSize(9).fillColor('#2F4E44');
  const filterInfo = [
    `Periode: ${filters.dateFrom} s.d. ${filters.dateTo} (WIB)`,
    `Kategori: ${CATEGORY_LABELS[filters.category] || filters.category}`,
    `Metode: ${METHOD_LABELS[filters.metodeBayar] || filters.metodeBayar}`,
    `Status: ${STATUS_LABELS[filters.status] || filters.status}`,
  ].join('  |  ');
  doc.text(filterInfo, leftMargin, 52);
  doc.text(`Waktu cetak: ${formatPdfTimestampWib(new Date())}`, leftMargin, 65);

  // Summary Box
  const boxY = 82;
  const boxH = 66;
  doc
    .save()
    .rect(leftMargin, boxY, tableWidth, boxH)
    .fillAndStroke('#F4F7F5', '#C5D5CC')
    .restore();

  const kpiCells = [
    { label: 'Omset Bersih', val: formatRupiah(summary.omset_bersih) },
    { label: 'Total Diterima', val: formatRupiah(summary.total_diterima) },
    { label: 'Omset Bruto', val: formatRupiah(summary.omset_bruto) },
    { label: 'Total Diskon', val: formatRupiah(summary.total_diskon) },
    { label: 'Total Pajak PB1', val: formatRupiah(summary.total_pajak) },
    { label: 'Laba Kotor', val: formatRupiah(summary.laba_kotor) },
    { label: 'Rata-rata Transaksi', val: formatRupiah(summary.rata_rata_transaksi) },
    { label: 'Pesanan (Non-Batal)', val: `${summary.jumlah_pesanan} trx (${summary.total_item_terjual} item)` },
  ];

  const colW = tableWidth / 4;
  kpiCells.forEach((cell, idx) => {
    const colIdx = idx % 4;
    const rowIdx = Math.floor(idx / 4);
    const cx = leftMargin + 10 + colIdx * colW;
    const cy = boxY + 8 + rowIdx * 28;
    doc.font('Helvetica').fontSize(7.5).fillColor('#4E7066').text(cell.label, cx, cy, { width: colW - 14 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#16241F').text(cell.val, cx, cy + 10, { width: colW - 14 });
  });

  doc.font('Helvetica').fontSize(7.5).fillColor('#4E7066').text(
    'Catatan: Pesanan berstatus Dibatalkan tidak dihitung dalam ringkasan di atas.',
    leftMargin,
    boxY + boxH + 5
  );

  function drawTableHeader(startY) {
    doc.save().rect(leftMargin, startY, tableWidth, 22).fill('#0E6B5C').restore();
    let x = leftMargin;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    for (const col of columns) {
      doc.text(col.label, x + 4, startY + 7, {
        width: col.width - 8,
        align: col.align,
      });
      x += col.width;
    }
    return startY + 22;
  }

  let y = drawTableHeader(boxY + boxH + 20);

  if (rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#4E7066')
      .text('Belum ada transaksi pada periode ini.', leftMargin, y + 16, {
        width: tableWidth,
        align: 'center',
      });
  } else {
    rows.forEach((r, idx) => {
      const tipeText =
        r.tipe_pesanan === 'dine_in'
          ? `Dine-In (Meja ${r.nomor_meja})`
          : 'Takeaway';
      const layananText = r.nama_pemesan ? `${tipeText}\n${r.nama_pemesan}` : tipeText;

      const cellTexts = {
        invoice: String(r.invoice_number),
        waktu: formatPdfTimestampWib(r.created_at),
        kasir: String(r.kasir_nama || '-'),
        layanan: layananText,
        item: String(r.item_terjual),
        subtotal: formatRupiah(r.total_subtotal),
        pajak: formatRupiah(r.pajak_nominal),
        grand: formatRupiah(r.grand_total),
        metode: METHOD_LABELS[r.metode_bayar] || r.metode_bayar,
        status: STATUS_LABELS[r.status] || r.status,
      };

      doc.font('Helvetica').fontSize(7.8);
      let maxTextHeight = 10;
      for (const colKey of ['kasir', 'layanan']) {
        const textVal = cellTexts[colKey];
        if (textVal.includes('\n') || textVal.length > 14) {
          const colW = colKey === 'kasir' ? 80 : 84;
          const h = doc.heightOfString(textVal, { width: colW, align: 'left' });
          if (h > maxTextHeight) {
            maxTextHeight = h;
          }
        }
      }
      const rowHeight = Math.max(20, Math.ceil(maxTextHeight) + 8);

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawTableHeader(36);
      }

      if (idx % 2 === 1) {
        doc.save().rect(leftMargin, y, tableWidth, rowHeight).fill('#F8FAF9').restore();
      }
      doc
        .save()
        .moveTo(leftMargin, y + rowHeight)
        .lineTo(leftMargin + tableWidth, y + rowHeight)
        .strokeColor('#E2EAE6')
        .lineWidth(0.5)
        .stroke()
        .restore();

      let x = leftMargin;
      for (const col of columns) {
        const isCancelled = r.status === 'dibatalkan';
        doc
          .font(col.key === 'grand' || col.key === 'invoice' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.8)
          .fillColor(col.key === 'status' && isCancelled ? '#B3263E' : '#16241F')
          .text(cellTexts[col.key], x + 4, y + 5, {
            width: col.width - 8,
            align: col.align,
          });
        x += col.width;
      }

      y += rowHeight;
    });
  }

  // Stamp page numbers across all buffered pages without triggering extra pages
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i += 1) {
    doc.switchToPage(pageRange.start + i);
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#4E7066')
      .text(
        `Titik Temu Kopi POS — Halaman ${i + 1} dari ${pageRange.count}`,
        leftMargin,
        doc.page.height - 24,
        {
          width: tableWidth,
          align: 'right',
          lineBreak: false,
        }
      );
    doc.page.margins.bottom = prevBottom;
  }

  doc.end();
  return pdfPromise;
}
