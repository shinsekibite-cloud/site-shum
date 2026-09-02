'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import {
  STATS_PERIODS,
  statsRangeLabel,
  type StatsPeriod,
  type StatsRange,
} from '@/lib/stats-period';

type Props = {
  value: StatsRange;
  onChange: (range: StatsRange) => void;
  compact?: boolean;
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoWeekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

/** Period selector with optional custom date range. */
export default function PeriodPicker({ value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from || isoWeekAgo());
  const [draftTo, setDraftTo] = useState(value.to || isoToday());
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    setDraftFrom(value.from || isoWeekAgo());
    setDraftTo(value.to || isoToday());
  }, [value.from, value.to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (period: StatsPeriod) => {
    if (period === 'custom') {
      onChange({ period: 'custom', from: draftFrom, to: draftTo });
    } else {
      onChange({ period });
    }
    setOpen(false);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    onChange({ period: 'custom', from: draftFrom, to: draftTo });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="period-picker">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-secondary period-picker__trigger"
      >
        <CalendarRange size={compact ? 14 : 16} aria-hidden />
        {statsRangeLabel(value)}
        <ChevronDown size={14} style={{ opacity: 0.7 }} aria-hidden />
      </button>
      {open ? (
        <div id={listId} role="listbox" aria-label="Период" className="period-picker__panel">
          {STATS_PERIODS.filter((p) => p.id !== 'custom').map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={value.period === p.id}
              className={`period-picker__option${value.period === p.id ? ' is-active' : ''}`}
              onClick={() => pick(p.id)}
            >
              {value.period === p.id ? <Check size={14} aria-hidden /> : <span style={{ width: 14 }} />}
              {p.label}
            </button>
          ))}
          <div className="period-picker__custom">
            <div className="period-picker__custom-label">Свой диапазон</div>
            <div className="period-picker__custom-fields">
              <label>
                <span>С</span>
                <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
              </label>
              <label>
                <span>По</span>
                <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
              </label>
            </div>
            <button type="button" className="btn btn-primary period-picker__apply" onClick={applyCustom}>
              Применить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
