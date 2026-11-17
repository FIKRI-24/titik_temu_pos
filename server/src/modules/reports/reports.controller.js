// src/modules/reports/reports.controller.js
import {
  getReportOrders,
  getReportSummary,
  generateReportCsv,
  generateReportPdf,
  sanitizeExportFilename,
} from './reports.service.js';
import { ok } from '../../utils/response.js';

export async function handleGetReportOrders(req, res, next) {
  try {
    const data = await getReportOrders(req.query);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetReportSummary(req, res, next) {
  try {
    const data = await getReportSummary(req.query);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function handleExportCsv(req, res, next) {
  try {
    const buffer = await generateReportCsv(req.query);
    const filename = sanitizeExportFilename(
      `laporan-penjualan-${req.query.dateFrom}_${req.query.dateTo}.csv`
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function handleExportPdf(req, res, next) {
  try {
    const buffer = await generateReportPdf(req.query);
    const filename = sanitizeExportFilename(
      `laporan-penjualan-${req.query.dateFrom}_${req.query.dateTo}.pdf`
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}
