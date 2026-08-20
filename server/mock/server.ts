/**
 * DEV-ONLY mock API server — implements the documented VCFO backend
 * contracts in-memory, mounted as Vite middleware. See data.ts header.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addDays,
  audit,
  CUSTOMER_ROLES,
  db,
  features,
  nextId,
  nowIso,
  plans,
  refreshStats,
  seed,
  today,
} from './data';
import type {
  AuditEntityType,
  CreateCustomerPayload,
  CreateCustomerUserPayload,
  CreatePlanPayload,
  CreatePlatformUserPayload,
  CustomerFilters,
  CustomerUser,
  FeatureOverridePayload,
  MembershipStatus,
  PaymentStatus,
  Plan,
  PlatformRole,
  RecordPaymentPayload,
  ResolvedFeatureRow,
  Subscription,
  SubscriptionEvent,
  SubscriptionEventType,
  SubscriptionStatus,
  UpdateCustomerPayload,
} from '../../src/api/types';
import type { DbCustomer } from './data';
import enCatalog from '../../src/i18n/locales/en';
import arCatalog from '../../src/i18n/locales/ar';

seed();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  // Success envelope (contract): { success, data, timestamp }
  res.end(JSON.stringify({ success: true, data: body, timestamp: new Date().toISOString() }));
}

function error(res: ServerResponse, status: number, code: string, message?: string | string[], details?: Record<string, unknown>) {
  // Error envelope is NOT wrapped (contract): { statusCode, message: string|string[], code }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ statusCode: status, message: message ?? code, code, details }));
}

const VALIDATION: [number, string] = [422, 'VALIDATION_ERROR'];
const NOT_FOUND: [number, string] = [404, 'NOT_FOUND'];
const CONFLICT: [number, string] = [409, 'CONFLICT'];

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => {
      data += c.toString();
      if (data.length > 5_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

type SessionUser = { kind: 'platform'; u: (typeof db.platformUsers)[number] } | { kind: 'customer'; user: CustomerUser; customer: DbCustomer };

function authenticate(req: IncomingMessage): SessionUser | null {
  const h = req.headers.authorization;
  if (!h) return null; // callers respond with the clear "Missing Authorization header" 401
  if (!h.startsWith('Bearer ')) return null;
  const bare = h.slice('Bearer '.length);
  if (!bare.startsWith('mock.')) return null;
  const id = h.slice('Bearer mock.'.length);
  const pu = db.platformUsers.find((x) => x.id === id);
  if (pu) {
    if (!pu.isActive) return null;
    return { kind: 'platform', u: pu };
  }
  for (const c of db.customers) {
    const u = c.users.find((x) => x.id === id);
    if (u) return { kind: 'customer', user: u, customer: c };
  }
  return null;
}

function requirePlatform(res: ServerResponse, req: IncomingMessage): SessionUser | null {
  const s = authenticate(req);
  if (!s || s.kind !== 'platform') {
    error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    return null;
  }
  return s;
}

/**
 * saas.* permission matrix (contract):
 * SUPER_ADMIN   — all saas.*
 * SAAS_ADMIN    — customers, subscriptions, plans, features, users, audit.read, payment.read only
 * BILLING_ADMIN — customer.read, subscription read/update, payments (record/void)
 * SUPPORT       — customer.read, subscription.read, user.read, audit.read
 */
const SAAS_PERMS = [
  'saas.overview.read',
  'saas.customer.read',
  'saas.customer.write',
  'saas.subscription.read',
  'saas.subscription.write',
  'saas.plan.read',
  'saas.plan.write',
  'saas.feature.read',
  'saas.feature.write',
  'saas.payment.read',
  'saas.payment.write',
  'saas.user.read',
  'saas.user.write',
  'saas.audit.read',
  'saas.platform-user.write',
] as const;

type Resource = (typeof SAAS_PERMS)[number];

const ROLE_PERMS: Record<PlatformRole, Resource[]> = {
  SUPER_ADMIN: [...SAAS_PERMS],
  SAAS_ADMIN: [
    'saas.overview.read',
    'saas.customer.read',
    'saas.customer.write',
    'saas.subscription.read',
    'saas.subscription.write',
    'saas.plan.read',
    'saas.plan.write',
    'saas.feature.read',
    'saas.feature.write',
    'saas.payment.read',
    'saas.user.read',
    'saas.user.write',
    'saas.audit.read',
  ],
  BILLING_ADMIN: ['saas.overview.read', 'saas.customer.read', 'saas.subscription.read', 'saas.subscription.write', 'saas.payment.read', 'saas.payment.write', 'saas.audit.read'],
  SUPPORT: ['saas.overview.read', 'saas.customer.read', 'saas.subscription.read', 'saas.user.read', 'saas.audit.read'],
};

function hasPerm(role: PlatformRole, resource: Resource): boolean {
  return ROLE_PERMS[role].includes(resource);
}

/**
 * Auth + permission check combined. Returns the narrowed platform session
 * (type guard) or null after writing the proper 401/403 response.
 */
function requirePlatformUser(res: ServerResponse, req: IncomingMessage, resource: Resource): { u: (typeof db.platformUsers)[number] } | null {
  const s = requirePlatform(res, req);
  if (!s) return null;
  if (s.kind !== 'platform') {
    error(res, 403, 'FORBIDDEN', 'Platform role required.');
    return null;
  }
  if (!hasPerm(s.u.platformRole, resource)) {
    error(res, 403, 'FORBIDDEN', `Role ${s.u.platformRole} cannot perform this operation.`);
    return null;
  }
  return s;
}

function findCustomer(id: string): DbCustomer | undefined {
  return db.customers.find((c) => c.id === id || c.code.toLowerCase() === id.toLowerCase());
}

function activeSubscription(c: DbCustomer): Subscription | undefined {
  return c.subscriptions[0];
}

function resolveFeatures(c: DbCustomer) {
  const plan = c.planId ? plans.find((p) => p.id === c.planId) : null;
  const out: Record<string, { enabled: boolean; limitValue: number | null }> = {};
  for (const f of features) {
    if (f.type === 'QUOTA') {
      const limit = plan?.limits[f.key] ?? null;
      out[f.key] = { enabled: limit !== null, limitValue: limit };
      continue;
    }
    const planEnabled = plan?.features.some((pf) => pf.featureKey === f.key && pf.enabled) ?? false;
    const override = c.overrides.find((o) => o.featureKey === f.key);
    const enabled = override ? override.enabled : planEnabled;
    out[f.key] = { enabled, limitValue: null };
  }
  return out;
}

function tenantForCustomer(c: DbCustomer) {
  const sub = activeSubscription(c);
  const plan = c.planId ? plans.find((p) => p.id === c.planId) : null;
  return {
    customerId: c.id,
    companyId: c.companies.find((x) => x.status === 'ACTIVE')?.id ?? null,
    customerStatus: c.status,
    subscription: {
      status: sub?.status ?? 'EXPIRED',
      plan: plan?.code ?? null,
      planName: plan?.name ?? null,
      billingCycle: sub?.billingCycle ?? 'MONTHLY',
      startDate: sub?.startDate ?? null,
      expiresAt: sub?.expiresAt ?? null,
      gracePeriodUntil: sub?.gracePeriodUntil ?? null,
      agreedPrice: sub?.agreedPrice ?? null,
      currency: sub?.currency ?? c.defaultCurrency,
    },
    features: resolveFeatures(c),
    limits: {
      MAX_COMPANIES: plan?.limits.MAX_COMPANIES ?? null,
      MAX_BRANCHES: plan?.limits.MAX_BRANCHES ?? null,
      MAX_USERS: plan?.limits.MAX_USERS ?? null,
      MAX_UPLOADS_PER_MONTH: plan?.limits.MAX_UPLOADS_PER_MONTH ?? null,
      MAX_STORAGE_GB: plan?.limits.MAX_STORAGE_GB ?? null,
      MAX_AI_REQUESTS_PER_MONTH: plan?.limits.MAX_AI_REQUESTS_PER_MONTH ?? null,
    },
    usage: {
      MAX_COMPANIES: c.companies.filter((x) => x.status === 'ACTIVE').length,
      MAX_BRANCHES: c.companies.filter((x) => x.status === 'ACTIVE').reduce((s, x) => s + x.branches, 0),
      MAX_USERS: c.users.filter((u) => u.isActive && u.membershipStatus !== 'DISABLED').length,
      MAX_UPLOADS_PER_MONTH: uploadCount(c.id),
      MAX_STORAGE_GB: 0,
      MAX_AI_REQUESTS_PER_MONTH: 0,
    },
  };
}

function usageFor(c: DbCustomer) {
  const plan = c.planId ? plans.find((p) => p.id === c.planId) : null;
  const activeCompanies = c.companies.filter((x) => x.status === 'ACTIVE');
  const users = c.users.filter((u) => u.isActive && u.membershipStatus !== 'DISABLED');
  return {
    items: [
      { key: 'MAX_COMPANIES', label: 'Companies', current: activeCompanies.length, limit: plan?.limits.MAX_COMPANIES ?? null },
      { key: 'MAX_BRANCHES', label: 'Branches', current: activeCompanies.reduce((s, x) => s + x.branches, 0), limit: plan?.limits.MAX_BRANCHES ?? null },
      { key: 'MAX_USERS', label: 'Users', current: users.length, limit: plan?.limits.MAX_USERS ?? null },
      { key: 'MAX_UPLOADS_PER_MONTH', label: 'Monthly Uploads', current: uploadCount(c.id), limit: plan?.limits.MAX_UPLOADS_PER_MONTH ?? null },
    ],
  };
}

// upload quota counters (dev-only in-memory)
const uploadCounters = new Map<string, { month: string; count: number }>();
function uploadCount(customerId: string): number {
  const k = `${customerId}:${today().slice(0, 7)}`;
  return uploadCounters.get(k)?.count ?? 0;
}
function bumpUploads(customerId: string) {
  const k = `${customerId}:${today().slice(0, 7)}`;
  uploadCounters.set(k, { month: today().slice(0, 7), count: uploadCount(customerId) + 1 });
}

