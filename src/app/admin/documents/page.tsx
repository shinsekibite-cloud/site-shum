import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Trash2, Plus, Eye, FileText, Shield } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedDocument } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { parsePublishFields, publishLabel } from '@/lib/publish';
import DocumentFileField from '@/components/admin/DocumentFileField';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['Общее', 'Положения', 'Формы', 'Правила', 'Прочее'];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission('pages');
  const id = formData.get('id') as string;
  try {
    await prisma.siteDocument.delete({ where: { id } });
    revalidatePath('/admin/documents');
    revalidatePath('/documents');
  } catch (e) {
    console.error('document delete error', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission('pages');
  try {
    const title = ((formData.get('title') as string) || '').trim();
    const description = ((formData.get('description') as string) || '').trim();
    const category = ((formData.get('category') as string) || 'Общее').trim() || 'Общее';
    if (!title) return;
    assertCleanText(title, description, category);

    const file = formData.get('docFile') as File | null;
    const saved = await saveUploadedDocument(file, 'documents');
    if (!saved) {
      redirect('/admin/documents?error=file');
    }

    const { status, publishedAt } = parsePublishFields(formData);
    await prisma.siteDocument.create({
      data: {
        title,
        description: description || null,
        category,
        fileUrl: saved.url,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        status,
        publishedAt,
      },
    });
    revalidatePath('/admin/documents');
    revalidatePath('/documents');
    redirect('/admin/documents?saved=1');
  } catch (e) {
    if (e instanceof ProfanityError) return;
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    console.error('document create error', e);
    redirect('/admin/documents?error=1');
  }
}

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePermissionPage('pages');
  const sp = await searchParams;
  const items = await prisma.siteDocument.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Документы</h1>
          <p style={{ color: 'var(--muted)', margin: '0.35rem 0 0' }}>
            Загрузка PDF и файлов с просмотром на сайте —{' '}
            <a href="/documents" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
              /documents
            </a>
            . Текст политики конфиденциальности редактируется в{' '}
            <Link href="/admin/pages" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Страницах
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/pages"
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Shield size={16} /> Политика и страницы
        </Link>
      </div>

      {sp.saved === '1' && (
        <div style={{ padding: '0.85rem 1rem', background: 'rgba(22,163,74,0.1)', color: '#15803d', borderRadius: 10, marginBottom: '1rem', fontWeight: 600 }}>
          Документ сохранён
        </div>
      )}
      {sp.error && (
        <div style={{ padding: '0.85rem 1rem', background: 'rgba(220,38,38,0.1)', color: '#b91c1c', borderRadius: 10, marginBottom: '1rem', fontWeight: 600 }}>
          {sp.error === 'file' ? 'Прикрепите файл (PDF / изображение / TXT)' : 'Не удалось сохранить документ'}
        </div>
      )}

      <form
        action={createItem}
        encType="multipart/form-data"
        className="glass"
        style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} /> Добавить документ
          </h2>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>Название *</label>
          <input name="title" required placeholder="Положение о бронировании" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>Категория</label>
          <select name="category" defaultValue="Положения" style={inputStyle}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>Статус</label>
          <select name="status" defaultValue="PUBLISHED" style={inputStyle}>
            <option value="PUBLISHED">Опубликован</option>
            <option value="DRAFT">Черновик</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>Описание</label>
          <textarea name="description" rows={2} placeholder="Кратко, о чём документ" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <DocumentFileField name="docFile" label="Файл" required />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" className="btn btn-primary">
            Загрузить
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', background: 'white', borderRadius: 12 }}>
            Документов пока нет — загрузите первый файл выше.
          </div>
        )}
        {items.map((doc) => (
          <div
            key={doc.id}
            style={{
              background: 'white',
              borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.06)',
              padding: '1rem 1.15rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: 'rgba(59,130,246,0.1)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={22} />
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{doc.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 2 }}>
                {doc.category} · {doc.fileName} · {formatSize(doc.sizeBytes)} · {publishLabel(doc.status)}
              </div>
              {doc.description && (
                <div style={{ fontSize: '0.9rem', color: '#475569', marginTop: 4 }}>{doc.description}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href={`/documents/${doc.id}`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Eye size={16} /> Смотреть
              </Link>
              <form action={deleteItem}>
                <input type="hidden" name="id" value={doc.id} />
                <button type="submit" className="btn btn-secondary" style={{ color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={16} /> Удалить
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: 8,
  border: '1.5px solid #e2e8f0',
  background: '#f8fafc',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
};
