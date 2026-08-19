import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setToken, setCompanyId } from '../api/client';
import { saasAdminApi } from '../api/services';

/**
 * The real backend uses `page` + `limit` query params and rejects `pageSize`
 * (400). Pages previously sent pageSize (+limit), which broke Customers,
 * Payments, Subscriptions and Users against the real API. This test locks the
 * service-layer mapping.
 */
function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setToken('jwt');
  setCompanyId(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('pagination contract (page + limit, never pageSize)', () => {
  it('getCustomers sends ALL filters + sort to the backend (server-side filtering)', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/customers')) {
        // Everything is server-side now: filters, sort, search, pagination.
        expect(url).not.toContain('pageSize');
        expect(url).toContain('page=2');
        expect(url).toContain('limit=25');
        expect(url).toContain('status=ACTIVE');
        expect(url).toContain('subscriptionStatus=TRIAL');
        expect(url).toContain('planCode=BUSINESS');
        expect(url).toContain('expiry=EXPIRING_30');
        expect(url).toContain('sortBy=name');
        expect(url).toContain('sortDir=asc');
        expect(url).toContain('search=acme');
        return envelope({ data: [{ id: 'c1', name: 'Acme' }], meta: { total: 1, page: 2, limit: 25, totalPages: 1 } });
      }
      return envelope({});
    });
    const res = await saasAdminApi.getCustomers({
      page: 2,
      pageSize: 25,
      search: 'acme',
      status: 'ACTIVE',
      subscriptionStatus: 'TRIAL',
      plan: 'BUSINESS',
      expiry: 'EXPIRING_30',
      sortBy: 'name',
      sortDir: 'asc',
    });
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(25); // limit mapped back to pageSize for the UI
  });

  it('omits ALL-valued filters (backend defaults apply)', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toContain('status');
      expect(url).not.toContain('subscriptionStatus');
      expect(url).not.toContain('plan=');
      expect(url).not.toContain('expiry');
      expect(url).not.toContain('sortBy');
      return envelope({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } });
    });
    await saasAdminApi.getCustomers({ page: 1, pageSize: 10, status: 'ALL', subscriptionStatus: 'ALL', plan: 'ALL', expiry: 'ALL' });
  });

  it('getPayments / getSubscriptions / getAudit map pageSize -> limit and normalize', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toContain('pageSize');
      if (url.includes('/admin/payments')) return envelope({ items: [{ id: 'p1' }], total: 1, page: 1, limit: 10 });
      if (url.includes('/admin/subscriptions')) return envelope({ items: [{ id: 's1' }], total: 1, page: 1, limit: 10 });
      if (url.includes('/admin/audit')) return envelope({ items: [{ id: 'a1' }], total: 1, page: 1, limit: 20 });
      return envelope({});
    });
    const [pay, sub, audit] = await Promise.all([
      saasAdminApi.getPayments({ page: 1, pageSize: 10 }),
      saasAdminApi.getSubscriptions({ page: 1, pageSize: 10 }),
      saasAdminApi.getAudit({ page: 1, pageSize: 20 }),
    ]);
    expect(pay.pageSize).toBe(10);
    expect(sub.pageSize).toBe(10);
    expect(audit.pageSize).toBe(20);
  });

  it('getAllUsers tolerates array and paginated-object responses', async () => {
    fetchMock.mockResolvedValueOnce(envelope([{ id: 'u1', firstName: 'A' }]));
    fetchMock.mockResolvedValueOnce(envelope({ items: [{ id: 'u2', firstName: 'B' }], total: 1, page: 1, limit: 10 }));
    fetchMock.mockResolvedValueOnce(envelope({ users: [{ id: 'u3', firstName: 'C' }] }));
    const a = await saasAdminApi.getAllUsers({});
    const b = await saasAdminApi.getAllUsers({});
    const c = await saasAdminApi.getAllUsers({});
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(c).toHaveLength(1);
    expect(a[0].id).toBe('u1');
    expect(b[0].id).toBe('u2');
    expect(c[0].id).toBe('u3');
  });
});
