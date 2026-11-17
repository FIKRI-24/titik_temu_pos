// src/modules/reports/reports.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { getTodayDateJakarta } from '../../utils/invoice.js';
import {
  handleGetReportOrders,
  handleGetReportSummary,
  handleExportCsv,
  handleExportPdf,
} from './reports.controller.js';

const router = Router();

const CATEGORY_NORMALIZATION = {
  all: 'all',
  coffee: 'coffee',
  'non-coffee': 'non-coffee',
  food: 'food',
  pastry: 'pastry',
};

export const SORT_KEYS = [
  'created_at',
  'invoice_number',
  'kasir_nama',
  'tipe_pesanan',
  'item_terjual',
  'total_subtotal',
  'pajak_nominal',
  'grand_total',
  'status',
];

function isValidIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function addDaysIsoDate(isoDateStr, offsetDays) {
  const [y, m, d] = isoDateStr.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffDaysInclusive(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map((v) => parseInt(v, 10));
  const [ty, tm, td] = toIso.split('-').map((v) => parseInt(v, 10));
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.floor((toUtc - fromUtc) / 86400000) + 1;
}

const optionalDateSchema = z
  .string({ invalid_type_error: 'Format tanggal tidak valid.' })
  .trim()
  .refine((v) => v === '' || isValidIsoCalendarDate(v), {
    message: 'Tanggal harus berformat YYYY-MM-DD yang valid.',
  })
  .optional();

export const reportFilterQuerySchema = z
  .object({
    dateFrom: optionalDateSchema,
    dateTo: optionalDateSchema,
    category: z
      .string({ invalid_type_error: 'Kategori tidak valid.' })
      .trim()
      .optional()
      .default('all')
      .transform((v) => v.toLowerCase())
      .refine((v) => Object.prototype.hasOwnProperty.call(CATEGORY_NORMALIZATION, v), {
        message: 'Kategori harus salah satu dari: all, Coffee, Non-Coffee, Food, Pastry.',
      }),
    metodeBayar: z
      .enum(['all', 'tunai', 'qris', 'transfer', 'debit'], {
        errorMap: () => ({
          message: 'Metode pembayaran harus salah satu dari: all, tunai, qris, transfer, debit.',
        }),
      })
      .optional()
      .default('all'),
    status: z
      .enum(['all', 'aktif', 'diproses', 'selesai', 'dibatalkan'], {
        errorMap: () => ({
          message: 'Status harus salah satu dari: all, aktif, diproses, selesai, dibatalkan.',
        }),
      })
      .optional()
      .default('all'),
    sortBy: z
      .enum(SORT_KEYS, {
        errorMap: () => ({
          message: 'Kolom pengurutan (sortBy) tidak valid.',
        }),
      })
      .optional()
      .default('created_at'),
    sortDir: z
      .string()
      .trim()
      .optional()
      .default('desc')
      .transform((v) => v.toLowerCase())
      .refine((v) => v === 'asc' || v === 'desc', {
        message: 'Arah pengurutan (sortDir) harus asc atau desc.',
      }),
    page: z
      .preprocess(
        (v) => (v === undefined || v === '' ? 1 : Number(v)),
        z
          .number({ invalid_type_error: 'Halaman harus berupa angka.' })
          .int('Halaman harus bilangan bulat.')
          .min(1, 'Halaman minimal 1.')
      )
      .optional()
      .default(1),
    limit: z
      .preprocess(
        (v) => (v === undefined || v === '' ? 20 : Number(v)),
        z
          .number({ invalid_type_error: 'Batas baris per halaman harus berupa angka.' })
          .int('Batas baris per halaman harus bilangan bulat.')
          .min(1, 'Batas baris per halaman minimal 1.')
          .max(100, 'Batas baris per halaman maksimal 100.')
      )
      .optional()
      .default(20),
  })
  .transform((data) => {
    const todayWib = getTodayDateJakarta();
    let dateFrom = data.dateFrom || '';
    let dateTo = data.dateTo || '';

    if (!dateFrom && !dateTo) {
      dateTo = todayWib;
      dateFrom = addDaysIsoDate(todayWib, -6);
    } else if (dateFrom && !dateTo) {
      dateTo = dateFrom;
    } else if (!dateFrom && dateTo) {
      dateFrom = dateTo;
    }

    return {
      ...data,
      dateFrom,
      dateTo,
    };
  })
  .superRefine((data, ctx) => {
    if (data.dateFrom > data.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'Tanggal akhir (sampai) tidak boleh lebih awal dari tanggal awal (dari).',
      });
      return;
    }
    const span = diffDaysInclusive(data.dateFrom, data.dateTo);
    if (span > 366) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'Rentang tanggal laporan maksimal 366 hari.',
      });
    }
  });

// All report endpoints require authenticated Admin
router.use(requireAuth, requireRole('admin'));

router.get('/orders', validateQuery(reportFilterQuerySchema), handleGetReportOrders);
router.get('/summary', validateQuery(reportFilterQuerySchema), handleGetReportSummary);
router.get('/export.csv', validateQuery(reportFilterQuerySchema), handleExportCsv);
router.get('/export.pdf', validateQuery(reportFilterQuerySchema), handleExportPdf);

export default router;
