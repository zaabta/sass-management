import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatNumber } from '../../../lib/format';
import { Card } from '../../../components/ui';
import { AdminMetricCard, AdminPageHeader } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState } from '../components/chrome';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function AiUsagePage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const customersQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 40 }),
    queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 40 }),
  });

  const usageQueries = useQueries({
    queries: (customersQ.data?.items ?? []).map((c) => ({
      queryKey: queryKeys.saasAdmin.usage(c.id),
      queryFn: () => saasAdminApi.getUsage(c.id),
      enabled: !!customersQ.data,
    })),
  });

  const rows = useMemo(() => {
    const customers = customersQ.data?.items ?? [];
    return customers.map((c, i) => {
      const items = usageQueries[i]?.data?.items ?? [];
      const ai = items.find((x) => x.key === 'MAX_AI_REQUESTS_PER_MONTH' || /AI/i.test(x.key));
      return {
        id: c.id,
        name: c.name,
        requests: ai?.current ?? 0,
        limit: ai?.limit ?? null,
        hasAi: !!ai,
      };
    });
  }, [customersQ.data, usageQueries]);

  const totalRequests = rows.reduce((s, r) => s + r.requests, 0);
  const activeAi = rows.filter((r) => r.requests > 0).length;
  const hasAnyAiMetric = rows.some((r) => r.hasAi);

  if (!canAccessSection(role, 'ai-usage')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <AdminPageHeader title={t('admin.ai_usage.title')} description={t('admin.ai_usage.subtitle')} />
      {customersQ.isError ? (
        <AdminErrorState onRetry={() => void customersQ.refetch()} />
      ) : (
        <>
          <div className="admin-metric-grid mb-4">
            <AdminMetricCard label={t('admin.ai_usage.total_requests')} value={hasAnyAiMetric ? formatNumber(totalRequests, i18n.language) : '—'} />
            <AdminMetricCard label={t('admin.ai_usage.tokens')} value="—" foot={t('admin.ai_usage.not_provided')} />
            <AdminMetricCard label={t('admin.ai_usage.cost')} value="—" foot={t('admin.ai_usage.not_provided')} />
            <AdminMetricCard label={t('admin.ai_usage.active_users')} value={hasAnyAiMetric ? formatNumber(activeAi, i18n.language) : '—'} />
          </div>
          <Card>
            <div className="card-header">
              <h3>{t('admin.ai_usage.by_company')}</h3>
            </div>
            {!hasAnyAiMetric && !usageQueries.some((q) => q.isLoading) ? (
              <AdminEmptyState
                icon={<Cpu size={18} />}
                title={t('admin.ai_usage.empty')}
                description={t('admin.ai_usage.empty_hint')}
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('admin.customers.col_customer')}</th>
                      <th className="num">{t('admin.ai_usage.requests')}</th>
                      <th className="num">{t('admin.ai_usage.limit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><Link to={`/saas-admin/customers/${r.id}`} className="strong">{r.name}</Link></td>
                        <td className="num">{r.hasAi ? r.requests : '—'}</td>
                        <td className="num">{r.limit == null ? t('unlimited') : r.limit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
