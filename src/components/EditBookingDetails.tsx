'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X } from 'lucide-react';
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventContactMode,
  normalizeEventCategory,
  normalizeEventContactMode,
} from '@/lib/event-meta';

export type EditableBooking = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  contactMode?: string | null;
  contactPhone?: string | null;
  contactTelegram?: string | null;
  contactVk?: string | null;
  contactMax?: string | null;
  showOrganizerProfile?: boolean | null;
};

type Props = {
  booking: EditableBooking;
  compact?: boolean;
  iconOnly?: boolean;
  onSaved?: (booking: EditableBooking) => void;
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.65rem',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: '0.85rem',
  outline: 'none',
};

export default function EditBookingDetails({ booking, compact, iconOnly, onSaved }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState(booking.title || '');
  const [description, setDescription] = useState(booking.description || '');
  const [category, setCategory] = useState<EventCategory>(
    normalizeEventCategory(booking.category)
  );
  const [contactMode, setContactMode] = useState<EventContactMode>(
    normalizeEventContactMode(booking.contactMode)
  );
  const [showOrganizerProfile, setShowOrganizerProfile] = useState(
    booking.showOrganizerProfile !== false
  );
  const [contactPhone, setContactPhone] = useState(booking.contactPhone || '');
  const [contactTelegram, setContactTelegram] = useState(booking.contactTelegram || '');
  const [contactVk, setContactVk] = useState(booking.contactVk || '');
  const [contactMax, setContactMax] = useState(booking.contactMax || '');

  const resetFromBooking = () => {
    setTitle(booking.title || '');
    setDescription(booking.description || '');
    setCategory(normalizeEventCategory(booking.category));
    setContactMode(normalizeEventContactMode(booking.contactMode));
    setShowOrganizerProfile(booking.showOrganizerProfile !== false);
    setContactPhone(booking.contactPhone || '');
    setContactTelegram(booking.contactTelegram || '');
    setContactVk(booking.contactVk || '');
    setContactMax(booking.contactMax || '');
    setError('');
  };

  const openEditor = () => {
    resetFromBooking();
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/user/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category,
          contactMode,
          showOrganizerProfile,
          contactPhone,
          contactTelegram,
          contactVk,
          contactMax,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Не удалось сохранить');
        return;
      }
      onSaved?.(data.booking);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const editLabel = 'Анонс и контакты';

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className={
          iconOnly ? 'event-action-icon event-edit-icon' : compact ? 'event-card-edit-btn' : undefined
        }
        title={iconOnly || compact ? editLabel : undefined}
        aria-label={iconOnly ? editLabel : undefined}
        style={
          iconOnly || compact
            ? undefined
            : {
                marginTop: 10,
                border: '1px solid rgba(37,99,235,0.25)',
                background: 'rgba(37,99,235,0.06)',
                color: '#1d4ed8',
                borderRadius: 10,
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }
        }
      >
        <Pencil size={iconOnly ? 16 : 14} aria-hidden />
        {!iconOnly ? (compact ? 'Анонс' : editLabel) : null}
      </button>
    );
  }

  return (
    <div className="event-card-edit-panel">
      <div style={{ fontSize: '0.78rem', fontWeight: 750 }}>Редактирование анонса</div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название"
        maxLength={120}
        style={fieldStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Для чего / что будет (мин. 10 символов)"
        rows={3}
        maxLength={2000}
        style={{ ...fieldStyle, resize: 'vertical' }}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as EventCategory)}
        style={fieldStyle}
      >
        {EVENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showOrganizerProfile}
          onChange={(e) => setShowOrganizerProfile(e.target.checked)}
        />
        Показывать профиль на сайте
      </label>

      <div style={{ display: 'grid', gap: 4 }}>
        {(
          [
            { id: 'PROFILE' as const, label: 'Контакты из профиля' },
            { id: 'CUSTOM' as const, label: 'Свои контакты' },
            { id: 'HIDDEN' as const, label: 'Скрыть контакты' },
          ] as const
        ).map((opt) => (
          <label key={opt.id} style={{ display: 'flex', gap: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`contactMode-${booking.id}`}
              checked={contactMode === opt.id}
              onChange={() => setContactMode(opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {contactMode === 'CUSTOM' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Телефон" style={fieldStyle} />
          <input value={contactTelegram} onChange={(e) => setContactTelegram(e.target.value)} placeholder="Telegram" style={fieldStyle} />
          <input value={contactVk} onChange={(e) => setContactVk(e.target.value)} placeholder="VK" style={fieldStyle} />
          <input value={contactMax} onChange={(e) => setContactMax(e.target.value)} placeholder="MAX" style={fieldStyle} />
        </div>
      ) : null}

      {error ? (
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#b91c1c' }}>{error}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            border: 0,
            background: 'var(--primary, #2563eb)',
            color: '#fff',
            borderRadius: 8,
            padding: '0.4rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            opacity: busy ? 0.7 : 1,
          }}
        >
          <Check size={14} />
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
          disabled={busy}
          style={{
            border: '1px solid #e2e8f0',
            background: '#fff',
            color: '#475569',
            borderRadius: 8,
            padding: '0.4rem 0.7rem',
            fontSize: '0.8rem',
            fontWeight: 650,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <X size={14} />
          Отмена
        </button>
      </div>
    </div>
  );
}
