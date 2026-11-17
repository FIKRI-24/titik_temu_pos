// src/utils/response.js
// Standardized API response format { ok, data, error }

export function ok(res, data = null, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, data, error: null });
}

export function fail(res, message, statusCode = 400, details = null) {
  return res.status(statusCode).json({
    ok: false,
    data: null,
    error: { message, details },
  });
}
