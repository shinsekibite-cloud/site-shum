'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy, Gift, Clock, Sparkles } from 'lucide-react';
import EtaCountdown from '@/components/EtaCountdown';
import { CONTEST_KIND_RU, CONTEST_STATUS_RU } from '@/lib/contest-eligibility-shared';

type Item = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  prizeText: string | null;
  status: string;
  endsAt: string | null;
  voteEndsAt: string | null;
  booking: { id: string; title: string } | null;
  _count: { submissions: number; raffleEntries: number; winners: number };
  mine: { id: string; status: string } | null;
};

const SUB_STATUS_RU: Record<string, string> = {
  PENDING: 'На проверке',
  APPROVED: 'Одобрена',
  REJECTED: 'Отклонена',
};

export default function ContestsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [needAuth, setNeedAuth] = useState(false);

  const load = useCallback(async () => {
    setLoading((prev) => (items.length === 0 ? true : prev));
    try {
      const qs = new URLSearchParams();
      if (kind) qs.set('kind', kind);
      if (status) qs.set('status', status);
      const res = await fetch(`/api/contests?${qs}`);
      if (res.status === 401) {
        setNeedAuth(true);
        setItems([]);
        return;
      }
      const data = await res.json();
      setNeedAuth(false);
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft-load keeps list while filters change
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const mineCount = useMemo(() => items.filter((i) => i.mine).length, [items]);

  return (
    <div className="container yp-engage" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 960 }}>
      <div className="yp-engage__hero">
        <div>
          <h1 className="page-hero-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Trophy size={28} /> Конкурсы и розыгрыши
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0.5rem 0 0' }}>
            Подайте работу, голосуйте за участников, следите за дедлайнами. Гранты — отдельно:{' '}
            <Link href="/grants">раздел грантов</Link>.
          </p>
        </div>
        {mineCount > 0 ? (
          <div className="yp-engage__pill">
            <Sparkles size={14} /> Ваших работ: {mineCount}
          </div>
        ) : null}
      </div>

      <div className="yp-engage__filters">
        {[
          { v: '', l: 'Все' },
          { v: 'SUBMISSION', l: 'Работы' },
          { v: 'RAFFLE', l: 'Розыгрыши' },
        ].map((t) => (
          <button
            key={t.v || 'all'}
            type="button"
            className={kind === t.v ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setKind(t.v)}
          >
            {t.l}
          </button>
        ))}
        <span className="yp-engage__sep" aria-hidden />
        {[
          { v: '', l: 'Любой статус' },
          { v: 'OPEN', l: 'Приём' },
          { v: 'VOTING', l: 'Голосование' },
          { v: 'CLOSED', l: 'Завершённые' },
        ].map((t) => (
          <button
            key={`s-${t.v || 'all'}`}
            type="button"
            className={status === t.v ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setStatus(t.v)}
          >
            {t.l}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      ) : needAuth ? (
        <div className="yp-surface yp-guest-gate" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)' }}>
            Конкурсы доступны после входа — так мы защищаем работы и голосование.
          </p>
          <Link href="/login?callbackUrl=/contests" className="btn btn-primary">
            Войти
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
          Пока нет конкурсов по выбранным фильтрам
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/contests/${c.id}`}
              className="card-surface yp-engage__card"
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {c.kind === 'RAFFLE' ? <Gift size={22} /> : <Trophy size={22} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="yp-engage__card-top">
                    <strong style={{ fontSize: '1.1rem' }}>{c.title}</strong>
                    <span className="yp-engage__badge">{CONTEST_STATUS_RU[c.status] || "Неизвестно"}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 4 }}>
                    {CONTEST_KIND_RU[c.kind] || c.kind}
                    {c.prizeText ? ` · приз: ${c.prizeText}` : ''}
                    {c.booking ? ` · ${c.booking.title}` : ''}
                  </div>
                  {c.summary ? <p style={{ margin: '0.5rem 0 0' }}>{c.summary}</p> : null}
                  <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                    {c.kind === 'RAFFLE' ? (
                      <span>В пуле: {c._count.raffleEntries}</span>
                    ) : (
                      <span>Работ: {c._count.submissions}</span>
                    )}
                    {c._count.winners ? <span>Победителей: {c._count.winners}</span> : null}
                    {c.mine ? (
                      <span className="yp-engage__mine">
                        Ваша работа: {SUB_STATUS_RU[c.mine.status] || "Неизвестно"}
                      </span>
                    ) : null}
                  </div>
                  {c.endsAt || c.voteEndsAt ? (
                    <div style={{ marginTop: 6, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={14} aria-hidden />
                      <EtaCountdown
                        eta={c.status === 'VOTING' && c.voteEndsAt ? c.voteEndsAt : c.endsAt}
                        prefix={c.status === 'VOTING' ? 'Голосование' : 'До конца'}
                        doneLabel="Срок истёк"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
