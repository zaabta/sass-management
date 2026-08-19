import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { customerApi } from '../../../api/services';
import { queryKeys } from '../../../lib/queryKeys';
import { isApiError } from '../../../api/client';
import { useTenant, useSessionData, hasWorkingSubscription, useLimit } from '../../../hooks/useSession';
import { getLockReason } from '../../../components/FeatureRoute';
import { Alert, Badge, Card, PageHeader } from '../../../components/ui';
import { usageLabel } from '../../../lib/format';

const LINEAGE_STEPS = [
  { key: 'file', titleKey: 'customer.uploads.lineage_file', subKey: 'customer.uploads.lineage_file_sub' },
  { key: 'trial', titleKey: 'customer.uploads.lineage_trial', subKey: 'customer.uploads.lineage_trial_sub' },
  { key: 'mapped', titleKey: 'customer.uploads.lineage_mapped', subKey: 'customer.uploads.lineage_mapped_sub' },
  { key: 'truth', titleKey: 'customer.uploads.lineage_truth', subKey: 'customer.uploads.lineage_truth_sub' },
];

export function UploadsPage() {
  const { t } = useTranslation();
  const session = useSessionData();
  const tenant = useTenant();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const maxUploads = useLimit('MAX_UPLOADS_PER_MONTH');

  const reason = getLockReason(session);
  if (reason.kind !== 'ok') {
    // restricted surface — show the lock panel
    return (
      <>
        <PageHeader eyebrow={t('customer.uploads.eyebrow')} title={t('customer.uploads.title')} subtitle={t('customer.uploads.subtitle')} />
        <div className="feature-locked">
          <div className="lock-icon">🔒</div>
          <h2>{t('subscription.expired.title')}</h2>
          <p>{t('subscription.expired.message')}</p>
        </div>
      </>
    );
  }
  if (!hasWorkingSubscription(session)) return null;

  const usage = tenant?.features?.MAX_UPLOADS_PER_MONTH?.limitValue ?? maxUploads;

  const onFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    setProcessed(false);
    try {
      await customerApi.upload(file);
      setMsg({ tone: 'success', text: t('customer.uploads.success') });
      setProcessed(true);
      qc.invalidateQueries({ queryKey: queryKeys.session });
    } catch (err) {
      if (isApiError(err) && err.code === 'FEATURE_LIMIT_REACHED') setMsg({ tone: 'error', text: t('customer.uploads.limit_reached') });
      else setMsg({ tone: 'error', text: t('errors.internal') });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const activeStep = busy ? 0 : processed ? 4 : -1;

  return (
    <>
      <PageHeader eyebrow={t('customer.uploads.eyebrow')} title={t('customer.uploads.title')} subtitle={t('customer.uploads.subtitle')} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
        <Card>
          <div className="card-header">
            <h3>{t('customer.uploads.title')}</h3>
            <span className="card-sub mono">
              {usageLabel(0, usage)} {usage != null ? `/ ${usage}` : ''}
            </span>
          </div>
          <div className="card-body">
            <label
              style={{
                border: '1.5px dashed var(--border-strong)',
                borderRadius: 'var(--radius)',
                padding: '38px 20px',
                display: 'block',
                textAlign: 'center',
                cursor: 'pointer',
                color: 'var(--muted-fg)',
                background: 'var(--card-strip)',
              }}
              htmlFor="upload-input"
            >
              📄 {t('customer.uploads.drop')}
              <input
                id="upload-input"
                ref={inputRef}
                type="file"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            {busy && (
              <div className="flex mt-3" style={{ justifyContent: 'center', color: 'var(--muted-fg)' }}>
                <span className="spinner" /> {t('customer.uploads.processing')}
              </div>
            )}
            {processed && (
              <div className="flex mt-3" style={{ justifyContent: 'center' }}>
                <Badge tone="blue" dot>
                  <span className="badge-pulse" style={{ display: 'contents' }}>PROCESSING</span>
                </Badge>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <div className="card-header">
            <h3>{t('customer.uploads.lineage_title')}</h3>
            <span className="card-sub">MOM · YOY</span>
          </div>
          <div className="card-body">
            <div className="login-flow" style={{ marginBottom: 16, maxWidth: 'none' }}>{t('customer.login.flow_label')}</div>
            <div className="lineage">
              {LINEAGE_STEPS.map((s, i) => (
                <div key={s.key} className={`lineage-step ${activeStep >= i ? 'active' : ''}`}>
                  <div className="ls-title">{t(s.titleKey)}</div>
                  <div className="ls-sub">{t(s.subKey)}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
