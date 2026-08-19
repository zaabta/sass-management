/**
 * Compact shell banner for non-normal subscription states (spec §64).
 * ACTIVE subscriptions with far expiry show no banner.
 */
import { useTranslation } from 'react-i18next';
import { useTenant } from '../hooks/useSession';
import { diffDays, formatDate, todayIso } from '../lib/format';
import { Banner, BannerAction, BannerTitle } from './kibo/banner';

export function SubscriptionBanner() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  if (!tenant) return null;
  const sub = tenant.subscription;
  const status = sub.status;

  // Kibo Banner tones per subscription status (dismissible).
  if (status === 'EXPIRED') {
    return (
      <Banner tone="destructive">
        <span aria-hidden>⚠️</span>
        <BannerTitle>{t('subscription.expired.banner')}</BannerTitle>
        <BannerAction onClick={() => (window.location.href = '/subscription')}>{t('nav.subscription')}</BannerAction>
      </Banner>
    );
  }
  if (status === 'SUSPENDED' || tenant.customerStatus === 'SUSPENDED') {
    return (
      <Banner tone="warning">
        <span aria-hidden>⏸️</span>
        <BannerTitle>{t('subscription.suspended.message')}</BannerTitle>
        <BannerAction onClick={() => (window.location.href = '/support')}>{t('nav.support')}</BannerAction>
      </Banner>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <Banner tone="destructive">
        <span aria-hidden>🚫</span>
        <BannerTitle>{t('subscription.cancelled.message')}</BannerTitle>
        <BannerAction onClick={() => (window.location.href = '/support')}>{t('nav.support')}</BannerAction>
      </Banner>
    );
  }
  if (status === 'PAST_DUE') {
    return (
      <Banner tone="warning">
        <span aria-hidden>⏰</span>
        <BannerTitle>{t('subscription.past_due.banner')}</BannerTitle>
        <BannerAction onClick={() => (window.location.href = '/subscription')}>{t('nav.subscription')}</BannerAction>
      </Banner>
    );
  }
  if (status === 'TRIAL') {
    const days = diffDays(todayIso(), sub.expiresAt);
    if (days != null && days <= 30) {
      return (
        <Banner tone="info">
          <span aria-hidden>🧪</span>
          <BannerTitle>{t('subscription.trial_ending.banner', { date: formatDate(sub.expiresAt, i18n.language) })}</BannerTitle>
          <BannerAction onClick={() => (window.location.href = '/subscription')}>{t('nav.subscription')}</BannerAction>
        </Banner>
      );
    }
  }
  if (status === 'ACTIVE') {
    const days = diffDays(todayIso(), sub.expiresAt);
    if (days != null && days <= 30) {
      return (
        <Banner tone="warning">
          <span aria-hidden>📅</span>
          <BannerTitle>{t('subscription.expiring_soon.banner', { date: formatDate(sub.expiresAt, i18n.language) })}</BannerTitle>
          <BannerAction onClick={() => (window.location.href = '/subscription')}>{t('nav.subscription')}</BannerAction>
        </Banner>
      );
    }
  }
  return null;
}
