/**
 * Tenant-safe TanStack Query keys (spec §55).
 */
export const queryKeys = {
  session: ['session'] as const,
  me: ['me'] as const,

  customer: {
    dashboard: ['customer', 'dashboard'] as const,
    uploads: ['customer', 'uploads'] as const,
  },

  saasAdmin: {
    overview: ['saas-admin', 'overview'] as const,
    customers: (filters: Record<string, unknown>) => ['saas-admin', 'customers', filters] as const,
    customer: (id: string) => ['saas-admin', 'customer', id] as const,
    customerCompanies: (id: string) => ['saas-admin', 'customer', id, 'companies'] as const,
    customerUsers: (id: string) => ['saas-admin', 'customer', id, 'users'] as const,
    subscription: (id: string) => ['saas-admin', 'customer', id, 'subscription'] as const,
    subscriptionHistory: (id: string) => ['saas-admin', 'customer', id, 'subscription-history'] as const,
    features: (id: string) => ['saas-admin', 'customer', id, 'features'] as const,
    usage: (id: string) => ['saas-admin', 'customer', id, 'usage'] as const,
    customerPayments: (id: string) => ['saas-admin', 'customer', id, 'payments'] as const,
    subscriptions: (filters: Record<string, unknown>) => ['saas-admin', 'subscriptions', filters] as const,
    payments: (filters: Record<string, unknown>) => ['saas-admin', 'payments', filters] as const,
    plans: ['saas-admin', 'plans'] as const,
    featuresRegistry: ['saas-admin', 'features'] as const,
    users: (filters: Record<string, unknown>) => ['saas-admin', 'users', filters] as const,
    platformUsers: ['saas-admin', 'platform-users'] as const,
    audit: (filters: Record<string, unknown>) => ['saas-admin', 'audit', filters] as const,
  },
};

/** Invalidate everything derived from a customer's commercial state. */
export const invalidateCustomer = (queryClient: import('@tanstack/react-query').QueryClient, customerId: string) => {
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'customer', customerId] });
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'customers'] });
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'subscriptions'] });
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'overview'] });
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'payments'] });
  queryClient.invalidateQueries({ queryKey: ['saas-admin', 'audit'] });
};
