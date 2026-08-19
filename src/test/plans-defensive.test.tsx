import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import type { SessionPayload } from '../api/types';

vi.mock('../api/services', () => ({
  saasAdminApi: {
    getPlans: vi.fn(() =>
      Promise.resolve([
        // Malformed plan from a real backend: missing limits / features arrays.
        { id: 'plan-1', code: 'LEGACY', name: 'Legacy', description: '', monthlyPrice: 0, annualPrice: 0, currency: 'USD', status: 'ACTIVE', sortOrder: 1, createdAt: '2026-01-01' },
      ]),
    ),
    getFeatures: vi.fn(() => Promise.resolve([])),
    getCustomers: vi.fn(() => Promise.resolve({ items: [], total: 0, page: 1, pageSize: 10 })),
  },
}));

import { PlansPage } from '../features/saas-admin/pages/PlansPage';

const ADMIN_SESSION: SessionPayload = {
  user: { id: 'pu1', email: 'admin@vcfo.dev', firstName: 'Admin', lastName: 'VCFO', phone: null, isActive: true, isSuperAdmin: true, platformRole: 'SUPER_ADMIN' },
  customers: [],
  tenant: null,
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

describe('PlansPage defensive rendering', () => {
  it('renders the matrix when a plan has no limits/features (null/undefined)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['session'], ADMIN_SESSION);

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <PlansPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText(/Legacy/i)).length).toBeGreaterThan(0);
    // quota row renders without crashing; empty limits -> nothing to show
    expect(screen.getAllByText(/Quotas/i).length).toBeGreaterThan(0);
  });
});
