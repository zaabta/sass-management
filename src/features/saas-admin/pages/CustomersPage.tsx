import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saasAdminApi } from '../../../api/services';
import { queryKeys, invalidateCustomer } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { formatAmount, formatDate } from '../../../lib/format';
import type { Customer, CustomerFilters, Subscription } from '../../../api/types';
import { Button, Card, ConfirmDialog, CustomerStatusBadge, EmptyState, ExpiryBadge, PageHeader, Pagination, SearchInput, Select, SubscriptionStatusBadge, TableSkeleton, useToast } from '../../../components/ui';
import { TableBody, TableCell, TableHead, TableHeader, TableHeaderGroup, TableProvider, TableRow } from '../../../components/kibo/table';
import type { ColumnDef } from '../../../components/kibo/table';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/shadcn/dropdown-menu';
import { RenewDrawer, ExtendDrawer, ChangePlanDrawer, ChangePriceDrawer, PaymentDrawer, CreateSubscriptionDrawer } from '../components/drawers';
import { canAccessSection, hasPerm } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { Navigate } from 'react-router-dom';

// Guide sort allowlist for GET /admin/customers
const SORTABLE = ['createdAt', 'updatedAt', 'name', 'code', 'status'];

type DrawerType = 'renew' | 'extend' | 'change-plan' | 'change-price' | 'record-payment' | 'create-subscription';

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'filter_expiry_all' },
  { value: 'EXPIRED', label: 'filter_expiry_expired' },
  { value: 'EXPIRING_7', label: 'filter_expiry_expiring7' },
  { value: 'EXPIRING_30', label: 'filter_expiry_expiring30' },
  { value: 'TRIAL', label: 'filter_expiry_trial' },
  { value: 'PAST_DUE', label: 'filter_expiry_pastdue' },
];

