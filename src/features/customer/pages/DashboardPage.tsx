import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Alert, Badge, Card, CardSkeleton, PageHeader, StatCard } from '../../../components/ui';
import { formatAmount, formatNumber } from '../../../lib/format';
import { isApiError } from '../../../api/client';
import { useTenant } from '../../../hooks/useSession';
import type { DashboardKpi, TrendPoint } from '../../../api/types';

const IMPACT_TONE: Record<string, string> = {
  positive: 'var(--green)',
  negative: 'var(--red)',
  neutral: 'var(--muted-fg)',
};

/** `null` means not computable — render —, never 0 (FRONTEND-API-GUIDE). */
function kpiValue(kpi: DashboardKpi, i18nLang: string, currency: string | undefined): string {
  if (kpi.value == null) return '—';
  if (kpi.unit === 'currency' || kpi.currency) return formatAmount(kpi.value, kpi.currency ?? currency, i18nLang);
  if (kpi.unit === 'percent') return `${formatNumber(kpi.value)}%`;
  return formatNumber(kpi.value);
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const q = useQuery({ queryKey: queryKeys.customer.dashboard, queryFn: () => customerApi.dashboard(), retry: false });

  if (q.isLoading) {
    return (
      <>
        <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.dashboard.title')} subtitle={t('customer.dashboard.subtitle')} />
        <CardSkeleton count={4} />
      </>
    );
  }
  if (q.isError && isApiError(q.error)) {
    const code = q.error.code;
    if (code === 'FEATURE_NOT_INCLUDED' || code === 'FEATURE_DISABLED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'SUBSCRIPTION_SUSPENDED' || code === 'SUBSCRIPTION_CANCELLED') {
      return (
        <>
          <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.dashboard.title')} subtitle={t('customer.dashboard.subtitle')} />
          <Alert tone="error">{t(`subscription.${code === 'FEATURE_NOT_INCLUDED' ? 'feature_not_included' : code === 'FEATURE_DISABLED' ? 'feature_disabled' : code === 'SUBSCRIPTION_SUSPENDED' ? 'suspended.title' : code === 'SUBSCRIPTION_CANCELLED' ? 'cancelled.title' : 'expired.title'}`)}</Alert>
        </>
      );
    }
  }

  const d = q.data;
  const currency = tenant?.subscription.currency ?? d?.company.baseCurrency ?? 'USD';

  return (
    <>
      <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.dashboard.title')} subtitle={t('customer.dashboard.subtitle')} />
      {d && (
        <>
          {/* Integrity failed must banner-block trust (FRONTEND-API-GUIDE) */}
          {d.integrity.failed && (
            <Alert tone="error">
              <strong>{t('customer.dashboard.integrity_failed')}</strong>
              {d.integrity.issues.slice(0, 3).map((i) => (
                <div key={i.code}>· {i.message}</div>
              ))}
            </Alert>
          )}
          {!d.integrity.failed && d.integrity.status === 'warning' && (
            <Alert tone="warning">{t('customer.dashboard.integrity_warning')}</Alert>
          )}

          <div className="stat-grid wide mb-4">
            {d.kpis.map((kpi) => {
              const pp = kpi.pp_change;
              const up = kpi.impact_direction === 'positive';
              const deltaTxt =
                pp == null ? t('customer.dashboard.na') : `${pp >= 0 ? '+' : ''}${formatNumber(pp)}${kpi.unit === 'percent' ? 'pp' : '%'}`;
              return (
                <StatCard
                  key={kpi.key}
                  label={kpi.label}
                  value={kpiValue(kpi, i18n.language, currency)}
                  foot={`${deltaTxt} · ${t('customer.dashboard.vs_previous')}`}
                  delta={kpi.impact_direction === 'neutral' ? undefined : up ? 'up' : 'down'}
                  tone={IMPACT_TONE[kpi.impact_direction] ?? 'var(--muted-fg)'}
                />
              );
            })}
            {d.kpis.length === 0 && (
              <Card pad>
                <span className="muted">{t('customer.dashboard.no_data')}</span>
              </Card>
            )}
          </div>

          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
            <Card>
              <div className="card-header">
                <h3>{t('customer.dashboard.trend_title')}</h3>
                <span className="card-sub mono">{d.period.label}</span>
              </div>
              <div className="card-body">
                <TrendChart trend={d.trend} currency={currency} i18nLang={i18n.language} />
              </div>
            </Card>
            <Card>
              <div className="card-header">
                <h3>{t('customer.dashboard.integrity_title')}</h3>
                <Badge tone={d.integrity.failed ? 'FAILED' : d.integrity.status === 'warning' ? 'PAST_DUE' : 'ACTIVE'} dot>
                  {d.integrity.failed ? t('customer.dashboard.integrity_failed_badge') : d.integrity.status === 'warning' ? t('customer.dashboard.integrity_warning_badge') : t('customer.dashboard.integrity_ok')}
                </Badge>
              </div>
              <div className="card-body">
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="k">{t('customer.dashboard.company')}</span>
                    <span className="v">{d.company.name}</span>
                  </div>
                  <div className="kv-row">
                    <span className="k">{t('customer.dashboard.base_currency')}</span>
                    <span className="v mono">{d.company.baseCurrency}</span>
                  </div>
                  <div className="kv-row">
                    <span className="k">{t('customer.dashboard.period')}</span>
                    <span className="v mono">{d.period.label}</span>
                  </div>
                  {d.targets_available && (
                    <div className="kv-row">
                      <span className="k">{t('customer.dashboard.targets')}</span>
                      <span className="v">{t('customer.dashboard.targets_on')}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

/** Trend overlay: join on `period`, never zip by index (FRONTEND-API-GUIDE). */
function TrendChart({ trend, currency, i18nLang }: { trend: TrendPoint[]; currency: string; i18nLang: string }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...trend.map((p) => Math.max(p.revenue ?? 0, p.expenses ?? 0, p.profit ?? 0)));
  return (
    <div>
      {trend.length === 0 ? (
        <div className="muted text-sm">{'—'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(['revenue', 'expenses', 'profit'] as const).map((key) => (
            <div key={key} className="usage-line" style={{ marginBottom: 0 }}>
              <div className="usage-head">
                <span>{t(`customer.dashboard.${key}`)}</span>
                <span className="muted tnum">{formatAmount(trend[trend.length - 1][key], currency, i18nLang, 0)}</span>
              </div>
              <div className="mini-chart" style={{ height: 26, gap: 2, paddingTop: 0 }}>
                {trend.map((p) => {
                  const v = p[key] ?? 0;
                  return (
                    <div
                      key={`${key}-${p.period}`}
                      className="bar"
                      title={`${p.period}: ${formatAmount(v, currency, i18nLang, 0)}`}
                      style={{ height: `${v > 0 ? Math.max(6, (v / max) * 100) : 3}%`, background: key === 'revenue' ? 'var(--primary)' : key === 'expenses' ? 'var(--ink)' : 'var(--primary-soft)', minWidth: 3 }}
                    />
                  );
                })}
              </div>
              <div className="flex" style={{ justifyContent: 'space-between' }}>
                <span className="text-xs muted mono">{trend[0]?.period}</span>
                <span className="text-xs muted mono">{trend[trend.length - 1]?.period}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
