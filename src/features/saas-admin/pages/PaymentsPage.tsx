import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Payment } from '../../../api/types';
import { Button, ConfirmDialog, PaymentStatusBadge, useToast } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminDataTable, type AdminCol } from '../components/AdminDataTable';
import { PaymentDrawer } from '../components/drawers';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

export function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.payment.write');
  const [filters, setFilters] = useState({ status: 'ALL', method: 'ALL', currency: 'ALL', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [recordOpen, setRecordOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ payment: Payment; kind: 'void' | 'refund' } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const id = window.setTimeout(() => { setFilters((f) => ({ ...f, search: searchInput.trim() })); setPage(1); }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const customersQ = useQuery({ queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 100 }), queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 100 }) });
  const q = useQuery({
    queryKey: queryKeys.saasAdmin.payments({ ...filters, page, pageSize }),
    queryFn: () => saasAdminApi.getPayments({
      ...filters,
      status: filters.status === 'ALL' ? '' : filters.status,
      method: filters.method === 'ALL' ? '' : filters.method,
      currency: filters.currency === 'ALL' ? '' : filters.currency,
      page,
      pageSize,
    }),
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

  if (!canAccessSection(role, 'payments')) return <Navigate to="/saas-admin/overview" replace />;

  const columns: AdminCol<Payment>[] = [
    { id: 'customer', header: t('admin.payments.col_customer'), cell: (p) => <Link to={`/saas-admin/customers/${p.customerId}`} className="strong">{p.customerName}</Link> },
    { id: 'amount', header: t('admin.payments.col_amount'), className: 'num', cell: (p) => <span className="strong tnum">{formatAmount(p.amount, p.currency, i18n.language)}</span> },
    { id: 'currency', header: t('admin.payments.col_currency'), cell: (p) => p.currency },
    { id: 'date', header: t('admin.payments.col_date'), cell: (p) => <span className="tnum">{formatDate(p.paymentDate, i18n.language)}</span> },
    { id: 'method', header: t('admin.payments.col_method'), cell: (p) => t(`admin.methods.${p.method}`) },
    { id: 'status', header: t('admin.payments.col_status'), cell: (p) => <PaymentStatusBadge status={p.status} /> },
    { id: 'reference', header: t('admin.payments.col_reference'), cell: (p) => <span className="muted text-sm">{p.referenceNumber ?? '—'}</span> },
  ];

  return (
    <>
      <AdminPageHeader
        title={t('admin.payments.title')}
        description={t('admin.payments.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => setRecordOpen(true)}>+ {t('admin.payments.record')}</Button> : undefined}
      />
      <AdminDataTable
        rows={q.data?.items ?? []}
        columns={columns}
        rowKey={(p) => p.id}
        total={q.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(s) => { setPageSize(s); setPage(1); }}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder={t('admin.payments.search')}
        filters={[
          {
            key: 'status',
            label: t('admin.payments.filter_status'),
            value: filters.status,
            options: [
              { value: 'ALL', label: t('all') },
              ...(['PENDING', 'PAID', 'VOID', 'REFUNDED'] as const).map((s) => ({ value: s, label: t(`admin.payment_status.${s}`) })),
            ],
          },
          {
            key: 'method',
            label: t('admin.payments.filter_method'),
            value: filters.method,
            options: [
              { value: 'ALL', label: t('all') },
              ...(['BANK_TRANSFER', 'CASH', 'MANUAL', 'OTHER'] as const).map((m) => ({ value: m, label: t(`admin.methods.${m}`) })),
            ],
          },
          {
            key: 'currency',
            label: t('admin.payments.filter_currency'),
            value: filters.currency,
            options: ['ALL', 'USD', 'SAR', 'EUR', 'GBP'].map((c) => ({ value: c, label: c === 'ALL' ? t('all') : c })),
          },
        ]}
        onFilterChange={(key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); }}
        onReset={() => { setFilters({ status: 'ALL', method: 'ALL', currency: 'ALL', search: '' }); setSearchInput(''); setPage(1); }}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyTitle={t('empty.payments')}
        actions={canWrite ? (p) => [
          ...((p.status === 'PAID' || p.status === 'PENDING') ? [{ label: t('admin.payments.void'), onClick: () => setConfirm({ payment: p, kind: 'void' as const }), danger: true }] : []),
          ...(p.status === 'PAID' ? [{ label: t('admin.payments.refund'), onClick: () => setConfirm({ payment: p, kind: 'refund' as const }), danger: true }] : []),
        ] : undefined}
      />
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
