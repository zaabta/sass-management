import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Payment } from '../../../api/types';
import { Button, Card, ConfirmDialog, EmptyState, PageHeader, Pagination, PaymentStatusBadge, Select, TableSkeleton, useToast } from '../../../components/ui';
import { ActionMenu } from '../../../components/admin';
import { PaymentDrawer } from '../components/drawers';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

export function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.payment.write');

  const [filters, setFilters] = useState<Record<string, string>>({ status: 'ALL', method: 'ALL', currency: 'ALL', customerId: '', from: '', to: '', search: '' });
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ payment: Payment; kind: 'void' | 'refund' } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const customersQ = useQuery({ queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 100 }), queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 100 }) });

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.payments({ ...filters, page, pageSize: 10 }),
    queryFn: () => saasAdminApi.getPayments({ ...filters, status: filters.status === 'ALL' ? '' : filters.status, method: filters.method === 'ALL' ? '' : filters.method, currency: filters.currency === 'ALL' ? '' : filters.currency, page, pageSize: 10 }),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: ({ payment, kind }: { payment: Payment; kind: 'void' | 'refund' }) => (kind === 'void' ? saasAdminApi.voidPayment(payment.id) : saasAdminApi.refundPayment(payment.id)),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.payment.customerId);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const currencies = ['ALL', 'USD', 'SAR', 'EUR', 'GBP', 'CHF', 'SGD'];

  if (!canAccessSection(role, 'payments')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader
        title={t('admin.payments.title')}
        eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.payments')}`}
        subtitle={t('admin.payments.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => setRecordOpen(true)}>+ {t('admin.payments.record')}</Button> : undefined}
      />
      <Card>
        <div className="table-tools">
          <Select value={filters.customerId} onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.payments.filter_customer')}>
            <option value="">{t('admin.payments.filter_customer')}: {t('all')}</option>
            {customersQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={filters.currency} onChange={(e) => setFilters((f) => ({ ...f, currency: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.payments.filter_currency')}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c === 'ALL' ? `${t('admin.payments.filter_currency')}: ${t('all')}` : c}</option>
            ))}
          </Select>
          <Select value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.payments.filter_method')}>
            <option value="ALL">{t('admin.payments.filter_method')}: {t('all')}</option>
            {(['BANK_TRANSFER', 'CASH', 'MANUAL', 'OTHER'] as const).map((m) => (
              <option key={m} value={m}>{t(`admin.methods.${m}`)}</option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.payments.filter_status')}>
            <option value="ALL">{t('admin.payments.filter_status')}: {t('all')}</option>
            {(['PENDING', 'PAID', 'VOID', 'REFUNDED'] as const).map((s) => (
              <option key={s} value={s}>{t(`admin.payment_status.${s}`)}</option>
            ))}
          </Select>
          <input type="date" className="input" style={{ width: 'auto' }} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} aria-label={t('admin.payments.filter_from')} />
          <input type="date" className="input" style={{ width: 'auto' }} value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} aria-label={t('admin.payments.filter_to')} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.payments.col_customer')}</th>
                <th>{t('admin.payments.col_subscription')}</th>
                <th className="num">{t('admin.payments.col_amount')}</th>
                <th>{t('admin.payments.col_currency')}</th>
                <th>{t('admin.payments.col_date')}</th>
                <th>{t('admin.payments.col_method')}</th>
                <th>{t('admin.payments.col_status')}</th>
                <th>{t('admin.payments.col_reference')}</th>
                <th>{t('admin.payments.col_recorded_by')}</th>
                {canWrite && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={10}><TableSkeleton rows={6} cols={1} /></td></tr>}
              {q.data?.items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/saas-admin/customers/${p.customerId}`} className="strong">{p.customerName}</Link></td>
                  <td className="muted text-sm">{p.subscriptionId ?? '—'}</td>
                  <td className="num strong">{formatAmount(p.amount, p.currency, i18n.language)}</td>
                  <td>{p.currency}</td>
                  <td className="tnum">{formatDate(p.paymentDate, i18n.language)}</td>
                  <td>{t(`admin.methods.${p.method}`)}</td>
                  <td><PaymentStatusBadge status={p.status} /></td>
                  <td className="muted text-sm">{p.referenceNumber ?? '—'}</td>
                  <td className="muted text-sm">{p.recordedBy}</td>
                  {canWrite && (
                    <td>
                      <ActionMenu
                        items={[
                          ...((p.status === 'PAID' || p.status === 'PENDING') ? [{ label: t('admin.payments.void'), onClick: () => setConfirm({ payment: p, kind: 'void' as const }), danger: true }] : []),
                          ...(p.status === 'PAID' ? [{ label: t('admin.payments.refund'), onClick: () => setConfirm({ payment: p, kind: 'refund' as const }), danger: true }] : []),
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {!q.isLoading && q.data?.items.length === 0 && <tr><td colSpan={10}><EmptyState icon="💳">{t('empty.payments')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
        {q.data && <Pagination page={page} pageSize={10} total={q.data.total} onPage={setPage} />}
      </Card>

      {recordOpen && (
        <PaymentDrawer
          customerId=""
          customerName=""
          customerOptions={customersQ.data?.items.map((c) => ({ id: c.id, name: c.name })) ?? []}
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        message={t(confirm?.kind === 'void' ? 'confirm.void_payment' : 'confirm.refund_payment', { ref: confirm?.payment.referenceNumber ?? confirm?.payment.id, name: confirm?.payment.customerName ?? '' })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && mutation.mutate(confirm)}
        loading={mutation.isPending}
      />
    </>
  );
}
