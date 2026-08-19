import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate, formatDateTime } from '../../../lib/format';
import type { Customer, CustomerUser, Payment, ResolvedFeatureRow, Subscription, SubscriptionEvent, UsageReport, Company, AuditEvent } from '../../../api/types';
import {
  Alert, Badge, Button, Card, ConfirmDialog, CustomerStatusBadge, Drawer, EmptyState, ExpiryBadge, Field, Input, MembershipStatusBadge,
  PaymentStatusBadge, SubscriptionStatusBadge, TableSkeleton, Tabs, UsageBar, useToast, KV, CardSkeleton,
} from '../../../components/ui';
import { AdminPageHeader, StatusBadge } from '../../../components/admin';
import { AdminAvatar } from '../components/chrome';
import { ChangePlanDrawer, ChangePriceDrawer, CompanyDrawer, CreateSubscriptionDrawer, ExtendDrawer, OverrideDrawer, PaymentDrawer, RenewDrawer, UserDrawer } from '../components/drawers';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWriteCustomers = hasPerm(role, 'saas.customer.write');
  const canWriteSubs = hasPerm(role, 'saas.subscription.write');
  const canWriteUsers = hasPerm(role, 'saas.user.write');
  const canWritePayments = hasPerm(role, 'saas.payment.write');

  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState<{ kind: string; label?: string } | null>(null);
  const [drawer, setDrawer] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [overrideRow, setOverrideRow] = useState<ResolvedFeatureRow | null>(null);
  const [userEditing, setUserEditing] = useState<CustomerUser | null>(null);
  const [payAction, setPayAction] = useState<{ payment: Payment; kind: 'void' | 'refund' } | null>(null);
  const [companyAction, setCompanyAction] = useState<{ company: Company; kind: 'activate' | 'deactivate' } | null>(null);

  const open = (k: string) => setDrawer((d) => ({ ...d, [k]: true }));
  const close = (k: string) => setDrawer((d) => ({ ...d, [k]: false }));

  const customerQ = useQuery({ queryKey: queryKeys.saasAdmin.customer(id), queryFn: () => saasAdminApi.getCustomer(id) });
  const companiesQ = useQuery({ queryKey: queryKeys.saasAdmin.customerCompanies(id), queryFn: () => saasAdminApi.getCompanies(id), enabled: !!id });
  const usersQ = useQuery({ queryKey: queryKeys.saasAdmin.customerUsers(id), queryFn: () => saasAdminApi.getCustomerUsers(id), enabled: !!id });
  const subQ = useQuery({ queryKey: queryKeys.saasAdmin.subscription(id), queryFn: () => saasAdminApi.getSubscription(id), enabled: !!id });
  const historyQ = useQuery({ queryKey: queryKeys.saasAdmin.subscriptionHistory(id), queryFn: () => saasAdminApi.getSubscriptionHistory(id), enabled: !!id });
  const featuresQ = useQuery({ queryKey: queryKeys.saasAdmin.features(id), queryFn: () => saasAdminApi.getResolvedFeatures(id), enabled: !!id });
  const usageQ = useQuery({ queryKey: queryKeys.saasAdmin.usage(id), queryFn: () => saasAdminApi.getUsage(id), enabled: !!id });
  const paymentsQ = useQuery({ queryKey: queryKeys.saasAdmin.customerPayments(id), queryFn: () => saasAdminApi.getCustomerPayments(id), enabled: !!id });
  const auditQ = useQuery({ queryKey: queryKeys.saasAdmin.audit({ customerId: id }), queryFn: () => saasAdminApi.getAudit({ customerId: id, pageSize: 50 }), enabled: !!id });

  const c = customerQ.data;

  // edit form sync
  useEffect(() => {
    if (c) setEditForm({ name: c.name, legalName: c.legalName, email: c.email, phone: c.phone, country: c.country, timezone: c.timezone, defaultCurrency: c.defaultCurrency });
  }, [c?.id, c?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const editMutation = useMutation({
    mutationFn: () =>
      saasAdminApi.updateCustomer(id, {
        name: editForm.name,
        legalName: editForm.legalName,
        email: editForm.email,
        phone: editForm.phone,
        country: editForm.country,
        timezone: editForm.timezone,
        defaultCurrency: editForm.defaultCurrency,
        // Optimistic-concurrency: stale expectedVersion → 409 conflict (contract).
        expectedVersion: c?.lockVersion ?? 1,
      }),
    onSuccess: () => {
      toast.push('success', t('actions.save_changes') + ' ✓');
      invalidateCustomer(qc, id);
      setEditing(false);
      setEditError(null);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'RESOURCE_VERSION_CONFLICT') {
        toast.push('error', t('errors.version_conflict'));
        invalidateCustomer(qc, id);
        setEditing(false);
        setEditError(null);
        return;
      }
      setEditError(isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal'));
    },
  });

  const customerMutation = useMutation({
    mutationFn: ({ action }: { action: 'activate' | 'suspend' | 'reactivate' | 'cancel' }) => saasAdminApi.customerAction(id, action),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, id);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const subMutation = useMutation({
    mutationFn: ({ action }: { action: 'activate' | 'suspend' | 'reactivate' | 'cancel' }) => saasAdminApi.subscriptionAction(subQ.data!.id, action),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, id);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const userStatusMutation = useMutation({
    mutationFn: ({ user, action }: { user: CustomerUser; action: 'disable' | 'activate' | 'suspend' | 'reactivate' }) =>
      saasAdminApi.updateUser(user.id, {
        isActive: action === 'disable' ? false : true,
        status: action === 'suspend' ? 'SUSPENDED' : action === 'disable' ? 'DISABLED' : 'ACTIVE',
      }),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, id);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ row }: { row: ResolvedFeatureRow }) => saasAdminApi.removeFeatureOverride(id, row.featureKey),
    onSuccess: () => {
      toast.push('success', t('admin.drawers.override.success'));
      invalidateCustomer(qc, id);
      qc.invalidateQueries({ queryKey: queryKeys.session });
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ payment, kind }: { payment: Payment; kind: 'void' | 'refund' }) => (kind === 'void' ? saasAdminApi.voidPayment(payment.id) : saasAdminApi.refundPayment(payment.id)),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, id);
      setPayAction(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const companyMutation = useMutation({
    mutationFn: ({ company, kind }: { company: Company; kind: 'activate' | 'deactivate' }) => saasAdminApi.setCompanyStatus(company.id, kind === 'activate' ? 'ACTIVE' : 'INACTIVE'),
    onSuccess: () => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, id);
      setCompanyAction(null);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'FEATURE_LIMIT_REACHED') toast.push('error', t('admin.drawers.company.limit_reached'));
      else toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal'));
    },
  });

  if (customerQ.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('admin.customer_detail.title')} />
        <CardSkeleton count={3} />
      </>
    );
  }
  if (!c) {
    return (
      <>
        <AdminPageHeader title={t('admin.customer_detail.title')} />
        <Card><EmptyState icon="🏢">{t('errors.not_found')}</EmptyState></Card>
      </>
    );
  }

  const sub = subQ.data;

  const tabs = [
    { key: 'overview', label: t('admin.customer_detail.tabs.overview') },
    { key: 'companies', label: t('admin.customer_detail.tabs.companies') },
    { key: 'users', label: t('admin.customer_detail.tabs.users') },
    { key: 'subscription', label: t('admin.customer_detail.tabs.subscription') },
    { key: 'payments', label: t('admin.customer_detail.tabs.payments') },
    { key: 'features', label: t('admin.customer_detail.tabs.features') },
    { key: 'usage', label: t('admin.customer_detail.tabs.usage') },
    { key: 'audit', label: t('admin.customer_detail.tabs.audit') },
  ];

  if (!canAccessSection(role, 'customers')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <AdminPageHeader
        title={
          <span className="flex" style={{ gap: 12 }}>
            <AdminAvatar name={c.name} size="lg" />
            <span>{c.name}</span>
          </span>
        }
        breadcrumbs={[{ label: t('admin.customers.title'), to: '/saas-admin/customers' }, { label: c.code }]}
        meta={
          <span className="flex" style={{ gap: 10, flexWrap: 'wrap' }}>
            <StatusBadge status={c.status} dot>{t(`admin.customer_status.${c.status}`)}</StatusBadge>
            {c.planCode && <span className="admin-status-badge badge-navy">{c.planCode}</span>}
            {c.subscriptionStatus && <StatusBadge status={c.subscriptionStatus}>{t(`admin.subscription_status.${c.subscriptionStatus}`)}</StatusBadge>}
            <span>{c.email}</span>
          </span>
        }
        actions={
          <>
          {canWriteCustomers && (
            <>
              {c.status === 'ACTIVE' && <Button variant="default" onClick={() => setConfirm({ kind: 'suspend_customer' })}>{t('admin.customers.suspend')}</Button>}
              {c.status === 'SUSPENDED' && <Button variant="default" onClick={() => setConfirm({ kind: 'reactivate_customer' })}>{t('admin.customers.reactivate')}</Button>}
              {c.status !== 'CANCELLED' && <Button variant="danger-ghost" onClick={() => setConfirm({ kind: 'cancel_customer' })}>{t('admin.customers.cancel')}</Button>}
              <Button onClick={() => setEditing(true)}>{t('admin.customers.edit')}</Button>
            </>
          )}
          {!sub && canWriteSubs && <Button variant="primary" onClick={() => open('create-subscription')}>{t('admin.customer_detail.subscription.create_cta')}</Button>}
          </>
        }
      />

      <div className="stat-grid mb-4">
        <Card pad>
          <div className="stat-label">{t('admin.customer_detail.status')}</div>
          <div className="stat-value" style={{ fontSize: 16 }}><CustomerStatusBadge status={c.status} /></div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('admin.customer_detail.plan')}</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{c.planCode ?? '—'}</div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('admin.customer_detail.sub_status')}</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{c.subscriptionStatus ? <SubscriptionStatusBadge status={c.subscriptionStatus} /> : '—'}</div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('admin.customer_detail.expiry')}</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{formatDate(c.expiryDate, i18n.language)}</div>
          <div className="stat-foot"><ExpiryBadge expiresAt={c.expiryDate} status={c.subscriptionStatus} /></div>
        </Card>
        <Card pad>
          <div className="stat-label">{t('admin.customer_detail.price')}</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{formatAmount(c.agreedPrice, c.currency, i18n.language, 0)}</div>
          <div className="stat-foot">{t('admin.customer_detail.currency')}: {c.currency}</div>
        </Card>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          <Card>
            <div className="card-header"><h3>{t('admin.customer_detail.overview.info_title')}</h3></div>
            <div className="card-body">
              <KV
                items={[
                  { k: t('admin.customer_detail.code'), v: c.code },
                  { k: t('admin.customer_detail.overview.legal_name'), v: c.legalName ?? '—' },
                  { k: t('admin.customer_detail.overview.email'), v: c.email },
                  { k: t('admin.customer_detail.overview.phone'), v: c.phone ?? '—' },
                  { k: t('admin.customer_detail.overview.country'), v: c.country ?? '—' },
                  { k: t('admin.customer_detail.overview.timezone'), v: c.timezone ?? '—' },
                  { k: t('admin.customer_detail.overview.default_currency'), v: c.defaultCurrency },
                  { k: t('admin.customer_detail.overview.created'), v: formatDate(c.createdAt, i18n.language) },
                ]}
              />
            </div>
          </Card>
          <Card>
            <div className="card-header"><h3>{t('admin.customer_detail.overview.subscription_title')}</h3></div>
            <div className="card-body">
              {sub ? (
                <KV
                  items={[
                    { k: t('admin.customer_detail.plan'), v: `${sub.planName} (${sub.planCode})` },
                    { k: t('admin.customer_detail.sub_status'), v: <SubscriptionStatusBadge status={sub.status} /> },
                    { k: t('admin.customer_detail.subscription.billing_cycle'), v: t(`admin.billing_cycle.${sub.billingCycle}`) },
                    { k: t('admin.customer_detail.start'), v: formatDate(sub.startDate, i18n.language) },
                    { k: t('admin.customer_detail.expiry'), v: formatDate(sub.expiresAt, i18n.language) },
                    { k: t('admin.customer_detail.subscription.grace'), v: formatDate(sub.gracePeriodUntil, i18n.language) },
                    { k: t('admin.customer_detail.price'), v: formatAmount(sub.agreedPrice, sub.currency, i18n.language, 0) },
                    { k: t('admin.customer_detail.overview.last_payment'), v: formatDate(c.lastPaymentAt, i18n.language) },
                  ]}
                />
              ) : (
                <EmptyState icon="📄">{t('admin.customer_detail.subscription.no_subscription')}</EmptyState>
              )}
            </div>
          </Card>
          <Card>
            <div className="card-header"><h3>{t('admin.customer_detail.overview.usage_title')}</h3></div>
            <div className="card-body">
              <UsageReportView usage={usageQ.data} customer={c} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'companies' && (
        <Card>
          <div className="card-header">
            <h3>{t('admin.customer_detail.tabs.companies')}</h3>
            {canWriteCustomers && <Button size="sm" onClick={() => open('company')}>+ {t('admin.customer_detail.companies.create')}</Button>}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.companies.col_company')}</th>
                  <th>{t('admin.customer_detail.companies.col_status')}</th>
                  <th>{t('admin.customer_detail.companies.col_currency')}</th>
                  <th className="num">{t('admin.customer_detail.companies.col_branches')}</th>
                  <th className="num">{t('admin.customer_detail.companies.col_users')}</th>
                  <th>{t('admin.customer_detail.companies.col_created')}</th>
                  {canWriteCustomers && <th>{t('admin.customers.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {companiesQ.isLoading && <tr><td colSpan={7}><TableSkeleton rows={3} cols={1} /></td></tr>}
                {companiesQ.data?.map((co) => (
                  <tr key={co.id}>
                    <td className="strong">{co.name}<div className="muted text-xs">{co.legalName ?? ''}</div></td>
                    <td><Badge tone={co.status}>{t(`status.${co.status.toLowerCase()}`)}</Badge></td>
                    <td>{co.baseCurrency}</td>
                    <td className="num">{co.branches}</td>
                    <td className="num">{co.users}</td>
                    <td className="tnum muted">{formatDate(co.createdAt, i18n.language)}</td>
                    {canWriteCustomers && (
                      <td>
                        {co.status === 'ACTIVE' ? (
                          <Button size="sm" variant="ghost" onClick={() => setCompanyAction({ company: co, kind: 'deactivate' })}>{t('actions.deactivate')}</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setCompanyAction({ company: co, kind: 'activate' })}>{t('actions.activate')}</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {companiesQ.data?.length === 0 && <tr><td colSpan={7}><EmptyState icon="🏢">{t('empty.companies')}</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'users' && (
        <Card>
          <div className="card-header">
            <h3>{t('admin.customer_detail.tabs.users')}</h3>
            {canWriteUsers && <Button size="sm" onClick={() => { setUserEditing(null); open('user'); }}>+ {t('admin.customer_detail.users.add')}</Button>}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.users.col_name')}</th>
                  <th>{t('admin.customer_detail.users.col_email')}</th>
                  <th>{t('admin.customer_detail.users.col_role')}</th>
                  <th>{t('admin.customer_detail.users.col_membership')}</th>
                  <th>{t('admin.customer_detail.users.col_access')}</th>
                  <th>{t('admin.customer_detail.users.col_global')}</th>
                  <th>{t('admin.customer_detail.users.col_last_login')}</th>
                  {canWriteUsers && <th>{t('admin.customers.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {usersQ.isLoading && <tr><td colSpan={8}><TableSkeleton rows={3} cols={1} /></td></tr>}
                {usersQ.data?.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">{u.firstName} {u.lastName}</td>
                    <td>{u.email}</td>
                    <td><Badge tone={u.customerRole}>{t(`admin.roles.${u.customerRole}`)}</Badge></td>
                    <td><MembershipStatusBadge status={u.membershipStatus} /></td>
                    <td className="muted text-sm">
                      {companiesQ.data?.filter((co) => u.companyIds.includes(co.id)).map((co) => co.name).join(', ') || '—'}
                    </td>
                    <td>
                      <Badge tone={u.isActive ? 'ACTIVE' : 'DISABLED'}>{u.isActive ? t('admin.users.active') : t('admin.users.inactive')}</Badge>
                    </td>
                    <td className="tnum muted">{formatDateTime(u.lastLoginAt, i18n.language)}</td>
                    {canWriteUsers && (
                      <td>
                        <div className="flex" style={{ gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => { setUserEditing(u); open('user'); }}>{t('actions.edit')}</Button>
                          {u.isActive && u.membershipStatus !== 'DISABLED' && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'suspend_user', label: `${u.firstName} ${u.lastName}` })}>{t('actions.suspend')}</Button>
                          )}
                          {u.isActive && u.membershipStatus === 'SUSPENDED' && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'reactivate_user', label: `${u.firstName} ${u.lastName}` })}>{t('actions.reactivate')}</Button>
                          )}
                          {u.isActive && u.membershipStatus !== 'DISABLED' && (
                            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ kind: 'disable_user', label: `${u.firstName} ${u.lastName}` })}>{t('admin.customer_detail.users.disable')}</Button>
                          )}
                          {(!u.isActive || u.membershipStatus === 'DISABLED') && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'activate_user', label: `${u.firstName} ${u.lastName}` })}>{t('actions.activate')}</Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {usersQ.data?.length === 0 && <tr><td colSpan={8}><EmptyState icon="👥">{t('empty.users')}</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'subscription' && <SubscriptionTab sub={sub} history={historyQ.data} canWrite={canWriteSubs} onAction={(a) => setConfirm(a)} onOpenDrawer={open} />}

      {tab === 'payments' && (
        <Card>
          <div className="card-header">
            <h3>{t('admin.customer_detail.payments.title')}</h3>
            {canWritePayments && <Button size="sm" onClick={() => open('payment')}>+ {t('admin.customer_detail.payments.record')}</Button>}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.payments.col_date')}</th>
                  <th className="num">{t('admin.customer_detail.payments.col_amount')}</th>
                  <th>{t('admin.customer_detail.payments.col_currency')}</th>
                  <th>{t('admin.customer_detail.payments.col_method')}</th>
                  <th>{t('admin.customer_detail.payments.col_status')}</th>
                  <th>{t('admin.customer_detail.payments.col_reference')}</th>
                  <th>{t('admin.customer_detail.payments.col_period')}</th>
                  <th>{t('admin.customer_detail.payments.col_recorded_by')}</th>
                  {canWritePayments && <th>{t('admin.customers.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {paymentsQ.isLoading && <tr><td colSpan={9}><TableSkeleton rows={3} cols={1} /></td></tr>}
                {paymentsQ.data?.map((p) => (
                  <tr key={p.id}>
                    <td className="tnum">{formatDate(p.paymentDate, i18n.language)}</td>
                    <td className="num strong">{formatAmount(p.amount, p.currency, i18n.language)}</td>
                    <td>{p.currency}</td>
                    <td>{t(`admin.methods.${p.method}`)}</td>
                    <td><PaymentStatusBadge status={p.status} /></td>
                    <td className="muted text-sm">{p.referenceNumber ?? '—'}{p.receiptNumber ? ` · ${p.receiptNumber}` : ''}</td>
                    <td className="muted text-sm">{p.periodFrom ? <span className="ltr">{formatDate(p.periodFrom, i18n.language)} → {formatDate(p.periodTo, i18n.language)}</span> : '—'}</td>
                    <td className="muted text-sm">{p.recordedBy}</td>
                    {canWritePayments && (
                      <td>
                        <div className="flex" style={{ gap: 4 }}>
                          {(p.status === 'PAID' || p.status === 'PENDING') && <Button size="sm" variant="ghost" onClick={() => setPayAction({ payment: p, kind: 'void' })}>{t('admin.customer_detail.payments.void')}</Button>}
                          {p.status === 'PAID' && <Button size="sm" variant="ghost" onClick={() => setPayAction({ payment: p, kind: 'refund' })}>{t('admin.customer_detail.payments.refund')}</Button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {paymentsQ.data?.length === 0 && <tr><td colSpan={9}><EmptyState icon="💳">{t('empty.payments')}</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'features' && (
        <Card>
          <div className="card-header">
            <h3>{t('admin.customer_detail.features.title')}</h3>
            {canWriteCustomers && <Button size="sm" onClick={() => { setOverrideRow(null); open('override'); }}>+ {t('admin.customer_detail.features.add_override')}</Button>}
          </div>
          <div className="card-body" style={{ paddingBottom: 8 }}>
            <div className="alert alert-info">{t('admin.customer_detail.features.override_wins')}</div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.customer_detail.features.col_feature')}</th>
                  <th>{t('admin.customer_detail.features.col_plan')}</th>
                  <th>{t('admin.customer_detail.features.col_override')}</th>
                  <th>{t('admin.customer_detail.features.col_effective')}</th>
                  {canWriteCustomers && <th>{t('admin.customers.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {featuresQ.isLoading && <tr><td colSpan={5}><TableSkeleton rows={5} cols={1} /></td></tr>}
                {featuresQ.data?.map((row) => (
                  <tr key={row.featureKey}>
                    <td className="strong">{row.name}<div className="muted text-xs">{row.featureKey} · {row.type}</div></td>
                    <td>
                      {row.type === 'QUOTA' ? (
                        <span>{row.planLimitValue != null ? row.planLimitValue : t('unlimited')}</span>
                      ) : row.planEnabled ? (
                        <Badge tone="ENABLED">✓ {t('status.enabled')}</Badge>
                      ) : (
                        <Badge tone="DISABLED">— {t('status.disabled')}</Badge>
                      )}
                    </td>
                    <td>
                      {row.override ? (
                        <div>
                          <Badge tone={row.override.enabled ? 'ENABLED' : 'DISABLED'}>{row.override.enabled ? t('status.enabled') : t('status.disabled')}</Badge>
                          {row.override.limitValue != null && <span className="muted text-sm"> · {row.override.limitValue}</span>}
                          {row.override.notes && <div className="muted text-xs mt-2">{row.override.notes}</div>}
                        </div>
                      ) : (
                        <span className="muted">{t('admin.customer_detail.features.plan_default')}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={row.effectiveEnabled ? 'ENABLED' : 'DISABLED'} dot>
                        {row.effectiveEnabled ? t('status.enabled') : t('status.disabled')}
                        {row.type === 'QUOTA' && row.effectiveLimitValue != null ? ` · ${row.effectiveLimitValue}` : ''}
                      </Badge>
                    </td>
                    {canWriteCustomers && (
                      <td>
                        <div className="flex" style={{ gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => { setOverrideRow(row); open('override'); }}>{t('admin.customer_detail.features.edit_override')}</Button>
                          {row.override && (
                            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm({ kind: 'remove_override', label: row.name })}>{t('admin.customer_detail.features.remove_override')}</Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'usage' && (
        <Card>
          <div className="card-header">
            <h3>{t('admin.customer_detail.usage.title')}</h3>
            <span className="card-sub">{t('admin.customer_detail.usage.subtitle')}</span>
          </div>
          <div className="card-body">
            <UsageReportView usage={usageQ.data} customer={c} />
          </div>
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <div className="card-header"><h3>{t('admin.customer_detail.audit.title')}</h3></div>
          <AuditTable events={auditQ.data?.items} loading={auditQ.isLoading} />
        </Card>
      )}

      {/* edit customer drawer */}
      <Drawer open={editing} onClose={() => setEditing(false)} title={t('admin.customers.edit')} footer={
        <>
          <Button variant="ghost" onClick={() => setEditing(false)}>{t('actions.cancel')}</Button>
          <Button variant="primary" loading={editMutation.isPending} onClick={() => editMutation.mutate()}>{t('actions.save_changes')}</Button>
        </>
      }>
        {editError && <Alert tone="error">{editError}</Alert>}
        <Field label={t('admin.wizard.customer.name')}><Input value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label={t('admin.customer_detail.overview.legal_name')}><Input value={editForm.legalName ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, legalName: e.target.value }))} /></Field>
        <Field label={t('admin.customer_detail.overview.email')}><Input type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label={t('admin.customer_detail.overview.phone')}><Input value={editForm.phone ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <div className="form-row cols-2">
          <Field label={t('admin.customer_detail.overview.country')}><Input value={editForm.country ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))} /></Field>
          <Field label={t('admin.customer_detail.overview.timezone')}><Input value={editForm.timezone ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))} /></Field>
        </div>
        <Field label={t('admin.customer_detail.overview.default_currency')}><Input value={editForm.defaultCurrency ?? ''} maxLength={3} style={{ textTransform: 'uppercase' }} onChange={(e) => setEditForm((f) => ({ ...f, defaultCurrency: e.target.value }))} /></Field>
      </Drawer>

      {/* operation drawers */}
      {canWriteCustomers && <CompanyDrawer customerId={id} open={drawer['company'] ?? false} onClose={() => close('company')} />}
      {canWriteUsers && <UserDrawer customerId={id} user={userEditing} companies={companiesQ.data ?? []} open={drawer['user'] ?? false} onClose={() => close('user')} />}
      {canWriteSubs && sub && (
        <>
          <RenewDrawer subscription={sub} customerName={c.name} open={drawer['renew'] ?? false} onClose={() => close('renew')} />
          <ExtendDrawer subscription={sub} customerName={c.name} open={drawer['extend'] ?? false} onClose={() => close('extend')} />
          <ChangePlanDrawer subscription={sub} customerName={c.name} open={drawer['change-plan'] ?? false} onClose={() => close('change-plan')} />
          <ChangePriceDrawer subscription={sub} customerName={c.name} open={drawer['change-price'] ?? false} onClose={() => close('change-price')} />
        </>
      )}
      {canWriteSubs && !sub && <CreateSubscriptionDrawer customerId={id} customerName={c.name} open={drawer['create-subscription'] ?? false} onClose={() => close('create-subscription')} />}
      {canWritePayments && <PaymentDrawer customerId={id} customerName={c.name} open={drawer['payment'] ?? false} onClose={() => close('payment')} />}
      {canWriteCustomers && sub && <OverrideDrawer subscriptionId={sub.id} customerId={id} row={overrideRow} open={drawer['override'] ?? false} onClose={() => close('override')} />}

      {/* confirmations */}
      <ConfirmDialog open={confirm?.kind === 'suspend_customer'} message={t('confirm.suspend_customer', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => customerMutation.mutate({ action: 'suspend' })} loading={customerMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'reactivate_customer'} message={t('confirm.reactivate_customer', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => customerMutation.mutate({ action: 'reactivate' })} loading={customerMutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'cancel_customer'} message={t('confirm.cancel_customer', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => customerMutation.mutate({ action: 'cancel' })} loading={customerMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'suspend_sub'} message={t('confirm.suspend_subscription', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => subMutation.mutate({ action: 'suspend' })} loading={subMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'reactivate_sub'} message={t('confirm.reactivate_subscription', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => subMutation.mutate({ action: 'reactivate' })} loading={subMutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'cancel_sub'} message={t('confirm.cancel_subscription', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => subMutation.mutate({ action: 'cancel' })} loading={subMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'activate_sub'} message={t('confirm.activate_customer', { name: c.name })} onClose={() => setConfirm(null)} onConfirm={() => subMutation.mutate({ action: 'activate' })} loading={subMutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'disable_user'} message={t('confirm.disable_user', { name: confirm?.label ?? '' })} onClose={() => setConfirm(null)} onConfirm={() => { const u = usersQ.data?.find((x) => `${x.firstName} ${x.lastName}` === confirm?.label); if (u) userStatusMutation.mutate({ user: u, action: 'disable' }); }} loading={userStatusMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'activate_user'} message={t('confirm.activate_user', { name: confirm?.label ?? '' })} onClose={() => setConfirm(null)} onConfirm={() => { const u = usersQ.data?.find((x) => `${x.firstName} ${x.lastName}` === confirm?.label); if (u) userStatusMutation.mutate({ user: u, action: 'activate' }); }} loading={userStatusMutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'suspend_user'} message={t('confirm.suspend_user', { name: confirm?.label ?? '' })} onClose={() => setConfirm(null)} onConfirm={() => { const u = usersQ.data?.find((x) => `${x.firstName} ${x.lastName}` === confirm?.label); if (u) userStatusMutation.mutate({ user: u, action: 'suspend' }); }} loading={userStatusMutation.isPending} />
      <ConfirmDialog open={confirm?.kind === 'reactivate_user'} message={t('confirm.reactivate_user', { name: confirm?.label ?? '' })} onClose={() => setConfirm(null)} onConfirm={() => { const u = usersQ.data?.find((x) => `${x.firstName} ${x.lastName}` === confirm?.label); if (u) userStatusMutation.mutate({ user: u, action: 'reactivate' }); }} loading={userStatusMutation.isPending} danger={false} />
      <ConfirmDialog open={confirm?.kind === 'remove_override'} message={t('confirm.remove_override', { feature: confirm?.label ?? '' })} onClose={() => setConfirm(null)} onConfirm={() => { const row = featuresQ.data?.find((r) => r.name === confirm?.label); if (row) overrideMutation.mutate({ row }); }} loading={overrideMutation.isPending} />
      <ConfirmDialog open={!!payAction} message={t(payAction?.kind === 'void' ? 'confirm.void_payment' : 'confirm.refund_payment', { ref: payAction?.payment.referenceNumber ?? payAction?.payment.id, name: c.name })} onClose={() => setPayAction(null)} onConfirm={() => payAction && paymentMutation.mutate(payAction)} loading={paymentMutation.isPending} />
      <ConfirmDialog open={!!companyAction} message={t(companyAction?.kind === 'deactivate' ? 'confirm.deactivate_company' : 'confirm.activate_company', { name: companyAction?.company.name ?? '' })} onClose={() => setCompanyAction(null)} onConfirm={() => companyAction && companyMutation.mutate(companyAction)} loading={companyMutation.isPending} danger={companyAction?.kind === 'deactivate'} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Subscription tab
// ---------------------------------------------------------------------------

function SubscriptionTab({ sub, history, canWrite, onAction, onOpenDrawer }: { sub: Subscription | null | undefined; history: SubscriptionEvent[] | undefined; canWrite: boolean; onAction: (c: { kind: string }) => void; onOpenDrawer: (k: string) => void }) {
  const { t, i18n } = useTranslation();
  if (!sub) {
    return (
      <Card>
        <EmptyState icon="📄">
          {t('admin.customer_detail.subscription.no_subscription')}
          {canWrite && (
            <div className="mt-3">
              <Button variant="primary" onClick={() => onOpenDrawer('create-subscription')}>{t('admin.customer_detail.subscription.create_cta')}</Button>
            </div>
          )}
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
      <Card>
        <div className="card-header">
          <h3>{t('admin.customer_detail.subscription.title')}</h3>
          {canWrite && <SubscriptionStatusBadge status={sub.status} />}
        </div>
        <div className="card-body">
          <KV
            items={[
              { k: t('admin.customer_detail.subscription.plan'), v: `${sub.planName} (${sub.planCode})` },
              { k: t('admin.customer_detail.subscription.status'), v: <SubscriptionStatusBadge status={sub.status} /> },
              { k: t('admin.customer_detail.subscription.billing_cycle'), v: t(`admin.billing_cycle.${sub.billingCycle}`) },
              { k: t('admin.customer_detail.subscription.start'), v: formatDate(sub.startDate, i18n.language) },
              { k: t('admin.customer_detail.subscription.expiry'), v: formatDate(sub.expiresAt, i18n.language) },
              { k: t('admin.customer_detail.subscription.grace'), v: formatDate(sub.gracePeriodUntil, i18n.language) },
              { k: t('admin.customer_detail.subscription.price'), v: formatAmount(sub.agreedPrice, sub.currency, i18n.language, 0) },
              { k: t('admin.customer_detail.subscription.currency'), v: sub.currency },
            ]}
          />
          {canWrite && (
            <div className="flex flex-wrap mt-4">
              {(sub.status === 'SUSPENDED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLED') && <Button size="sm" onClick={() => onAction({ kind: 'activate_sub' })}>{t('admin.customers.activate')}</Button>}
              {sub.status !== 'CANCELLED' && <Button size="sm" onClick={() => onOpenDrawer('renew')}>{t('admin.customers.renew')}</Button>}
              {sub.status !== 'CANCELLED' && <Button size="sm" onClick={() => onOpenDrawer('extend')}>{t('admin.customers.extend')}</Button>}
              {(sub.status === 'ACTIVE' || sub.status === 'TRIAL' || sub.status === 'PAST_DUE') && <Button size="sm" onClick={() => onAction({ kind: 'suspend_sub' })}>{t('admin.customers.suspend')}</Button>}
              {sub.status === 'SUSPENDED' && <Button size="sm" onClick={() => onAction({ kind: 'reactivate_sub' })}>{t('admin.customers.reactivate')}</Button>}
              {sub.status !== 'CANCELLED' && <Button size="sm" onClick={() => onOpenDrawer('change-plan')}>{t('admin.customers.change_plan')}</Button>}
              {sub.status !== 'CANCELLED' && <Button size="sm" onClick={() => onOpenDrawer('change-price')}>{t('admin.customers.change_price')}</Button>}
              {sub.status !== 'CANCELLED' && <Button size="sm" variant="danger-ghost" onClick={() => onAction({ kind: 'cancel_sub' })}>{t('admin.customers.cancel_sub')}</Button>}
            </div>
          )}
        </div>
      </Card>
      <Card>
        <div className="card-header">
          <h3>{t('admin.customer_detail.subscription.history_title')}</h3>
          <span className="card-sub">{history?.length ?? 0}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('admin.customer_detail.subscription.col_event')}</th>
                <th>{t('admin.customer_detail.subscription.col_prev')}</th>
                <th>{t('admin.customer_detail.subscription.col_new')}</th>
                <th>{t('admin.customer_detail.subscription.col_by')}</th>
                <th>{t('admin.customer_detail.subscription.col_date')}</th>
                <th>{t('admin.customer_detail.subscription.col_notes')}</th>
              </tr>
            </thead>
            <tbody>
              {history?.map((ev) => (
                <tr key={ev.id}>
                  <td><Badge tone={ev.eventType}>{t(`admin.event_types.${ev.eventType}`, { defaultValue: ev.eventType })}</Badge></td>
                  <td className="muted text-sm">{ev.previousValue ?? '—'}</td>
                  <td className="text-sm strong">{ev.newValue ?? '—'}</td>
                  <td className="muted text-sm">{ev.performedBy}</td>
                  <td className="tnum muted text-sm">{formatDateTime(ev.date, i18n.language)}</td>
                  <td className="muted text-sm">{ev.notes ?? '—'}</td>
                </tr>
              ))}
              {history?.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon="🕘">{t('empty.history')}</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage report
// ---------------------------------------------------------------------------

export function UsageReportView({ usage, customer }: { usage: UsageReport | undefined; customer?: Customer | null }) {
  const { t } = useTranslation();
  const labelFor = (key: string) => {
    const map: Record<string, string> = {
      MAX_COMPANIES: t('admin.quotas.companies'),
      MAX_BRANCHES: t('admin.quotas.branches'),
      MAX_USERS: t('admin.quotas.users'),
      MAX_UPLOADS_PER_MONTH: t('admin.quotas.uploads'),
    };
    return map[key] ?? key;
  };
  if (!usage) return <CardSkeleton count={2} />;
  if (usage.items.length === 0) return <EmptyState icon="📏">{t('empty.subscriptions')}</EmptyState>;
  return (
    <div>
      {usage.items.map((u) => (
        <UsageBar key={u.key} label={labelFor(u.key)} current={u.current} limit={u.limit} quotaKey={u.key} />
      ))}
      {customer && (
        <div className="kv-list mt-4">
          <div className="kv-row">
            <span className="k">{t('admin.customer_detail.overview.last_payment')}</span>
            <span className="v">{customer.lastPaymentAt ? formatDate(customer.lastPaymentAt, 'en') : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit table (shared with Audit page)
// ---------------------------------------------------------------------------

export function AuditTable({ events, loading }: { events: AuditEvent[] | undefined; loading?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('admin.audit.col_timestamp')}</th>
            <th>{t('admin.audit.col_actor')}</th>
            <th>{t('admin.audit.col_role')}</th>
            <th>{t('admin.audit.col_customer')}</th>
            <th>{t('admin.audit.col_action')}</th>
            <th>{t('admin.audit.col_entity')}</th>
            <th>{t('admin.audit.col_meta')}</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7}><TableSkeleton rows={5} cols={1} /></td></tr>}
          {events?.map((a) => (
            <tr key={a.id}>
              <td className="tnum muted text-sm">{formatDateTime(a.timestamp, i18n.language)}</td>
              <td className="text-sm">{a.actor}</td>
              <td>{a.platformRole ? <Badge tone={a.platformRole}>{t(`admin.roles.${a.platformRole}`)}</Badge> : <span className="muted text-sm">{t('admin.audit.system')}</span>}</td>
              <td className="text-sm">{a.customerName ?? '—'}</td>
              <td className="text-sm strong">{t(`admin.audit_actions.${a.action}`, { defaultValue: a.action })}</td>
              <td className="text-sm">{a.entityLabel}{a.entityId !== a.entityLabel && <span className="muted text-xs"> · {a.entityId}</span>}</td>
              <td className="muted text-sm">{a.metadataSummary ?? '—'}</td>
            </tr>
          ))}
          {!loading && events?.length === 0 && <tr><td colSpan={7}><EmptyState icon="📋">{t('empty.audit')}</EmptyState></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
