import { useTranslation } from 'react-i18next';
import { Card, PageHeader } from '../../../components/ui';

export function SupportPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader eyebrow={t('customer.support.eyebrow')} title={t('customer.support.title')} subtitle={t('customer.support.subtitle')} />
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        <Card pad>
          <div className="stat-label">✉️ {t('customer.support.email_us')}</div>
          <div className="stat-value" style={{ fontSize: 15, marginTop: 8 }}>
            support@vcfo.com
          </div>
        </Card>
        <Card pad>
          <div className="stat-label">📞 {t('customer.support.call_us')}</div>
          <div className="stat-value" style={{ fontSize: 15, marginTop: 8 }}>
            +966 11 555 0100
          </div>
        </Card>
        <Card pad>
          <div className="stat-label">🕘 {t('customer.support.hours')}</div>
          <div className="stat-value" style={{ fontSize: 14, marginTop: 8, fontWeight: 550 }}>
            {t('customer.support.hours_value')}
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <div className="card-body">
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13.5 }}>{t('customer.support.contact')}</p>
        </div>
      </Card>
    </>
  );
}
