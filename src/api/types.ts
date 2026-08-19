/**
 * Domain types — mirror of the VCFO Backend SaaS/Tenant/Subscription contracts.
 *
 * These types describe the *shape* of the existing backend responses
 * (GET /api/v1/auth/session, /api/v1/admin/* ...). They are not a
 * re-implementation of backend logic.
 */

// ---------------------------------------------------------------------------
// Session bootstrap (GET /api/v1/auth/session)
// ---------------------------------------------------------------------------

export type PlatformRole = 'SUPER_ADMIN' | 'SAAS_ADMIN' | 'SUPPORT' | 'BILLING_ADMIN';
export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'CUSTOM';
export type FeatureType = 'BOOLEAN' | 'QUOTA';
export type PaymentStatus = 'PENDING' | 'PAID' | 'VOID' | 'REFUNDED';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'MANUAL' | 'OTHER';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  platformRole: PlatformRole | null;
}

export interface SessionCustomerSummary {
  id: string;
  name: string;
  status: CustomerStatus;
  role: string;
  membershipStatus: MembershipStatus;
  plan: string;
  subscriptionStatus: SubscriptionStatus | null;
  expiresAt: string | null;
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: string;
  planName: string;
  billingCycle: BillingCycle;
  startDate: string | null;
  expiresAt: string | null;
  gracePeriodUntil: string | null;
  agreedPrice: number | null;
  currency: string;
}

export interface TenantFeature {
  enabled: boolean;
  limitValue: number | null;
}

export interface TenantLimits {
  MAX_COMPANIES: number | null;
  MAX_BRANCHES: number | null;
  MAX_USERS: number | null;
  MAX_UPLOADS_PER_MONTH: number | null;
  MAX_STORAGE_GB: number | null;
  MAX_AI_REQUESTS_PER_MONTH: number | null;
  [key: string]: number | null;
}

export interface SessionPayload {
  user: SessionUser;
  customers: SessionCustomerSummary[];
  tenant: {
    customerId: string;
    companyId: string | null;
    customerStatus: CustomerStatus;
    customerRole: string | null;
    subscription: SubscriptionInfo;
    features: Record<string, TenantFeature>;
    limits: TenantLimits;
  } | null;
}

// ---------------------------------------------------------------------------
// SaaS Admin domain entities
// ---------------------------------------------------------------------------

export interface PlanFeatureConfig {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  /** From the backend's nested `feature` relation when available. */
  featureName?: string;
  featureType?: FeatureType;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Null = custom pricing (ENTERPRISE). */
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
  features: PlanFeatureConfig[];
  limits: Record<string, number | null>;
  customersCount?: number;
  createdAt: string;
}

export interface FeatureDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  type: FeatureType;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
}

export interface Customer {
  id: string;
  lockVersion?: number;
  code: string;
  name: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  defaultCurrency: string;
  status: CustomerStatus;
  planId: string | null;
  planCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionStart: string | null;
  expiryDate: string | null;
  agreedPrice: number | null;
  currency: string;
  lastPaymentAt: string | null;
  createdAt: string;
  stats: {
    companies: number;
    branches: number;
    users: number;
  };
}


/** GET /api/v1/admin/customers/:id — detail payload per the integration guide. */
export interface CustomerDetail extends Customer {
  legalName: string | null;
  lockVersion?: number;
  companies: {
    id: string;
    name: string;
    legalName?: string | null;
    baseCurrency?: string;
    status?: string;
    _count?: { branches?: number };
  }[];
  memberships: {
    id: string;
    status: MembershipStatus;
    role: string;
    user: { id: string; firstName: string; lastName: string; email: string; phone?: string | null; isActive?: boolean; lastLoginAt?: string | null };
  }[];
  subscriptions: (Subscription & { plan?: { id: string; code: string; name: string }; overrides?: FeatureOverride[]; events?: SubscriptionEvent[] })[];
  payments: Payment[];
  entitlements: Record<string, { enabled: boolean; limitValue: number | null }>;
  usage: { companies: number; branches: number; users: number };
}

