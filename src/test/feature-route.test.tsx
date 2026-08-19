import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import type { SessionPayload } from '../api/types';

vi.mock('../api/services', () => ({
  authApi: { session: vi.fn(), login: vi.fn() },
}));

import { useSessionData } from '../hooks/useSession';
import { FeatureRoute } from '../components/FeatureRoute';

const ACTIVE_SESSION: SessionPayload = {
  user: { id: 'u1', email: 'owner@acme.demo', firstName: 'Alice', lastName: 'Morgan', phone: null, isActive: true, isSuperAdmin: false, platformRole: null },
  customers: [{ id: 'c1', name: 'Acme', status: 'ACTIVE', role: 'OWNER', membershipStatus: 'ACTIVE', plan: 'BUSINESS', subscriptionStatus: 'ACTIVE', expiresAt: '2027-08-17' }],
  tenant: {
    customerId: 'c1',
    companyId: 'co1',
    customerStatus: 'ACTIVE',
    customerRole: 'OWNER',
    subscription: { status: 'ACTIVE', plan: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY', startDate: '2026-01-01', expiresAt: '2027-08-17', gracePeriodUntil: null, agreedPrice: 299, currency: 'USD' },
    features: {
      FORECAST: { enabled: true, limitValue: null },
      SCENARIO: { enabled: false, limitValue: null },
    },
    limits: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
};

function makeSession(overrides: Partial<NonNullable<SessionPayload['tenant']>> & { subStatus?: NonNullable<SessionPayload['tenant']>['subscription']['status']; customerStatus?: NonNullable<SessionPayload['tenant']>['customerStatus'] }): SessionPayload {
  const baseTenant = ACTIVE_SESSION.tenant!;
  return {
    ...ACTIVE_SESSION,
    tenant: {
      ...baseTenant,
      customerStatus: overrides.customerStatus ?? baseTenant.customerStatus,
      subscription: { ...baseTenant.subscription, status: overrides.subStatus ?? baseTenant.subscription.status },
      features: overrides.features ?? baseTenant.features,
    },
  };
}

function renderWithSession(session: SessionPayload | null, ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  qc.setQueryData(['session'], session);
  const Hooks = () => {
    // force the hook to read from the cache
    const s = useSessionData();
    return s ? ui : <div>no-session</div>;
  };
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Hooks />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('FeatureRoute (spec §5, §66, §71)', () => {
  it('renders children when the feature is enabled', () => {
    renderWithSession(ACTIVE_SESSION, (
      <FeatureRoute feature="FORECAST">
        <div>ForecastPage</div>
      </FeatureRoute>
    ));
    expect(screen.getByText('ForecastPage')).toBeInTheDocument();
  });

  it('blocks the page UX when the feature is not included', () => {
    renderWithSession(ACTIVE_SESSION, (
      <FeatureRoute feature="SCENARIO">
        <div>ScenarioPage</div>
      </FeatureRoute>
    ));
    expect(screen.queryByText('ScenarioPage')).not.toBeInTheDocument();
    expect(screen.getByText(/not included in your current subscription/i)).toBeInTheDocument();
  });

  it('shows the expired subscription panel for expired tenants (spec §7, §75)', () => {
    const expired = makeSession({ subStatus: 'EXPIRED' });
    renderWithSession(expired, (
      <FeatureRoute feature="DASHBOARD">
        <div>DashboardPage</div>
      </FeatureRoute>
    ));
    expect(screen.queryByText('DashboardPage')).not.toBeInTheDocument();
    expect(screen.getAllByText(/expired/i).length).toBeGreaterThan(0);
  });

  it('shows suspended panel for suspended subscriptions', () => {
    renderWithSession(makeSession({ subStatus: 'SUSPENDED' }), (
      <FeatureRoute feature="ANALYTICS">
        <div>AnalyticsPage</div>
      </FeatureRoute>
    ));
    expect(screen.queryByText('AnalyticsPage')).not.toBeInTheDocument();
    expect(screen.getAllByText(/suspended/i).length).toBeGreaterThan(0);
  });

  it('never renders raw backend codes to the user', () => {
    renderWithSession(makeSession({ subStatus: 'EXPIRED' }), (
      <FeatureRoute feature="FORECAST">
        <div>ForecastPage</div>
      </FeatureRoute>
    ));
    expect(screen.queryByText(/FEATURE_NOT_INCLUDED|SUBSCRIPTION_EXPIRED/)).not.toBeInTheDocument();
  });
});