function addEvent(
  c: DbCustomer,
  sub: Subscription,
  eventType: SubscriptionEventType,
  previousValue: string | null,
  newValue: string | null,
  notes: string | null,
  performedBy: string,
) {
  const ev: SubscriptionEvent = {
    id: nextId('ev'),
    subscriptionId: sub.id,
    customerId: c.id,
    eventType,
    previousValue,
    newValue,
    performedBy,
    date: nowIso(),
    notes,
  };
  c.events.unshift(ev);
  return ev;
}

function addAudit(
  actor: string,
  role: PlatformRole | null,
  c: DbCustomer,
  action: string,
  entityType: AuditEntityType,
  entityId: string,
  entityLabel: string,
  summary: string | null,
) {
  audit(actor, role, c.id, c.name, action, entityType, entityId, entityLabel, summary);
}

function logAction(action: string, entityType: AuditEntityType, entityId: string, entityLabel: string, summary: string | null) {
  audit('system', null, null, null, action, entityType, entityId, entityLabel, summary);
}

// ---------------------------------------------------------------------------
// idempotency (contract: same key + same payload = replay; same key + different payload = 409)
// ---------------------------------------------------------------------------

const idempotencyStore = new Map<string, { payloadHash: string; response: unknown }>();

function sha1(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function idempotencyKeyOf(req: IncomingMessage): string | null {
  const k = req.headers['x-idempotency-key']?.toString();
  return k && k.trim() ? k.trim() : null;
}

/**
 * Returns true if handled as a replay (already processed). On conflict writes
 * the 409 and returns false.
 */
function replayOrContinue(req: IncomingMessage, res: ServerResponse, payload: unknown): boolean {
  const key = idempotencyKeyOf(req) ?? (payload && typeof payload === 'object' ? ((payload as { idempotencyKey?: string }).idempotencyKey ?? null) : null);
  if (!key) return true;
  const hash = sha1(JSON.stringify(payload ?? {}));
  const existing = idempotencyStore.get(key);
  if (existing) {
    if (existing.payloadHash === hash) {
      // Replay — return the stored response without re-executing.
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: existing.response, timestamp: new Date().toISOString() }));
      return false;
    }
    error(res, 409, 'IDEMPOTENCY_CONFLICT', 'Same idempotency key used with a different payload.');
    return false;
  }
  idempotencyStore.set(key, { payloadHash: hash, response: null });
  return true;
}

function storeIdempotentResponse(req: IncomingMessage, response: unknown, bodyKey?: string) {
  const key = idempotencyKeyOf(req) ?? bodyKey ?? null;
  if (!key) return;
  const entry = idempotencyStore.get(key);
  if (entry) entry.response = response;
}

// ---------------------------------------------------------------------------
// route matching
// ---------------------------------------------------------------------------

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => Promise<void> | void;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler; keys: string[] }> = [];

function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const rx = new RegExp(
    '^' +
      pattern.replace(/:[a-zA-Z]+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, pattern: rx, handler, keys });
}

// ---------------------------------------------------------------------------
// AUTH / SESSION
// ---------------------------------------------------------------------------

function platformLoginUser(u: (typeof db.platformUsers)[number]) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: null,
    isActive: true,
    isSuperAdmin: u.platformRole === 'SUPER_ADMIN',
    platformRole: u.platformRole,
  };
}

route('POST', '/api/v1/auth/login', async (req, res) => {
  const body = await readBody(req);
  const { email, password } = body ?? {};
  if (!email || !password) return error(res, ...VALIDATION, 'Email and password are required.');

  const emailNorm = String(email).trim().toLowerCase();
  const pu = db.platformUsers.find((u) => u.email.toLowerCase() === emailNorm);
  if (pu) {
    if (password !== 'admin123') return error(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    if (!pu.isActive) return error(res, 403, 'ACCOUNT_DISABLED', 'This platform account is disabled.');
    json(res, 200, { accessToken: `mock.${pu.id}`, refreshToken: `mock.refresh.${pu.id}`, user: platformLoginUser(pu) });
    return;
  }

  // This frontend is the Super Admin console. Mock sign-in never opens the
  // customer app (companies / branches / financial modules).
  if (emailNorm.includes('@') && String(password).length >= 8) {
    const admin = db.platformUsers.find((u) => u.platformRole === 'SUPER_ADMIN' && u.isActive);
    if (admin) {
      json(res, 200, {
        accessToken: `mock.${admin.id}`,
        refreshToken: `mock.refresh.${admin.id}`,
        user: platformLoginUser(admin),
      });
      return;
    }
  }
  error(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
});

route('GET', '/api/v1/auth/session', async (req, res) => {
  if (!req.headers.authorization) {
    return error(res, 401, 'UNAUTHORIZED', 'Missing Authorization header. After login send: Authorization: Bearer <accessToken>');
  }
  const s = authenticate(req);
  if (!s) return error(res, 401, 'UNAUTHORIZED', 'Invalid or expired token. Please log in again.');
  if (s.kind === 'platform') {
    json(res, 200, {
      user: { id: s.u.id, email: s.u.email, firstName: s.u.firstName, lastName: s.u.lastName, phone: null, isActive: s.u.isActive, isSuperAdmin: s.u.platformRole === 'SUPER_ADMIN', platformRole: s.u.platformRole },
      customers: [],
      tenant: null,
    });
    return;
  }
  const c = s.customer;
  // x-company-id selects which company the tenant is scoped to (contract).
  const requestedCompany = req.headers['x-company-id']?.toString() ?? null;
  const company =
    (requestedCompany && c.companies.find((co) => co.id === requestedCompany)) ||
    c.companies.find((x) => x.status === 'ACTIVE') ||
    null;
  const tenant = tenantForCustomer(c);
  json(res, 200, {
    user: {
      id: s.user.id,
      email: s.user.email,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      phone: s.user.phone,
      isActive: s.user.isActive && s.user.membershipStatus !== 'DISABLED',
      isSuperAdmin: false,
      platformRole: null,
    },
    customers: db.customers.map((x) => ({
      id: x.id,
      name: x.name,
      status: x.status,
      role: x.users.find((u) => u.customerRole === 'OWNER')?.customerRole ?? 'OWNER',
      membershipStatus: x.users.find((u) => u.id === s.user.id)?.membershipStatus ?? 'ACTIVE',
      plan: x.planCode,
      subscriptionStatus: x.subscriptionStatus,
      expiresAt: x.expiryDate,
    })),
    tenant: {
      ...tenant,
      companyId: company?.id ?? null,
      customerRole: s.user.customerRole,
    },
  });
});

// ---------------------------------------------------------------------------
// CUSTOMER APP endpoints (gated — the mock plays the backend security role)
// ---------------------------------------------------------------------------

function gateCustomerApp(res: ServerResponse, c: DbCustomer, featureKey?: string): boolean {
  if (c.status === 'SUSPENDED') {
    error(res, 403, 'SUBSCRIPTION_SUSPENDED', 'Customer account is suspended.');
    return false;
  }
  if (c.status === 'CANCELLED') {
    error(res, 403, 'SUBSCRIPTION_CANCELLED', 'Customer account is cancelled.');
    return false;
  }
  const sub = activeSubscription(c);
  if (!sub || sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
    error(res, 403, 'SUBSCRIPTION_EXPIRED', 'Subscription has expired.');
    return false;
  }
  if (featureKey) {
    const f = resolveFeatures(c)[featureKey];
    if (!f?.enabled) {
      error(res, 403, 'FEATURE_NOT_INCLUDED', `Feature ${featureKey} is not included in this subscription.`);
      return false;
    }
  }
  return true;
}

route('GET', '/api/v1/account/me', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  const u = s.user;
  json(res, 200, {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    customerRole: u.customerRole,
    membershipStatus: u.membershipStatus,
    isActive: u.isActive,
    companyIds: u.companyIds,
    customerId: s.customer.id,
    customerName: s.customer.name,
  });
});

route('GET', '/api/v1/dashboard/summary', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  if (!gateCustomerApp(res, s.customer, 'DASHBOARD')) return;
  json(res, 200, {
    revenue: { current: 1284500, previous: 1198200, currency: s.customer.defaultCurrency },
    expenses: { current: 872300, previous: 901100, currency: s.customer.defaultCurrency },
    profit: { current: 412200, previous: 297100, currency: s.customer.defaultCurrency },
    cash: { current: 634000, previous: 589000, currency: s.customer.defaultCurrency },
    series: [520, 610, 580, 690, 720, 810, 780, 860, 920, 890, 1010, 1080],
  });
});