export interface CustomerFilters {
  search?: string;
  status?: CustomerStatus | 'ALL';
  subscriptionStatus?: SubscriptionStatus | 'ALL';
  plan?: string;
  expiry?: 'ALL' | 'EXPIRED' | 'EXPIRING_7' | 'EXPIRING_30' | 'TRIAL' | 'PAST_DUE';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Company {
  id: string;
  customerId: string;
  name: string;
  legalName: string | null;
  baseCurrency: string;
  status: 'ACTIVE' | 'INACTIVE';
  branches: number;
  users: number;
  createdAt: string;
}

export interface CustomerUser {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  customerRole: string;
  membershipStatus: MembershipStatus;
  isActive: boolean;
  companyIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  lockVersion?: number;
  planId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startDate: string | null;
  expiresAt: string | null;
  gracePeriodUntil: string | null;
  agreedPrice: number | null;
  currency: string;
  createdAt: string;
}

export type SubscriptionEventType =
  | 'CREATED'
  | 'ACTIVATED'
  | 'RENEWED'
  | 'EXTENDED'
  | 'PLAN_CHANGED'
  | 'SUSPENDED'
  | 'REACTIVATED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PRICE_CHANGED'
  | 'FEATURE_OVERRIDE_CHANGED';

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  customerId: string;
  eventType: SubscriptionEventType;
  previousValue: string | null;
  newValue: string | null;
  performedBy: string;
  date: string;
  notes: string | null;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  paymentDate: string;
  method: PaymentMethod;
  status: PaymentStatus;
  referenceNumber: string | null;
  receiptNumber: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  recordedBy: string;
  notes: string | null;
  createdAt: string;
}

export interface FeatureOverride {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  notes: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ResolvedFeatureRow {
  featureKey: string;
  name: string;
  type: FeatureType;
  planEnabled: boolean;
  planLimitValue: number | null;
  override: FeatureOverride | null;
  effectiveEnabled: boolean;
  effectiveLimitValue: number | null;
}

export interface UsageItem {
  key: string;
  label: string;
  current: number;
  limit: number | null; // null = unlimited
}

export interface UsageReport {
  items: UsageItem[];
}

export interface OverviewStats {
  customers: { total: number; active: number; suspended: number; cancelled: number };
  subscriptions: {
    trial: number;
    active: number;
    pastDue: number;
    expired: number;
    suspended: number;
    cancelled: number;
  };
  expiring: { in7Days: number; in30Days: number };
  payments: { thisMonth: number; thisYear: number };
  mrr: number | null;
  arr: number | null;
  planDistribution: { planCode: string; count: number }[];
  growth: { month: string; customers: number }[];
  recentActivity: AuditEvent[];
}

export type AuditEntityType =
  | 'CUSTOMER'
  | 'SUBSCRIPTION'
  | 'PLAN'
  | 'FEATURE'
  | 'PAYMENT'
  | 'USER'
  | 'COMPANY'
  | 'PLATFORM_USER';

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  platformRole: PlatformRole | null;
  customerId: string | null;
  customerName: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  metadataSummary: string | null;
}

export interface PlatformUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  platformRole: PlatformRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API error contract
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export type ErrorCode =
  | 'FEATURE_NOT_INCLUDED'
  | 'FEATURE_DISABLED'
  | 'FEATURE_LIMIT_REACHED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CUSTOMER_MEMBERSHIP_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_EMAIL'
  | 'PAYMENT_MISMATCH'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED';

// ---------------------------------------------------------------------------
// Request payloads (SaaS Admin operations)
// ---------------------------------------------------------------------------

export interface FeatureOverrideInput {
  featureKey: string;
  enabled?: boolean;
  limitValue?: number | null;
}

/**
 * POST /api/v1/admin/customers — flat payload per the SaaS Admin contract.
 * idempotencyKey is generated once when the wizard opens and sent in the body.
 */
