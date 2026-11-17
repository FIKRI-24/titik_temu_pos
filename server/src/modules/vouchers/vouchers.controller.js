// src/modules/vouchers/vouchers.controller.js
import { validateVoucher, getAllVouchers } from './vouchers.service.js';
import { ok } from '../../utils/response.js';

export async function handleValidateVoucher(req, res, next) {
  try {
    const { kode, subtotal } = req.body;
    const data = await validateVoucher(kode, subtotal);
    return ok(res, { voucher: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAllVouchers(_req, res, next) {
  try {
    const vouchers = await getAllVouchers();
    return ok(res, { vouchers });
  } catch (err) {
    next(err);
  }
}
