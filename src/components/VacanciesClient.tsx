'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Building2, MapPin, Clock } from 'lucide-react';
import EtaCountdown from '@/components/EtaCountdown';
import { VACANCY_APP_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type Item = {
  id: string;
  title: string;
  city: string | null;
  workFormat: string;
  closesAt: string | null;
  seats: number | null;
  seatsTaken: number;
  employer: { title: string; isInternal: boolean };
  _count: { questions: number };
  mine: { id: string; status: string; autoScore: number | null } | null;
};

const FORMAT_RU: Record<string, string> = {
  offline: 'Очно',
  hybrid: 'Гибрид',
  remote: 'Удалённо',
};

const APP_STATUS_RU = VACANCY_APP_STATUS_RU;


export default function VacanciesClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('');
  const [needAuth, setNeedAuth] = useState(false);
  const [city, setCity] = useState('');
  const [scope, setScope] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading((prev) => (items.length === 0 ? true : prev));
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (format) qs.set('format', format);
      if (city) qs.set('city', city);
      if (scope) qs.set('scope', scope);
      const res = await fetch(`/api/vacancies?${qs}`);
      if (res.status === 401) {
        setNeedAuth(true);
        setItems([]);
        return;
      }
      const data = await res.json();
      setNeedAuth(false);
      setItems(Array.isArray(data.items) ? data.items : []);
      if (Array.isArray(data.cities)) setCities(data.cities);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft-load keeps list while filters change
  }, [q, format, city, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container yp-engage" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 960 }}>
      <div className="yp-engage__hero">
        <div>
          <h1 className="page-hero-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Briefcase size={28} /> Вакансии
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0.5rem 0 0' }}>
            Стажировки и предложения Центра и проверенных партнёров. Отклик проходит авто-предотбор, затем
            рассмотрение.
          </p>
        </div>
        <Link href="/vacancies/employer" className="btn btn-secondary">
          <Building2 size={16} /> Стать партнёром
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="yp-engage__search"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию или городу…"
          aria-label="Поиск вакансий"
        />
        <button type="submit" className="btn btn-primary">
          Найти
        </button>
      </form>

      <div className="yp-engage__filters">
        {[
          { v: '', l: 'Все форматы' },
          { v: 'offline', l: 'Очно' },
          { v: 'hybrid', l: 'Гибрид' },
          { v: 'remote', l: 'Удалённо' },
        ].map((t) => (
          <button
            key={t.v || 'fmt'}
            type="button"
            className={format === t.v ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setFormat(t.v)}
          >
            {t.l}
          </button>
        ))}
        <span className="yp-engage__sep" aria-hidden />
        {[
          { v: '', l: 'Все' },
          { v: 'internal', l: 'Центр' },
          { v: 'partner', l: 'Партнёры' },
        ].map((t) => (
          <button
            key={`sc-${t.v || 'all'}`}
            type="button"
            className={scope === t.v ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setScope(t.v)}
          >
            {t.l}
          </button>
        ))}
        {cities.length ? (
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Город"
            className="yp-engage__select"
          >
            <option value="">Все города</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      ) : needAuth ? (
        <div className="yp-surface yp-guest-gate" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)' }}>
            Вакансии и отклики доступны после входа.
          </p>
          <Link href="/login?callbackUrl=/vacancies" className="btn btn-primary">
            Войти
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface" style={{ padding: '2rem', textAlign: 'center' }}>
          Пока нет открытых вакансий
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((v) => (
            <Link key={v.id} href={`/vacancies/${v.id}`} className="card-surface yp-engage__card">
              <div className="yp-engage__card-top">
                <strong style={{ fontSize: '1.05rem' }}>{v.title}</strong>
                {v.mine ? (
                  <span className="yp-engage__badge">{statusRu(APP_STATUS_RU, v.mine.status)}</span>
                ) : null}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                <span>{v.employer.title}{v.employer.isInternal ? ' · Центр' : ''}</span>
                {v.city ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {v.city}
                  </span>
                ) : null}
                <span>{FORMAT_RU[v.workFormat] || v.workFormat}</span>
                {v._count.questions ? <span>Предотбор: {v._count.questions} вопр.</span> : null}
                {v.seats != null ? (
                  <span>
                    Мест: {Math.max(0, v.seats - (v.seatsTaken || 0))} / {v.seats}
                  </span>
                ) : null}
              </div>
              {v.closesAt ? (
                <div style={{ marginTop: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} />
                  <EtaCountdown eta={v.closesAt} prefix="Приём до" doneLabel="Приём закрыт" />
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
