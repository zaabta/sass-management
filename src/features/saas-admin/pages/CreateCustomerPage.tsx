import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { newIdempotencyKey } from '../../../api/client';
import { queryKeys } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { addDaysIso, formatAmount, formatDate, todayIso } from '../../../lib/format';
import type { BillingCycle, CreateCustomerPayload } from '../../../api/types';
import { Alert, Badge, Button, Card, Field, Input, Select, useToast } from '../../../components/ui';
import { AdminPageHeader } from '../../../components/admin';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

const STEPS = ['customer', 'plan', 'dates', 'price', 'overrides', 'owner', 'company', 'review'] as const;

interface WizardState {
  customer: { name: string; legalName: string; email: string; phone: string; country: string; timezone: string; defaultCurrency: string };
  planId: string;
  dates: { start: string; expiry: string; grace: string; billingCycle: BillingCycle; trial: boolean };
  price: { agreedPrice: string; currency: string; notes: string };
  overrides: Record<string, { enabled: boolean; limitValue: string; notes: string }>;
  owner: { firstName: string; lastName: string; email: string; password: string; phone: string };
  company: { name: string; legalName: string; baseCurrency: string };
}

const initial: WizardState = {
  customer: { name: '', legalName: '', email: '', phone: '', country: '', timezone: '', defaultCurrency: 'USD' },
  planId: '',
  dates: { start: todayIso(), expiry: addDaysIso(todayIso(), 365), grace: '', billingCycle: 'MONTHLY', trial: false },
  price: { agreedPrice: '', currency: 'USD', notes: '' },
  overrides: {},
  owner: { firstName: '', lastName: '', email: '', password: '', phone: '' },
  company: { name: '', legalName: '', baseCurrency: 'USD' },
};

