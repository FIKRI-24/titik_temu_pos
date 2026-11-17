// src/api/client.js
// Base API client with network resilience & 401 session-expiration notification

const BASE_URL = '/api';

class ApiError extends Error {
  constructor(message, status, details = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function notifySessionExpired(path) {
  if (!path.startsWith('/auth/login') && !path.startsWith('/auth/logout')) {
    window.dispatchEvent(new CustomEvent('app:session-expired'));
  }
}

async function safeFetch(url, config) {
  try {
    return await fetch(url, config);
  } catch {
    throw new ApiError(
      'Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda lalu coba lagi.',
      0,
      null,
      'NETWORK_ERROR'
    );
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const { headers: customHeaders, ...restOptions } = options;

  const config = {
    credentials: 'include',
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders,
    },
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await safeFetch(url, config);

  if (response.status === 401) {
    notifySessionExpired(path);
  }

  // Handle non-JSON responses (like CSV/PDF downloads)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(`Gagal memproses permintaan (${response.status}).`, response.status);
    }
    return response;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'Respons dari server tidak dapat dibaca. Coba muat ulang.',
      response.status
    );
  }

  if (!response.ok || !data.ok) {
    throw new ApiError(
      data.error?.message || `Terjadi kesalahan (${response.status})`,
      response.status,
      data.error?.details,
      data.error?.code
    );
  }

  return data.data;
}

export const api = {
  get: (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return request(url, { method: 'GET' });
  },
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),

  // For raw response (CSV/PDF download)
  getRaw: async (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    const response = await safeFetch(`${BASE_URL}${url}`, { credentials: 'include' });
    if (response.status === 401) {
      notifySessionExpired(path);
    }
    return response;
  },
};

export { ApiError };
