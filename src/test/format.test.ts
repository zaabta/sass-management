import { describe, expect, it } from 'vitest';
import { diffDays, formatAmount, formatDate, formatDateTime, formatNumber, parseDate, todayIso, usageLabel } from '../lib/format';

describe('format utils — never throw on invalid input', () => {
  it('formatDate returns — for null/undefined/invalid dates (no RangeError)', () => {
    expect(formatDate(null, 'en')).toBe('—');
    expect(formatDate(undefined, 'en')).toBe('—');
    expect(formatDate('not-a-date', 'en')).toBe('—');
    expect(formatDate('2026-13-99', 'en')).toBe('—');
    expect(formatDate('2026-08-17', 'en')).toContain('Aug');
  });

  it('formatDateTime is safe too', () => {
    expect(formatDateTime('garbage', 'en')).toBe('—');
    expect(formatDateTime('2026-08-17T10:00:00Z', 'en')).toContain('2026');
  });

  it('formatAmount/formatNumber tolerate null and bad currency', () => {
    expect(formatAmount(null, 'USD', 'en')).toBe('—');
    expect(formatAmount(100, 'NOT_A_CURRENCY', 'en')).toBe('100 NOT_A_CURRENCY');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(42)).toBe('42');
  });

  it('parseDate/diffDays return null instead of NaN', () => {
    expect(parseDate('bad')).toBeNull();
    expect(diffDays('bad', '2026-08-17')).toBeNull();
    expect(diffDays('2026-08-17', null)).toBeNull();
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usageLabel never renders null', () => {
    expect(usageLabel(3, 10)).toBe('3 / 10');
    expect(usageLabel(30, null)).not.toContain('null');
  });
});
