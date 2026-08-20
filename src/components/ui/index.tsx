/**
 * UI primitives — VCFO design system (light mode, navy typography,
 * VCFO blue accents, compact professional tables).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { currentLocale, setLocale } from '../../i18n';
import type { CustomerStatus, MembershipStatus, PaymentStatus, PlatformRole, SubscriptionStatus } from '../../api/types';
import { useLimit } from '../../hooks/useSession';
import { diffDays, formatDate, todayIso } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Spinner as KiboSpinner } from '../kibo/spinner';
import { Badge as ShadcnBadge } from './shadcn/badge';

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return <KiboSpinner className={cn('size-4', light ? 'text-primary-foreground' : 'text-primary', className)} role="status" aria-label="loading" />;
}

// ---------------------------------------------------------------------------
// Eyebrow — mono uppercase teal label (signature)
// ---------------------------------------------------------------------------

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'default' | 'danger' | 'danger-ghost' | 'ghost';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'default', size = 'md', loading = false, className = '', children, disabled, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'default' ? `btn-${variant}` : '', size !== 'md' ? `btn-${size}` : '', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Spinner light={variant === 'primary' || variant === 'danger'} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badge — consistent status badge (never color-only; always has text)
// ---------------------------------------------------------------------------

const BADGE_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary' | 'default' | 'outline' | 'muted'> = {
  ACTIVE: 'success',
  TRIAL: 'info',
  PAST_DUE: 'warning',
  EXPIRED: 'destructive',
  SUSPENDED: 'warning',
  CANCELLED: 'muted',
  INACTIVE: 'muted',
  PENDING: 'warning',
  PAID: 'success',
  VOID: 'muted',
  REFUNDED: 'outline',
  INVITED: 'info',
  DISABLED: 'muted',
  ENABLED: 'success',
  SUPER_ADMIN: 'default',
  SAAS_ADMIN: 'info',
  BILLING_ADMIN: 'outline',
  SUPPORT: 'secondary',
  OWNER: 'default',
  FINANCE_MANAGER: 'info',
  ACCOUNTANT: 'secondary',
  VIEWER: 'muted',
  APPROVER: 'outline',
  BOOLEAN: 'info',
  QUOTA: 'outline',
};

/** Badge — Kibo-style pill (shadcn Badge + tone mapping). Themes with CSS vars. */
export function Badge({ tone, children, dot = false }: { tone: string; children: ReactNode; dot?: boolean }) {
  return (
    <ShadcnBadge variant={BADGE_TONE[tone] ?? 'secondary'} className="gap-1.5 font-normal">
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </ShadcnBadge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Badge tone={status}>{t(`status.${status.toLowerCase()}`, { defaultValue: status })}</Badge>;
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status}>{t(`admin.customer_status.${status}`)}</Badge>;
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status}>{t(`admin.subscription_status.${status}`)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status}>{t(`admin.payment_status.${status}`)}</Badge>;
}

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useTranslation();
  return <Badge tone={status}>{t(`admin.membership.${status}`)}</Badge>;
}

export function RoleBadge({ role, platform = false }: { role: string | PlatformRole; platform?: boolean }) {
  const { t } = useTranslation();
  const label = platform ? t(`admin.roles.${role}`, { defaultValue: role }) : t(`admin.roles.${role}`, { defaultValue: role });
  return <Badge tone={role}>{label}</Badge>;
}

/** Derived expiry display state (spec §51). Never throws on invalid dates. */
export function ExpiryBadge({ expiresAt, status: _status }: { expiresAt: string | null | undefined; status?: string | null }) {
  const { t, i18n } = useTranslation();
  const days = expiresAt ? diffDays(todayIso(), expiresAt) : null;
  if (days == null) return <span className="muted">—</span>;
  if (days === 0) return <Badge tone="EXPIRED">{t('badge.expires_today')}</Badge>;
  if (days > 0 && days <= 7) return <Badge tone="PAST_DUE">{t('badge.expires_in_days', { count: days })}</Badge>;
  if (days > 7 && days <= 30) return <Badge tone="TRIAL">{t('badge.expires_in_days', { count: days })}</Badge>;
  if (days < 0) return <Badge tone="EXPIRED">{t('badge.expired_days_ago', { count: Math.abs(days) })}</Badge>;
  return <span className="muted">{formatDate(expiresAt, i18n.language)}</span>;
}

