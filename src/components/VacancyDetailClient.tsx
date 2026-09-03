'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import CaptchaField from '@/components/CaptchaField';
import EtaCountdown from '@/components/EtaCountdown';
import toast from 'react-hot-toast';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';
import { VACANCY_APP_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type Question = {
  id: string;
  kind: string;
  prompt: string;
  optionsJson: string | null;
  weight: number;
};

type Vacancy = {
  id: string;
  title: string;
  description: string;
  workFormat: string;
  city: string | null;
  ageMin: number | null;
  ageMax: number | null;
  minReliability: number;
  minSocial: number;
  needInstructions: boolean;
  closesAt: string | null;
  seats: number | null;
  seatsTaken: number;
  requirements: string[];
  employer: { title: string; isInternal: boolean; description: string | null };
  questions: Question[];
};

type MyApp = {
  id: string;
  status: string;
  autoScore: number | null;
  rejectReason: string | null;
  createdAt: string;
} | null;

const FORMAT_RU: Record<string, string> = {
  offline: 'Очно',
  hybrid: 'Гибрид',
  remote: 'Удалённо',
};

const APP_RU = VACANCY_APP_STATUS_RU;

export default function VacancyDetailClient() {
  const { id } = useParams<{ id: string }>();
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [elig, setElig] = useState<{ ok: boolean; message?: string; code?: string } | null>(null);
  const [myApp, setMyApp] = useState<MyApp>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [cover, setCover] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/vacancies/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setNeedAuth(true);
      return;
    }
    if (!res.ok) {
      toast.error(data.message || 'Не найдено');
      return;
    }
    setNeedAuth(false);
    setVacancy(data.vacancy);
    setElig(data.eligibility);
    setMyApp(data.myApplication || null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!token) {
      toast.error('Пройдите проверку');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/vacancies/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancyId: id,
          coverLetter: cover,
          answers,
          captchaToken: token,
          website: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setResult(data.message);
      toast.success(data.message);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm('Отозвать отклик?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/vacancies/apply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancyId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Отклик отозван');
      setResult(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (needAuth) {
    return (
      <div className="container" style={{ padding: '2rem 1rem', maxWidth: 520 }}>
        <section className="yp-surface yp-guest-gate" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Вакансия для участников</h1>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)' }}>
            Войдите, чтобы смотреть условия и откликнуться.
          </p>
          <Link href={`/login?callbackUrl=/vacancies/${encodeURIComponent(String(id || ''))}`} className="btn btn-primary">
            Войти
          </Link>
        </section>
      </div>
    );
  }

  if (!vacancy) {
    return (
      <div className="container" style={{ padding: '2rem' }}>
        Загрузка…
      </div>
    );
  }

  const activeApp =
    myApp && ['PENDING_REVIEW', 'APPROVED', 'SCREENING', 'PENDING'].includes(myApp.status) ? myApp : null;
  const rejectedApp = myApp?.status === 'REJECTED' ? myApp : null;
  const canApply = elig?.ok && !activeApp;

  return (
    <div className="container yp-engage" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 720 }}>
      <Link href="/vacancies" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← Все вакансии
      </Link>
      <h1 style={{ margin: '0.75rem 0 0.35rem', fontWeight: 800 }}>{vacancy.title}</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 1rem' }}>
        {vacancy.employer.title}
        {vacancy.employer.isInternal ? ' · Центр' : ''}
        {vacancy.city ? ` · ${vacancy.city}` : ''} · {FORMAT_RU[vacancy.workFormat] || vacancy.workFormat}
      </p>

      <ul className="yp-engage__reqs">
        {(vacancy.ageMin != null || vacancy.ageMax != null) && (
          <li>
            Возраст:{' '}
            {vacancy.ageMin != null && vacancy.ageMax != null
              ? `${vacancy.ageMin}–${vacancy.ageMax}`
              : vacancy.ageMin != null
                ? `от ${vacancy.ageMin}`
                : `до ${vacancy.ageMax}`}
          </li>
        )}
        {vacancy.minReliability > 0 ? <li>Авторитет от {vacancy.minReliability}</li> : null}
        {vacancy.minSocial > 0 ? <li>Соцрейтинг от {vacancy.minSocial}</li> : null}
        {vacancy.needInstructions ? <li>Нужен пройденный инструктаж</li> : null}
        {vacancy.seats != null ? (
          <li>
            Мест: {Math.max(0, vacancy.seats - (vacancy.seatsTaken || 0))} из {vacancy.seats}
          </li>
        ) : null}
        {vacancy.closesAt ? (
          <li>
            <EtaCountdown eta={vacancy.closesAt} prefix="Приём до" doneLabel="Приём закрыт" />
          </li>
        ) : null}
      </ul>

      {vacancy.requirements?.length ? (
        <div className="card-surface" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <strong>Что важно</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
            {vacancy.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className="prose card-surface"
        style={{ padding: '1.15rem', marginBottom: '1.25rem' }}
        dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(vacancy.description) }}
      />

      {activeApp || result ? (
        <div className="card-surface" style={{ padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
          <strong>
            {result || `Статус: ${statusRu(APP_RU, activeApp!.status)}`}
          </strong>
          {activeApp?.autoScore != null ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Предотбор: {activeApp.autoScore}%
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard/applications" className="btn btn-secondary">
              Мои заявки
            </Link>
            {activeApp && activeApp.status !== 'APPROVED' ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void withdraw()}>
                Отозвать
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Отклик</h2>
          {elig && !elig.ok && (
            <div>
              <p style={{ color: '#b45309', margin: '0 0 0.75rem' }}>{elig.message}</p>
              {elig.code === 'INSTRUCTIONS' ? (
                <Link href="/dashboard/guides" className="btn btn-secondary">
                  Пройти инструктаж
                </Link>
              ) : elig.code === 'AGE_UNKNOWN' ? (
                <Link href="/dashboard#profile-edit" className="btn btn-secondary">
                  Заполнить профиль
                </Link>
              ) : null}
            </div>
          )}
          {rejectedApp ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Предыдущий отклик отклонён
              {rejectedApp.rejectReason ? `: ${rejectedApp.rejectReason}` : ''}. Можно подать снова.
            </p>
          ) : null}
          {canApply && (
            <>
              <label style={{ fontWeight: 600 }}>Сопроводительное (необязательно)</label>
              <textarea
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
              />
              {vacancy.questions.map((q) => {
                let options: string[] = [];
                try {
                  options = q.optionsJson ? JSON.parse(q.optionsJson) : [];
                } catch {
                  options = [];
                }
                return (
                  <div key={q.id}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>{q.prompt}</label>
                    {q.kind === 'text' ? (
                      <textarea
                        rows={2}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
                      />
                    ) : q.kind === 'bool' ? (
                      <select
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value === 'true' }))}
                        defaultValue=""
                        style={{ width: '100%', padding: 10, borderRadius: 10 }}
                      >
                        <option value="" disabled>
                          Выберите
                        </option>
                        <option value="true">Да</option>
                        <option value="false">Нет</option>
                      </select>
                    ) : (
                      <select
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        defaultValue=""
                        style={{ width: '100%', padding: 10, borderRadius: 10 }}
                      >
                        <option value="" disabled>
                          Выберите
                        </option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              <CaptchaField onToken={setToken} />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Отправка…' : 'Отправить отклик'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
