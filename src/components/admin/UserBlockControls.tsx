'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Unlock } from 'lucide-react';
import { BAN_REASONS, type BanSeverity } from '@/lib/ban-reasons';

type BlockEvent = {
  id: string;
  action: string;
  reasonsJson: string | null;
  comment: string | null;
  actorName: string | null;
  createdAt: string;
};

export default function UserBlockControls({
  userId,
  blockedAt,
  blockedReason,
  suspiciousFlag = false,
}: {
  userId: string;
  blockedAt?: string | Date | null;
  blockedReason?: string | null;
  suspiciousFlag?: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<BlockEvent[]>([]);
  const [suspicious, setSuspicious] = useState(suspiciousFlag);
  const [isPending, startTransition] = useTransition();
  const blocked = Boolean(blockedAt);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/block`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.history)) setHistory(d.history);
        if (typeof d?.suspiciousFlag === 'boolean') setSuspicious(d.suspiciousFlag);
      })
      .catch(() => undefined);
  }, [userId, blockedAt]);

  const toggleCode = (code: string) => {
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const run = async (action: 'block' | 'unblock') => {
    if (action === 'block' && codes.length === 0) {
      alert('Выберите хотя бы одну причину блокировки');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reasonCodes: codes,
          comment: comment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || 'Ошибка');
        return;
      }
      setComment('');
      setCodes([]);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspicious = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspiciousFlag: !suspicious }),
      });
      if (res.ok) {
        setSuspicious(!suspicious);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  };

  const renderGroup = (severity: BanSeverity, title: string) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 750, color: '#64748b', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {BAN_REASONS.filter((r) => r.severity === severity).map((r) => {
          const on = codes.includes(r.code);
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => toggleCode(r.code)}
              className="btn btn-secondary"
              style={{
                padding: '0.3rem 0.55rem',
                fontSize: '0.75rem',
                background: on ? 'rgba(185,28,28,0.12)' : undefined,
                borderColor: on ? 'rgba(185,28,28,0.35)' : undefined,
                color: on ? '#991b1b' : undefined,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      style={{
        background: blocked ? 'rgba(220,38,38,0.06)' : '#fff',
        border: blocked ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(15,23,42,0.08)',
        borderRadius: 14,
        padding: '1rem',
      }}
    >
      <h3 style={{ margin: '0 0 0.65rem', fontSize: '1.05rem', fontWeight: 750 }}>
        {blocked ? 'Аккаунт заблокирован' : 'Блокировка'}
      </h3>
      {blocked && blockedAt && (
        <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: '#991b1b' }}>
          С {new Date(blockedAt).toLocaleString('ru-RU')}
          {blockedReason ? ` · ${blockedReason}` : ''}
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.88rem' }}>
        <input type="checkbox" checked={suspicious} onChange={() => void toggleSuspicious()} disabled={busy} />
        Флаг «Подозрительный»
      </label>

      {!blocked && (
        <>
          {renderGroup('hard', 'Жёсткие причины')}
          {renderGroup('soft', 'Мягкие причины')}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Комментарий модератора (необязательно)"
            style={{
              width: '100%',
              marginBottom: 8,
              padding: '0.55rem 0.65rem',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </>
      )}

      {blocked && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Причина разблокировки (необязательно)"
          style={{
            width: '100%',
            marginBottom: 8,
            padding: '0.55rem 0.65rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
          }}
        />
      )}

      <button
        type="button"
        disabled={busy || isPending}
        className="btn"
        onClick={() => void run(blocked ? 'unblock' : 'block')}
        style={{
          background: blocked ? '#15803d' : '#b91c1c',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {blocked ? <Unlock size={16} /> : <Ban size={16} />}
        {blocked ? 'Разблокировать' : 'Заблокировать'}
      </button>

      {history.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 750, color: '#64748b', marginBottom: 6 }}>
            История блокировок
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {history.map((h) => {
              let reasons: string[] = [];
              try {
                reasons = JSON.parse(h.reasonsJson || '[]');
              } catch {
                reasons = [];
              }
              return (
                <li
                  key={h.id}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.55rem',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong>{h.action}</strong>
                  {' · '}
                  {new Date(h.createdAt).toLocaleString('ru-RU')}
                  {h.actorName ? ` · ${h.actorName}` : ''}
                  {reasons.length ? (
                    <div style={{ color: '#475569', marginTop: 2 }}>{reasons.join(', ')}</div>
                  ) : null}
                  {h.comment ? <div style={{ color: '#64748b' }}>{h.comment}</div> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