route('POST', '/api/v1/uploads', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  if (!gateCustomerApp(res, s.customer)) return;
  const limits = tenantForCustomer(s.customer).limits;
  const limit = limits.MAX_UPLOADS_PER_MONTH;
  if (limit !== null && uploadCount(s.customer.id) >= limit) {
    error(res, 409, 'FEATURE_LIMIT_REACHED', 'Monthly upload limit reached.');
    return;
  }
  bumpUploads(s.customer.id);
  audit('system', null, s.customer.id, s.customer.name, 'UPLOAD_RECORDED', 'CUSTOMER', s.customer.id, s.customer.name, 'Document upload (mock)');
  json(res, 200, { id: nextId('up'), fileName: 'statement.xlsx', status: 'PROCESSED' });
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — overview
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/overview', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.overview.read');
  if (!s) return;
  const t = today();
  const customers = db.customers;
  const subs = customers.flatMap((c) => c.subscriptions);
  const payments = customers.flatMap((c) => c.payments);

  const expiringIn = (days: number) =>
    customers.filter((c) => {
      const sub = activeSubscription(c);
      if (!sub?.expiresAt) return false;
      const d = Math.round((new Date(sub.expiresAt).getTime() - new Date(t).getTime()) / 86400000);
      return d >= 0 && d <= days && (sub.status === 'ACTIVE' || sub.status === 'TRIAL');
    }).length;

  const monthPrefix = t.slice(0, 7);
  const pm = payments.filter((p) => p.paymentDate.slice(0, 7) === monthPrefix && p.status !== 'VOID').reduce((s, p) => s + p.amount, 0);

  let mrr = 0;
  for (const c of customers) {
    const sub = activeSubscription(c);
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIAL') || !sub.agreedPrice) continue;
    if (sub.billingCycle === 'ANNUAL') mrr += sub.agreedPrice / 12;
    else mrr += sub.agreedPrice;
  }

  const planDistribution = plans
    .map((p) => ({ planCode: p.code, count: customers.filter((c) => c.planCode === p.code && c.status !== 'CANCELLED').length }))
    .filter((x) => x.count > 0);

  const growth: { month: string; customers: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(t + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = d.toISOString().slice(0, 7);
    growth.push({ month: key, customers: customers.filter((c) => c.createdAt.slice(0, 7) <= key).length });
  }

  // Real-backend overview shape (flat expiring, paymentsThisMonth object
  // with string amount, no cancelled count, no recentActivity).
  json(res, 200, {
    customers: {
      total: customers.length,
      active: customers.filter((c) => c.status === 'ACTIVE').length,
      suspended: customers.filter((c) => c.status === 'SUSPENDED').length,
    },
    subscriptions: {
      trial: subs.filter((x) => x.status === 'TRIAL').length,
      active: subs.filter((x) => x.status === 'ACTIVE').length,
      pastDue: subs.filter((x) => x.status === 'PAST_DUE').length,
      expired: subs.filter((x) => x.status === 'EXPIRED').length,
      expiringIn7Days: expiringIn(7),
      expiringIn30Days: expiringIn(30),
    },
    paymentsThisMonth: { count: customers.flatMap((c) => c.payments).filter((p) => p.paymentDate.slice(0, 7) === monthPrefix).length, amount: String(pm) },
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    planDistribution,
    growth,
  });
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — customers
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.read');
  if (!s) return;
  const q = (req as any).query ?? {};
  const filters: CustomerFilters = q;
  let list = [...db.customers];
  const search = (filters.search ?? '').toString().toLowerCase().trim();
  if (search) {
    list = list.filter((c) =>
      [c.name, c.legalName ?? '', c.code, c.email, c.phone ?? ''].some((v) => v.toLowerCase().includes(search)),
    );
  }
  if (filters.status && filters.status !== 'ALL') list = list.filter((c) => c.status === filters.status);
  if (filters.subscriptionStatus && filters.subscriptionStatus !== 'ALL') list = list.filter((c) => c.subscriptionStatus === filters.subscriptionStatus);
  const planFilter = (filters as CustomerFilters & { planCode?: string }).planCode ?? filters.plan;
  if (planFilter && planFilter !== 'ALL') list = list.filter((c) => c.planCode === planFilter);
  if (filters.expiry && filters.expiry !== 'ALL') {
    const t = today();
    list = list.filter((c) => {
      const sub = activeSubscription(c);
      if (!sub?.expiresAt) return filters.expiry === 'EXPIRED';
      const d = Math.round((new Date(sub.expiresAt).getTime() - new Date(t).getTime()) / 86400000);
      switch (filters.expiry) {
        case 'EXPIRED':
          return sub.status === 'EXPIRED';
        case 'EXPIRING_7':
          return d >= 0 && d <= 7 && (sub.status === 'ACTIVE' || sub.status === 'TRIAL');
        case 'EXPIRING_30':
          return d >= 0 && d <= 30 && (sub.status === 'ACTIVE' || sub.status === 'TRIAL');
        case 'TRIAL':
          return sub.status === 'TRIAL';
        case 'PAST_DUE':
          return sub.status === 'PAST_DUE';
        default:
          return true;
      }
    });
  }
  const sortBy = (filters.sortBy ?? 'createdAt').toString();
  const dir = filters.sortDir === 'asc' ? 1 : -1;
  const sortable = ['name', 'code', 'status', 'planCode', 'subscriptionStatus', 'subscriptionStart', 'expiryDate', 'agreedPrice', 'createdAt'];
  if (sortable.includes(sortBy)) {
    list.sort((a, b) => {
      const av = (a as any)[sortBy] ?? '';
      const bv = (b as any)[sortBy] ?? '';
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  const page = Math.max(1, parseInt(String(filters.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String((filters as CustomerFilters & { limit?: string }).pageSize ?? (filters as CustomerFilters & { limit?: string }).limit ?? '10'), 10) || 10));
  const total = list.length;
  const items = list.slice((page - 1) * pageSize, page * pageSize).map((x) => ({ ...x, lockVersion: (x as any).lockVersion ?? 1 }));
  // Guide paginated shape: { data: [...], meta: { total, page, limit, totalPages, sortBy, sortDir } }
  json(res, 200, {
    data: items,
    meta: {
      total,
      page,
      limit: pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortable.includes(sortBy) ? sortBy : 'createdAt',
      sortDir: filters.sortDir === 'asc' ? 'asc' : 'desc',
    },
  });
});

function getCustomerQuery(req: IncomingMessage) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (q[k] = v));
  return q;
}

route('GET', '/api/v1/admin/customers/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, c);
});

route('PATCH', '/api/v1/admin/customers/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const body: UpdateCustomerPayload & { expectedVersion?: number } = await readBody(req);
  if (body.expectedVersion != null && body.expectedVersion !== ((c as any).lockVersion ?? 1))
    return error(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Customer was modified elsewhere. Reload and retry.');
  if (body.name !== undefined) c.name = body.name;
  if (body.legalName !== undefined) c.legalName = body.legalName;
  if (body.email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return error(res, ...VALIDATION, 'Valid email is required.');
    c.email = body.email;
  }
  if (body.phone !== undefined) c.phone = body.phone;
  if (body.country !== undefined) c.country = body.country;
  if (body.timezone !== undefined) c.timezone = body.timezone;
  if (body.defaultCurrency !== undefined) c.defaultCurrency = body.defaultCurrency;
  (c as any).lockVersion = ((c as any).lockVersion ?? 1) + 1;
  addAudit(s.u.email, s.u.platformRole, c, 'CUSTOMER_UPDATED', 'CUSTOMER', c.id, c.name, 'Profile updated');
  json(res, 200, c);
});

for (const [action, status, auditAction] of [
  ['activate', 'ACTIVE', 'CUSTOMER_ACTIVATED'],
  ['suspend', 'SUSPENDED', 'CUSTOMER_SUSPENDED'],
  ['reactivate', 'ACTIVE', 'CUSTOMER_REACTIVATED'],
  ['cancel', 'CANCELLED', 'CUSTOMER_CANCELLED'],
] as const) {
  route('POST', `/api/v1/admin/customers/:id/${action}`, async (req, res) => {
    const s = requirePlatformUser(res, req, 'saas.customer.write');
    if (!s) return;
    const c = findCustomer((req as any).params.id);
    if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
    const prev = c.status;
    c.status = status;
    addAudit(s.u.email, s.u.platformRole, c, auditAction, 'CUSTOMER', c.id, c.name, `${prev} → ${status}`);
    json(res, 200, c);
  });
}

// create customer — the full 8-step wizard is submitted atomically
route('POST', '/api/v1/admin/customers', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  // Flat payload per the SaaS Admin contract (idempotencyKey in the body).
  const body: CreateCustomerPayload = await readBody(req);
  if (body?.idempotencyKey && !replayOrContinue(req, res, body)) return;
  const { customer, planId, startDate, expiryDate, gracePeriodUntil, billingCycle, agreedPrice, currency, notes, featureOverrides, owner, company, activate } = body ?? {};
  if (!customer?.name) return error(res, ...VALIDATION, 'Customer name is required.');
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) return error(res, ...VALIDATION, 'Valid customer email is required.');
  if (customer.email && db.customers.some((c) => c.email?.toLowerCase() === customer.email?.toLowerCase()))
    return error(res, 409, 'DUPLICATE_EMAIL', 'A customer with this email already exists.');
  if (!planId) return error(res, ...VALIDATION, 'A plan is required.');
  const p = plans.find((x) => x.id === planId);
  if (!p) return error(res, ...NOT_FOUND, 'Plan not found.');
  if (!startDate || !expiryDate) return error(res, ...VALIDATION, 'Subscription start and expiry dates are required.');
  if (expiryDate < startDate) return error(res, ...VALIDATION, 'Expiry date must be after the start date.');
  if (gracePeriodUntil && gracePeriodUntil < expiryDate) return error(res, ...VALIDATION, 'Grace period must be after the expiry date.');
  if (agreedPrice != null && agreedPrice < 0) return error(res, ...VALIDATION, 'Agreed price cannot be negative.');
  if (!owner?.email || !owner?.password || !owner?.firstName || !owner?.lastName) return error(res, ...VALIDATION, 'Owner email, password, first name and last name are required.');
  if (owner.password.length < 8) return error(res, ...VALIDATION, 'Owner password must be at least 8 characters.');
  if (!company?.name) return error(res, ...VALIDATION, 'Company name is required.');

  const id = nextId('cust');
  const code = `CUS-${1000 + db.customers.length + 1}`;
  // activate: true → ACTIVE, false → TRIAL (contract).
  const subStatus: SubscriptionStatus = activate === false ? 'TRIAL' : 'ACTIVE';
  const c: DbCustomer = {
    id,
    code,
    name: customer.name,
    legalName: customer.legalName ?? null,
    email: customer.email ?? '',
    phone: customer.phone ?? null,
    country: customer.country ?? null,
    timezone: customer.timezone ?? null,
    defaultCurrency: customer.defaultCurrency ?? currency ?? 'USD',
    status: 'ACTIVE',
    planId: p.id,
    planCode: p.code,
    subscriptionStatus: subStatus,
    subscriptionStart: startDate,
    expiryDate: expiryDate,
    agreedPrice: agreedPrice != null ? agreedPrice : p.monthlyPrice,
    currency: currency ?? p.currency,
    lastPaymentAt: null,
    createdAt: nowIso(),
    stats: { companies: 1, branches: 0, users: 1 },
    overrides: (featureOverrides ?? []).map((o: any) => ({
      featureKey: o.featureKey,
      enabled: o.enabled,
      limitValue: o.limitValue ?? null,
      notes: o.notes ?? null,
      updatedBy: s.u.email,
      updatedAt: nowIso(),
    })),
    companies: [],
    users: [],
    subscriptions: [],
    events: [],
    payments: [],
  };
  const sub: Subscription = {
    id: nextId('sub'),
    customerId: id,
    customerName: c.name,
    planId: p.id,
    planCode: p.code,
    planName: p.name,
    status: subStatus,
    billingCycle: billingCycle ?? 'MONTHLY',
    startDate: startDate,
    expiresAt: expiryDate,
    gracePeriodUntil: gracePeriodUntil ?? null,
    agreedPrice: agreedPrice != null ? agreedPrice : p.monthlyPrice,
    currency: currency ?? p.currency,
    createdAt: nowIso(),
    lockVersion: 1,
  } as Subscription & { lockVersion: number };
  const co: DbCustomer['companies'][number] = {
    id: nextId('co'),
    customerId: id,
    name: company.name,
    legalName: company.legalName ?? null,
    baseCurrency: company.baseCurrency ?? c.defaultCurrency,
    status: 'ACTIVE',
    branches: 0,
    users: 1,
    createdAt: nowIso(),
  };
  const ownerUser: CustomerUser = {
    id: nextId('u'),
    customerId: id,
    firstName: owner.firstName,
    lastName: owner.lastName ?? '',
    email: owner.email,
    phone: owner.phone ?? null,
    customerRole: 'OWNER',
    membershipStatus: 'ACTIVE' as MembershipStatus,
    isActive: true,
    companyIds: [co.id],
    lastLoginAt: null,
    createdAt: nowIso(),
  };

  c.companies.push(co);
  c.users.push(ownerUser);
  c.subscriptions.push(sub);
  addEvent(c, sub, 'CREATED', null, `${p.code} (${sub.billingCycle})`, 'Subscription created via onboarding wizard.', s.u.email);
  addEvent(c, sub, 'ACTIVATED', null, subStatus, subStatus === 'TRIAL' ? 'Trial started.' : 'Customer activated.', s.u.email);
  refreshStats(c);
  db.customers.push(c);

  addAudit(s.u.email, s.u.platformRole, c, 'CUSTOMER_CREATED', 'CUSTOMER', c.id, c.name, `Plan ${p.code}, ${c.currency} ${c.agreedPrice}${notes ? ' · ' + notes : ''}`);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION', sub.id, p.code, `${subStatus} · ${startDate} → ${expiryDate}`);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION', sub.id, p.code, null);
  if (c.overrides.length) {
    addAudit(s.u.email, s.u.platformRole, c, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', c.overrides[0].featureKey, c.overrides[0].featureKey, `${c.overrides.length} override(s) applied`);
  }
  addAudit(s.u.email, s.u.platformRole, c, 'USER_CREATED', 'USER', ownerUser.id, ownerUser.email, 'Customer owner created');
  addAudit(s.u.email, s.u.platformRole, c, 'COMPANY_CREATED', 'COMPANY', co.id, co.name, null);

  storeIdempotentResponse(req, c, body?.idempotencyKey);
  json(res, 201, c);
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — companies
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/companies', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, c.companies);
});

