import { describe, expect, it } from 'vitest';
import { canAccessSection, hasPerm } from '../features/saas-admin/AdminLayout';
import { hasWorkingSubscription } from '../hooks/useSession';
import { getLockReason } from '../components/FeatureRoute';
import type { SessionPayload } from '../api/types';
import { usageLabel, expiryState, todayIso, addDaysIso } from '../lib/format';

const BASE: SessionPayload = {
  user: { id: 'u1', email: 'owner@acme.demo', firstName: 'Alice', lastName: 'Morgan', phone: null, isActive: true, isSuperAdmin: false, platformRole: null },
  customers: [],
  tenant: {
    customerId: 'c1',
    companyId: null,
    customerStatus: 'ACTIVE',
    customerRole: 'OWNER',
    subscription: { status: 'ACTIVE', plan: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY', startDate: null, expiresAt: null, gracePeriodUntil: null, agreedPrice: 299, currency: 'USD' },
    features: {},
    limits: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
};

describe('role-based SaaS Admin UI (spec §47, §48, §68)', () => {
  it('customer OWNER (platformRole null) cannot access any admin section', () => {
    for (const section of ['overview', 'customers', 'subscriptions', 'plans', 'features', 'payments', 'users', 'audit', 'platform-users'] as const) {
      expect(canAccessSection(null, section)).toBe(false);
    }
  });

  it('SUPER_ADMIN has full access', () => {
    for (const section of ['overview', 'customers', 'subscriptions', 'plans', 'features', 'payments', 'users', 'audit', 'platform-users'] as const) {
      expect(canAccessSection('SUPER_ADMIN', section)).toBe(true);
    }
  });

  it('SAAS_ADMIN: customers/subscriptions/plans/features/users/audit + payments READ-ONLY, never platform-users', () => {
    expect(canAccessSection('SAAS_ADMIN', 'customers')).toBe(true);
    expect(canAccessSection('SAAS_ADMIN', 'plans')).toBe(true);
    expect(canAccessSection('SAAS_ADMIN', 'payments')).toBe(true); // saas.payment.read
    expect(hasPerm('SAAS_ADMIN', 'saas.payment.write')).toBe(false); // no record/void
    expect(hasPerm('SAAS_ADMIN', 'saas.platform-user.write')).toBe(false);
  });

  it('BILLING_ADMIN: subscriptions & payments writable, customer read-only, no plans', () => {
    expect(canAccessSection('BILLING_ADMIN', 'subscriptions')).toBe(true);
    expect(canAccessSection('BILLING_ADMIN', 'payments')).toBe(true);
    expect(hasPerm('BILLING_ADMIN', 'saas.subscription.write')).toBe(true);
    expect(hasPerm('BILLING_ADMIN', 'saas.payment.write')).toBe(true);
    expect(hasPerm('BILLING_ADMIN', 'saas.customer.write')).toBe(false);
    expect(canAccessSection('BILLING_ADMIN', 'plans')).toBe(false);
  });

  it('SUPPORT: read-only customer/subscription/user lookup + audit read', () => {
    expect(canAccessSection('SUPPORT', 'customers')).toBe(true);
    expect(canAccessSection('SUPPORT', 'subscriptions')).toBe(true); // read
    expect(canAccessSection('SUPPORT', 'audit')).toBe(true); // audit.read
    expect(hasPerm('SUPPORT', 'saas.subscription.write')).toBe(false);
    expect(hasPerm('SUPPORT', 'saas.payment.read')).toBe(false);
  });
});

const TENANT = BASE.tenant!;

describe('subscription working state (spec §7, §75)', () => {
  it('ACTIVE and TRIAL and PAST_DUE keep the app working', () => {
    for (const status of ['ACTIVE', 'TRIAL', 'PAST_DUE'] as const) {
      expect(hasWorkingSubscription({ ...BASE, tenant: { ...TENANT, subscription: { ...TENANT.subscription, status } } })).toBe(true);
    }
  });
  it('EXPIRED / SUSPENDED / CANCELLED restrict the app', () => {
    for (const status of ['EXPIRED', 'SUSPENDED', 'CANCELLED'] as const) {
      expect(hasWorkingSubscription({ ...BASE, tenant: { ...TENANT, subscription: { ...TENANT.subscription, status } } })).toBe(false);
    }
  });
  it('suspended customer status restricts the app even with ACTIVE subscription', () => {
    expect(hasWorkingSubscription({ ...BASE, tenant: { ...TENANT, customerStatus: 'SUSPENDED' } })).toBe(false);
  });
  it('expired tenant produces the expired lock reason and blocks feature pages', () => {
    const s: SessionPayload = { ...BASE, tenant: { ...TENANT, subscription: { ...TENANT.subscription, status: 'EXPIRED' } } };
    expect(getLockReason(s, 'FORECAST').kind).toBe('expired');
    expect(getLockReason({ ...BASE, tenant: { ...TENANT, customerStatus: 'SUSPENDED' } }, 'DASHBOARD').kind).toBe('customer_suspended');
    expect(getLockReason(BASE, 'FORECAST').kind).toBe('not_included');
  });
  it('feature entitlement derives from resolved features, not plan name (spec §8)', () => {
    // BUSINESS plan but FORECAST disabled → blocked (spec §71)
    const s: SessionPayload = {
      ...BASE,
      tenant: { ...TENANT, features: { FORECAST: { enabled: false, limitValue: null } } },
    };
    expect(getLockReason(s, 'FORECAST').kind).toBe('not_included');
  });
});

describe('quota display helpers (spec §9, §26, §76)', () => {
  it('formats usage as current / limit', () => {
    expect(usageLabel(3, 3)).toBe('3 / 3');
    expect(usageLabel(2, 10)).toBe('2 / 10');
  });
  it('never renders null for unlimited limits', () => {
    expect(usageLabel(30, null)).not.toContain('null');
    expect(usageLabel(30, null)).toContain('∞');
  });
  it('derives expiry display states without mutating backend state', () => {
    const t = todayIso();
    expect(expiryState(t).kind).toBe('expires_today');
    expect(expiryState(addDaysIso(t, 5)).kind).toBe('expires_in');
    expect(expiryState(addDaysIso(t, -5)).kind).toBe('expired');
    expect(expiryState(addDaysIso(t, 90)).kind).toBe('ok');
  });
});