/** Server-side sortable header — Kibo dropdown look, refetches from the backend. */
function ServerSortHeader({ title, sortKey, sortBy, sortDir, onSort }: { title: string; sortKey: string; sortBy?: string; sortDir?: 'asc' | 'desc'; onSort: (k: string, d: 'asc' | 'desc') => void }) {
  const active = sortBy === sortKey;
  return (
    <div className="flex items-center space-x-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="-ml-3 h-8 data-[state=open]:bg-accent" size="sm" variant="ghost">
            <span>{title}</span>
            {active && sortDir === 'desc' ? (
              <ArrowDownIcon className="ml-2 h-4 w-4" />
            ) : active && sortDir === 'asc' ? (
              <ArrowUpIcon className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onSort(sortKey, 'asc')}>
            <ArrowUpIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSort(sortKey, 'desc')}>
            <ArrowDownIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Desc
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const canWrite = hasPerm(role, 'saas.customer.write');

  const [params] = useSearchParams();
  // Debounced server-side search: the input updates instantly, the query only
  // after a pause so the backend is not hammered per keystroke.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CustomerFilters>({
    status: 'ALL',
    subscriptionStatus: 'ALL',
    plan: 'ALL',
    expiry: (params.get('expiry') as CustomerFilters['expiry']) ?? 'ALL',
    sortBy: 'createdAt',
    sortDir: 'desc',
    page: 1,
    pageSize: 10,
  });
  const [action, setAction] = useState<{ customer: Customer; type: DrawerType } | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ kind: string; customer: Customer } | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const expiry = params.get('expiry');
    if (expiry) setFilters((f) => ({ ...f, expiry: expiry as CustomerFilters['expiry'] }));
  }, [params]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setFilters((f) => ({ ...f, page: 1 }));
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const plansQ = useQuery({ queryKey: queryKeys.saasAdmin.plans, queryFn: () => saasAdminApi.getPlans() });

  // Everything is server-side: filters, search (debounced), sorting,
  // pagination — the backend owns them all.
  const q = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ ...filters, search }),
    queryFn: () => saasAdminApi.getCustomers({ ...filters, search }),
    placeholderData: (prev) => prev,
  });

  const rows = q.data?.items ?? [];
  const total = q.data?.total ?? rows.length;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;

  // lazy-load subscription object for commercial drawers
  const needsSub = action && ['renew', 'extend', 'change-plan', 'change-price'].includes(action.type);
  const subQ = useQuery({
    queryKey: queryKeys.saasAdmin.subscription(action?.customer.id ?? 'none'),
    queryFn: () => saasAdminApi.getSubscription(action!.customer.id),
    enabled: !!needsSub,
  });

  useEffect(() => {
    if (needsSub && subQ.isSuccess && !sub) {
      if (subQ.data) {
        setSub(subQ.data);
        setOpenDrawers((d) => ({ ...d, [action!.type]: true }));
      } else {
        toast.push('error', t('admin.customer_detail.subscription.no_subscription'));
        setAction(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subQ.isSuccess, subQ.data, action]);

  const openDrawer = (customer: Customer, type: DrawerType) => {
    setAction({ customer, type });
    setSub(null);
    if (type === 'record-payment' || type === 'create-subscription') {
      setOpenDrawers((d) => ({ ...d, [type]: true }));
    }
  };
  const closeDrawer = (type: DrawerType) => {
    setOpenDrawers((d) => ({ ...d, [type]: false }));
    setAction(null);
    setSub(null);
  };

  const customerMutation = useMutation({
    mutationFn: ({ id, action: a }: { id: string; action: 'activate' | 'suspend' | 'reactivate' | 'cancel' }) => saasAdminApi.customerAction(id, a),
    onSuccess: (_d, vars) => {
      toast.push('success', t('admin.customers.actions') + ' ✓');
      invalidateCustomer(qc, vars.id);
      setConfirm(null);
    },
    onError: (e) => toast.push('error', isApiError(e) ? e.message ?? t('errors.internal') : t('errors.internal')),
  });

  const setFilter = (key: keyof CustomerFilters, value: string) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  /** Server-side sorting: updates sortBy/sortDir and refetches (page resets). */
  const onSort = (key: string, dir: 'asc' | 'desc') => {
    if (!SORTABLE.includes(key)) return;
    setFilters((f) => ({ ...f, sortBy: key, sortDir: dir, page: 1 }));
  };
  /** Active derived filters (status + search are visible in the toolbar already). */
  const activeDerived = (['subscriptionStatus', 'plan', 'expiry'] as const).filter((k) => (filters[k] ?? 'ALL') !== 'ALL');
  const hasAnyFilter = activeDerived.length > 0 || filters.status !== 'ALL' || !!search;

  const clearAll = () => {
    setSearchInput('');
    setSearch('');
    setFilters((f) => ({ ...f, status: 'ALL', subscriptionStatus: 'ALL', plan: 'ALL', expiry: 'ALL', page: 1 }));
  };

  const rowActions = (c: Customer) => {
    const items: { label: string; onClick: () => void; danger?: boolean }[] = [
      { label: t('admin.customers.view'), onClick: () => navigate(`/saas-admin/customers/${c.id}`) },
    ];
    if (canWrite) {
      items.push({ label: t('admin.customers.record_payment'), onClick: () => openDrawer(c, 'record-payment') });
      if (c.subscriptionStatus) {
        items.push(
          { label: t('admin.customers.renew'), onClick: () => openDrawer(c, 'renew') },
          { label: t('admin.customers.extend'), onClick: () => openDrawer(c, 'extend') },
          { label: t('admin.customers.change_plan'), onClick: () => openDrawer(c, 'change-plan') },
          { label: t('admin.customers.change_price'), onClick: () => openDrawer(c, 'change-price') },
        );
      } else {
        items.push({ label: t('admin.customers.create_subscription'), onClick: () => openDrawer(c, 'create-subscription') });
      }
      if (c.status === 'ACTIVE') items.push({ label: t('admin.customers.suspend'), onClick: () => setConfirm({ kind: 'suspend', customer: c }) });
      if (c.status === 'SUSPENDED') items.push({ label: t('admin.customers.reactivate'), onClick: () => setConfirm({ kind: 'reactivate', customer: c }) });
      if (c.status !== 'CANCELLED') items.push({ label: t('admin.customers.cancel'), onClick: () => setConfirm({ kind: 'cancel', customer: c }), danger: true });
    }
    return items;
  };

  if (!canAccessSection(role, 'customers')) return <Navigate to="/saas-admin/overview" replace />;

  const chipLabel = (k: 'subscriptionStatus' | 'plan' | 'expiry') =>
    k === 'subscriptionStatus' ? t('admin.customers.filter_sub_status') : k === 'plan' ? t('admin.customers.filter_plan') : t('admin.customers.filter_expiry');

  const EXPIRY_VALUE_KEYS: Record<string, string> = {
    ALL: 'filter_expiry_all',
    EXPIRED: 'filter_expiry_expired',
    EXPIRING_7: 'filter_expiry_expiring7',
    EXPIRING_30: 'filter_expiry_expiring30',
    TRIAL: 'filter_expiry_trial',
    PAST_DUE: 'filter_expiry_pastdue',
  };

  const chipValue = (k: 'subscriptionStatus' | 'plan' | 'expiry') => {
    if (k === 'subscriptionStatus') return t(`admin.subscription_status.${filters.subscriptionStatus}`);
    if (k === 'plan') return (filters.plan ?? 'ALL') === 'ALL' ? t('all') : (filters.plan ?? '');
    return t(`admin.customers.${EXPIRY_VALUE_KEYS[filters.expiry ?? 'ALL'] ?? 'filter_expiry_all'}`);
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  // Kibo Table columns (sortable via TableColumnHeader dropdown)
  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: 'name',
      header: () => <ServerSortHeader title={t('admin.customers.col_customer')} sortKey="name" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {initials(row.original.name)}
          </div>
          <div className="min-w-0">
            <Link to={`/saas-admin/customers/${row.original.id}`} className="block truncate font-medium text-foreground hover:underline">
              {row.original.name}
            </Link>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-mono">{row.original.code}</span>
              <ChevronRightIcon size={12} className="rtl:-scale-x-100" />
              <span className="truncate">{row.original.email}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: () => <ServerSortHeader title={t('admin.customers.col_status')} sortKey="status" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <CustomerStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'planCode',
      header: () => <ServerSortHeader title={t('admin.customers.col_plan')} sortKey="planCode" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => (row.original.planCode ? <span className="font-medium">{row.original.planCode}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      accessorKey: 'subscriptionStatus',
      header: () => <ServerSortHeader title={t('admin.customers.col_sub_status')} sortKey="subscriptionStatus" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => (row.original.subscriptionStatus ? <SubscriptionStatusBadge status={row.original.subscriptionStatus} /> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: 'companies',
      accessorFn: (r) => r.stats?.companies ?? 0,
      header: () => <ServerSortHeader title={t('admin.customers.col_companies')} sortKey="companies" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.getValue<number>('companies')}</span>,
    },
    {
      id: 'branches',
      accessorFn: (r) => r.stats?.branches ?? 0,
      header: () => <ServerSortHeader title={t('admin.customers.col_branches')} sortKey="branches" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.getValue<number>('branches')}</span>,
    },
    {
      id: 'users',
      accessorFn: (r) => r.stats?.users ?? 0,
      header: () => <ServerSortHeader title={t('admin.customers.col_users')} sortKey="users" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.getValue<number>('users')}</span>,
    },
    {
      id: 'expiryDate',
      accessorFn: (r) => r.expiryDate,
      header: () => <ServerSortHeader title={t('admin.customers.col_expiry')} sortKey="expiryDate" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) =>
        row.original.expiryDate ? (
          <>
            <div className="tabular-nums">{formatDate(row.original.expiryDate, i18n.language)}</div>
            <ExpiryBadge expiresAt={row.original.expiryDate} status={row.original.subscriptionStatus} />
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'agreedPrice',
      accessorFn: (r) => r.agreedPrice,
      header: () => <ServerSortHeader title={t('admin.customers.col_price')} sortKey="agreedPrice" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatAmount(row.original.agreedPrice, row.original.currency, i18n.language, 0)}</span>,
    },
    {
      id: 'lastPaymentAt',
      accessorFn: (r) => r.lastPaymentAt,
      header: () => <ServerSortHeader title={t('admin.customers.col_last_payment')} sortKey="lastPaymentAt" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.lastPaymentAt, i18n.language)}</span>,
    },
    {
      id: 'createdAt',
      accessorFn: (r) => r.createdAt,
      header: () => <ServerSortHeader title={t('admin.customers.col_created')} sortKey="createdAt" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={onSort} />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatDate(row.original.createdAt, i18n.language)}</span>,
    },
    ...(canWrite
      ? [
          {
            id: 'actions',
            header: () => <div className="text-right">{t('admin.customers.actions')}</div>,
            cell: ({ row }: { row: { original: Customer } }) => <div className="flex justify-end"><RowMenu items={rowActions(row.original)} /></div>,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t('admin.customers.title')}
        eyebrow={`${t('admin.eyebrow')} · ${t('admin.nav.customers')}`}
        subtitle={t('admin.customers.subtitle')}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => navigate('/saas-admin/customers/create')}>
              + {t('admin.customers.create')}
            </Button>
          ) : undefined
        }
      />
      <Card>
        {/* Horizontal filter bar — search + filters in one row on top */}
        <div className="filter-bar">
          <div className="filter-bar-search">
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder={t('admin.customers.search_ph')} />
          </div>
          <label className="filter-group">
            <span className="filter-group-label">{t('admin.customers.filter_status')}</span>
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label={t('admin.customers.filter_status')}>
              <option value="ALL">{t('all')}</option>
              <option value="ACTIVE">{t('admin.customer_status.ACTIVE')}</option>
              <option value="SUSPENDED">{t('admin.customer_status.SUSPENDED')}</option>
              <option value="CANCELLED">{t('admin.customer_status.CANCELLED')}</option>
            </Select>
          </label>
          <label className="filter-group">
            <span className="filter-group-label">{t('admin.customers.filter_sub_status')}</span>
            <Select value={filters.subscriptionStatus} onChange={(e) => setFilter('subscriptionStatus', e.target.value)} aria-label={t('admin.customers.filter_sub_status')}>
              <option value="ALL">{t('all')}</option>
              {(['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'] as const).map((s) => (
                <option key={s} value={s}>{t(`admin.subscription_status.${s}`)}</option>
              ))}
            </Select>
          </label>
          <label className="filter-group">
            <span className="filter-group-label">{t('admin.customers.filter_plan')}</span>
            <Select value={filters.plan} onChange={(e) => setFilter('plan', e.target.value)} aria-label={t('admin.customers.filter_plan')}>
              <option value="ALL">{t('all')}</option>
              {plansQ.data?.map((p) => (
                <option key={p.id} value={p.code}>{p.name}</option>
              ))}
            </Select>
          </label>
          <label className="filter-group">
            <span className="filter-group-label">{t('admin.customers.filter_expiry')}</span>
            <Select value={filters.expiry ?? 'ALL'} onChange={(e) => setFilter('expiry', e.target.value)} aria-label={t('admin.customers.filter_expiry')}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(`admin.customers.${o.label}`)}</option>
              ))}
            </Select>
          </label>
          {hasAnyFilter && (
            <Button size="sm" variant="ghost" onClick={clearAll}>
              ✕ {t('admin.customers.clear_filters')}
            </Button>
          )}
        </div>

        {/* Active filter chips + results count */}
        {(activeDerived.length > 0 || filters.status !== 'ALL' || search) && (
          <div className="filter-chips">
            {activeDerived.map((k) => (
              <button key={k} className="filter-chip" onClick={() => setFilter(k, 'ALL')}>
                {chipLabel(k)}: <strong>{chipValue(k)}</strong> ✕
              </button>
            ))}
            {filters.status !== 'ALL' && (
              <button className="filter-chip" onClick={() => setFilter('status', 'ALL')}>
                {t('admin.customers.filter_status')}: <strong>{t(`admin.customer_status.${filters.status}`)}</strong> ✕
              </button>
            )}
            {search && (
              <button className="filter-chip" onClick={clearAll}>
                {t('admin.customers.search')}: <strong>{search}</strong> ✕
              </button>
            )}
          </div>
        )}
        {!q.isLoading && (
          <div className="table-tools">
            <span className="result-count mono">
              {t('table.results', { count: total })}

            </span>
          </div>
        )}

        {/* Kibo Table */}
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon="🏢">{t('admin.customers.no_match')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <TableProvider columns={columns} data={rows}>
              <TableHeader>
                {({ headerGroup }) => (
                  <TableHeaderGroup headerGroup={headerGroup} key={headerGroup.id}>
                    {({ header }) => <TableHead header={header} key={header.id} />}
                  </TableHeaderGroup>
                )}
              </TableHeader>
              <TableBody>
                {({ row }) => (
                  <TableRow key={row.id} row={row}>
                    {({ cell }) => <TableCell cell={cell} key={cell.id} />}
                  </TableRow>
                )}
              </TableBody>
            </TableProvider>
          </div>
        )}

        {q.data && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
            onPageSize={(s) => setFilters((f) => ({ ...f, pageSize: s, page: 1 }))}
          />
        )}
      </Card>

      {action && action.type === 'record-payment' && (
        <PaymentDrawer customerId={action.customer.id} customerName={action.customer.name} open={openDrawers['record-payment'] ?? false} onClose={() => closeDrawer('record-payment')} />
      )}
      {action && action.type === 'create-subscription' && (
        <CreateSubscriptionDrawer customerId={action.customer.id} customerName={action.customer.name} open={openDrawers['create-subscription'] ?? false} onClose={() => closeDrawer('create-subscription')} />
      )}
      {action && sub && action.type === 'renew' && (
        <RenewDrawer subscription={sub} customerName={action.customer.name} open={openDrawers['renew'] ?? false} onClose={() => closeDrawer('renew')} />
      )}
      {action && sub && action.type === 'extend' && (
        <ExtendDrawer subscription={sub} customerName={action.customer.name} open={openDrawers['extend'] ?? false} onClose={() => closeDrawer('extend')} />
      )}
      {action && sub && action.type === 'change-plan' && (
        <ChangePlanDrawer subscription={sub} customerName={action.customer.name} open={openDrawers['change-plan'] ?? false} onClose={() => closeDrawer('change-plan')} />
      )}
      {action && sub && action.type === 'change-price' && (
        <ChangePriceDrawer subscription={sub} customerName={action.customer.name} open={openDrawers['change-price'] ?? false} onClose={() => closeDrawer('change-price')} />
      )}

      <ConfirmDialog
        open={confirm?.kind === 'suspend'}
        message={t('confirm.suspend_customer', { name: confirm?.customer.name })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && customerMutation.mutate({ id: confirm.customer.id, action: 'suspend' })}
        loading={customerMutation.isPending}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reactivate'}
        message={t('confirm.reactivate_customer', { name: confirm?.customer.name })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && customerMutation.mutate({ id: confirm.customer.id, action: 'reactivate' })}
        loading={customerMutation.isPending}
        danger={false}
      />
      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        message={t('confirm.cancel_customer', { name: confirm?.customer.name })}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && customerMutation.mutate({ id: confirm.customer.id, action: 'cancel' })}
        loading={customerMutation.isPending}
      />
    </>
  );
}

function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-haspopup="menu">
        ⋯
      </Button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="card" style={{ position: 'absolute', insetInlineEnd: 0, top: '100%', zIndex: 50, minWidth: 190, padding: 5 }}>
            {items.map((it) => (
              <button
                key={it.label}
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 6, border: 'none', color: it.danger ? 'var(--red)' : undefined }}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
