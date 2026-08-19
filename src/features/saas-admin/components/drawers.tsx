/**
 * Focused operation drawers (spec §54): Record Payment, Extend, Renew,
 * Change Price, Feature Override, Add User, Create Company, Create Subscription.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { isApiError, newIdempotencyKey } from '../../../api/client';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { formatAmount, formatDate, todayIso, addDaysIso } from '../../../lib/format';
import type { CustomerUser, FeatureDefinition, MembershipStatus, PaymentMethod, PaymentStatus, ResolvedFeatureRow, Subscription } from '../../../api/types';
import { Button, Drawer, Field, Input, Select, Textarea, useToast, Alert } from '../../../components/ui';
const CUSTOMER_ROLES = ['OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER', 'APPROVER'];

function useLocalizedError() {
  const { t } = useTranslation();
  return (err: unknown): string => {
    if (isApiError(err)) {
      const map: Record<string, string> = {
        VALIDATION_ERROR: t('errors.validation'),
        DUPLICATE_EMAIL: t('errors.duplicate_email'),
        FEATURE_LIMIT_REACHED: t('subscription.limit_reached'),
        FORBIDDEN: t('errors.forbidden'),
        NOT_FOUND: t('errors.not_found'),
        CONFLICT: t('errors.conflict'),
      };
      return map[err.code] ?? err.message ?? t('errors.internal');
    }
    return t('errors.internal');
  };
}

function DrawerShell({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Drawer open={open} onClose={onClose} title={title} footer={footer}>
      {children}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Renew subscription
// ---------------------------------------------------------------------------

export function RenewDrawer({ subscription, customerName, open, onClose }: { subscription: Subscription; customerName: string; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const [newExpiry, setNewExpiry] = useState('');
  const [planId, setPlanId] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(subscription.currency);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Idempotency key per drawer mount: double-submit replays, never double-applies.
  const idemKey = useMemo(() => newIdempotencyKey(), [open]);

  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });

  useEffect(() => {
    if (open) {
      setNewExpiry(subscription.expiresAt ? addDaysIso(subscription.expiresAt, 365) : addDaysIso(todayIso(), 365));
      setPlanId(subscription.planId);
      setPrice(subscription.agreedPrice != null ? String(subscription.agreedPrice) : '');
      setCurrency(subscription.currency);
      setNotes('');
      setError(null);
    }
  }, [open, subscription]);

  const mutation = useMutation({
    mutationFn: () =>
      saasAdminApi.renewSubscription(
        subscription.id,
        {
          expiryDate: newExpiry,
          notes: notes || undefined,
          expectedVersion: subscription.lockVersion,
        },
        idemKey,
      ),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.renew.success'));
      invalidateCustomer(qc, subscription.customerId);
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'RESOURCE_VERSION_CONFLICT') {
        toast.push('error', t('errors.version_conflict'));
        invalidateCustomer(qc, subscription.customerId);
        onClose();
        return;
      }
      setError(errMsg(e));
    },
  });

  const submit = () => {
    setError(null);
    if (!newExpiry) return setError(t('errors.required'));
    if (subscription.expiresAt && newExpiry <= subscription.expiresAt) return setError(t('errors.date_order'));
    mutation.mutate();
  };

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.renew.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>{t('admin.drawers.renew.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.customer')}</span><span className="v">{customerName}</span></div>
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.current_expiry')}</span><span className="v">{formatDate(subscription.expiresAt, i18n.language)}</span></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.renew.new_expiry')}>
        <Input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
      </Field>
      <Field label={t('admin.drawers.renew.plan')}>
        <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plansQ.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.renew.agreed_price')}>
          <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.renew.currency')}>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>
      <Field label={t('admin.drawers.renew.notes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Extend subscription
// ---------------------------------------------------------------------------

export function ExtendDrawer({ subscription, customerName, open, onClose }: { subscription: Subscription; customerName: string; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const [extendUntil, setExtendUntil] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idemKey = useMemo(() => newIdempotencyKey(), [open]);

  useEffect(() => {
    if (open) {
      setExtendUntil(subscription.expiresAt ? addDaysIso(subscription.expiresAt, 30) : addDaysIso(todayIso(), 30));
      setReason('');
      setError(null);
    }
  }, [open, subscription]);

  const mutation = useMutation({
    mutationFn: () =>
      saasAdminApi.extendSubscription(subscription.id, { expiryDate: extendUntil, notes: reason || undefined, expectedVersion: subscription.lockVersion }, idemKey),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.extend.success'));
      invalidateCustomer(qc, subscription.customerId);
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'RESOURCE_VERSION_CONFLICT') {
        toast.push('error', t('errors.version_conflict'));
        invalidateCustomer(qc, subscription.customerId);
        onClose();
        return;
      }
      setError(errMsg(e));
    },
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.extend.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!extendUntil) return setError(t('errors.required')); if (subscription.expiresAt && extendUntil <= subscription.expiresAt) return setError(t('errors.date_order')); mutation.mutate(); }}>{t('admin.drawers.extend.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.customer')}</span><span className="v">{customerName}</span></div>
        <div className="kv-row"><span className="k">{t('admin.drawers.extend.current_expiry')}</span><span className="v">{formatDate(subscription.expiresAt, i18n.language)}</span></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.extend.extend_until')}>
        <Input type="date" value={extendUntil} onChange={(e) => setExtendUntil(e.target.value)} />
      </Field>
      <Field label={t('admin.drawers.extend.reason')}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. One free month" />
      </Field>
      <div className="alert alert-info">{t('admin.drawers.extend.no_payment_required')}</div>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Change plan
// ---------------------------------------------------------------------------

export function ChangePlanDrawer({ subscription, customerName, open, onClose }: { subscription: Subscription; customerName: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const [planId, setPlanId] = useState(subscription.planId);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });

  useEffect(() => {
    if (open) {
      setPlanId(subscription.planId);
      setNotes('');
      setError(null);
    }
  }, [open, subscription]);

  const mutation = useMutation({
    mutationFn: () => saasAdminApi.changePlan(subscription.id, { planId, notes: notes || undefined }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.change_plan.success'));
      invalidateCustomer(qc, subscription.customerId);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.change_plan.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!planId) return setError(t('errors.required')); mutation.mutate(); }}>{t('admin.drawers.change_plan.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.customer')}</span><span className="v">{customerName}</span></div>
        <div className="kv-row"><span className="k">{t('admin.drawers.change_plan.current_plan')}</span><span className="v">{subscription.planName} ({subscription.planCode})</span></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.change_plan.new_plan')}>
        <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plansQ.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code}) — {formatAmount(p.monthlyPrice, p.currency, 'en')}/mo
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('admin.drawers.change_plan.notes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Change price
// ---------------------------------------------------------------------------

export function ChangePriceDrawer({ subscription, customerName, open, onClose }: { subscription: Subscription; customerName: string; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(subscription.currency);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrice(subscription.agreedPrice != null ? String(subscription.agreedPrice) : '');
      setCurrency(subscription.currency);
      setNotes('');
      setError(null);
    }
  }, [open, subscription]);

  const mutation = useMutation({
    mutationFn: () => saasAdminApi.changePrice(subscription.id, { agreedPrice: Number(price), currency, notes: notes || undefined }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.change_price.success'));
      invalidateCustomer(qc, subscription.customerId);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.change_price.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); const n = Number(price); if (price === '' || isNaN(n) || n < 0) return setError(t('errors.positive')); mutation.mutate(); }}>{t('admin.drawers.change_price.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.customer')}</span><span className="v">{customerName}</span></div>
        <div className="kv-row"><span className="k">{t('admin.drawers.change_price.current_price')}</span><span className="v">{formatAmount(subscription.agreedPrice, subscription.currency, i18n.language)}</span></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.change_price.new_price')}>
          <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.change_price.currency')}>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>
      <Field label={t('admin.drawers.renew.notes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Record payment (spec §23)
// ---------------------------------------------------------------------------

export function PaymentDrawer({ customerId, customerName, open, onClose, customerOptions }: { customerId: string; customerName: string; open: boolean; onClose: () => void; customerOptions?: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const subQ = useQuery({
    queryKey: queryKeys.saasAdmin.subscription(customerId || 'none'),
    queryFn: () => saasAdminApi.getSubscription(customerId),
    enabled: open && !!customerId,
  });

  const [selectedCustomer, setSelectedCustomer] = useState(customerId);
  const idemKey = useMemo(() => newIdempotencyKey(), [open, customerId]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [status, setStatus] = useState<PaymentStatus>('PAID');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedCustomer(customerId);
      setCurrency(subQ.data?.currency ?? 'USD');
      setAmount('');
      setPaymentDate(todayIso());
      setMethod('BANK_TRANSFER');
      setStatus('PAID');
      setReference('');
      setReceipt('');
      setPeriodFrom('');
      setPeriodTo('');
      setNotes('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  const mutation = useMutation({
    mutationFn: () =>
      saasAdminApi.recordPayment(
        {
          customerId: selectedCustomer || customerId,
          subscriptionId: subQ.data?.id ?? null,
          amount: Number(amount),
          currency,
          paymentDate,
          paymentMethod: method,
          status,
          referenceNumber: reference || null,
          receiptNumber: receipt || null,
          periodFrom: periodFrom || null,
          periodTo: periodTo || null,
          notes: notes || null,
        },
        idemKey,
      ),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.payment.success'));
      invalidateCustomer(qc, selectedCustomer || customerId);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.payment.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => {
            setError(null);
            const n = Number(amount);
            if (amount === '' || isNaN(n) || n <= 0) return setError(t('errors.min_amount'));
            if (!paymentDate) return setError(t('errors.required'));
            if (periodFrom && periodTo && periodTo < periodFrom) return setError(t('errors.date_order'));
            if (!customerId && !selectedCustomer) return setError(t('errors.required'));
            // Contract: subscriptionId is required and must belong to this customer.
            if (subQ.data && !subQ.data.id) return setError(t('errors.required'));
            mutation.mutate();
          }}>{t('admin.drawers.payment.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        {customerOptions ? (
          <div className="kv-row">
            <span className="k">{t('admin.drawers.payment.customer')}</span>
            <span className="v">
              <select className="select" style={{ width: 'auto' }} value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                <option value="">—</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </span>
          </div>
        ) : (
          <div className="kv-row"><span className="k">{t('admin.drawers.payment.customer')}</span><span className="v">{customerName}</span></div>
        )}
        {subQ.data && (
          <div className="kv-row"><span className="k">{t('admin.drawers.payment.subscription')}</span><span className="v">{subQ.data.planName} ({subQ.data.planCode})</span></div>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.payment.amount')}>
          <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.payment.currency')}>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.payment.payment_date')}>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.payment.method')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(['BANK_TRANSFER', 'CASH', 'MANUAL', 'OTHER'] as const).map((m) => (
              <option key={m} value={m}>{t(`admin.methods.${m}`)}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.payment.reference')}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.payment.receipt')}>
          <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
        </Field>
      </div>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.payment.period_from')}>
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.payment.period_to')}>
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
        </Field>
      </div>
      <Field label={t('admin.drawers.payment.status')}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}>
          {(['PENDING', 'PAID', 'VOID', 'REFUNDED'] as const).map((s) => (
            <option key={s} value={s}>{t(`admin.payment_status.${s}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('admin.drawers.payment.notes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="alert alert-info">{t('admin.drawers.payment.note')}</div>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Feature override (spec §25)
// ---------------------------------------------------------------------------

export function OverrideDrawer({ subscriptionId, customerId, feature, row, open, onClose }: { subscriptionId: string; customerId?: string; feature?: FeatureDefinition | null; row?: ResolvedFeatureRow | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const featuresQ = useQuery({ queryKey: queryKeys.saasAdmin.featuresRegistry, queryFn: () => saasAdminApi.getFeatures() });

  const target: FeatureDefinition | null | undefined = row ? { id: row.featureKey, key: row.featureKey, name: row.name, description: '', type: row.type, status: 'ACTIVE', sortOrder: 0 } : feature;
  const [featureKey, setFeatureKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [limitValue, setLimitValue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isQuota = target?.type === 'QUOTA';

  useEffect(() => {
    if (open) {
      setFeatureKey(target?.key ?? '');
      setEnabled(row ? row.effectiveEnabled : true);
      setLimitValue(row?.effectiveLimitValue != null ? String(row.effectiveLimitValue) : '');
      setNotes(row?.override?.notes ?? '');
      setError(null);
    }
  }, [open, target?.key, row]);

  const mutation = useMutation({
    mutationFn: () =>
      saasAdminApi.setFeatureOverride(subscriptionId, {
        featureKey,
        enabled,
        limitValue: isQuota && limitValue !== '' ? Number(limitValue) : null,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.override.success'));
      if (customerId) invalidateCustomer(qc, customerId);
      else qc.invalidateQueries({ queryKey: queryKeys.session });
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={row ? t('admin.drawers.override.edit') : t('admin.drawers.override.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!featureKey) return setError(t('errors.required')); mutation.mutate(); }}>{t('admin.drawers.override.submit')}</Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.override.feature')}>
        <Select value={featureKey} onChange={(e) => setFeatureKey(e.target.value)} disabled={!!target}>
          {featuresQ.data
            ?.filter((f) => f.status === 'ACTIVE' || f.key === target?.key)
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.name} ({f.key})
              </option>
            ))}
        </Select>
      </Field>
      {row && (
        <div className="kv-list mb-4">
          <div className="kv-row">
            <span className="k">{t('admin.drawers.override.plan_state')}</span>
            <span className="v">
              {row.type === 'QUOTA' ? (row.planLimitValue != null ? row.planLimitValue : t('unlimited')) : row.planEnabled ? t('status.enabled') : t('status.disabled')}
            </span>
          </div>
        </div>
      )}
      <Field label={t('admin.drawers.override.enabled')}>
        <Select value={enabled ? '1' : '0'} onChange={(e) => setEnabled(e.target.value === '1')}>
          <option value="1">{t('admin.drawers.override.enabled')}</option>
          <option value="0">{t('admin.drawers.override.disabled')}</option>
        </Select>
      </Field>
      {isQuota && (
        <Field label={t('admin.drawers.override.limit_value')} hint={t('unlimited')}>
          <Input type="number" min={0} value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder={t('unlimited')} />
        </Field>
      )}
      <Field label={t('admin.drawers.override.notes')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="alert alert-warning">{t('admin.drawers.override.override_wins')}</div>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Add / edit customer user (spec §19)
// ---------------------------------------------------------------------------

export function UserDrawer({ customerId, user, companies, open, onClose }: { customerId: string; user?: CustomerUser | null; companies: { id: string; name: string }[]; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('ACCOUNTANT');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [membership, setMembership] = useState<MembershipStatus>('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFirstName(user?.firstName ?? '');
      setLastName(user?.lastName ?? '');
      setEmail(user?.email ?? '');
      setPhone(user?.phone ?? '');
      setRole(user?.customerRole ?? 'ACCOUNTANT');
      setCompanyIds(user?.companyIds ?? []);
      setMembership(user?.membershipStatus ?? 'ACTIVE');
      setError(null);
    }
  }, [open, user]);

  const mutation = useMutation({
    mutationFn: () =>
      user
        ? saasAdminApi.updateUser(user.id, { status: membership, customerRoleName: role, companyId: companyIds[0] ?? undefined })
        : saasAdminApi.createCustomerUser(customerId, {
            customerId,
            email,
            firstName,
            lastName,
            phone: phone || null,
            customerRoleName: role,
            companyId: companyIds[0] ?? undefined,
            status: membership,
          }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.user.success'));
      invalidateCustomer(qc, customerId);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  const valid = () => {
    if (!firstName.trim()) return t('errors.required');
    if (!user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t('errors.invalid_email');
    return null;
  };

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={user ? t('admin.drawers.user.edit') : t('admin.drawers.user.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); const v = valid(); if (v) return setError(v); mutation.mutate(); }}>{t('admin.drawers.user.submit')}</Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.user.first_name')}>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.user.last_name')}>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field label={t('admin.drawers.user.email')}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} />
      </Field>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.user.phone')}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.user.role')}>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {CUSTOMER_ROLES.map((r) => (
              <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('admin.drawers.user.company_access')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {companies.map((c) => (
            <label key={c.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={companyIds.includes(c.id)}
                onChange={(e) => setCompanyIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
              />
              {c.name}
            </label>
          ))}
          {companies.length === 0 && <span className="muted text-sm">{t('empty.companies')}</span>}
        </div>
      </Field>
      <Field label={t('admin.drawers.user.membership')}>
        <Select value={membership} onChange={(e) => setMembership(e.target.value as MembershipStatus)}>
          {(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const).map((s) => (
            <option key={s} value={s}>{t(`admin.membership.${s}`)}</option>
          ))}
        </Select>
      </Field>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Create company
// ---------------------------------------------------------------------------

export function CompanyDrawer({ customerId, open, onClose }: { customerId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const customerQ = useQuery({ queryKey: queryKeys.saasAdmin.customer(customerId), queryFn: () => saasAdminApi.getCustomer(customerId), enabled: open });
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setLegalName('');
      setCurrency(customerQ.data?.defaultCurrency ?? 'USD');
      setError(null);
    }
  }, [open, customerQ.data?.defaultCurrency]);

  const mutation = useMutation({
    mutationFn: () => saasAdminApi.createCompany(customerId, { name, legalName: legalName || null, baseCurrency: currency }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.company.success'));
      invalidateCustomer(qc, customerId);
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'FEATURE_LIMIT_REACHED') setError(t('admin.drawers.company.limit_reached'));
      else setError(errMsg(e));
    },
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.company.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!name.trim()) return setError(t('errors.required')); mutation.mutate(); }}>{t('admin.drawers.company.submit')}</Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.company.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('admin.drawers.company.legal_name')}>
        <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
      </Field>
      <Field label={t('admin.drawers.company.base_currency')}>
        <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
      </Field>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Create subscription (customers without one)
// ---------------------------------------------------------------------------

export function CreateSubscriptionDrawer({ customerId, customerName, open, onClose }: { customerId: string; customerName: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const errMsg = useLocalizedError();
  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });
  const [planId, setPlanId] = useState('');
  const [start, setStart] = useState(todayIso());
  const [expiry, setExpiry] = useState(addDaysIso(todayIso(), 365));
  const [grace, setGrace] = useState('');
  const [cycle, setCycle] = useState('MONTHLY');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPlanId(plansQ.data?.[1]?.id ?? plansQ.data?.[0]?.id ?? '');
      setStart(todayIso());
      setExpiry(addDaysIso(todayIso(), 365));
      setGrace('');
      setCycle('MONTHLY');
      setCurrency(plansQ.data?.[0]?.currency ?? 'USD');
      setPrice(plansQ.data?.[1]?.monthlyPrice != null ? String(plansQ.data[1].monthlyPrice) : '');
      setError(null);
    }
  }, [open, plansQ.data]);

  const mutation = useMutation({
    mutationFn: () =>
      saasAdminApi.createSubscription(customerId, {
        planId,
        startsAt: start,
        expiresAt: expiry,
        gracePeriodUntil: grace || null,
        billingCycle: cycle,
        agreedPrice: price !== '' ? Number(price) : undefined,
        currency: currency || undefined,
      }),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.subscription_create.success'));
      invalidateCustomer(qc, customerId);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t('admin.drawers.subscription_create.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => { setError(null); if (!planId) return setError(t('errors.required')); if (!start || !expiry) return setError(t('errors.required')); if (expiry < start) return setError(t('errors.date_order')); mutation.mutate(); }}>{t('admin.drawers.subscription_create.submit')}</Button>
        </>
      }
    >
      <div className="kv-list mb-4">
        <div className="kv-row"><span className="k">{t('admin.drawers.renew.customer')}</span><span className="v">{customerName}</span></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('admin.drawers.subscription_create.plan')}>
        <Select value={planId} onChange={(e) => { setPlanId(e.target.value); const p = plansQ.data?.find((x) => x.id === e.target.value); if (p) { setCurrency(p.currency); setPrice(String(p.monthlyPrice)); } }}>
          {plansQ.data?.filter((p) => p.status === 'ACTIVE').map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </Select>
      </Field>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.subscription_create.start')}>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.subscription_create.expiry')}>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.subscription_create.grace')}>
          <Input type="date" value={grace} onChange={(e) => setGrace(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.subscription_create.billing_cycle')}>
          <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="MONTHLY">{t('admin.billing_cycle.MONTHLY')}</option>
            <option value="ANNUAL">{t('admin.billing_cycle.ANNUAL')}</option>
            <option value="CUSTOM">{t('admin.billing_cycle.CUSTOM')}</option>
          </Select>
        </Field>
      </div>
      <div className="form-row cols-2">
        <Field label={t('admin.drawers.subscription_create.price')}>
          <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t('admin.drawers.subscription_create.currency')}>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function useDrawerState() {
  const [state, setState] = useState<Record<string, boolean>>({});
  const open = (key: string) => setState((s) => ({ ...s, [key]: true }));
  const close = (key: string) => setState((s) => ({ ...s, [key]: false }));
  const isOpen = (key: string) => !!state[key];
  return useMemo(() => ({ open, close, isOpen }), [state]);
}
