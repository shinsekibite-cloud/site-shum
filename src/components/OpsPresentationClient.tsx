'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DeckSlug, PresentationDeck, PresentationSlide } from '@/lib/presentation-types';

const EMPTY_SLIDE = (): PresentationSlide => ({
  id: `slide-${Date.now()}`,
  kicker: '',
  title: 'Новый слайд',
  lead: '',
  bullets: [],
  cards: [],
  image: '',
  footer: '',
});

const SITE_SHOT_PATHS = [
  { label: 'Главная', path: '/' },
  { label: 'О нас', path: '/p/about' },
  { label: 'Проекты', path: '/projects' },
  { label: 'Клубы', path: '/clubs' },
  { label: 'Пространства', path: '/spaces' },
  { label: 'Афиша', path: '/events' },
  { label: 'Гранты', path: '/grants' },
  { label: 'Добро', path: '/dobro' },
  { label: 'Самоуправление', path: '/self-gov' },
  { label: 'Новости', path: '/news' },
  { label: 'Документы', path: '/documents' },
  { label: 'Контакты', path: '/contacts' },
  { label: 'Профиль', path: '/dashboard' },
  { label: 'Админка', path: '/admin' },
  { label: 'Система', path: '/admin/system' },
];

export default function OpsPresentationClient() {
  const [slug, setSlug] = useState<DeckSlug>('necessary');
  const [deck, setDeck] = useState<PresentationDeck | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (s: DeckSlug) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/ops/presentation?deck=${s}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'load failed');
      setDeck(data.deck);
      setIdx(0);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(slug);
  }, [slug, load]);

  const slide = deck?.slides[idx];

  const patchSlide = (patch: Partial<PresentationSlide>) => {
    if (!deck || !slide) return;
    const slides = deck.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setDeck({ ...deck, slides });
  };

  const save = async () => {
    if (!deck) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/ops/presentation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'save failed');
      setDeck(data.deck);
      setMsg('Сохранено');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm('Сбросить к шаблону по умолчанию?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ops/presentation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'reset failed');
      setDeck(data.deck);
      setIdx(0);
      setMsg('Сброшено к шаблону');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!deck) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('deck', slug);
      fd.set('file', file);
      const res = await fetch('/api/ops/presentation', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'upload failed');
      patchSlide({ image: data.url });
      setMsg(`Скрин загружен: ${data.url}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  };

  if (!deck) {
    return <p style={{ color: 'var(--muted)' }}>{busy ? 'Загрузка…' : msg || 'Нет данных'}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="ops-pres__toolbar">
        <label style={{ fontWeight: 700 }}>
          Версия{' '}
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value as DeckSlug)}
            style={{ marginLeft: 6, padding: '0.4rem 0.6rem', borderRadius: 8 }}
          >
            <option value="necessary">Необходимый</option>
            <option value="full">Полный функционал</option>
          </select>
        </label>
        <Link className="btn btn-secondary" href={`/presentation/view/${slug}`} target="_blank">
          Открыть слайды
        </Link>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Сохранить
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void reset()}>
          Сбросить шаблон
        </button>
        <Link href="/" className="btn btn-secondary">
          На сайт
        </Link>
      </div>

      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
        Редактор слайдов: заголовки, текст, карточки, скриншоты. Модуль «Презентация» на вкладке «Модули»
        включает/выключает раздел на сайте. Чтобы сделать скрин: откройте страницу сайта → сделайте снимок
        экрана → загрузите сюда (или укажите URL картинки).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SITE_SHOT_PATHS.map((p) => (
          <a
            key={p.path}
            href={p.path}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            {p.label}
          </a>
        ))}
      </div>

      <div className="ops-pres">
      <aside className="ops-pres__slides" aria-label="Слайды">
        {deck.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ops-pres__slide-btn${i === idx ? ' is-on' : ''}`}
            onClick={() => setIdx(i)}
          >
            <small>Слайд {i + 1}</small>
            <strong>{s.title || 'Без названия'}</strong>
          </button>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDeck({ ...deck, slides: [...deck.slides, EMPTY_SLIDE()] });
            setIdx(deck.slides.length);
          }}
        >
          + Слайд
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={deck.slides.length < 2}
          onClick={() => {
            const slides = deck.slides.filter((_, i) => i !== idx);
            setDeck({ ...deck, slides });
            setIdx(Math.max(0, idx - 1));
          }}
        >
          Удалить
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={idx === 0}
          onClick={() => {
            const slides = [...deck.slides];
            [slides[idx - 1], slides[idx]] = [slides[idx], slides[idx - 1]];
            setDeck({ ...deck, slides });
            setIdx(idx - 1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={idx >= deck.slides.length - 1}
          onClick={() => {
            const slides = [...deck.slides];
            [slides[idx + 1], slides[idx]] = [slides[idx], slides[idx + 1]];
            setDeck({ ...deck, slides });
            setIdx(idx + 1);
          }}
        >
          ↓
        </button>
        </div>
      </aside>

      {slide ? (
        <div
          style={{
            display: 'grid',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: 14,
            border: '1px solid rgba(0,0,0,0.08)',
            background: '#fff',
          }}
        >
          <label>
            Заголовок версии
            <input
              value={deck.title}
              onChange={(e) => setDeck({ ...deck, title: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Kicker
            <input
              value={slide.kicker || ''}
              onChange={(e) => patchSlide({ kicker: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Заголовок слайда
            <input
              value={slide.title}
              onChange={(e) => patchSlide({ title: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Текст
            <textarea
              value={slide.lead || ''}
              onChange={(e) => patchSlide({ lead: e.target.value })}
              rows={3}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Пункты (каждый с новой строки)
            <textarea
              value={(slide.bullets || []).join('\n')}
              onChange={(e) =>
                patchSlide({
                  bullets: e.target.value
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              rows={4}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Карточки (строка: Заголовок | текст)
            <textarea
              value={(slide.cards || []).map((c) => `${c.title} | ${c.text}`).join('\n')}
              onChange={(e) =>
                patchSlide({
                  cards: e.target.value
                    .split('\n')
                    .map((line) => {
                      const [title, ...rest] = line.split('|');
                      return { title: (title || '').trim(), text: rest.join('|').trim() };
                    })
                    .filter((c) => c.title),
                })
              }
              rows={5}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label>
            Скрин / URL картинки
            <input
              value={slide.image || ''}
              onChange={(e) => patchSlide({ image: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
          <label className="btn btn-secondary" style={{ display: 'inline-flex', width: 'fit-content', cursor: 'pointer' }}>
            Загрузить скрин
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
          </label>
          {slide.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.image}
              alt=""
              style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }}
            />
          ) : null}
          <label>
            Подпись футера
            <input
              value={slide.footer || ''}
              onChange={(e) => patchSlide({ footer: e.target.value })}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '0.5rem', borderRadius: 8 }}
            />
          </label>
        </div>
      ) : null}
      </div>

      {msg ? <p style={{ margin: 0, fontWeight: 700, color: 'var(--primary)' }}>{msg}</p> : null}
    </div>
  );
}
