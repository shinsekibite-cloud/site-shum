'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MonitorSmartphone, Shield, Trash2, Clock, BadgeCheck } from 'lucide-react';
import { collectDeviceFingerprint, pingSecurity } from '@/lib/device-fingerprint';

type SecurityData = {
  events: Array<{
    id: string;
    ip: string | null;
    deviceLabel: string | null;
    kind: string;
    createdAt: string;
  }>;
  activeIps: Array<{ ip: string; lastSeen: string }>;
  devices: Array<{
    id?: string;
    label: string;
    last: string;
    firstSeenAt?: string;
    fp: string | null;
    trusted?: boolean;
    daysLeft?: number;
    current?: boolean;
  }>;
  trustDays?: number;
  currentTrusted?: boolean;
  deletion?: {
    requestedAt: string | null;
    effectiveAt: string | null;
  };
};

type Props = {
  compact?: boolean;
};

export default function SessionSecurityPanel({ compact = false }: Props) {
  const { update } = useSession();
  const [data, setData] = useState<SecurityData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fp, setFp] = useState('');
  const [trustPassword, setTrustPassword] = useState('');

  const load = async (fingerprint?: string) => {
    const q = fingerprint || fp;
    const res = await fetch(`/api/user/security${q ? `?fp=${encodeURIComponent(q)}` : ''}`);
    const d = await res.json();
    if (d.events) setData(d);
  };

  useEffect(() => {
    (async () => {
      const fingerprint = await collectDeviceFingerprint();
      setFp(fingerprint);
      await pingSecurity('PING');
      await load(fingerprint);
    })();
  }, []);

  const currentIsNew = useMemo(() => {
    if (!data) return false;
    if (typeof data.currentTrusted === 'boolean') return !data.currentTrusted;
    const cur = data.devices.find((d) => d.current);
    return cur ? !cur.trusted : true;
  }, [data]);

  const revoke = async () => {
    if (!confirm('Завершить все другие сеансы? Текущее устройство останется в системе.')) return;
    setBusy(true);
    setMsg('');
    try {
      const fingerprint = fp || (await collectDeviceFingerprint());
      const res = await fetch('/api/user/security/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Не удалось завершить сеансы');
        return;
      }
      if (d.tokenVersion != null && d.keepAlive) {
        await update({ keepAlive: d.keepAlive, tokenVersion: d.tokenVersion });
      } else if (d.tokenVersion != null) {
        await update({ tokenVersion: d.tokenVersion });
      }
      setMsg(d.message || 'Готово');
      await load(fingerprint);
    } catch {
      setMsg('Не удалось завершить сеансы');
    } finally {
      setBusy(false);
    }
  };

  const confirmDevice = async () => {
    setMsg('');
    if (!trustPassword.trim()) {
      setMsg('Введите пароль аккаунта');
      return;
    }
    setBusy(true);
    try {
      const fingerprint = fp || (await collectDeviceFingerprint());
      const res = await fetch('/api/user/security/trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, password: trustPassword }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Не удалось подтвердить устройство');
        return;
      }
      setTrustPassword('');
      setMsg(d.message || 'Устройство подтверждено');
      await pingSecurity('PING');
      await load(fingerprint);
    } catch {
      setMsg('Не удалось подтвердить устройство');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const trustDays = data.trustDays || 7;

  return (
    <div
      className={`settings-panel${compact ? ' settings-panel--compact' : ''}`}
      style={
        compact
          ? undefined
          : {
              marginTop: '1.25rem',
              padding: '1.1rem 1rem',
              borderRadius: 16,
              border: '1px solid rgba(15,23,42,0.08)',
              background: '#fff',
            }
      }
    >
      <div className="settings-panel__head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? undefined : '0.85rem' }}>
        <Shield size={compact ? 16 : 18} style={{ color: 'var(--primary)' }} />
        <h3 style={{ margin: 0, fontSize: compact ? undefined : '1.05rem', fontWeight: 750 }}>
          {compact ? 'Устройства' : 'Безопасность и устройства'}
        </h3>
      </div>

      <p
        className="settings-panel__lead"
        style={{ margin: '0 0 0.85rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.45 }}
      >
        {compact
          ? `Новое устройство доверяется через ${trustDays} дн. До этого нельзя менять контакты, пароль и завершать чужие сеансы.`
          : `Новое устройство становится доверенным через ${trustDays} дней. До этого нельзя менять email, телефон, пароль, завершать чужие сеансы и удалять аккаунт. Если это ваш телефон, а система пишет «новое» — подтвердите его паролем ниже.`}
      </p>

      {currentIsNew && (
        <div
          className="settings-panel__callout"
          style={{
            marginBottom: '0.85rem',
            padding: compact ? undefined : '0.85rem',
            borderRadius: 12,
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(217,119,6,0.28)',
          }}
        >
          <div style={{ fontWeight: 750, fontSize: compact ? '0.84rem' : '0.9rem', color: '#92400e', marginBottom: 6 }}>
            Это устройство пока не доверенное
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: compact ? '0.78rem' : '0.82rem', color: '#78350f', lineHeight: 1.4 }}>
            {compact
              ? `Введите пароль, чтобы подтвердить сейчас (без ожидания ${trustDays} дн.).`
              : 'Введите пароль аккаунта, чтобы сразу сделать его доверенным (без ожидания 7 дней).'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="password"
              value={trustPassword}
              onChange={(e) => setTrustPassword(e.target.value)}
              placeholder="Пароль аккаунта"
              autoComplete="current-password"
              className="modern-input"
              style={{ width: '100%' }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={confirmDevice}
              style={{
                width: '100%',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <BadgeCheck size={16} />
              {busy ? 'Проверяем…' : 'Это моё устройство'}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
          Активные IP
        </div>
        {data.activeIps.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>Пока нет данных</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.activeIps.slice(0, 8).map((x) => (
              <span
                key={x.ip}
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '0.3rem 0.55rem',
                  borderRadius: 8,
                  background: 'rgba(37,99,235,0.08)',
                  color: '#1e40af',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {x.ip}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
          Устройства
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.devices.slice(0, 8).map((d, i) => (
            <div
              key={`${d.label}-${i}-${d.fp || ''}`}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.88rem',
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                background: d.current ? 'rgba(37,99,235,0.06)' : '#f8fafc',
                border: d.current ? '1px solid rgba(37,99,235,0.2)' : '1px solid transparent',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <MonitorSmartphone size={15} style={{ flexShrink: 0, color: 'var(--muted)' }} />
                <span className="session-device-label">
                  {d.label}
                  {d.current ? ' · это устройство' : ''}
                </span>
              </span>
              {d.trusted ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#15803d',
                    background: 'rgba(34,197,94,0.12)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Доверенное
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#b45309',
                    background: 'rgba(245,158,11,0.12)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Clock size={12} /> {d.daysLeft ?? 7} дн.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
          Последние входы и выходы (до 10)
        </div>
        {data.events.filter((e) => e.kind === 'LOGIN' || e.kind === 'LOGOUT' || e.kind === 'REVOKE' || e.kind === 'PASSWORD').length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>Пока нет записей</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.events
              .filter((e) => e.kind === 'LOGIN' || e.kind === 'LOGOUT' || e.kind === 'REVOKE' || e.kind === 'PASSWORD')
              .slice(0, 10)
              .map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: '0.82rem',
                    padding: '0.5rem 0.6rem',
                    borderRadius: 10,
                    background: '#f8fafc',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ fontWeight: 700 }}>
                      {e.kind === 'REVOKE'
                        ? 'Завершение сеансов'
                        : e.kind === 'LOGOUT'
                          ? 'Выход'
                          : e.kind === 'PASSWORD'
                            ? 'Смена пароля'
                            : 'Вход'}
                    </strong>
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      · {e.deviceLabel || 'устройство'}
                      {e.ip ? ` · ${e.ip}` : ''}
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                    {new Date(e.createdAt).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Moscow',
                    })}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="btn btn-secondary"
        style={{
          width: '100%',
          padding: '0.65rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Trash2 size={15} />
        {busy ? 'Завершаем…' : 'Завершить другие сеансы'}
      </button>
      {msg && (
        <p
          style={{
            margin: '0.65rem 0 0',
            fontSize: '0.85rem',
            color: /не |ошиб/i.test(msg) ? '#b91c1c' : '#15803d',
            lineHeight: 1.4,
          }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