export interface CreateCustomerPayload {
  idempotencyKey: string;
  customer: {
    name: string;
    legalName?: string | null;
    email?: string;
    phone?: string | null;
    country?: string | null;
    timezone?: string | null;
    defaultCurrency?: string;
  };
  planId: string;
  startDate: string;
  expiryDate: string;
  gracePeriodUntil?: string | null;
  billingCycle?: BillingCycle;
  agreedPrice?: number | null;
  currency?: string;
  notes?: string | null;
  /** Only features that differ from the plan. */
  featureOverrides?: FeatureOverrideInput[];
  owner: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  };
  company: {
    name: string;
    legalName?: string | null;
    baseCurrency?: string;
  };
  /** true → ACTIVE, false → TRIAL. */
  activate?: boolean;
}

export interface UpdateCustomerPayload {
  name?: string;
  legalName?: string | null;
  email?: string;
  phone?: string | null;
  country?: string | null;
  timezone?: string | null;
  defaultCurrency?: string;
}

export interface CreatePlanPayload {
  name: string;
  code: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
  features: PlanFeatureConfig[];
  limits: Record<string, number | null>;
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {}

export interface RecordPaymentPayload {
  customerId: string;
  /** Must be a UUID belonging to the same customer (backend 409 otherwise). */
  subscriptionId: string | null;
  amount: number;
  currency: string;
  paymentDate: string;
  /** Backend DTO field name (property `method` should not exist). */
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber: string | null;
  receiptNumber: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string | null;
}

export interface RenewSubscriptionPayload {
  expiryDate: string;
  gracePeriodUntil?: string | null;
  notes?: string;
  expectedVersion?: number;
}

export interface ExtendSubscriptionPayload {
  expiryDate: string;
  gracePeriodUntil?: string | null;
  notes?: string;
  expectedVersion?: number;
}

export interface ChangePlanPayload {
  planId: string;
  notes?: string;
}

export interface ChangePricePayload {
  agreedPrice: number;
  currency: string;
  notes?: string;
}

export interface CreateCustomerUserPayload {
  customerId: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  /** OWNER | FINANCE_MANAGER | ACCOUNTANT | VIEWER */
  customerRoleName?: string;
  companyId?: string;
  branchId?: string;
  /** INVITED | ACTIVE | SUSPENDED | DISABLED */
  status?: MembershipStatus;
  /** Attach an existing user instead of email/password. */
  userId?: string;
}

export interface UpdateCustomerUserPayload {
  isActive?: boolean;
  status?: MembershipStatus;
  customerRoleName?: string;
  companyId?: string;
  branchId?: string;
}

export interface FeatureOverridePayload {
  /** Required by POST /admin/subscriptions/:subId/overrides. */
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  notes: string | null;
}

export interface CreateCompanyPayload {
  name: string;
  legalName: string | null;
  baseCurrency: string;
}

export interface CreatePlatformUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  platformRole: PlatformRole;
}

