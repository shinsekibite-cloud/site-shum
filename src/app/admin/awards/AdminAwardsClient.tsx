'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Download, Eye, FileText, Loader2, Search } from 'lucide-react';
import { OFFICIAL_DOC_TYPE_META, type OfficialDocType } from '@/lib/official-documents-shared';

type UserHit = { id: string; name: string | null; email: string };
type DocRow = {
  id: string;
  type: OfficialDocType;
  title: string;
  serialNumber: string;
  issuedAt: string;
  pdfPath: string | null;
  user: UserHit;
};

const TYPES = Object.keys(OFFICIAL_DOC_TYPE_META) as OfficialDocType[];

export default function AdminAwardsClient() {
  const [items, setItems] = useState<DocRow[]>([]);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    userId: '',
    type: 'CERTIFICATE' as OfficialDocType,
    title: '',
    subtitle: '',
    body: '',
    recipientName: '',
    issuerName: '',
    linkToPortfolio: true,
  });

  const load = () => {
    fetch('/api/admin/awards')
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setUsers([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`)
        .then(async (r) => {
          if (!r.ok) {
            // fallback: users list lite
            return fetch(`/api/admin/users?q=${encodeURIComponent(q.trim())}`).then((x) => x.json());
          }
          return r.json();
        })
        .then((d) => {
          const list = d.users || d.items || d || [];
          setUsers(Array.isArray(list) ? list.slice(0, 8) : []);
        })
        .catch(() => setUsers([]));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId || !form.title.trim()) {
      setMsg('Выберите пользователя и укажите название');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setMsg(`Выдано: ${data.document.serialNumber}`);
      setForm((f) => ({ ...f, title: '', subtitle: '', body: '', recipientName: '' }));
      load();
    } catch (err: any) {
      setMsg(err?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={22} /> Награды и документы
        </h1>
        <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Дипломы, сертификаты, благодарности и почётные грамоты — PDF на сайте и в портфолио участника.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="yp-award-card"
        style={{ display: 'grid', gap: '0.75rem', maxWidth: 720 }}
      >
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Участник</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по имени или email"
              className="settings-input"
              style={{ flex: 1 }}
            />
          </div>
          {users.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      userId: u.id,
                      recipientName: u.name || '',
                    }));
                    setQ(u.name || u.email);
                    setUsers([]);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.45rem 0.6rem',
                    borderRadius: 8,
                    border: form.userId === u.id ? '1px solid #0f766e' : '1px solid rgba(15,23,42,0.08)',
                    background: form.userId === u.id ? 'rgba(15,118,110,0.08)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <strong>{u.name || 'Без имени'}</strong>
                  <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: '0.82rem' }}>{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {form.userId ? (
            <span style={{ fontSize: '0.78rem', color: '#0f766e' }}>Выбран ID: {form.userId}</span>
          ) : null}
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Тип</span>
          <select
            className="settings-input"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as OfficialDocType }))}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {OFFICIAL_DOC_TYPE_META[t].label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Название / за что</span>
          <input
            className="settings-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="За победу в конкурсе «…»"
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Подзаголовок</span>
          <input
            className="settings-input"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Сезон 2026 · номинация"
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Текст на бланке</span>
          <textarea
            className="settings-input"
            rows={3}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="За активное участие в жизни портала и вклад в сообщество"
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>ФИО на бланке</span>
            <input
              className="settings-input"
              value={form.recipientName}
              onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
              placeholder="Как в документе"
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Кто подписывает</span>
            <input
              className="settings-input"
              value={form.issuerName}
              onChange={(e) => setForm((f) => ({ ...f, issuerName: e.target.value }))}
              placeholder="По умолчанию — название сайта"
            />
          </label>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={form.linkToPortfolio}
            onChange={(e) => setForm((f) => ({ ...f, linkToPortfolio: e.target.checked }))}
          />
          Добавить в портфолио (сертификаты)
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : null}
            {busy ? ' Формируем PDF…' : 'Выдать документ'}
          </button>
          {msg ? <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{msg}</span> : null}
        </div>
      </form>

      <section>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>Недавно выданные</h2>
        {items.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Пока нет документов.</p>
        ) : (
          <div className="yp-award-grid">
            {items.map((d) => (
              <article key={d.id} className="yp-award-card">
                <div className="yp-award-card__type">{OFFICIAL_DOC_TYPE_META[d.type]?.label || d.type}</div>
                <strong>{d.title}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {d.user.name || d.user.email} · {d.serialNumber}
                </div>
                <div className="yp-award-actions">
                  <Link href={`/awards/${d.id}`} className="btn btn-secondary btn-sm">
                    <Eye size={14} /> Смотреть
                  </Link>
                  <a href={`/api/awards/${d.id}/pdf`} className="btn btn-primary btn-sm" target="_blank" rel="noreferrer">
                    <Download size={14} /> PDF
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
