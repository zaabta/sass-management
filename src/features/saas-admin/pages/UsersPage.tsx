import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatDateTime } from '../../../lib/format';
import type { CustomerUser } from '../../../api/types';
import { Badge, Button, Card, CardSkeleton, ConfirmDialog, EmptyState, MembershipStatusBadge, PageHeader, RoleBadge, Select, TableSkeleton, useToast } from '../../../components/ui';
import { UserDrawer } from '../components/drawers';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

const ROLES = ['OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER', 'APPROVER'];

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.user.write');

  const [filters, setFilters] = useState<Record<string, string>>({ customerId: '', role: '', membershipStatus: '', active: '' });
  const [editing, setEditing] = useState<CustomerUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ user: CustomerUser; action: 'disable' | 'enable' | 'suspend' | 'reactivate' } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const customersQ = useQuery({ queryKey: queryKeys.saasAdmin.customers({ page: 1, pageSize: 100 }), queryFn: () => saasAdminApi.getCustomers({ page: 1, pageSize: 100 }) });

  const q = useQuery({
    queryKey: queryKeys.saasAdmin.users(filters),
    queryFn: () => saasAdminApi.getAllUsers(filters),
    placeholderData: (prev) => prev,
  });

  const mutation = useMutation({
    mutationFn: ({ user, action }: { user: CustomerUser; action: 'disable' | 'enable' | 'suspend' | 'reactivate' }) =>
      saasAdminApi.updateUser(user.id, {
        isActive: action === 'disable' ? false : true,
        status: action === 'suspend' ? 'SUSPENDED' : action === 'disable' ? 'DISABLED' : 'ACTIVE',
      }),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.user.customerId);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (q.isLoading && !q.data) {
    return (
      <>
        <PageHeader eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.users')}`} title={t('admin.users.title')} subtitle={t('admin.users.subtitle')} />
        <CardSkeleton count={3} />
      </>
    );
  }

  if (!canAccessSection(role, 'users')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader
        title={t('admin.users.title')}
        eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.users')}`}
        subtitle={t('admin.users.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => { setEditing(null); setDrawerOpen(true); }}>+ {t('admin.users.add')}</Button> : undefined}
      />
      <Card>
        <div className="table-tools">
          <Select value={filters.customerId} onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.users.filter_customer')}>
            <option value="">{t('admin.users.filter_customer')}: {t('all')}</option>
            {customersQ.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.users.filter_role')}>
            <option value="">{t('admin.users.filter_role')}: {t('all')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
            ))}
          </Select>
          <Select value={filters.membershipStatus} onChange={(e) => setFilters((f) => ({ ...f, membershipStatus: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.users.filter_membership')}>
            <option value="">{t('admin.users.filter_membership')}: {t('all')}</option>
            {(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const).map((s) => (
              <option key={s} value={s}>{t(`admin.membership.${s}`)}</option>
            ))}
          </Select>
          <Select value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))} style={{ width: 'auto' }} aria-label={t('admin.users.filter_active')}>
            <option value="">{t('admin.users.filter_active')}: {t('admin.users.any')}</option>
            <option value="true">{t('admin.users.active')}</option>
            <option value="false">{t('admin.users.inactive')}</option>
          </Select>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.users.col_user')}</th>
                <th>{t('admin.users.col_email')}</th>
                <th>{t('admin.users.col_customer')}</th>
                <th>{t('admin.users.col_role')}</th>
                <th>{t('admin.users.col_membership')}</th>
                <th>{t('admin.users.col_active')}</th>
                <th>{t('admin.users.col_companies')}</th>
                <th>{t('admin.customer_detail.users.col_last_login')}</th>
                {canWrite && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={9}><TableSkeleton rows={6} cols={1} /></td></tr>}
              {(q.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>
                    <a href={`/saas-admin/customers/${u.customerId}`} className="strong" onClick={(e) => e.preventDefault()}>{u.customerName}</a>
                    <div className="muted text-xs">{u.customerCode}</div>
                  </td>
                  <td><RoleBadge role={u.customerRole} /></td>
                  <td><MembershipStatusBadge status={u.membershipStatus} /></td>
                  <td><Badge tone={u.isActive ? 'ACTIVE' : 'DISABLED'}>{u.isActive ? t('admin.users.active') : t('admin.users.inactive')}</Badge></td>
                  <td className="muted text-sm">{u.companies?.join(', ') || '—'}</td>
                  <td className="tnum muted text-sm">{formatDateTime(u.lastLoginAt, i18n.language)}</td>
                  {canWrite && (
                    <td>
                      <div className="flex" style={{ gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(u); setDrawerOpen(true); }}>{t('admin.users.edit')}</Button>
                        {u.isActive && u.membershipStatus !== 'SUSPENDED' && u.membershipStatus !== 'DISABLED' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, action: 'suspend' })}>{t('admin.users.suspend')}</Button>}
                        {u.membershipStatus === 'SUSPENDED' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, action: 'reactivate' })}>{t('admin.users.unsuspend')}</Button>}
                        {u.isActive && u.membershipStatus !== 'DISABLED' && <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ user: u, action: 'disable' })}>{t('admin.users.disable')}</Button>}
                        {(!u.isActive || u.membershipStatus === 'DISABLED') && <Button size="sm" variant="ghost" onClick={() => setConfirm({ user: u, action: 'enable' })}>{t('admin.users.enable')}</Button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(q.data ?? []).length === 0 && <tr><td colSpan={9}><EmptyState icon="👥">{t('empty.users')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {drawerOpen && (
        <UserDrawer
          customerId={editing?.customerId ?? customersQ.data?.items[0]?.id ?? ''}
          user={editing}
          companies={[]}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        message={t(
          confirm?.action === 'disable' ? 'confirm.disable_user' : confirm?.action === 'enable' ? 'confirm.activate_user' : confirm?.action === 'suspend' ? 'confirm.suspend_user' : 'confirm.reactivate_user',
          { name: confirm ? `${confirm.user.firstName} ${confirm.user.lastName}` : '' },
        )}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && mutation.mutate(confirm)}
        loading={mutation.isPending}
        danger={confirm?.action === 'disable'}
      />
    </>
  );
}
