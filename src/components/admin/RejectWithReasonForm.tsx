'use client';

import { useState } from 'react';
import AdminPendingButton from '@/components/admin/AdminPendingButton';
import { X } from 'lucide-react';

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  /** Compact icon-only trigger (admin tables) vs labeled button */
  compact?: boolean;
};

/** Reject action with required reason/comment for the applicant. */
export default function RejectWithReasonForm({ action, id, compact = true }: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        title="Отклонить"
        onClick={() => setOpen(true)}
        style={
          compact
            ? { padding: '0.5rem', color: '#991b1b', backgroundColor: '#fee2e2' }
            : { color: '#991b1b', backgroundColor: '#fee2e2' }
        }
      >
        {compact ? <X size={16} /> : 'Отклонить'}
      </button>
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => setOpen(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        minWidth: compact ? 220 : '100%',
        maxWidth: 320,
        padding: '0.65rem',
        borderRadius: 10,
        border: '1px solid rgba(153,27,27,0.2)',
        background: '#fff5f5',
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="REJECTED" />
      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b' }}>
        Причина отказа
        <textarea
          name="rejectReason"
          required
          rows={3}
          placeholder="Кратко объясните, почему отклонено…"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 4,
            resize: 'vertical',
            fontSize: '0.85rem',
            borderRadius: 8,
            border: '1px solid rgba(15,23,42,0.12)',
            padding: '0.45rem 0.55rem',
          }}
        />
      </label>
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen(false)}
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.82rem' }}
        >
          Отмена
        </button>
        <AdminPendingButton
          className="btn btn-secondary"
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.82rem', color: '#fff', backgroundColor: '#b91c1c' }}
          pendingLabel="…"
        >
          Отклонить
        </AdminPendingButton>
      </div>
    </form>
  );
}
