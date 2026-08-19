import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatNumber } from '../../../lib/format';
import { Card } from '../../../components/ui';
import { AdminMetricCard, AdminPageHeader } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState, TimeRangePills } from '../components/chrome';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '12m'>('30d');

  const customersQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 50 }),
    queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 50 }),
  });
  const overviewQ = useQuery({ queryKey: queryKeys.saasAdmin.overview, queryFn: () => saasAdminApi.getOverview() });

  const usageQueries = useQueries({
    queries: (customersQ.data?.items ?? []).slice(0, 12).map((c) => ({
      queryKey: queryKeys.saasAdmin.usage(c.id),
      queryFn: () => saasAdminApi.getUsage(c.id),
      enabled: !!customersQ.data,
    })),
  });

  const totals = useMemo(() => {
    const acc: Record<string, { current: number; limit: number | null }> = {};
    for (const q of usageQueries) {
      for (const item of q.data?.items ?? []) {
        const prev = acc[item.key] ?? { current: 0, limit: item.limit };
        acc[item.key] = { current: prev.current + item.current, limit: item.limit };
      }
    }
    return acc;
  }, [usageQueries]);

  if (!canAccessSection(role, 'usage')) return <Navigate to="/saas-admin/overview" replace />;

  const customers = customersQ.data?.items ?? [];
  const companies = customers.reduce((s, c) => s + (c.stats?.companies ?? 0), 0);
  const branches = customers.reduce((s, c) => s + (c.stats?.branches ?? 0), 0);
  const users = customers.reduce((s, c) => s + (c.stats?.users ?? 0), 0);

  return (
    <>
      <AdminPageHeader
        title={t('admin.usage_page.title')}
        description={t('admin.usage_page.subtitle')}
        actions={<TimeRangePills value={range} onChange={setRange} />}
      />
      {customersQ.isError ? (
        <AdminErrorState onRetry={() => void customersQ.refetch()} />
      ) : (
        <>
          <div className="admin-metric-grid mb-4">
            <AdminMetricCard label={t('admin.usage_page.users')} value={formatNumber(users, i18n.language)} />
            <AdminMetricCard label={t('admin.usage_page.companies')} value={formatNumber(companies, i18n.language)} />
            <AdminMetricCard label={t('admin.usage_page.branches')} value={formatNumber(branches, i18n.language)} />
            <AdminMetricCard label={t('admin.usage_page.accounts')} value={formatNumber(overviewQ.data?.customers.total ?? customers.length, i18n.language)} />
          </div>
          <div className="sa-split">
            <Card>
              <div className="card-header">
                <h3>{t('admin.usage_page.quotas')}</h3>
                <span className="card-sub">{t('admin.range.' + (range === '12m' ? 'm12' : range === '7d' ? 'd7' : range === '90d' ? 'd90' : 'd30'))}</span>
              </div>
              <div className="card-body">
                {Object.keys(totals).length === 0 && !usageQueries.some((q) => q.isLoading) && (
                  <AdminEmptyState icon={<Gauge size={18} />} title={t('admin.usage_page.empty')} description={t('admin.usage_page.empty_hint')} />
                )}
                {Object.entries(totals).map(([key, v]) => (
                  <div className="usage-line" key={key}>
                    <div className="usage-head">
                      <span>{t(`admin.quotas.${quotaI18n(key)}`, { defaultValue: key })}</span>
                      <span className="muted tnum">
                        {v.current} / {v.limit == null ? t('unlimited') : v.limit}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${v.limit ? Math.min(100, (v.current / v.limit) * 100) : 8}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="card-header">
                <h3>{t('admin.usage_page.by_customer')}</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('admin.customers.col_customer')}</th>
                      <th className="num">{t('admin.usage_page.companies')}</th>
                      <th className="num">{t('admin.usage_page.branches')}</th>
                      <th className="num">{t('admin.usage_page.users')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td><Link to={`/saas-admin/customers/${c.id}`} className="strong">{c.name}</Link></td>
                        <td className="num">{c.stats?.companies ?? 0}</td>
                        <td className="num">{c.stats?.branches ?? 0}</td>
                        <td className="num">{c.stats?.users ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function quotaI18n(key: string) {
  if (key === 'MAX_COMPANIES') return 'companies';
  if (key === 'MAX_BRANCHES') return 'branches';
  if (key === 'MAX_USERS') return 'users';
  if (key === 'MAX_UPLOADS_PER_MONTH') return 'uploads';
  if (key === 'MAX_STORAGE_GB') return 'storage';
  if (key === 'MAX_AI_REQUESTS_PER_MONTH') return 'ai';
  return key;
}
