import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import type { SessionPayload } from '../api/types';
import { FeatureRoute } from '../components/FeatureRoute';
import { SubscriptionBanner } from '../components/SubscriptionBanner';

const BASE: SessionPayload = {
  user: { id: 'u1', email: 'owner@acme.demo', firstName: 'Alice', lastName: 'Morgan', phone: null, isActive: true, isSuperAdmin: false, platformRole: null },
  customers: [],
  tenant: {
    customerId: 'c1',
    companyId: 'co1',
    customerStatus: 'ACTIVE',
    customerRole: 'OWNER',
    subscription: { status: 'ACTIVE', plan: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY', startDate: '2026-01-01', expiresAt: '2027-08-17', gracePeriodUntil: null, agreedPrice: 299, currency: 'USD' },
    features: { FORECAST: { enabled: true, limitValue: null } },
    limits: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
};

function renderWithSession(session: SessionPayload, ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['session'], session);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('FeatureRoute — per-state rendering', () => {
  it('renders children when feature enabled', () => {
    renderWithSession(BASE, (
      <FeatureRoute feature="FORECAST"><div>ForecastPage</div></FeatureRoute>
    ));
    expect(screen.getByText('ForecastPage')).toBeInTheDocument();
  });

  it('renders locked panel when feature not included', () => {
    renderWithSession(BASE, (
      <FeatureRoute feature="AI_ADVISOR"><div>AI</div></FeatureRoute>
    ));
    expect(screen.queryByText('AI')).not.toBeInTheDocument();
    expect(screen.getAllByText(/not included/i).length).toBeGreaterThan(0);
  });

  it('renders expired panel without throwing even with a weird expiresAt', () => {
    const expired = { ...BASE, tenant: { ...BASE.tenant!, subscription: { ...BASE.tenant!.subscription, status: 'EXPIRED' as const, expiresAt: 'garbage-date' } } };
    renderWithSession(expired, (
      <FeatureRoute feature="DASHBOARD"><div>Dash</div></FeatureRoute>
    ));
    expect(screen.queryByText('Dash')).not.toBeInTheDocument();
    expect(screen.getAllByText(/expired/i).length).toBeGreaterThan(0);
  });
});

describe('SubscriptionBanner — per-status rendering', () => {
  it('shows nothing for a normal ACTIVE subscription (far expiry)', () => {
    renderWithSession(BASE, <SubscriptionBanner />);
    expect(screen.queryByText(/expires|expired|suspended/i)).not.toBeInTheDocument();
  });

  it('shows the expired banner for EXPIRED status even with an invalid date', () => {
    const expired = { ...BASE, tenant: { ...BASE.tenant!, subscription: { ...BASE.tenant!.subscription, status: 'EXPIRED' as const, expiresAt: 'bad' } } };
    renderWithSession(expired, <SubscriptionBanner />);
    expect(screen.getAllByText(/expired/i).length).toBeGreaterThan(0);
  });

  it('shows the suspended banner for SUSPENDED', () => {
    const s = { ...BASE, tenant: { ...BASE.tenant!, subscription: { ...BASE.tenant!.subscription, status: 'SUSPENDED' as const } } };
    renderWithSession(s, <SubscriptionBanner />);
    expect(screen.getAllByText(/suspended/i).length).toBeGreaterThan(0);
  });
});
