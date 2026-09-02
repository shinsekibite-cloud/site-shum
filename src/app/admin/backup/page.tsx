'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  DatabaseBackup,
  Copy,
  Check,
} from 'lucide-react';

type BackupRow = {
  id: string;
  label: string | null;
  note: string | null;
  archiveSha256: string;
  contentHash: string;
  signature: string;
  keyFingerprint: string;
  byteSize: number;
  schemaVersion: string;
  createdAt: string;
};

type Created = {
  backupId: string;
  filename: string;
  keyHex: string;
  keyFingerprint: string;
  archiveSha256: string;
  contentHash: string;
  signature: string;
  byteSize: number;
  issuedAt: string;
  downloadPath: string;
  hint?: string;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminBackupPage() {
  const [items, setItems] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/backup')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items);
      })
      .catch(() => setError('Не удалось загрузить список'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createBackup = async () => {
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось создать бэкап');
      setCreated(data as Created);
      setLabel('');
      setNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать бэкап');
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!created?.keyHex) return;
    try {
      await navigator.clipboard.writeText(created.keyHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          href="/admin/settings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            textDecoration: 'none',
            fontWeight: 650,
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Настройки
        </Link>
        <h1
          style={{
            margin: '0.65rem 0 0.35rem',
            fontSize: '1.45rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <DatabaseBackup size={22} /> Зашифрованный бэкап
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5, fontSize: '0.92rem' }}>
          Снимок настроек, страниц, каталога и счётчиков. Файл шифруется AES-256-GCM, содержимое
          подписывается HMAC портала. Ключ показывается один раз — сохраните его отдельно.
        </p>
      </div>

      <section
        style={{
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 14,
          background: '#fff',
          padding: '1rem 1.1rem',
          marginBottom: '1.25rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 750 }}>Создать бэкап</h2>
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem', fontWeight: 650 }}>
            Метка
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: перед обновлением"
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.12)',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem', fontWeight: 650 }}>
            Заметка
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Опционально"
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.12)',
                resize: 'vertical',
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={createBackup}
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Lock size={16} /> {busy ? 'Шифруем…' : 'Создать и подписать'}
          </button>
          {error ? (
            <p style={{ margin: 0, color: '#b91c1c', fontWeight: 650, fontSize: '0.9rem' }}>{error}</p>
          ) : null}
        </div>

        {created ? (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              background: 'rgba(13,148,136,0.08)',
              border: '1px solid rgba(13,148,136,0.25)',
            }}
          >
            <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={16} /> Бэкап готов — сохраните ключ
            </div>
            <p style={{ margin: '0 0 0.55rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {created.hint}
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <code
                style={{
                  flex: 1,
                  minWidth: 200,
                  fontSize: '0.72rem',
                  wordBreak: 'break-all',
                  background: '#fff',
                  padding: '0.5rem 0.65rem',
                  borderRadius: 8,
                  border: '1px solid rgba(15,23,42,0.1)',
                }}
              >
                {created.keyHex}
              </code>
              <button type="button" className="btn btn-ghost" onClick={copyKey}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Скопировано' : 'Ключ'}
              </button>
              <a className="btn btn-primary" href={created.downloadPath} download>
                <Download size={14} /> Скачать .ypenc
              </a>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
              <li>
                SHA-256 архива: <code>{created.archiveSha256.slice(0, 16)}…</code>
              </li>
              <li>
                Подпись портала: <code>{created.signature.slice(0, 16)}…</code>
              </li>
              <li>
                Отпечаток ключа: <code>{created.keyFingerprint}</code>
              </li>
              <li>Размер: {fmtBytes(created.byteSize)}</li>
            </ul>
          </div>
        ) : null}
      </section>

      <section
        style={{
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 14,
          background: '#fff',
          padding: '1rem 1.1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: '0.75rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 750 }}>История</h2>
          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Обновить
          </button>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Загрузка…</p>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Пока нет бэкапов.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {items.map((row) => (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 10,
                  border: '1px solid rgba(15,23,42,0.06)',
                  background: 'rgba(15,23,42,0.02)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 750 }}>{row.label || 'Бэкап'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {new Date(row.createdAt).toLocaleString('ru-RU')} · {fmtBytes(row.byteSize)} ·{' '}
                    <KeyRound size={11} style={{ verticalAlign: -1 }} /> {row.keyFingerprint.slice(0, 12)}…
                  </div>
                </div>
                <a className="btn btn-ghost" href={`/api/admin/backup/${row.id}/download`} download>
                  <Download size={14} /> Скачать
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
