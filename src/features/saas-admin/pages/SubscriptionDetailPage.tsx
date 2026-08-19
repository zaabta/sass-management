import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatAmount, formatDate } from '../../../lib/format';
import { Card, CardSkeleton, EmptyState, ExpiryBadge, KV, SubscriptionStatusBadge, Tabs } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminErrorState } from '../components/chrome';
import { UsageReportView } from './CustomerDetailPage';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { useState } from 'react';

export function SubscriptionDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const [tab, setTab] = useState('overview');

  const listQ = useQuery({
    queryKey: queryKeys.saasAdmin.subscriptions({ page: 1, pageSize: 100 }),
    queryFn: () => saasAdminApi.getSubscriptions({ page: 1, pageSize: 100 }),
  });
  const fromList = listQ.data?.items.find((s) => s.id === id);
  const customerId = fromList?.customerId ?? id;

  const subQ = useQuery({
    queryKey: queryKeys.saasAdmin.subscription(customerId),
    queryFn: () => saasAdminApi.getSubscription(customerId),
    enabled: !!customerId,
  });
  const usageQ = useQuery({
    queryKey: queryKeys.saasAdmin.usage(customerId),
    queryFn: () => saasAdminApi.getUsage(customerId),
    enabled: !!customerId,
  });
  const historyQ = useQuery({
    queryKey: queryKeys.saasAdmin.subscriptionHistory(customerId),
    queryFn: () => saasAdminApi.getSubscriptionHistory(customerId),
    enabled: !!customerId,
  });
  const paymentsQ = useQuery({
    queryKey: queryKeys.saasAdmin.customerPayments(customerId),
    queryFn: () => saasAdminApi.getCustomerPayments(customerId),
    enabled: !!customerId,
  });

  if (!canAccessSection(role, 'subscriptions')) return <Navigate to="/saas-admin/overview" replace />;

  const sub = subQ.data ?? fromList ?? null;

  if (listQ.isLoading && subQ.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('admin.subscription_detail.title')} />
        <CardSkeleton count={3} />
      </>
    );
  }
  if (subQ.isError && !fromList) {
    return (
      <>
        <AdminPageHeader title={t('admin.subscription_detail.title')} />
        <AdminErrorState onRetry={() => void subQ.refetch()} />
      </>
    );
  }
  if (!sub) {
    return (
      <>
        <AdminPageHeader title={t('admin.subscription_detail.title')} />
        <Card><EmptyState>{t('admin.customer_detail.subscription.no_subscription')}</EmptyState></Card>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title={sub.planName}
        breadcrumbs={[
          { label: t('admin.subscriptions.title'), to: '/saas-admin/subscriptions' },
          { label: sub.customerName },
        ]}
        meta={
          <span className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <SubscriptionStatusBadge status={sub.status} />
            <Link to={`/saas-admin/customers/${sub.customerId}`}>{sub.customerName}</Link>
          </span>
        }
      />
      <Tabs
        tabs={[
          { key: 'overview', label: t('admin.subscription_detail.overview') },
          { key: 'usage', label: t('admin.subscription_detail.usage') },
          { key: 'payments', label: t('admin.subscription_detail.payments') },
          { key: 'activity', label: t('admin.subscription_detail.activity') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview' && (
        <Card>
          <div className="card-body">
            <KV
              items={[
                { k: t('admin.customer_detail.subscription.plan'), v: `${sub.planName} (${sub.planCode})` },
                { k: t('admin.customer_detail.subscription.price'), v: formatAmount(sub.agreedPrice, sub.currency, i18n.language, 0) },
                { k: t('admin.customer_detail.subscription.billing_cycle'), v: t(`admin.billing_cycle.${sub.billingCycle}`) },
                { k: t('admin.customer_detail.subscription.start'), v: formatDate(sub.startDate, i18n.language) },
                { k: t('admin.customer_detail.subscription.expiry'), v: <span>{formatDate(sub.expiresAt, i18n.language)} <ExpiryBadge expiresAt={sub.expiresAt} status={sub.status} /></span> },
                { k: t('admin.customer_detail.subscription.grace'), v: formatDate(sub.gracePeriodUntil, i18n.language) },
                { k: t('admin.customer_detail.subscription.status'), v: <SubscriptionStatusBadge status={sub.status} /> },
              ]}
            />
          </div>
        </Card>
      )}
      {tab === 'usage' && (
        <Card>
          <div className="card-body">
            <UsageReportView usage={usageQ.data} />
          </div>
        </Card>
      )}
      {tab === 'payments' && (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.payments.col_date')}</th>
                  <th className="num">{t('admin.customer_detail.payments.col_amount')}</th>
                  <th>{t('admin.customer_detail.payments.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentsQ.data?.map((p) => (
                  <tr key={p.id}>
                    <td className="tnum">{formatDate(p.paymentDate, i18n.language)}</td>
                    <td className="num">{formatAmount(p.amount, p.currency, i18n.language)}</td>
                    <td>{t(`admin.payment_status.${p.status}`)}</td>
                  </tr>
                ))}
                {(paymentsQ.data?.length ?? 0) === 0 && (
                  <tr><td colSpan={3}><EmptyState>{t('empty.payments')}</EmptyState></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'activity' && (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.subscription.col_event')}</th>
                  <th>{t('admin.customer_detail.subscription.col_new')}</th>
                  <th>{t('admin.customer_detail.subscription.col_date')}</th>
                </tr>
              </thead>
              <tbody>
                {historyQ.data?.map((ev) => (
                  <tr key={ev.id}>
                    <td>{t(`admin.event_types.${ev.eventType}`, { defaultValue: ev.eventType })}</td>
                    <td>{ev.newValue ?? '—'}</td>
                    <td className="tnum muted">{formatDate(ev.date, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
