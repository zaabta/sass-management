import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi, authApi } from '../../api/services';
import { queryKeys } from '../../lib/queryKeys';
import { useSessionData } from '../../hooks/useSession';
import { setToken, getRefreshToken } from '../../api/client';
import type { PlatformRole } from '../../api/types';
import { LanguageSwitcher, RoleBadge } from '../../components/ui';
import { ThemeSwitcher } from '../../components/kibo/theme-switcher';
import { useQueryClient } from '@tanstack/react-query';

type SectionKey = 'overview' | 'customers' | 'subscriptions' | 'plans' | 'features' | 'payments' | 'users' | 'platform-users' | 'audit';

type SaasPerm =
  | 'saas.overview.read'
  | 'saas.customer.read'
  | 'saas.customer.write'
  | 'saas.subscription.read'
  | 'saas.subscription.write'
  | 'saas.plan.read'
  | 'saas.plan.write'
  | 'saas.feature.read'
  | 'saas.feature.write'
  | 'saas.payment.read'
  | 'saas.payment.write'
  | 'saas.user.read'
  | 'saas.user.write'
  | 'saas.audit.read'
  | 'saas.platform-user.write';

/** saas.* permission matrix (contract). Backend stays authoritative (403 if forged). */
const ROLE_PERMS: Record<PlatformRole, SaasPerm[]> = {
  SUPER_ADMIN: [
    'saas.overview.read', 'saas.customer.read', 'saas.customer.write',
    'saas.subscription.read', 'saas.subscription.write',
    'saas.plan.read', 'saas.plan.write', 'saas.feature.read', 'saas.feature.write',
    'saas.payment.read', 'saas.payment.write',
    'saas.user.read', 'saas.user.write', 'saas.audit.read', 'saas.platform-user.write',
  ],
  SAAS_ADMIN: [
    'saas.overview.read', 'saas.customer.read', 'saas.customer.write',
    'saas.subscription.read', 'saas.subscription.write',
    'saas.plan.read', 'saas.plan.write', 'saas.feature.read', 'saas.feature.write',
    'saas.payment.read', // read-only — no record/void
    'saas.user.read', 'saas.user.write', 'saas.audit.read',
  ],
  BILLING_ADMIN: [
    'saas.overview.read', 'saas.customer.read',
    'saas.subscription.read', 'saas.subscription.write', // activate/renew/extend only
    'saas.payment.read', 'saas.payment.write',
  ],
  SUPPORT: ['saas.overview.read', 'saas.customer.read', 'saas.subscription.read', 'saas.user.read', 'saas.audit.read'],
};

export function hasPerm(role: PlatformRole | null | undefined, perm: SaasPerm): boolean {
  if (!role) return false;
  return ROLE_PERMS[role].includes(perm);
}

const SECTION_PERM: Record<SectionKey, SaasPerm> = {
  overview: 'saas.overview.read',
  customers: 'saas.customer.read',
  subscriptions: 'saas.subscription.read',
  plans: 'saas.plan.read',
  features: 'saas.feature.read',
  payments: 'saas.payment.read',
  users: 'saas.user.read',
  'platform-users': 'saas.platform-user.write',
  audit: 'saas.audit.read',
};

export function canAccessSection(role: PlatformRole | null | undefined, section: SectionKey): boolean {
  return hasPerm(role, SECTION_PERM[section]);
}

/**
 * Destructive subscription ops (suspend/cancel/change-plan/change-price) are
 * SUPER_ADMIN + SAAS_ADMIN only; BILLING_ADMIN gets activate/renew/extend.
 */
export function canManageSubscription(role: PlatformRole | null | undefined): boolean {
  return hasPerm(role, 'saas.subscription.write') && role !== 'BILLING_ADMIN';
}

const SECTION_ICONS: Record<SectionKey, React.ReactNode> = {
  overview: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="7" cy="7" r="3" />
      <path d="M2.5 17c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5" strokeLinecap="round" />
      <path d="M13 4.5a3 3 0 0 1 0 5M14.5 12.9c1.6.6 2.8 1.9 3 4.1" strokeLinecap="round" />
    </svg>
  ),
  subscriptions: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 6.5h12M4 6.5a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 16 6.5M4 6.5V14a2.5 2.5 0 0 0 2.5 2.5h7A2.5 2.5 0 0 0 16 14V6.5" strokeLinecap="round" />
      <path d="M10 3v4M8.5 11h3" strokeLinecap="round" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 4h14v12H3z" />
      <path d="M3 8h14M8 8v8" strokeLinecap="round" />
    </svg>
  ),
  features: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="m10 2.5 1.8 4.2 4.5.5-3.4 3 1 4.5L10 12.4l-3.9 2.3 1-4.5-3.4-3 4.5-.5z" strokeLinejoin="round" />
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.5" y="5" width="15" height="11" rx="1.5" />
      <path d="M2.5 8.5h15M5.5 13h4" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="6.5" r="2.8" />
      <circle cx="14" cy="7" r="2" />
      <path d="M2.5 16.5c0-2.6 2.4-4.2 5.5-4.2s5.5 1.6 5.5 4.2" strokeLinecap="round" />
      <path d="M13 14.7c1.5.3 2.6 1.1 3.2 2.3" strokeLinecap="round" />
    </svg>
  ),
  'platform-users': (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
      <circle cx="10" cy="9" r="2.2" />
      <path d="M6.5 14.5c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4" strokeLinecap="round" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 2.5h12V17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z" strokeLinejoin="round" />
      <path d="M7 7h6M7 10h6M7 13h3" strokeLinecap="round" />
    </svg>
  ),
};

