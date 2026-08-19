import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDateTime } from '../../../lib/format';
import { Badge, Card } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { AdminAvatar, AdminEmptyState, AdminErrorState } from '../components/chrome';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Activity } from 'lucide-react';

export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.audit({ page: 1, pageSize: 40 }),
    queryFn: () => saasAdminApi.getAudit({ page: 1, pageSize: 40 }),
  });

  if (!canAccessSection(role, 'activity')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <AdminPageHeader title={t('admin.activity.title')} description={t('admin.activity.subtitle')} />
      {q.isError ? (
        <AdminErrorState onRetry={() => void q.refetch()} />
      ) : (
        <Card>
          <div className="card-body">
            {q.isLoading && <div className="skeleton" style={{ height: 240 }} />}
            {!q.isLoading && (q.data?.items.length ?? 0) === 0 && (
              <AdminEmptyState icon={<Activity size={18} />} title={t('empty.audit')} />
            )}
            {q.data?.items.map((a) => (
              <div className="sa-feed-item" key={a.id}>
                <AdminAvatar name={a.actor} />
                <div>
                  <div className="sa-feed-title">
                    {a.actor} {t(`admin.audit_actions.${a.action}`, { defaultValue: a.action }).toLowerCase()}
                    {a.customerName ? ` ${a.customerName}` : ''}
                  </div>
                  <div className="sa-feed-meta">
                    {a.entityLabel} · {a.entityType}
                    {a.platformRole && (
                      <>
                        {' '}
                        <Badge tone={a.platformRole}>{t(`admin.roles.${a.platformRole}`)}</Badge>
                      </>
                    )}
                  </div>
                </div>
                <span className="muted text-xs tnum">{formatDateTime(a.timestamp, i18n.language)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
