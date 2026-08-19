import { useTranslation } from 'react-i18next';
import { useTenant } from '../../../hooks/useSession';
import { Badge, Card, EmptyState, PageHeader, UsageBar } from '../../../components/ui';
import { formatAmount, formatDate } from '../../../lib/format';

const QUOTA_KEYS: { key: string; labelKey: string }[] = [
  { key: 'MAX_COMPANIES', labelKey: 'admin.quotas.companies' },
  { key: 'MAX_BRANCHES', labelKey: 'admin.quotas.branches' },
  { key: 'MAX_USERS', labelKey: 'admin.quotas.users' },
  { key: 'MAX_UPLOADS_PER_MONTH', labelKey: 'admin.quotas.uploads' },
];

export function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  if (!tenant) return null;
  const sub = tenant.subscription;
  const tenantUsage = (tenant as { usage?: Record<string, number> }).usage ?? {};

  const featureRows = Object.entries(tenant.features ?? {})
    .filter(([, f]) => f.enabled)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <PageHeader eyebrow={t('customer.subscription_page.eyebrow')} title={t('customer.subscription_page.title')} subtitle={t('customer.subscription_page.subtitle')} />
      <div className="stat-grid mb-4">
        <Card pad>
          <div className="stat-label">{t('customer.subscription_page.plan')}</div>
          <div className="stat-value" style={{ fontSize: 19 }}>
            {sub.planName ?? sub.plan ?? '—'}
          </div>
          <div className="stat-foot">
            {sub.status && <Badge tone={sub.status}>{t(`admin.subscription_status.${sub.status}`)}</Badge>}
          </div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('customer.subscription_page.expiry')}</div>
          <div className="stat-value" style={{ fontSize: 19 }}>
            {formatDate(sub.expiresAt, i18n.language)}
          </div>
          <div className="stat-foot">{sub.gracePeriodUntil ? `${t('customer.subscription_page.grace')}: ${formatDate(sub.gracePeriodUntil, i18n.language)}` : t('status.active')}</div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('customer.subscription_page.billing_cycle')}</div>
          <div className="stat-value" style={{ fontSize: 19 }}>
            {t(`admin.billing_cycle.${sub.billingCycle ?? 'CUSTOM'}`)}
          </div>
          <div className="stat-foot">
            {sub.agreedPrice != null && sub.currency && formatAmount(sub.agreedPrice, sub.currency, i18n.language)}
            {sub.billingCycle === 'ANNUAL' ? t('per_year') : sub.billingCycle === 'MONTHLY' ? t('per_month') : ''}
          </div>
        </Card>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        <Card>
          <div className="card-header">
            <h3>{t('customer.subscription_page.features_title')}</h3>
            <span className="card-sub">{featureRows.length}</span>
          </div>
          <div className="card-body">
            {featureRows.length === 0 ? (
              <EmptyState icon="🧩">{t('customer.subscription_page.no_plan')}</EmptyState>
            ) : (
              <div className="kv-list">
                {featureRows.map(([key, f]) => (
                  <div className="kv-row" key={key}>
                    <span className="k">{key.replace(/_/g, ' ')}</span>
                    <span className="v" style={{ color: 'var(--green)' }}>
                      ✓ {f.enabled ? t('status.enabled') : t('status.disabled')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <h3>{t('customer.subscription_page.limits_title')}</h3>
            <span className="card-sub">{t('customer.subscription_page.current_usage')}</span>
          </div>
          <div className="card-body">
            {QUOTA_KEYS.map(({ key, labelKey }) => {
              const limit = tenant.limits[key] ?? null;
              const feature = tenant.features?.[key] as { limitValue?: number | null } | undefined;
              const effectiveLimit = feature?.limitValue ?? limit;
              if (effectiveLimit == null && limit == null) return null;
              const current = tenantUsage[key] ?? 0;
              return (
                <UsageBar key={key} label={t(labelKey)} current={current} limit={effectiveLimit} quotaKey={key} />
              );
            })}
            {Object.values(tenant.limits ?? {}).every((v) => v == null) && <EmptyState icon="📏">{t('customer.subscription_page.no_plan')}</EmptyState>}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="card-body">
          <div className="kv-list">
            <div className="kv-row">
              <span className="k">{t('customer.subscription_page.start')}</span>
              <span className="v">{formatDate(sub.startDate, i18n.language)}</span>
            </div>
            <div className="kv-row">
              <span className="k">{t('customer.subscription_page.price')}</span>
              <span className="v">
                {sub.agreedPrice != null && sub.currency ? formatAmount(sub.agreedPrice, sub.currency, i18n.language) : '—'}
              </span>
            </div>
            <div className="kv-row">
              <span className="k">{t('customer.subscription_page.contact')}</span>
              <span className="v" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                {t('customer.support.contact')}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
