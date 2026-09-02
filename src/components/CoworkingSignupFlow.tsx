'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MapPin } from 'lucide-react';
import { COWORKING_PERIODS } from '@/lib/coworking';
import SvcDateField from '@/components/SvcDateField';
import ServiceSplitModal from '@/components/ServiceSplitModal';
import QRCodeDisplay from '@/components/QRCodeDisplay';

type PeriodInfo = {
  id: string;
  label: string;
  start: string;
  end: string;
  used: number;
  wait: number;
  left: number;
};

type SpaceInfo = {
  id: string;
  title: string;
  address: string | null;
  capacity: number;
  image: string | null;
  periods: PeriodInfo[];
};

const PURPOSES = ['Учёба', 'Проект', 'Встреча', 'Другое'];

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatRuLong(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

export default function CoworkingSignupFlow({ initialSpaceId }: { initialSpaceId?: string }) {
  const router = useRouter();
  const [dayKey, setDayKey] = useState(todayYmd());
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [spaceId, setSpaceId] = useState(initialSpaceId || '');
  const [period, setPeriod] = useState('DAY');
  const [seats, setSeats] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMeta, setSuccessMeta] = useState<{
    title: string;
    day: string;
    start: string;
    end: string;
    waitlist: boolean;
  } | null>(null);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/coworking?day=${encodeURIComponent(dayKey)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        setSpaces(data.spaces || []);
        if (!spaceId && data.spaces?.[0]?.id) setSpaceId(data.spaces[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dayKey, spaceId]);

  const space = useMemo(() => spaces.find((s) => s.id === spaceId) || null, [spaces, spaceId]);
  const periodInfo = space?.periods.find((p) => p.id === period) || null;
  const left = periodInfo?.left ?? 0;
  const cover = space?.image || '/brand/hero-cover.jpg';
  const periodDef = COWORKING_PERIODS.find((p) => p.id === period);

  async function submit(waitlist = false) {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch('/api/coworking', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId, dayKey, period, seats, purpose: purpose || null, waitlist }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.canWaitlist) {
          setError('Мест нет — можно встать в лист ожидания');
        } else {
          setError(data.message || 'Не удалось записаться');
        }
        return;
      }
      const wait = data.signup?.status === 'WAITLIST';
      setMessage(wait ? 'Вы в листе ожидания' : 'Запись подтверждена');
      setSuccessMeta({
        title: space?.title || 'Коворкинг',
        day: dayKey,
        start: periodDef?.start || '',
        end: periodDef?.end || '',
        waitlist: wait,
      });
      try {
        const qrRes = await fetch('/api/presence-qr', { credentials: 'same-origin' });
        const qrData = await qrRes.json();
        if (qrRes.ok) setQrUrl(qrData.qr?.url || '');
      } catch {
        /* optional */
      }
      setSuccessOpen(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cw-layout">
      <aside className="cw-aside">
        <div className="cw-aside__photo" style={{ backgroundImage: `url(${cover})` }} />
        <div className="cw-aside__body">
          <h2>{space?.title || 'Площадка'}</h2>
          {space?.address ? (
            <p>
              <MapPin size={14} aria-hidden /> {space.address}
            </p>
          ) : null}
          <span className="cw-aside__seats">
            {loading
              ? 'Загрузка…'
              : left > 0
                ? `осталось ${left} из ${space?.capacity ?? 0}`
                : 'мест нет сегодня'}
          </span>
        </div>
      </aside>

      <div className="cw-flow">
        <div className="cw-flow-steps">
          <label className="cw-field">
            <span>Площадка</span>
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} disabled={loading}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.address ? ` — ${s.address}` : ''}
                </option>
              ))}
            </select>
          </label>

          <SvcDateField value={dayKey} min={todayYmd()} onChange={setDayKey} />

          <fieldset className="cw-field">
            <legend>Интервал</legend>
            <div className="cw-periods">
              {COWORKING_PERIODS.map((p) => {
                const info = space?.periods.find((x) => x.id === p.id);
                const slotLeft = info?.left;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cw-period${period === p.id ? ' is-active' : ''}`}
                    onClick={() => setPeriod(p.id)}
                  >
                    <strong>{p.label}</strong>
                    <span>
                      {p.start}–{p.end}
                    </span>
                    <em>
                      {typeof slotLeft === 'number'
                        ? slotLeft > 0
                          ? `${slotLeft} мест`
                          : 'мест нет'
                        : 'Загрузка…'}
                    </em>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="cw-row">
            <label className="cw-field">
              <span>Мест</span>
              <input
                type="number"
                min={1}
                max={5}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              />
            </label>

            <label className="cw-field">
              <span>Цель визита</span>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="">Необязательно</option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <p className="cw-error">{error}</p> : null}
        {message && !successOpen ? <p className="cw-ok">{message}</p> : null}

        <div className="cw-actions">
          {left > 0 ? (
            <button
              type="button"
              className="btn btn-primary cw-cta"
              disabled={submitting || !spaceId}
              onClick={() => submit(false)}
            >
              {submitting ? 'Записываем…' : 'Записаться'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary cw-cta"
              disabled={submitting || !spaceId}
              onClick={() => submit(true)}
            >
              {submitting ? 'Отправляем…' : 'В лист ожидания'}
            </button>
          )}
          <Link href="/spaces" className="cw-cta-round" aria-label="К площадкам" title="К площадкам">
            <ArrowRight size={20} />
          </Link>
        </div>
        {left > 0 ? <p className="cw-left-note">Осталось {left} мест на выбранный интервал</p> : null}
      </div>

      <ServiceSplitModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          router.push('/dashboard?tab=coworking');
        }}
        title={successMeta?.waitlist ? 'В листе ожидания' : 'Ты в коворкинге'}
        ariaLabel="Запись оформлена"
        aside={
          <div className="svc-modal__aside-inner">
            <div className="svc-modal__circles" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" />
            </div>
            {qrUrl && !successMeta?.waitlist ? (
              <div className="svc-modal__qr">
                <QRCodeDisplay value={qrUrl} size={200} />
              </div>
            ) : (
              <p className="svc-modal__aside-note">Покажите пропуск из кабинета на входе</p>
            )}
          </div>
        }
        footer={
          <>
            <Link href="/dashboard" className="btn btn-primary" onClick={() => setSuccessOpen(false)}>
              {qrUrl ? 'Показать QR на входе' : 'В кабинет'}
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => setSuccessOpen(false)}>
              Закрыть
            </button>
          </>
        }
      >
        {successMeta ? (
          <p className="svc-modal__lead">
            {successMeta.waitlist ? 'Заявка в лист ожидания: ' : ''}
            «{successMeta.title}», {formatRuLong(successMeta.day)}
            {successMeta.start ? `, ${successMeta.start}–${successMeta.end}` : ''}.
          </p>
        ) : null}
      </ServiceSplitModal>
    </div>
  );
}
