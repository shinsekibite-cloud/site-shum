'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { collectDeviceFingerprint } from '@/lib/device-fingerprint';

type DeletionState = {
  deletionRequestedAt: string | null;
  deletionEffectiveAt: string | null;
  graceDays: number;
  archiveYears: number;
};

type Props = {
  compact?: boolean;
};

export default function AccountDeletionPanel({ compact = false }: Props) {
  const [state, setState] = useState<DeletionState | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    fetch('/api/user/account/delete')
      .then((r) => r.json())
      .then((d) => {
        setState({
          deletionRequestedAt: d.deletionRequestedAt || null,
          deletionEffectiveAt: d.deletionEffectiveAt || null,
          graceDays: d.graceDays || 30,
          archiveYears: d.archiveYears || 5,
        });
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const requestDelete = async () => {
    setBusy(true);
    setMsg('');
    try {
      const fingerprint = await collectDeviceFingerprint();
      const res = await fetch('/api/user/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', confirm, fingerprint }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Не удалось запросить удаление');
        return;
      }
      setConfirm('');
      setMsg('Заявка принята. Удаление можно отменить в течение месяца.');
      load();
    } catch {
      setMsg('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const cancelDelete = async () => {
    setBusy(true);
    setMsg('');
    try {
      const fingerprint = await collectDeviceFingerprint();
      const res = await fetch('/api/user/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', fingerprint }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Не удалось отменить');
        return;
      }
      setMsg('Удаление отменено');
      load();
    } catch {
      setMsg('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;

  const pending = Boolean(state.deletionRequestedAt);

  return (
    <div
      className={`settings-panel${compact ? ' settings-panel--compact' : ''}${pending ? ' settings-panel--danger' : ''}`}
      style={
        compact
          ? undefined
          : {
              marginTop: '1.25rem',
              padding: '1.1rem 1rem',
              borderRadius: 16,
              border: pending ? '1px solid rgba(220,38,38,0.35)' : '1px solid rgba(15,23,42,0.08)',
              background: pending ? 'rgba(254,226,226,0.45)' : '#fff',
            }
      }
    >
      <div className="settings-panel__head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? undefined : '0.65rem' }}>
        <AlertTriangle size={compact ? 16 : 18} style={{ color: pending ? '#dc2626' : 'var(--muted)' }} />
        <h3 style={{ margin: 0, fontSize: compact ? undefined : '1.05rem', fontWeight: 750 }}>Удаление аккаунта</h3>
      </div>
      <p
        className="settings-panel__lead"
        style={{ margin: '0 0 0.85rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}
      >
        {compact
          ? `${state.graceDays} дней на отмену. Затем аккаунт деактивируется; архив хранится ${state.archiveYears} лет.`
          : `После подтверждения у вас есть ${state.graceDays} дней, чтобы отменить удаление. Затем аккаунт деактивируется, а служебный архив данных сохранится на портале ${state.archiveYears} лет (без открытого доступа к контактам).`}
      </p>

      {pending ? (
        <>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#991b1b', fontWeight: 600, lineHeight: 1.45 }}>
            Удаление запланировано
            {state.deletionEffectiveAt
              ? ` на ${new Date(state.deletionEffectiveAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`
              : ''}
            . До этого срока можно отменить.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={cancelDelete}
            style={{ width: '100%', padding: '0.65rem', fontWeight: 700 }}
          >
            {busy ? 'Отменяем…' : 'Отменить удаление'}
          </button>
        </>
      ) : (
        <>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>
            Введите УДАЛИТЬ для подтверждения
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="УДАЛИТЬ"
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              border: '1px solid rgba(15,23,42,0.12)',
              marginBottom: '0.65rem',
              fontSize: '0.9rem',
            }}
          />
          <button
            type="button"
            disabled={busy || confirm.trim().toUpperCase() !== 'УДАЛИТЬ'}
            onClick={requestDelete}
            style={{
              width: '100%',
              padding: '0.65rem',
              fontWeight: 700,
              borderRadius: 10,
              border: 'none',
              background: confirm.trim().toUpperCase() === 'УДАЛИТЬ' ? '#dc2626' : '#fecaca',
              color: '#fff',
              cursor: confirm.trim().toUpperCase() === 'УДАЛИТЬ' ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Отправляем…' : 'Запросить удаление аккаунта'}
          </button>
        </>
      )}
      {msg && (
        <p style={{ margin: '0.65rem 0 0', fontSize: '0.85rem', color: msg.includes('Не') || msg.includes('Ошибка') ? '#b91c1c' : '#15803d' }}>
          {msg}
        </p>
      )}
    </div>
  );
}
