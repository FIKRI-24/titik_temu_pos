// src/modules/orders/orders.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  handleCreateOrder,
  handleGetOrders,
  handleGetOrderById,
  handleUpdateOrderStatus,
} from './orders.controller.js';

const router = Router();

export const createOrderSchema = z
  .object({
    tipe_pesanan: z.enum(['dine_in', 'takeaway'], {
      errorMap: () => ({ message: 'Tipe pesanan harus dine_in atau takeaway.' }),
    }),
    nomor_meja: z
      .number({ invalid_type_error: 'Nomor meja harus berupa angka 1 sampai 20.' })
      .int('Nomor meja harus bilangan bulat.')
      .min(1, 'Nomor meja minimal 1.')
      .max(20, 'Nomor meja maksimal 20.')
      .nullable()
      .optional(),
    nama_pemesan: z.string().trim().max(60, 'Nama pemesan maksimal 60 karakter.').nullable().optional(),
    items: z
      .array(
        z.object({
          product_id: z.number().int().positive('Produk tidak valid.'),
          kuantiti: z
            .number({ invalid_type_error: 'Jumlah item harus berupa angka.' })
            .int('Jumlah item harus bilangan bulat.')
            .min(1, 'Jumlah item minimal 1.')
            .max(99, 'Jumlah item per baris maksimal 99.'),
          catatan_khusus: z.string().trim().max(120, 'Catatan khusus maksimal 120 karakter.').nullable().optional(),
        })
      )
      .min(1, 'Pilih minimal satu menu sebelum menyimpan pesanan.')
      .max(30, 'Maksimal 30 baris item per pesanan.'),
    voucher_kode: z.string().trim().max(50).nullable().optional(),
    metode_bayar: z.enum(['tunai', 'qris', 'transfer', 'debit'], {
      errorMap: () => ({ message: 'Metode pembayaran tidak valid.' }),
    }),
    uang_dibayar: z
      .number({ invalid_type_error: 'Nominal uang diterima harus berupa angka.' })
      .int('Nominal uang diterima harus bilangan bulat.')
      .min(0, 'Nominal uang diterima tidak boleh negatif.')
      .max(100000000, 'Nominal uang diterima maksimal Rp 100.000.000.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipe_pesanan === 'dine_in' && (data.nomor_meja === undefined || data.nomor_meja === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nomor_meja'],
        message: 'Nomor meja (1 sampai 20) wajib dipilih untuk pesanan Dine-In.',
      });
    }
    if (data.metode_bayar === 'tunai' && (data.uang_dibayar === undefined || data.uang_dibayar === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uang_dibayar'],
        message: 'Nominal uang diterima wajib diisi untuk pembayaran tunai.',
      });
    }
  });

export const updateOrderStatusSchema = z.object({
  status: z.enum(['selesai', 'dibatalkan'], {
    errorMap: () => ({ message: 'Status hanya boleh diubah menjadi selesai atau dibatalkan.' }),
  }),
});

router.use(requireAuth);

router.post('/', validate(createOrderSchema), handleCreateOrder);
router.get('/', handleGetOrders);
router.get('/:id', handleGetOrderById);
router.patch('/:id/status', validate(updateOrderStatusSchema), handleUpdateOrderStatus);

export default router;
