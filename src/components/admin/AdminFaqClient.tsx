'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react';

type FaqItemRow = {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
};

type FaqCategoryRow = {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  published: boolean;
  items: FaqItemRow[];
};

export default function AdminFaqClient() {
  const [categories, setCategories] = useState<FaqCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [draftQ, setDraftQ] = useState<Record<string, { q: string; a: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/faq', { credentials: 'same-origin', cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.message || 'Не удалось загрузить FAQ');
        setCategories([]);
        return;
      }
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const api = async (method: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/faq', {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.message || 'Ошибка сохранения');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('Ошибка сети');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem', maxWidth: 960 }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>FAQ — категории и вопросы</h1>
        <p style={{ margin: '0.4rem 0 0', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
          Публичная страница <code>/faq</code> показывает только опубликованные записи. Пока в БД пусто — гостям
          виден встроенный справочник.
        </p>
      </header>

      {error ? (
        <p style={{ color: '#b91c1c', marginBottom: '1rem' }} role="alert">
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={newCatTitle}
          onChange={(e) => setNewCatTitle(e.target.value)}
          placeholder="Новая категория"
          className="settings-input"
          style={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !newCatTitle.trim()}
          onClick={() => {
            void api('POST', { kind: 'category', title: newCatTitle.trim() }).then((ok) => {
              if (ok) setNewCatTitle('');
            });
          }}
        >
          <Plus size={16} aria-hidden /> Добавить категорию
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || loading} onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Загрузка…</p> : null}

      {!loading && categories.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Категорий пока нет — создайте первую.</p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {categories.map((cat) => {
          const draft = draftQ[cat.id] || { q: '', a: '' };
          return (
            <section
              key={cat.id}
              style={{
                background: '#fff',
                border: '1px solid rgba(15,23,42,0.08)',
                borderRadius: 16,
                padding: '1rem 1.1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <input
                  type="text"
                  defaultValue={cat.title}
                  className="settings-input"
                  style={{ flex: '1 1 180px', fontWeight: 700 }}
                  onBlur={(e) => {
                    const title = e.target.value.trim();
                    if (title && title !== cat.title) void api('PATCH', { kind: 'category', id: cat.id, title });
                  }}
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  Порядок
                  <input
                    type="number"
                    defaultValue={cat.sortOrder}
                    className="settings-input"
                    style={{ width: 72, padding: '0.35rem 0.5rem' }}
                    onBlur={(e) => {
                      const sortOrder = Number(e.target.value);
                      if (Number.isFinite(sortOrder) && sortOrder !== cat.sortOrder) {
                        void api('PATCH', { kind: 'category', id: cat.id, sortOrder });
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  title={cat.published ? 'Скрыть' : 'Опубликовать'}
                  onClick={() => void api('PATCH', { kind: 'category', id: cat.id, published: !cat.published })}
                >
                  {cat.published ? <Eye size={16} /> : <EyeOff size={16} />}
                  {cat.published ? 'Опубликовано' : 'Скрыто'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Удалить категорию «${cat.title}» и все вопросы?`)) {
                      void api('DELETE', { kind: 'category', id: cat.id });
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                slug: <code>{cat.slug}</code>
              </p>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cat.items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      border: '1px solid rgba(15,23,42,0.06)',
                      borderRadius: 12,
                      padding: '0.75rem 0.85rem',
                      background: item.published ? '#f8fafc' : '#f1f5f9',
                    }}
                  >
                    <input
                      type="text"
                      defaultValue={item.question}
                      className="settings-input"
                      style={{ width: '100%', marginBottom: 8, fontWeight: 650 }}
                      onBlur={(e) => {
                        const question = e.target.value.trim();
                        if (question && question !== item.question) {
                          void api('PATCH', { kind: 'item', id: item.id, question });
                        }
                      }}
                    />
                    <textarea
                      defaultValue={item.answer}
                      className="settings-input"
                      rows={3}
                      style={{ width: '100%', marginBottom: 8, resize: 'vertical' }}
                      onBlur={(e) => {
                        const answer = e.target.value.trim();
                        if (answer && answer !== item.answer) {
                          void api('PATCH', { kind: 'item', id: item.id, answer });
                        }
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => void api('PATCH', { kind: 'item', id: item.id, published: !item.published })}
                      >
                        {item.published ? 'Опубликован' : 'Скрыт'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => {
                          if (confirm('Удалить вопрос?')) void api('DELETE', { kind: 'item', id: item.id });
                        }}
                      >
                        <Trash2 size={14} /> Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  value={draft.q}
                  onChange={(e) => setDraftQ((s) => ({ ...s, [cat.id]: { ...draft, q: e.target.value } }))}
                  placeholder="Новый вопрос"
                  className="settings-input"
                />
                <textarea
                  value={draft.a}
                  onChange={(e) => setDraftQ((s) => ({ ...s, [cat.id]: { ...draft, a: e.target.value } }))}
                  placeholder="Ответ"
                  rows={2}
                  className="settings-input"
                  style={{ resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !draft.q.trim() || !draft.a.trim()}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    void api('POST', {
                      kind: 'item',
                      categoryId: cat.id,
                      question: draft.q.trim(),
                      answer: draft.a.trim(),
                    }).then((ok) => {
                      if (ok) setDraftQ((s) => ({ ...s, [cat.id]: { q: '', a: '' } }));
                    });
                  }}
                >
                  <Save size={16} aria-hidden /> Добавить вопрос
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
