// src/modules/auth/auth.routes.js
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { handleLogin, handleLogout, handleMe } from './auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, data: null, error: { message: 'Terlalu banyak percobaan login yang gagal. Coba lagi dalam 15 menit.' } },
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username harus diisi.').max(50),
  password: z.string().min(1, 'Password harus diisi.').max(100),
});

router.post('/login', loginLimiter, validate(loginSchema), handleLogin);
router.post('/logout', handleLogout);
router.get('/me', requireAuth, handleMe);

export default router;
