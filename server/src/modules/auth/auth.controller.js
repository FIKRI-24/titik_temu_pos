// src/modules/auth/auth.controller.js
import { login, getMe } from './auth.service.js';
import { ok, fail } from '../../utils/response.js';
import { config } from '../../config/env.js';

export function getCookieOptions(isProduction = config.nodeEnv === 'production') {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  };
}

export async function handleLogin(req, res, next) {
  try {
    const { username, password } = req.body;
    const { token, user } = await login(username, password);
    res.cookie('token', token, {
      ...getCookieOptions(),
      maxAge: 8 * 60 * 60 * 1000, // 8 jam
    });
    return ok(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function handleLogout(_req, res) {
  res.clearCookie('token', getCookieOptions());
  return ok(res, null);
}

export async function handleMe(req, res, next) {
  try {
    const user = await getMe(req.user.id);
    if (!user || user.status === 'nonaktif') {
      res.clearCookie('token', getCookieOptions());
      return fail(res, 'Sesi tidak valid atau akun dinonaktifkan.', 401);
    }
    return ok(res, { user });
  } catch (err) {
    next(err);
  }
}
