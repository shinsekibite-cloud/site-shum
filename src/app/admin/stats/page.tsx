'use client';

import { useSafeSearchParams } from '@/lib/use-safe-search-params';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, Download, Printer, ScanLine, Ticket, Users, ArrowLeft, QrCode } from 'lucide-react';
import { formatMskDateTime } from '@/lib/booking-hours';
import PeriodPicker from '@/components/admin/PeriodPicker';
import { parseStatsRange, statsRangeQuery, type StatsRange } from '@/lib/stats-period';

function AdminStatsInner() {
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const [range, setRange] = useState<StatsRange>(() => parseStatsRange(searchParams));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: StatsRange) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats?${statsRangeQuery(r)}`);
      if (!res.ok) throw new Error('Не удалось загрузить');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const onRange = (r: StatsRange) => {
    setRange(r);
    router.replace(`/admin/stats?${statsRangeQuery(r)}`, { scroll: false });
  };

  const exportUrl = `/api/admin/stats/export?${statsRangeQuery(range)}`;

  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (loading && !data) return <p style={{ color: 'var(--muted)' }}>Загрузка статистики…</p>;
  if (!data) return null;

  const { summary, events, byDay, periodLabel } = data;
  const maxBar = Math.max(...(byDay || []).map((x: any) => Number(x.cnt) || 0), 1);

  return (
    <div className="admin-page-shell admin-stats-page" style={{ paddingBottom: '5rem' }}>
      <div className="admin-page-header admin-stats-page__header no-print">
        <div>
          <Link href="/admin#admin-analytics" className="admin-stats-page__back">
            <ArrowLeft size={14} aria-hidden /> Дашборд
          </Link>
          <h1 className="admin-stats-page__title">Статистика проходов</h1>
          <p className="admin-stats-page__subtitle">
            QR-сканер и отметки на входе · {periodLabel}
            {loading ? ' · обновление…' : ''}
          </p>
        </div>
        <div className="admin-stats-page__toolbar">
          <PeriodPicker value={range} onChange={onRange} />
          <a href={exportUrl} className="btn btn-secondary admin-stats-page__tool-btn" download>
            <Download size={16} aria-hidden /> CSV
          </a>
          <button type="button" className="btn btn-secondary admin-stats-page__tool-btn" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Печать
          </button>
          <Link href="/admin/scanner" className="btn btn-primary admin-stats-page__tool-btn" prefetch>
            <ScanLine size={16} aria-hidden /> Сканер
          </Link>
        </div>
      </div>

      <p className="admin-stats-page__print-meta print-only">{periodLabel} · {new Date().toLocaleString('ru-RU')}</p>

      <div className="admin-stats-page__cards">
        <div className="glass admin-stats-card">
          <Ticket size={20} color="var(--primary)" aria-hidden />
          <div className="admin-stats-card__value">{summary.inPeriod}</div>
          <div className="admin-stats-card__label">Проходов за период</div>
        </div>
        <div className="glass admin-stats-card">
          <Users size={20} color="var(--primary)" aria-hidden />
          <div className="admin-stats-card__value">{summary.uniqueGuests}</div>
          <div className="admin-stats-card__label">Уникальных гостей</div>
        </div>
        <div className="glass admin-stats-card">
          <QrCode size={20} color="var(--primary)" aria-hidden />
          <div className="admin-stats-card__value">{summary.qrScans ?? '—'}</div>
          <div className="admin-stats-card__label">По QR-коду</div>
        </div>
        <div className="glass admin-stats-card">
          <BarChart3 size={20} color="var(--primary)" aria-hidden />
          <div className="admin-stats-card__value">{summary.totalCheckIns}</div>
          <div className="admin-stats-card__label">Всего за всё время</div>
        </div>
      </div>

      {(summary.openVacancies != null || summary.vacancyApplications != null) && (
        <div className="admin-stats-page__cards" style={{ marginTop: '0.85rem' }}>
          <div className="glass admin-stats-card">
            <div className="admin-stats-card__value">{summary.openVacancies ?? '—'}</div>
            <div className="admin-stats-card__label">Вакансии OPEN</div>
          </div>
          <div className="glass admin-stats-card">
            <div className="admin-stats-card__value">{summary.vacancyApplications ?? '—'}</div>
            <div className="admin-stats-card__label">Отклики за период</div>
          </div>
          <div className="glass admin-stats-card">
            <div className="admin-stats-card__value">{summary.openContests ?? '—'}</div>
            <div className="admin-stats-card__label">Конкурсы активны</div>
          </div>
          <div className="glass admin-stats-card">
            <div className="admin-stats-card__value">{summary.messagesInPeriod ?? '—'}</div>
            <div className="admin-stats-card__label">Сообщений за период</div>
          </div>
        </div>
      )}

      {Array.isArray(byDay) && byDay.length > 0 && (
        <div className="glass admin-stats-chart">
          <h2>Проходы · {periodLabel}</h2>
          <div className="admin-stats-chart__bars">
            {byDay.map((d: any) => {
              const h = Math.max(6, (Number(d.cnt) / maxBar) * 100);
              return (
                <div key={d.day} className="admin-stats-chart__col" title={`${d.day}: ${d.cnt}`}>
                  <div className="admin-stats-chart__bar-wrap">
                    <div className="admin-stats-chart__bar" style={{ height: `${h}%` }} />
                  </div>
                  <div className="admin-stats-chart__label">{String(d.day)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="admin-stats-page__section-title">Мероприятия за период</h2>
      <div className="admin-stats-events">
        {events.map((ev: any) => {
          const pct = ev.registered ? Math.min(100, Math.round((ev.checkedIn / ev.registered) * 100)) : 0;
          return (
            <div key={ev.id} className="glass admin-stats-event">
              <div className="admin-stats-event__head">
                <div>
                  <div className="admin-stats-event__title">{ev.title}</div>
                  <div className="admin-stats-event__meta">
                    {ev.space || '—'} · {formatMskDateTime(ev.startTime, { withYear: true })} (МСК)
                  </div>
                </div>
                <div className="admin-stats-event__count">
                  {ev.checkedIn} / {ev.registered} ({pct}%)
                </div>
              </div>
              <div className="admin-stats-event__progress">
                <div style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {events.length === 0 && <p style={{ color: 'var(--muted)' }}>Нет подтверждённых мероприятий за выбранный период</p>}
      </div>
    </div>
  );
}

export default function AdminStatsPage() {
  return <AdminStatsInner />;
}
