import Link from 'next/link';
import type { CSSProperties } from 'react';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { createPage, updatePage } from './actions';
import { isSystemPageSlug, publicPagePath } from '@/lib/system-pages';

type PageEditorFormProps = {
  mode: 'create' | 'edit';
  page?: {
    id: string;
    slug: string;
    title: string;
    content: string;
    images: string;
    menuPosition: string;
    template: string;
    status?: string | null;
    publishedAt?: Date | string | null;
  } | null;
  saved?: boolean;
  error?: boolean;
};

const MENU_OPTIONS = [
  { value: 'NONE', label: 'Скрыта (только по ссылке /p/…)' },
  { value: 'HEADER_MAIN', label: 'Главное меню (шапка)' },
  { value: 'HEADER_SUB', label: 'Подменю «Ещё» в шапке' },
  { value: 'FOOTER', label: 'Подвал сайта' },
];

const TEMPLATE_OPTIONS = [
  { value: 'DEFAULT', label: 'Обычная страница' },
  { value: 'HERO', label: 'Hero — обложка на всю ширину' },
  { value: 'GALLERY', label: 'Галерея' },
  { value: 'TEAM', label: 'Команда' },
  { value: 'FAQ', label: 'FAQ' },
];

export default function PageEditorForm({ mode, page, saved, error }: PageEditorFormProps) {
  const action = mode === 'edit' ? updatePage : createPage;
  const cover = page?.images && page.images !== '[]' ? page.images : '';
  const system = Boolean(page?.slug && isSystemPageSlug(page.slug));
  const publicPath = page?.slug ? publicPagePath(page.slug) : null;

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <Link href="/admin/pages" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            ← К списку страниц
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.35rem 0 0' }}>
            {mode === 'edit'
              ? page?.slug === 'privacy'
                ? 'Политика конфиденциальности'
                : 'Редактор страницы'
              : 'Новая страница'}
          </h1>
        </div>
        {publicPath && (
          <a href={publicPath} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Открыть на сайте
          </a>
        )}
      </div>

      {page?.slug === 'privacy' && (
        <div
          style={{
            padding: '0.9rem 1rem',
            background: 'rgba(37,99,235,0.08)',
            color: '#1e3a8a',
            borderRadius: 10,
            marginBottom: '1rem',
            fontSize: '0.92rem',
            lineHeight: 1.5,
          }}
        >
          Этот текст показывается на <strong>/privacy</strong> и попадает в скачиваемый подписанный документ.
          URL страницы зафиксирован.
        </div>
      )}

      {saved && (
        <div style={{ padding: '0.85rem 1rem', background: 'rgba(22,163,74,0.1)', color: '#15803d', borderRadius: 10, marginBottom: '1rem', fontWeight: 600 }}>
          Сохранено
        </div>
      )}
      {error && (
        <div style={{ padding: '0.85rem 1rem', background: 'rgba(220,38,38,0.1)', color: '#b91c1c', borderRadius: 10, marginBottom: '1rem', fontWeight: 600 }}>
          Не удалось сохранить. Проверьте поля и отсутствие мата в тексте.
        </div>
      )}

      <form action={action} className="glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {mode === 'edit' && page && <input type="hidden" name="id" value={page.id} />}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Заголовок</label>
            <input name="title" required defaultValue={page?.title || ''} style={inputStyle} placeholder="О нас" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>URL (slug)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {page?.slug === 'privacy' ? '/' : '/p/'}
              </span>
              {system ? (
                <>
                  <input type="hidden" name="slug" value={page!.slug} />
                  <input
                    value={page!.slug}
                    disabled
                    style={{ ...inputStyle, flex: 1, opacity: 0.75, cursor: 'not-allowed' }}
                  />
                </>
              ) : (
                <input name="slug" required defaultValue={page?.slug || ''} style={{ ...inputStyle, flex: 1 }} placeholder="about" />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Позиция в меню</label>
            <select name="menuPosition" defaultValue={page?.menuPosition || 'NONE'} style={inputStyle}>
              {MENU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Шаблон оформления</label>
            <select name="template" defaultValue={page?.template || 'DEFAULT'} style={inputStyle}>
              {TEMPLATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Статус</label>
            <select name="status" defaultValue={page?.status || 'PUBLISHED'} style={inputStyle}>
              <option value="PUBLISHED">Опубликовано</option>
              <option value="DRAFT">Черновик</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Дата публикации</label>
            <input
              type="datetime-local"
              name="publishedAt"
              defaultValue={page?.publishedAt ? new Date(page.publishedAt).toISOString().slice(0, 16) : ''}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.35rem 0 0' }}>
              Будущая дата = отложенный выход на сайт
            </p>
          </div>
        </div>

        {page?.slug !== 'privacy' && (
          <>
            <CoverImageField currentImage={cover || null} hiddenName="images" name="imageFile" label="Обложка" />
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '-0.5rem 0 0' }}>
              Для шаблона Hero обложка идёт на весь экран.
            </p>
          </>
        )}
        {page?.slug === 'privacy' && <input type="hidden" name="images" value={cover || ''} />}

        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Содержание</label>
          <RichTextInput name="content" defaultValue={page?.content || ''} />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.85rem 1.75rem', fontWeight: 700 }}>
            {mode === 'edit' ? 'Сохранить' : 'Создать страницу'}
          </button>
          <Link href="/admin/pages" className="btn btn-secondary" style={{ padding: '0.85rem 1.25rem' }}>
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.1)',
};
