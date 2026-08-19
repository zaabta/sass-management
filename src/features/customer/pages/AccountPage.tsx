import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { useSessionData, useTenant } from '../../../hooks/useSession';
import { Badge, Card, CardSkeleton, EmptyState, KV, MembershipStatusBadge, PageHeader, RoleBadge } from '../../../components/ui';
import { formatDate } from '../../../lib/format';
import { getLockReason } from '../../../components/FeatureRoute';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const tenant = useTenant();
  const q = useQuery({ queryKey: queryKeys.me, queryFn: () => customerApi.me(), retry: false });

  const reason = getLockReason(session);
  const locked = reason.kind !== 'ok';

  return (
    <>
      <PageHeader eyebrow={t('customer.account.eyebrow')} title={t('customer.account.title')} subtitle={t('customer.account.subtitle')} />
      {locked && (
        <div className="subscription-banner red mb-4" style={{ borderRadius: 'var(--radius)' }}>
          <span>⚠️</span>
          <span>{t('subscription.expired.message')}</span>
        </div>
      )}
      <div className="stat-grid mb-4">
        <Card pad>
          <div className="stat-label">{t('customer.shell.subscription_menu')}</div>
          <div className="stat-value" style={{ fontSize: 17 }}>
            {tenant?.subscription.planName ?? '—'}
          </div>
          <div className="stat-foot">
            {tenant?.subscription.status && <Badge tone={tenant.subscription.status}>{t(`admin.subscription_status.${tenant.subscription.status}`)}</Badge>}
            {tenant?.subscription.expiresAt && ` · ${t('customer.subscription_page.expiry')}: ${formatDate(tenant.subscription.expiresAt, i18n.language)}`}
          </div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('customer.account.role')}</div>
          <div className="stat-value" style={{ fontSize: 17 }}>
            {q.data?.customerRole ? <RoleBadge role={q.data.customerRole} /> : '—'}
          </div>
          <div className="stat-foot">{q.data?.customerName}</div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('customer.account.membership')}</div>
          <div className="stat-value" style={{ fontSize: 17 }}>
            {q.data?.membershipStatus ? <MembershipStatusBadge status={q.data.membershipStatus as never} /> : '—'}
          </div>
          <div className="stat-foot">{q.data?.isActive ? t('status.active') : t('status.inactive')}</div>
        </Card>
      </div>
      <Card>
        <div className="card-header">
          <h3>{t('customer.account.title')}</h3>
        </div>
        <div className="card-body">
          {q.isLoading ? (
            <CardSkeleton count={2} />
          ) : q.data ? (
            <KV
              items={[
                { k: t('customer.account.first_name'), v: q.data.firstName },
                { k: t('customer.account.last_name'), v: q.data.lastName },
                { k: t('customer.account.email'), v: q.data.email },
                { k: t('customer.account.phone'), v: q.data.phone ?? '—' },
                { k: t('customer.account.company_access'), v: q.data.companyIds.length ? `${q.data.companyIds.length} companies` : '—' },
              ]}
            />
          ) : (
            <EmptyState icon="👤">{t('errors.not_found')}</EmptyState>
          )}
        </div>
      </Card>
    </>
  );
}
