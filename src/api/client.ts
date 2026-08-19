import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  /** Error envelope message is a string or string[] — always normalized to array. */
  messages: string[];

  constructor(status: number, body: ApiErrorBody | undefined, message?: string) {
    const raw = message ?? (Array.isArray(body?.message) ? body.message[0] : body?.message) ?? body?.code ?? `Request failed (${status})`;
    super(Array.isArray(raw) ? raw[0] : raw);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR');
    this.details = body?.details;
    this.messages = (Array.isArray(body?.message) ? body.message : body?.message ? [body.message] : [this.message]).filter(Boolean);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

let authToken: string | null =
  localStorage.getItem('accessToken') ??
  sessionStorage.getItem('accessToken') ??
  localStorage.getItem('vcfo.token') ??
  sessionStorage.getItem('vcfo.token');
let refreshToken: string | null = localStorage.getItem('refreshToken') ?? sessionStorage.getItem('refreshToken');
let companyId: string | null = localStorage.getItem('vcfo.company') ?? sessionStorage.getItem('vcfo.company');

/** Which storage the tokens live in (remember-me). */
function tokenStore(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

/**
 * Store access + refresh tokens. The refresh token lives in the same store
 * as the access token and is only sent to the refresh endpoint.
 */
export function setTokens(access: string | null, refresh: string | null, remember = true) {
  authToken = access;
  refreshToken = refresh;
  const store = tokenStore(remember);
  if (access) {
    store.setItem('accessToken', access);
    if (refresh) store.setItem('refreshToken', refresh);
    // migrate away from the legacy key
    localStorage.removeItem('vcfo.token');
    sessionStorage.removeItem('vcfo.token');
  } else {
    localStorage.removeItem('accessToken');
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('refreshToken');
    localStorage.removeItem('vcfo.token');
    sessionStorage.removeItem('vcfo.token');
    localStorage.removeItem('vcfo.company');
    sessionStorage.removeItem('vcfo.company');
    companyId = null;
  }
}

/** Back-compat alias used by login. */
export function setToken(token: string | null, remember = true, refresh?: string | null) {
  setTokens(token, refresh ?? refreshToken, remember);
}

export function getToken(): string | null {
  return authToken;
}

/**
 * Company scope for customer-app requests (contract: `x-company-id`).
 * Set from the bootstrap session tenant; pages never manage it directly.
 */
export function setCompanyId(id: string | null) {
  companyId = id;
  if (id) localStorage.setItem('vcfo.company', id);
  else localStorage.removeItem('vcfo.company');
}

export function getCompanyId(): string | null {
  return companyId;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Current UI language for Accept-Language. */
function currentLanguage(): string {
  try {
    return localStorage.getItem('vcfo.locale') ?? 'en';
  } catch {
    return 'en';
  }
}

/**
 * Response envelope (contract): success is wrapped `{ success, data, timestamp }`,
 * errors are NOT wrapped: `{ statusCode, message: string|string[], code }`.
 */
interface SuccessEnvelope {
  success?: boolean;
  data?: unknown;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Silent refresh — when the access token expires (401 "jwt expired") we try
// POST /auth/refresh once, retry the original request, and only fall back to
// re-login if the refresh itself fails. Concurrent 401s share one refresh.
// ---------------------------------------------------------------------------

let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': currentLanguage() },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as SuccessEnvelope & { data?: { accessToken?: string; refreshToken?: string } };
    const data = payload?.data ?? (payload as unknown as { accessToken?: string; refreshToken?: string });
    const access = data?.accessToken;
    if (!access) return false;
    const refresh = data?.refreshToken ?? refreshToken;
    const remember = !!localStorage.getItem('accessToken');
    setTokens(access, refresh, remember);
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const { method = 'GET', body, headers } = options;
  const h: Record<string, string> = { ...(headers ?? {}) };
  if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  h['Accept-Language'] = currentLanguage();
  // Company scope for customer-app endpoints (never for platform-scope admin routes).
  if (companyId && !path.startsWith('/admin/')) h['x-company-id'] = companyId;

  const doFetch = (): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: h,
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network error. Check your connection and try again.' });
  }

  // Access token expired → silent refresh + one retry (never for the refresh call itself).
  if (res.status === 401 && path !== '/auth/refresh') {
    const bodyText = await res.clone().text();
    const expired = bodyText.toLowerCase().includes('expired') || bodyText.toLowerCase().includes('unauthorized');
    if (expired) {
      refreshing = refreshing ?? refreshAccessToken();
      const ok = await refreshing;
      refreshing = null;
      if (ok && authToken) {
        h['Authorization'] = `Bearer ${authToken}`;
        try {
          res = await doFetch();
        } catch {
          throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network error. Check your connection and try again.' });
        }
      }
    }
  }

  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, (payload as ApiErrorBody) ?? undefined);
  }
  // Unwrap `data` once here so UI components never see the envelope.
  const envelope = payload as SuccessEnvelope | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope && envelope.success === true) {
    return envelope.data as T;
  }
  return payload as T;
}

/** Query-string builder for filter payloads. */
export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Client-side idempotency key generator (uuid v4). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
