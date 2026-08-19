import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDate } from '../../../lib/format';
import { Badge, Card, SearchInput } from '../../../components/ui';
import { AdminPageHeader, AdminTableSkeleton, StatusBadge } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState } from '../components/chrome';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function CompaniesPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const [search, setSearch] = useState('');

  const customersQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 50 }),
    queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 50 }),
  });

  const companyQueries = useQueries({
    queries: (customersQ.data?.items ?? []).map((c) => ({
      queryKey: queryKeys.saasAdmin.customerCompanies(c.id),
      queryFn: () => saasAdminApi.getCompanies(c.id),
      enabled: !!customersQ.data,
    })),
  });

  const rows = useMemo(() => {
    const customers = customersQ.data?.items ?? [];
    const list = customers.flatMap((customer, i) =>
      (companyQueries[i]?.data ?? []).map((co) => ({
        ...co,
        owner: customer.email,
        country: customer.country,
        plan: customer.planCode,
        subscription: customer.subscriptionStatus,
        customerName: customer.name,
        customerId: customer.id,
      })),
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => [r.name, r.customerName, r.owner, r.country ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [customersQ.data, companyQueries, search]);

  if (!canAccessSection(role, 'companies')) return <Navigate to="/saas-admin/overview" replace />;

  const loading = customersQ.isLoading || companyQueries.some((q) => q.isLoading);

  return (
    <>
      <AdminPageHeader title={t('admin.companies_page.title')} description={t('admin.companies_page.subtitle')} />
      {customersQ.isError ? (
        <AdminErrorState onRetry={() => void customersQ.refetch()} />
      ) : (
        <Card>
          <div className="sa-toolbar">
            <div className="grow">
              <SearchInput value={search} onChange={setSearch} placeholder={t('admin.companies_page.search')} />
            </div>
            <span className="result-count muted text-sm">{t('table.results', { count: rows.length })}</span>
          </div>
          {loading ? (
            <AdminTableSkeleton rows={6} cols={8} />
          ) : rows.length === 0 ? (
            <AdminEmptyState icon={<Building2 size={18} />} title={t('empty.companies')} description={t('admin.companies_page.empty_hint')} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.companies_page.col_company')}</th>
                    <th>{t('admin.companies_page.col_owner')}</th>
                    <th>{t('admin.companies_page.col_country')}</th>
                    <th>{t('admin.companies_page.col_currency')}</th>
                    <th className="num">{t('admin.companies_page.col_branches')}</th>
                    <th className="num">{t('admin.companies_page.col_users')}</th>
                    <th>{t('admin.companies_page.col_plan')}</th>
                    <th>{t('admin.companies_page.col_subscription')}</th>
                    <th>{t('admin.companies_page.col_status')}</th>
                    <th>{t('admin.companies_page.col_created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/saas-admin/customers/${r.customerId}`} className="strong">{r.name}</Link>
                        <div className="muted text-xs">{r.customerName}</div>
                      </td>
                      <td className="text-sm">{r.owner}</td>
                      <td>{r.country ?? '—'}</td>
                      <td>{r.baseCurrency}</td>
                      <td className="num">{r.branches}</td>
                      <td className="num">{r.users}</td>
                      <td>{r.plan ?? '—'}</td>
                      <td>{r.subscription ? <StatusBadge status={r.subscription}>{t(`admin.subscription_status.${r.subscription}`)}</StatusBadge> : '—'}</td>
                      <td><Badge tone={r.status}>{t(`status.${r.status.toLowerCase()}`)}</Badge></td>
                      <td className="tnum muted">{formatDate(r.createdAt, i18n.language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
