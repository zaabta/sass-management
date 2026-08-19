import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Payment } from '../../../api/types';
import { Card, ConfirmDialog, PaymentStatusBadge, SearchInput, useToast } from '../../../components/ui';
import { ActionMenu, AdminPageHeader, AdminPagination, AdminTableSkeleton } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState } from '../components/chrome';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

/** Invoices surface — backed by existing payments API (no invoice endpoints). */
export function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.payment.write');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ payment: Payment; kind: 'void' | 'refund' } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.payments({ search, page, pageSize: 10 }),
    queryFn: () => saasAdminApi.getPayments({ search, page, pageSize: 10 }),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: ({ payment, kind }: { payment: Payment; kind: 'void' | 'refund' }) =>
      kind === 'void' ? saasAdminApi.voidPayment(payment.id) : saasAdminApi.refundPayment(payment.id),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.payment.customerId);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (!canAccessSection(role, 'invoices')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <AdminPageHeader title={t('admin.invoices.title')} description={t('admin.invoices.subtitle')} />
      {q.isError ? (
        <AdminErrorState onRetry={() => void q.refetch()} />
      ) : (
        <Card>
          <div className="sa-toolbar">
            <div className="grow">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('admin.invoices.search')} />
            </div>
          </div>
          {q.isLoading ? (
            <AdminTableSkeleton />
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <AdminEmptyState icon={<Receipt size={18} />} title={t('admin.invoices.empty')} description={t('admin.invoices.empty_hint')} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.invoices.col_id')}</th>
                    <th>{t('admin.invoices.col_customer')}</th>
                    <th className="num">{t('admin.invoices.col_amount')}</th>
                    <th>{t('admin.invoices.col_currency')}</th>
                    <th>{t('admin.invoices.col_status')}</th>
                    <th>{t('admin.invoices.col_issued')}</th>
                    <th>{t('admin.invoices.col_period')}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {q.data?.items.map((p) => (
                    <tr key={p.id}>
                      <td className="mono text-sm">{p.receiptNumber ?? p.referenceNumber ?? p.id}</td>
                      <td><Link to={`/saas-admin/customers/${p.customerId}`} className="strong">{p.customerName}</Link></td>
                      <td className="num strong">{formatAmount(p.amount, p.currency, i18n.language)}</td>
                      <td>{p.currency}</td>
                      <td><PaymentStatusBadge status={p.status} /></td>
                      <td className="tnum">{formatDate(p.paymentDate, i18n.language)}</td>
                      <td className="muted text-sm ltr">
                        {p.periodFrom ? `${formatDate(p.periodFrom, i18n.language)} → ${formatDate(p.periodTo, i18n.language)}` : '—'}
                      </td>
                      {canWrite && (
                        <td>
                          <ActionMenu
                            items={[
                              { label: t('actions.view'), onClick: () => navigate(`/saas-admin/customers/${p.customerId}`) },
                              ...((p.status === 'PAID' || p.status === 'PENDING')
                                ? [{ label: t('admin.payments.void'), onClick: () => setConfirm({ payment: p, kind: 'void' as const }), danger: true }]
                                : []),
                              ...(p.status === 'PAID'
                                ? [{ label: t('admin.payments.refund'), onClick: () => setConfirm({ payment: p, kind: 'refund' as const }), danger: true }]
                                : []),
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && (
            <AdminPagination page={page} pageSize={10} total={q.data.total} onPage={setPage} />
          )}
        </Card>
      )}
      <ConfirmDialog
        open={!!confirm}
        message={t(confirm?.kind === 'void' ? 'confirm.void_payment' : 'confirm.refund_payment', {
          ref: confirm?.payment.referenceNumber ?? confirm?.payment.id,
          name: confirm?.payment.customerName ?? '',
        })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && mutation.mutate(confirm)}
        loading={mutation.isPending}
      />
    </>
  );
}
