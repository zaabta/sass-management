/**
 * Typed services — the only place API endpoints are referenced.
 * UI components never call fetch/request directly.
 */
import { request, toQuery } from './client';
import type {
  AnalyticsPayload,
  AuditEvent,
  Branch,
  Company,
  CreateCompanyPayload,
  CreateCustomerPayload,
  CreateCustomerUserPayload,
  CreatePlanPayload,
  CreatePlatformUserPayload,
  Customer,
  CustomerCompany,
  CustomerDetail,
  CustomerFilters,
  CustomerMembership,
  CustomerUser,
  DashboardPayload,
  FeatureDefinition,
  FeatureOverride,
  FeatureType,
  FeatureOverridePayload,
  I18nCatalog,
  I18nLanguage,
  OverviewStats,
  Paginated,
  Payment,
  Plan,
  PlanFeatureConfig,
  PlatformUser,
  RecordPaymentPayload,
  ResolvedFeatureRow,
  SessionPayload,
  SessionUser,
  Subscription,
  SubscriptionEvent,
  UpdateCustomerPayload,
  UpdateCustomerUserPayload,
  UpdatePlanPayload,
  UpdatePlatformUserPayload,
  UsageReport,
} from './types';

// ---------------------------------------------------------------------------
// Auth / session
// ---------------------------------------------------------------------------

export const authApi = {
  /**
   * Login returns the tokens INSIDE the envelope: `data.accessToken`
   * (+ optional `data.refreshToken`). The client unwraps `data` once.
   */
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken?: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  session: () => request<SessionPayload>('/auth/session'),
  logout: (refreshToken: string) => request<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),
};

// ---------------------------------------------------------------------------
// Companies (company switcher — no x-company-id required)
// ---------------------------------------------------------------------------

export const companiesApi = {
  list: () => request<CustomerCompany[]>('/companies'),
};

// ---------------------------------------------------------------------------
// i18n catalog (contract: /api/v1/i18n/*)
// ---------------------------------------------------------------------------

export const i18nApi = {
  languages: () => request<I18nLanguage[]>('/i18n/languages'),
  catalog: (lang: string) => request<I18nCatalog>(`/i18n/catalog?lang=${encodeURIComponent(lang)}`),
};

// ---------------------------------------------------------------------------
// Customer application
// ---------------------------------------------------------------------------

