'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  value: string; // YYYY-MM-DD
  min?: string;
  onChange: (ymd: string) => void;
  label?: string;
};

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

function toYmd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatRu(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  });
}

/** Custom date field — no native Windows date picker chrome. */
export default function SvcDateField({ value, min, onChange, label = 'Дата' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { y: vy, m: vm } = parseYmd(value);
  const [viewY, setViewY] = useState(vy || new Date().getFullYear());
  const [viewM, setViewM] = useState(vm || new Date().getMonth() + 1);

  useEffect(() => {
    const { y, m } = parseYmd(value);
    if (y && m) {
      setViewY(y);
      setViewM(m);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(viewY, viewM - 1, 1);
    const startPad = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(viewY, viewM, 0).getDate();
    const out: Array<{ ymd: string; day: number; muted: boolean } | null> = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ ymd: toYmd(viewY, viewM, d), day: d, muted: false });
    }
    return out;
  }, [viewY, viewM]);

  const monthLabel = new Date(viewY, viewM - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });

  function shiftMonth(delta: number) {
    const d = new Date(viewY, viewM - 1 + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth() + 1);
  }

  function pick(ymd: string) {
    if (min && ymd < min) return;
    onChange(ymd);
    setOpen(false);
  }

  return (
    <div className="svc-date" ref={rootRef}>
      <span className="svc-date__label">{label}</span>
      <button type="button" className="svc-date__trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <CalendarDays size={18} aria-hidden />
        <span>{formatRu(value)}</span>
      </button>
      {open ? (
        <div className="svc-date__pop" role="dialog" aria-label="Выбор даты">
          <div className="svc-date__nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
              <ChevronLeft size={18} />
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="svc-date__dow" aria-hidden>
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="svc-date__grid">
            {cells.map((cell, i) =>
              cell ? (
                <button
                  key={cell.ymd}
                  type="button"
                  className={`svc-date__day${cell.ymd === value ? ' is-active' : ''}${
                    min && cell.ymd < min ? ' is-disabled' : ''
                  }`}
                  disabled={Boolean(min && cell.ymd < min)}
                  onClick={() => pick(cell.ymd)}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={`e-${i}`} />
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
