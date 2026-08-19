/**
 * Backend error-code → i18n key mapping (spec §6).
 * Raw machine codes are NEVER shown to end users.
 */
import i18n from '../i18n';

export type ErrorCodeKey =
  | 'FEATURE_NOT_INCLUDED'
  | 'FEATURE_DISABLED'
  | 'FEATURE_LIMIT_REACHED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_EMAIL'
  | 'PAYMENT_MISMATCH'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

const CODE_TO_KEY: Record<string, string> = {
  FEATURE_NOT_INCLUDED: 'subscription.feature_not_included',
  FEATURE_DISABLED: 'subscription.feature_disabled',
  FEATURE_LIMIT_REACHED: 'subscription.limit_reached',
  SUBSCRIPTION_EXPIRED: 'subscription.expired.title',
  SUBSCRIPTION_SUSPENDED: 'subscription.suspended.title',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled.title',
  VALIDATION_ERROR: 'errors.validation',
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.not_found',
  CONFLICT: 'errors.conflict',
  DUPLICATE_EMAIL: 'errors.duplicate_email',
  PAYMENT_MISMATCH: 'errors.payment_mismatch',
  INVALID_CREDENTIALS: 'errors.invalid_credentials',
  ACCOUNT_DISABLED: 'errors.account_disabled',
  NETWORK_ERROR: 'errors.network',
  INTERNAL_ERROR: 'errors.internal',
};

/** Localized, user-facing message for a backend error code. */
export function localizeErrorCode(code: string | undefined): string {
  if (!code) return i18n.t('errors.internal');
  const key = CODE_TO_KEY[code];
  if (!key) return i18n.t('errors.internal');
  const t = i18n.t(key);
  if (key === 'subscription.expired.title') {
    return i18n.t('subscription.expired.message');
  }
  return t;
}
