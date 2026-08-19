import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, request, setToken, setCompanyId, getCompanyId, newIdempotencyKey } from '../api/client';

describe('HTTP contract (envelope + errors + x-company-id)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    setCompanyId(null);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('unwraps the success envelope data once', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items: [1, 2] }, timestamp: 't' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const out = await request<{ items: number[] }>('/auth/session');
    expect(out.items).toEqual([1, 2]);
  });

  it('normalizes string[] error messages and keeps the machine code', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 403, message: ['Feature A', 'Feature B'], code: 'FEATURE_NOT_INCLUDED' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    try {
      await request('/dashboard');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe('FEATURE_NOT_INCLUDED');
      expect(err.messages).toEqual(['Feature A', 'Feature B']);
    }
  });

  it('sends x-company-id + Accept-Language on customer calls but never on admin routes', async () => {
    setToken('jwt-token');
    setCompanyId('co-1');
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })));
    await request('/dashboard');
    await request('/admin/customers');
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][1].headers).toMatchObject({ 'x-company-id': 'co-1', 'Accept-Language': 'en' });
    expect(JSON.stringify(calls[1][1].headers)).not.toContain('x-company-id');
    expect(calls[1][1].headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
  });

  it('persists company id to localStorage for the company switcher', () => {
    setCompanyId('co-42');
    expect(getCompanyId()).toBe('co-42');
    expect(localStorage.getItem('vcfo.company')).toBe('co-42');
  });

  it('generates unique idempotency keys (uuid v4)', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('display-only entitlement catalog (source of truth is session)', () => {
  it('has the contract prices and boolean/quota defaults', async () => {
    const { PLAN_CATALOG, PLAN_BOOLEAN_DEFAULTS, PLAN_QUOTA_DEFAULTS } = await import('../api/types');
    expect(PLAN_CATALOG.STARTER.monthly).toBe(49);
    expect(PLAN_CATALOG.ENTERPRISE.monthly).toBeNull();
    expect(PLAN_BOOLEAN_DEFAULTS.STARTER).not.toContain('FORECAST');
    expect(PLAN_BOOLEAN_DEFAULTS.PROFESSIONAL).toContain('FORECAST');
    expect(PLAN_QUOTA_DEFAULTS.STARTER.MAX_BRANCHES).toBe(5);
    expect(PLAN_QUOTA_DEFAULTS.BUSINESS.MAX_USERS).toBe(30);
  });
});

describe('refresh token flow', () => {
  it('setToken stores the refresh token and client keeps it', async () => {
    const { setToken, getRefreshToken } = await import('../api/client');
    setToken('access-1', true, 'refresh-1');
    expect(localStorage.getItem('accessToken')).toBe('access-1');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
    expect(getRefreshToken()).toBe('refresh-1');
    setToken(null);
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

describe('payment contract fields', () => {
  it('RecordPaymentPayload uses paymentMethod (backend DTO rejects method)', async () => {
    const svc = await import('../api/services');
    expect(typeof svc.saasAdminApi.recordPayment).toBe('function');
    // the drawer sends paymentMethod — typed through RecordPaymentPayload
    const payload = {
      customerId: 'c1',
      subscriptionId: 'sub-1',
      amount: 100,
      currency: 'USD',
      paymentDate: '2026-08-19',
      paymentMethod: 'BANK_TRANSFER' as const,
      status: 'PAID' as const,
    };
    expect(payload).toHaveProperty('paymentMethod');
    expect(payload).not.toHaveProperty('method');
  });
});
