import { describe, expect, it } from 'vitest';
import { normalizePlan } from '../api/services';

/**
 * normalizePlan must map the real backend shape of GET /api/v1/admin/plans
 * (isActive, string prices, nested features[].feature relations, string
 * limitValues, _count.subscriptions) into the domain Plan shape the UI uses.
 */
const realStarter: Parameters<typeof normalizePlan>[0] = {
  id: '16888701-aa4f-4ce4-8f9f-fa5065d37dc9',
  code: 'STARTER',
  name: 'Starter',
  description: 'Core financial visibility for small businesses.',
  monthlyPrice: '49',
  annualPrice: '490',
  currency: 'USD',
  isActive: true,
  sortOrder: 10,
  features: [
    {
      id: 'x1',
      planId: 'p1',
      featureId: 'f1',
      enabled: true,
      limitValue: null,
      feature: { id: 'f1', key: 'DASHBOARD', name: 'Dashboard', description: 'Executive dashboard snapshot', type: 'BOOLEAN', isActive: true },
    },
    {
      id: 'x2',
      planId: 'p1',
      featureId: 'f2',
      enabled: false,
      limitValue: null,
      feature: { id: 'f2', key: 'FORECAST', name: 'Forecast', description: 'Deterministic forecasting', type: 'BOOLEAN', isActive: true },
    },
    {
      id: 'x3',
      planId: 'p1',
      featureId: 'f3',
      enabled: true,
      limitValue: '5',
      feature: { id: 'f3', key: 'MAX_BRANCHES', name: 'Max Branches', description: 'Maximum branches per customer', type: 'QUOTA', isActive: true },
    },
  ],
  _count: { subscriptions: 0 },
};

describe('normalizePlan — real backend shape (GET /api/v1/admin/plans)', () => {
  it('maps isActive, string prices, nested feature relations, string limits and _count', () => {
    const plan = normalizePlan(realStarter);
    expect(plan.code).toBe('STARTER');
    expect(plan.status).toBe('ACTIVE');
    expect(plan.monthlyPrice).toBe(49);
    expect(plan.annualPrice).toBe(490);
    expect(plan.customersCount).toBe(0);
    expect(plan.features.find((f) => f.featureKey === 'DASHBOARD')?.enabled).toBe(true);
    expect(plan.features.find((f) => f.featureKey === 'FORECAST')?.enabled).toBe(false);
    expect(plan.limits.MAX_BRANCHES).toBe(5);
  });

  it('handles ENTERPRISE custom pricing (null) and isActive:false', () => {
    const ent = normalizePlan({ ...realStarter, code: 'ENTERPRISE', monthlyPrice: null, annualPrice: null, isActive: false, _count: { subscriptions: 3 } });
    expect(ent.monthlyPrice).toBeNull();
    expect(ent.status).toBe('INACTIVE');
    expect(ent.customersCount).toBe(3);
  });

  it('survives plans with no features array (legacy/malformed payloads)', () => {
    const plan = normalizePlan({ id: 'p9', code: 'LEGACY', name: 'Legacy' });
    expect(plan.features).toEqual([]);
    expect(plan.limits).toEqual({});
    expect(plan.status).toBe('ACTIVE');
  });
});
