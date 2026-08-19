import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Subscription } from '../../../api/types';
import { Button, Card, ConfirmDialog, EmptyState, ExpiryBadge, Field, PageHeader, Pagination, SearchInput, Select, SubscriptionStatusBadge, TableSkeleton, useToast } from '../../../components/ui';
import { FilterSheet } from '../components/chrome';
import { ChangePlanDrawer, ChangePriceDrawer, ExtendDrawer, RenewDrawer } from '../components/drawers';
import { SlidersHorizontal } from 'lucide-react';
import { canAccessSection, canManageSubscription, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

type DrawerType = 'renew' | 'extend' | 'change-plan' | 'change-price';

export function SubscriptionsPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.subscription.write');
  const canManage = canManageSubscription(role);

  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [action, setAction] = useState<{ sub: Subscription; type: DrawerType } | null>(null);
  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ kind: string; sub: Subscription } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

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

  useEffect(() => {
    setPage(1);
  }, [status]);

  const closeDrawer = (type: DrawerType) => {
    setOpenDrawers((d) => ({ ...d, [type]: false }));
    setAction(null);
  };

  if (!canAccessSection(role, 'subscriptions')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.subscriptions')}`} title={t('admin.subscriptions.title')} subtitle={t('admin.subscriptions.subtitle')} />
      <Card>
        <div className="sa-toolbar">
          <div className="grow">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('admin.subscriptions.search')} />
          </div>
          <Button size="sm" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal size={14} /> {t('admin.customers.filters')}
          </Button>
        </div>
        <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('admin.customers.filters')} onReset={() => setStatus('ALL')}>
          <Field label={t('admin.subscriptions.filter_status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">{t('all')}</option>
              <option value="CURRENT">{t('admin.subscriptions.filter_current')}</option>
              {(['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'] as const).map((s) => (
                <option key={s} value={s}>{t(`admin.subscription_status.${s}`)}</option>
              ))}
            </Select>
          </Field>
        </FilterSheet>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.subscriptions.col_customer')}</th>
                <th>{t('admin.subscriptions.col_plan')}</th>
                <th>{t('admin.subscriptions.col_status')}</th>
                <th>{t('admin.subscriptions.col_start')}</th>
                <th>{t('admin.subscriptions.col_expiry')}</th>
                <th>{t('admin.subscriptions.col_grace')}</th>
                <th className="num">{t('admin.subscriptions.col_price')}</th>
                <th>{t('admin.subscriptions.col_currency')}</th>
                {canWrite && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={9}><TableSkeleton rows={6} cols={1} /></td></tr>}
              {q.data?.items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/saas-admin/subscriptions/${s.id}`} className="strong">{s.customerName}</Link>
                    <div className="muted text-xs">{s.customerCode}</div>
                  </td>
                  <td><span className="strong">{s.planName}</span><div className="muted text-xs">{s.planCode}</div></td>
                  <td><SubscriptionStatusBadge status={s.status} /></td>
                  <td className="tnum">{formatDate(s.startDate, i18n.language)}</td>
                  <td>
                    <div className="tnum">{formatDate(s.expiresAt, i18n.language)}</div>
                    <ExpiryBadge expiresAt={s.expiresAt} status={s.status} />
                  </td>
                  <td className="tnum muted">{formatDate(s.gracePeriodUntil, i18n.language)}</td>
                  <td className="num strong">{formatAmount(s.agreedPrice, s.currency, i18n.language, 0)}</td>
                  <td>{s.currency}</td>
                  {canWrite && (
                    <td>
                      <div className="flex" style={{ gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => { setAction({ sub: s, type: 'renew' }); setOpenDrawers((d) => ({ ...d, renew: true })); }}>{t('admin.subscriptions.renew')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAction({ sub: s, type: 'extend' }); setOpenDrawers((d) => ({ ...d, extend: true })); }}>{t('admin.subscriptions.extend')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAction({ sub: s, type: 'change-plan' }); setOpenDrawers((d) => ({ ...d, 'change-plan': true })); }}>{t('admin.subscriptions.change_plan')}</Button>
                        {canManage && s.status === 'SUSPENDED' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'reactivate', sub: s })}>{t('admin.customers.reactivate')}</Button>}
                        {canManage && s.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'suspend', sub: s })}>{t('admin.customers.suspend')}</Button>}
                        {canManage && s.status !== 'CANCELLED' && <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ kind: 'cancel', sub: s })}>{t('admin.customers.cancel_sub')}</Button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!q.isLoading && q.data?.items.length === 0 && (
                <tr><td colSpan={9}><EmptyState icon="📄">{t('empty.subscriptions')}</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {q.data && <Pagination page={page} pageSize={pageSize} total={q.data.total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />}
      </Card>

      {action?.type === 'renew' && <RenewDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['renew'] ?? false} onClose={() => closeDrawer('renew')} />}
      {action?.type === 'extend' && <ExtendDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['extend'] ?? false} onClose={() => closeDrawer('extend')} />}
      {action?.type === 'change-plan' && <ChangePlanDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['change-plan'] ?? false} onClose={() => closeDrawer('change-plan')} />}
      {action?.type === 'change-price' && <ChangePriceDrawer subscription={action.sub} customerName={action.sub.customerName} open={openDrawers['change-price'] ?? false} onClose={() => closeDrawer('change-price')} />}

      <ConfirmDialog open={confirm?.kind === 'suspend'} message={t('confirm.suspend_subscription', { name: confirm?.sub.customerName })} onClose={() => setConfirm(null)} onConfirm={() => confirm && mutation.mutate({ sub: confirm.sub, action: 'suspend' })} loading={mutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'reactivate'} message={t('confirm.reactivate_subscription', { name: confirm?.sub.customerName })} onClose={() => setConfirm(null)} onConfirm={() => confirm && mutation.mutate({ sub: confirm.sub, action: 'reactivate' })} loading={mutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'cancel'} message={t('confirm.cancel_subscription', { name: confirm?.sub.customerName })} onClose={() => setConfirm(null)} onConfirm={() => confirm && mutation.mutate({ sub: confirm.sub, action: 'cancel' })} loading={mutation.isPending} />
    </>
  );
}
