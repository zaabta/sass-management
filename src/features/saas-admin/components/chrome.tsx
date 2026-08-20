import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { saasAdminApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { Button } from '../../../components/ui';
import { cn } from '../../../lib/utils';

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function AdminAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={cn('sa-avatar', size)}>{initials(name || '?')}</span>;
}

export function AdminErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="sa-panel sa-error">
      <h4>{t('admin.states.error_title')}</h4>
      <p>{message || t('admin.states.error_body')}</p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sa-empty">
      {icon && <div className="sa-empty-icon">{icon}</div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function FilterSheet({
  open,
  onClose,
  title,
  children,
  onApply,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  onApply?: () => void;
  onReset?: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sa-sheet-overlay" onClick={onClose}>
      <aside className="sa-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sa-sheet-head">
          <h3>{title}</h3>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label={t('actions.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="sa-sheet-body">{children}</div>
        <div className="sa-sheet-foot">
          {onReset && (
            <Button variant="ghost" onClick={onReset}>
              {t('actions.reset')}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => {
              onApply?.();
              onClose();
            }}
          >
            {t('admin.filters.apply')}
          </Button>
        </div>
      </aside>
    </div>
  );
}

type CmdItem = { id: string; label: string; hint?: string; to: string; group: string; icon?: ReactNode };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchQ = useQuery({
    queryKey: queryKeys.saasAdmin.customers({ search: q, page: 1, pageSize: 6 }),
    queryFn: () => saasAdminApi.getCustomers({ search: q, page: 1, pageSize: 6 }),
    enabled: open && q.trim().length >= 2,
  });

  const navItems: CmdItem[] = useMemo(
    () => [
      { id: 'nav-overview', label: t('admin.nav.overview'), to: '/saas-admin/overview', group: t('admin.command.pages'), icon: <LayoutDashboard size={15} /> },
      { id: 'nav-customers', label: t('admin.nav.customers'), to: '/saas-admin/customers', group: t('admin.command.pages'), icon: <Users size={15} /> },
      { id: 'nav-companies', label: t('admin.nav.companies'), to: '/saas-admin/companies', group: t('admin.command.pages'), icon: <Building2 size={15} /> },
      { id: 'nav-subs', label: t('admin.nav.subscriptions'), to: '/saas-admin/subscriptions', group: t('admin.command.pages'), icon: <FileText size={15} /> },
      { id: 'nav-pay', label: t('admin.nav.payments'), to: '/saas-admin/payments', group: t('admin.command.pages'), icon: <CreditCard size={15} /> },
      { id: 'nav-audit', label: t('admin.nav.audit'), to: '/saas-admin/audit', group: t('admin.command.pages'), icon: <Activity size={15} /> },
    ],
    [t],
  );

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pages = query ? navItems.filter((i) => i.label.toLowerCase().includes(query)) : navItems;
    const customers: CmdItem[] = (searchQ.data?.items ?? []).map((c) => ({
      id: `c-${c.id}`,
      label: c.name,
      hint: c.planCode ?? c.code,
      to: `/saas-admin/customers/${c.id}`,
      group: t('admin.nav.customers'),
      icon: <Building2 size={15} />,
    }));
    return [...pages, ...customers];
  }, [q, navItems, searchQ.data, t]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(items.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter' && items[active]) {
        e.preventDefault();
        navigate(items[active].to);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, navigate, onClose]);

  if (!open) return null;

  const groups = items.reduce<Record<string, CmdItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  let cursor = -1;
  return (
    <div className="sa-cmd-overlay" onClick={onClose}>
      <div className="sa-cmd" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('admin.command.title')}>
        <div className="sa-cmd-wrap">
          <Search className="icon" size={16} />
          <input
            ref={inputRef}
            className="sa-cmd-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.command.placeholder')}
          />
        </div>
        <div className="sa-cmd-list">
          {searchQ.isLoading && q.trim().length >= 2 && <div className="muted text-sm" style={{ padding: 12 }}>{t('loading')}</div>}
          {items.length === 0 && <div className="muted text-sm" style={{ padding: 12 }}>{t('admin.command.empty')}</div>}
          {Object.entries(groups).map(([group, list]) => (
            <div key={group}>
              <div className="sa-cmd-group">{group}</div>
              {list.map((item) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn('sa-cmd-item', idx === active && 'active')}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      navigate(item.to);
                      onClose();
                    }}
                  >
                    {item.icon ?? <Sparkles size={15} />}
                    <span>{item.label}</span>
                    {item.hint && <span className="hint">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimeRangePills({
  value,
  onChange,
}: {
  value: '7d' | '30d' | '90d' | '12m';
  onChange: (v: '7d' | '30d' | '90d' | '12m') => void;
}) {
  const { t } = useTranslation();
  const opts: { id: '7d' | '30d' | '90d' | '12m'; label: string }[] = [
    { id: '7d', label: t('admin.range.d7') },
    { id: '30d', label: t('admin.range.d30') },
    { id: '90d', label: t('admin.range.d90') },
    { id: '12m', label: t('admin.range.m12') },
  ];
  return (
    <div className="sa-range" role="tablist">
      {opts.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
