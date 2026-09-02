'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { collectDeviceFingerprint } from '@/lib/device-fingerprint';

type Status = {
  configured: boolean;
  createdAt: string | null;
  wordCount: number;
};

type Props = {
  compact?: boolean;
};

export default function RecoveryPhrasePanel({ compact = false }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);

  const load = async () => {
    const res = await fetch('/api/user/recovery-phrase');
    if (!res.ok) return;
    const d = await res.json();
    setStatus({
      configured: Boolean(d.configured),
      createdAt: d.createdAt || null,
      wordCount: d.wordCount || 24,
    });
  };

  useEffect(() => {
    void load();
  }, []);

  const generate = async () => {
    setMsg('');
    setWords(null);
    setAck(false);
    if (!password.trim()) {
      setMsg('Введите текущий пароль');
      return;
    }
    if (
      status?.configured &&
      !confirm(
        'Создать новую фразу? Старая перестанет работать. Запишите новую фразу сразу.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const fingerprint = await collectDeviceFingerprint();
      const res = await fetch('/api/user/recovery-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, fingerprint }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Не удалось создать фразу');
        return;
      }
      setWords(d.words as string[]);
      setPassword('');
      setMsg(d.message || 'Фраза создана');
      await load();
    } catch {
      setMsg('Ошибка соединения');
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!words?.length) return;
    try {
      await navigator.clipboard.writeText(words.join(' '));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg('Не удалось скопировать');
    }
  };

  if (!status) return null;

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
      <div className="settings-panel__head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? undefined : '0.75rem' }}>
        <KeyRound size={compact ? 16 : 18} style={{ color: 'var(--primary)' }} />
        <h3 style={{ margin: 0, fontSize: compact ? undefined : '1.05rem', fontWeight: 750 }}>
          {compact ? 'Фраза восстановления' : 'Фраза восстановления (24 слова)'}
        </h3>
      </div>

      <p
        className="settings-panel__lead"
        style={{ margin: '0 0 0.85rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.45 }}
      >
        {compact
          ? '24 русских слова. Нужна, если нет пароля и почты. Храните офлайн — сайт покажет фразу только один раз.'
          : 'Как в криптокошельке: 24 русских слова. Если забудете пароль и нет доступа к почте — восстановите вход по фразе на странице «Забыли пароль?». Храните только офлайн (бумага / менеджер паролей). Сайт хранит только хеш — текст фразы повторно не покажет.'}
      </p>

      <div
        style={{
          fontSize: '0.85rem',
          marginBottom: '0.85rem',
          padding: '0.55rem 0.7rem',
          borderRadius: 10,
          background: status.configured ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.12)',
          color: status.configured ? '#15803d' : '#b45309',
          fontWeight: 650,
        }}
      >
        {status.configured
          ? `Фраза настроена${status.createdAt ? ` · ${new Date(status.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}` : ''}`
          : 'Фраза ещё не создана — рекомендуем сделать это сейчас'}
      </div>

      {words && (
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.85rem',
            borderRadius: 12,
            background: 'rgba(254,243,199,0.65)',
            border: '1px solid rgba(217,119,6,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 750,
              color: '#92400e',
              marginBottom: 8,
              fontSize: '0.88rem',
            }}
          >
            <AlertTriangle size={16} />
            Запишите сейчас — больше не покажем
          </div>
          <ol
            style={{
              margin: 0,
              padding: '0 0 0 1.25rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.35rem 1rem',
              fontSize: '0.9rem',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {words.map((w, i) => (
              <li key={`${i}-${w}`} style={{ lineHeight: 1.4 }}>
                {w}
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={copyAll} style={{ gap: 6 }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Я сохранил(а) фразу в надёжном месте
            </label>
          </div>
          {ack && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => setWords(null)}
            >
              Скрыть фразу
            </button>
          )}
        </div>
      )}

      {!words && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Текущий пароль"
            autoComplete="current-password"
            className="modern-input"
            style={{ width: '100%' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={generate}
            style={{ width: '100%', fontWeight: 700 }}
          >
            {busy
              ? 'Создаём…'
              : status.configured
                ? 'Создать новую фразу'
                : 'Создать фразу из 24 слов'}
          </button>
        </div>
      )}

      {msg && (
        <p
          style={{
            margin: '0.65rem 0 0',
            fontSize: '0.85rem',
            color: msg.includes('Не') || msg.includes('Ошибка') ? '#b91c1c' : '#15803d',
            lineHeight: 1.4,
          }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