export function AdminLayout() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // Collapsible sidebar: icons-only when collapsed, expands on click.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vcfo.sidebar') === 'collapsed');

  const sections: SectionKey[] = useMemo<SectionKey[]>(
    () => (role ? (Object.keys(SECTION_PERM) as SectionKey[]).filter((k) => hasPerm(role, SECTION_PERM[k])) : []),
    [role],
  );

  const searchQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ search, page: 1, pageSize: 6 }),
    queryFn: () => saasAdminApi.getCustomers({ search, page: 1, pageSize: 6 }),
    enabled: search.trim().length >= 2,
  });

  const logout = () => {
    void authApi.logout(getRefreshToken() ?? '').catch(() => undefined);
    setToken(null);
    qc.clear();
    navigate('/login');
  };

  const sectionLabel = (k: SectionKey) => t(`admin.nav.${k === 'platform-users' ? 'platform_users' : k}`);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('vcfo.sidebar', next ? 'collapsed' : '');
      return next;
    });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="logo-mark">V</div>
          {!collapsed && (
            <div>
              <div className="brand-name">VCFO</div>
              <div className="brand-tag">{t('admin.title')}</div>
            </div>
          )}
          <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar" title={collapsed ? 'Expand' : 'Collapse'}>
            <span className="flip-rtl" aria-hidden>«</span>
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="admin navigation">
          {!collapsed && <div className="nav-section-label">{t('admin.title')}</div>}
          {sections.map((k) => (
            <NavLink key={k} to={`/saas-admin/${k === 'overview' ? 'overview' : k}`} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title={collapsed ? sectionLabel(k) : undefined}>
              <span className="nav-icon">{SECTION_ICONS[k]}</span>
              {!collapsed && sectionLabel(k)}
            </NavLink>
          ))}
          {!collapsed && <div className="nav-section-label">VCFO</div>}
          <NavLink to="/dashboard" className="nav-link" title={collapsed ? t('admin.nav.back_to_customer_app') : undefined}>
            <span className="nav-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 10l6-6 6 6M6 9v7h8V9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {!collapsed && t('admin.nav.back_to_customer_app')}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          {!collapsed && <div style={{ marginBottom: 6 }}>{session?.user?.email}</div>}
          {role && <RoleBadge role={role} platform />}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="input-icon-wrap" style={{ position: 'relative', width: 'min(380px, 40vw)' }}>
            <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--text-muted)' }}>
              <circle cx="9" cy="9" r="6" />
              <path d="M13.5 13.5 17 17" strokeLinecap="round" />
            </svg>
            <input
              className="input"
              style={{ paddingInlineStart: 32 }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 200)}
              placeholder={t('admin.global_search')}
              aria-label={t('admin.global_search')}
            />
            {searchOpen && search.trim().length >= 2 && (
              <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 60, maxHeight: 320, overflowY: 'auto' }}>
                {searchQ.isLoading && <div className="card-body text-sm muted">{t('loading')}</div>}
                {searchQ.data?.items?.length === 0 && <div className="card-body text-sm muted">{t('empty.customers')}</div>}
                {searchQ.data?.items?.map((c) => (
                  <button
                    key={c.id}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, borderBottom: '1px solid var(--border)' }}
                    onMouseDown={() => {
                      setSearchOpen(false);
                      setSearch('');
                      navigate(`/saas-admin/customers/${c.id}`);
                    }}
                  >
                    <span className="strong">{c.name}</span>
                    <span className="muted text-xs">{c.code}</span>
                    <span className="grow" />
                    <span className="muted text-xs">{c.planCode ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-spacer" />
          <ThemeSwitcher />
          <LanguageSwitcher compact />
          <button className="btn btn-sm" onClick={logout}>
            {t('actions.logout')}
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
