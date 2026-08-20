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
 *
 * Mock/dev sign-in is Super Admin only — it must open the SaaS console, not
 * the customer Financial Truth workspace.
 */
const SESSION = {
  user: { id: 'pu-1', email: 'admin@vcfo.dev', firstName: 'Admin', lastName: 'VCFO', phone: null, isActive: true, isSuperAdmin: true, platformRole: 'SUPER_ADMIN' as const },
  customers: [],
  tenant: null,
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
        return envelope({ accessToken: 'mock.pu-1', user: SESSION.user });
      }
      if (url.endsWith('/api/v1/auth/session')) return envelope(SESSION);
      if (url.includes('/i18n/languages')) return envelope([{ code: 'en', direction: 'ltr' }]);
      if (url.includes('/i18n/catalog')) return envelope({ language: 'en', direction: 'ltr', catalog: {} });
      if (url.includes('/api/v1/admin/overview')) {
        return envelope({
          customers: { total: 3, active: 2, suspended: 1 },
          subscriptions: { trial: 1, active: 2, pastDue: 0, expired: 0, expiringIn7Days: 0, expiringIn30Days: 1 },
          paymentsThisMonth: { count: 1, amount: '299' },
          mrr: 299,
          arr: 3588,
          planDistribution: [],
          growth: [],
        });
      }
      return envelope({});
    }),
  );
});

describe('app smoke', () => {
  it('logs in as Super Admin and renders the SaaS console without a hook-order crash', async () => {
    window.history.pushState({}, '', '/login');
    const errors: unknown[] = [];
    const onError = window.onerror;
    window.onerror = (msg) => {
      errors.push(msg);
      return false;
    };
    render(<App />);

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@vcfo.dev');
    await userEvent.type(screen.getByLabelText(/password/i), 'admin123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('navigation', { name: /admin navigation/i })).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getAllByText(/overview/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/what needs attention on the vcfo platform/i)).toBeInTheDocument();
    expect(screen.queryByText(/financial truth/i)).not.toBeInTheDocument();
    expect(errors.filter((e) => String(e).includes('hooks'))).toHaveLength(0);
    window.onerror = onError;
  });
});
