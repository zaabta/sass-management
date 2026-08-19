import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { Building2, CreditCard, TrendingUp, Users } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Badge, Button } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { formatAmount, formatDateTime, formatNumber } from '../../../lib/format';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { AdminAvatar, AdminErrorState } from '../components/chrome';
import type { AuditEvent, Payment } from '../../../api/types';

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const q = useQuery({ queryKey: queryKeys.saasAdmin.overview, queryFn: () => saasAdminApi.getOverview() });
  const usersQ = useQuery({
    queryKey: queryKeys.saasAdmin.users({}),
    queryFn: () => saasAdminApi.getAllUsers({}),
    enabled: canAccessSection(role, 'users'),
  });
  const signupsQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 6, sortBy: 'createdAt', sortDir: 'desc' }),
    queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 6, sortBy: 'createdAt', sortDir: 'desc' }),
    enabled: canAccessSection(role, 'customers'),
  });
  const paymentsQ = useQuery({
    queryKey: queryKeys.saasAdmin.payments({ status: 'PENDING', page: 1, pageSize: 6 }),
    queryFn: () => saasAdminApi.getPayments({ status: 'PENDING', page: 1, pageSize: 6 }),
    enabled: canAccessSection(role, 'payments'),
  });
  const auditQ = useQuery({
    queryKey: queryKeys.saasAdmin.audit({ page: 1, pageSize: 8 }),
    queryFn: () => saasAdminApi.getAudit({ page: 1, pageSize: 8 }),
    enabled: canAccessSection(role, 'audit'),
  });

  if (!canAccessSection(role, 'overview')) return <Navigate to="/saas-admin/customers" replace />;

  if (q.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('admin.overview.title')} description={t('admin.overview.subtitle')} />
        <div className="sa-kpi-grid mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sa-kpi">
              <div className="skeleton" style={{ height: 12, width: 90, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 28, width: 80 }} />
            </div>
          ))}
        </div>
        <div className="sa-split">
          <div className="skeleton skeleton-card" style={{ height: 220 }} />
          <div className="skeleton skeleton-card" style={{ height: 220 }} />
        </div>
      </>
    );
  }

  if (q.isError || !q.data) {
    return (
      <>
        <AdminPageHeader title={t('admin.overview.title')} description={t('admin.overview.subtitle')} />
        <AdminErrorState onRetry={() => void q.refetch()} />
      </>
    );
  }

  const d = q.data;
  const customers = d.customers ?? { total: 0, active: 0, suspended: 0, cancelled: 0 };
  const subscriptions = d.subscriptions ?? { trial: 0, active: 0, pastDue: 0, expired: 0, suspended: 0, cancelled: 0 };
  const expiring = d.expiring ?? { in7Days: 0, in30Days: 0 };
  const payments = d.payments ?? { thisMonth: 0, thisYear: 0 };
  const planDistribution = d.planDistribution ?? [];
  const growth = d.growth ?? [];
  const maxPlan = Math.max(1, ...planDistribution.map((p) => p.count));
  const maxGrowth = Math.max(1, ...growth.map((g) => g.customers));
  const totalUsers = usersQ.data?.length;
  const newCustomers = growth.length >= 2 ? growth[growth.length - 1].customers - growth[growth.length - 2].customers : null;
  const churnish = (subscriptions.cancelled ?? 0) + (subscriptions.expired ?? 0);
  const attention = (subscriptions.pastDue ?? 0) + expiring.in7Days;

  return (
    <>
      <AdminPageHeader title={t('admin.overview.title')} description={t('admin.overview.subtitle')} />

      {attention > 0 && (
        <div className="sa-alert-row">
          {t('admin.overview.needs_attention', { count: attention })}
          <Link to="/saas-admin/subscriptions" style={{ marginInlineStart: 'auto', fontWeight: 600 }}>
            {t('admin.overview.view_all')}
          </Link>
        </div>
      )}

      <div className="sa-kpi-grid mb-4">
        <Kpi
          label={t('admin.overview.total_users')}
          value={totalUsers == null ? '—' : formatNumber(totalUsers, i18n.language)}
          icon={<Users size={15} />}
          meta={t('admin.overview.across_platform')}
        />
        <Kpi
          label={t('admin.overview.active_companies')}
          value={formatNumber(customers.active, i18n.language)}
          icon={<Building2 size={15} />}
          meta={`${formatNumber(customers.total, i18n.language)} ${t('admin.overview.total_customers').toLowerCase()}`}
        />
        <Kpi
          label={t('admin.overview.active_subscriptions')}
          value={formatNumber(subscriptions.active + subscriptions.trial, i18n.language)}
          icon={<TrendingUp size={15} />}
          meta={`${formatNumber(subscriptions.trial, i18n.language)} ${t('admin.overview.trial_subscriptions').toLowerCase()}`}
        />
        <Kpi
          label={t('admin.overview.mrr')}
          value={d.mrr != null ? formatAmount(d.mrr, 'USD', i18n.language, 0) : '—'}
          icon={<CreditCard size={15} />}
          meta={d.arr != null ? `${t('admin.overview.arr')} ${formatAmount(d.arr, 'USD', i18n.language, 0)}` : t('admin.overview.subtitle')}
        />
      </div>

      <div className="sa-kpi-grid mb-4">
        <Kpi
          label={t('admin.overview.new_customers')}
          value={newCustomers == null ? '—' : formatNumber(newCustomers, i18n.language)}
          meta={t('admin.overview.vs_last_month')}
          tone={newCustomers != null && newCustomers < 0 ? 'down' : 'up'}
          delta={newCustomers != null ? `${newCustomers >= 0 ? '+' : ''}${newCustomers}` : undefined}
        />
        <Kpi
          label={t('admin.overview.revenue')}
          value={formatAmount(payments.thisMonth, 'USD', i18n.language, 0)}
          meta={t('admin.overview.payments_month')}
        />
        <Kpi
          label={t('admin.overview.churn_proxy')}
          value={formatNumber(churnish, i18n.language)}
          meta={t('admin.overview.expired_or_cancelled')}
          tone={churnish > 0 ? 'down' : undefined}
        />
        <Kpi
          label={t('admin.overview.expiring_7')}
          value={formatNumber(expiring.in7Days, i18n.language)}
          meta={<Link to="/saas-admin/customers?expiry=EXPIRING_7">{t('admin.overview.view_all')}</Link>}
          tone={expiring.in7Days > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="sa-split mb-4">
        <div className="sa-panel">
          <div className="sa-panel-head">
            <div>
              <h3>{t('admin.overview.customer_growth')}</h3>
              <div className="sa-panel-sub">{t('admin.overview.user_growth')}</div>
            </div>
          </div>
          <div className="sa-panel-body">
            <div className="mini-chart" style={{ height: 140 }}>
              {growth.map((g) => (
                <div key={g.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                  <div className="bar" style={{ width: '70%', height: `${Math.max(6, (g.customers / maxGrowth) * 100)}%` }} title={`${g.month}: ${g.customers}`} />
                  <span className="text-xs muted tnum">{g.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.subscriptions_trend')}</h3>
          </div>
          <div className="sa-panel-body">
            {[
              { k: 'ACTIVE', n: subscriptions.active },
              { k: 'TRIAL', n: subscriptions.trial },
              { k: 'PAST_DUE', n: subscriptions.pastDue },
              { k: 'EXPIRED', n: subscriptions.expired },
              { k: 'SUSPENDED', n: subscriptions.suspended },
              { k: 'CANCELLED', n: subscriptions.cancelled },
            ].map((row) => (
              <div className="usage-line" key={row.k}>
                <div className="usage-head">
                  <span>{t(`admin.subscription_status.${row.k}`)}</span>
                  <span className="muted tnum">{row.n}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(row.n / Math.max(1, customers.total)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sa-split mb-4">
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.revenue_trend')}</h3>
            <span className="sa-panel-sub">{t('admin.overview.payments_year')}: {formatAmount(payments.thisYear, 'USD', i18n.language, 0)}</span>
          </div>
          <div className="sa-panel-body">
            <div className="usage-line">
              <div className="usage-head">
                <span>{t('admin.overview.payments_month')}</span>
                <span className="tnum strong">{formatAmount(payments.thisMonth, 'USD', i18n.language)}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(100, (payments.thisMonth / Math.max(1, payments.thisYear)) * 100)}%` }} />
              </div>
            </div>
            <div className="mt-4">
              <div className="sa-panel-sub mb-2">{t('admin.overview.plan_distribution')}</div>
              {planDistribution.length === 0 && <p className="muted text-sm">{t('empty.plans')}</p>}
              {planDistribution.map((p) => (
                <div className="usage-line" key={p.planCode}>
                  <div className="usage-head">
                    <span>{p.planCode}</span>
                    <span className="muted tnum">{p.count}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill dark" style={{ width: `${(p.count / maxPlan) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.system_alerts')}</h3>
          </div>
          <div className="sa-panel-body">
            <AlertLine label={t('admin.overview.past_due')} value={subscriptions.pastDue} to="/saas-admin/subscriptions" />
            <AlertLine label={t('admin.overview.expiring_7')} value={expiring.in7Days} to="/saas-admin/customers?expiry=EXPIRING_7" />
            <AlertLine label={t('admin.overview.expiring_30')} value={expiring.in30Days} to="/saas-admin/customers?expiry=EXPIRING_30" />
            <AlertLine label={t('admin.overview.suspended_customers')} value={customers.suspended} to="/saas-admin/customers" />
          </div>
        </div>
      </div>

      <div className="sa-split-3">
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.recent_activity')}</h3>
            <Link to="/saas-admin/activity" className="text-sm">{t('admin.overview.view_all')}</Link>
          </div>
          <div className="sa-panel-body">
            <ActivityFeed events={auditQ.data?.items} loading={auditQ.isLoading} />
          </div>
        </div>
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.recent_signups')}</h3>
            <Link to="/saas-admin/customers" className="text-sm">{t('admin.overview.view_all')}</Link>
          </div>
          <div className="sa-panel-body">
            {(signupsQ.data?.items ?? []).map((c) => (
              <div className="sa-feed-item" key={c.id}>
                <AdminAvatar name={c.name} />
                <div>
                  <Link to={`/saas-admin/customers/${c.id}`} className="sa-feed-title">{c.name}</Link>
                  <div className="sa-feed-meta">{c.planCode ?? '—'} · {c.email}</div>
                </div>
                <span className="muted text-xs tnum">{c.code}</span>
              </div>
            ))}
            {!signupsQ.isLoading && (signupsQ.data?.items.length ?? 0) === 0 && <p className="muted text-sm">{t('empty.customers')}</p>}
          </div>
        </div>
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h3>{t('admin.overview.failed_payments')}</h3>
            <Link to="/saas-admin/payments" className="text-sm">{t('admin.overview.view_all')}</Link>
          </div>
          <div className="sa-panel-body">
            <PendingPayments items={paymentsQ.data?.items} loading={paymentsQ.isLoading} />
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  icon,
  meta,
  delta,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  delta?: string;
  tone?: 'up' | 'down' | 'warn';
}) {
  return (
    <div className="sa-kpi">
      <div className="sa-kpi-top">
        <div className="sa-kpi-label">{label}</div>
        {icon && <span className="sa-kpi-icon">{icon}</span>}
      </div>
      <div className="sa-kpi-value">{value}</div>
      <div className="sa-kpi-meta">
        {delta && <span className={tone}>{delta}</span>}
        {meta}
      </div>
    </div>
  );
}

function AlertLine({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <div className="sa-feed-item">
      <span className="admin-status-dot" style={{ marginTop: 6, background: value > 0 ? 'var(--amber)' : 'var(--green)' }} />
      <div>
        <div className="sa-feed-title">{label}</div>
        <div className="sa-feed-meta">{value}</div>
      </div>
      <Link to={to} className="text-sm">{value > 0 ? '→' : ''}</Link>
    </div>
  );
}

function ActivityFeed({ events, loading }: { events: AuditEvent[] | undefined; loading?: boolean }) {
  const { t, i18n } = useTranslation();
  if (loading) return <div className="skeleton" style={{ height: 120 }} />;
  if (!events?.length) return <p className="muted text-sm">{t('empty.audit')}</p>;
  return (
    <>
      {events.slice(0, 7).map((a) => (
        <div className="sa-feed-item" key={a.id}>
          <AdminAvatar name={a.actor} size="sm" />
          <div>
            <div className="sa-feed-title">
              {t(`admin.audit_actions.${a.action}`, { defaultValue: a.action })}
              {a.customerName ? ` · ${a.customerName}` : ''}
            </div>
            <div className="sa-feed-meta">
              {a.actor} {a.platformRole && <Badge tone={a.platformRole}>{t(`admin.roles.${a.platformRole}`)}</Badge>}
            </div>
          </div>
          <span className="muted text-xs tnum">{formatDateTime(a.timestamp, i18n.language)}</span>
        </div>
      ))}
    </>
  );
}

function PendingPayments({ items, loading }: { items: Payment[] | undefined; loading?: boolean }) {
  const { t, i18n } = useTranslation();
  if (loading) return <div className="skeleton" style={{ height: 120 }} />;
  if (!items?.length) return <p className="muted text-sm">{t('admin.overview.no_pending_payments')}</p>;
  return (
    <>
      {items.map((p) => (
        <div className="sa-feed-item" key={p.id}>
          <AdminAvatar name={p.customerName} size="sm" />
          <div>
            <div className="sa-feed-title">{p.customerName}</div>
            <div className="sa-feed-meta">{formatAmount(p.amount, p.currency, i18n.language)}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => undefined}>
            {t(`admin.payment_status.${p.status}`)}
          </Button>
        </div>
      ))}
    </>
  );
}