route('POST', '/api/v1/admin/customers/:id/companies', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const body = await readBody(req);
  if (!body?.name) return error(res, ...VALIDATION, 'Company name is required.');
  const limits = tenantForCustomer(c).limits;
  const active = c.companies.filter((x) => x.status === 'ACTIVE').length;
  if (limits.MAX_COMPANIES !== null && active >= limits.MAX_COMPANIES) {
    return error(res, 409, 'FEATURE_LIMIT_REACHED', `Company limit reached (${limits.MAX_COMPANIES}).`);
  }
  const co = {
    id: nextId('co'),
    customerId: c.id,
    name: body.name,
    legalName: body.legalName ?? null,
    baseCurrency: body.baseCurrency ?? c.defaultCurrency,
    status: 'ACTIVE' as const,
    branches: 0,
    users: 0,
    createdAt: nowIso(),
  };
  c.companies.push(co);
  refreshStats(c);
  addAudit(s.u.email, s.u.platformRole, c, 'COMPANY_CREATED', 'COMPANY', co.id, co.name, null);
  json(res, 201, co);
});

route('PATCH', '/api/v1/admin/companies/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  const body = await readBody(req);
  for (const c of db.customers) {
    const co = c.companies.find((x) => x.id === (req as any).params.id);
    if (co) {
      if (body?.status) co.status = body.status;
      refreshStats(c);
      addAudit(s.u.email, s.u.platformRole, c, 'COMPANY_UPDATED', 'COMPANY', co.id, co.name, `Status ${co.status}`);
      return json(res, 200, co);
    }
  }
  error(res, ...NOT_FOUND, 'Company not found.');
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — customer users
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/users', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.user.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, c.users);
});

route('POST', '/api/v1/admin/customers/:id/users', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.user.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const body: CreateCustomerUserPayload = await readBody(req);
  if (!body?.email || !body?.firstName) return error(res, ...VALIDATION, 'Email and first name are required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return error(res, ...VALIDATION, 'Valid email is required.');
  if (db.customers.some((x) => x.users.some((u) => u.email.toLowerCase() === body.email?.toLowerCase())))
    return error(res, 409, 'DUPLICATE_EMAIL', 'A user with this email already exists.');
  const roleName = body.customerRoleName ?? 'VIEWER';
  if (!CUSTOMER_ROLES.includes(roleName)) return error(res, ...VALIDATION, 'Unknown customer role.');
  const limits = tenantForCustomer(c).limits;
  const activeUsers = c.users.filter((u) => u.isActive && u.membershipStatus !== 'DISABLED').length;
  if (limits.MAX_USERS !== null && activeUsers >= limits.MAX_USERS) {
    return error(res, 403, 'FEATURE_LIMIT_REACHED', `User limit reached (${limits.MAX_USERS}).`, { feature: 'MAX_USERS', limit: limits.MAX_USERS, usage: activeUsers });
  }
  const u: CustomerUser = {
    id: nextId('u'),
    customerId: c.id,
    firstName: body.firstName ?? '',
    lastName: body.lastName ?? '',
    email: body.email,
    phone: body.phone ?? null,
    customerRole: roleName,
    membershipStatus: body.status ?? 'ACTIVE',
    isActive: (body.status ?? 'ACTIVE') !== 'DISABLED',
    companyIds: body.companyId ? [body.companyId] : [],
    lastLoginAt: null,
    createdAt: nowIso(),
  };
  c.users.push(u);
  refreshStats(c);
  for (const co of c.companies) co.users = c.users.filter((x) => x.companyIds.includes(co.id) && x.isActive).length;
  addAudit(s.u.email, s.u.platformRole, c, 'USER_CREATED', 'USER', u.id, u.email, `Role ${u.customerRole}`);
  json(res, 201, u);
});

route('PATCH', '/api/v1/admin/users/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.user.write');
  if (!s) return;
  const body = await readBody(req);
  for (const c of db.customers) {
    const u = c.users.find((x) => x.id === (req as any).params.id);
    if (u) {
      if (body?.customerRoleName !== undefined) {
        if (!CUSTOMER_ROLES.includes(body.customerRoleName)) return error(res, ...VALIDATION, 'Unknown customer role.');
        u.customerRole = body.customerRoleName;
      }
      if (body?.companyId !== undefined) u.companyIds = [body.companyId];
      if (body?.status !== undefined) u.membershipStatus = body.status;
      if (body?.isActive !== undefined) u.isActive = body.isActive;
      if (body?.isActive === false || body?.status === 'DISABLED') {
        addAudit(s.u.email, s.u.platformRole, c, 'USER_DISABLED', 'USER', u.id, u.email, null);
      } else if (body?.isActive === true || body?.status === 'ACTIVE') {
        addAudit(s.u.email, s.u.platformRole, c, 'USER_ACTIVATED', 'USER', u.id, u.email, null);
      }
      refreshStats(c);
      for (const co of c.companies) co.users = c.users.filter((x) => x.companyIds.includes(co.id) && x.isActive).length;
      return json(res, 200, u);
    }
  }
  error(res, ...NOT_FOUND, 'User not found.');
});

// global users list (SaaS Users page)
route('GET', '/api/v1/admin/users', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.user.read');
  if (!s) return;
  const q = getCustomerQuery(req);
  let list = db.customers.flatMap((c) =>
    c.users.map((u) => ({
      ...u,
      customerName: c.name,
      customerCode: c.code,
      companies: c.companies.filter((x) => u.companyIds.includes(x.id)).map((x) => x.name),
    })),
  );
  if (q.customerId) list = list.filter((u) => u.customerId === q.customerId);
  if (q.role) list = list.filter((u) => u.customerRole === q.role);
  if (q.membershipStatus) list = list.filter((u) => u.membershipStatus === q.membershipStatus);
  if (q.active === 'true') list = list.filter((u) => u.isActive);
  if (q.active === 'false') list = list.filter((u) => !u.isActive);
  if (q.search) {
    const s2 = q.search.toLowerCase();
    list = list.filter((u) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(s2) || u.email.toLowerCase().includes(s2));
  }
  if (q.page || q.limit) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.limit ?? '10', 10) || 10));
    json(res, 200, { items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, limit: pageSize });
    return;
  }
  json(res, 200, list);
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — subscription operations
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/subscription', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, activeSubscription(c) ?? null);
});

route('GET', '/api/v1/admin/customers/:id/subscription/history', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, c.events);
});

route('POST', '/api/v1/admin/customers/:id/subscription', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  if (activeSubscription(c)) return error(res, ...CONFLICT, 'Customer already has an active subscription.');
  const body = await readBody(req);
  const p = plans.find((x) => x.id === body?.planId);
  if (!p) return error(res, ...VALIDATION, 'A valid plan is required.');
  const sub: Subscription = {
    id: nextId('sub'),
    customerId: c.id,
    customerName: c.name,
    planId: p.id,
    planCode: p.code,
    planName: p.name,
    status: 'ACTIVE',
    billingCycle: body?.billingCycle ?? 'MONTHLY',
    startDate: body?.startDate ?? today(),
    expiresAt: body?.expiresAt ?? addDays(today(), 365),
    gracePeriodUntil: body?.gracePeriodUntil ?? null,
    agreedPrice: body?.agreedPrice ?? p.monthlyPrice,
    currency: body?.currency ?? p.currency,
    createdAt: nowIso(),
    lockVersion: 1,
  } as Subscription & { lockVersion: number };
  c.subscriptions.unshift(sub);
  c.planId = p.id;
  addEvent(c, sub, 'CREATED', null, `${p.code} (${sub.billingCycle})`, 'Subscription created.', s.u.email);
  addEvent(c, sub, 'ACTIVATED', null, 'ACTIVE', 'Subscription activated.', s.u.email);
  refreshStats(c);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION', sub.id, p.code, null);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION', sub.id, p.code, null);
  json(res, 201, sub);
});

