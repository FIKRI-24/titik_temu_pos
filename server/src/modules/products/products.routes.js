// src/modules/products/products.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  handleGetAll,
  handleGetOne,
  handleCreate,
  handleUpdate,
  handleUpdateStock,
  handleGetStockHistory,
  handleDelete,
} from './products.controller.js';

const router = Router();

export const createProductSchema = z.object({
  category_id: z.number({ invalid_type_error: 'Kategori harus dipilih.' }).int().positive('Kategori tidak valid.'),
  kode_produk: z
    .string()
    .trim()
    .min(2, 'Kode produk minimal 2 karakter.')
    .max(50, 'Kode produk maksimal 50 karakter.'),
  nama_produk: z
    .string()
    .trim()
    .min(2, 'Nama menu minimal 2 karakter.')
    .max(150, 'Nama menu maksimal 150 karakter.'),
  harga_jual: z.number({ invalid_type_error: 'Harga jual harus berupa angka.' }).int('Harga jual harus bilangan bulat rupiah.').min(0, 'Harga jual tidak boleh negatif.'),
  harga_pokok: z.number({ invalid_type_error: 'Harga pokok harus berupa angka.' }).int('Harga pokok harus bilangan bulat rupiah.').min(0, 'Harga pokok tidak boleh negatif.'),
  stok: z.number({ invalid_type_error: 'Stok harus berupa angka.' }).int('Stok harus bilangan bulat.').min(0, 'Stok tidak boleh negatif.'),
  stok_minimum: z.number({ invalid_type_error: 'Stok minimum harus berupa angka.' }).int('Stok minimum harus bilangan bulat.').min(0, 'Stok minimum tidak boleh negatif.'),
  unit: z.string().trim().min(1, 'Satuan unit harus diisi.').max(30, 'Satuan maksimal 30 karakter.'),
  konfirmasi_harga_pokok_tinggi: z.boolean().optional().default(false),
});

export const updateProductSchema = z
  .object({
    category_id: z.number().int().positive('Kategori tidak valid.').optional(),
    kode_produk: z.string().trim().min(2, 'Kode produk minimal 2 karakter.').max(50).optional(),
    nama_produk: z.string().trim().min(2, 'Nama menu minimal 2 karakter.').max(150).optional(),
    harga_jual: z.number().int('Harga jual harus bilangan bulat rupiah.').min(0, 'Harga jual tidak boleh negatif.').optional(),
    harga_pokok: z.number().int('Harga pokok harus bilangan bulat rupiah.').min(0, 'Harga pokok tidak boleh negatif.').optional(),
    stok_minimum: z.number().int('Stok minimum harus bilangan bulat.').min(0, 'Stok minimum tidak boleh negatif.').optional(),
    unit: z.string().trim().min(1, 'Satuan unit harus diisi.').max(30).optional(),
    status: z.enum(['aktif', 'nonaktif'], { errorMap: () => ({ message: 'Status harus aktif atau nonaktif.' }) }).optional(),
    konfirmasi_harga_pokok_tinggi: z.boolean().optional().default(false),
  })
  .refine((data) => Object.keys(data).some((k) => k !== 'konfirmasi_harga_pokok_tinggi'), {
    message: 'Minimal satu kolom harus diubah.',
  });

export const updateStockSchema = z
  .object({
    mode: z.enum(['set', 'selisih'], {
      errorMap: () => ({ message: 'Mode penyesuaian stok harus set atau selisih.' }),
    }),
    nilai: z.number({ invalid_type_error: 'Nilai stok harus berupa angka.' }).int('Nilai stok harus bilangan bulat.'),
    catatan: z.string().trim().max(200, 'Catatan maksimal 200 karakter.').optional(),
  })
  .refine((d) => !(d.mode === 'set' && d.nilai < 0), {
    message: 'Nilai stok baru tidak boleh negatif.',
    path: ['nilai'],
  });

router.get('/', requireAuth, handleGetAll);
router.get('/:id', requireAuth, handleGetOne);
router.get('/:id/stok-history', requireAuth, requireRole('admin'), handleGetStockHistory);

router.post('/', requireAuth, requireRole('admin'), validate(createProductSchema), handleCreate);
router.patch('/:id', requireAuth, requireRole('admin'), validate(updateProductSchema), handleUpdate);
router.patch('/:id/stok', requireAuth, requireRole('admin'), validate(updateStockSchema), handleUpdateStock);
router.delete('/:id', requireAuth, requireRole('admin'), handleDelete);

export default router;
