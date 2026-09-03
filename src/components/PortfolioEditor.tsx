'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Upload } from 'lucide-react';
import {
  ACHIEVEMENTS,
  CATEGORY_META,
  groupByAchievementCategory,
  TIER_META,
} from '@/lib/achievements';
import { PORTFOLIO_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type Section = { title: string; body: string; type: string };
type Cert = {
  title: string;
  issuer?: string | null;
  issuedAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

type Portfolio = {
  id: string;
  userId: string;
  headline: string | null;
  summary: string | null;
  coverImage: string | null;
  status: string;
  rejectReason: string | null;
  sections: Section[];
  certificates: Cert[];
  achievementLinks: { code: string }[];
  user?: { name?: string | null; image?: string | null };
};


export default function PortfolioEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [achQuery, setAchQuery] = useState('');
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [sections, setSections] = useState<Section[]>([{ title: 'О себе', body: '', type: 'ABOUT' }]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [achCodes, setAchCodes] = useState<string[]>([]);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [nextSubmitAt, setNextSubmitAt] = useState<string | null>(null);
  const [canSubmitNow, setCanSubmitNow] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/user/portfolio');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    const p = data.portfolio as Portfolio;
    setPortfolio(p);
    setUnlocked(data.unlockedAchievementCodes || []);
    setCooldownDays(typeof data.cooldownDays === 'number' ? data.cooldownDays : 7);
    setNextSubmitAt(data.nextSubmitAt || null);
    setCanSubmitNow(data.canSubmitNow !== false);
    setHeadline(p.headline || '');
    setSummary(p.summary || '');
    setCoverImage(p.coverImage || '');
    setSections(
      p.sections?.length
        ? p.sections.map((s) => ({ title: s.title, body: s.body, type: s.type || 'CUSTOM' }))
        : [{ title: 'О себе', body: '', type: 'ABOUT' }]
    );
    setCerts(
      (p.certificates || []).map((c) => ({
        title: c.title,
        issuer: c.issuer,
        issuedAt: c.issuedAt ? String(c.issuedAt).slice(0, 10) : '',
        fileUrl: c.fileUrl,
        fileName: c.fileName,
        mimeType: c.mimeType,
      }))
    );
    setAchCodes((p.achievementLinks || []).map((a) => a.code));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [load]);

  const unlockedFiltered = useMemo(() => {
    const q = achQuery.trim().toLowerCase();
    const matched = unlocked.filter((code) => {
      if (!q) return true;
      const def = ACHIEVEMENTS.find((a) => a.code === code);
      if (!def) return code.toLowerCase().includes(q);
      return (
        def.title.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q)
      );
    });
    return groupByAchievementCategory(matched.map((code) => ({ code })));
  }, [unlocked, achQuery]);

  const save = async (submit: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: headline.trim() || null,
          summary: summary.trim() || null,
          coverImage: coverImage || null,
          sections,
          certificates: certs,
          achievementCodes: achCodes,
          submit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось сохранить');
      setPortfolio(data.portfolio);
      if (typeof data.cooldownDays === 'number') setCooldownDays(data.cooldownDays);
      if (data.nextSubmitAt !== undefined) setNextSubmitAt(data.nextSubmitAt || null);
      if (data.canSubmitNow !== undefined) setCanSubmitNow(Boolean(data.canSubmitNow));
      toast.success(submit ? 'Отправлено на проверку' : 'Сохранено');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const submitBlocked =
    portfolio?.status === 'PENDING' ||
    !canSubmitNow ||
    (Boolean(nextSubmitAt) && new Date(nextSubmitAt!).getTime() > Date.now());

  const upload = async (file: File, kind: 'cover' | 'certificate') => {
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('file', file);
    const res = await fetch('/api/user/portfolio/upload', { method: 'POST', body: fd });
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 413) {
      throw new Error('Файл слишком большой для сервера. Выберите фото меньше 15 МБ.');
    }
    if (!contentType.includes('application/json')) {
      throw new Error(
        res.ok
          ? 'Некорректный ответ сервера'
          : `Ошибка загрузки (${res.status}). Попробуйте JPEG/PNG поменьше.`
      );
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка загрузки');
    return data as { url: string; fileName?: string; mimeType?: string };
  };

  if (loading) return <div style={{ padding: '1rem', color: 'var(--muted)' }}>Загрузка портфолио…</div>;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        style={{
          padding: '1rem 1.1rem',
          borderRadius: 14,
          border: '1px solid rgba(15,23,42,0.08)',
          background: 'rgba(248,250,252,0.95)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.05rem' }}>Моё портфолио</strong>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
              Статус: {statusRu(PORTFOLIO_STATUS_RU, portfolio?.status || 'DRAFT')}
              {portfolio?.status === 'REJECTED' && portfolio.rejectReason
                ? ` — ${portfolio.rejectReason}`
                : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {portfolio?.status === 'APPROVED' && portfolio.userId ? (
              <>
                <Link href={`/portfolio/${portfolio.userId}`} className="btn btn-secondary" style={{ padding: '0.45rem 0.8rem' }}>
                  Открыть
                </Link>
                <a
                  href={`/api/portfolio/${portfolio.userId}/download?mode=download`}
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.8rem' }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Скачать
                </a>
                <a
                  href={`/api/portfolio/${portfolio.userId}/download?mode=print`}
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 0.8rem' }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Печать
                </a>
              </>
            ) : null}
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save(false)}>
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || submitBlocked}
              onClick={() => void save(true)}
              title={
                portfolio?.status === 'PENDING'
                  ? 'Уже на проверке'
                  : submitBlocked && nextSubmitAt
                    ? `Доступно с ${new Date(nextSubmitAt).toLocaleString('ru-RU')}`
                    : undefined
              }
            >
              На проверку
            </button>
          </div>
        </div>
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.45 }}>
          Современное портфолио: краткий заголовок, рассказ о себе, блоки опыта, грамоты и достижения портала.
          После одобрения модератором его можно скачать с электронной подписью сайта.
        </p>
        {cooldownDays > 0 ? (
          <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: submitBlocked && nextSubmitAt ? '#92400e' : 'var(--muted)' }}>
            Отправка на проверку — не чаще 1 раза в {cooldownDays}{' '}
            {cooldownDays === 1 ? 'день' : cooldownDays < 5 ? 'дня' : 'дней'}
            {submitBlocked && nextSubmitAt && portfolio?.status !== 'PENDING'
              ? ` · следующая с ${new Date(nextSubmitAt).toLocaleString('ru-RU')}`
              : ''}
            .
          </p>
        ) : null}
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>Заголовок</span>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Куратор проектов · волонтёр · медиа"
          className="modern-input"
          style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid #e2e8f0' }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 650, fontSize: '0.85rem' }}>О себе</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="Коротко расскажите, чем занимаетесь и чем гордитесь"
          style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid #e2e8f0', resize: 'vertical' }}
        />
      </label>

      <div>
        <div style={{ fontWeight: 650, fontSize: '0.85rem', marginBottom: 6 }}>Обложка</div>
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }} />
        ) : null}
        <label className="btn btn-secondary" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <Upload size={16} /> Загрузить
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            hidden
            onChange={async (e) => {
              const input = e.target;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              try {
                toast.loading('Оптимизируем и загружаем…', { id: 'portfolio-cover' });
                const data = await upload(file, 'cover');
                setCoverImage(data.url);
                toast.success('Обложка загружена (сжата для сайта)', { id: 'portfolio-cover' });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Ошибка', { id: 'portfolio-cover' });
              }
            }}
          />
        </label>
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          JPEG, PNG, WebP или GIF · до 15 МБ · автоматически сожмём в WebP без потери качества на экране
        </p>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Разделы</strong>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}
            onClick={() => setSections((s) => [...s, { title: 'Новый раздел', body: '', type: 'CUSTOM' }])}
          >
            <Plus size={14} /> Добавить
          </button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {sections.map((s, idx) => (
            <div key={idx} style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={s.title}
                  onChange={(e) =>
                    setSections((rows) => rows.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)))
                  }
                  style={{ flex: 1, padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <button
                  type="button"
                  aria-label="Удалить"
                  onClick={() => setSections((rows) => rows.filter((_, i) => i !== idx))}
                  style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <textarea
                value={s.body}
                onChange={(e) =>
                  setSections((rows) => rows.map((r, i) => (i === idx ? { ...r, body: e.target.value } : r)))
                }
                rows={3}
                style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Грамоты, сертификаты, дипломы</strong>
          <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Можно загрузить свой файл или получить официальный документ от администрации —
            см. раздел <a href="/dashboard/awards">Мои награды</a> (PDF на сайте).
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem' }}
            onClick={() => setCerts((c) => [...c, { title: '', issuer: '', issuedAt: '' }])}
          >
            <Plus size={14} /> Добавить
          </button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {certs.map((c, idx) => (
            <div key={idx} style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 8 }}>
              <input
                placeholder="Название"
                value={c.title}
                onChange={(e) => setCerts((rows) => rows.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)))}
                style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  placeholder="Кем выдано"
                  value={c.issuer || ''}
                  onChange={(e) => setCerts((rows) => rows.map((r, i) => (i === idx ? { ...r, issuer: e.target.value } : r)))}
                  style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <input
                  type="date"
                  value={c.issuedAt || ''}
                  onChange={(e) => setCerts((rows) => rows.map((r, i) => (i === idx ? { ...r, issuedAt: e.target.value } : r)))}
                  style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', cursor: 'pointer' }}>
                  Файл
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    hidden
                    onChange={async (e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      input.value = '';
                      if (!file) return;
                      try {
                        toast.loading('Загружаем…', { id: 'portfolio-cert' });
                        const data = await upload(file, 'certificate');
                        setCerts((rows) =>
                          rows.map((r, i) =>
                            i === idx
                              ? { ...r, fileUrl: data.url, fileName: data.fileName, mimeType: data.mimeType }
                              : r
                          )
                        );
                        toast.success('Файл прикреплён', { id: 'portfolio-cert' });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Ошибка', { id: 'portfolio-cert' });
                      }
                    }}
                  />
                </label>
                {c.fileUrl ? <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{c.fileName || 'файл'}</span> : null}
                <button
                  type="button"
                  onClick={() => setCerts((rows) => rows.filter((_, i) => i !== idx))}
                  style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="portfolio-editor-achs">
        <div className="portfolio-editor-achs__head">
          <strong>Достижения портала</strong>
          <span>
            Выбрано {achCodes.length}
            {unlocked.length ? ` · доступно ${unlocked.length}` : ''}
          </span>
        </div>
        {unlocked.length === 0 ? (
          <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Пока нет открытых ачивок</span>
        ) : (
          <>
            <label className="ach-search portfolio-editor-achs__search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                value={achQuery}
                onChange={(e) => setAchQuery(e.target.value)}
                placeholder="Поиск по достижениям…"
                aria-label="Поиск достижений для портфолио"
              />
            </label>
            <div className="portfolio-editor-achs__groups">
              {unlockedFiltered.length === 0 ? (
                <p className="ach-empty" style={{ margin: 0 }}>
                  Ничего не найдено
                </p>
              ) : (
                unlockedFiltered.map((group) => (
                  <div key={group.category} className="portfolio-editor-achs__group">
                    <h4>
                      {CATEGORY_META[group.category].label}
                      <em>{group.items.length}</em>
                    </h4>
                    <div className="portfolio-editor-achs__chips">
                      {group.items.map(({ code }) => {
                        const def = ACHIEVEMENTS.find((a) => a.code === code);
                        const on = achCodes.includes(code);
                        const tier = def ? TIER_META[def.tier] : TIER_META.bronze;
                        return (
                          <button
                            key={code}
                            type="button"
                            className={`portfolio-editor-ach${on ? ' is-on' : ''}`}
                            title={def?.description || code}
                            onClick={() =>
                              setAchCodes((curr) =>
                                curr.includes(code) ? curr.filter((c) => c !== code) : [...curr, code]
                              )
                            }
                            style={
                              on
                                ? {
                                    borderColor: `${tier.color}55`,
                                    background: tier.bg,
                                    color: tier.color,
                                  }
                                : undefined
                            }
                          >
                            {def?.title || code}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {portfolio?.status === 'APPROVED' && portfolio.userId ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/portfolio/${portfolio.userId}`} className="btn btn-secondary">
            Публичная страница
          </Link>
          <a
            href={`/api/portfolio/${portfolio.userId}/download?mode=download`}
            className="btn btn-primary"
            target="_blank"
            rel="noreferrer"
          >
            Скачать файл
          </a>
          <a
            href={`/api/portfolio/${portfolio.userId}/download?mode=print`}
            className="btn btn-secondary"
            target="_blank"
            rel="noreferrer"
          >
            Печать
          </a>
        </div>
      ) : null}
    </div>
  );
}
