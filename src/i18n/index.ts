import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ar from './locales/ar';

// The product ships Arabic + English only.
export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

const stored = localStorage.getItem('vcfo.locale') as LocaleCode | null;
// Arabic-first like demo.vcfo-ai.com: default to ar when the browser is Arabic.
const browserAr = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar');
const initial = stored && SUPPORTED_LOCALES.some((l) => l.code === stored) ? stored : browserAr ? 'ar' : 'en';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLocale(code: LocaleCode) {
  void i18n.changeLanguage(code);
  localStorage.setItem('vcfo.locale', code);
  const dir = SUPPORTED_LOCALES.find((l) => l.code === code)?.dir ?? 'ltr';
  document.documentElement.lang = code;
  document.documentElement.dir = dir;
}

/**
 * Remote i18n catalog (contract: GET /api/v1/i18n/languages + /i18n/catalog?lang=).
 * Merges the backend catalog over the bundled dictionaries and applies the
 * catalog `direction` (RTL for ar). Failures fall back to bundled copy.
 */
export async function loadRemoteCatalog(lang = i18n.language): Promise<void> {
  try {
    const langsRes = await fetch('/api/v1/i18n/languages');
    if (!langsRes.ok) return;
    const langsEnvelope = await langsRes.json();
    const languages: { code: string; direction: 'ltr' | 'rtl' }[] = langsEnvelope?.data ?? langsEnvelope;
    if (!Array.isArray(languages)) return;

    const catRes = await fetch(`/api/v1/i18n/catalog?lang=${encodeURIComponent(lang)}`);
    if (!catRes.ok) return;
    const catEnvelope = await catRes.json();
    const catalog = (catEnvelope?.data ?? catEnvelope) as { language: string; direction: 'ltr' | 'rtl'; catalog: Record<string, unknown> } | null;
    if (!catalog?.catalog) return;

    i18n.addResourceBundle(catalog.language, 'translation', catalog.catalog, true, true);
    const dir = catalog.direction === 'rtl' ? 'rtl' : 'ltr';
    if (catalog.language === i18n.language) {
      document.documentElement.dir = dir;
      document.documentElement.lang = catalog.language;
    }
    await i18n.changeLanguage(catalog.language);
  } catch {
    // bundled dictionaries remain the fallback
  }
}

export default i18n;
