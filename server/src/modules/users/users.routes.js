// src/modules/users/users.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  handleGetAll,
  handleCreate,
  handleUpdate,
  handleResetPassword,
} from './users.controller.js';

const router = Router();

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter.')
    .max(50, 'Username maksimal 50 karakter.')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.'),
  password: z.string().min(8, 'Password minimal 8 karakter.').max(100),
  nama_lengkap: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(100),
  role: z.enum(['admin', 'kasir'], { errorMap: () => ({ message: 'Role harus admin atau kasir.' }) }),
});

const updateUserSchema = z
  .object({
    nama_lengkap: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(100).optional(),
    role: z.enum(['admin', 'kasir'], { errorMap: () => ({ message: 'Role harus admin atau kasir.' }) }).optional(),
    status: z.enum(['aktif', 'nonaktif'], { errorMap: () => ({ message: 'Status harus aktif atau nonaktif.' }) }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu kolom harus diubah.',
  });

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password baru minimal 8 karakter.').max(100),
});

router.use(requireAuth, requireRole('admin'));

router.get('/', handleGetAll);
router.post('/', validate(createUserSchema), handleCreate);
router.patch('/:id', validate(updateUserSchema), handleUpdate);
router.patch('/:id/reset-password', validate(resetPasswordSchema), handleResetPassword);

export default router;
