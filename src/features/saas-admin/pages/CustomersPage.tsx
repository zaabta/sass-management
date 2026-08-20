import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Customer, CustomerFilters } from '../../../api/types';
import { Button, ConfirmDialog, CustomerStatusBadge, ExpiryBadge, useToast } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminAvatar } from '../components/chrome';
import { AdminDataTable, type AdminCol } from '../components/AdminDataTable';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.customer.write');
  const [params] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CustomerFilters>({
    status: 'ALL',
    plan: 'ALL',
    expiry: (params.get('expiry') as CustomerFilters['expiry']) ?? 'ALL',
    sortBy: 'createdAt',
    sortDir: 'desc',
    page: 1,
    pageSize: 10,
  });
  const [confirm, setConfirm] = useState<{ kind: 'activate' | 'deactivate'; customer: Customer } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const expiry = params.get('expiry');
    if (expiry) setFilters((f) => ({ ...f, expiry: expiry as CustomerFilters['expiry'] }));
  }, [params]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setFilters((f) => ({ ...f, page: 1 }));
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });
  const q = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ ...filters, search }),
    queryFn: () => saasAdminApi.getCustomers({ ...filters, search }),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'suspend' | 'reactivate' }) => saasAdminApi.customerAction(id, action),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.id);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (!canAccessSection(role, 'customers')) return <Navigate to="/saas-admin/overview" replace />;

  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  const columns: AdminCol<Customer>[] = [
    {
      id: 'name',
      header: t('admin.customers.col_customer'),
      sortable: true,
      sortKey: 'name',
      cell: (c) => (
        <div className="flex" style={{ gap: 8 }}>
          <AdminAvatar name={c.name} />
          <div>
            <Link to={`/saas-admin/customers/${c.id}`} className="strong">{c.name}</Link>
            <div className="muted text-xs mono">{c.code}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('admin.customers.col_status'),
      sortable: true,
      sortKey: 'status',
      cell: (c) => <CustomerStatusBadge status={c.status} />,
    },
    {
      id: 'plan',
      header: t('admin.customers.col_plan'),
      cell: (c) => (c.planCode ? <span className="strong">{c.planCode}</span> : <span className="muted">—</span>),
    },
    {
      id: 'companies',
      header: t('admin.customers.col_companies'),
      className: 'num',
      cell: (c) => <span className="tnum">{c.stats?.companies ?? 0}</span>,
    },
    {
      id: 'users',
      header: t('admin.customers.col_users'),
      className: 'num',
      cell: (c) => <span className="tnum">{c.stats?.users ?? 0}</span>,
    },
    {
      id: 'branches',
      header: t('admin.customers.col_branches'),
      className: 'num',
      cell: (c) => <span className="tnum">{c.stats?.branches ?? 0}</span>,
    },
    {
      id: 'startDate',
      header: t('admin.customers.col_start'),
      sortable: true,
      sortKey: 'subscriptionStart',
      cell: (c) => <span className="tnum">{formatDate(c.subscriptionStart, i18n.language)}</span>,
    },
    {
      id: 'expiryDate',
      header: t('admin.customers.col_expiry'),
      sortable: true,
      sortKey: 'expiryDate',
      cell: (c) =>
        c.expiryDate ? (
          <>
            <div className="tnum">{formatDate(c.expiryDate, i18n.language)}</div>
            <ExpiryBadge expiresAt={c.expiryDate} status={c.status} />
          </>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      id: 'agreedPrice',
      header: t('admin.customers.col_price'),
      className: 'num',
      sortable: true,
      sortKey: 'agreedPrice',
      cell: (c) => <span className="strong tnum">{formatAmount(c.agreedPrice, c.currency, i18n.language, 0)}</span>,
    },
    {
      id: 'lastPayment',
      header: t('admin.customers.col_last_payment'),
      cell: (c) => <span className="tnum">{formatDate(c.lastPaymentAt, i18n.language)}</span>,
    },
  ];

  const runConfirm = () => {
    if (!confirm) return;
    const action = confirm.kind === 'deactivate' ? 'suspend' : confirm.customer.status === 'SUSPENDED' ? 'reactivate' : 'activate';
    mutation.mutate({ id: confirm.customer.id, action });
  };

  return (
    <>
      <AdminPageHeader
        title={t('admin.customers.title')}
        description={t('admin.customers.subtitle')}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/saas-admin/customers/create')}>
              + {t('admin.customers.create')}
            </Button>
          ) : undefined
        }
      />
      <AdminDataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        total={total}
        page={filters.page ?? 1}
        pageSize={filters.pageSize ?? 10}
        onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
        onPageSize={(s) => setFilters((f) => ({ ...f, pageSize: s, page: 1 }))}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder={t('admin.customers.search_ph')}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir}
        onSort={(key, dir) => setFilters((f) => ({ ...f, sortBy: key, sortDir: dir, page: 1 }))}
        filters={[
          {
            key: 'status',
            label: t('admin.customers.filter_status'),
            value: filters.status ?? 'ALL',
            options: [
              { value: 'ALL', label: t('all') },
              { value: 'ACTIVE', label: t('admin.customer_status.ACTIVE') },
              { value: 'SUSPENDED', label: t('admin.customer_status.SUSPENDED') },
              { value: 'CANCELLED', label: t('admin.customer_status.CANCELLED') },
            ],
          },
          {
            key: 'plan',
            label: t('admin.customers.filter_plan'),
            value: filters.plan ?? 'ALL',
            options: [
              { value: 'ALL', label: t('all') },
              ...(plansQ.data ?? []).map((p) => ({ value: p.code, label: p.name })),
            ],
          },
          {
            key: 'expiry',
            label: t('admin.customers.filter_expiry'),
            value: filters.expiry ?? 'ALL',
            options: [
              { value: 'ALL', label: t('admin.customers.filter_expiry_all') },
              { value: 'EXPIRED', label: t('admin.customers.filter_expiry_expired') },
              { value: 'EXPIRING_7', label: t('admin.customers.filter_expiry_expiring7') },
              { value: 'EXPIRING_30', label: t('admin.customers.filter_expiry_expiring30') },
            ],
          },
        ]}
        onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }))}
        onReset={() => {
          setSearchInput('');
          setSearch('');
          setFilters((f) => ({ ...f, status: 'ALL', plan: 'ALL', expiry: 'ALL', page: 1 }));
        }}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyTitle={t('admin.customers.no_match')}
        emptyDescription={t('empty.customers')}
        actions={(c) => [
          { label: t('admin.customers.view'), onClick: () => navigate(`/saas-admin/customers/${c.id}`) },
          ...(canWrite && c.status === 'ACTIVE'
            ? [{ label: t('actions.deactivate'), onClick: () => setConfirm({ kind: 'deactivate' as const, customer: c }), danger: true }]
            : []),
          ...(canWrite && c.status !== 'ACTIVE'
            ? [{ label: t('actions.activate'), onClick: () => setConfirm({ kind: 'activate' as const, customer: c }) }]
            : []),
        ]}
      />
      <ConfirmDialog
        open={confirm?.kind === 'deactivate'}
        message={t('confirm.suspend_customer', { name: confirm?.customer.name })}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={mutation.isPending}
      />
      <ConfirmDialog
        open={confirm?.kind === 'activate'}
        message={t('confirm.reactivate_customer', { name: confirm?.customer.name })}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={mutation.isPending}
        danger={false}
      />
    </>
  );
}
