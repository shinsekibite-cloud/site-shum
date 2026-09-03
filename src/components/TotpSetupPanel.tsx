'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

type Props = {
  compact?: boolean;
};

export default function TotpSetupPanel({ compact = false }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/user/2fa/setup');
    if (!res.ok) return;
    const data = await res.json();
    setEnabled(Boolean(data.totpEnabled));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/user/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setSecret(data.secret || '');
      setOtpauthUrl(data.otpauthUrl || '');
      setSetupOpen(true);
      setCode('');
      if (data.otpauthUrl) {
        const QR = await import('qrcode');
        const url = await QR.toDataURL(data.otpauthUrl, { margin: 1, width: 200 });
        setQrDataUrl(url);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Введите 6-значный код');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/user/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('2FA включена');
      setEnabled(true);
      setSetupOpen(false);
      setSecret('');
      setOtpauthUrl('');
      setQrDataUrl('');
      setCode('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!password.trim() || !/^\d{6}$/.test(code.trim())) {
      toast.error('Нужны пароль и код из приложения');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/user/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', password, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('2FA отключена');
      setEnabled(false);
      setPassword('');
      setCode('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`settings-panel${compact ? ' settings-panel--compact' : ''}`}
      style={
        compact
          ? undefined
          : {
              marginTop: '1rem',
              padding: '1.1rem 1rem',
              borderRadius: 16,
              border: '1px solid rgba(15,23,42,0.08)',
              background: '#fff',
            }
      }
    >
      <div className="settings-panel__head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? undefined : '0.65rem' }}>
        <ShieldCheck size={compact ? 16 : 18} style={{ color: 'var(--primary)' }} />
        <h3 style={{ margin: 0, fontSize: compact ? undefined : '1.05rem', fontWeight: 750 }}>
          {compact ? '2FA' : 'Двухфакторная аутентификация'}
        </h3>
      </div>
      <p
        className="settings-panel__lead"
        style={{ margin: '0 0 0.85rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.45 }}
      >
        {compact
          ? 'После пароля — код из Authenticator / Яндекс.Ключ. Храните резервные коды отдельно.'
          : 'При включении 2FA после пароля потребуется одноразовый код из приложения (Google Authenticator, Яндекс.Ключ и т.п.). Храните коды и фразу восстановления в безопасности.'}
      </p>

      {enabled ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#15803d' }}>2FA включена</div>
          <input
            type="password"
            className="modern-input"
            placeholder="Пароль аккаунта"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            className="modern-input"
            placeholder="Код из приложения"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void disable()}>
            Отключить 2FA
          </button>
        </div>
      ) : setupOpen ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR для 2FA"
              width={compact ? 160 : 200}
              height={compact ? 160 : 200}
              style={{ margin: '0 auto' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
              <QrCode size={16} /> QR недоступен — введите секрет вручную
            </div>
          )}
          <div style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
            <strong>Секрет:</strong> <code>{secret}</code>
          </div>
          {otpauthUrl ? (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{otpauthUrl}</div>
          ) : null}
          <input
            className="modern-input"
            placeholder="Код из приложения"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void enable()}>
              Подтвердить и включить
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setSetupOpen(false);
                setSecret('');
                setCode('');
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startSetup()}>
          Настроить 2FA
        </button>
      )}
    </div>
  );
}
