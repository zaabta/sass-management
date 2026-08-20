import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, Spinner } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSession } from './hooks/useSession';
import { getToken, setCompanyId, setToken } from './api/client';
import { LoginPage } from './features/customer/pages/LoginPage';
import { CustomerLayout } from './features/customer/CustomerLayout';
import { DashboardPage } from './features/customer/pages/DashboardPage';
import { ModulePlaceholderPage } from './features/customer/pages/ModulePlaceholderPage';
import { UploadsPage } from './features/customer/pages/UploadsPage';
import { CompaniesPage, BranchesPage, UsersPage as CustomerUsersPage } from './features/customer/pages/WorkspacePages';
import { AccountPage } from './features/customer/pages/AccountPage';
import { SubscriptionPage } from './features/customer/pages/SubscriptionPage';
import { SupportPage } from './features/customer/pages/SupportPage';
import { AdminLayout } from './features/saas-admin/AdminLayout';
import { OverviewPage } from './features/saas-admin/pages/OverviewPage';
import { CustomersPage } from './features/saas-admin/pages/CustomersPage';
import { CustomerDetailPage } from './features/saas-admin/pages/CustomerDetailPage';
import { CreateCustomerPage } from './features/saas-admin/pages/CreateCustomerPage';
import { SubscriptionsPage } from './features/saas-admin/pages/SubscriptionsPage';
import { PlansPage } from './features/saas-admin/pages/PlansPage';
import { FeaturesPage } from './features/saas-admin/pages/FeaturesPage';
import { PaymentsPage } from './features/saas-admin/pages/PaymentsPage';
import { UsersPage } from './features/saas-admin/pages/UsersPage';
import { PlatformUsersPage } from './features/saas-admin/pages/PlatformUsersPage';
import { AuditPage } from './features/saas-admin/pages/AuditPage';
import { CompaniesPage as AdminCompaniesPage } from './features/saas-admin/pages/CompaniesPage';
import { BranchesPage as AdminBranchesPage } from './features/saas-admin/pages/BranchesPage';
import { InvoicesPage } from './features/saas-admin/pages/InvoicesPage';
import { UsagePage } from './features/saas-admin/pages/UsagePage';
import { AiUsagePage } from './features/saas-admin/pages/AiUsagePage';
import { SystemHealthPage } from './features/saas-admin/pages/SystemHealthPage';
import { SettingsPage } from './features/saas-admin/pages/SettingsPage';
import { ActivityPage } from './features/saas-admin/pages/ActivityPage';
import { SubscriptionDetailPage } from './features/saas-admin/pages/SubscriptionDetailPage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

function LocaleSync() {
  const { i18n } = useTranslation();
  const location = useLocation();
  useEffect(() => {
    const dir = (i18n.language || 'en').toLowerCase().startsWith('ar') ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = dir;
  }, [i18n.language, location]);
  return null;
}

/** Bootstrap gate: loads GET /api/v1/auth/session once into the shell. */
function SessionGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const session = useSession();

  // Rules of Hooks: every hook must run unconditionally, before any early
  // return, so the hook order never changes between renders.
  useEffect(() => {
    setCompanyId(session.data?.tenant?.companyId ?? null);
  }, [session.data]);

  if (location.pathname === '/login') return <Outlet />;

  if (!getToken()) return <Navigate to="/login" replace />;

  if (session.isLoading) {
    return (
      <div className="page-loading">
        <Spinner />
        <span>{t('loading')}</span>
      </div>
    );
  }
  if (session.isError || !session.data) {
    // token invalid/expired (15-min lifetime) — clear and re-login
    setToken(null);
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

/** Customer users must never see /saas-admin (spec §48, §68). */
function AdminGuard() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.isLoading) {
    return (
      <div className="page-loading">
        <Spinner />
        <span>{t('loading')}</span>
      </div>
    );
  }
  const data = session.data;
  if (!data?.user?.platformRole) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="page-loading">
      <h2>404</h2>
      <span>Not found</span>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <LocaleSync />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<SessionGate />}>
                <Route element={<CustomerLayout />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/analytics" element={<ModulePlaceholderPage feature="ANALYTICS" titleKey="customer.analytics.title" subtitleKey="customer.analytics.subtitle" icon="📈" />} />
                  <Route path="/forecast" element={<ModulePlaceholderPage feature="FORECAST" titleKey="customer.forecast.title" subtitleKey="customer.forecast.subtitle" icon="🔮" />} />
                  <Route path="/scenario" element={<ModulePlaceholderPage feature="SCENARIO" titleKey="customer.scenario.title" subtitleKey="customer.scenario.subtitle" icon="🧭" />} />
                  <Route path="/budget" element={<ModulePlaceholderPage feature="BUDGET_AND_TARGETS" titleKey="customer.budget.title" subtitleKey="customer.budget.subtitle" icon="🎯" />} />
                  <Route path="/uploads" element={<UploadsPage />} />
                  <Route path="/truth" element={<ModulePlaceholderPage feature="FINANCIAL_TRUTH" titleKey="customer.truth.title" subtitleKey="customer.truth.subtitle" icon="🔮" />} />
                  <Route path="/statements" element={<ModulePlaceholderPage feature="FINANCIAL_STATEMENTS" titleKey="customer.statements.title" subtitleKey="customer.statements.subtitle" icon="📑" />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/branches" element={<BranchesPage />} />
                  <Route path="/users" element={<CustomerUsersPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/subscription" element={<SubscriptionPage />} />
                  <Route path="/support" element={<SupportPage />} />
                </Route>
                <Route path="/saas-admin" element={<AdminGuard />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="overview" element={<OverviewPage />} />
                    <Route path="customers" element={<CustomersPage />} />
                    <Route path="customers/create" element={<CreateCustomerPage />} />
                    <Route path="customers/:id" element={<CustomerDetailPage />} />
                    <Route path="companies" element={<AdminCompaniesPage />} />
                    <Route path="branches" element={<AdminBranchesPage />} />
                    <Route path="subscriptions" element={<SubscriptionsPage />} />
                    <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
                    <Route path="plans" element={<PlansPage />} />
                    <Route path="features" element={<FeaturesPage />} />
                    <Route path="payments" element={<PaymentsPage />} />
                    <Route path="invoices" element={<InvoicesPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="platform-users" element={<PlatformUsersPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="activity" element={<ActivityPage />} />
                    <Route path="usage" element={<UsagePage />} />
                    <Route path="ai-usage" element={<AiUsagePage />} />
                    <Route path="health" element={<SystemHealthPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