function findSub(id: string): { c: DbCustomer; sub: Subscription } | undefined {
  for (const c of db.customers) {
    const sub = c.subscriptions.find((x) => x.id === id);
    if (sub) return { c, sub };
  }
  return undefined;
}

const SUB_OPS: Array<[string, (c: DbCustomer, sub: Subscription) => SubscriptionStatus, string, SubscriptionEventType]> = [
  ['activate', () => 'ACTIVE', 'SUBSCRIPTION_ACTIVATED', 'ACTIVATED'],
  ['suspend', () => 'SUSPENDED', 'SUBSCRIPTION_SUSPENDED', 'SUSPENDED'],
  ['reactivate', () => 'ACTIVE', 'SUBSCRIPTION_REACTIVATED', 'REACTIVATED'],
  ['cancel', () => 'CANCELLED', 'SUBSCRIPTION_CANCELLED', 'CANCELLED'],
];

for (const [path, statusFn, auditAction, eventType] of SUB_OPS) {
  route('POST', `/api/v1/admin/subscriptions/:id/${path}`, async (req, res) => {
    const s = requirePlatformUser(res, req, 'saas.subscription.write');
    if (!s) return;
    const found = findSub((req as any).params.id);
    if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
    const { c, sub } = found;
    const prev = sub.status;
    sub.status = statusFn(c, sub);
    addEvent(c, sub, eventType, prev, sub.status, null, s.u.email);
    addAudit(s.u.email, s.u.platformRole, c, auditAction, 'SUBSCRIPTION', sub.id, sub.planCode, `${prev} → ${sub.status}`);
    refreshStats(c);
    json(res, 200, sub);
  });
}

route('POST', '/api/v1/admin/subscriptions/:id/renew', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c, sub } = found;
  const body = await readBody(req);
  if (!replayOrContinue(req, res, body)) return;
  if (body?.expectedVersion != null && body.expectedVersion !== (sub as any).lockVersion)
    return error(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Subscription was modified elsewhere. Reload and retry.');
  const newExpiry = body?.expiryDate ?? body?.newExpiry;
  if (!newExpiry) return error(res, ...VALIDATION, 'expiryDate is required.');
  if (newExpiry <= (sub.expiresAt ?? today())) return error(res, ...VALIDATION, 'New expiry must be after the current expiry.');
  const prevExpiry = sub.expiresAt;
  const prevPlan = sub.planCode;
  const prevPrice = sub.agreedPrice;
  sub.expiresAt = newExpiry;
  sub.gracePeriodUntil = body.gracePeriodUntil ?? null;
  sub.status = 'ACTIVE';
  if (body.planId) {
    const p = plans.find((x) => x.id === body.planId);
    if (!p) return error(res, ...NOT_FOUND, 'Plan not found.');
    sub.planId = p.id;
    sub.planCode = p.code;
    sub.planName = p.name;
    c.planId = p.id;
  }
  if (body.agreedPrice != null) {
    sub.agreedPrice = body.agreedPrice;
    if (body.currency) sub.currency = body.currency;
  }
  addEvent(c, sub, 'RENEWED', prevExpiry, sub.expiresAt, body.notes ?? null, s.u.email);
  if (sub.planCode !== prevPlan) addEvent(c, sub, 'PLAN_CHANGED', prevPlan, sub.planCode, body.notes ?? null, s.u.email);
  if (body.agreedPrice != null && sub.agreedPrice !== prevPrice)
    addEvent(c, sub, 'PRICE_CHANGED', String(prevPrice), String(sub.agreedPrice), body.notes ?? null, s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION', sub.id, sub.planCode, `Expiry ${prevExpiry} → ${sub.expiresAt}`);
  (sub as any).lockVersion = ((sub as any).lockVersion ?? 1) + 1;
  refreshStats(c);
  storeIdempotentResponse(req, sub);
  json(res, 200, sub);
});

route('POST', '/api/v1/admin/subscriptions/:id/extend', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c, sub } = found;
  const body = await readBody(req);
  if (!replayOrContinue(req, res, body)) return;
  if (body?.expectedVersion != null && body.expectedVersion !== (sub as any).lockVersion)
    return error(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Subscription was modified elsewhere. Reload and retry.');
  const extendUntil = body?.expiryDate ?? body?.extendUntil;
  if (!extendUntil) return error(res, ...VALIDATION, 'expiryDate is required.');
  if (extendUntil <= (sub.expiresAt ?? today())) return error(res, ...VALIDATION, 'Extension must be after the current expiry.');
  const prev = sub.expiresAt;
  sub.expiresAt = extendUntil;
  addEvent(c, sub, 'EXTENDED', prev, sub.expiresAt, body.notes ?? null, s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION', sub.id, sub.planCode, `Expiry ${prev} → ${sub.expiresAt}`);
  (sub as any).lockVersion = ((sub as any).lockVersion ?? 1) + 1;
  refreshStats(c);
  storeIdempotentResponse(req, sub);
  json(res, 200, sub);
});

route('POST', '/api/v1/admin/subscriptions/:id/change-plan', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c, sub } = found;
  const body = await readBody(req);
  if (body?.expectedVersion != null && body.expectedVersion !== (sub as any).lockVersion)
    return error(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Subscription was modified elsewhere. Reload and retry.');
  const p = plans.find((x) => x.id === body?.planId);
  if (!p) return error(res, ...VALIDATION, 'A valid plan is required.');
  const prev = sub.planCode;
  sub.planId = p.id;
  sub.planCode = p.code;
  sub.planName = p.name;
  c.planId = p.id;
  addEvent(c, sub, 'PLAN_CHANGED', prev, sub.planCode, body.notes ?? null, s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'PLAN_CHANGED', 'SUBSCRIPTION', sub.id, p.code, `${prev} → ${p.code}`);
  (sub as any).lockVersion = ((sub as any).lockVersion ?? 1) + 1;
  refreshStats(c);
  json(res, 200, sub);
});

route('POST', '/api/v1/admin/subscriptions/:id/change-price', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c, sub } = found;
  const body = await readBody(req);
  if (body?.expectedVersion != null && body.expectedVersion !== (sub as any).lockVersion)
    return error(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Subscription was modified elsewhere. Reload and retry.');
  if (body?.agreedPrice == null || body.agreedPrice < 0) return error(res, ...VALIDATION, 'Agreed price must be a non-negative amount.');
  const prev = sub.agreedPrice;
  sub.agreedPrice = body.agreedPrice;
  if (body.currency) sub.currency = body.currency;
  addEvent(c, sub, 'PRICE_CHANGED', String(prev), String(sub.agreedPrice), body.notes ?? null, s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'PRICE_CHANGED', 'SUBSCRIPTION', sub.id, sub.planCode, `${prev} → ${sub.agreedPrice} ${sub.currency}`);
  (sub as any).lockVersion = ((sub as any).lockVersion ?? 1) + 1;
  refreshStats(c);
  json(res, 200, sub);
});

