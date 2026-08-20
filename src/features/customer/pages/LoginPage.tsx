import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../../api/services';
import { setToken } from '../../../api/client';
import { isApiError } from '../../../api/client';
import { Button, Card, Field, Input, LanguageSwitcher } from '../../../components/ui';
import { ThemeSwitcher } from '../../../components/kibo/theme-switcher';

const FUNNEL = [
  { key: 'upload', titleKey: 'customer.login.step_upload', subKey: 'customer.login.step_upload_sub' },
  { key: 'map', titleKey: 'customer.login.step_map', subKey: 'customer.login.step_map_sub' },
  { key: 'truth', titleKey: 'customer.login.step_truth', subKey: 'customer.login.step_truth_sub' },
];

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const doLogin = async (mail: string, pass: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(mail.trim(), pass);
      setToken(res.accessToken, remember, res.refreshToken ?? null);
      qc.clear();
      // Only call session AFTER login resolved and the token is stored.
      const session = await authApi.session();
      qc.setQueryData(['session'], session);
      navigate(session.user.platformRole ? '/saas-admin/overview' : '/dashboard', { replace: true });
    } catch (err) {
      if (isApiError(err) && err.code === 'INVALID_CREDENTIALS') setError(t('errors.invalid_credentials'));
      else if (isApiError(err) && err.code === 'ACCOUNT_DISABLED') setError(t('errors.account_disabled'));
      else setError(t('customer.login.error'));
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin(email, password);
  };

  return (
    <div className="login-page split">
      {/* Hero — demo.vcfo-ai.com style */}
      <section className="login-hero">
        <div className="flex" style={{ gap: 12 }}>
          <div className="logo-mark">V</div>
          <div>
            <div className="brand-name">
              <span className="underline-mark">VCFO</span>
            </div>
            <div className="brand-sub">{t('customer.login.brand_sub')}</div>
          </div>
        </div>

        <div className="login-hero-body">
          <h1>
            {t('customer.login.hero_title')}
          </h1>
          <p className="login-hero-sub">{t('customer.login.hero_body')}</p>
        </div>

        <div className="login-funnel">
          <div className="eyebrow">{t('customer.login.funnel_title')}</div>
          <div className="lineage">
            {FUNNEL.map((s, i) => (
              <div key={s.key} className="lineage-step active">
                <div className="ls-title">{t(s.titleKey)}</div>
                <div className="ls-sub">{t(s.subKey)}</div>
                {i < FUNNEL.length - 1 && <span className="lineage-arrow">↓</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="login-flow">{t('customer.login.flow_label')}</div>

        <div className="flex flex-wrap login-trust">
          {[
            { key: 'trust_isolation', icon: '🔒' },
            { key: 'trust_audit', icon: '📋' },
            { key: 'trust_roles', icon: '👥' },
          ].map((c) => (
            <span key={c.key} className="trust-chip">
              {c.icon} {t(`customer.login.${c.key}`)}
            </span>
          ))}
        </div>
      </section>

      {/* Sign-in card */}
      <section className="login-form-col">
        <Card pad className="login-card">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>{t('customer.login.signin_eyebrow')}</div>
          <h2 style={{ textAlign: 'center', marginBottom: 18 }}>{t('customer.login.signin_title')}</h2>

          <form onSubmit={submit}>
            <Field label={t('customer.login.email')} htmlFor="login-email">
              <Input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="admin@vcfo.dev" />
            </Field>
            <Field label={t('customer.login.password')} htmlFor="login-password">
              <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="admin123" />
            </Field>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <label className="checkbox-row" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('customer.login.remember')}
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForgotOpen((o) => !o)} style={{ color: 'var(--primary)' }}>
                {t('customer.login.forgot')}
              </button>
            </div>
            {forgotOpen && (
              <div className="alert alert-info" style={{ fontSize: 12 }}>
                admin@vcfo.dev · admin123 — {t('customer.login.demo_body')}
              </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            <Button type="submit" variant="primary" loading={loading} style={{ width: '100%', padding: '11px 20px' }}>
              {t('customer.login.submit')} <span className="flip-rtl" aria-hidden="true">→</span>
            </Button>
          </form>

          <div className="login-hint">
            <div style={{ fontWeight: 700 }}>{t('customer.login.demo_title')}</div>
            <div>{t('customer.login.demo_body')}</div>
            <div className="mono" style={{ marginTop: 6, color: 'var(--ink)' }}>{t('customer.login.demo_creds')}</div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              style={{ color: 'var(--primary)', fontWeight: 700 }}
              onClick={() => void doLogin('admin@vcfo.dev', 'admin123')}
            >
              {t('customer.login.enter_demo')} <span className="flip-rtl" aria-hidden="true">←</span>
            </Button>
          </div>

          <div className="mt-4 flex" style={{ justifyContent: 'center' }}>
            <ThemeSwitcher />
            <LanguageSwitcher compact />
          </div>
        </Card>
      </section>
    </div>
  );
}
