'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CaptchaField from '@/components/CaptchaField';
import toast from 'react-hot-toast';
import { EMPLOYER_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type EmployerStatus = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  _count: { vacancies: number };
} | null;


export default function EmployerApplyClient() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [employer, setEmployer] = useState<EmployerStatus>(null);

  useEffect(() => {
    fetch('/api/employers/apply')
      .then((r) => r.json())
      .then((d) => {
        if (d.employer) setEmployer(d.employer);
      })
      .catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!token) {
      toast.error('Пройдите проверку');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/employers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          contactName,
          contactEmail,
          contactPhone,
          websiteUrl,
          captchaToken: token,
          website: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setDone(true);
      setEmployer(data.employer ? { ...data.employer, createdAt: new Date().toISOString(), _count: { vacancies: 0 }, title } : employer);
      toast.success('Заявка отправлена');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  const blocked = employer && (employer.status === 'PENDING' || employer.status === 'APPROVED');

  return (
    <div className="container yp-engage" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 640 }}>
      <Link href="/vacancies" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← Вакансии
      </Link>
      <h1 style={{ margin: '0.75rem 0' }}>Стать партнёром-работодателем</h1>
      <p style={{ color: 'var(--muted)' }}>
        Подайте заявку организации. После проверки команда Центра поможет опубликовать вакансии на портале.
      </p>

      {employer ? (
        <div className="card-surface" style={{ padding: '1.15rem', marginBottom: '1rem' }}>
          <strong>{employer.title}</strong>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Статус: {statusRu(EMPLOYER_STATUS_RU, employer.status)}
            {employer._count?.vacancies != null ? ` · вакансий: ${employer._count.vacancies}` : ''}
          </p>
        </div>
      ) : null}

      {done || blocked ? (
        <div className="card-surface" style={{ padding: '1.25rem' }}>
          <strong>
            {employer?.status === 'APPROVED'
              ? 'Организация подтверждена'
              : 'Заявка принята'}
          </strong>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>
            Мы свяжемся после проверки. Следите за статусом на этой странице.
          </p>
          <Link href="/vacancies" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-flex' }}>
            К вакансиям
          </Link>
        </div>
      ) : (
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            placeholder="Название организации *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <textarea
            placeholder="Описание"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <input
            placeholder="Контактное лицо"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <input
            placeholder="Email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <input
            placeholder="Телефон"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <input
            placeholder="Сайт"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
          />
          <CaptchaField onToken={setToken} />
          <button type="button" className="btn btn-primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
            {busy ? 'Отправка…' : 'Отправить заявку'}
          </button>
        </div>
      )}
    </div>
  );
}
