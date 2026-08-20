import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  Cpu,
  FileText,
  Gauge,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Receipt,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { saasAdminApi, authApi } from '../../api/services';
import { queryKeys } from '../../lib/queryKeys';
import { useSessionData } from '../../hooks/useSession';
import { setToken, getRefreshToken } from '../../api/client';
import type { PlatformRole } from '../../api/types';
import { LanguageSwitcher, RoleBadge } from '../../components/ui';
import { ThemeSwitcher } from '../../components/kibo/theme-switcher';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/shadcn/dropdown-menu';
import { AdminAvatar, CommandPalette } from './components/chrome';
import { cn } from '../../lib/utils';

export type SectionKey =
  | 'overview'
  | 'customers'
  | 'companies'
  | 'branches'
  | 'subscriptions'
  | 'plans'
  | 'features'
  | 'payments'
  | 'invoices'
  | 'users'
  | 'platform-users'
  | 'audit'
  | 'activity'
  | 'usage'
  | 'ai-usage'
  | 'health'
  | 'settings';

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
    'saas.payment.read',
    'saas.user.read', 'saas.user.write', 'saas.audit.read',
  ],
  BILLING_ADMIN: [
    'saas.overview.read', 'saas.customer.read',
    'saas.subscription.read', 'saas.subscription.write',
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
  companies: 'saas.customer.read',
  branches: 'saas.customer.read',
  subscriptions: 'saas.subscription.read',
  plans: 'saas.plan.read',
  features: 'saas.feature.read',
  payments: 'saas.payment.read',
  invoices: 'saas.payment.read',
  users: 'saas.user.read',
  'platform-users': 'saas.platform-user.write',
  audit: 'saas.audit.read',
  activity: 'saas.audit.read',
  usage: 'saas.overview.read',
  'ai-usage': 'saas.overview.read',
  health: 'saas.overview.read',
  settings: 'saas.overview.read',
};

export function canAccessSection(role: PlatformRole | null | undefined, section: SectionKey): boolean {
  return hasPerm(role, SECTION_PERM[section]);
}

export function canManageSubscription(role: PlatformRole | null | undefined): boolean {
  return hasPerm(role, 'saas.subscription.write') && role !== 'BILLING_ADMIN';
}

const NAV_GROUPS: { labelKey: string; sections: SectionKey[] }[] = [
  { labelKey: 'admin.nav.group_overview', sections: ['overview'] },
  { labelKey: 'admin.nav.group_platform', sections: ['customers', 'companies', 'branches'] },
  { labelKey: 'admin.nav.group_billing', sections: ['subscriptions', 'plans', 'payments', 'invoices'] },
  { labelKey: 'admin.nav.group_usage', sections: ['usage', 'ai-usage'] },
  { labelKey: 'admin.nav.group_monitoring', sections: ['activity', 'audit', 'health'] },
  { labelKey: 'admin.nav.group_settings', sections: ['features', 'platform-users', 'settings'] },
];

const SECTION_PATH: Record<SectionKey, string> = {
  overview: '/saas-admin/overview',
  customers: '/saas-admin/customers',
  companies: '/saas-admin/companies',
  branches: '/saas-admin/branches',
  subscriptions: '/saas-admin/subscriptions',
  plans: '/saas-admin/plans',
  features: '/saas-admin/features',
  payments: '/saas-admin/payments',
  invoices: '/saas-admin/invoices',
  users: '/saas-admin/users',
  'platform-users': '/saas-admin/platform-users',
  audit: '/saas-admin/audit',
  activity: '/saas-admin/activity',
  usage: '/saas-admin/usage',
  'ai-usage': '/saas-admin/ai-usage',
  health: '/saas-admin/health',
  settings: '/saas-admin/settings',
};

const SECTION_ICONS: Record<SectionKey, ReactNode> = {
  overview: <LayoutDashboard size={16} />,
  customers: <Building2 size={16} />,
  companies: <Building2 size={16} />,
  branches: <GitBranch size={16} />,
  subscriptions: <FileText size={16} />,
  plans: <Wallet size={16} />,
  features: <Sparkles size={16} />,
  payments: <CreditCard size={16} />,
  invoices: <Receipt size={16} />,
  users: <Users size={16} />,
  'platform-users': <Shield size={16} />,
  audit: <FileText size={16} />,
  activity: <Activity size={16} />,
  usage: <Gauge size={16} />,
  'ai-usage': <Cpu size={16} />,
  health: <Activity size={16} />,
  settings: <Settings size={16} />,
};

