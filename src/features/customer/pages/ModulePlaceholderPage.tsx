import { useTranslation } from 'react-i18next';
import { FeatureRoute } from '../../../components/FeatureRoute';
import { Card, ComingSoon, EmptyState, PageHeader } from '../../../components/ui';
import { useFeature } from '../../../hooks/useSession';

/**
 * Placeholder for financial modules that live on the backend.
 * - feature enabled → "Coming soon" (module not built in this repo)
 * - feature disabled → FeatureRoute locked panel (upgrade empty state)
 * - expired/suspended → restricted panel
 */
export function ModulePlaceholderPage({ feature, titleKey, subtitleKey, icon = '📊' }: { feature: string; titleKey: string; subtitleKey: string; icon?: string }) {
  const { t } = useTranslation();
  const feat = useFeature(feature);
  const enabled = !!feat?.enabled;
  return (
    <FeatureRoute feature={feature}>
      <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t(titleKey)} subtitle={t(subtitleKey)} />
      {enabled ? (
        <Card>
          <ComingSoon feature={feature} />
        </Card>
      ) : (
        <Card>
          <EmptyState icon={icon}>
            {t(titleKey)} — {t(subtitleKey)}.
          </EmptyState>
        </Card>
      )}
    </FeatureRoute>
  );
}
