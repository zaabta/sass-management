/**
 * DEV-ONLY in-memory mock of the VCFO Backend SaaS/Tenant/Subscription layer.
 *
 * This file is NOT part of the frontend application logic. It exists so the
 * frontend can be developed, previewed and tested against the documented
 * contracts (GET /api/v1/auth/session, /api/v1/admin/*) while the real
 * backend service is not attached to this repository.
 *
 * The real backend remains the security boundary; every rule implemented
 * here (tenant isolation, entitlement, quotas, roles) is a stand-in for
 * what the backend enforces, and the frontend never trusts the mock.
 */

import type {
  BillingCycle,
  Customer,
  CustomerUser,
  Company,
  FeatureOverride,
  FeatureType,
  MembershipStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Plan,
  PlatformRole,
  PlatformUser,
  Subscription,
  SubscriptionEvent,
  SubscriptionStatus,
  AuditEvent,
  AuditEntityType,
  FeatureDefinition,
} from '../../src/api/types';

export const today = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

export function addDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

let seq = 1000;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString().padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Feature registry
// ---------------------------------------------------------------------------

const FEATURE_DEFS: Array<[string, string, string, FeatureType]> = [
  ['DASHBOARD', 'Dashboard', 'Financial overview dashboard', 'BOOLEAN'],
  ['FINANCIAL_TRUTH', 'Financial Truth', 'Core financial truth workspace', 'BOOLEAN'],
  ['FINANCIAL_STATEMENTS', 'Financial Statements', 'Balance sheet, P&L, cash flow statements', 'BOOLEAN'],
  ['ANALYTICS', 'Analytics', 'Analytics workspace', 'BOOLEAN'],
  ['KPI_EXPLORER', 'KPI Explorer', 'Explore and compare KPIs', 'BOOLEAN'],
  ['VARIANCE_ANALYSIS', 'Variance Analysis', 'Actual vs budget variance analysis', 'BOOLEAN'],
  ['PROFIT_BRIDGE', 'Profit Bridge', 'Profit bridge analysis', 'BOOLEAN'],
  ['EXPENSE_ANALYTICS', 'Expense Analytics', 'Expense analytics', 'BOOLEAN'],
  ['BRANCH_ANALYTICS', 'Branch Analytics', 'Per-branch analytics', 'BOOLEAN'],
  ['FORECAST', 'Forecast', 'Cash flow and P&L forecasting', 'BOOLEAN'],
  ['SCENARIO', 'Scenario', 'Scenario planning', 'BOOLEAN'],
  ['BUDGET_AND_TARGETS', 'Budget & Targets', 'Budgeting and target setting', 'BOOLEAN'],
  ['MULTI_CURRENCY', 'Multi-Currency', 'Multi-currency books', 'BOOLEAN'],
  ['EXPORT_EXCEL', 'Excel Export', 'Export reports to Excel', 'BOOLEAN'],
  ['EXPORT_PDF', 'PDF Export', 'Export reports to PDF', 'BOOLEAN'],
  ['AUDIT_LOG', 'Audit Log', 'Customer audit log', 'BOOLEAN'],
  ['AI_ADVISOR', 'AI Advisor', 'AI-powered financial advisor', 'BOOLEAN'],
  ['API_ACCESS', 'API Access', 'REST API access', 'BOOLEAN'],
  ['MAX_COMPANIES', 'Companies', 'Maximum number of companies', 'QUOTA'],
  ['MAX_BRANCHES', 'Branches', 'Maximum number of branches', 'QUOTA'],
  ['MAX_USERS', 'Users', 'Maximum number of users', 'QUOTA'],
  ['MAX_UPLOADS_PER_MONTH', 'Monthly Uploads', 'Maximum document uploads per month', 'QUOTA'],
];

export const features: FeatureDefinition[] = FEATURE_DEFS.map(([key, name, description, type], i) => ({
  id: `feat-${key.toLowerCase()}`,
  key,
  name,
  description,
  type,
  status: 'ACTIVE',
  sortOrder: i,
}));