// subscriptions global list
route('GET', '/api/v1/admin/subscriptions', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.read');
  if (!s) return;
  const q = getCustomerQuery(req);
  let list = db.customers.flatMap((c) => c.subscriptions.map((sub) => ({ ...sub, customerCode: c.code })));
  if (q.status && q.status !== 'ALL') {
    if (q.status === 'CURRENT') list = list.filter((x) => ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(x.status));
    else list = list.filter((x) => x.status === q.status);
  }
  if (q.customerId) list = list.filter((x) => x.customerId === q.customerId);
  if (q.plan) list = list.filter((x) => x.planCode === q.plan);
  if (q.search) {
    const s2 = q.search.toLowerCase();
    list = list.filter((x) => x.customerName.toLowerCase().includes(s2) || x.customerCode.toLowerCase().includes(s2));
  }
  list.sort((a, b) => String(b.expiresAt ?? '').localeCompare(String(a.expiresAt ?? '')));
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? q.limit ?? '10', 10) || 10));
  const total = list.length;
  json(res, 200, { data: list.slice((page - 1) * pageSize, page * pageSize), meta: { total, page, limit: pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — features & overrides
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/features', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const plan = c.planId ? plans.find((p) => p.id === c.planId) : null;
  const rows: ResolvedFeatureRow[] = features
    .filter((f) => f.type === 'BOOLEAN')
    .map((f) => {
      const planEnabled = plan?.features.some((pf) => pf.featureKey === f.key && pf.enabled) ?? false;
      const override = c.overrides.find((o) => o.featureKey === f.key) ?? null;
      return {
        featureKey: f.key,
        name: f.name,
        type: f.type,
        planEnabled,
        planLimitValue: null,
        override,
        effectiveEnabled: override ? override.enabled : planEnabled,
        effectiveLimitValue: null,
      };
    });
  // quota rows
  for (const f of features.filter((x) => x.type === 'QUOTA')) {
    const planLimit = plan?.limits[f.key] ?? null;
    const override = c.overrides.find((o) => o.featureKey === f.key) ?? null;
    rows.push({
      featureKey: f.key,
      name: f.name,
      type: f.type,
      planEnabled: planLimit !== null,
      planLimitValue: planLimit,
      override,
      effectiveEnabled: override ? override.enabled : planLimit !== null,
      effectiveLimitValue: override ? override.limitValue : planLimit,
    });
  }
  json(res, 200, rows);
});

route('PUT', '/api/v1/admin/customers/:id/features/:featureKey', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const key = (req as any).params.featureKey.toUpperCase();
  const def = features.find((f) => f.key === key);
  if (!def) return error(res, ...NOT_FOUND, 'Unknown feature.');
  const body: FeatureOverridePayload = await readBody(req);
  if (def.type === 'QUOTA' && body?.limitValue != null && body.limitValue < 0)
    return error(res, ...VALIDATION, 'Limit value cannot be negative.');
  const existing = c.overrides.find((o) => o.featureKey === key);
  const prev = existing ? `${existing.enabled}${existing.limitValue != null ? ` (${existing.limitValue})` : ''}` : 'Plan default';
  const next = `${body?.enabled}${body?.limitValue != null ? ` (${body.limitValue})` : ''}`;
  if (existing) {
    existing.enabled = body?.enabled ?? true;
    existing.limitValue = body?.limitValue ?? null;
    existing.notes = body?.notes ?? existing.notes;
    existing.updatedBy = s.u.email;
    existing.updatedAt = nowIso();
  } else {
    c.overrides.push({
      featureKey: key,
      enabled: body?.enabled ?? true,
      limitValue: body?.limitValue ?? null,
      notes: body?.notes ?? null,
      updatedBy: s.u.email,
      updatedAt: nowIso(),
    });
  }
  addEvent(c, activeSubscription(c)!, 'FEATURE_OVERRIDE_CHANGED', prev, next, body?.notes ?? null, s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', key, key, `${prev} → ${next}`);
  json(res, 200, c.overrides.find((o) => o.featureKey === key));
});

route('DELETE', '/api/v1/admin/customers/:id/features/:featureKey', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const key = (req as any).params.featureKey.toUpperCase();
  const idx = c.overrides.findIndex((o) => o.featureKey === key);
  if (idx === -1) return error(res, ...NOT_FOUND, 'No override for this feature.');
  const [removed] = c.overrides.splice(idx, 1);
  addEvent(c, activeSubscription(c)!, 'FEATURE_OVERRIDE_CHANGED', `${removed.enabled}`, 'Plan default', 'Override removed.', s.u.email);
  addAudit(s.u.email, s.u.platformRole, c, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', key, key, 'Override removed');
  json(res, 200, { ok: true });
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — subscription overrides (integration guide §6)
// ---------------------------------------------------------------------------

route('POST', '/api/v1/admin/subscriptions/:id/overrides', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c } = found;
  const body = await readBody(req);
  if (!body?.featureKey) return error(res, ...VALIDATION, 'featureKey is required.');
  const existing = c.overrides.find((o) => o.featureKey === body.featureKey);
  if (existing) {
    existing.enabled = body.enabled ?? true;
    existing.limitValue = body.limitValue ?? null;
    existing.notes = body.notes ?? existing.notes;
    existing.updatedBy = s.u.email;
    existing.updatedAt = nowIso();
  } else {
    c.overrides.push({
      featureKey: body.featureKey,
      enabled: body.enabled ?? true,
      limitValue: body.limitValue ?? null,
      notes: body.notes ?? null,
      updatedBy: s.u.email,
      updatedAt: nowIso(),
    });
  }
  addAudit(s.u.email, s.u.platformRole, c, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', body.featureKey, body.featureKey, `${body.enabled}`);
  json(res, 200, c.overrides.find((o) => o.featureKey === body.featureKey));
});

route('DELETE', '/api/v1/admin/subscriptions/:id/overrides/:featureKey', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const found = findSub((req as any).params.id);
  if (!found) return error(res, ...NOT_FOUND, 'Subscription not found.');
  const { c } = found;
  const key = (req as any).params.featureKey.toUpperCase();
  const idx = c.overrides.findIndex((o) => o.featureKey === key);
  if (idx === -1) return error(res, ...NOT_FOUND, 'No override for this feature.');
  c.overrides.splice(idx, 1);
  addAudit(s.u.email, s.u.platformRole, c, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', key, key, 'Override removed');
  json(res, 200, { ok: true });
});

// nested reactivate: POST /admin/customers/:id/subscription/reactivate
route('POST', '/api/v1/admin/customers/:id/subscription/reactivate', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.subscription.write');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  const sub = activeSubscription(c);
  if (!sub) return error(res, 404, 'SUBSCRIPTION_REQUIRED', 'Customer has no subscription.');
  sub.status = 'ACTIVE';
  addAudit(s.u.email, s.u.platformRole, c, 'SUBSCRIPTION_REACTIVATED', 'SUBSCRIPTION', sub.id, sub.planCode, null);
  refreshStats(c);
  json(res, 200, sub);
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — usage
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/usage', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.customer.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, usageFor(c));
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — payments
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/customers/:id/payments', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.payment.read');
  if (!s) return;
  const c = findCustomer((req as any).params.id);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  json(res, 200, c.payments);
});

route('GET', '/api/v1/admin/payments', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.payment.read');
  if (!s) return;
  const q = getCustomerQuery(req);
  let list = db.customers.flatMap((c) => c.payments);
  if (q.customerId) list = list.filter((p) => p.customerId === q.customerId);
  if (q.currency) list = list.filter((p) => p.currency === q.currency);
  if (q.method) list = list.filter((p) => p.method === q.method);
  if (q.status) list = list.filter((p) => p.status === q.status);
  if (q.from) list = list.filter((p) => p.paymentDate >= q.from);
  if (q.to) list = list.filter((p) => p.paymentDate <= q.to);
  if (q.search) {
    const s2 = q.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.customerName.toLowerCase().includes(s2) ||
        (p.referenceNumber ?? '').toLowerCase().includes(s2) ||
        (p.receiptNumber ?? '').toLowerCase().includes(s2),
    );
  }
  list.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? q.limit ?? '10', 10) || 10));
  const total = list.length;
  json(res, 200, { data: list.slice((page - 1) * pageSize, page * pageSize), meta: { total, page, limit: pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

route('POST', '/api/v1/admin/payments', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.payment.write');
  if (!s) return;
  const body: RecordPaymentPayload = await readBody(req);
  if (!replayOrContinue(req, res, body)) return;
  if (!body?.customerId) return error(res, ...VALIDATION, 'Customer is required.');
  const c = findCustomer(body.customerId);
  if (!c) return error(res, ...NOT_FOUND, 'Customer not found.');
  if (body.amount == null || body.amount <= 0) return error(res, ...VALIDATION, 'Amount must be greater than zero.');
  if (!body.paymentDate) return error(res, ...VALIDATION, 'Payment date is required.');
  if (body.periodFrom && body.periodTo && body.periodTo < body.periodFrom)
    return error(res, ...VALIDATION, 'Coverage period is invalid.');
  const sub = activeSubscription(c);
  const payment = {
    id: nextId('pay'),
    customerId: c.id,
    customerName: c.name,
    subscriptionId: body.subscriptionId ?? sub?.id ?? null,
    amount: body.amount,
    currency: body.currency ?? c.currency,
    paymentDate: body.paymentDate,
    method: (body as RecordPaymentPayload & { method?: string }).paymentMethod ?? (body as { method?: string }).method ?? 'MANUAL',
    status: (body.status ?? 'PAID') as PaymentStatus,
    referenceNumber: body.referenceNumber ?? null,
    receiptNumber: body.receiptNumber ?? null,
    periodFrom: body.periodFrom ?? null,
    periodTo: body.periodTo ?? null,
    recordedBy: s.u.email,
    notes: body.notes ?? null,
    createdAt: nowIso(),
  };
  c.payments.unshift(payment);
  c.lastPaymentAt = payment.status === 'PAID' ? payment.paymentDate : c.lastPaymentAt;
  addAudit(s.u.email, s.u.platformRole, c, 'PAYMENT_RECORDED', 'PAYMENT', payment.id, payment.referenceNumber ?? payment.id, `${payment.amount} ${payment.currency}`);
  storeIdempotentResponse(req, payment);
  json(res, 201, payment);
});

for (const [path, action, newStatus] of [
  ['void', 'PAYMENT_VOIDED', 'VOID'],
  ['refund', 'PAYMENT_REFUNDED', 'REFUNDED'],
] as const) {
  route('PATCH', `/api/v1/admin/payments/:id/${path}`, async (req, res) => {
    const s = requirePlatformUser(res, req, 'saas.payment.write');
    if (!s) return;
    for (const c of db.customers) {
      const p = c.payments.find((x) => x.id === (req as any).params.id);
      if (p) {
        if (p.status === 'VOID' || p.status === 'REFUNDED') return error(res, ...CONFLICT, `Payment already ${newStatus}.`);
        p.status = newStatus;
        addAudit(s.u.email, s.u.platformRole, c, action, 'PAYMENT', p.id, p.referenceNumber ?? p.id, `${p.amount} ${p.currency}`);
        return json(res, 200, p);
      }
    }
    error(res, ...NOT_FOUND, 'Payment not found.');
  });
}

// ---------------------------------------------------------------------------
// SAAS ADMIN — plans
// ---------------------------------------------------------------------------

/**
 * Serialize a plan exactly like the real backend does:
 *   isActive (not status), string prices, nested features[].feature relation,
 *   string limitValues, _count.subscriptions (not customersCount).
 */
function serializePlan(p: Plan) {
  const boolRows = (p.features ?? []).map((pf) => {
    const fdef = features.find((f) => f.key === pf.featureKey);
    return {
      id: `pf-${p.code}-${pf.featureKey}`,
      planId: p.id,
      featureId: fdef?.id ?? `feat-${pf.featureKey.toLowerCase()}`,
      enabled: pf.enabled,
      limitValue: pf.limitValue != null ? String(pf.limitValue) : null,
      feature: {
        id: fdef?.id ?? `feat-${pf.featureKey.toLowerCase()}`,
        key: pf.featureKey,
        name: fdef?.name ?? pf.featureKey,
        description: fdef?.description ?? '',
        type: fdef?.type ?? 'BOOLEAN',
        isActive: true,
      },
    };
  });
  const quotaRows = Object.entries(p.limits ?? {}).map(([key, v]) => {
    const fdef = features.find((f) => f.key === key);
    return {
      id: `pf-${p.code}-${key}`,
      planId: p.id,
      featureId: fdef?.id ?? `feat-${key.toLowerCase()}`,
      enabled: true,
      limitValue: v != null ? String(v) : null,
      feature: {
        id: fdef?.id ?? `feat-${key.toLowerCase()}`,
        key,
        name: fdef?.name ?? key,
        description: fdef?.description ?? `Maximum ${key.replace('MAX_', '').toLowerCase()} per customer`,
        type: 'QUOTA' as const,
        isActive: true,
      },
    };
  });
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthlyPrice != null ? String(p.monthlyPrice) : null,
    annualPrice: p.annualPrice != null ? String(p.annualPrice) : null,
    currency: p.currency,
    isActive: p.status === 'ACTIVE',
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
    features: [...boolRows, ...quotaRows],
    _count: { subscriptions: db.customers.filter((c) => c.planCode === p.code && c.status !== 'CANCELLED').length },
  };
}

route('GET', '/api/v1/admin/plans', async (req, res) => {
  const s = requirePlatform(res, req);
  if (!s) return;
  if (s.kind !== 'platform') return error(res, 403, 'FORBIDDEN', 'Platform role required.');
  if (!(hasPerm(s.u.platformRole, 'saas.plan.read') || hasPerm(s.u.platformRole, 'saas.customer.read'))) {
    return error(res, 403, 'FORBIDDEN', `Role ${s.u.platformRole} cannot perform this operation.`);
  }
  json(res, 200, plans.map(serializePlan));
});

route('POST', '/api/v1/admin/plans', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.plan.write');
  if (!s) return;
  const body: CreatePlanPayload = await readBody(req);
  if (!body?.name || !body?.code) return error(res, ...VALIDATION, 'Plan name and code are required.');
  if (plans.some((p) => p.code === body.code)) return error(res, ...CONFLICT, 'A plan with this code already exists.');
  const plan: Plan = {
    id: nextId('plan'),
    code: body.code.toUpperCase().replace(/\s+/g, '_'),
    name: body.name,
    description: body.description ?? '',
    monthlyPrice: body.monthlyPrice != null ? Number(body.monthlyPrice) : null,
    annualPrice: body.annualPrice != null ? Number(body.annualPrice) : null,
    currency: body.currency ?? 'USD',
    status: (body as any).isActive === false ? 'INACTIVE' : (body.status ?? 'ACTIVE'),
    sortOrder: body.sortOrder ?? 99,
    features: (body.features ?? []).map((f) => ({ featureKey: f.featureKey, enabled: f.enabled, limitValue: f.limitValue != null ? Number(f.limitValue) : null })),
    limits: body.limits ?? {},
    createdAt: nowIso(),
  };
  plans.push(plan);
  logAction('PLAN_CREATED', 'PLAN', plan.id, plan.code, `${plan.name} · ${plan.currency} ${plan.monthlyPrice ?? 'custom'}`);
  json(res, 201, serializePlan(plan));
});

