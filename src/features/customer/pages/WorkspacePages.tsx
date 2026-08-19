import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerApi } from '../../../api/services';
import { isApiError } from '../../../api/client';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LimitHint, PageHeader, TableSkeleton, useToast } from '../../../components/ui';
import { useSessionData } from '../../../hooks/useSession';
import { getLockReason } from '../../../components/FeatureRoute';
import { formatDate } from '../../../lib/format';

/** Shared restricted-state guard for workspace pages. */
export function useWorkspaceGuard() {
  const session = useSessionData();
  const reason = getLockReason(session);
  return reason.kind !== 'ok';
}

export function CompaniesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['customer', 'companies'], queryFn: () => customerApi.companies() });

  const mutation = useMutation({
    mutationFn: () => customerApi.createCompany({ name, baseCurrency: currency }),
    onSuccess: () => {
      toast.push('success', t('customer.workspace.created_ok'));
      qc.invalidateQueries({ queryKey: ['customer', 'companies'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      setName('');
      setCurrency('');
      setError(null);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'FEATURE_LIMIT_REACHED') setError(e.messages[0] ?? t('subscription.limit_reached'));
      else setError(isApiError(e) ? e.messages[0] ?? t('errors.internal') : t('errors.internal'));
    },
  });

  const companies = q.data ?? [];

  return (
    <>
      <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.workspace.companies')} />
      <LimitHint feature="MAX_COMPANIES" usage={companies.length} />
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        <Card>
          <div className="card-header">
            <h3>{t('customer.workspace.companies')}</h3>
            <span className="card-sub mono">
              {companies.length} / {t('unlimited')}
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customer.workspace.col_name')}</th>
                  <th>{t('customer.workspace.col_currency')}</th>
                  <th className="num">{t('customer.workspace.col_branches')}</th>
                  <th className="num">{t('customer.workspace.col_users')}</th>
                  <th>{t('customer.workspace.col_created')}</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && <tr><td colSpan={5}><TableSkeleton rows={3} cols={1} /></td></tr>}
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td className="mono">{c.baseCurrency}</td>
                    <td className="num">{c.branches}</td>
                    <td className="num">{c.users}</td>
                    <td className="muted tnum">{formatDate(c.createdAt, i18n.language)}</td>
                  </tr>
                ))}
                {!q.isLoading && companies.length === 0 && <tr><td colSpan={5}><EmptyState icon="🏢">{t('empty.companies')}</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('customer.workspace.create_company')}</h3>
          </div>
          <div className="card-body">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label={t('customer.workspace.company_name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('customer.workspace.base_currency')}>
              <Input value={currency} maxLength={3} style={{ textTransform: 'uppercase' }} placeholder="USD" onChange={(e) => setCurrency(e.target.value)} />
            </Field>
            <Button variant="primary" loading={mutation.isPending} disabled={!name.trim()} onClick={() => { setError(null); mutation.mutate(); }}>
              + {t('customer.workspace.create_company')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function BranchesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [companyId, setCompanyId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const companiesQ = useQuery({ queryKey: ['customer', 'companies'], queryFn: () => customerApi.companies() });
  const branchesQ = useQuery({ queryKey: ['customer', 'branches'], queryFn: () => customerApi.branches() });

  const mutation = useMutation({
    mutationFn: () => customerApi.createBranch({ companyId, name }),
    onSuccess: () => {
      toast.push('success', t('customer.workspace.created_ok'));
      qc.invalidateQueries({ queryKey: ['customer', 'branches'] });
      qc.invalidateQueries({ queryKey: ['customer', 'companies'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      setName('');
      setError(null);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'FEATURE_LIMIT_REACHED') setError(e.messages[0] ?? t('subscription.limit_reached'));
      else setError(isApiError(e) ? e.messages[0] ?? t('errors.internal') : t('errors.internal'));
    },
  });

  const branches = branchesQ.data ?? [];
  const totalBranches = (companiesQ.data ?? []).reduce((s, c) => s + c.branches, 0);

  return (
    <>
      <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.workspace.branches')} />
      <LimitHint feature="MAX_BRANCHES" usage={totalBranches} />
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        <Card>
          <div className="card-header">
            <h3>{t('customer.workspace.branches')}</h3>
            <span className="card-sub mono">{branches.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customer.workspace.col_name')}</th>
                  <th>{t('customer.workspace.col_company')}</th>
                  <th>{t('customer.workspace.col_created')}</th>
                </tr>
              </thead>
              <tbody>
                {branchesQ.isLoading && <tr><td colSpan={3}><TableSkeleton rows={4} cols={1} /></td></tr>}
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td className="strong">{b.name}</td>
                    <td className="muted">{b.companyName}</td>
                    <td className="muted tnum">{formatDate(b.createdAt, i18n.language)}</td>
                  </tr>
                ))}
                {!branchesQ.isLoading && branches.length === 0 && <tr><td colSpan={3}><EmptyState icon="🏬">{t('empty.companies')}</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('customer.workspace.create_branch')}</h3>
          </div>
          <div className="card-body">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label={t('customer.workspace.select_company')}>
              <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">—</option>
                {(companiesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('customer.workspace.branch_name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button variant="primary" loading={mutation.isPending} disabled={!name.trim() || !companyId} onClick={() => { setError(null); mutation.mutate(); }}>
              + {t('customer.workspace.create_branch')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['customer', 'memberships'], queryFn: () => customerApi.memberships() });
  const users = q.data ?? [];
  const activeCount = users.filter((u) => u.isActive && u.membershipStatus !== 'DISABLED').length;

  return (
    <>
      <PageHeader eyebrow={t('customer.dashboard.eyebrow')} title={t('customer.workspace.users')} />
      <LimitHint feature="MAX_USERS" usage={activeCount} />
      <Card>
        <div className="card-header">
          <h3>{t('customer.workspace.users')}</h3>
          <span className="card-sub mono">{activeCount} {t('status.active')}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('customer.workspace.col_name')}</th>
                <th>Email</th>
                <th>{t('customer.workspace.col_role')}</th>
                <th>{t('customer.workspace.col_membership')}</th>
                <th>{t('customer.workspace.col_company')}</th>
                <th>{t('admin.customer_detail.users.col_last_login')}</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={6}><TableSkeleton rows={3} cols={1} /></td></tr>}
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td><Badge tone={u.role}>{t(`admin.roles.${u.role}`)}</Badge></td>
                  <td><Badge tone={u.membershipStatus}>{t(`admin.membership.${u.membershipStatus}`)}</Badge></td>
                  <td className="muted text-sm">{u.companyIds.length} companies</td>
                  <td className="muted tnum text-sm">{u.lastLoginAt ? formatDate(u.lastLoginAt, i18n.language) : '—'}</td>
                </tr>
              ))}
              {!q.isLoading && users.length === 0 && <tr><td colSpan={6}><EmptyState icon="👥">{t('empty.users')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
