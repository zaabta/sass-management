import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Badge, Card, EmptyState, Eyebrow, HealthGauge } from '../../../components/ui';
import { AdminMetricCard, AdminMetricSkeleton, AdminPageHeader } from '../../../components/admin';
import { formatAmount, formatDateTime } from '../../../lib/format';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const q = useQuery({ queryKey: queryKeys.saasAdmin.overview, queryFn: () => saasAdminApi.getOverview() });

  if (q.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('admin.overview.title')} description={t('admin.overview.subtitle')} />
        <AdminMetricSkeleton count={6} />
      </>
    );
  }
  if (q.isError || !q.data) {
    return (
      <>
        <AdminPageHeader title={t('admin.overview.title')} description={t('admin.overview.subtitle')} />
        <Card>
          <EmptyState icon="⚠️">{t('errors.internal')}</EmptyState>
        </Card>
      </>
    );
  }

  const d = q.data;
  // Defensive: the backend payload can omit sections — default everything.
  const customers = d.customers ?? { total: 0, active: 0, suspended: 0, cancelled: 0 };
  const subscriptions = d.subscriptions ?? { trial: 0, active: 0, pastDue: 0, expired: 0, suspended: 0, cancelled: 0 };
  const expiring = d.expiring ?? { in7Days: 0, in30Days: 0 };
  const payments = d.payments ?? { thisMonth: 0, thisYear: 0 };
  const planDistribution: { planCode: string; count: number }[] = d.planDistribution ?? [];
  const growth: { month: string; customers: number }[] = d.growth ?? [];
  const recentActivity: import('../../../api/types').AuditEvent[] = d.recentActivity ?? [];
  const maxPlan = Math.max(1, ...planDistribution.map((p) => p.count));

  const totalSubs = Math.max(1, subscriptions.trial + subscriptions.active + subscriptions.pastDue + subscriptions.expired + subscriptions.suspended + subscriptions.cancelled);
  const customersScore = Math.round((customers.active / Math.max(1, customers.total)) * 100);
  const subsScore = Math.round(((subscriptions.trial + subscriptions.active) / totalSubs) * 100);
  const healthScore = Math.round(customersScore * 0.4 + subsScore * 0.4 + Math.max(0, 100 - expiring.in7Days * 12) * 0.2);

  if (!canAccessSection(role, 'overview')) return <Navigate to="/saas-admin/customers" replace />;

  return (
    <>
      <div className="page-header">
        <div>
          <Eyebrow>PLATFORM · OVERVIEW</Eyebrow>
          <h1>
            {t('admin.overview.title')}{' '}
            <span className="underline-mark">{t('admin.overview.subtitle')}</span>
          </h1>
          <div className="page-sub">{t('admin.overview.subtitle')}</div>
        </div>
      </div>
      <div className="admin-metric-grid mb-4">
        <AdminMetricCard label={t('admin.overview.total_customers')} value={ customers.total } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.active_customers')} value={ customers.active } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.suspended_customers')} value={ customers.suspended } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.cancelled_customers')} value={ customers.cancelled } delta={ undefined } foot={ undefined } />
      </div>
      <div className="admin-metric-grid mb-4">
        <AdminMetricCard label={t('admin.overview.trial_subscriptions')} value={ subscriptions.trial } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.active_subscriptions')} value={ subscriptions.active } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.past_due')} value={ subscriptions.pastDue } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.expired')} value={ subscriptions.expired } delta={ undefined } foot={ undefined } />
      </div>
      <div className="admin-metric-grid mb-4">
        <AdminMetricCard label={t('admin.overview.expiring_7')} value={expiring.in7Days} foot={<Link to="/saas-admin/customers?expiry=EXPIRING_7">{t('admin.overview.view_all')}</Link>} />
        <AdminMetricCard label={t('admin.overview.expiring_30')} value={expiring.in30Days} foot={<Link to="/saas-admin/customers?expiry=EXPIRING_30">{t('admin.overview.view_all')}</Link>} />
        <AdminMetricCard label={t('admin.overview.payments_month')} value={ formatAmount(payments.thisMonth, 'USD', i18n.language) } delta={ undefined } foot={ undefined } />
        <AdminMetricCard label={t('admin.overview.payments_year')} value={ formatAmount(payments.thisYear, 'USD', i18n.language) } delta={ undefined } foot={ undefined } />
      </div>
      {d.mrr != null && (
        <div className="admin-metric-grid mb-4">
          <AdminMetricCard label={t('admin.overview.mrr')} value={ formatAmount(d.mrr, 'USD', i18n.language) } delta={ undefined } foot={ t('admin.overview.subtitle') } />
          <AdminMetricCard label={t('admin.overview.arr')} value={ formatAmount(d.arr, 'USD', i18n.language) } delta={ undefined } foot={ t('admin.overview.subtitle') } />
        </div>
      )}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        <Card>
          <div className="card-header">
            <h3>{t('admin.overview.health_title')}</h3>
            <span className="card-sub">{t('admin.overview.health_sub')}</span>
          </div>
          <div className="card-body">
            <HealthGauge
              score={healthScore}
              label={t('admin.overview.health_label')}
              categories={[
                { label: t('admin.overview.health_customers'), pct: customersScore },
                { label: t('admin.overview.health_subscriptions'), pct: subsScore },
                { label: t('admin.overview.health_expiring'), pct: Math.max(0, 100 - expiring.in7Days * 12) },
              ]}
            />
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('admin.overview.plan_distribution')}</h3>
          </div>
          <div className="card-body">
            {planDistribution.length === 0 ? (
              <EmptyState icon="📦">{t('empty.plans')}</EmptyState>
            ) : (
              planDistribution.map((p) => (
                <div className="usage-line" key={p.planCode}>
                  <div className="usage-head">
                    <span>{p.planCode}</span>
                    <span className="muted tnum">{p.count}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${(p.count / maxPlan) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('admin.overview.customer_growth')}</h3>
          </div>
          <div className="card-body">
            <div className="mini-chart" style={{ height: 100 }}>
              {growth.map((g, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div className="bar" style={{ width: '100%', height: `${Math.max(4, (g.customers / Math.max(1, ...growth.map((x) => x.customers))) * 100)}%` }} title={`${g.month}: ${g.customers}`} />
                  <span className="text-xs muted tnum">{g.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('admin.overview.recent_activity')}</h3>
            <Link to="/saas-admin/audit" className="text-sm">{t('admin.overview.view_all')}</Link>
          </div>
          <div className="card-body" style={{ padding: '8px 18px' }}>
            {recentActivity.length === 0 ? (
              <EmptyState icon="📋">{t('empty.audit')}</EmptyState>
            ) : (
              recentActivity.slice(0, 8).map((a) => (
                <div className="sub-card" key={a.id}>
                  <div className="sub-main">
                    <div className="sub-title">
                      {t(`admin.audit_actions.${a.action}`, { defaultValue: a.action })}
                      {a.customerName && <span className="muted"> · {a.customerName}</span>}
                    </div>
                    <div className="sub-meta">
                      {a.actor} {a.platformRole && <Badge tone={a.platformRole}>{t(`admin.roles.${a.platformRole}`)}</Badge>}
                    </div>
                  </div>
                  <span className="muted text-xs tnum">{formatDateTime(a.timestamp, i18n.language)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
