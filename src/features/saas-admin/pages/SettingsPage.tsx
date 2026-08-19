import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminPageHeader } from '../../../components/admin';
import { Card, LanguageSwitcher } from '../../../components/ui';
import { ThemeSwitcher } from '../../../components/kibo/theme-switcher';
import { canAccessSection } from '../AdminLayout';
import { useSessionData } from '../../../hooks/useSession';
import { RoleBadge } from '../../../components/ui';

export function SettingsPage() {
  const { t } = useTranslation();
  const session = useSessionData();
  const role = session?.user.platformRole ?? null;
  const navigate = useNavigate();

  if (!canAccessSection(role, 'settings')) return <Navigate to="/saas-admin/overview" replace />;

  return (
    <>
      <AdminPageHeader title={t('admin.settings.title')} description={t('admin.settings.subtitle')} />
      <div className="sa-split">
        <Card>
          <div className="card-header">
            <h3>{t('admin.settings.platform')}</h3>
          </div>
          <div className="card-body">
            <p className="muted text-sm mb-3">{t('admin.settings.platform_hint')}</p>
            <div className="flex flex-wrap">
              <button type="button" className="btn" onClick={() => navigate('/saas-admin/features')}>{t('admin.nav.features')}</button>
              <button type="button" className="btn" onClick={() => navigate('/saas-admin/plans')}>{t('admin.nav.plans')}</button>
              <button type="button" className="btn" onClick={() => navigate('/saas-admin/platform-users')}>{t('admin.nav.platform_users')}</button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('admin.settings.admin')}</h3>
          </div>
          <div className="card-body">
            <div className="kv-list">
              <div className="kv-row">
                <span className="k">{t('admin.settings.signed_in')}</span>
                <span className="v">{session?.user.email}</span>
              </div>
              <div className="kv-row">
                <span className="k">{t('admin.settings.role')}</span>
                <span className="v">{role && <RoleBadge role={role} platform />}</span>
              </div>
              <div className="kv-row">
                <span className="k">{t('language')}</span>
                <span className="v"><LanguageSwitcher compact /></span>
              </div>
              <div className="kv-row">
                <span className="k">{t('admin.settings.theme')}</span>
                <span className="v"><ThemeSwitcher /></span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
