import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import type { FeatureDefinition } from '../../../api/types';
import { Badge, Button, Card, CardSkeleton, Drawer, EmptyState, Field, Input, PageHeader, Select, Textarea, useToast } from '../../../components/ui';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

export function FeaturesPage() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.plan.write');

  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<FeatureDefinition | null>(null);

  const q = useQuery({ queryKey: queryKeys.saasAdmin.featuresRegistry, queryFn: () => saasAdminApi.getFeatures() });

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name?: string; description?: string; status?: 'ACTIVE' | 'INACTIVE' } }) => saasAdminApi.updateFeature(id, payload),
    onSuccess: () => {
      toast.push('success', t('actions.save_changes') + ' ✓');
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.featuresRegistry });
      setEditing(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (q.isLoading) {
    return (
      <>
        <PageHeader eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.features')}`} title={t('admin.features.title')} subtitle={t('admin.features.subtitle')} />
        <CardSkeleton count={3} />
      </>
    );
  }

  if (!canAccessSection(role, 'features')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.features')}`} title={t('admin.features.title')} subtitle={t('admin.features.subtitle')} />
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.features.col_key')}</th>
                <th>{t('admin.features.col_name')}</th>
                <th>{t('admin.features.col_description')}</th>
                <th>{t('admin.features.col_type')}</th>
                <th>{t('admin.features.col_status')}</th>
                {canWrite && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {q.data?.map((f) => (
                <tr key={f.id}>
                  <td><code>{f.key}</code></td>
                  <td className="strong">{f.name}</td>
                  <td className="muted text-sm">{f.description}</td>
                  <td><Badge tone={f.type ?? 'BOOLEAN'}>{t(`admin.features.type_${f.type ?? 'BOOLEAN'}`)}</Badge></td>
                  <td><Badge tone={f.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}>{t(`status.${(f.status ?? 'ACTIVE').toLowerCase()}`)}</Badge></td>
                  {canWrite && (
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>{t('admin.features.edit_metadata')}</Button>
                    </td>
                  )}
                </tr>
              ))}
              {q.data?.length === 0 && <tr><td colSpan={6}><EmptyState icon="🧩">{t('empty.features')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <FeatureEditor
          feature={editing}
          onClose={() => setEditing(null)}
          onSave={(payload) => mutation.mutate({ id: editing.id, payload })}
          loading={mutation.isPending}
        />
      )}
    </>
  );
}

function FeatureEditor({ feature, onClose, onSave, loading }: { feature: FeatureDefinition; onClose: () => void; onSave: (p: { name?: string; description?: string; status?: 'ACTIVE' | 'INACTIVE' }) => void; loading: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState(feature.name);
  const [description, setDescription] = useState(feature.description);
  const [status, setStatus] = useState(feature.status);
  return (
    <Drawer
      open
      onClose={onClose}
      title={t('admin.features.edit_metadata')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={loading} onClick={() => onSave({ name, description, status })}>{t('actions.save_changes')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.features.col_key')}</span><span className="v"><code>{feature.key}</code></span></div>
        <div className="kv-row"><span className="k">{t('admin.features.col_type')}</span><span className="v">{t(`admin.features.type_${feature.type}`)}</span></div>
      </div>
      <div className="alert alert-info">{t('admin.features.subtitle')}</div>
      <Field label={t('admin.features.name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t('admin.features.description')}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label={t('admin.features.col_status')}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
          <option value="ACTIVE">{t('status.active')}</option>
          <option value="INACTIVE">{t('status.inactive')}</option>
        </Select>
      </Field>
    </Drawer>
  );
}
