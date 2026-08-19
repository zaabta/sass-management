import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount } from '../../../lib/format';
import type { Plan } from '../../../api/types';
import { Alert, Badge, Button, Card, CardSkeleton, ConfirmDialog, Drawer, EmptyState, Field, Input, PageHeader, Select, Textarea, useToast } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

export function PlansPage() {
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.plan.write');

  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<{ plan: Plan; kind: 'activate' | 'deactivate' } | null>(null);

  const q = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });
  const featuresQ = useQuery({ queryKey: queryKeys.saasAdmin.featuresRegistry, queryFn: () => saasAdminApi.getFeatures() });

  const statusMutation = useMutation({
    mutationFn: ({ plan, kind }: { plan: Plan; kind: 'activate' | 'deactivate' }) => saasAdminApi.setPlanStatus(plan.id, kind === 'activate' ? 'ACTIVE' : 'INACTIVE'),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.plans });
      setConfirmPlan(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  if (q.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('admin.plans.title')} description={t('admin.plans.subtitle')} />
        <CardSkeleton count={4} />
      </>
    );
  }
  const plans = q.data ?? [];

  if (!canAccessSection(role, 'plans')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <PageHeader
        title={t('admin.plans.title')}
        eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.plans')}`}
        subtitle={t('admin.plans.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => setEditing('new')}>+ {t('admin.plans.create')}</Button> : undefined}
      />
      <Card className="mb-4">
        <div className="card-header">
          <h3>{t('admin.plans.matrix_title')}</h3>
          <span className="card-sub">{t('admin.plans.matrix_subtitle')}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.features.col_name')}</th>
                {plans.map((p) => (
                  <th key={p.id} style={{ textAlign: 'center' }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(featuresQ.data ?? []).filter((f) => f.type === 'BOOLEAN').map((f) => (
                <tr key={f.key}>
                  <td className="strong">{f.name}<div className="muted text-xs">{f.key}</div></td>
                  {plans.map((p) => {
                    const enabled = (p.features ?? []).some((pf) => pf.featureKey === f.key && pf.enabled);
                    return (
                      <td key={p.id} style={{ textAlign: 'center' }}>
                        {enabled ? <Badge tone="ENABLED">✓</Badge> : <span className="muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="strong">{t('admin.plans.quota_row')}</td>
                {plans.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center', fontSize: 12 }} className="muted">
                    {Object.entries(p.limits ?? {}).map(([k, v]) => (
                      <div key={k}>{k.replace('MAX_', '').replace(/_/g, ' ')}: <strong>{v == null ? t('unlimited') : v}</strong></div>
                    ))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.plans.col_plan')}</th>
                <th>{t('admin.plans.col_code')}</th>
                <th className="num">{t('admin.plans.col_monthly')}</th>
                <th className="num">{t('admin.plans.col_annual')}</th>
                <th>{t('admin.plans.col_currency')}</th>
                <th>{t('admin.plans.col_status')}</th>
                <th className="num">{t('admin.plans.col_customers')}</th>
                {canWrite && <th>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}<div className="muted text-xs">{p.description}</div></td>
                  <td><code>{p.code}</code></td>
                  <td className="num">{formatAmount(p.monthlyPrice, p.currency, i18n.language, 0)}</td>
                  <td className="num">{formatAmount(p.annualPrice, p.currency, i18n.language, 0)}</td>
                  <td>{p.currency}</td>
                  <td><Badge tone={p.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}>{t(`status.${p.status.toLowerCase()}`)}</Badge></td>
                  <td className="num">{p.customersCount ?? 0}</td>
                  {canWrite && (
                    <td>
                      <div className="flex" style={{ gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>{t('admin.plans.edit')}</Button>
                        {p.status === 'ACTIVE' ? (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmPlan({ plan: p, kind: 'deactivate' })}>{t('admin.plans.deactivate')}</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmPlan({ plan: p, kind: 'activate' })}>{t('admin.plans.activate')}</Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {plans.length === 0 && <tr><td colSpan={8}><EmptyState icon="📦">{t('empty.plans')}</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <PlanEditor plan={editing === 'new' ? null : editing} features={featuresQ.data ?? []} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!confirmPlan}
        message={t(confirmPlan?.kind === 'deactivate' ? 'confirm.deactivate_plan' : 'confirm.activate_plan', { name: confirmPlan?.plan.name ?? '' })}
        onClose={() => setConfirmPlan(null)}
        onConfirm={() => confirmPlan && statusMutation.mutate(confirmPlan)}
        loading={statusMutation.isPending}
        danger={confirmPlan?.kind === 'deactivate'}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Plan editor (create / edit with features & quotas)
// ---------------------------------------------------------------------------

function PlanEditor({ plan, features, onClose }: { plan: Plan | null; features: { key: string; name: string; type: string }[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    code: string;
    description: string;
    monthlyPrice: string;
    annualPrice: string;
    currency: string;
    status: 'ACTIVE' | 'INACTIVE';
    sortOrder: string;
    featureKeys: Set<string>;
    limits: Record<string, number | null>;
  }>(() => ({
    name: plan?.name ?? '',
    code: plan?.code ?? '',
    description: plan?.description ?? '',
    monthlyPrice: plan?.monthlyPrice != null ? String(plan.monthlyPrice) : '',
    annualPrice: plan?.annualPrice != null ? String(plan.annualPrice) : '',
    currency: plan?.currency ?? 'USD',
    status: (plan?.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
    sortOrder: plan?.sortOrder != null ? String(plan.sortOrder) : '99',
    featureKeys: new Set<string>((plan?.features ?? []).filter((f) => f.enabled).map((f) => f.featureKey)),
    limits: { MAX_COMPANIES: 1, MAX_BRANCHES: 10, MAX_USERS: 5, MAX_UPLOADS_PER_MONTH: 20, MAX_STORAGE_GB: 1, MAX_AI_REQUESTS_PER_MONTH: 0, ...(plan?.limits ?? {}) },
  }));

  const mutation = useMutation({
    mutationFn: () =>
      plan
        ? saasAdminApi.updatePlan(plan.id, {
            name: form.name,
            description: form.description,
            monthlyPrice: form.monthlyPrice === '' ? null : Number(form.monthlyPrice),
            annualPrice: form.annualPrice === '' ? null : Number(form.annualPrice),
            currency: form.currency,
            status: form.status as 'ACTIVE' | 'INACTIVE',
            sortOrder: Number(form.sortOrder) || 99,
            features: features.map((f) => ({ featureKey: f.key, enabled: form.featureKeys.has(f.key), limitValue: null })),
            limits: form.limits,
          })
        : saasAdminApi.createPlan({
            name: form.name,
            code: form.code,
            description: form.description,
            monthlyPrice: form.monthlyPrice === '' ? null : Number(form.monthlyPrice),
            annualPrice: form.annualPrice === '' ? null : Number(form.annualPrice),
            currency: form.currency,
            status: form.status as 'ACTIVE' | 'INACTIVE',
            sortOrder: Number(form.sortOrder) || 99,
            features: features.map((f) => ({ featureKey: f.key, enabled: form.featureKeys.has(f.key), limitValue: null })),
            limits: form.limits,
          }),
    onSuccess: () => {
      toast.push('success', t('admin.plans.save') + ' ✓');
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.plans });
      qc.invalidateQueries({ queryKey: queryKeys.saasAdmin.overview });
      onClose();
    },
    onError: (e) => setError(isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const booleanFeatures = features.filter((f) => f.type === 'BOOLEAN');
  const quotaKeys = ['MAX_COMPANIES', 'MAX_BRANCHES', 'MAX_USERS', 'MAX_UPLOADS_PER_MONTH'];

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={plan ? t('admin.drawers.plan.edit') : t('admin.drawers.plan.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!form.name.trim() || !form.code.trim()) return setError(t('errors.required')); mutation.mutate(); }}>{t('admin.plans.save')}</Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {plan && <div className="alert alert-warning">{t('admin.plans.price_warning')}</div>}
      <div className="form-row cols-2">
        <Field label={t('admin.plans.name')}><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label={t('admin.plans.code')}><Input value={form.code} disabled={!!plan} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))} /></Field>
      </div>
      <Field label={t('admin.plans.description')}><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
      <div className="form-row cols-2">
        <Field label={t('admin.plans.monthly_price')}><Input type="number" min={0} step="0.01" value={form.monthlyPrice} onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))} /></Field>
        <Field label={t('admin.plans.annual_price')}><Input type="number" min={0} step="0.01" value={form.annualPrice} onChange={(e) => setForm((f) => ({ ...f, annualPrice: e.target.value }))} /></Field>
      </div>
      <div className="form-row cols-3">
        <Field label={t('admin.plans.currency')}><Input value={form.currency} maxLength={3} style={{ textTransform: 'uppercase' }} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></Field>
        <Field label={t('admin.plans.status')}>
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
            <option value="ACTIVE">{t('status.active')}</option>
            <option value="INACTIVE">{t('status.inactive')}</option>
          </Select>
        </Field>
        <Field label={t('admin.plans.sort_order')}><Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} /></Field>
      </div>
      <div className="divider" />
      <div className="card-title mb-3">{t('admin.plans.features_section')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {booleanFeatures.map((f) => (
          <label key={f.key} className="checkbox-row" style={{ fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={form.featureKeys.has(f.key)}
              onChange={(e) => setForm((prev) => {
                const next = new Set(prev.featureKeys);
                if (e.target.checked) next.add(f.key);
                else next.delete(f.key);
                return { ...prev, featureKeys: next };
              })}
            />
            {f.name}
          </label>
        ))}
      </div>
      <div className="divider" />
      <div className="card-title mb-3">{t('admin.plans.limits_section')}</div>
      <div className="form-row cols-2">
        {quotaKeys.map((k) => (
          <Field key={k} label={k.replace(/_/g, ' ')} hint={t('unlimited')}>
            <Input
              type="number"
              min={0}
              value={form.limits[k] ?? ''}
              placeholder={t('unlimited')}
              onChange={(e) => setForm((f) => ({ ...f, limits: { ...f.limits, [k]: e.target.value === '' ? null : Number(e.target.value) } }))}
            />
          </Field>
        ))}
      </div>
    </Drawer>
  );
}