export const featureDef = (key: string): FeatureDefinition => {
  const f = features.find((x) => x.key === key);
  if (!f) throw new Error(`Unknown feature key ${key}`);
  return f;
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const ALL_FEATURES = [
  'DASHBOARD',
  'FINANCIAL_TRUTH',
  'FINANCIAL_STATEMENTS',
  'ANALYTICS',
  'KPI_EXPLORER',
  'VARIANCE_ANALYSIS',
  'PROFIT_BRIDGE',
  'EXPENSE_ANALYTICS',
  'BRANCH_ANALYTICS',
  'FORECAST',
  'SCENARIO',
  'BUDGET_AND_TARGETS',
  'MULTI_CURRENCY',
  'EXPORT_EXCEL',
  'EXPORT_PDF',
  'AUDIT_LOG',
  'AI_ADVISOR',
  'API_ACCESS',
];

// Feature entitlement table — mirrors the backend catalog exactly
// (the payload shown by GET /api/v1/admin/plans).
const PLAN_FEATURE_TABLE: Record<string, string[]> = {
  STARTER: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'EXPORT_EXCEL'],
  PROFESSIONAL: ['DASHBOARD', 'FINANCIAL_TRUTH', 'FINANCIAL_STATEMENTS', 'ANALYTICS', 'KPI_EXPLORER', 'VARIANCE_ANALYSIS', 'PROFIT_BRIDGE', 'EXPENSE_ANALYTICS', 'BRANCH_ANALYTICS', 'FORECAST', 'SCENARIO', 'EXPORT_EXCEL', 'EXPORT_PDF', 'AUDIT_LOG'],
  BUSINESS: ALL_FEATURES.filter((k) => k !== 'AI_ADVISOR'),
  ENTERPRISE: ALL_FEATURES.filter((k) => k !== 'AI_ADVISOR'),
};