export const customerApi = {
  dashboard: () => request<DashboardPayload>('/dashboard'),
  analytics: () => request<AnalyticsPayload>('/analytics/full'),
  companies: () => request<CustomerCompany[]>('/companies'),
  createCompany: (payload: { name: string; legalName?: string | null; baseCurrency: string }) =>
    request<CustomerCompany>('/companies', { method: 'POST', body: payload }),
  branches: (companyId?: string) => request<Branch[]>(`/branches${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  createBranch: (payload: { companyId: string; name: string }) => request<Branch>('/branches', { method: 'POST', body: payload }),
  memberships: () => request<CustomerMembership[]>('/users'),
  me: () =>
    request<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      customerRole: string;
      customerName: string;
      membershipStatus: string;
      isActive: boolean;
      companyIds: string[];
    }>('/account/me'),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; status: string }>('/uploads', {
      method: 'POST',
      headers: { 'X-Mock-Form': 'true' },
      body: form,
    });
  },
};

// ---------------------------------------------------------------------------
// SaaS Admin
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Plan / feature normalizers — the backend serializes plans like:
//   { isActive, monthlyPrice: "49", features: [{ enabled, limitValue: "5",
//     feature: { key, name, type } }], _count: { subscriptions } }
// UI components consume the normalized domain shape only.
// ---------------------------------------------------------------------------

interface RawPlanFeature {
  id?: string;
  planId?: string;
  featureId?: string;
  enabled?: boolean;
  limitValue?: number | string | null;
  featureKey?: string;
  feature?: { id?: string; key: string; name?: string; description?: string; type?: FeatureType; isActive?: boolean };
}

interface RawPlan {
  id: string;
  code: string;
  name: string;
  description?: string;
  monthlyPrice?: number | string | null;
  annualPrice?: number | string | null;
  currency?: string;
  isActive?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  sortOrder?: number;
  features?: RawPlanFeature[];
  _count?: { subscriptions?: number };
  customersCount?: number;
  createdAt?: string;
}

export function normalizePlan(raw: RawPlan): Plan {
  const features: PlanFeatureConfig[] = (raw.features ?? []).map((pf) => {
    const key = pf.feature?.key ?? pf.featureKey ?? '';
    return {
      featureKey: key,
      enabled: !!pf.enabled,
      limitValue: pf.limitValue != null && pf.limitValue !== '' ? Number(pf.limitValue) : null,
      featureName: pf.feature?.name,
      featureType: pf.feature?.type,
    };
  });
  const limits: Record<string, number | null> = {};
  for (const f of features) {
    if (f.featureType === 'QUOTA' || /^MAX_/.test(f.featureKey)) limits[f.featureKey] = f.limitValue;
  }
  return {
    id: String(raw.id),
    code: String(raw.code),
    name: String(raw.name),
    description: String(raw.description ?? ''),
    monthlyPrice: raw.monthlyPrice != null ? Number(raw.monthlyPrice) : null,
    annualPrice: raw.annualPrice != null ? Number(raw.annualPrice) : null,
    currency: String(raw.currency ?? 'USD'),
    status: raw.isActive === false || raw.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    sortOrder: Number(raw.sortOrder ?? 99),
    features,
    limits,
    customersCount: raw.customersCount != null ? Number(raw.customersCount) : raw._count?.subscriptions ?? 0,
    createdAt: String(raw.createdAt ?? ''),
  };
}

interface RawFeatureDefinition {
  id: string;
  key: string;
  name?: string;
  description?: string;
  type?: FeatureType;
  isActive?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  sortOrder?: number;
}

function normalizeFeature(f: RawFeatureDefinition): FeatureDefinition {
  const raw = f as unknown as Record<string, unknown>;
  const active =
    raw.isActive === true ||
    raw.isActive === 'true' ||
    raw.active === true ||
    raw.enabled === true;
  const inactive =
    raw.isActive === false ||
    raw.isActive === 'false' ||
    raw.active === false ||
    raw.enabled === false;
  const status: 'ACTIVE' | 'INACTIVE' =
    raw.status === 'INACTIVE' ? 'INACTIVE' : raw.status === 'ACTIVE' ? 'ACTIVE' : inactive ? 'INACTIVE' : active || raw.status == null ? 'ACTIVE' : 'ACTIVE';
  return {
    id: String(f.id ?? raw.key ?? ''),
    key: String(f.key ?? raw.id ?? ''),
    name: String(f.name ?? f.key ?? ''),
    description: String(f.description ?? ''),
    type: f.type ?? 'BOOLEAN',
    status,
    sortOrder: Number(f.sortOrder ?? 0),
  };
}

/** Map the internal status field to the backend isActive boolean. */
function toBackendPlanPayload(payload: CreatePlanPayload | UpdatePlanPayload) {
  const { status, features, limits, ...rest } = payload as CreatePlanPayload;
  return {
    ...rest,
    isActive: status === 'ACTIVE',
    features: (features ?? []).map((f) => ({
      featureKey: f.featureKey,
      enabled: f.enabled,
      limitValue: f.limitValue != null ? String(f.limitValue) : null,
    })),
    limits: limits ?? {},
  };
}


// ---------------------------------------------------------------------------
// Pagination — the real backend uses `page` + `limit` query params and
// returns { items, total, page, limit }. The UI uses pageSize everywhere,
// so map both directions here (never send pageSize to the API).
// ---------------------------------------------------------------------------

type PaginateInput = Record<string, string | number | null | undefined>;
type PaginateOutput = Record<string, string | number | null | undefined>;

function paginateParams(params: PaginateInput): PaginateOutput {
  const out: PaginateOutput = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'pageSize') {
      out.limit = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

interface RawCustomerCounts {
  companies?: number | string;
  branches?: number | string;
  users?: number | string;
}

interface RawCustomer {
  id?: string;
  code?: string;
  name?: string;
  legalName?: string | null;
  email?: string;
  phone?: string | null;
  country?: string | null;
  timezone?: string | null;
  defaultCurrency?: string;
  status?: string;
  planCode?: string | null;
  plan?: string | { code?: string; name?: string } | null;
  subscriptionStatus?: string | null;
  subscriptionStart?: string | null;
  startDate?: string | null;
  expiryDate?: string | null;
  agreedPrice?: number | string | null;
  currency?: string;
  lastPaymentAt?: string | null;
  lastPayment?: string | { paymentDate?: string; amount?: number | string; currency?: string; status?: string } | null;
  createdAt?: string;
  lockVersion?: number;
  stats?: RawCustomerCounts;
  _count?: RawCustomerCounts;
  companiesCount?: number | string;
  branchesCount?: number | string;
  usersCount?: number | string;
  /** Flat counts from the real list payload. */
  companies?: number | string;
  branches?: number | string;
  users?: number | string;
}

/**
 * The backend's customer list/detail payloads vary (stats may be absent,
 * counts can arrive as _count / *Count / stats). Normalize into the domain
 * Customer shape the UI renders.
 */
export function normalizeCustomer(raw: RawCustomer): Customer {
  const count = (v: number | string | undefined): number => (v == null || v === '' ? 0 : Number(v));
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    legalName: raw.legalName ?? null,
    email: String(raw.email ?? ''),
    phone: raw.phone ?? null,
    country: raw.country ?? null,
    timezone: raw.timezone ?? null,
    defaultCurrency: String(raw.defaultCurrency ?? 'USD'),
    status: (['ACTIVE', 'SUSPENDED', 'CANCELLED'] as const).includes(raw.status as never) ? (raw.status as Customer['status']) : 'ACTIVE',
    planId: null,
    planCode: typeof raw.plan === 'string' ? raw.plan : raw.plan?.code ?? raw.planCode ?? null,
    subscriptionStatus: (raw.subscriptionStatus as Customer['subscriptionStatus']) ?? null,
    subscriptionStart: raw.subscriptionStart ?? raw.startDate ?? null,
    expiryDate: raw.expiryDate ?? null,
    agreedPrice: raw.agreedPrice != null && raw.agreedPrice !== '' ? Number(raw.agreedPrice) : null,
    currency: String(raw.currency ?? raw.defaultCurrency ?? 'USD'),
    lastPaymentAt:
      raw.lastPaymentAt ??
      (typeof raw.lastPayment === 'string'
        ? raw.lastPayment
        : raw.lastPayment && typeof raw.lastPayment === 'object'
          ? raw.lastPayment.paymentDate ?? null
          : null),
    createdAt: String(raw.createdAt ?? ''),
    lockVersion: raw.lockVersion,
    stats: {
      companies: count(raw.stats?.companies ?? raw._count?.companies ?? raw.companiesCount ?? raw.companies),
      branches: count(raw.stats?.branches ?? raw._count?.branches ?? raw.branchesCount ?? raw.branches),
      users: count(raw.stats?.users ?? raw._count?.users ?? raw.usersCount ?? raw.users),
    },
  };
}

function normalizePaginated<T>(raw: unknown): Paginated<T> {
  const obj = (raw ?? {}) as {
    items?: unknown;
    total?: number | string;
    page?: number | string;
    pageSize?: number | string;
    limit?: number | string;
    data?: unknown;
    meta?: { total?: number | string; page?: number | string; limit?: number | string; totalPages?: number | string };
  };
  // Real backend: { data: { data: [...], meta: {...} } } — the envelope is
  // already unwrapped by the client, so `data` here is the inner object.
  const inner = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? (obj.data as { data?: unknown; meta?: typeof obj.meta }) : null;
  const items = Array.isArray(obj.items)
    ? (obj.items as T[])
    : Array.isArray(obj.data)
      ? (obj.data as T[])
      : inner && Array.isArray(inner.data)
        ? (inner.data as T[])
        : [];
  const meta = obj.meta ?? inner?.meta;
  const total = Number(obj.total ?? meta?.total ?? items.length);
  const page = Number(obj.page ?? meta?.page ?? 1);
  const limit = Number(obj.pageSize ?? obj.limit ?? meta?.limit ?? items.length);
  return { items, total, page, pageSize: limit };
}


// ---------------------------------------------------------------------------
// Overview — the real backend returns a different shape than the domain
// type (expiringIn7Days/expiringIn30Days flat, paymentsThisMonth object with
// string amount, no cancelled/expiring nesting). Normalize once here.
// ---------------------------------------------------------------------------

interface RawOverview {
  customers?: { total?: number | string; active?: number | string; suspended?: number | string; cancelled?: number | string };
  subscriptions?: {
    trial?: number | string;
    active?: number | string;
    pastDue?: number | string;
    expired?: number | string;
    suspended?: number | string;
    cancelled?: number | string;
    expiringIn7Days?: number | string;
    expiringIn30Days?: number | string;
  };
  expiring?: { in7Days?: number | string; in30Days?: number | string };
  paymentsThisMonth?: { count?: number | string; amount?: number | string };
  paymentsThisYear?: { count?: number | string; amount?: number | string };
  payments?: { thisMonth?: number | string; thisYear?: number | string };
  mrr?: number | string | null;
  arr?: number | string | null;
  planDistribution?: { planId?: string; planCode?: string; count?: number | string }[];
  growth?: { month?: string; customers?: number | string }[];
  recentActivity?: unknown[];
}

function num(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function normalizeOverview(raw: RawOverview): OverviewStats {
  const subs = raw.subscriptions ?? {};
  const expiring = raw.expiring ?? {};
  const pm = raw.paymentsThisMonth ?? raw.payments?.thisMonth;
  const py = raw.paymentsThisYear ?? raw.payments?.thisYear;
  const pmAmount = typeof pm === 'object' && pm != null ? (pm as { amount?: number | string }).amount : pm;
  const pyAmount = typeof py === 'object' && py != null ? (py as { amount?: number | string }).amount : py;
  return {
    customers: {
      total: num(raw.customers?.total),
      active: num(raw.customers?.active),
      suspended: num(raw.customers?.suspended),
      cancelled: num(raw.customers?.cancelled),
    },
    subscriptions: {
      trial: num(subs.trial),
      active: num(subs.active),
      pastDue: num(subs.pastDue),
      expired: num(subs.expired),
      suspended: num(subs.suspended),
      cancelled: num(subs.cancelled),
    },
    expiring: {
      in7Days: num(subs.expiringIn7Days ?? expiring.in7Days),
      in30Days: num(subs.expiringIn30Days ?? expiring.in30Days),
    },
    payments: {
      thisMonth: num(pmAmount),
      thisYear: num(pyAmount),
    },
    mrr: raw.mrr != null ? num(raw.mrr) : null,
    arr: raw.arr != null ? num(raw.arr) : null,
    planDistribution: (raw.planDistribution ?? []).map((p) => ({ planCode: String(p.planCode ?? ''), count: num(p.count) })),
    growth: (raw.growth ?? []).map((g) => ({ month: String(g.month ?? ''), customers: num(g.customers) })),
    recentActivity: (raw.recentActivity ?? []) as AuditEvent[],
  };
}

export const saasAdminApi = {
  // Overview
  getOverview: () => request<RawOverview>('/admin/overview').then(normalizeOverview),

  // Customers
  /**
   * All filtering, sorting, search and pagination are server-side (the
   * backend owns them). The page sends every active filter + sort params;
   * 'ALL' values are omitted so the backend defaults apply.
   */
  getCustomers: (filters: CustomerFilters) => {
    const q: Record<string, string | number | null | undefined> = {
      page: filters.page ?? 1,
      limit: filters.pageSize ?? 10,
    };
    if (filters.search?.trim()) q.search = filters.search.trim();
    if (filters.status && filters.status !== 'ALL') q.status = filters.status;
    if (filters.subscriptionStatus && filters.subscriptionStatus !== 'ALL') q.subscriptionStatus = filters.subscriptionStatus;
    if (filters.plan && filters.plan !== 'ALL') q.planCode = filters.plan;
    if (filters.expiry && filters.expiry !== 'ALL') q.expiry = filters.expiry;
    if (filters.sortBy) q.sortBy = filters.sortBy;
    if (filters.sortDir) q.sortDir = filters.sortDir;
    return request<unknown>(`/admin/customers${toQuery(q)}`).then((raw) => {
      const page = normalizePaginated<RawCustomer>(raw);
      return { ...page, items: page.items.map(normalizeCustomer) };
    });
  },
  getCustomer: (id: string) => request<CustomerDetail>(`/admin/customers/${id}`),
  createCustomer: (payload: CreateCustomerPayload, idempotencyKey?: string) =>
    request<Customer>('/admin/customers', { method: 'POST', body: payload, headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {} }),
  updateCustomer: (id: string, payload: UpdateCustomerPayload & { expectedVersion?: number }) =>
    request<Customer>(`/admin/customers/${id}`, { method: 'PATCH', body: payload }),
  customerAction: (id: string, action: 'activate' | 'suspend' | 'reactivate' | 'cancel') =>
    request<Customer>(`/admin/customers/${id}/${action}`, { method: 'POST' }),

  // Companies
  getCompanies: (customerId: string) => request<Company[]>(`/admin/customers/${customerId}/companies`),
  createCompany: (customerId: string, payload: CreateCompanyPayload) =>
    request<Company>(`/admin/customers/${customerId}/companies`, { method: 'POST', body: payload }),
  setCompanyStatus: (companyId: string, status: 'ACTIVE' | 'INACTIVE') =>
    request<Company>(`/admin/companies/${companyId}`, { method: 'PATCH', body: { status } }),

  // Users (customer users)
  getCustomerUsers: (customerId: string) => request<CustomerUser[]>(`/admin/customers/${customerId}/users`),
  createCustomerUser: (customerId: string, payload: CreateCustomerUserPayload) =>
    request<CustomerUser>(`/admin/users`, { method: 'POST', body: { ...payload, customerId } }),
  /** PATCH /admin/users/:membershipId — the id is the CustomerMembership id. */
  updateUser: (membershipId: string, payload: UpdateCustomerUserPayload) => request<CustomerUser>(`/admin/users/${membershipId}`, { method: 'PATCH', body: payload }),
  getAllUsers: (params: Record<string, string> = {}) =>
    request<unknown>(`/admin/users${toQuery(paginateParams(params))}`).then((payload) => {
      if (Array.isArray(payload)) return payload as (CustomerUser & { customerName: string; customerCode: string; companies: string[] })[];
      const obj = (payload ?? {}) as { items?: unknown; users?: unknown; data?: unknown };
      const list = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.users) ? obj.users : Array.isArray(obj.data) ? obj.data : [];
      return list as (CustomerUser & { customerName: string; customerCode: string; companies: string[] })[];
    }),

  // Subscriptions
  getSubscriptions: (params: Record<string, string | number> = {}) =>
    request<unknown>(`/admin/subscriptions${toQuery(paginateParams(params))}`).then(normalizePaginated<Subscription>),
  getSubscription: (customerId: string) => request<Subscription | null>(`/admin/customers/${customerId}/subscription`),
  createSubscription: (customerId: string, payload: { planId: string; startsAt: string; expiresAt: string; gracePeriodUntil?: string | null; billingCycle: string; agreedPrice?: number; currency?: string }) =>
    request<Subscription>(`/admin/customers/${customerId}/subscription`, { method: 'POST', body: payload }),
  subscriptionAction: (subscriptionId: string, action: 'activate' | 'suspend' | 'reactivate' | 'cancel') =>
    request<Subscription>(`/admin/subscriptions/${subscriptionId}/${action}`, { method: 'POST' }),
  renewSubscription: (subscriptionId: string, payload: { expiryDate: string; gracePeriodUntil?: string | null; notes?: string; expectedVersion?: number }, idempotencyKey?: string) =>
    request<Subscription>(`/admin/subscriptions/${subscriptionId}/renew`, { method: 'POST', body: payload, headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {} }),
  extendSubscription: (subscriptionId: string, payload: { expiryDate: string; gracePeriodUntil?: string | null; notes?: string; expectedVersion?: number }, idempotencyKey?: string) =>
    request<Subscription>(`/admin/subscriptions/${subscriptionId}/extend`, { method: 'POST', body: payload, headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {} }),
  reactivateSubForCustomer: (customerId: string) =>
    request<Subscription>(`/admin/customers/${customerId}/subscription/reactivate`, { method: 'POST' }),
  changePlan: (subscriptionId: string, payload: { planId: string; notes?: string; expectedVersion?: number }) =>
    request<Subscription>(`/admin/subscriptions/${subscriptionId}/change-plan`, { method: 'POST', body: payload }),
  changePrice: (subscriptionId: string, payload: { agreedPrice: number; currency: string; notes?: string; expectedVersion?: number }) =>
    request<Subscription>(`/admin/subscriptions/${subscriptionId}/change-price`, { method: 'POST', body: payload }),
  getSubscriptionHistory: (customerId: string) => request<SubscriptionEvent[]>(`/admin/customers/${customerId}/subscription/history`),

  // Features / overrides — subscription-scoped (integration guide §6)
  getResolvedFeatures: (customerId: string) => request<ResolvedFeatureRow[]>(`/admin/customers/${customerId}/features`),
  setFeatureOverride: (subscriptionId: string, payload: FeatureOverridePayload) =>
    request<FeatureOverride>(`/admin/subscriptions/${subscriptionId}/overrides`, { method: 'POST', body: payload }),
  removeFeatureOverride: (subscriptionId: string, featureKey: string) =>
    request<{ ok: boolean }>(`/admin/subscriptions/${subscriptionId}/overrides/${featureKey}`, { method: 'DELETE' }),
  // Usage
  getUsage: (customerId: string) => request<UsageReport>(`/admin/customers/${customerId}/usage`),

  // Payments
  getCustomerPayments: (customerId: string) => request<Payment[]>(`/admin/customers/${customerId}/payments`),
  getPayments: (params: Record<string, string | number> = {}) =>
    request<unknown>(`/admin/payments${toQuery(paginateParams(params))}`).then(normalizePaginated<Payment>),
  recordPayment: (payload: RecordPaymentPayload, idempotencyKey?: string) =>
    request<Payment>('/admin/payments', { method: 'POST', body: payload, headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {} }),
  voidPayment: (paymentId: string) => request<Payment>(`/admin/payments/${paymentId}/void`, { method: 'POST' }),
  refundPayment: (paymentId: string) => request<Payment>(`/admin/payments/${paymentId}/refund`, { method: 'PATCH' }),

  // Plans (normalized to the domain shape; backend uses isActive, string
  // prices/limits, nested feature relations and _count)
  getPlans: () => request<RawPlan[]>('/admin/plans').then((list) => (list ?? []).map(normalizePlan)),
  createPlan: (payload: CreatePlanPayload) =>
    request<RawPlan>('/admin/plans', { method: 'POST', body: toBackendPlanPayload(payload) }).then(normalizePlan),
  updatePlan: (id: string, payload: UpdatePlanPayload) =>
    request<RawPlan>(`/admin/plans/${id}`, { method: 'PATCH', body: toBackendPlanPayload(payload) }).then(normalizePlan),
  setPlanStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') =>
    request<RawPlan>(`/admin/plans/${id}`, { method: 'PATCH', body: { isActive: status === 'ACTIVE' } }).then(normalizePlan),

  // Feature registry (backend uses isActive)
  getFeatures: () =>
    request<unknown>('/admin/features').then((payload) => {
      let list: RawFeatureDefinition[] = Array.isArray(payload) ? payload : [];
      if (!Array.isArray(payload) && payload && typeof payload === 'object') {
        const obj = payload as { items?: unknown; features?: unknown };
        if (Array.isArray(obj.items)) list = obj.items as RawFeatureDefinition[];
        else if (Array.isArray(obj.features)) list = obj.features as RawFeatureDefinition[];
      }
      return list.map(normalizeFeature);
    }),
  updateFeature: (id: string, payload: { name?: string; description?: string; status?: 'ACTIVE' | 'INACTIVE' }) =>
    request<FeatureDefinition>(`/admin/features/${id}`, {
      method: 'PATCH',
      body: { name: payload.name, description: payload.description, isActive: payload.status === 'ACTIVE' },
    }),

  // Platform users
  getPlatformUsers: () => request<PlatformUser[]>('/admin/platform-users'),
  createPlatformUser: (payload: CreatePlatformUserPayload) => request<PlatformUser>('/admin/platform-users', { method: 'POST', body: payload }),
  updatePlatformUser: (id: string, payload: UpdatePlatformUserPayload) => request<PlatformUser>(`/admin/platform-users/${id}`, { method: 'PATCH', body: payload }),

  // Audit
  getAudit: (params: Record<string, string | number> = {}) =>
    request<unknown>(`/admin/audit${toQuery(paginateParams(params))}`).then(normalizePaginated<AuditEvent>),
};
