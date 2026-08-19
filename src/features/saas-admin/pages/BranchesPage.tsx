import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Card, SearchInput } from '../../../components/ui';
import { AdminPageHeader, AdminTableSkeleton } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState } from '../components/chrome';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function BranchesPage() {
  const { t } = useTranslation();
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
        id: co.id,
        company: co.name,
        customer: customer.name,
        customerId: customer.id,
        country: customer.country,
        branches: co.branches,
        users: co.users,
        currency: co.baseCurrency,
        status: co.status,
      })),
    );
    const q = search.trim().toLowerCase();
    return q ? list.filter((r) => `${r.company} ${r.customer}`.toLowerCase().includes(q)) : list;
  }, [customersQ.data, companyQueries, search]);

  if (!canAccessSection(role, 'branches')) return <Navigate to="/saas-admin/overview" replace />;

  const loading = customersQ.isLoading || companyQueries.some((q) => q.isLoading);
  const totalBranches = rows.reduce((s, r) => s + r.branches, 0);

  return (
    <>
      <AdminPageHeader
        title={t('admin.branches_page.title')}
        description={t('admin.branches_page.subtitle')}
        meta={<span className="muted">{t('admin.branches_page.total', { count: totalBranches })}</span>}
      />
      {customersQ.isError ? (
        <AdminErrorState onRetry={() => void customersQ.refetch()} />
      ) : (
        <Card>
          <div className="sa-toolbar">
            <div className="grow">
              <SearchInput value={search} onChange={setSearch} placeholder={t('admin.branches_page.search')} />
            </div>
          </div>
          {loading ? (
            <AdminTableSkeleton rows={5} cols={6} />
          ) : rows.length === 0 ? (
            <AdminEmptyState icon={<GitBranch size={18} />} title={t('admin.branches_page.empty')} description={t('admin.branches_page.empty_hint')} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.branches_page.col_company')}</th>
                    <th>{t('admin.branches_page.col_customer')}</th>
                    <th>{t('admin.branches_page.col_country')}</th>
                    <th className="num">{t('admin.branches_page.col_branches')}</th>
                    <th className="num">{t('admin.branches_page.col_users')}</th>
                    <th>{t('admin.branches_page.col_currency')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">
                        <Link to={`/saas-admin/customers/${r.customerId}`}>{r.company}</Link>
                      </td>
                      <td>{r.customer}</td>
                      <td>{r.country ?? '—'}</td>
                      <td className="num">{r.branches}</td>
                      <td className="num">{r.users}</td>
                      <td>{r.currency}</td>
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
