import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Card, PageHeader, Pagination, Select } from '../../../components/ui';
import { AuditTable } from './CustomerDetailPage';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

const ACTIONS = [
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CUSTOMER_ACTIVATED',
  'CUSTOMER_SUSPENDED',
  'CUSTOMER_REACTIVATED',
  'CUSTOMER_CANCELLED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_EXTENDED',
  'SUBSCRIPTION_SUSPENDED',
  'SUBSCRIPTION_REACTIVATED',
  'SUBSCRIPTION_CANCELLED',
  'PLAN_CHANGED',
  'PRICE_CHANGED',
  'PAYMENT_RECORDED',
  'PAYMENT_VOIDED',
  'PAYMENT_REFUNDED',
  'FEATURE_OVERRIDE_CHANGED',
  'USER_CREATED',
  'USER_ACTIVATED',
  'USER_DISABLED',
  'USER_UPDATED',
  'COMPANY_CREATED',
  'COMPANY_UPDATED',
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'FEATURE_UPDATED',
  'PLATFORM_USER_CREATED',
  'PLATFORM_USER_ACTIVATED',
  'PLATFORM_USER_DISABLED',
  'UPLOAD_RECORDED',
];

const ENTITIES = ['CUSTOMER', 'SUBSCRIPTION', 'PLAN', 'FEATURE', 'PAYMENT', 'USER', 'COMPANY', 'PLATFORM_USER'];

export function AuditPage() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const [filters, setFilters] = useState<Record<string, string>>({ action: '', entityType: '', customerId: '', actor: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const customersQ = useQuery({ queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 100 }), queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 100 }) });

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.audit({ ...filters, page, pageSize: 20 }),
    queryFn: () => saasAdminApi.getAudit({ ...filters, page, pageSize: 20 }),
    placeholderData: (prev) => prev,
  });

  if (!canAccessSection(role, 'audit')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.audit')}`} title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')} />
      <Card>
        <div className="table-tools">
          <Select value={filters.customerId} onChange={(e) => { setFilters((f) => ({ ...f, customerId: e.target.value })); setPage(1); }} style={{ width: 'auto' }} aria-label={t('admin.audit.filter_customer')}>
            <option value="">{t('admin.audit.filter_customer')}: {t('all')}</option>
            {customersQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={filters.action} onChange={(e) => { setFilters((f) => ({ ...f, action: e.target.value })); setPage(1); }} style={{ width: 'auto' }} aria-label={t('admin.audit.filter_action')}>
            <option value="">{t('admin.audit.filter_action')}: {t('all')}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{t(`admin.audit_actions.${a}`, { defaultValue: a })}</option>
            ))}
          </Select>
          <Select value={filters.entityType} onChange={(e) => { setFilters((f) => ({ ...f, entityType: e.target.value })); setPage(1); }} style={{ width: 'auto' }} aria-label={t('admin.audit.filter_entity')}>
            <option value="">{t('admin.audit.filter_entity')}: {t('all')}</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
          <input className="input" style={{ width: 'auto' }} placeholder={t('admin.audit.filter_actor')} value={filters.actor} onChange={(e) => { setFilters((f) => ({ ...f, actor: e.target.value })); setPage(1); }} aria-label={t('admin.audit.filter_actor')} />
          <input type="date" className="input" style={{ width: 'auto' }} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} aria-label={t('admin.audit.filter_from')} />
          <input type="date" className="input" style={{ width: 'auto' }} value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} aria-label={t('admin.audit.filter_to')} />
        </div>
        <AuditTable events={q.data?.items} loading={q.isLoading} />
        {q.data && <Pagination page={page} pageSize={20} total={q.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
