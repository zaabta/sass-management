import { describe, expect, it } from 'vitest';
import { normalizeCustomer } from '../api/services';

describe('normalizeCustomer — real backend list shape (stats may be absent)', () => {
  it('maps a customer without stats to zero counts (no crash)', () => {
    const c = normalizeCustomer({
      id: 'c1',
      code: 'CUS-1',
      name: 'Acme',
      email: 'a@b.c',
      status: 'ACTIVE',
      planCode: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
      expiryDate: '2027-08-17',
      agreedPrice: '299',
      currency: 'USD',
    });
    expect(c.stats.companies).toBe(0);
    expect(c.stats.branches).toBe(0);
    expect(c.stats.users).toBe(0);
    expect(c.agreedPrice).toBe(299);
  });

  it('maps counts from _count and *Count variants', () => {
    const c = normalizeCustomer({
      id: 'c2',
      code: 'CUS-2',
      name: 'Beta',
      email: 'b@c.d',
      _count: { companies: 2, branches: 7, users: 4 },
    });
    expect(c.stats).toEqual({ companies: 2, branches: 7, users: 4 });

    const c2 = normalizeCustomer({ id: 'c3', code: 'CUS-3', name: 'Gamma', companiesCount: '3', branchesCount: '12', usersCount: 6 });
    expect(c2.stats).toEqual({ companies: 3, branches: 12, users: 6 });
  });

  it('maps plan from nested relation and keeps status/subscription fields', () => {
    const c = normalizeCustomer({
      id: 'c4',
      code: 'CUS-4',
      name: 'Delta',
      email: 'd@e.f',
      status: 'SUSPENDED',
      plan: { code: 'STARTER', name: 'Starter' },
      subscriptionStatus: 'SUSPENDED',
      subscriptionStart: '2026-01-01',
      lastPaymentAt: '2026-08-01',
      lockVersion: 3,
    });
    expect(c.planCode).toBe('STARTER');
    expect(c.status).toBe('SUSPENDED');
    expect(c.subscriptionStatus).toBe('SUSPENDED');
    expect(c.lockVersion).toBe(3);
  });
});

describe('real list payload: { data: { data: [...], meta } } with flat fields', () => {
  it('normalizes the exact production payload', async () => {
    const { normalizeCustomer } = await import('../api/services');
    const payload = {
      data: [
        {
          id: '7248a293-b9f6-433a-986f-b73b63d27826',
          code: 'ALI-B51163',
          name: 'ali',
          status: 'ACTIVE',
          plan: 'BUSINESS',
          companies: 1,
          users: 1,
          branches: 1,
          startDate: '2026-08-19T00:00:00.000Z',
          expiryDate: '2027-08-19T00:00:00.000Z',
          agreedPrice: '399',
          currency: 'USD',
          lastPayment: null,
        },
      ],
      meta: { total: 3, page: 1, limit: 10, totalPages: 1 },
    };
    const c = normalizeCustomer(payload.data[0] as never);
    expect(c.planCode).toBe('BUSINESS');
    expect(c.stats).toEqual({ companies: 1, branches: 1, users: 1 });
    expect(c.subscriptionStart).toBe('2026-08-19T00:00:00.000Z');
    expect(c.agreedPrice).toBe(399);
    expect(c.lastPaymentAt).toBeNull();
  });

  it('maps lastPayment object.paymentDate without crashing', () => {
    const c = normalizeCustomer({
      id: 'c5',
      code: 'CUS-5',
      name: 'Echo',
      plan: 'BUSINESS',
      companies: 1,
      users: 1,
      branches: 1,
      lastPayment: { paymentDate: '2026-08-20T00:00:00.000Z', amount: '150', currency: 'USD', status: 'PAID' },
    });
    expect(c.lastPaymentAt).toBe('2026-08-20T00:00:00.000Z');
    expect(c.planCode).toBe('BUSINESS');
  });
});
