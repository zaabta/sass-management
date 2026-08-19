import { describe, expect, it } from 'vitest';
import { normalizeOverview } from '../api/services';

// Exact real-backend payload from the product run.
const REAL_OVERVIEW = {
  customers: { total: 2, active: 2, suspended: 0 },
  subscriptions: { trial: 0, active: 1, pastDue: 0, expired: 0, expiringIn7Days: 0, expiringIn30Days: 0 },
  paymentsThisMonth: { count: 0, amount: '0' },
  mrr: 124.17,
  arr: 1490,
  planDistribution: [{ planId: '2ccbf59c-5d52-423c-92bf-39a31c75b2b0', planCode: 'PROFESSIONAL', count: 1 }],
};

describe('normalizeOverview — real backend shape (GET /admin/overview)', () => {
  it('maps flat expiringIn7Days/30Days, paymentsThisMonth object and no recentActivity', () => {
    const d = normalizeOverview(REAL_OVERVIEW);
    expect(d.customers).toEqual({ total: 2, active: 2, suspended: 0, cancelled: 0 });
    expect(d.subscriptions.active).toBe(1);
    expect(d.expiring.in7Days).toBe(0);
    expect(d.expiring.in30Days).toBe(0);
    expect(d.payments.thisMonth).toBe(0);
    expect(d.payments.thisYear).toBe(0);
    expect(d.mrr).toBe(124.17);
    expect(d.arr).toBe(1490);
    expect(d.planDistribution).toEqual([{ planCode: 'PROFESSIONAL', count: 1 }]);
    expect(d.growth).toEqual([]);
    expect(d.recentActivity).toEqual([]);
  });

  it('survives a completely empty payload', () => {
    const d = normalizeOverview({});
    expect(d.customers.total).toBe(0);
    expect(d.subscriptions.active).toBe(0);
    expect(d.expiring.in7Days).toBe(0);
    expect(d.planDistribution).toEqual([]);
  });
});