export function CreateCustomerPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [activate, setActivate] = useState(true);
  // Idempotency: double-submit must not create two customers (contract).
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);

  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });
  const plans = plansQ.data?.filter((p) => p.status === 'ACTIVE') ?? [];
  const selectedPlan = plans.find((p) => p.id === state.planId);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => setState((s) => ({ ...s, [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      // Flat payload per the SaaS Admin contract. Only overrides that differ
      // from the plan are sent (featureOverrides).
      const overrides = Object.entries(state.overrides)
        .filter(([featureKey]) => {
          const planRow = selectedPlan?.features.find((f) => f.featureKey === featureKey);
          const o = state.overrides[featureKey];
          const isQuota = /^MAX_/.test(featureKey) || planRow?.featureType === 'QUOTA';
          if (isQuota) return true; // quota override sent explicitly (limitValue)
          return !planRow || planRow.enabled !== o.enabled; // only diffs
        })
        .map(([featureKey, o]) => {
          const isQuota = /^MAX_/.test(featureKey);
          return isQuota
            ? { featureKey, limitValue: o.limitValue !== '' ? Number(o.limitValue) : null }
            : { featureKey, enabled: o.enabled };
        });
      const payload: CreateCustomerPayload = {
        idempotencyKey,
        customer: {
          name: state.customer.name,
          legalName: state.customer.legalName || null,
          email: state.customer.email || undefined,
          phone: state.customer.phone || null,
          country: state.customer.country || null,
          timezone: state.customer.timezone || null,
          defaultCurrency: state.customer.defaultCurrency,
        },
        planId: state.planId,
        startDate: state.dates.start,
        expiryDate: state.dates.expiry,
        gracePeriodUntil: state.dates.grace || null,
        billingCycle: state.dates.billingCycle,
        agreedPrice: state.price.agreedPrice !== '' ? Number(state.price.agreedPrice) : (selectedPlan?.monthlyPrice ?? 0),
        currency: state.price.currency,
        notes: state.price.notes || null,
        featureOverrides: overrides,
        owner: {
          email: state.owner.email,
          password: state.owner.password,
          firstName: state.owner.firstName,
          lastName: state.owner.lastName,
          phone: state.owner.phone || null,
        },
        company: {
          name: state.company.name,
          legalName: state.company.legalName || null,
          baseCurrency: state.company.baseCurrency,
        },
        activate,
      };
      return saasAdminApi.createCustomer(payload, idempotencyKey);
    },
    onSuccess: (c) => {
      toast.push('success', t('admin.wizard.success'));
      navigate(`/saas-admin/customers/${c.id}`, { replace: true });
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'DUPLICATE_EMAIL') setError(t('errors.duplicate_email'));
      else if (isApiError(e)) setError(e.message ?? t('errors.internal'));
      else setError(t('errors.internal'));
    },
  });

  /** Plan price by billing cycle (monthly vs annual) — prefill, always editable. */
  const planPrice = (plan: typeof selectedPlan, cycle: BillingCycle): number | null => {
    if (!plan) return null;
    if (plan.monthlyPrice == null) return null; // ENTERPRISE custom pricing
    return cycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
  };

  const stepValid = (): string | null => {
    switch (STEPS[step]) {
      case 'customer':
        if (!state.customer.name.trim()) return t('errors.required');
        if (state.customer.name.length > 200) return t('errors.required');
        if (state.customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.customer.email)) return t('errors.invalid_email');
        if (state.customer.defaultCurrency && !/^[A-Za-z]{3}$/.test(state.customer.defaultCurrency)) return t('errors.invalid_email');
        return null;
      case 'plan':
        return state.planId ? null : t('errors.required');
      case 'dates':
        if (!state.dates.start || !state.dates.expiry) return t('errors.required');
        if (state.dates.expiry < state.dates.start) return t('errors.date_order');
        if (state.dates.grace && state.dates.grace < state.dates.expiry) return t('errors.date_order');
        return null;
      case 'price':
        if (state.price.agreedPrice !== '' && (isNaN(Number(state.price.agreedPrice)) || Number(state.price.agreedPrice) < 0)) return t('errors.positive');
        return null;
      case 'overrides':
        return null;
      case 'owner':
        if (!state.owner.firstName.trim() || !state.owner.lastName.trim()) return t('errors.required');
        if (!state.owner.email.trim()) return t('errors.required');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.owner.email)) return t('errors.invalid_email');
        if (!state.owner.password || state.owner.password.length < 8) return t('errors.required');
        return null;
      case 'company':
        return state.company.name.trim() ? null : t('errors.required');
      case 'review':
        return null;
    }
  };

  const next = () => {
    setError(null);
    const v = stepValid();
    if (v) return setError(v);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const QUOTA_KEYS = ['MAX_COMPANIES', 'MAX_BRANCHES', 'MAX_USERS', 'MAX_UPLOADS_PER_MONTH'];
  const booleanFeatures = useMemo(() => (selectedPlan?.features ?? []).filter((f) => !QUOTA_KEYS.includes(f.featureKey)), [selectedPlan]);

  const quotaLimits = selectedPlan?.limits ?? {};

  if (!canAccessSection(role, 'customers')) return <Navigate to="/saas-admin/customers" replace />;

  return (
    <>
      <AdminPageHeader
        title={t('admin.wizard.title')}
        description={t('admin.wizard.subtitle')}
        breadcrumbs={[{ label: t('admin.customers.title'), to: '/saas-admin/customers' }, { label: t('admin.wizard.title') }]}
        actions={<Button variant="ghost" onClick={() => navigate('/saas-admin/customers')}>{t('actions.cancel')}</Button>}
      />

      {/* Stepper: العميل 1 → الخطة 2 → … (arrows flip in RTL) */}
      <div className="wizard-steps" role="list" aria-label={t('admin.wizard.subtitle')}>
        {STEPS.map((k, i) => (
          <span key={k} className="flex" style={{ gap: 0, alignItems: 'center' }}>
            {i > 0 && (
              <span className={`wizard-arrow ${i <= step ? 'done' : ''}`} aria-hidden="true">
                →
              </span>
            )}
            <button
              type="button"
              role="listitem"
              className={`wizard-step ${i === step ? 'current' : i < step ? 'done clickable' : ''}`}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{t(`admin.wizard.step${i + 1}`)}</span>
            </button>
          </span>
        ))}
      </div>

      <div style={{ maxWidth: 860 }}>
      <Card pad>
        {error && <Alert tone="error">{error}</Alert>}

        {STEPS[step] === 'customer' && (
          <>
            <h3 className="mb-4">{t('admin.wizard.step1')}</h3>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.customer.name')}><Input value={state.customer.name} onChange={(e) => set('customer', { ...state.customer, name: e.target.value })} /></Field>
              <Field label={t('admin.wizard.customer.legal_name')}><Input value={state.customer.legalName} onChange={(e) => set('customer', { ...state.customer, legalName: e.target.value })} /></Field>
            </div>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.customer.email')}><Input type="email" value={state.customer.email} onChange={(e) => set('customer', { ...state.customer, email: e.target.value })} /></Field>
              <Field label={t('admin.wizard.customer.phone')}><Input value={state.customer.phone} onChange={(e) => set('customer', { ...state.customer, phone: e.target.value })} /></Field>
            </div>
            <div className="form-row cols-3">
              <Field label={t('admin.wizard.customer.country')}><Input value={state.customer.country} onChange={(e) => set('customer', { ...state.customer, country: e.target.value })} /></Field>
              <Field label={t('admin.wizard.customer.timezone')}><Input value={state.customer.timezone} onChange={(e) => set('customer', { ...state.customer, timezone: e.target.value })} /></Field>
              <Field label={t('admin.wizard.customer.default_currency')}><Input value={state.customer.defaultCurrency} maxLength={3} style={{ textTransform: 'uppercase' }} onChange={(e) => set('customer', { ...state.customer, defaultCurrency: e.target.value })} /></Field>
            </div>
          </>
        )}

        {STEPS[step] === 'plan' && (
          <>
            <h3 className="mb-2">{t('admin.wizard.step2')}</h3>
            <p className="muted text-sm mb-4">{t('admin.wizard.plan.select')}</p>
            {plansQ.isLoading && <div className="stat-grid">{plans.map((_, i) => <div key={i} className="skeleton skeleton-card" />)}</div>}
            <div className="stat-grid">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`plan-card ${state.planId === p.id ? 'selected' : ''}`}
                  onClick={() => {
                    set('planId', p.id);
                    // Prefill agreed price from the plan (by cycle) — always editable.
                    const price = p.monthlyPrice != null ? (state.dates.billingCycle === 'ANNUAL' ? p.annualPrice : p.monthlyPrice) : null;
                    if (price != null) set('price', { ...state.price, agreedPrice: String(price), currency: p.currency });
                    else set('price', { ...state.price, currency: p.currency });
                  }}
                >
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price">
                    {formatAmount(p.monthlyPrice, p.currency, i18n.language, 0)} <small>{t('per_month')}</small>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>{formatAmount(p.annualPrice, p.currency, i18n.language, 0)} {t('per_year')}</div>
                  </div>
                  <div className="plan-desc">{p.description}</div>
                  <div className="text-xs muted mb-2">{t('admin.wizard.plan.key_features')}</div>
                  <ul>
                    {(p.features ?? []).filter((f) => f.enabled && f.featureKey !== 'MAX_COMPANIES' && f.featureKey !== 'MAX_BRANCHES' && f.featureKey !== 'MAX_USERS' && f.featureKey !== 'MAX_UPLOADS_PER_MONTH').slice(0, 8).map((f) => (
                      <li key={f.featureKey}>✓ {f.featureKey.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                  <div className="text-xs muted mt-2">{t('admin.wizard.plan.limits')}</div>
                  <ul>
                    {Object.entries(p.limits ?? {}).map(([k, v]) => (
                      <li key={k}>{k.replace(/_/g, ' ')}: {v == null ? t('unlimited') : v}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {STEPS[step] === 'dates' && (
          <>
            <h3 className="mb-4">{t('admin.wizard.step3')}</h3>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.dates.start')}><Input type="date" value={state.dates.start} onChange={(e) => set('dates', { ...state.dates, start: e.target.value })} /></Field>
              <Field label={t('admin.wizard.dates.expiry')}><Input type="date" value={state.dates.expiry} onChange={(e) => set('dates', { ...state.dates, expiry: e.target.value })} /></Field>
            </div>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.dates.grace')}><Input type="date" value={state.dates.grace} onChange={(e) => set('dates', { ...state.dates, grace: e.target.value })} /></Field>
              <Field label={t('admin.wizard.dates.billing_cycle')}>
                <Select
                  value={state.dates.billingCycle}
                  onChange={(e) => {
                    const cycle = e.target.value as BillingCycle;
                    const next = { ...state.dates, billingCycle: cycle };
                    // ANNUAL → prefill expiry = start + 1 year (contract suggestion)
                    if (cycle === 'ANNUAL' && state.dates.expiry === addDaysIso(state.dates.start, 365)) {
                      next.expiry = addDaysIso(state.dates.start, 365);
                    }
                    set('dates', next);
                  }}
                >
                  <option value="MONTHLY">{t('admin.billing_cycle.MONTHLY')}</option>
                  <option value="QUARTERLY">{t('admin.billing_cycle.QUARTERLY')}</option>
                  <option value="SEMI_ANNUAL">{t('admin.billing_cycle.SEMI_ANNUAL')}</option>
                  <option value="ANNUAL">{t('admin.billing_cycle.ANNUAL')}</option>
                  <option value="CUSTOM">{t('admin.billing_cycle.CUSTOM')}</option>
                </Select>
              </Field>
            </div>
            <div className="alert alert-info" style={{ fontSize: 12.5 }}>
              {t('admin.wizard.dates.activate_hint')}
            </div>
          </>
        )}

        {STEPS[step] === 'price' && (
          <>
            <h3 className="mb-4">{t('admin.wizard.step4')}</h3>
            {selectedPlan && (
              <div className="stat-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                <Card pad>
                  <div className="stat-label">{t('admin.wizard.price.standard')}</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {formatAmount(selectedPlan.monthlyPrice, selectedPlan.currency, i18n.language, 0)}
                    <small> {t('per_month')}</small>
                  </div>
                  <div className="stat-foot">{selectedPlan.name}</div>
                </Card>
                <Card pad>
                  <div className="stat-label">{t('admin.wizard.price.agreed')}</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {formatAmount(state.price.agreedPrice !== '' ? Number(state.price.agreedPrice) : selectedPlan.monthlyPrice, state.price.currency, i18n.language, 0)}
                    <small> {t('per_month')}</small>
                  </div>
                  {state.price.agreedPrice !== '' && Number(state.price.agreedPrice) !== selectedPlan.monthlyPrice && (
                    <div className="stat-foot" style={{ color: 'var(--amber)' }}>⚠ {t('admin.wizard.price.differs')}</div>
                  )}
                </Card>
              </div>
            )}
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.price.agreed')}>
                <Input type="number" min={0} step="0.01" value={state.price.agreedPrice} placeholder={String(planPrice(selectedPlan, state.dates.billingCycle) ?? '')} onChange={(e) => set('price', { ...state.price, agreedPrice: e.target.value })} />
              </Field>
              <Field label={t('admin.wizard.price.currency')}>
                <Input value={state.price.currency} maxLength={3} style={{ textTransform: 'uppercase' }} onChange={(e) => set('price', { ...state.price, currency: e.target.value })} />
              </Field>
            </div>
            <Field label={t('admin.wizard.price.notes')}>
              <textarea className="textarea" value={state.price.notes} onChange={(e) => set('price', { ...state.price, notes: e.target.value })} placeholder={t('admin.wizard.price.notes_ph')} />
            </Field>
            <div className="alert alert-info" style={{ fontSize: 12.5 }}>{t('admin.wizard.price.negotiated_hint')}</div>
          </>
        )}

        {STEPS[step] === 'overrides' && selectedPlan && (
          <>
            <h3 className="mb-2">{t('admin.wizard.step5')}</h3>
            <p className="muted text-sm mb-4">{t('admin.wizard.overrides.hint')}</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.customer_detail.features.col_feature')}</th>
                    <th>{t('admin.wizard.overrides.plan')}</th>
                    <th>{t('admin.wizard.overrides.override')}</th>
                    <th>{t('admin.drawers.override.limit_value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {booleanFeatures.map((f) => {
                    const ov = state.overrides[f.featureKey];
                    const featureName = f.featureKey.replace(/_/g, ' ');
                    return (
                      <tr key={f.featureKey}>
                        <td className="strong">{featureName}</td>
                        <td><Badge tone={f.enabled ? 'ENABLED' : 'DISABLED'}>{f.enabled ? t('status.enabled') : t('status.disabled')}</Badge></td>
                        <td>
                          <Select
                            value={ov ? (ov.enabled ? '1' : '0') : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') {
                                const next = { ...state.overrides };
                                delete next[f.featureKey];
                                set('overrides', next);
                              } else {
                                set('overrides', { ...state.overrides, [f.featureKey]: { enabled: v === '1', limitValue: '', notes: '' } });
                              }
                            }}
                          >
                            <option value="">—</option>
                            <option value="1">{t('status.enabled')}</option>
                            <option value="0">{t('status.disabled')}</option>
                          </Select>
                        </td>
                        <td></td>
                      </tr>
                    );
                  })}
                  {booleanFeatures.length === 0 && <tr><td colSpan={4}><span className="muted">{t('admin.wizard.overrides.none')}</span></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <div className="text-xs muted mb-2">{t('admin.wizard.plan.limits')} ({t('admin.wizard.overrides.override')})</div>
              {Object.entries(quotaLimits).map(([k, v]) => {
                const ov = state.overrides[k];
                return (
                  <div className="form-row cols-3" key={k}>
                    <div className="field"><label>{k.replace(/_/g, ' ')}</label><div className="hint">Plan: {v == null ? t('unlimited') : v}</div></div>
                    <div className="field">
                      <Select value={ov ? '1' : ''} onChange={(e) => set('overrides', { ...state.overrides, [k]: e.target.value ? { enabled: true, limitValue: '', notes: '' } : state.overrides[k] })}>
                        <option value="">—</option>
                        <option value="1">{t('actions.override') ? t('admin.drawers.override.add') : 'Override'}</option>
                      </Select>
                    </div>
                    <div className="field">
                      {ov && <Input type="number" min={0} placeholder={t('unlimited')} value={ov.limitValue} onChange={(e) => set('overrides', { ...state.overrides, [k]: { ...ov, limitValue: e.target.value } })} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {STEPS[step] === 'owner' && (
          <>
            <h3 className="mb-2">{t('admin.wizard.step6')}</h3>
            <p className="muted text-sm mb-4">{t('admin.wizard.owner.hint')}</p>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.owner.first_name')}><Input value={state.owner.firstName} onChange={(e) => set('owner', { ...state.owner, firstName: e.target.value })} /></Field>
              <Field label={t('admin.wizard.owner.last_name')}><Input value={state.owner.lastName} onChange={(e) => set('owner', { ...state.owner, lastName: e.target.value })} /></Field>
            </div>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.owner.email')}><Input type="email" value={state.owner.email} onChange={(e) => set('owner', { ...state.owner, email: e.target.value })} /></Field>
              <Field label={t('admin.wizard.owner.password')}><Input type="password" value={state.owner.password} onChange={(e) => set('owner', { ...state.owner, password: e.target.value })} placeholder="8+ characters" /></Field>
            </div>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.owner.phone')}><Input value={state.owner.phone} onChange={(e) => set('owner', { ...state.owner, phone: e.target.value })} /></Field>
            </div>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.owner.role')}>
                <Input value={t('admin.wizard.owner.role_value')} disabled />
              </Field>

            </div>
          </>
        )}

        {STEPS[step] === 'company' && (
          <>
            <h3 className="mb-2">{t('admin.wizard.step7')}</h3>
            <p className="muted text-sm mb-4">{t('admin.wizard.company.hint')}</p>
            <div className="form-row cols-2">
              <Field label={t('admin.wizard.company.name')}><Input value={state.company.name} onChange={(e) => set('company', { ...state.company, name: e.target.value })} /></Field>
              <Field label={t('admin.wizard.company.legal_name')}><Input value={state.company.legalName} onChange={(e) => set('company', { ...state.company, legalName: e.target.value })} /></Field>
            </div>
            <Field label={t('admin.wizard.company.base_currency')}>
              <Input value={state.company.baseCurrency} maxLength={3} style={{ textTransform: 'uppercase' }} onChange={(e) => set('company', { ...state.company, baseCurrency: e.target.value })} />
            </Field>
          </>
        )}

        {STEPS[step] === 'review' && (
          <>
            <h3 className="mb-2">{t('admin.wizard.step8')}</h3>
            <p className="muted text-sm mb-4">{t('admin.wizard.review.confirm')}</p>
            <ReviewSection title={t('admin.wizard.review.customer')}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">{t('admin.wizard.customer.name')}</span><span className="v">{state.customer.name}</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.customer.email')}</span><span className="v">{state.customer.email}</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.customer.country')}</span><span className="v">{state.customer.country || '—'}</span></div>
              </div>
            </ReviewSection>
            <ReviewSection title={t('admin.wizard.review.plan')}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">{t('admin.wizard.review.plan')}</span><span className="v">{selectedPlan?.name} ({selectedPlan?.code})</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.review.price')}</span><span className="v">{formatAmount(state.price.agreedPrice !== '' ? Number(state.price.agreedPrice) : selectedPlan?.monthlyPrice ?? 0, state.price.currency, i18n.language, 0)} / {t('per_month')}</span></div>
              </div>
            </ReviewSection>
            <ReviewSection title={t('admin.wizard.review.dates')}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">{t('admin.wizard.dates.start')}</span><span className="v">{formatDate(state.dates.start, i18n.language)}</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.dates.expiry')}</span><span className="v">{formatDate(state.dates.expiry, i18n.language)}</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.dates.billing_cycle')}</span><span className="v">{t(`admin.billing_cycle.${state.dates.billingCycle}`)}{!activate ? ` · ${t('admin.wizard.review.trial_mode')}` : ''}</span></div>
              </div>
            </ReviewSection>
            <ReviewSection title={t('admin.wizard.review.overrides')}>
              {Object.keys(state.overrides).length === 0 ? (
                <span className="muted text-sm">{t('admin.wizard.overrides.none')}</span>
              ) : (
                <div className="kv-list">
                  {Object.entries(state.overrides).map(([k, o]) => (
                    <div className="kv-row" key={k}>
                      <span className="k">{k.replace(/_/g, ' ')}</span>
                      <span className="v">{o.enabled ? t('status.enabled') : t('status.disabled')}{o.limitValue !== '' ? ` · ${o.limitValue}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </ReviewSection>
            <ReviewSection title={t('admin.wizard.review.owner')}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">{t('admin.wizard.review.owner')}</span><span className="v">{state.owner.firstName} {state.owner.lastName} ({t('admin.wizard.owner.role_value')})</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.owner.email')}</span><span className="v">{state.owner.email}</span></div>
              </div>
            </ReviewSection>
            <ReviewSection title={t('admin.wizard.review.activate')}>
              <label className="checkbox-row">
                <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                {t('admin.wizard.review.activate_yes')}
              </label>
              <p className="muted text-sm mt-2" style={{ margin: '6px 0 0' }}>{activate ? t('admin.wizard.review.activate_active') : t('admin.wizard.review.activate_trial')}</p>
            </ReviewSection>
            {state.price.notes && (
              <ReviewSection title={t('admin.wizard.price.notes')}>
                <span className="muted text-sm">{state.price.notes}</span>
              </ReviewSection>
            )}
            <ReviewSection title={t('admin.wizard.review.company')}>
              <div className="kv-list">
                <div className="kv-row"><span className="k">{t('admin.wizard.company.name')}</span><span className="v">{state.company.name}</span></div>
                <div className="kv-row"><span className="k">{t('admin.wizard.company.base_currency')}</span><span className="v">{state.company.baseCurrency}</span></div>
              </div>
            </ReviewSection>
            {error && <Alert tone="error">{error}</Alert>}
            <Button variant="primary" size="lg" loading={mutation.isPending} onClick={() => mutation.mutate()} style={{ width: '100%', marginTop: 8 }}>
              {t('admin.wizard.review.create')}
            </Button>
          </>
        )}

        {STEPS[step] !== 'review' && (
          <div className="flex mt-4" style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <span className="flip-rtl" aria-hidden="true">←</span> {t('actions.back')}
            </Button>
            <Button variant="primary" onClick={next}>
              {t('actions.next')} <span className="flip-rtl" aria-hidden="true">→</span>
            </Button>
          </div>
        )}
      </Card>
      </div>
    </>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mb-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
      <div className="card-body">
        <div className="card-title mb-3">{title}</div>
        {children}
      </div>
    </div>
  );
}
