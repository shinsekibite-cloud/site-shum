'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { EMPLOYER_STATUS_RU, VACANCY_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type Employer = {
  id: string;
  title: string;
  status: string;
  isInternal: boolean;
  contactEmail: string | null;
};
type Vacancy = {
  id: string;
  title: string;
  status: string;
  employerId: string;
  employer: { title: string };
  _count: { applications: number; questions: number };
};
type App = {
  id: string;
  autoScore: number | null;
  status: string;
  user: { name: string | null; email: string | null; publicCode: string | null };
  vacancy: { title: string };
};

export default function AdminVacanciesClient() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [applications, setApplications] = useState<App[]>([]);
  const [empTitle, setEmpTitle] = useState('Центр развития молодежи Сочи');
  const [vacTitle, setVacTitle] = useState('');
  const [vacEmployerId, setVacEmployerId] = useState('');
  const [vacDesc, setVacDesc] = useState('<p>Описание вакансии</p>');
  const [qPrompt, setQPrompt] = useState('Готовы работать офлайн в Сочи?');
  const [qCorrect, setQCorrect] = useState('Да');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/vacancies');
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.message || 'Нет доступа');
      return;
    }
    setEmployers(data.employers || []);
    setVacancies(data.vacancies || []);
    setApplications(data.applications || []);
    if (!vacEmployerId && data.employers?.[0]?.id) setVacEmployerId(data.employers[0].id);
  }, [vacEmployerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/vacancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    return data;
  };

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <h1 style={{ margin: 0 }}>Вакансии и работодатели</h1>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Работодатели</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input value={empTitle} onChange={(e) => setEmpTitle(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 8 }} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void post({ action: 'upsertEmployer', title: empTitle, isInternal: true, status: 'APPROVED' })
                .then(() => {
                  toast.success('Сохранено');
                  void load();
                })
                .catch((e) => toast.error(e.message))
            }
          >
            Создать / центр
          </button>
        </div>
        <ul>
          {employers.map((e) => (
            <li key={e.id} style={{ marginBottom: 8 }}>
              {e.title} · {statusRu(EMPLOYER_STATUS_RU, e.status)}
              {e.isInternal ? ' · внутренний' : ''}
              {e.status === 'PENDING' && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      void post({ action: 'setEmployerStatus', id: e.id, status: 'APPROVED' }).then(() => {
                        toast.success('Одобрен');
                        void load();
                      })
                    }
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      void post({ action: 'setEmployerStatus', id: e.id, status: 'REJECTED' }).then(() => {
                        void load();
                      })
                    }
                  >
                    Отклонить
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Новая вакансия</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <select value={vacEmployerId} onChange={(e) => setVacEmployerId(e.target.value)}>
            {employers
              .filter((e) => e.status === 'APPROVED')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
          </select>
          <input placeholder="Название" value={vacTitle} onChange={(e) => setVacTitle(e.target.value)} />
          <textarea rows={3} value={vacDesc} onChange={(e) => setVacDesc(e.target.value)} />
          <input placeholder="Вопрос скрининга" value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} />
          <input placeholder="Правильный ответ" value={qCorrect} onChange={(e) => setQCorrect(e.target.value)} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void post({
                action: 'upsertVacancy',
                employerId: vacEmployerId,
                title: vacTitle,
                description: vacDesc,
                status: 'OPEN',
                workFormat: 'offline',
                city: 'Сочи',
                needInstructions: true,
                screenPassScore: 70,
                questions: [
                  {
                    kind: 'single',
                    prompt: qPrompt,
                    options: ['Да', 'Нет'],
                    correct: qCorrect,
                    weight: 1,
                    knockout: true,
                  },
                ],
              })
                .then(() => {
                  toast.success('Вакансия опубликована');
                  setVacTitle('');
                  void load();
                })
                .catch((e) => toast.error(e.message))
            }
          >
            Опубликовать
          </button>
        </div>
        <ul style={{ marginTop: 12 }}>
          {vacancies.map((v) => (
            <li key={v.id}>
              {v.title} · {statusRu(VACANCY_STATUS_RU, v.status)} · {v.employer.title} · откликов {v._count.applications}
            </li>
          ))}
        </ul>
      </section>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Отклики на разбор</h2>
        {applications.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Нет заявок на рассмотрении</p>
        ) : (
          <ul>
            {applications.map((a) => (
              <li key={a.id} style={{ marginBottom: 10 }}>
                {a.user.name} ({a.user.email}) → {a.vacancy.title} · балл {a.autoScore}%
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      void post({ action: 'reviewApplication', id: a.id, status: 'APPROVED' }).then(() => {
                        toast.success('Одобрено');
                        void load();
                      })
                    }
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      void post({
                        action: 'reviewApplication',
                        id: a.id,
                        status: 'REJECTED',
                        rejectReason: 'Не подходит',
                      }).then(() => void load())
                    }
                  >
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
