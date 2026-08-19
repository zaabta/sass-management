/**
 * Shared SaaS Admin component system (enterprise operations console).
 * One consistent system across all admin pages: page headers, metric cards,
 * pagination, action menus, status badges, empty/skeleton states.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// AdminPageHeader — title (28px) + description + meta + breadcrumbs + actions
// ---------------------------------------------------------------------------

export function AdminPageHeader({
  title,
  description,
  meta,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-header-main">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="admin-breadcrumb">
                {b.to ? (
                  <Link to={b.to} className="admin-breadcrumb-link">{b.label}</Link>
                ) : (
                  <span className="admin-breadcrumb-current">{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <span className="admin-breadcrumb-sep flip-rtl">/</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p className="admin-page-desc">{description}</p>}
        {meta && <div className="admin-page-meta">{meta}</div>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminMetricCard — compact operational metric (Stripe-style)
// ---------------------------------------------------------------------------

export function AdminMetricCard({ label, value, delta, tone, foot }: { label: ReactNode; value: ReactNode; delta?: ReactNode; tone?: string; foot?: ReactNode }) {
  return (
    <div className="admin-metric">
      <div className="admin-metric-label">{label}</div>
      <div className="admin-metric-value">{value}</div>
      {delta && <div className={cn('admin-metric-delta', tone === 'down' && 'is-down', tone === 'up' && 'is-up')}>{delta}</div>}
      {foot && <div className="admin-metric-foot">{foot}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminPagination — "Showing 1–25 of 286" + rows-per-page + prev/next
// ---------------------------------------------------------------------------

export function AdminPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const shown = useMemo(() => {
    const set = new Set<number>([1, pages]);
    for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= pages) set.add(p);
    return [...set].sort((a, b) => a - b);
  }, [page, pages]);

  return (
    <div className="admin-pagination">
      <span className="admin-pagination-info">
        {t('admin.table.showing', { from, to, total })}
      </span>
      {onPageSize && (
        <span className="admin-pagination-rows">
          <span className="rows-label">{t('table.per_page')}</span>
          <select className="select" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label={t('table.per_page')}>
            {[10, 25, 50, 100].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </span>
      )}
      <span className="admin-pagination-nav">
        <button className="admin-page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous">
          <ChevronLeftIcon size={14} className="flip-rtl" />
        </button>
        {shown.map((p, i) => (
          <span key={p} style={{ display: 'inline-flex', gap: 2 }}>
            {i > 0 && shown[i - 1] !== p - 1 && <span className="admin-pagination-ellipsis">…</span>}
            <button className={cn('admin-page-btn', p === page && 'current')} onClick={() => onPage(p)}>
              {p}
            </button>
          </span>
        ))}
        <button className="admin-page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next">
          <ChevronRightIcon size={14} className="flip-rtl" />
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionMenu — "•••" overflow menu for low-frequency row actions
// ---------------------------------------------------------------------------

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: ReactNode;
}

export function ActionMenu({ items, label }: { items: ActionMenuItem[]; label?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="admin-action-menu-trigger" aria-label={label ?? 'Row actions'}>
          <span>•••</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="admin-action-menu">
          {items.map((it, i) => (
            <DropdownMenu.Item key={i} className={cn('admin-action-menu-item', it.danger && 'danger')} onSelect={() => it.onClick()}>
              {it.icon}
              {it.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — one consistent muted badge system
// ---------------------------------------------------------------------------

export type StatusTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info' | 'primary';

const TONE_CLASS: Record<StatusTone, string> = {
  positive: 'badge-green',
  warning: 'badge-amber',
  danger: 'badge-red',
  neutral: 'badge-gray',
  info: 'badge-blue',
  primary: 'badge-navy',
};

export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'ACTIVE':
    case 'PAID':
    case 'ENABLED':
      return 'positive';
    case 'TRIAL':
    case 'INVITED':
    case 'PENDING':
    case 'INFO':
      return 'info';
    case 'PAST_DUE':
    case 'SUSPENDED':
    case 'REFUNDED':
      return 'warning';
    case 'EXPIRED':
    case 'CANCELLED':
    case 'VOID':
    case 'DISABLED':
    case 'INACTIVE':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function StatusBadge({ status, tone, children, dot = false }: { status?: string; tone?: StatusTone; children: ReactNode; dot?: boolean }) {
  const t = tone ?? (status ? statusTone(status) : 'neutral');
  return (
    <span className={cn('admin-status-badge', TONE_CLASS[t])}>
      {dot && <span className="admin-status-dot" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyTableState — small icon + title + one sentence + optional CTA
// ---------------------------------------------------------------------------

export function EmptyTableState({ icon = '▫', title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="admin-empty">
      <div className="admin-empty-icon">{icon}</div>
      <div className="admin-empty-title">{title}</div>
      {children && <p className="admin-empty-body">{children}</p>}
      {action && <div className="admin-empty-action">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons — layout-preserving (toolbar + rows + pagination)
// ---------------------------------------------------------------------------

export function AdminTableSkeleton({ rows = 6, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div aria-label="Loading table">
      <div className="flex" style={{ padding: '12px 16px', gap: 10 }}>
        <div className="skeleton" style={{ height: 34, width: 220 }} />
        <div className="skeleton" style={{ height: 34, width: 120 }} />
        <div className="skeleton" style={{ height: 34, width: 120 }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex" style={{ padding: '11px 16px', gap: 12 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton" style={{ flex: 1, height: 12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminMetricSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="admin-metric-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-metric" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
          <div className="skeleton" style={{ height: 11, width: 90, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 22, width: 70 }} />
        </div>
      ))}
    </div>
  );
}
