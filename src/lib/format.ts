import type { BillingCycle } from '../api/types';

/** ISO date (YYYY-MM-DD) → local Date at midnight. */
export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? null : d;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole-day difference: b - a in days. */
export function diffDays(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Force Latin digits (design spec: numbers are always Latin, even in ar). */
function latinOptions(locale: string): { numberingSystem?: 'latn' } {
  return locale.toLowerCase().startsWith('ar') ? { numberingSystem: 'latn' } : {};
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale, { ...latinOptions(locale), year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale, { ...latinOptions(locale), year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatAmount(amount: number | null | undefined, currency: string | null | undefined, locale: string, maxFraction = 2): string {
  if (amount == null || !currency) return '—';
  try {
    return new Intl.NumberFormat(locale, { ...latinOptions(locale), style: 'currency', currency, maximumFractionDigits: maxFraction, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatPrice(amount: number | null | undefined, currency: string | null | undefined, cycle: BillingCycle | string | null | undefined, locale: string): string {
  if (amount == null || !currency) return 'Custom';
  const base = formatAmount(amount, currency, locale);
  if (!cycle || cycle === 'CUSTOM') return base;
  return `${base} / ${cycle === 'ANNUAL' ? 'year' : 'month'}`;
}

export function formatNumber(n: number | null | undefined, locale = 'en'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(locale, latinOptions(locale)).format(n);
}

/** "2 / 10" or "30 / Unlimited" (never shows null). */
export function usageLabel(current: number, limit: number | null): string {
  return `${formatNumber(current)} / ${limit == null ? '∞' : formatNumber(limit)}`;
}

/** Format a billing cycle key for display. */
export function cycleLabel(cycle: BillingCycle | string | null): string {
  if (!cycle || cycle === 'CUSTOM') return 'Custom';
  return cycle === 'ANNUAL' ? 'Annual' : 'Monthly';
}

// ---------------------------------------------------------------------------
// Expiry display states (derived — never mutates backend state)
// ---------------------------------------------------------------------------

export type ExpiryState =
  | { kind: 'expires_today' }
  | { kind: 'expires_in'; days: number }
  | { kind: 'expired'; days: number }
  | { kind: 'ok' };

export function expiryState(expiresAt: string | null | undefined, _status?: string | null): ExpiryState {
  if (!expiresAt) return { kind: 'ok' };
  const days = diffDays(todayIso(), expiresAt);
  if (days == null) return { kind: 'ok' };
  if (days === 0) return { kind: 'expires_today' };
  if (days > 0 && days <= 30) return { kind: 'expires_in', days };
  if (days < 0) return { kind: 'expired', days: Math.abs(days) };
  return { kind: 'ok' };
}
