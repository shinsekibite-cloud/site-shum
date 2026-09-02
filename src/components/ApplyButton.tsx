'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type ApplicationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Prevent double-submit from two buttons / double-clicks across mounts. */
const inflightKeys = new Set<string>();

export default function ApplyButton({
  projectId,
  clubId,
  programId,
  initialStatus = 'NONE',
  withMessage = false,
  applyLabel = 'Подать заявку',
  approvedLabel = 'Вы участник',
  messagePlaceholder = 'Коротко о себе (необязательно)',
}: {
  projectId?: string;
  clubId?: string;
  programId?: string;
  initialStatus?: ApplicationStatus;
  withMessage?: boolean;
  applyLabel?: string;
  approvedLabel?: string;
  messagePlaceholder?: string;
}) {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (authStatus !== 'authenticated' || initialStatus !== 'NONE') return;
    let cancelled = false;
    fetch('/api/user/applications')
      .then((r) => (r.ok ? r.json() : []))
      .then((apps) => {
        if (cancelled || !Array.isArray(apps)) return;
        const match = apps.find((a: { projectId?: string | null; clubId?: string | null; programId?: string | null; status?: string }) =>
          (projectId && a.projectId === projectId) ||
          (clubId && a.clubId === clubId) ||
          (programId && a.programId === programId)
        );
        if (
          match?.status === 'PENDING' ||
          match?.status === 'APPROVED' ||
          match?.status === 'REJECTED'
        ) {
          setStatus(match.status);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authStatus, projectId, clubId, programId, initialStatus]);

  const targetKey = programId
    ? `program:${programId}`
    : clubId
      ? `club:${clubId}`
      : projectId
        ? `project:${projectId}`
        : '';

  const loginCallback = () => {
    const path = `${window.location.pathname}${window.location.search}`;
    return '/login?callbackUrl=' + encodeURIComponent(path);
  };

  const resolveSession = async () => {
    if (authStatus === 'authenticated' && session) return session;
    if (authStatus === 'unauthenticated') return null;
    // Session still resolving — wait briefly, never hang the CTA forever.
    const { getSession } = await import('next-auth/react');
    const deadline = Date.now() + 3500;
    let s = await getSession();
    while (!s && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      s = await getSession();
    }
    return s;
  };

  const handleApply = async () => {
    if (status === 'PENDING' || status === 'APPROVED') return;
    if (submittingRef.current || (targetKey && inflightKeys.has(targetKey))) return;

    if (withMessage && !showForm) {
      setShowForm(true);
      return;
    }

    submittingRef.current = true;
    if (targetKey) inflightKeys.add(targetKey);
    setLoading(true);
    setError('');
    try {
      const activeSession = await resolveSession();
      if (!activeSession) {
        router.push(loginCallback());
        return;
      }

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          clubId,
          programId,
          message: withMessage ? message.trim() || undefined : undefined,
        }),
      });

      if (res.ok) {
        setStatus('PENDING');
        setShowForm(false);
        const { reachGoal } = await import('@/components/YandexMetrika');
        reachGoal('application');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'APPROVED' || /участник|команде|принята/i.test(data.message || '')) {
          setStatus('APPROVED');
        } else if (/уже подали|ожидайте/i.test(data.message || '') || data.status === 'PENDING') {
          setStatus('PENDING');
        } else if (res.status === 429) {
          setError(data.message || 'Слишком много заявок. Попробуйте позже.');
        } else if (res.status === 401) {
          router.push(loginCallback());
        } else {
          setError(data.message || 'Ошибка подачи заявки');
        }
      }
    } catch {
      setError('Ошибка сети. Попробуйте позже.');
    } finally {
      submittingRef.current = false;
      if (targetKey) inflightKeys.delete(targetKey);
      setLoading(false);
    }
  };

  if (status === 'APPROVED') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
        <button
          className="btn btn-secondary"
          disabled
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#e2e8f0',
            color: '#334155',
            borderColor: '#e2e8f0',
            cursor: 'default',
            opacity: 0.95,
            width: withMessage ? '100%' : undefined,
          }}
        >
          {approvedLabel}
        </button>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Заявка уже одобрена</span>
      </div>
    );
  }

  if (status === 'PENDING') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
        <button
          className="btn btn-secondary"
          disabled
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#f1f5f9',
            color: '#475569',
            borderColor: '#e2e8f0',
            cursor: 'default',
            width: withMessage ? '100%' : undefined,
          }}
        >
          Заявка на рассмотрении
        </button>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ожидайте решения администратора</span>
      </div>
    );
  }

  // Never leave CTA on session "Загрузка…" — guest sees apply/login path immediately.
  const busy = loading;
  const guestHint = authStatus === 'unauthenticated';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: withMessage ? 'stretch' : 'flex-end',
        gap: '0.55rem',
        width: withMessage ? '100%' : 'auto',
        maxWidth: withMessage ? 360 : undefined,
      }}
    >
      {withMessage && showForm && (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 500))}
          rows={3}
          placeholder={messagePlaceholder}
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.12)',
            padding: '0.7rem 0.8rem',
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            resize: 'vertical',
            background: '#fff',
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: withMessage ? 'flex-start' : 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        {withMessage && showForm && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowForm(false)}
            style={{ padding: '0.7rem 1rem' }}
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          onClick={handleApply}
          disabled={busy}
          className="btn btn-primary"
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', flex: withMessage ? 1 : undefined }}
        >
          {busy
            ? 'Отправка...'
            : guestHint && !showForm
              ? 'Войти и подать заявку'
              : withMessage && !showForm
                ? status === 'REJECTED'
                  ? 'Подать повторно'
                  : applyLabel
                : withMessage && showForm
                  ? 'Отправить'
                  : status === 'REJECTED'
                    ? 'Подать повторно'
                    : applyLabel}
        </button>
      </div>
      {error && (
        <span
          style={{
            fontSize: '0.8rem',
            color: '#b91c1c',
            maxWidth: 280,
            textAlign: withMessage ? 'left' : 'right',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
