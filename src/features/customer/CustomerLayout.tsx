import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionData, useTenant, hasWorkingSubscription, useSession } from '../../hooks/useSession';
import { setToken, setCompanyId, getRefreshToken } from '../../api/client';
import { companiesApi, authApi } from '../../api/services';
import { SubscriptionBanner } from '../../components/SubscriptionBanner';
import { LanguageSwitcher, RoleBadge, Select } from '../../components/ui';
import { ThemeSwitcher } from '../../components/kibo/theme-switcher';
import { canUseFeature } from '../../hooks/useSession';
import type { ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  home: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 9.5 10 3.5l7 6M5 8v8.5h10V8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 3.5h9a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z" strokeLinejoin="round" />
      <path d="M4 3.5v13" strokeLinecap="round" />
    </svg>
  ),
  truth: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v3.5l2.5 1.5" strokeLinecap="round" />
    </svg>
  ),
  statements: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 16.5V5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 17 5v11.5z" strokeLinejoin="round" />
      <path d="M6 8h8M6 11h5" strokeLinecap="round" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 16.5V11M8 16.5V6M13 16.5V9M17 16.5V3.5" strokeLinecap="round" />
    </svg>
  ),
  planning: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 17h14M4 14l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 7h3v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  workspace: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" strokeLinecap="round" />
    </svg>
  ),
};

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
  feature?: string | null; // null = always shown when working subscription
  group: string;
}

export function CustomerLayout() {
  const { t } = useTranslation();
  const session = useSessionData();
  const tenant = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { refetch: refetchSession } = useSession();

  const working = hasWorkingSubscription(session);
  const platformRole = session?.user.platformRole ?? null;

  // Company switcher (contract: GET /api/v1/companies, persist, re-bootstrap session)
  const companiesQ = useQuery({
    queryKey: ['customer', 'companies'],
    queryFn: () => companiesApi.list(),
    enabled: !!session?.tenant && !platformRole,
  });

  const switchCompany = (companyId: string) => {
    if (!companyId) return;
    setCompanyId(companyId);
    qc.removeQueries({ queryKey: ['customer'] });
    void refetchSession().then(() => {
      qc.invalidateQueries({ queryKey: ['session'] });
      navigate('/dashboard');
    });
  };

  const nav: NavItem[] = [
    { to: '/dashboard', icon: ICONS.home, label: t('nav.dashboard'), feature: 'DASHBOARD', group: 'HOME' },
    { to: '/uploads', icon: ICONS.books, label: t('nav.uploads'), feature: null, group: 'BOOKS' },
    { to: '/truth', icon: ICONS.truth, label: t('nav.truth'), feature: 'FINANCIAL_TRUTH', group: 'TRUTH' },
    { to: '/statements', icon: ICONS.statements, label: t('nav.statements'), feature: 'FINANCIAL_STATEMENTS', group: 'STATEMENTS' },
    { to: '/analytics', icon: ICONS.analytics, label: t('nav.analytics'), feature: 'ANALYTICS', group: 'ANALYTICS' },
    { to: '/forecast', icon: ICONS.planning, label: t('nav.forecast'), feature: 'FORECAST', group: 'PLANNING' },
    { to: '/scenario', icon: ICONS.planning, label: t('nav.scenario'), feature: 'SCENARIO', group: 'PLANNING' },
    { to: '/budget', icon: ICONS.planning, label: t('nav.budget'), feature: 'BUDGET_AND_TARGETS', group: 'PLANNING' },
    // { to: '/companies', icon: ICONS.workspace, label: t('customer.workspace.companies'), feature: null, group: 'WORKSPACE' },
    // { to: '/branches', icon: ICONS.workspace, label: t('customer.workspace.branches'), feature: null, group: 'WORKSPACE' },
    { to: '/users', icon: ICONS.workspace, label: t('customer.workspace.users'), feature: null, group: 'WORKSPACE' },
  ];

  // Feature items appear only when features[key].enabled (contract).
  const visible = working ? nav.filter((n) => (n.feature ? canUseFeature(session, n.feature) : true)) : [];

  const accountNav = [
    { to: '/account', icon: ICONS.account, label: t('nav.account') },
    { to: '/subscription', icon: ICONS.account, label: t('nav.subscription') },
    { to: '/support', icon: ICONS.account, label: t('nav.support') },
  ];

  const logout = () => {
    void authApi.logout(getRefreshToken() ?? '').catch(() => undefined);
    setToken(null);
    qc.clear();
    navigate('/login');
  };

  const groups: { key: string; label: string; items: NavItem[] }[] = [
    { key: 'HOME', label: t('nav.group_home'), items: visible.filter((n) => n.group === 'HOME') },
    { key: 'BOOKS', label: t('nav.group_books'), items: visible.filter((n) => n.group === 'BOOKS') },
    { key: 'TRUTH', label: t('nav.group_truth'), items: visible.filter((n) => n.group === 'TRUTH') },
    { key: 'STATEMENTS', label: t('nav.group_statements'), items: visible.filter((n) => n.group === 'STATEMENTS') },
    { key: 'ANALYTICS', label: t('nav.group_analytics'), items: visible.filter((n) => n.group === 'ANALYTICS') },
    { key: 'PLANNING', label: t('nav.group_planning'), items: visible.filter((n) => n.group === 'PLANNING') },
    { key: 'WORKSPACE', label: t('nav.group_workspace'), items: visible.filter((n) => n.group === 'WORKSPACE') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark">V</div>
          <div>
            <div className="brand-name">VCFO</div>
            <div className="brand-tag">{t('customer.login.brand_sub')}</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="customer navigation">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="nav-section-label">{g.label}</div>
              {g.items.map((m) => (
                <NavLink key={m.to} to={m.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="nav-icon">{m.icon}</span>
                  {m.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-section-label">{t('nav.group_account')}</div>
          {accountNav.map((m) => (
            <NavLink key={m.to} to={m.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 6 }}>{session?.user?.email}</div>
          {session?.user && <RoleBadge role={session.user.platformRole ?? 'OWNER'} />}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          {tenant && !platformRole && (
            <div className="flex" style={{ gap: 8 }}>
              <span className="muted text-sm">{t('customer.shell.company')}:</span>
              <Select
                value={tenant.companyId ?? ''}
                onChange={(e) => switchCompany(e.target.value)}
                style={{ width: 'auto', minWidth: 170 }}
                aria-label={t('customer.shell.company')}
              >
                {(companiesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="topbar-spacer" />
          <ThemeSwitcher />
          <LanguageSwitcher compact />
          <button className="btn btn-sm" onClick={logout}>
            {t('customer.shell.logout')}
          </button>
        </header>
        <SubscriptionBanner />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
