import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Trash2, Plus } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { parsePublishFields, publishLabel } from '@/lib/publish';
import CoverImageField from '@/components/admin/CoverImageField';
import { normalizeVkVideoEmbed } from '@/lib/vk-media';

function resolveVideoEmbed(formData: FormData): string | null {
  const raw = String(formData.get('videoEmbedUrl') || '').trim();
  if (!raw) return null;
  const normalized = normalizeVkVideoEmbed(raw);
  if (normalized) return normalized;
  // Accept plain wall/video page links: video-123_456 or z=video-123_456
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'vk.com' && host !== 'vk.ru') return null;
    const fromPath = u.pathname.match(/\/video(-?\d+)_(\d+)/);
    const fromQuery = (u.searchParams.get('z') || '').match(/video(-?\d+)_(\d+)/);
    const m = fromPath || fromQuery;
    if (m) {
      return normalizeVkVideoEmbed(`https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`);
    }
  } catch {
    return null;
  }
  return null;
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission(['news', 'pages']);
  const id = formData.get('id') as string;
  try {
    await prisma.news.delete({ where: { id } });
    revalidatePath('/admin/news');
    revalidatePath('/news');
  } catch (e) {
    console.error('news delete error', e);
  }
}

async function resolveNewsImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  // CoverImageField hiddenName="imageUrl"; empty string clears the cover.
  const existing = (formData.get('imageUrl') as string) || '';
  return saveUploadedImage(file, 'news', existing.trim());
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission(['news', 'pages']);
  try {
    const title = (formData.get('title') as string) || '';
    const text = (formData.get('text') as string) || '';
    if (!text.trim()) return;
    assertCleanText(title, text);
    const imageUrl = (await resolveNewsImage(formData)) || null;
    const videoEmbedUrl = resolveVideoEmbed(formData);
    const { status, publishedAt } = parsePublishFields(formData);
    await prisma.news.create({
      data: {
        title: title.trim() || null,
        text: text.trim(),
        imageUrl,
        videoEmbedUrl,
        status,
        publishedAt,
      },
    });
    revalidatePath('/admin/news');
    revalidatePath('/news');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('news create error', e);
  }
  redirect('/admin/news');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission(['news', 'pages']);
  const id = formData.get('id') as string;
  try {
    const title = (formData.get('title') as string) || '';
    const text = (formData.get('text') as string) || '';
    assertCleanText(title, text);
    const imageUrl = (await resolveNewsImage(formData)) || null;
    const videoEmbedUrl = resolveVideoEmbed(formData);
    const { status, publishedAt } = parsePublishFields(formData);
    await prisma.news.update({
      where: { id },
      data: {
        title: title.trim() || null,
        text: text.trim(),
        imageUrl,
        videoEmbedUrl,
        status,
        publishedAt,
      },
    });
    revalidatePath('/admin/news');
    revalidatePath('/news');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('news update error', e);
  }
  redirect('/admin/news');
}

export default async function AdminNews({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; add?: string }>;
}) {
  await requirePermissionPage(['news', 'pages']);
  const params = await searchParams;
  let items: any[] = [];
  try {
    items = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } });
  } catch {
    items = [];
  }

  const editId = params.edit;
  const editing = editId ? items.find((n) => n.id === editId) : null;
  const showForm = params.add === '1' || !!editing;

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1>Новости</h1>
          <p>Публикации на сайте</p>
        </div>
        {!showForm && (
          <Link href="/admin/news?add=1" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> Добавить
          </Link>
        )}
      </div>

      {showForm && (
        <form action={editing ? updateItem : createItem} className="glass" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Заголовок</label>
            <input name="title" defaultValue={editing?.title || ''} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }} placeholder="Title" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Текст *</label>
            <textarea name="text" required defaultValue={editing?.text || ''} rows={6} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: 'inherit' }} />
          </div>
          <CoverImageField
            currentImage={editing?.imageUrl || null}
            hiddenName="imageUrl"
            name="imageFile"
            label="Обложка"
          />
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Видео VK (embed)</label>
            <input
              name="videoEmbedUrl"
              defaultValue={editing?.videoEmbedUrl || ''}
              placeholder="https://vk.com/video_ext.php?oid=…&id=…"
              style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.35rem 0 0' }}>
              Только ссылка плеера <code>vk.com/video_ext.php</code>. Пусто — без видео. При синке из VK заполняется автоматически.
            </p>
          </div>
          <div className="admin-form-grid admin-form-grid--2">
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Статус</label>
              <select name="status" defaultValue={editing?.status || 'PUBLISHED'} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <option value="PUBLISHED">Опубликовано</option>
                <option value="DRAFT">Черновик</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Дата публикации</label>
              <input
                type="datetime-local"
                name="publishedAt"
                defaultValue={
                  editing?.publishedAt
                    ? new Date(editing.publishedAt).toISOString().slice(0, 16)
                    : ''
                }
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.35rem 0 0' }}>Пусто = сразу. Будущая дата = отложенная публикация.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary">{editing ? 'Сохранить' : 'Создать'}</button>
            <Link href="/admin/news" className="btn btn-secondary">Отмена</Link>
          </div>
        </form>
      )}

      <div className="admin-entity-list">
        {items.length === 0 && <p style={{ color: 'var(--muted)' }}>Новостей пока нет</p>}
        {items.map((n) => (
          <div key={n.id} className="glass admin-entity-row">
            <div className="admin-entity-row__body">
              <div className="admin-entity-row__title">{n.title || 'Без названия'}</div>
              <div className="admin-entity-row__text">
                {(n.text || '').slice(0, 160)}{(n.text || '').length > 160 ? '...' : ''}
              </div>
              <small className="admin-entity-row__meta">
                {publishLabel(n.status, n.publishedAt || n.createdAt)} · {new Date(n.createdAt).toLocaleString('ru-RU')}
                {n.videoEmbedUrl ? ' · видео' : ''}
              </small>
            </div>
            <div className="admin-entity-row__actions">
              <Link href={'/admin/news?edit=' + n.id} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem' }}>Изменить</Link>
              <form action={deleteItem}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem', color: '#e11d48' }} aria-label="Удалить">
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
