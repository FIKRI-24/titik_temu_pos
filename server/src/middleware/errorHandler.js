// src/middleware/errorHandler.js
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;
  const message = isServerError ? 'Terjadi kesalahan pada server.' : err.message;

  // Log server errors (never to console.log; hidden from client responses)
  if (isServerError) {
    process.stderr.write(`[ERROR] ${req.method} ${req.url}: ${err.message}\n${err.stack}\n`);
  }

  return res.status(status).json({
    ok: false,
    data: null,
    error: {
      message,
      ...(!isServerError && err.code ? { code: err.code } : {}),
    },
  });
}

export function notFound(req, res) {
  return res.status(404).json({
    ok: false,
    data: null,
    error: { message: `Route ${req.method} ${req.url} tidak ditemukan.` },
  });
}
