/**
 * API client with JWT auth for AutoClip backend.
 */

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Get the stored JWT token.
 */
export function getToken(): string | null {
  return localStorage.getItem('autoclip_token');
}

/**
 * Set the JWT token.
 */
export function setToken(token: string): void {
  localStorage.setItem('autoclip_token', token);
}

/**
 * Clear the JWT token.
 */
export function clearToken(): void {
  localStorage.removeItem('autoclip_token');
}

/**
 * Make an authenticated API request.
 */
export async function apiRequest<T = any>(
  method: string,
  path: string,
  body: any = null
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = { method, headers };

  if (body !== null) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, options);

  // Handle 401 — token expired or invalid
  if (res.status === 401) {
    clearToken();
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/web/login';
    }
    throw new ApiError('Session expired. Please login again.', 401);
  }

  if (res.status === 204) {
    return null as any;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(`Request failed with status ${res.status}`, res.status);
    }
    return null as any;
  }

  if (!res.ok) {
    const detail = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new ApiError(detail, res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string) => apiRequest<T>('GET', path),
  post: <T = any>(path: string, body: any) => apiRequest<T>('POST', path, body),
  patch: <T = any>(path: string, body: any) => apiRequest<T>('PATCH', path, body),
  delete: <T = any>(path: string) => apiRequest<T>('DELETE', path),
  upload: <T = any>(path: string, formData: FormData) => apiRequest<T>('POST', path, formData),
};
