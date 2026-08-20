import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SlidersHorizontal } from 'lucide-react';
import { Button, Card, Field, SearchInput, Select } from '../../../components/ui';
import { ActionMenu, AdminPagination, type ActionMenuItem } from '../../../components/admin';
import { AdminEmptyState, AdminErrorState, FilterSheet } from './chrome';
import { cn } from '../../../lib/utils';

export type AdminCol<T> = {
  id: string;
  header: ReactNode;
  sortable?: boolean;
  sortKey?: string;
  className?: string;
  cell: (row: T) => ReactNode;
};

export type AdminFilterField = {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

export function AdminDataTable<T>({
  rows,
  columns,
  rowKey,
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  search,
  onSearch,
  searchPlaceholder,
  sortBy,
  sortDir,
  onSort,
  filters = [],
  onFilterChange,
  onReset,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  actions,
}: {
  rows: T[];
  columns: AdminCol<T>[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  filters?: AdminFilterField[];
  onFilterChange?: (key: string, value: string) => void;
  onReset?: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  actions?: (row: T) => ActionMenuItem[];
}) {
  const { t } = useTranslation();
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = filters.filter((f) => f.value && f.value !== 'ALL');
  const hasAny = activeFilters.length > 0 || !!(search && search.trim());
  const cols = actions ? columns.length + 1 : columns.length;

  const toggleSort = (key: string) => {
    if (!onSort) return;
    if (sortBy === key) onSort(key, sortDir === 'asc' ? 'desc' : 'asc');
    else onSort(key, 'asc');
  };

  const chipLabel = useMemo(() => {
    const map = new Map(filters.map((f) => [f.key, f]));
    return map;
  }, [filters]);

  if (error) {
    return (
      <Card>
        <AdminErrorState onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <Card>
      <div className="sa-toolbar">
        {onSearch && (
          <div className="grow">
            <SearchInput value={search ?? ''} onChange={onSearch} placeholder={searchPlaceholder ?? t('search_placeholder')} />
          </div>
        )}
        {filters.length > 0 && (
          <Button size="sm" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal size={14} /> {t('admin.customers.filters')}
            {activeFilters.length > 0 && <span className="filter-count">{activeFilters.length}</span>}
          </Button>
        )}
        {hasAny && onReset && (
          <Button size="sm" variant="ghost" onClick={onReset}>
            {t('admin.customers.clear_filters')}
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('admin.customers.filters')} onReset={onReset}>
          {filters.map((f) => (
            <Field key={f.key} label={f.label}>
              <Select value={f.value} onChange={(e) => onFilterChange?.(f.key, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </FilterSheet>
      )}

      {hasAny && (
        <div className="filter-chips">
          {activeFilters.map((f) => {
            const opt = chipLabel.get(f.key)?.options.find((o) => o.value === f.value);
            return (
              <button key={f.key} type="button" className="filter-chip" onClick={() => onFilterChange?.(f.key, 'ALL')}>
                {f.label}: <strong>{opt?.label ?? f.value}</strong> ✕
              </button>
            );
          })}
          {search && (
            <button type="button" className="filter-chip" onClick={() => onSearch?.('')}>
              {t('admin.customers.search')}: <strong>{search}</strong> ✕
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div aria-label="loading table">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex" style={{ padding: '11px 16px', gap: 12 }}>
              {Array.from({ length: Math.min(cols, 8) }).map((_, j) => (
                <div key={j} className="skeleton" style={{ flex: 1, height: 12 }} />
              ))}
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <AdminEmptyState title={emptyTitle ?? t('table.results', { count: 0 })} description={emptyDescription} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => {
                  const key = c.sortKey ?? c.id;
                  const sortable = !!c.sortable && !!onSort;
                  const active = sortBy === key;
                  return (
                    <th key={c.id} className={c.className}>
                      {sortable ? (
                        <button type="button" className="sa-sort-btn" onClick={() => toggleSort(key)}>
                          <span>{c.header}</span>
                          {active && sortDir === 'desc' ? (
                            <ArrowDownIcon size={13} />
                          ) : active && sortDir === 'asc' ? (
                            <ArrowUpIcon size={13} />
                          ) : (
                            <ChevronsUpDownIcon size={13} className="muted" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
                {actions && <th className={cn('num')}>{t('admin.customers.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td key={c.id} className={c.className}>
                      {c.cell(row)}
                    </td>
                  ))}
                  {actions && (
                    <td>
                      <div className="flex" style={{ justifyContent: 'flex-end' }}>
                        <ActionMenu items={actions(row)} label={t('admin.customers.row_actions')} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} pageSize={pageSize} total={total} onPage={onPage} onPageSize={onPageSize} />
    </Card>
  );
}
