import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Subscription } from '../../../api/types';
import { ConfirmDialog, ExpiryBadge, SubscriptionStatusBadge, useToast } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminDataTable, type AdminCol } from '../components/AdminDataTable';
import { ChangePlanDrawer, ChangePriceDrawer, ExtendDrawer, RenewDrawer } from '../components/drawers';
import { canAccessSection, canManageSubscription, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

type DrawerType = 'renew' | 'extend' | 'change-plan' | 'change-price';

export function SubscriptionsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.subscription.write');
  const canManage = canManageSubscription(role);

  const [status, setStatus] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [action, setAction] = useState<{ sub: Subscription; type: DrawerType } | null>(null);
  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ kind: string; sub: Subscription } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.subscriptions({ status, search, page, pageSize }),
    queryFn: () => saasAdminApi.getSubscriptions({ status, search, page, pageSize }),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: ({ sub, action: a }: { sub: Subscription; action: 'activate' | 'suspend' | 'reactivate' | 'cancel' }) => saasAdminApi.subscriptionAction(sub.id, a),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.sub.customerId);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  useEffect(() => { setPage(1); }, [status]);

  const closeDrawer = (type: DrawerType) => {
    setOpenDrawers((d) => ({ ...d, [type]: false }));
    setAction(null);
  };

  if (!canAccessSection(role, 'subscriptions')) return <Navigate to="/saas-admin/overview" replace />;

  const columns: AdminCol<Subscription>[] = [
    {
      id: 'customer',
      header: t('admin.subscriptions.col_customer'),
      cell: (s) => (
        <>
          <Link to={`/saas-admin/subscriptions/${s.id}`} className="strong">{s.customerName}</Link>
          <div className="muted text-xs">{s.customerCode}</div>
        </>
      ),
    },
    {
      id: 'plan',
      header: t('admin.subscriptions.col_plan'),
      cell: (s) => (
        <>
          <span className="strong">{s.planName}</span>
          <div className="muted text-xs">{s.planCode}</div>
        </>
      ),
    },
    { id: 'status', header: t('admin.subscriptions.col_status'), cell: (s) => <SubscriptionStatusBadge status={s.status} /> },
    { id: 'start', header: t('admin.subscriptions.col_start'), cell: (s) => <span className="tnum">{formatDate(s.startDate, i18n.language)}</span> },
    {
      id: 'expiry',
      header: t('admin.subscriptions.col_expiry'),
      cell: (s) => (
        <>
          <div className="tnum">{formatDate(s.expiresAt, i18n.language)}</div>
          <ExpiryBadge expiresAt={s.expiresAt} status={s.status} />
        </>
      ),
    },
    { id: 'price', header: t('admin.subscriptions.col_price'), className: 'num', cell: (s) => <span className="strong tnum">{formatAmount(s.agreedPrice, s.currency, i18n.language, 0)}</span> },
    { id: 'currency', header: t('admin.subscriptions.col_currency'), cell: (s) => s.currency },
  ];

  return (
    <>
      <AdminPageHeader title={t('admin.subscriptions.title')} description={t('admin.subscriptions.subtitle')} />
      <AdminDataTable
        rows={q.data?.items ?? []}
        columns={columns}
        rowKey={(s) => s.id}
        total={q.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(s) => { setPageSize(s); setPage(1); }}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder={t('admin.subscriptions.search')}
        filters={[
          {
            key: 'status',
            label: t('admin.subscriptions.filter_status'),
            value: status,
            options: [
              { value: 'ALL', label: t('all') },
              { value: 'CURRENT', label: t('admin.subscriptions.filter_current') },
              ...(['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'] as const).map((s) => ({
                value: s,
                label: t(`admin.subscription_status.${s}`),
              })),
            ],
          },
        ]}
        onFilterChange={(_k, v) => setStatus(v)}
        onReset={() => { setStatus('ALL'); setSearchInput(''); setSearch(''); }}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyTitle={t('empty.subscriptions')}
        actions={(s) => [
          { label: t('actions.view'), onClick: () => navigate(`/saas-admin/subscriptions/${s.id}`) },
          ...(canWrite ? [{ label: t('admin.subscriptions.renew'), onClick: () => { setAction({ sub: s, type: 'renew' }); setOpenDrawers((d) => ({ ...d, renew: true })); } }] : []),
          ...(canWrite ? [{ label: t('admin.subscriptions.extend'), onClick: () => { setAction({ sub: s, type: 'extend' }); setOpenDrawers((d) => ({ ...d, extend: true })); } }] : []),
          ...(canManage && s.status === 'ACTIVE' ? [{ label: t('actions.deactivate'), onClick: () => setConfirm({ kind: 'suspend', sub: s }), danger: true }] : []),
          ...(canManage && s.status !== 'ACTIVE' && s.status !== 'CANCELLED' ? [{ label: t('actions.activate'), onClick: () => setConfirm({ kind: 'reactivate', sub: s }) }] : []),
        ]}
      />

      {action?.type === 'renew' && <RenewDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['renew'] ?? false} onClose={() => closeDrawer('renew')} />}
      {action?.type === 'extend' && <ExtendDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['extend'] ?? false} onClose={() => closeDrawer('extend')} />}
      {action?.type === 'change-plan' && <ChangePlanDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['change-plan'] ?? false} onClose={() => closeDrawer('change-plan')} />}
      {action?.type === 'change-price' && <ChangePriceDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['change-price'] ?? false} onClose={() => closeDrawer('change-price')} />}

      <ConfirmDialog open={confirm?.kind === 'suspend'} message={t('confirm.suspend_subscription', { name: confirm?.sub.customerName })} onClose={() => setConfirm(null)} onConfirm={() => confirm && mutation.mutate({ sub: confirm.sub, action: 'suspend' })} loading={mutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'reactivate'} message={t('confirm.reactivate_subscription', { name: confirm?.sub.customerName })} onClose={() => setConfirm(null)} onConfirm={() => confirm && mutation.mutate({ sub: confirm.sub, action: 'reactivate' })} loading={mutation.isPending} danger={false} />
    </>
  );
}
