'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MapPin } from 'lucide-react';
import {
  clampCoworkingSeats,
  COWORKING_MAX_SEATS,
  COWORKING_PERIODS,
  defaultCoworkingPeriodId,
  resolveCoworkingPeriod,
} from '@/lib/coworking';
import type { CoworkingSpaceAvailability } from '@/lib/coworking-availability';
import SvcDateField from '@/components/SvcDateField';
import ServiceSplitModal from '@/components/ServiceSplitModal';
import QRCodeDisplay from '@/components/QRCodeDisplay';

type SpaceInfo = CoworkingSpaceAvailability;

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

type Props = {
  initialSpaceId?: string;
  initialDayKey?: string;
  initialSpaces?: SpaceInfo[];
};

export default function CoworkingSignupFlow({
  initialSpaceId,
  initialDayKey,
  initialSpaces = [],
}: Props) {
  const router = useRouter();
  const [dayKey, setDayKey] = useState(initialDayKey || todayYmd());
  const [spaces, setSpaces] = useState<SpaceInfo[]>(initialSpaces);
  const [spaceId, setSpaceId] = useState(() => {
    if (initialSpaceId && initialSpaces.some((s) => s.id === initialSpaceId)) return initialSpaceId;
    return initialSpaces[0]?.id || initialSpaceId || '';
  });
  const [period, setPeriod] = useState(() => defaultCoworkingPeriodId(initialDayKey || todayYmd()));
  const [seats, setSeats] = useState(1);
  const [seatsDraft, setSeatsDraft] = useState('1');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(initialSpaces.length === 0);
  const [refreshing, setRefreshing] = useState(false);
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
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;
  const lastFetchedDay = useRef<string | null>(
    initialSpaces.length > 0 ? initialDayKey || todayYmd() : null
  );
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  useEffect(() => {
    let cancelled = false;

    // SSR already hydrated this day — don't blank the UI with a remount refetch.
    if (lastFetchedDay.current === dayKey) return;

    const soft = spacesRef.current.length > 0;
    if (soft) setRefreshing(true);
    else setLoading(true);

    fetch(`/api/coworking?day=${encodeURIComponent(dayKey)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Ошибка');
        if (cancelled) return;
        const next: SpaceInfo[] = data.spaces || [];
        setSpaces(next);
        setError(null);
        lastFetchedDay.current = dayKey;
        const current = spaceIdRef.current;
        if (!current || !next.some((s) => s.id === current)) {
          if (next[0]?.id) setSpaceId(next[0].id);
        }
        setPeriod((prev) => {
          const preferred = defaultCoworkingPeriodId(dayKey);
          if (next[0]?.periods.some((p) => p.id === prev)) return prev;
          return preferred;
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dayKey]);

  const space = useMemo(() => spaces.find((s) => s.id === spaceId) || null, [spaces, spaceId]);
  const periodInfo = space?.periods.find((p) => p.id === period) || null;
  const left = periodInfo?.left ?? 0;
  const cover = space?.image || '/brand/hero-cover.jpg';
  const periodDef = resolveCoworkingPeriod(period);
  const busy = loading && spaces.length === 0;
  const seatsMax = Math.max(
    1,
    Math.min(COWORKING_MAX_SEATS, left > 0 ? left : COWORKING_MAX_SEATS, space?.capacity || COWORKING_MAX_SEATS)
  );

  useEffect(() => {
    setSeats((prev) => {
      const next = clampCoworkingSeats(prev, seatsMax);
      if (next !== prev) setSeatsDraft(String(next));
      return next;
    });
  }, [seatsMax]);

  function commitSeatsDraft(raw: string) {
    const next = clampCoworkingSeats(raw === '' ? 1 : raw, seatsMax);
    setSeats(next);
    setSeatsDraft(String(next));
  }

  async function submit(waitlist = false) {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const seatsToSend = clampCoworkingSeats(seatsDraft === '' ? seats : seatsDraft, seatsMax);
    setSeats(seatsToSend);
    setSeatsDraft(String(seatsToSend));
    try {
      const r = await fetch('/api/coworking', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId,
          dayKey,
          period,
          seats: seatsToSend,
          purpose: purpose || null,
          waitlist,
        }),
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
        start: periodDef.start || '',
        end: periodDef.end || '',
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
    <div className={`cw-layout${refreshing ? ' is-refreshing' : ''}`}>
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
            {busy
              ? 'Загрузка…'
              : left > 0
                ? `осталось ${left} из ${space?.capacity ?? 0}`
                : space
                  ? 'мест нет на этот час'
                  : 'Загрузка…'}
          </span>
        </div>
      </aside>

      <div className="cw-flow">
        <div className="cw-flow-steps">
          <label className="cw-field">
            <span>Площадка</span>
            <select
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              disabled={busy || spaces.length === 0}
            >
              {spaces.length === 0 ? <option value="">Загрузка…</option> : null}
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          <SvcDateField value={dayKey} min={todayYmd()} onChange={setDayKey} />

          <div className="cw-field" role="group" aria-labelledby="cw-interval-label">
            <span id="cw-interval-label">Час</span>
            <p className="cw-field-hint">Выберите почасовой слот (Москва)</p>
            <div className="cw-periods cw-periods--hours">
              {COWORKING_PERIODS.map((p) => {
                const info = space?.periods.find((x) => x.id === p.id);
                const slotLeft = info?.left;
                const full = typeof slotLeft === 'number' && slotLeft <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cw-period cw-period--hour${period === p.id ? ' is-active' : ''}${full ? ' is-full' : ''}`}
                    aria-pressed={period === p.id}
                    onClick={() => setPeriod(p.id)}
                  >
                    <strong>
                      {p.start}–{p.end.slice(0, 5)}
                    </strong>
                    <em>
                      {typeof slotLeft === 'number'
                        ? slotLeft > 0
                          ? `${slotLeft}`
                          : 'нет'
                        : busy
                          ? '…'
                          : '—'}
                    </em>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cw-row">
            <label className="cw-field">
              <span>Мест</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={seatsDraft}
                aria-describedby="cw-seats-hint"
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setSeatsDraft(raw);
                  if (raw === '') return;
                  const n = Number(raw);
                  if (Number.isFinite(n) && n >= 1 && n <= seatsMax) setSeats(n);
                }}
                onBlur={() => commitSeatsDraft(seatsDraft)}
              />
              <span id="cw-seats-hint" className="cw-field-hint">
                от 1 до {seatsMax}
                {left > 0 ? ` · свободно ${left}` : ''}
              </span>
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
          {left > 0 || busy ? (
            <button
              type="button"
              className="btn btn-primary cw-cta"
              disabled={submitting || !spaceId || busy}
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
        {!busy && left > 0 ? (
          <p className="cw-left-note">
            Осталось {left} мест на {periodDef.start}–{periodDef.end}
          </p>
        ) : null}
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