// ---------------------------------------------------------------------------
// Card / StatCard / PageHeader
// ---------------------------------------------------------------------------

export function Card({ children, className = '', pad = false }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div>;
}

export function StatCard({ label, value, foot, tone, delta }: { label: ReactNode; value: ReactNode; foot?: ReactNode; tone?: string; delta?: 'up' | 'down' }) {
  return (
    <Card pad className="stat-card">
      <div className="stat-label">
        {tone && <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: tone, display: 'inline-block' }} />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className={`stat-foot ${delta ? `delta delta-${delta}` : ''}`}>{foot}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HealthGauge — teal semicircle gauge with category bars (signature)
// ---------------------------------------------------------------------------

const GAUGE_GRADIENT_ID = 'vcfo-gauge-grad';

export function HealthGauge({ score, label, categories }: { score: number; label: string; categories: { label: string; pct: number }[] }) {
  const R = 84;
  const C = Math.PI * R; // half circumference
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 116" className="gauge-svg" role="img" aria-label={`${label}: ${clamped}/100`}>
        <defs>
          <linearGradient id={GAUGE_GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1F8578" />
            <stop offset="100%" stopColor="#7FB3AB" />
          </linearGradient>
        </defs>
        <path d="M 16 104 A 84 84 0 0 1 184 104" fill="none" stroke="var(--card-strip)" strokeWidth="13" strokeLinecap="round" />
        <path
          d="M 16 104 A 84 84 0 0 1 184 104"
          fill="none"
          stroke={`url(#${GAUGE_GRADIENT_ID})`}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * C} ${C}`}
        />
      </svg>
      <div className="gauge-score">
        <div className="gauge-num">{clamped}<span className="gauge-den">/100</span></div>
        <div className="gauge-label">{label}</div>
      </div>
      <div className="gauge-cats">
        {categories.map((c) => (
          <div className="gauge-cat" key={c.label}>
            <div className="gauge-cat-head">
              <span>{c.label}</span>
              <span className="mono">{Math.round(c.pct)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill dark" style={{ width: `${Math.max(2, Math.min(100, c.pct))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table scaffolding
// ---------------------------------------------------------------------------

export function TableShell({ children }: { children: ReactNode }) {
  return <Card className="table-wrap">{children}</Card>;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div aria-label="loading table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex" style={{ padding: '10px 16px' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton skeleton-row" style={{ flex: 1, margin: 0 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState / Alert
// ---------------------------------------------------------------------------

export function EmptyState({ icon = '📭', children, action }: { icon?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode }) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, children, className = '' }: FieldProps) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className = '', ...rest } = props;
  return <input className={`input ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className = '', children, ...rest } = props;
  return (
    <select className={`select ${invalid ? 'invalid' : ''} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function SearchInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`input-icon-wrap ${className}`} style={{ flex: 1, minWidth: 200 }}>
      <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="9" r="6" />
        <path d="M13.5 13.5 17 17" strokeLinecap="round" />
      </svg>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (s: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const shown = useMemo(() => {
    const set = new Set<number>([1, pages]);
    for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= pages) set.add(p);
    return [...set].sort((a, b) => a - b);
  }, [page, pages]);
  return (
    <div className="pagination">
      <span className="page-info">
        {t('table.results', { count: total })} · {from}–{to} / {total}
      </span>
      {onPageSize && (
        <select className="select" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label={t('table.per_page')}>
          {[10, 25, 50].map((s) => (
            <option key={s} value={s}>
              {s} / {t('table.per_page')}
            </option>
          ))}
        </select>
      )}
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="previous">
        <span className="flip-rtl" aria-hidden="true">‹</span>
      </button>
      {shown.map((p, i) => (
        <span key={p} className="flex" style={{ gap: 6 }}>
          {i > 0 && shown[i - 1] !== p - 1 && <span className="muted">…</span>}
          <button className={`page-btn ${p === page ? 'current' : ''}`} onClick={() => onPage(p)}>
            {p}
          </button>
        </span>
      ))}
      <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="next">
        <span className="flip-rtl" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: ReactNode }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} role="tab" aria-selected={active === tab.key} className={`tab ${active === tab.key ? 'active' : ''}`} onClick={() => onChange(tab.key)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer / Modal
// ---------------------------------------------------------------------------

export function Drawer({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" style={width ? { width: `min(${width}px, 100vw)` } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, tone }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; tone?: 'danger' }) {
  if (!open) return null;
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 style={tone === 'danger' ? { color: 'var(--red)' } : undefined}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose, loading = false, danger = true }: { open: boolean; title?: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void; loading?: boolean; danger?: boolean }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('confirm.title')}
      tone={danger ? 'danger' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Usage bar (spec §9 / §26)
// ---------------------------------------------------------------------------

export function UsageBar({ label, current, limit, quotaKey }: { label: ReactNode; current: number; limit: number | null; quotaKey?: string }) {
  const { t } = useTranslation();
  const pct = limit && limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : current > 0 ? 100 : 0;
  const reached = limit != null && current >= limit;
  const toneClass = reached ? 'full' : pct >= 80 ? 'warn' : '';
  return (
    <div className="usage-line">
      <div className="usage-head">
        <span>{label}</span>
        <span className={reached ? 'badge badge-red' : 'muted tnum'}>
          {current} / {limit == null ? t('unlimited') : limit}
        </span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${toneClass}`} style={{ width: `${Math.max(limit == null && current > 0 ? 8 : pct, 2)}%` }} />
      </div>
      {reached && (
        <div className="text-xs" style={{ color: 'var(--red)', marginTop: 3 }}>
          {t('customer.quota.reached', { label })} {quotaKey ? `(${quotaKey})` : ''}
        </div>
      )}
    </div>
  );
}

/**
 * LimitHint — quota UX for workspace actions (contract):
 * when usage >= limit it shows the localized "reached" message with current/limit.
 */
export function LimitHint({ feature, usage }: { feature: string; usage: number }) {
  const { t } = useTranslation();
  const limit = useLimit(feature);
  if (limit == null || usage < limit) return null;
  return (
    <div className="alert alert-warning" role="status">
      {t('customer.limit_reached', { key: feature, usage, limit })}
    </div>
  );
}

/** Coming-soon state for features that are enabled in session but not built yet. */
export function ComingSoon({ feature }: { feature: string }) {
  const { t } = useTranslation();
  return (
    <div className="feature-locked">
      <div className="lock-icon">🚧</div>
      <h2>{t('coming_soon')}</h2>
      <p>{t('coming_soon_body')}</p>
      <p className="muted text-sm mono">feature.{feature}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

const ToastContext = createContext<{ push: (tone: ToastItem['tone'], message: string) => void }>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const push = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: 'fixed', bottom: 18, insetInlineEnd: 18, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`alert alert-${t.tone}`} style={{ margin: 0, boxShadow: 'var(--shadow-md)', background: 'var(--surface)' }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Language switcher
// ---------------------------------------------------------------------------

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const current = currentLocale(i18n.language);
  const next = current === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      className={compact ? 'sa-lang-btn' : 'sa-lang-btn sa-lang-btn-lg'}
      onClick={() => setLocale(next)}
      aria-label={t('language')}
      title={current === 'ar' ? 'English' : 'العربية'}
    >
      <Globe size={14} />
      <span>{current === 'ar' ? 'AR' : 'EN'}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// KV display
// ---------------------------------------------------------------------------

export function KV({ items }: { items: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <div className="kv">
      {items.map((it, i) => (
        <div className="kv-item" key={i}>
          <div className="k">{it.k}</div>
          <div className="v">{it.v}</div>
        </div>
      ))}
    </div>
  );
}
