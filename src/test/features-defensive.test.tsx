import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import type { SessionPayload } from '../api/types';

// No module mocking: the real saasAdminApi.getFeatures normalizes whatever
// fetch returns. We serve the RAW real-BE feature shape (isActive only, no
// `status` field) to prove normalization + render survive.
import { FeaturesPage } from '../features/saas-admin/pages/FeaturesPage';

const ADMIN_SESSION: SessionPayload = {
  user: { id: 'pu1', email: 'admin@vcfo.dev', firstName: 'Admin', lastName: 'VCFO', phone: null, isActive: true, isSuperAdmin: true, platformRole: 'SUPER_ADMIN' },
  customers: [],
  tenant: null,
};

const RAW_FEATURES = [
  { id: 'f1', key: 'DASHBOARD', name: 'Dashboard', description: 'Executive dashboard snapshot', type: 'BOOLEAN', isActive: true },
  { id: 'f2', key: 'FORECAST', name: 'Forecast', description: 'Deterministic forecasting', type: 'BOOLEAN', isActive: false },
  { id: 'f3', key: 'AI_ADVISOR', name: 'AI Advisor', description: 'reserved', type: 'BOOLEAN' },
];

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
      if (url.endsWith('/api/v1/admin/features')) return envelope(RAW_FEATURES);
      return envelope({});
    }),
  );
});

describe('FeaturesPage defensive rendering (real backend shape)', () => {
  it('normalizes isActive-only features and renders without crashing', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['session'], ADMIN_SESSION);

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <FeaturesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText(/Dashboard/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Forecast/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AI Advisor/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      // isActive true -> ACTIVE pill; isActive false -> INACTIVE pill
      expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/inactive/i).length).toBeGreaterThan(0);
    });
  });
});
