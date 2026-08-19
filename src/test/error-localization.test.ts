import { describe, expect, it, beforeEach } from 'vitest';
import i18n from '../i18n';
import { localizeErrorCode } from '../lib/errors';

describe('error code localization (spec §6)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const cases: Array<[string, string, string]> = [
    ['FEATURE_NOT_INCLUDED', 'en', 'not included in your current subscription'],
    ['FEATURE_DISABLED', 'en', 'disabled'],
    ['FEATURE_LIMIT_REACHED', 'en', 'limit'],
    ['SUBSCRIPTION_EXPIRED', 'en', 'expired'],
    ['SUBSCRIPTION_SUSPENDED', 'en', 'suspended'],
  ];

  it.each(cases)('maps %s to a user-facing localized message (%s)', async (code, lang, fragment) => {
    await i18n.changeLanguage(lang);
    const msg = localizeErrorCode(code);
    expect(msg.toLowerCase()).toContain(fragment.toLowerCase());
    // never leaks the raw machine code
    expect(msg).not.toContain('FEATURE_');
    expect(msg).not.toContain('SUBSCRIPTION_');
  });

  it('localizes in ar (RTL)', async () => {
    for (const lang of ['ar']) {
      await i18n.changeLanguage(lang);
      expect(localizeErrorCode('FEATURE_NOT_INCLUDED').length).toBeGreaterThan(5);
      expect(localizeErrorCode('SUBSCRIPTION_EXPIRED').length).toBeGreaterThan(5);
    }
  });

  it('falls back gracefully for unknown codes', async () => {
    await i18n.changeLanguage('en');
    expect(localizeErrorCode(undefined)).toBeTruthy();
    expect(localizeErrorCode('WEIRD_CODE_XYZ')).toBeTruthy();
  });
});