route('PATCH', '/api/v1/admin/plans/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.plan.write');
  if (!s) return;
  const p = plans.find((x) => x.id === (req as any).params.id);
  if (!p) return error(res, ...NOT_FOUND, 'Plan not found.');
  const body = await readBody(req);
  if (body?.name !== undefined) p.name = body.name;
  if (body?.description !== undefined) p.description = body.description;
  if (body?.monthlyPrice !== undefined) p.monthlyPrice = body.monthlyPrice != null ? Number(body.monthlyPrice) : null;
  if (body?.annualPrice !== undefined) p.annualPrice = body.annualPrice != null ? Number(body.annualPrice) : null;
  if (body?.currency !== undefined) p.currency = body.currency;
  if (body?.status !== undefined) p.status = body.status;
  if ((body as any)?.isActive !== undefined) p.status = body.isActive ? 'ACTIVE' : 'INACTIVE';
  if (body?.sortOrder !== undefined) p.sortOrder = body.sortOrder;
  if (body?.features !== undefined) p.features = body.features.map((f: any) => ({ featureKey: f.featureKey, enabled: !!f.enabled, limitValue: f.limitValue != null ? Number(f.limitValue) : null }));
  if (body?.limits !== undefined) p.limits = body.limits;
  logAction('PLAN_UPDATED', 'PLAN', p.id, p.code, p.name);
  json(res, 200, serializePlan(p));
});

route('PATCH', '/api/v1/admin/plans/:id/status', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.plan.write');
  if (!s) return;
  const p = plans.find((x) => x.id === (req as any).params.id);
  if (!p) return error(res, ...NOT_FOUND, 'Plan not found.');
  const body = await readBody(req);
  p.status = body?.status === 'ACTIVE' || body?.isActive === true ? 'ACTIVE' : 'INACTIVE';
  logAction(p.status === 'ACTIVE' ? 'PLAN_ACTIVATED' : 'PLAN_DEACTIVATED', 'PLAN', p.id, p.code, p.name);
  json(res, 200, serializePlan(p));
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — feature registry
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/features', async (req, res) => {
  const s = requirePlatform(res, req);
  if (!s) return;
  if (s.kind !== 'platform') return error(res, 403, 'FORBIDDEN', 'Platform role required.');
  if (!(hasPerm(s.u.platformRole, 'saas.feature.read') || hasPerm(s.u.platformRole, 'saas.customer.read'))) {
    return error(res, 403, 'FORBIDDEN', `Role ${s.u.platformRole} cannot perform this operation.`);
  }
  json(res, 200, features.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type,
    isActive: f.status === 'ACTIVE',
    sortOrder: f.sortOrder,
  })));
});

route('PATCH', '/api/v1/admin/features/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.plan.write');
  if (!s) return;
  const f = features.find((x) => x.id === (req as any).params.id);
  if (!f) return error(res, ...NOT_FOUND, 'Feature not found.');
  const body = await readBody(req);
  if (body?.status !== undefined) f.status = body.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
  if (body?.isActive !== undefined) f.status = body.isActive ? 'ACTIVE' : 'INACTIVE';
  if (body?.name !== undefined) f.name = body.name;
  if (body?.description !== undefined) f.description = body.description;
  logAction('FEATURE_UPDATED', 'FEATURE', f.key, f.key, f.name);
  json(res, 200, { id: f.id, key: f.key, name: f.name, description: f.description, type: f.type, isActive: f.status === 'ACTIVE', sortOrder: f.sortOrder });
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — platform users
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/platform-users', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.platform-user.write');
  if (!s) return;
  json(res, 200, db.platformUsers);
});

route('POST', '/api/v1/admin/platform-users', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.platform-user.write');
  if (!s) return;
  const body: CreatePlatformUserPayload = await readBody(req);
  if (!body?.firstName || !body?.email) return error(res, ...VALIDATION, 'First name and email are required.');
  if (!['SUPER_ADMIN', 'SAAS_ADMIN', 'SUPPORT', 'BILLING_ADMIN'].includes(body.platformRole))
    return error(res, ...VALIDATION, 'Unknown platform role.');
  if (db.platformUsers.some((u) => u.email.toLowerCase() === body.email.toLowerCase()))
    return error(res, 409, 'DUPLICATE_EMAIL', 'A platform user with this email already exists.');
  const u = {
    id: nextId('pu'),
    firstName: body.firstName,
    lastName: body.lastName ?? '',
    email: body.email,
    platformRole: body.platformRole,
    isActive: true,
    lastLoginAt: null,
    createdAt: nowIso(),
  };
  db.platformUsers.push(u);
  audit(s.u.email, s.u.platformRole, null, null, 'PLATFORM_USER_CREATED', 'PLATFORM_USER', u.id, u.email, body.platformRole);
  json(res, 201, u);
});

route('PATCH', '/api/v1/admin/platform-users/:id', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.platform-user.write');
  if (!s) return;
  const u = db.platformUsers.find((x) => x.id === (req as any).params.id);
  if (!u) return error(res, ...NOT_FOUND, 'Platform user not found.');
  const body = await readBody(req);
  if (body?.firstName !== undefined) u.firstName = body.firstName;
  if (body?.lastName !== undefined) u.lastName = body.lastName;
  if (body?.platformRole !== undefined) {
    if (!['SUPER_ADMIN', 'SAAS_ADMIN', 'SUPPORT', 'BILLING_ADMIN'].includes(body.platformRole))
      return error(res, ...VALIDATION, 'Unknown platform role.');
    u.platformRole = body.platformRole;
  }
  if (body?.isActive !== undefined) {
    u.isActive = body.isActive;
    audit(s.u.email, s.u.platformRole, null, null, body.isActive ? 'PLATFORM_USER_ACTIVATED' : 'PLATFORM_USER_DISABLED', 'PLATFORM_USER', u.id, u.email, null);
  }
  json(res, 200, u);
});

// ---------------------------------------------------------------------------
// SAAS ADMIN — audit
// ---------------------------------------------------------------------------

route('GET', '/api/v1/admin/audit', async (req, res) => {
  const s = requirePlatformUser(res, req, 'saas.audit.read');
  if (!s) return;
  const q = getCustomerQuery(req);
  let list = [...db.audit];
  if (q.customerId) list = list.filter((a) => a.customerId === q.customerId);
  if (q.actor) list = list.filter((a) => a.actor.toLowerCase().includes(q.actor.toLowerCase()));
  if (q.action) list = list.filter((a) => a.action === q.action);
  if (q.entityType) list = list.filter((a) => a.entityType === q.entityType);
  if (q.from) list = list.filter((a) => a.timestamp.slice(0, 10) >= q.from);
  if (q.to) list = list.filter((a) => a.timestamp.slice(0, 10) <= q.to);
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? q.limit ?? '20', 10) || 20));
  const total = list.length;
  json(res, 200, { data: list.slice((page - 1) * pageSize, page * pageSize), meta: { total, page, limit: pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});


// ---------------------------------------------------------------------------
// CUSTOMER APP — companies / branches / users / dashboard / analytics / i18n
// ---------------------------------------------------------------------------

function customerContext(req: IncomingMessage, res: ServerResponse): { user: CustomerUser; customer: DbCustomer; company: DbCustomer['companies'][number] } | null {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') {
    error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    return null;
  }
  const c = s.customer;
  if (!gateCustomerApp(res, c)) return null;
  const companyId = req.headers['x-company-id']?.toString();
  const company = companyId ? c.companies.find((co) => co.id === companyId) : null;
  if (!company) {
    error(res, 403, 'COMPANY_ACCESS_DENIED', 'Company access denied.');
    return null;
  }
  const accessible = s.user.customerRole === 'OWNER' || s.user.companyIds.includes(company.id);
  if (!accessible) {
    error(res, 403, 'COMPANY_ACCESS_DENIED', 'Company access denied.');
    return null;
  }
  return { user: s.user, customer: c, company };
}