export function AdminLayout() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vcfo.sidebar') === 'collapsed');

  const sections = useMemo<SectionKey[]>(
    () => (role ? (Object.keys(SECTION_PERM) as SectionKey[]).filter((k) => hasPerm(role, SECTION_PERM[k])) : []),
    [role],
  );

  const overviewQ = useQuery({
    queryKey: queryKeys.saasAdmin.overview,
    queryFn: () => saasAdminApi.getOverview(),
    staleTime: 60_000,
  });

  const attention = (overviewQ.data?.subscriptions.pastDue ?? 0) + (overviewQ.data?.expiring.in7Days ?? 0);
  const healthState = overviewQ.isError ? 'down' : attention > 0 ? 'warn' : 'ok';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const logout = () => {
    void authApi.logout(getRefreshToken() ?? '').catch(() => undefined);
    setToken(null);
    qc.clear();
    navigate('/login');
  };

  const sectionLabel = (k: SectionKey) => {
    const keyMap: Record<SectionKey, string> = {
      overview: 'admin.nav.overview',
      customers: 'admin.nav.customers',
      companies: 'admin.nav.companies',
      branches: 'admin.nav.branches',
      subscriptions: 'admin.nav.subscriptions',
      plans: 'admin.nav.plans',
      features: 'admin.nav.features',
      payments: 'admin.nav.payments',
      invoices: 'admin.nav.invoices',
      users: 'admin.nav.users',
      'platform-users': 'admin.nav.platform_users',
      audit: 'admin.nav.audit',
      activity: 'admin.nav.activity',
      usage: 'admin.nav.usage',
      'ai-usage': 'admin.nav.ai_usage',
      health: 'admin.nav.health',
      settings: 'admin.nav.settings',
    };
    return t(keyMap[k]);
  };

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('vcfo.sidebar', next ? 'collapsed' : '');
      return next;
    });
  };

  const displayName = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ') || session?.user.email || 'Admin';

  return (
    <div className="sa-shell">
      {mobileOpen && <div className="sa-backdrop-sidebar" onClick={() => setMobileOpen(false)} />}
      <aside className={cn('sidebar admin-sidebar', collapsed && 'collapsed', mobileOpen && 'open')}>
        <div className="sidebar-brand">
          <div className="logo-mark">V</div>
          {!collapsed && (
            <div className="brand-copy">
              <div className="brand-name">VCFO</div>
              <div className="brand-tag">{t('admin.title_short')}</div>
            </div>
          )}
          <button type="button" className="sidebar-toggle sa-desktop-only" onClick={toggleSidebar} aria-label={t('admin.nav.toggle')} title={collapsed ? t('admin.nav.expand') : t('admin.nav.collapse')}>
            <PanelLeft size={13} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="admin navigation">
          {NAV_GROUPS.map((group) => {
            const visible = group.sections.filter((s) => sections.includes(s));
            if (visible.length === 0) return null;
            return (
              <div key={group.labelKey}>
                {!collapsed && <div className="nav-section-label">{t(group.labelKey)}</div>}
                {visible.map((k) => (
                  <NavLink
                    key={k}
                    to={SECTION_PATH[k]}
                    className={({ isActive }) => cn('nav-link', isActive && 'active')}
                    title={collapsed ? sectionLabel(k) : undefined}
                  >
                    <span className="nav-icon">{SECTION_ICONS[k]}</span>
                    {!collapsed && sectionLabel(k)}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <AdminAvatar name={displayName} />
              <div style={{ minWidth: 0 }}>
                <div className="strong text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                <div className="muted text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.user.email}</div>
              </div>
            </div>
          )}
          {role && <RoleBadge role={role} platform />}
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-topbar">
          <button type="button" className="sa-icon-btn sa-mobile-only" onClick={() => setMobileOpen(true)} aria-label={t('admin.nav.toggle')}>
            <Menu size={16} />
          </button>
          <button type="button" className="sa-search-trigger" onClick={() => setCmdOpen(true)}>
            <Search size={14} />
            <span>{t('admin.command.placeholder')}</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-spacer" />
          <span className={cn('sa-status-pill', healthState === 'warn' && 'warn', healthState === 'down' && 'down')} title={t('admin.health.title')}>
            <span className="dot" />
            <span className="label">
              {healthState === 'ok' && t('admin.health.healthy')}
              {healthState === 'warn' && t('admin.health.attention')}
              {healthState === 'down' && t('admin.health.degraded')}
            </span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn('sa-icon-btn', attention > 0 && 'has-dot')} aria-label={t('admin.nav.notifications')}>
                <Bell size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="sa-notify">
              {attention === 0 && overviewQ.isSuccess && (
                <div className="sa-notify-item muted text-sm">{t('admin.notifications.empty')}</div>
              )}
              {(overviewQ.data?.expiring.in7Days ?? 0) > 0 && (
                <DropdownMenuItem onSelect={() => navigate('/saas-admin/customers?expiry=EXPIRING_7')}>
                  {t('admin.notifications.expiring', { count: overviewQ.data?.expiring.in7Days })}
                </DropdownMenuItem>
              )}
              {(overviewQ.data?.subscriptions.pastDue ?? 0) > 0 && (
                <DropdownMenuItem onSelect={() => navigate('/saas-admin/subscriptions')}>
                  {t('admin.notifications.past_due', { count: overviewQ.data?.subscriptions.pastDue })}
                </DropdownMenuItem>
              )}
              {overviewQ.isError && (
                <div className="sa-notify-item text-sm">{t('admin.notifications.health_down')}</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeSwitcher />
          <LanguageSwitcher compact />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="sa-profile-btn" aria-label={t('admin.nav.profile')}>
                <AdminAvatar name={displayName} />
                <span className="who">{displayName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate('/saas-admin/settings')}>{t('admin.nav.settings')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={logout}>
                <LogOut size={14} /> {t('actions.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="sa-content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
