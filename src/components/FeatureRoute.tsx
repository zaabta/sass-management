/**
 * FeatureRoute — reusable UX protection for feature-gated routes (spec §5).
 *
 * States handled here (backend remains authoritative):
 *   enabled → renders children
 *   not included / disabled → localized locked panel
 *   subscription expired / suspended / cancelled → localized restricted panel
 *   limit reached → localized limit panel (for quota-gated surfaces)
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSessionData, useTenant } from '../hooks/useSession';
import { formatDate } from '../lib/format';
import type { SubscriptionStatus } from '../api/types';
import { PLAN_BOOLEAN_DEFAULTS } from '../api/types';

interface FeatureRouteProps {
  feature: string;
  children: ReactNode;
  /** Render a custom locked panel instead of the default one. */
  renderLocked?: (reason: LockReason) => ReactNode;
}

export type LockReason =
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'suspended' }
  | { kind: 'cancelled' }
  | { kind: 'customer_suspended' }
  | { kind: 'customer_cancelled' }
  | { kind: 'not_included'; feature: string }
  | { kind: 'disabled'; feature: string }
  | { kind: 'limit_reached'; feature: string };

export function getLockReason(session: ReturnType<typeof useSessionData>, feature?: string): LockReason {
  const tenant = session?.tenant;
  if (!tenant) return { kind: 'ok' };
  const sub = tenant.subscription;
  if (tenant.customerStatus === 'SUSPENDED') return { kind: 'customer_suspended' };
  if (tenant.customerStatus === 'CANCELLED') return { kind: 'customer_cancelled' };
  if (sub.status === 'EXPIRED') return { kind: 'expired' };
  if (sub.status === 'SUSPENDED') return { kind: 'suspended' };
  if (sub.status === 'CANCELLED') return { kind: 'cancelled' };
  if (feature) {
    const f = tenant.features?.[feature];
    if (!f?.enabled) {
      const reason = (f as { reason?: string } | undefined)?.reason;
      if (reason === 'DISABLED') return { kind: 'disabled', feature };
      if (reason === 'LIMIT_REACHED') return { kind: 'limit_reached', feature };
      return { kind: 'not_included', feature };
    }
  }
  return { kind: 'ok' };
}

function LockedPanel({ reason }: { reason: Exclude<LockReason, { kind: 'ok' }> }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const sub = tenant?.subscription;

  if (reason.kind === 'expired' || reason.kind === 'suspended' || reason.kind === 'cancelled' || reason.kind === 'customer_suspended' || reason.kind === 'customer_cancelled') {
    const statusKey = reason.kind === 'customer_suspended' || reason.kind === 'suspended' ? 'suspended' : reason.kind === 'cancelled' || reason.kind === 'customer_cancelled' ? 'cancelled' : 'expired';
    return (
      <div className="feature-locked">
        <div className="lock-icon">🔒</div>
        <h2>{t(`subscription.${statusKey}.title`)}</h2>
        <p>{t(`subscription.${statusKey}.message`)}</p>
        {sub && sub.plan && (
          <p>
            {t('subscription.expired.plan')}: <strong>{sub.planName ?? sub.plan}</strong>
            {sub.expiresAt && (
              <>
                {' '}· {t('subscription.expired.expired_on')}: <strong>{formatDate(sub.expiresAt, i18n.language)}</strong>
              </>
            )}
          </p>
        )}
        <p style={{ marginTop: 10 }}>
          <Link to="/account">{t('customer.restricted.account')} <span className="flip-rtl" aria-hidden="true">→</span></Link>
        </p>
      </div>
    );
  }

  const featureName = reason.feature;
  // Display-only: which catalog plans include this feature (source of truth is session).
  const plansIncluding = featureName
    ? Object.entries(PLAN_BOOLEAN_DEFAULTS)
        .filter(([, keys]) => keys.includes(featureName))
        .map(([code]) => t(`plan.${code.toLowerCase()}`, { defaultValue: code }))
    : [];
  return (
    <div className="feature-locked">
      <div className="lock-icon">🔒</div>
      <h2>{t('subscription.feature_locked.title')}</h2>
      <p>{t('subscription.feature_locked.body', { feature: featureName })}</p>
      {sub?.plan && (
        <p>
          {t('subscription.feature_locked.plan')}: <strong>{sub.planName ?? sub.plan}</strong>
        </p>
      )}
      {plansIncluding.length > 0 && (
        <p className="muted text-sm">
          {t('subscription.feature_locked.included_in', { plans: plansIncluding.join(', ') })}
        </p>
      )}
      <p>{t('subscription.feature_locked.contact', { feature: featureName })}</p>
      <p style={{ marginTop: 10 }}>
        <Link to="/subscription">{t('nav.subscription')} <span className="flip-rtl" aria-hidden="true">→</span></Link>
      </p>
    </div>
  );
}

export function FeatureRoute({ feature, children, renderLocked }: FeatureRouteProps) {
  const session = useSessionData();
  const reason = getLockReason(session, feature);
  if (reason.kind === 'ok') return <>{children}</>;
  if (renderLocked) return <>{renderLocked(reason)}</>;
  return <LockedPanel reason={reason} />;
}

/** Status label used by restricted module pages. */
export function workingSubscriptionStatus(sub: { status: SubscriptionStatus } | null | undefined): string {
  return sub?.status ?? 'EXPIRED';
}
