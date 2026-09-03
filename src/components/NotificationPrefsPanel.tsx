'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  NOTIFICATION_TYPE_OPTIONS,
  type NotificationTypeId,
} from '@/lib/notification-meta';

type Prefs = {
  muted: NotificationTypeId[];
  emailDigest: boolean;
  sound: boolean;
  push: boolean;
};

const DEFAULT: Prefs = { muted: [], emailDigest: false, sound: true, push: true };

export default function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/user/notification-prefs', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.prefs) setPrefs({ ...DEFAULT, ...d.prefs, muted: d.prefs.muted || [] });
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const mutedSet = useMemo(() => new Set(prefs.muted), [prefs.muted]);

  const save = async (next: Prefs) => {
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch('/api/user/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Не удалось сохранить');
      if (json.prefs) setPrefs({ ...DEFAULT, ...json.prefs });
      toast.success('Настройки уведомлений сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <section className="profile-section" aria-label="Уведомления">
      <h3 className="profile-section__title">Уведомления</h3>
      <p className="profile-settings-hub__hint">
        Категории сохраняются на сервере и скрываются в колокольчике на всех устройствах.
      </p>
      <div className="profile-choice-grid">
        {NOTIFICATION_TYPE_OPTIONS.map((opt) => {
          const on = !mutedSet.has(opt.id);
          return (
            <label key={opt.id} className={`profile-choice${on ? ' is-on-green' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                disabled={saving}
                onChange={() => {
                  const muted = on
                    ? [...prefs.muted, opt.id]
                    : prefs.muted.filter((x) => x !== opt.id);
                  void save({ ...prefs, muted });
                }}
              />
              <span>
                <strong>{opt.label}</strong>
                <span>{on ? 'Показывать' : 'Скрыто'}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="profile-choice-grid" style={{ marginTop: '0.85rem' }}>
        <label className={`profile-choice${prefs.push ? ' is-on-green' : ''}`}>
          <input
            type="checkbox"
            checked={prefs.push}
            disabled={saving}
            onChange={() => void save({ ...prefs, push: !prefs.push })}
          />
          <span>
            <strong>Пуш в браузере</strong>
            <span>Разрешить пуши браузера для этого аккаунта</span>
          </span>
        </label>
        <label className={`profile-choice${prefs.sound ? ' is-on-green' : ''}`}>
          <input
            type="checkbox"
            checked={prefs.sound}
            disabled={saving}
            onChange={() => void save({ ...prefs, sound: !prefs.sound })}
          />
          <span>
            <strong>Звук в колокольчике</strong>
            <span>Мягкий сигнал при непрочитанных</span>
          </span>
        </label>
      </div>
    </section>
  );
}