route('GET', '/api/v1/companies', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  const c = s.customer;
  const list = c.companies
    .filter((co) => s.user.customerRole === 'OWNER' || s.user.companyIds.includes(co.id))
    .map((co) => ({
      id: co.id,
      name: co.name,
      legalName: co.legalName,
      baseCurrency: co.baseCurrency,
      branches: co.branches,
      users: co.users,
      createdAt: co.createdAt,
    }));
  json(res, 200, list);
});

route('POST', '/api/v1/companies', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  const c = s.customer;
  if (!gateCustomerApp(res, c)) return;
  const body = await readBody(req);
  if (!body?.name) return error(res, ...VALIDATION, 'Company name is required.');
  const limits = tenantForCustomer(c).limits;
  const active = c.companies.filter((x) => x.status === 'ACTIVE').length;
  if (limits.MAX_COMPANIES !== null && active >= limits.MAX_COMPANIES) {
    return error(res, 409, 'FEATURE_LIMIT_REACHED', `You have reached MAX_COMPANIES (${active} / ${limits.MAX_COMPANIES}). Contact VCFO admin to raise the limit.`);
  }
  const co = {
    id: nextId('co'),
    customerId: c.id,
    name: body.name,
    legalName: body.legalName ?? null,
    baseCurrency: body.baseCurrency ?? c.defaultCurrency,
    status: 'ACTIVE' as const,
    branches: 0,
    users: 0,
    createdAt: nowIso(),
  };
  c.companies.push(co);
  refreshStats(c);
  addAudit(s.user.email, null, c, 'COMPANY_CREATED', 'COMPANY', co.id, co.name, null);
  json(res, 201, co);
});

route('GET', '/api/v1/branches', async (req, res) => {
  const ctx = customerContext(req, res);
  if (!ctx) return;
  const { customer, user } = ctx;
  const q = getCustomerQuery(req);
  const companies = customer.companies.filter((co) => user.customerRole === 'OWNER' || user.companyIds.includes(co.id));
  const scoped = q.companyId ? companies.filter((co) => co.id === q.companyId) : companies;
  const branches = scoped.flatMap((co) =>
    Array.from({ length: Math.max(1, co.branches) }, (_, i) => ({
      id: `${co.id}-b-${i + 1}`,
      companyId: co.id,
      companyName: co.name,
      name: i === 0 ? `${co.name} — Main` : `${co.name} — Branch ${i + 1}`,
      status: 'ACTIVE' as const,
      createdAt: co.createdAt,
    })),
  );
  json(res, 200, branches);
});

route('POST', '/api/v1/branches', async (req, res) => {
  const ctx = customerContext(req, res);
  if (!ctx) return;
  const { customer, company } = ctx;
  const body = await readBody(req);
  if (!body?.name) return error(res, ...VALIDATION, 'Branch name is required.');
  const limits = tenantForCustomer(customer).limits;
  const totalBranches = customer.companies.filter((c) => c.status === 'ACTIVE').reduce((s, c) => s + c.branches, 0);
  if (limits.MAX_BRANCHES !== null && totalBranches >= limits.MAX_BRANCHES) {
    return error(res, 409, 'FEATURE_LIMIT_REACHED', `You have reached MAX_BRANCHES (${totalBranches} / ${limits.MAX_BRANCHES}). Contact VCFO admin to raise the limit.`);
  }
  company.branches += 1;
  refreshStats(customer);
  json(res, 201, { id: `${company.id}-b-new`, companyId: company.id, companyName: company.name, name: body.name, status: 'ACTIVE', createdAt: nowIso() });
});

route('GET', '/api/v1/users', async (req, res) => {
  const s = authenticate(req);
  if (!s || s.kind !== 'customer') return error(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  const c = s.customer;
  if (!gateCustomerApp(res, c)) return;
  json(res, 200, c.users.map((u) => ({
    id: `${u.id}-m`,
    userId: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.customerRole,
    membershipStatus: u.membershipStatus,
    isActive: u.isActive,
    companyIds: u.companyIds,
    lastLoginAt: u.lastLoginAt,
  })));
});

function buildDashboard(c: DbCustomer, company: DbCustomer['companies'][number]) {
  const f = resolveFeatures(c);
  const revenue = 1_284_500 + company.branches * 12_000;
  const expenses = 872_300 + company.branches * 6_500;
  const profit = revenue - expenses;
  const targetsAvailable = !!f.BUDGET_AND_TARGETS?.enabled;
  const labels = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return `${d.toLocaleString('en', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;
  };
  return {
    company: { id: company.id, name: company.name, baseCurrency: company.baseCurrency },
    period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, label: labels(0), previousLabel: labels(1) },
    integrity: { status: 'passed', failed: false, issues: [] },
    kpis: [
      { key: 'revenue', label: 'Revenue', value: revenue, previousValue: revenue * 0.93, unit: 'currency', impact_direction: 'positive', pp_change: null, pct_change: 7 },
      { key: 'expenses', label: 'Expenses', value: expenses, previousValue: expenses * 1.04, unit: 'currency', impact_direction: 'negative', pp_change: null, pct_change: -4 },
      { key: 'profit', label: 'Profit', value: profit, previousValue: profit * 0.88, unit: 'currency', impact_direction: 'positive', pp_change: null, pct_change: 12 },
      { key: 'margin', label: 'Net margin', value: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null, previousValue: 24.1, unit: 'percent', impact_direction: 'positive', pp_change: 2.3, pct_change: null },
    ],
    trend: Array.from({ length: 12 }, (_, i) => ({ period: labels(11 - i), revenue: Math.round(revenue * (0.85 + i * 0.014)), expenses: Math.round(expenses * (0.9 + i * 0.008)), profit: Math.round(profit * (0.8 + i * 0.02)) })),
    targets_available: targetsAvailable,
    statements_available: true,
  };
}

route('GET', '/api/v1/dashboard', async (req, res) => {
  const ctx = customerContext(req, res);
  if (!ctx) return;
  const { customer, company } = ctx;
  if (!gateCustomerApp(res, customer, 'DASHBOARD')) return;
  json(res, 200, buildDashboard(customer, company));
});

route('GET', '/api/v1/analytics/full', async (req, res) => {
  const ctx = customerContext(req, res);
  if (!ctx) return;
  const { customer, company } = ctx;
  if (!gateCustomerApp(res, customer, 'ANALYTICS')) return;
  json(res, 200, {
    company: { id: company.id, name: company.name, baseCurrency: company.baseCurrency },
    period: { label: 'Aug 26', previousLabel: 'Jul 26' },
    integrity: { status: 'passed', failed: false, issues: [] },
    sections: [
      { key: 'kpi', title: 'KPI Explorer', rows: [
        { label: 'Revenue', value: 1284500, previousValue: 1198200, impact_direction: 'positive', pp_change: null },
        { label: 'Gross margin', value: 42.5, previousValue: 40.1, impact_direction: 'positive', pp_change: 2.4 },
      ]},
      { key: 'variance', title: 'Variance Analysis', rows: [
        { label: 'Revenue vs budget', value: 3.2, previousValue: -1.1, impact_direction: 'positive', pp_change: 4.3 },
      ]},
      { key: 'expenses', title: 'Expense Analytics', rows: [
        { label: 'Operating expenses', value: 872300, previousValue: 901100, impact_direction: 'negative', pp_change: null },
      ]},
    ],
  });
});

// ---------------------------------------------------------------------------
// REFRESH (contract: POST /auth/refresh with { refreshToken })
// ---------------------------------------------------------------------------

route('POST', '/api/v1/auth/logout', async (_req, res) => {
  // 204 — revoke (mock: no-op)
  res.statusCode = 204;
  res.end();
});

route('POST', '/api/v1/auth/refresh', async (req, res) => {
  const body = await readBody(req);
  const rt = body?.refreshToken?.toString() ?? '';
  const match = rt.match(/^mock\.refresh\.(.+)$/);
  if (!match) return error(res, 401, 'UNAUTHORIZED', 'Invalid refresh token.');
  const id = match[1];
  // find platform or customer user
  const pu = db.platformUsers.find((x) => x.id === id);
  if (pu) return json(res, 200, { accessToken: `mock.${pu.id}`, refreshToken: `mock.refresh.${pu.id}` });
  for (const c of db.customers) {
    const u = c.users.find((x) => x.id === id);
    if (u) return json(res, 200, { accessToken: `mock.${u.id}`, refreshToken: `mock.refresh.${u.id}` });
  }
  error(res, 401, 'UNAUTHORIZED', 'Invalid refresh token.');
});

// ---------------------------------------------------------------------------
// i18n catalog (contract: GET /api/v1/i18n/languages, /api/v1/i18n/catalog?lang=)
// ---------------------------------------------------------------------------

const I18N_LOCALES: Record<string, { direction: 'ltr' | 'rtl'; catalog: unknown }> = {
  en: { direction: 'ltr', catalog: enCatalog },
  ar: { direction: 'rtl', catalog: arCatalog },
};

route('GET', '/api/v1/i18n/languages', async (_req, res) => {
  json(res, 200, Object.entries(I18N_LOCALES).map(([code, v]) => ({ code, name: code, direction: v.direction })));
});

route('GET', '/api/v1/i18n/catalog', async (req, res) => {
  const q = getCustomerQuery(req);
  const lang = q.lang ?? 'en';
  const entry = I18N_LOCALES[lang] ?? I18N_LOCALES.en;
  json(res, 200, { language: lang in I18N_LOCALES ? lang : 'en', direction: entry.direction, catalog: entry.catalog });
});

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

export async function handleMockRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = (req.method ?? 'GET').toUpperCase();

  // attach query params for handlers that use (req as any).query
  const q: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (q[k] = v));
  (req as any).query = q;

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    (req as any).params = params;
    try {
      await r.handler(req, res, params, undefined);
    } catch (e: any) {
      if (e?.message === 'invalid json') {
        error(res, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
        return true;
      }
      if (e?.message === 'payload too large') {
        error(res, 413, 'VALIDATION_ERROR', 'Payload too large.');
        return true;
      }
      console.error('[mock] handler error', e);
      error(res, 500, 'INTERNAL_ERROR', 'Internal server error.');
      return true;
    }
    return true;
  }
  return false;
}
