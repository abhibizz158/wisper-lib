/**
 * Lightweight fetch wrapper for the wisper-lib API.
 *
 * - All requests go to /api/v1/* (proxied to localhost:3001 in dev)
 * - All responses follow { data, meta?, error? }
 * - Throws ApiClientError on non-OK responses
 */

import type { ApiErrorBody } from '@wisper-lib/shared-types';

const BASE_URL = '/api/v1';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  // Delete and multipart responses may have no body
  if (res.status === 204) {
    return undefined as T;
  }

  // File download — return the Response directly
  const contentType = res.headers.get('Content-Type') ?? '';
  if (
    contentType.includes('application/octet-stream') ||
    contentType.includes('text/markdown') ||
    contentType.includes('audio/mpeg')
  ) {
    if (!res.ok) {
      throw new ApiClientError('DOWNLOAD_ERROR', 'File download failed', res.status);
    }
    return res as unknown as T;
  }

  const json = await res.json();

  if (!res.ok) {
    const err = json as ApiErrorBody;
    throw new ApiClientError(
      err.error?.code ?? 'UNKNOWN_ERROR',
      err.error?.message ?? 'An unexpected error occurred',
      res.status
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: 'GET', ...init }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: 'DELETE', ...init }),

  /** Upload a file via multipart/form-data — no Content-Type header set (browser does it) */
  upload: <T>(path: string, formData: FormData, init?: RequestInit) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
      headers: {}, // let browser set Content-Type with boundary
      ...init,
    }),
};
