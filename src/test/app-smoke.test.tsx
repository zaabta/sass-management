import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import i18n from '../i18n';

/**
 * Regression test for the SessionGate hook-order crash:
 * "Rendered more hooks than during the previous render" happened because a
 * useEffect was placed after early returns — when the session query resolved,
 * the hook order changed. This test drives the real login → session flow.
 */
const SESSION = {
  user: { id: 'u1', email: 'owner@acme.demo', firstName: 'Alice', lastName: 'Morgan', phone: null, isActive: true, isSuperAdmin: false, platformRole: null },
  customers: [{ id: 'c1', name: 'Acme', status: 'ACTIVE', role: 'OWNER', membershipStatus: 'ACTIVE', plan: 'BUSINESS', subscriptionStatus: 'ACTIVE', expiresAt: '2027-08-17' }],
  tenant: {
    customerId: 'c1',
    companyId: 'co1',
    customerStatus: 'ACTIVE' as const,
    customerRole: 'OWNER',
    subscription: { status: 'ACTIVE', plan: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY', startDate: '2026-01-01', expiresAt: '2027-08-17', gracePeriodUntil: null, agreedPrice: 299, currency: 'USD' },
    features: { DASHBOARD: { enabled: true, limitValue: null } },
    limits: { MAX_COMPANIES: 10, MAX_BRANCHES: 100, MAX_USERS: 30, MAX_UPLOADS_PER_MONTH: 100, MAX_STORAGE_GB: 50, MAX_AI_REQUESTS_PER_MONTH: 0 },
  },
};

function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/login')) {
        return envelope({ accessToken: 'mock.test', user: SESSION.user });
      }
      if (url.endsWith('/api/v1/auth/session')) return envelope(SESSION);
      if (url.includes('/i18n/languages')) return envelope([{ code: 'en', direction: 'ltr' }]);
      if (url.includes('/i18n/catalog')) return envelope({ language: 'en', direction: 'ltr', catalog: {} });
      if (url.endsWith('/api/v1/companies')) {
        return envelope([{ id: 'co1', name: 'Acme Holding', legalName: null, baseCurrency: 'USD', branches: 6, users: 4, createdAt: '2026-01-01' }]);
      }
      if (url.endsWith('/api/v1/dashboard')) {
        return envelope({
          company: { id: 'co1', name: 'Acme Holding', baseCurrency: 'USD' },
          period: { label: 'Aug 26', previousLabel: 'Jul 26' },
          integrity: { status: 'passed', failed: false, issues: [] },
          kpis: [],
          trend: [],
          targets_available: false,
          statements_available: true,
        });
      }
      return envelope({});
    }),
  );
});

describe('app smoke', () => {
  it('logs in and renders the dashboard without a hook-order crash', async () => {
  window.history.pushState({}, '', '/login');
  const errors: unknown[] = [];
  const onError = window.onerror;
  window.onerror = (msg) => {
    errors.push(msg);
    return false;
  };
  render(<App />);

  await userEvent.type(screen.getByLabelText(/email/i), 'owner@acme.demo');
  await userEvent.type(screen.getByLabelText(/password/i), 'demo1234');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => expect(screen.getByText(/financial truth/i)).toBeInTheDocument(), { timeout: 6000 });
  expect(errors.filter((e) => String(e).includes('hooks'))).toHaveLength(0);
  window.onerror = onError;
});
});
