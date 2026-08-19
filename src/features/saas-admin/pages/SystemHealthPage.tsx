import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { AdminPageHeader, StatusBadge } from '../../../components/admin';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';

type Health = 'operational' | 'degraded' | 'down' | 'unknown';

export function SystemHealthPage() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const overviewQ = useQuery({ queryKey: queryKeys.saasAdmin.overview, queryFn: () => saasAdminApi.getOverview() });
  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });

  if (!canAccessSection(role, 'health')) return <Navigate to="/saas-admin/overview" replace />;

  const api: Health = overviewQ.isError ? 'down' : overviewQ.isSuccess ? 'operational' : 'unknown';
  const catalog: Health = plansQ.isError ? 'degraded' : plansQ.isSuccess ? 'operational' : 'unknown';

  const services: { key: string; status: Health; note: string }[] = [
    { key: 'api', status: api, note: t('admin.health.api_note') },
    { key: 'database', status: api, note: t('admin.health.inferred') },
    { key: 'redis', status: 'unknown', note: t('admin.health.no_probe') },
    { key: 'ai', status: 'unknown', note: t('admin.health.no_probe') },
    { key: 'storage', status: catalog === 'operational' ? 'operational' : catalog, note: t('admin.health.inferred') },
    { key: 'queue', status: 'unknown', note: t('admin.health.no_probe') },
  ];

  return (
    <>
      <AdminPageHeader title={t('admin.health.title')} description={t('admin.health.subtitle')} />
      <div className="sa-health-grid">
        {services.map((s) => (
          <div className="sa-health-card" key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div className="sa-health-name">{t(`admin.health.svc_${s.key}`)}</div>
              <HealthBadge status={s.status} />
            </div>
            <div className="sa-health-meta">{s.note}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function HealthBadge({ status }: { status: Health }) {
  const { t } = useTranslation();
  const tone = status === 'operational' ? 'positive' : status === 'degraded' ? 'warning' : status === 'down' ? 'danger' : 'neutral';
  return <StatusBadge tone={tone} dot>{t(`admin.health.status_${status}`)}</StatusBadge>;
}