export interface UpdatePlatformUserPayload {
  firstName?: string;
  lastName?: string;
  platformRole?: PlatformRole;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Customer app — dashboard & analytics (FRONTEND-API-GUIDE shape)
// ---------------------------------------------------------------------------

export interface IntegrityIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface Integrity {
  status: 'passed' | 'failed' | 'warning';
  failed: boolean;
  issues: IntegrityIssue[];
}

export type ImpactDirection = 'positive' | 'negative' | 'neutral';

export interface DashboardKpi {
  key: string;
  label: string;
  value: number | null;
  previousValue: number | null;
  unit: string;
  currency?: string;
  /** Colour must come from impact_direction, never from the sign. */
  impact_direction: ImpactDirection;
  pp_change: number | null;
  pct_change: number | null;
}

export interface TrendPoint {
  period: string;
  revenue: number | null;
  expenses: number | null;
  profit: number | null;
}

export interface DashboardPayload {
  company: { id: string; name: string; baseCurrency: string };
  period: { year: number; month: number; label: string; previousLabel: string };
  integrity: Integrity;
  kpis: DashboardKpi[];
  trend: TrendPoint[];
  targets_available: boolean;
  statements_available: boolean;
}

export interface AnalyticsPayload {
  company: { id: string; name: string; baseCurrency: string };
  period: { label: string; previousLabel: string };
  integrity: Integrity;
  sections: { key: string; title: string; rows: { label: string; value: number | null; previousValue: number | null; impact_direction: ImpactDirection; pp_change: number | null }[] }[];
}

// ---------------------------------------------------------------------------
// Company / branch / membership (customer workspace)
// ---------------------------------------------------------------------------

export interface CustomerCompany {
  id: string;
  name: string;
  legalName: string | null;
  baseCurrency: string;
  branches: number;
  users: number;
  createdAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface CustomerMembership {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  membershipStatus: MembershipStatus;
  isActive: boolean;
  companyIds: string[];
  lastLoginAt: string | null;
}

// ---------------------------------------------------------------------------
// i18n catalog (contract: GET /api/v1/i18n/languages, /api/v1/i18n/catalog?lang=)
// ---------------------------------------------------------------------------

export interface I18nLanguage {
  code: string;
  name: string;
  direction: 'ltr' | 'rtl';
}

export interface I18nCatalog {
  language: string;
  direction: 'ltr' | 'rtl';
  /** Flat or nested dictionary merged into i18next. */
  catalog: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Display-only entitlement catalog (marketing / admin UI; source of truth
// remains the session). Contract table in the product spec.
// ---------------------------------------------------------------------------

export const PLAN_CATALOG: Record<string, { nameKey: string; monthly: number | null; annual: number | null }> = {
  STARTER: { nameKey: 'plan.starter', monthly: 49, annual: 490 },
  PROFESSIONAL: { nameKey: 'plan.professional', monthly: 149, annual: 1490 },
  BUSINESS: { nameKey: 'plan.business', monthly: 399, annual: 3990 },
  ENTERPRISE: { nameKey: 'plan.enterprise', monthly: null, annual: null },
};

export const PLAN_BOOLEAN_DEFAULTS: Record<string, string[]> = {
  STARTER: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'EXPORT_EXCEL'],
  PROFESSIONAL: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'VARIANCE_ANALYSIS', 'PROFIT_BRIDGE', 'EXPENSE_ANALYTICS', 'BRANCH_ANALYTICS', 'FORECAST', 'SCENARIO', 'EXPORT_EXCEL', 'EXPORT_PDF', 'AUDIT_LOG'],
  BUSINESS: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'VARIANCE_ANALYSIS', 'PROFIT_BRIDGE', 'EXPENSE_ANALYTICS', 'BRANCH_ANALYTICS', 'FORECAST', 'SCENARIO', 'BUDGET_AND_TARGETS', 'MULTI_CURRENCY', 'EXPORT_EXCEL', 'EXPORT_PDF', 'AUDIT_LOG', 'API_ACCESS'],
  ENTERPRISE: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'VARIANCE_ANALYSIS', 'PROFIT_BRIDGE', 'EXPENSE_ANALYTICS', 'BRANCH_ANALYTICS', 'FORECAST', 'SCENARIO', 'BUDGET_AND_TARGETS', 'MULTI_CURRENCY', 'EXPORT_EXCEL', 'EXPORT_PDF', 'AUDIT_LOG', 'API_ACCESS'],
};

export const PLAN_QUOTA_DEFAULTS: Record<string, Record<string, number | null>> = {
  STARTER: { MAX_COMPANIES: 1, MAX_BRANCHES: 5, MAX_USERS: 3, MAX_UPLOADS_PER_MONTH: 20, MAX_STORAGE_GB: 2, MAX_AI_REQUESTS_PER_MONTH: 0 },
  PROFESSIONAL: { MAX_COMPANIES: 3, MAX_BRANCHES: 25, MAX_USERS: 10, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 10, MAX_AI_REQUESTS_PER_MONTH: 0 },
  BUSINESS: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 500, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  ENTERPRISE: { MAX_COMPANIES: null, MAX_BRANCHES: null, MAX_USERS: null, MAX_UPLOADS_PER_MONTH: null, MAX_STORAGE_GB: null, MAX_AI_REQUESTS_PER_MONTH: 0 },
};
