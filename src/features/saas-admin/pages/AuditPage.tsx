import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDateTime } from '../../../lib/format';
import type { AuditEvent } from '../../../api/types';
import { Badge } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminDataTable, type AdminCol } from '../components/AdminDataTable';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

const ACTIONS = [
  'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_ACTIVATED', 'CUSTOMER_SUSPENDED', 'CUSTOMER_REACTIVATED', 'CUSTOMER_CANCELLED',
  'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_REACTIVATED', 'SUBSCRIPTION_CANCELLED',
  'PLAN_CHANGED', 'PRICE_CHANGED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED', 'PAYMENT_REFUNDED', 'FEATURE_OVERRIDE_CHANGED',
  'USER_CREATED', 'USER_ACTIVATED', 'USER_DISABLED', 'USER_UPDATED', 'COMPANY_CREATED', 'COMPANY_UPDATED',
  'PLAN_CREATED', 'PLAN_UPDATED', 'FEATURE_UPDATED', 'PLATFORM_USER_CREATED', 'PLATFORM_USER_ACTIVATED', 'PLATFORM_USER_DISABLED', 'UPLOAD_RECORDED',
];
const ENTITIES = ['CUSTOMER', 'SUBSCRIPTION', 'PLAN', 'FEATURE', 'PAYMENT', 'USER', 'COMPANY', 'PLATFORM_USER'];

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const [filters, setFilters] = useState({ action: 'ALL', entityType: 'ALL', customerId: 'ALL', actor: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const id = window.setTimeout(() => { setFilters((f) => ({ ...f, actor: searchInput.trim() })); setPage(1); }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const customersQ = useQuery({ queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 100 }), queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 100 }) });
  const q = useQuery({
    queryKey: queryKeys.saasAdmin.audit({ ...filters, page, pageSize }),
    queryFn: () => saasAdminApi.getAudit({
      action: filters.action === 'ALL' ? '' : filters.action,
      entityType: filters.entityType === 'ALL' ? '' : filters.entityType,
      customerId: filters.customerId === 'ALL' ? '' : filters.customerId,
      actor: filters.actor,
      page,
      pageSize,
    }),
    placeholderData: (prev) => prev,
  });

  if (!canAccessSection(role, 'audit')) return <Navigate to="/saas-admin/overview" replace />;

  const columns: AdminCol<AuditEvent>[] = [
    { id: 'timestamp', header: t('admin.audit.col_timestamp'), cell: (a) => <span className="tnum muted text-sm">{formatDateTime(a.timestamp, i18n.language)}</span> },
    { id: 'actor', header: t('admin.audit.col_actor'), cell: (a) => a.actor },
    { id: 'role', header: t('admin.audit.col_role'), cell: (a) => (a.platformRole ? <Badge tone={a.platformRole}>{t(`admin.roles.${a.platformRole}`)}</Badge> : <span className="muted">{t('admin.audit.system')}</span>) },
    { id: 'customer', header: t('admin.audit.col_customer'), cell: (a) => a.customerName ?? '—' },
    { id: 'action', header: t('admin.audit.col_action'), cell: (a) => <span className="strong">{t(`admin.audit_actions.${a.action}`, { defaultValue: a.action })}</span> },
    { id: 'entity', header: t('admin.audit.col_entity'), cell: (a) => a.entityLabel },
  ];

  return (
    <>
      <AdminPageHeader title={t('admin.audit.title')} description={t('admin.audit.subtitle')} />
      <AdminDataTable
        rows={q.data?.items ?? []}
        columns={columns}
        rowKey={(a) => a.id}
        total={q.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(s) => { setPageSize(s); setPage(1); }}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder={t('admin.audit.filter_actor')}
        filters={[
          {
            key: 'customerId',
            label: t('admin.audit.filter_customer'),
            value: filters.customerId,
            options: [{ value: 'ALL', label: t('all') }, ...(customersQ.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))],
          },
          {
            key: 'action',
            label: t('admin.audit.filter_action'),
            value: filters.action,
            options: [{ value: 'ALL', label: t('all') }, ...ACTIONS.map((a) => ({ value: a, label: t(`admin.audit_actions.${a}`, { defaultValue: a }) }))],
          },
          {
            key: 'entityType',
            label: t('admin.audit.filter_entity'),
            value: filters.entityType,
            options: [{ value: 'ALL', label: t('all') }, ...ENTITIES.map((e) => ({ value: e, label: e }))],
          },
        ]}
        onFilterChange={(key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); }}
        onReset={() => { setFilters({ action: 'ALL', entityType: 'ALL', customerId: 'ALL', actor: '' }); setSearchInput(''); setPage(1); }}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyTitle={t('empty.audit')}
      />
    </>
  );
}
