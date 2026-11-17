// src/api/client.js
// Base API client with error handling

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

  const response = await fetch(url, config);
  
  // Handle non-JSON responses (like CSV/PDF downloads)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(`HTTP error ${response.status}`, response.status);
    }
    return response;
  }

  const data = await response.json();

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
  getRaw: (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return fetch(`${BASE_URL}${url}`, { credentials: 'include' });
  },
};

export { ApiError };
