// src/modules/vouchers/vouchers.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { handleValidateVoucher, handleGetAllVouchers } from './vouchers.controller.js';

const router = Router();

const validateVoucherSchema = z.object({
  kode: z.string().trim().min(1, 'Kode voucher harus diisi.').max(50),
  subtotal: z
    .number({ invalid_type_error: 'Subtotal harus berupa angka.' })
    .int('Subtotal harus bilangan bulat rupiah.')
    .min(0, 'Subtotal tidak boleh negatif.'),
});

router.post('/validate', requireAuth, validate(validateVoucherSchema), handleValidateVoucher);
router.get('/', requireAuth, requireRole('admin'), handleGetAllVouchers);

export default router;