const PLAN_SEED: Array<{
  code: string;
  name: string;
  description: string;
  monthly: number | null;
  annual: number | null;
  sort: number;
  features: string[];
  limits: Record<string, number | null>;
}> = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Core financial visibility for small businesses.',
    monthly: 49,
    annual: 490,
    sort: 10,
    features: PLAN_FEATURE_TABLE.STARTER,
    limits: { MAX_COMPANIES: 1, MAX_BRANCHES: 5, MAX_USERS: 3, MAX_UPLOADS_PER_MONTH: 20, MAX_STORAGE_GB: 2, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    description: 'Advanced financial analytics and forecasting for growing companies.',
    monthly: 149,
    annual: 1490,
    sort: 20,
    features: PLAN_FEATURE_TABLE.PROFESSIONAL,
    limits: { MAX_COMPANIES: 3, MAX_BRANCHES: 25, MAX_USERS: 10, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 10, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'Full financial intelligence for multi-company and multi-branch organizations.',
    monthly: 399,
    annual: 3990,
    sort: 30,
    features: PLAN_FEATURE_TABLE.BUSINESS,
    limits: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 500, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Custom enterprise financial intelligence, scale and controls.',
    monthly: null,
    annual: null,
    sort: 40,
    features: PLAN_FEATURE_TABLE.ENTERPRISE,
    limits: { MAX_COMPANIES: null, MAX_BRANCHES: null, MAX_USERS: null, MAX_UPLOADS_PER_MONTH: null, MAX_STORAGE_GB: null, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
];

export const plans: Plan[] = PLAN_SEED.map((p) => ({
  id: `plan-${p.code.toLowerCase()}`,
  code: p.code,
  name: p.name,
  description: p.description,
  monthlyPrice: p.monthly,
  annualPrice: p.annual,
  currency: 'USD',
  status: 'ACTIVE',
  sortOrder: p.sort,
  features: ALL_FEATURES.map((key) => ({
    featureKey: key,
    enabled: p.features.includes(key),
    limitValue: p.limits[key] ?? null,
  })),
  limits: { ...p.limits },
  createdAt: '2025-01-05T09:00:00.000Z',
  customersCount: 0,
}));

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface DbCustomer extends Customer {
  planId: string | null;
  overrides: FeatureOverride[];
  companies: Company[];
  users: CustomerUser[];
  subscriptions: Subscription[];
  events: SubscriptionEvent[];
  payments: Payment[];
}

export const db = {
  customers: [] as DbCustomer[],
  platformUsers: [] as PlatformUser[],
  audit: [] as AuditEvent[],
};

export function audit(
  actor: string,
  platformRole: PlatformRole | null,
  customerId: string | null,
  customerName: string | null,
  action: string,
  entityType: AuditEntityType,
  entityId: string,
  entityLabel: string,
  metadataSummary: string | null,
) {
  db.audit.unshift({
    id: nextId('audit'),
    timestamp: nowIso(),
    actor,
    platformRole,
    customerId,
    customerName,
    action,
    entityType,
    entityId,
    entityLabel,
    metadataSummary,
  });
}

// ---------------------------------------------------------------------------
// Seed customers
// ---------------------------------------------------------------------------

interface SeedSpec {
  code: string;
  name: string;
  legalName: string | null;
  email: string;
  phone: string;
  country: string;
  timezone: string;
  currency: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  plan: string;
  subStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  startsDaysAgo: number;
  expiryOffsetDays: number; // relative to today; negative = already expired
  graceDays: number | null;
  agreedPrice: number;
  companies: Array<{ name: string; currency: string; branches: number; inactive?: boolean }>;
  users: Array<{
    first: string;
    last: string;
    role: string;
    membership: MembershipStatus;
    active?: boolean;
    lastLoginDaysAgo?: number | null;
  }>;
  payments: Array<{ daysAgo: number; amount: number; method: PaymentMethod; status: PaymentStatus; ref: string }>;
  overrides: Array<{ featureKey: string; enabled: boolean; limitValue?: number | null; notes?: string | null }>;
  createdAtDaysAgo: number;
}

export const CUSTOMER_ROLES = ['OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER', 'APPROVER'];

const SEED: SeedSpec[] = [
  {
    code: 'CUS-1001',
    name: 'Acme Corporation',
    legalName: 'Acme Corporation LLC',
    email: 'owner@acme.demo',
    phone: '+1 202 555 0141',
    country: 'US',
    timezone: 'America/New_York',
    currency: 'USD',
    status: 'ACTIVE',
    plan: 'BUSINESS',
    subStatus: 'ACTIVE',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 320,
    expiryOffsetDays: 45,
    graceDays: null,
    agreedPrice: 299,
    companies: [
      { name: 'Acme Holding', currency: 'USD', branches: 6 },
      { name: 'Acme Retail', currency: 'USD', branches: 4 },
      { name: 'Acme Logistics', currency: 'USD', branches: 2, inactive: true },
    ],
    users: [
      { first: 'Alice', last: 'Morgan', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Bob', last: 'Chen', role: 'FINANCE_MANAGER', membership: 'ACTIVE', lastLoginDaysAgo: 2 },
      { first: 'Carol', last: 'Nguyen', role: 'ACCOUNTANT', membership: 'ACTIVE', lastLoginDaysAgo: 5 },
      { first: 'Dan', last: 'Silva', role: 'VIEWER', membership: 'INVITED', active: true, lastLoginDaysAgo: null },
    ],
    payments: [
      { daysAgo: 5, amount: 299, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-8841' },
      { daysAgo: 38, amount: 299, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-8612' },
      { daysAgo: 70, amount: 299, method: 'MANUAL', status: 'PAID', ref: 'INV-8390' },
    ],
    overrides: [
      { featureKey: 'MULTI_CURRENCY', enabled: true, notes: 'Negotiated — allowed as part of 2026 renewal.' },
      { featureKey: 'AI_ADVISOR', enabled: false, notes: 'Explicitly disabled by customer request.' },
    ],
    createdAtDaysAgo: 320,
  },
  {
    code: 'CUS-1002',
    name: 'Blue Horizon Trading',
    legalName: 'Blue Horizon Trading FZE',
    email: 'owner@bluehorizon.demo',
    phone: '+971 4 555 0188',
    country: 'AE',
    timezone: 'Asia/Dubai',
    currency: 'USD',
    status: 'ACTIVE',
    plan: 'PROFESSIONAL',
    subStatus: 'ACTIVE',
    billingCycle: 'ANNUAL',
    startsDaysAgo: 300,
    expiryOffsetDays: 5,
    graceDays: 10,
    agreedPrice: 2400,
    companies: [{ name: 'Blue Horizon Trading', currency: 'USD', branches: 3 }],
    users: [
      { first: 'Elena', last: 'Kovacs', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 1 },
      { first: 'Faisal', last: 'Rahman', role: 'FINANCE_MANAGER', membership: 'ACTIVE', lastLoginDaysAgo: 3 },
    ],
    payments: [
      { daysAgo: 300, amount: 2400, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-7012' },
      { daysAgo: 6, amount: 2400, method: 'BANK_TRANSFER', status: 'PENDING', ref: 'INV-9430' },
    ],
    overrides: [],
    createdAtDaysAgo: 300,
  },
  {
    code: 'CUS-1003',
    name: 'Crescent Group',
    legalName: null,
    email: 'owner@crescent.demo',
    phone: '+966 11 555 0177',
    country: 'SA',
    timezone: 'Asia/Riyadh',
    currency: 'SAR',
    status: 'ACTIVE',
    plan: 'STARTER',
    subStatus: 'TRIAL',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 12,
    expiryOffsetDays: 9,
    graceDays: null,
    agreedPrice: 0,
    companies: [{ name: 'Crescent Group', currency: 'SAR', branches: 1 }],
    users: [
      { first: 'Ghada', last: 'Al-Saud', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Hassan', last: 'Farouk', role: 'ACCOUNTANT', membership: 'ACTIVE', lastLoginDaysAgo: 4 },
    ],
    payments: [],
    overrides: [],
    createdAtDaysAgo: 12,
  },
  {
    code: 'CUS-1004',
    name: 'Delta Logistics',
    legalName: 'Delta Logistics GmbH',
    email: 'owner@delta.demo',
    phone: '+49 30 555 0166',
    country: 'DE',
    timezone: 'Europe/Berlin',
    currency: 'EUR',
    status: 'ACTIVE',
    plan: 'BUSINESS',
    subStatus: 'PAST_DUE',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 240,
    expiryOffsetDays: -3,
    graceDays: 14,
    agreedPrice: 380,
    companies: [
      { name: 'Delta Logistics Berlin', currency: 'EUR', branches: 5 },
      { name: 'Delta Freight', currency: 'EUR', branches: 3 },
    ],
    users: [
      { first: 'Ingrid', last: 'Weber', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Jan', last: 'Visser', role: 'FINANCE_MANAGER', membership: 'SUSPENDED', active: true, lastLoginDaysAgo: 12 },
    ],
    payments: [
      { daysAgo: 10, amount: 380, method: 'BANK_TRANSFER', status: 'PENDING', ref: 'INV-9201' },
      { daysAgo: 40, amount: 380, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-8933' },
    ],
    overrides: [],
    createdAtDaysAgo: 240,
  },
  {
    code: 'CUS-1005',
    name: 'Evergreen Retail',
    legalName: null,
    email: 'owner@evergreen.demo',
    phone: '+44 20 555 0155',
    country: 'GB',
    timezone: 'Europe/London',
    currency: 'GBP',
    status: 'ACTIVE',
    plan: 'PROFESSIONAL',
    subStatus: 'EXPIRED',
    billingCycle: 'ANNUAL',
    startsDaysAgo: 400,
    expiryOffsetDays: -20,
    graceDays: null,
    agreedPrice: 2100,
    companies: [{ name: 'Evergreen Retail', currency: 'GBP', branches: 4 }],
    users: [
      { first: 'Katherine', last: 'Lane', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
    ],
    payments: [{ daysAgo: 400, amount: 2100, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-6604' }],
    overrides: [],
    createdAtDaysAgo: 400,
  },
  {
    code: 'CUS-1006',
    name: 'Falcon Media',
    legalName: 'Falcon Media Group SA',
    email: 'owner@falcon.demo',
    phone: '+41 44 555 0144',
    country: 'CH',
    timezone: 'Europe/Zurich',
    currency: 'CHF',
    status: 'ACTIVE',
    plan: 'ENTERPRISE',
    subStatus: 'ACTIVE',
    billingCycle: 'ANNUAL',
    startsDaysAgo: 500,
    expiryOffsetDays: 730,
    graceDays: null,
    agreedPrice: 6400,
    companies: [
      { name: 'Falcon Studios', currency: 'CHF', branches: 8 },
      { name: 'Falcon Distribution', currency: 'CHF', branches: 5 },
      { name: 'Falcon Digital', currency: 'CHF', branches: 3 },
    ],
    users: [
      { first: 'Luca', last: 'Rossi', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Maria', last: 'Soto', role: 'FINANCE_MANAGER', membership: 'ACTIVE', lastLoginDaysAgo: 1 },
      { first: 'Nadia', last: 'Haddad', role: 'ACCOUNTANT', membership: 'ACTIVE', lastLoginDaysAgo: 6 },
      { first: 'Omar', last: 'Khan', role: 'APPROVER', membership: 'ACTIVE', lastLoginDaysAgo: 9 },
      { first: 'Paula', last: 'Meyer', role: 'ACCOUNTANT', membership: 'DISABLED', active: false, lastLoginDaysAgo: 60 },
    ],
    payments: [
      { daysAgo: 60, amount: 6400, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-9107' },
      { daysAgo: 30, amount: 6400, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-9268' },
    ],
    overrides: [{ featureKey: 'API_ACCESS', enabled: true, limitValue: null, notes: 'Enterprise contract includes API.' }],
    createdAtDaysAgo: 500,
  },
  {
    code: 'CUS-1007',
    name: 'Global Foods',
    legalName: 'Global Foods Co.',
    email: 'owner@globalfoods.demo',
    phone: '+966 12 555 0133',
    country: 'SA',
    timezone: 'Asia/Riyadh',
    currency: 'SAR',
    status: 'ACTIVE',
    plan: 'BUSINESS',
    subStatus: 'ACTIVE',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 180,
    expiryOffsetDays: 120,
    graceDays: null,
    agreedPrice: 4500,
    companies: [
      { name: 'Global Foods KSA', currency: 'SAR', branches: 9 },
      { name: 'Global Foods UAE', currency: 'AED', branches: 4 },
    ],
    users: [
      { first: 'Rania', last: 'Mansour', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Sami', last: 'Nasser', role: 'FINANCE_MANAGER', membership: 'ACTIVE', lastLoginDaysAgo: 2 },
      { first: 'Tariq', last: 'Odeh', role: 'ACCOUNTANT', membership: 'ACTIVE', lastLoginDaysAgo: 8 },
    ],
    payments: [
      { daysAgo: 3, amount: 4500, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-9512' },
      { daysAgo: 34, amount: 4500, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-9344' },
    ],
    overrides: [],
    createdAtDaysAgo: 180,
  },
  {
    code: 'CUS-1008',
    name: 'Halo Consulting',
    legalName: 'Halo Consulting Partners',
    email: 'owner@halo.demo',
    phone: '+1 415 555 0122',
    country: 'US',
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    status: 'SUSPENDED',
    plan: 'BUSINESS',
    subStatus: 'SUSPENDED',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 210,
    expiryOffsetDays: 60,
    graceDays: null,
    agreedPrice: 399,
    companies: [{ name: 'Halo Consulting', currency: 'USD', branches: 2 }],
    users: [
      { first: 'Uma', last: 'Patel', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Victor', last: 'Brown', role: 'FINANCE_MANAGER', membership: 'ACTIVE', lastLoginDaysAgo: 15 },
    ],
    payments: [{ daysAgo: 90, amount: 399, method: 'CASH', status: 'PAID', ref: 'INV-8002' }],
    overrides: [],
    createdAtDaysAgo: 210,
  },
  {
    code: 'CUS-1009',
    name: 'Ironclad Manufacturing',
    legalName: 'Ironclad Manufacturing Inc.',
    email: 'owner@ironclad.demo',
    phone: '+1 313 555 0111',
    country: 'US',
    timezone: 'America/Detroit',
    currency: 'USD',
    status: 'ACTIVE',
    plan: 'BUSINESS',
    subStatus: 'ACTIVE',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 150,
    expiryOffsetDays: 25,
    graceDays: null,
    agreedPrice: 399,
    companies: [
      { name: 'Ironclad Plant 1', currency: 'USD', branches: 3 },
      { name: 'Ironclad Plant 2', currency: 'USD', branches: 2 },
    ],
    users: [
      { first: 'Walter', last: 'Grant', role: 'OWNER', membership: 'ACTIVE', lastLoginDaysAgo: 0 },
      { first: 'Xena', last: 'Liu', role: 'ACCOUNTANT', membership: 'ACTIVE', lastLoginDaysAgo: 3 },
    ],
    payments: [{ daysAgo: 15, amount: 399, method: 'BANK_TRANSFER', status: 'PAID', ref: 'INV-9380' }],
    overrides: [],
    createdAtDaysAgo: 150,
  },
  {
    code: 'CUS-1010',
    name: 'Jade Ventures',
    legalName: null,
    email: 'owner@jade.demo',
    phone: '+65 65 555 0100',
    country: 'SG',
    timezone: 'Asia/Singapore',
    currency: 'SGD',
    status: 'CANCELLED',
    plan: 'PROFESSIONAL',
    subStatus: 'CANCELLED',
    billingCycle: 'MONTHLY',
    startsDaysAgo: 500,
    expiryOffsetDays: -60,
    graceDays: null,
    agreedPrice: 249,
    companies: [{ name: 'Jade Ventures', currency: 'SGD', branches: 2 }],
    users: [{ first: 'Yuki', last: 'Tanaka', role: 'OWNER', membership: 'DISABLED', active: false, lastLoginDaysAgo: 90 }],
    payments: [{ daysAgo: 200, amount: 249, method: 'MANUAL', status: 'PAID', ref: 'INV-7401' }],
    overrides: [],
    createdAtDaysAgo: 500,
  },
];

function buildCustomer(spec: SeedSpec, index: number): DbCustomer {
  const t = today();
  const start = addDays(t, -spec.startsDaysAgo);
  const expiry = addDays(t, spec.expiryOffsetDays);
  const plan = plans.find((p) => p.code === spec.plan)!;
  const customerId = `cust-${1000 + index + 1}`;
  const subId = `sub-${1000 + index + 1}`;

  const subscription: Subscription & { lockVersion: number } = {
    id: subId,
    customerId,
    customerName: spec.name,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    status: spec.subStatus,
    billingCycle: spec.billingCycle,
    startDate: start,
    expiresAt: expiry,
    gracePeriodUntil: spec.graceDays ? addDays(expiry, spec.graceDays) : null,
    agreedPrice: spec.agreedPrice,
    currency: spec.currency,
    createdAt: addDays(t, -spec.startsDaysAgo) + 'T08:00:00.000Z',
    lockVersion: 1,
  };

  const companies: Company[] = spec.companies.map((c, ci) => ({
    id: `${customerId}-co-${ci + 1}`,
    customerId,
    name: c.name,
    legalName: c.name,
    baseCurrency: c.currency,
    status: c.inactive ? 'INACTIVE' : 'ACTIVE',
    branches: c.branches,
    users: 0,
    createdAt: addDays(t, -spec.startsDaysAgo + ci * 10) + 'T08:00:00.000Z',
  }));

  const users: CustomerUser[] = spec.users.map((u, ui) => ({
    id: `${customerId}-u-${ui + 1}`,
    customerId,
    firstName: u.first,
    lastName: u.last,
    // the owner signs in with the customer email (matches demo hints on the login page)
    email: ui === 0 ? spec.email : `${u.first.toLowerCase()}.${u.last.toLowerCase()}@${spec.code.split('-')[1]}.demo`,
    phone: null,
    customerRole: u.role,
    membershipStatus: u.membership,
    isActive: u.active ?? u.membership === 'ACTIVE',
    companyIds: companies.slice(0, Math.min(ui + 1, companies.length)).map((c) => c.id),
    lastLoginAt: u.lastLoginDaysAgo == null ? null : addDays(t, -u.lastLoginDaysAgo) + 'T09:30:00.000Z',
    createdAt: addDays(t, -spec.startsDaysAgo) + 'T08:00:00.000Z',
  }));

  const payments: Payment[] = spec.payments.map((p, pi) => ({
    id: `${customerId}-pay-${pi + 1}`,
    customerId,
    customerName: spec.name,
    subscriptionId: subId,
    amount: p.amount,
    currency: spec.currency,
    paymentDate: addDays(t, -p.daysAgo),
    method: p.method,
    status: p.status,
    referenceNumber: p.ref,
    receiptNumber: `RCP-${1000 + pi}`,
    periodFrom: addDays(t, -p.daysAgo),
    periodTo: addDays(t, -p.daysAgo + 30),
    recordedBy: 'admin@vcfo.dev',
    notes: null,
    createdAt: addDays(t, -p.daysAgo) + 'T10:00:00.000Z',
  }));

  const overrides: FeatureOverride[] = spec.overrides.map((o) => ({
    featureKey: o.featureKey,
    enabled: o.enabled,
    limitValue: o.limitValue ?? null,
    notes: o.notes ?? null,
    updatedBy: 'admin@vcfo.dev',
    updatedAt: addDays(t, -20) + 'T12:00:00.000Z',
  }));

  // Resolve effective expiry for history events
  const events: SubscriptionEvent[] = [
    {
      id: `${subId}-ev-1`,
      subscriptionId: subId,
      customerId,
      eventType: 'CREATED',
      previousValue: null,
      newValue: `${plan.code} (${spec.billingCycle})`,
      performedBy: 'admin@vcfo.dev',
      date: addDays(t, -spec.startsDaysAgo) + 'T08:00:00.000Z',
      notes: 'Subscription created.',
    },
    {
      id: `${subId}-ev-2`,
      subscriptionId: subId,
      customerId,
      eventType: 'ACTIVATED',
      previousValue: null,
      newValue: spec.subStatus === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
      performedBy: 'admin@vcfo.dev',
      date: addDays(t, -spec.startsDaysAgo) + 'T08:05:00.000Z',
      notes: 'Customer activated.',
    },
  ];

  if (spec.subStatus === 'PAST_DUE') {
    events.push({
      id: `${subId}-ev-3`,
      subscriptionId: subId,
      customerId,
      eventType: 'ACTIVATED',
      previousValue: 'ACTIVE',
      newValue: 'PAST_DUE',
      performedBy: 'system',
      date: expiry + 'T00:00:00.000Z',
      notes: 'Payment period elapsed.',
    });
  }

  const customer: Customer = {
    id: customerId,
    code: spec.code,
    name: spec.name,
    legalName: spec.legalName,
    email: spec.email,
    phone: spec.phone,
    country: spec.country,
    timezone: spec.timezone,
    defaultCurrency: spec.currency,
    status: spec.status,
    planId: plan.id,
    planCode: plan.code,
    subscriptionStatus: spec.subStatus,
    subscriptionStart: start,
    expiryDate: expiry,
    agreedPrice: spec.agreedPrice,
    currency: spec.currency,
    lastPaymentAt: payments.find((p) => p.status === 'PAID')?.paymentDate ?? null,
    createdAt: addDays(t, -spec.startsDaysAgo) + 'T08:00:00.000Z',
    stats: {
      companies: companies.filter((c) => c.status === 'ACTIVE').length,
      branches: companies.reduce((s, c) => s + c.branches, 0),
      users: users.filter((u) => u.isActive).length,
    },
  };

  // link companies/users counts
  for (const c of companies) {
    c.users = users.filter((u) => u.companyIds.includes(c.id) && u.isActive).length;
  }

  return { ...customer, planId: plan.id, overrides, companies, users, subscriptions: [subscription], events, payments };
}

export function seed() {
  if (db.customers.length > 0) return;
  SEED.forEach((spec, i) => {
    const c = buildCustomer(spec, i);
    db.customers.push(c);
    // seed audit trail
    audit(
      'admin@vcfo.dev',
      'SUPER_ADMIN',
      c.id,
      c.name,
      'CUSTOMER_CREATED',
      'CUSTOMER',
      c.id,
      c.name,
      `Plan ${c.planCode}, ${c.currency} ${c.agreedPrice}`,
    );
    audit(
      'admin@vcfo.dev',
      'SUPER_ADMIN',
      c.id,
      c.name,
      'SUBSCRIPTION_ACTIVATED',
      'SUBSCRIPTION',
      c.subscriptions[0].id,
      c.planCode!,
      null,
    );
    for (const p of c.payments) {
      audit('admin@vcfo.dev', 'SUPER_ADMIN', c.id, c.name, 'PAYMENT_RECORDED', 'PAYMENT', p.id, p.referenceNumber ?? p.id, `${p.amount} ${p.currency}`);
    }
    for (const o of c.overrides) {
      audit('admin@vcfo.dev', 'SUPER_ADMIN', c.id, c.name, 'FEATURE_OVERRIDE_CHANGED', 'FEATURE', o.featureKey, o.featureKey, `${o.enabled ? 'Enabled' : 'Disabled'}`);
    }
  });

  db.platformUsers.push(
    { id: 'pu-1', firstName: 'Admin', lastName: 'VCFO', email: 'admin@vcfo.dev', platformRole: 'SUPER_ADMIN', isActive: true, lastLoginAt: today() + 'T08:00:00.000Z', createdAt: '2025-01-01T08:00:00.000Z' },
    { id: 'pu-2', firstName: 'Sarah', lastName: 'Ops', email: 'ops@vcfo.dev', platformRole: 'SAAS_ADMIN', isActive: true, lastLoginAt: addDays(today(), -1) + 'T08:00:00.000Z', createdAt: '2025-02-01T08:00:00.000Z' },
    { id: 'pu-3', firstName: 'Mona', lastName: 'Billing', email: 'billing@vcfo.dev', platformRole: 'BILLING_ADMIN', isActive: true, lastLoginAt: addDays(today(), -2) + 'T08:00:00.000Z', createdAt: '2025-03-01T08:00:00.000Z' },
    { id: 'pu-4', firstName: 'Tarek', lastName: 'Support', email: 'support@vcfo.dev', platformRole: 'SUPPORT', isActive: true, lastLoginAt: addDays(today(), -1) + 'T14:00:00.000Z', createdAt: '2025-04-01T08:00:00.000Z' },
  );
}

export function refreshStats(c: DbCustomer) {
  const plan = c.planId ? plans.find((p) => p.id === c.planId) : null;
  const sub = c.subscriptions[0] ?? null;
  c.planCode = plan?.code ?? null;
  c.subscriptionStatus = sub?.status ?? null;
  c.subscriptionStart = sub?.startDate ?? null;
  c.expiryDate = sub?.expiresAt ?? null;
  c.agreedPrice = sub?.agreedPrice ?? null;
  c.currency = sub?.currency ?? c.defaultCurrency;
  const activeCompanies = c.companies.filter((x) => x.status === 'ACTIVE');
  c.stats = {
    companies: activeCompanies.length,
    branches: activeCompanies.reduce((s, x) => s + x.branches, 0),
    users: c.users.filter((u) => u.isActive && u.membershipStatus !== 'DISABLED').length,
  };
}

