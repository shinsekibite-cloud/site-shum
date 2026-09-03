'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, Copy, Check, ExternalLink } from 'lucide-react';

type LinkInfo = {
  token: string;
  deepLink: string | null;
  startPayload: string;
};

export default function MessengerLinkPanel({
  telegramChatId,
  maxUserId,
  onSaved,
}: {
  telegramChatId?: string | null;
  maxUserId?: string | null;
  onSaved?: (patch: { telegramChatId?: string | null; maxUserId?: string | null }) => void;
}) {
  const [tg, setTg] = useState(telegramChatId || '');
  const [maxId, setMaxId] = useState(maxUserId || '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [links, setLinks] = useState<{ tg?: LinkInfo; max?: LinkInfo }>({});
  const [botNames, setBotNames] = useState<{ tg?: string | null; max?: string | null }>({});

  useEffect(() => {
    setTg(telegramChatId || '');
    setMaxId(maxUserId || '');
  }, [telegramChatId, maxUserId]);

  useEffect(() => {
    fetch('/api/user/messenger-link', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLinks(d.links || {});
        setBotNames({ tg: d.telegramBotUsername, max: d.maxBotUsername });
      })
      .catch(() => undefined);
  }, []);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success('Скопировано');
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: tg.replace(/\D/g, '') || null,
          maxUserId: maxId.replace(/\D/g, '') || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Не удалось сохранить');
      toast.success('Мессенджеры обновлены');
      onSaved?.({
        telegramChatId: json.user?.telegramChatId ?? (tg.replace(/\D/g, '') || null),
        maxUserId: json.user?.maxUserId ?? (maxId.replace(/\D/g, '') || null),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-section" aria-label="Мессенджеры">
      <h3 className="profile-section__title">
        <Bot size={14} aria-hidden /> MAX и Telegram
      </h3>
      <p className="profile-settings-hub__hint">
        Нажмите кнопку бота — защищённая одноразовая ссылка (около 20 мин). После привязки ссылка
        сгорает.
      </p>

      <div className="yp-bot-steps__actions" style={{ marginBottom: '0.85rem' }}>
        {links.tg?.deepLink ? (
          <a className="btn btn-primary" href={links.tg.deepLink} target="_blank" rel="noreferrer">
            Открыть Telegram {botNames.tg ? `@${botNames.tg}` : ''} <ExternalLink size={14} />
          </a>
        ) : (
          <span className="yp-bot-steps__muted">Telegram-бот пока недоступен</span>
        )}
        {links.max?.deepLink ? (
          <a className="btn btn-secondary" href={links.max.deepLink} target="_blank" rel="noreferrer">
            Открыть MAX <ExternalLink size={14} />
          </a>
        ) : null}
        {links.tg?.startPayload ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void copy(`/start ${links.tg!.startPayload}`, 'payload')}
          >
            {copied === 'payload' ? <Check size={14} /> : <Copy size={14} />} код /start
          </button>
        ) : null}
      </div>

      <ol className="yp-bot-steps">
        <li>Откройте бота по кнопке выше (или вставьте команду вручную).</li>
        <li>Бот подтвердит привязку — ID сохранится сам.</li>
        <li>Запасной вариант: вставьте числовой ID ниже.</li>
      </ol>

      <div className="profile-messenger-ids" style={{ marginTop: '0.85rem' }}>
        <label className="yp-field">
          <span>
            ID чата Telegram
            {telegramChatId ? <em className="yp-bot-linked"> · привязан</em> : null}
          </span>
          <input
            value={tg}
            onChange={(e) => setTg(e.target.value.replace(/[^\d]/g, '').slice(0, 20))}
            inputMode="numeric"
            placeholder="123456789"
            autoComplete="off"
          />
        </label>
        <label className="yp-field">
          <span>
            MAX ID пользователя
            {maxUserId ? <em className="yp-bot-linked"> · привязан</em> : null}
          </span>
          <input
            value={maxId}
            onChange={(e) => setMaxId(e.target.value.replace(/[^\d]/g, '').slice(0, 20))}
            inputMode="numeric"
            placeholder="13771314"
            autoComplete="off"
          />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Сохранить вручную
        </button>
      </div>
    </section>
  );
}
