// src/modules/categories/categories.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  handleGetAll,
  handleCreate,
  handleUpdate,
  handleDelete,
} from './categories.controller.js';

const router = Router();

const createCategorySchema = z.object({
  nama_kategori: z
    .string()
    .trim()
    .min(2, 'Nama kategori minimal 2 karakter.')
    .max(100, 'Nama kategori maksimal 100 karakter.'),
});

const updateCategorySchema = z
  .object({
    nama_kategori: z
      .string()
      .trim()
      .min(2, 'Nama kategori minimal 2 karakter.')
      .max(100, 'Nama kategori maksimal 100 karakter.')
      .optional(),
    status: z
      .enum(['aktif', 'nonaktif'], {
        errorMap: () => ({ message: 'Status harus aktif atau nonaktif.' }),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu kolom harus diubah.',
  });

router.get('/', requireAuth, handleGetAll);
router.post('/', requireAuth, requireRole('admin'), validate(createCategorySchema), handleCreate);
router.patch('/:id', requireAuth, requireRole('admin'), validate(updateCategorySchema), handleUpdate);
router.delete('/:id', requireAuth, requireRole('admin'), handleDelete);

export default router;
