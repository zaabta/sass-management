import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatDateTime } from '../../../lib/format';
import type { PlatformRole, PlatformUser } from '../../../api/types';
import { Alert, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, Field, Input, PageHeader, RoleBadge, Select, TableSkeleton, useToast } from '../../../components/ui';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

const PLATFORM_ROLES: PlatformRole[] = ['SUPER_ADMIN', 'SAAS_ADMIN', 'BILLING_ADMIN', 'SUPPORT'];

export function PlatformUsersPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const isSuper = role === 'SUPER_ADMIN';

  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PlatformUser | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ user: PlatformUser; enable: boolean } | null>(null);

  const q = useQuery({ queryKey: queryKeys.saasAdmin.platformUsers, queryFn: () => saasAdminApi.getPlatformUsers() });

  const mutation = useMutation({
    mutationFn: ({ user, enable }: { user: PlatformUser; enable: boolean }) => saasAdminApi.updatePlatformUser(user.id, { isActive: enable }),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.platformUsers });
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (!canAccessSection(role, 'platform-users')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader
        title={t('admin.platform_users.title')}
        eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.platform_users')}`}
        subtitle={t('admin.platform_users.subtitle')}
        actions={isSuper ? <Button variant="primary" onClick={() => setEditing('new')}>+ {t('admin.platform_users.add')}</Button> : undefined}
      />
      <div className="alert alert-info">{t('admin.platform_users.note')}</div>
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.platform_users.col_user')}</th>
                <th>{t('admin.platform_users.col_email')}</th>
                <th>{t('admin.platform_users.col_role')}</th>
                <th>{t('admin.platform_users.col_status')}</th>
                <th>{t('admin.platform_users.col_last_login')}</th>
                {isSuper && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={6}><TableSkeleton rows={4} cols={1} /></td></tr>}
              {q.data?.map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td><RoleBadge role={u.platformRole} platform /></td>
                  <td><Badge tone={u.isActive ? 'ACTIVE' : 'DISABLED'}>{u.isActive ? t('status.active') : t('status.inactive')}</Badge></td>
                  <td className="tnum muted text-sm">{formatDateTime(u.lastLoginAt, i18n.language)}</td>
                  {isSuper && (
                    <td>
                      <div className="flex" style={{ gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>{t('actions.edit')}</Button>
                        {u.isActive ? (
                          <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ user: u, enable: false })}>{t('admin.platform_users.disable')}</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, enable: true })}>{t('admin.platform_users.enable')}</Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {q.data?.length === 0 && <tr><td colSpan={6}><EmptyState icon="🛡️">{t('empty.platform_users')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <PlatformUserEditor user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!confirm}
        message={t(confirm?.enable ? 'confirm.enable_platform_user' : 'confirm.disable_platform_user', { name: confirm ? `${confirm.user.firstName} ${confirm.user.lastName}` : '' })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && mutation.mutate(confirm)}
        loading={mutation.isPending}
        danger={!confirm?.enable}
      />
    </>
  );
}

function PlatformUserEditor({ user, onClose }: { user: PlatformUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [platformRole, setPlatformRole] = useState<PlatformRole>(user?.platformRole ?? 'SAAS_ADMIN');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      user
        ? saasAdminApi.updatePlatformUser(user.id, { firstName, lastName, platformRole })
        : saasAdminApi.createPlatformUser({ firstName, lastName, email, platformRole }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.platform_user.success'));
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.platformUsers });
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'DUPLICATE_EMAIL') setError(t('errors.duplicate_email'));
      else setError(isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal'));
    },
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={user ? t('admin.drawers.platform_user.edit') : t('admin.drawers.platform_user.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!firstName.trim() || (!user && !email.trim())) return setError(t('errors.required')); mutation.mutate(); }}>{t('admin.drawers.platform_user.submit')}</Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.platform_user.first_name')}><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
        <Field label={t('admin.drawers.platform_user.last_name')}><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
      </div>
      <Field label={t('admin.drawers.platform_user.email')}>
        <Input type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t('admin.drawers.platform_user.role')}>
        <Select value={platformRole} onChange={(e) => setPlatformRole(e.target.value as PlatformRole)}>
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
          ))}
        </Select>
      </Field>
    </Drawer>
  );
}
