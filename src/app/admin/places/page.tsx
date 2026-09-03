import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Check, Edit, Trash2, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { unlockAchievement } from '@/lib/award-achievements';
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_META,
  PLACE_STATUS_LABELS,
  PLACE_STATUSES,
  normalizePlaceCategory,
  normalizePlaceStatus,
  parseFeaturesJson,
  parseGalleryJson,
  serializeFeatures,
  serializeGallery,
  slugifyPlace,
  type PlaceFeature,
} from '@/lib/places';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  const imageUrl = (formData.get('image') as string) || '';
  return saveUploadedImage(file, 'places', imageUrl);
}

function parseFeaturesFromForm(raw: FormDataEntryValue | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return serializeFeatures(parsed as PlaceFeature[]);
    }
  } catch {
    /* line format: icon|title|text */
  }
  const features: PlaceFeature[] = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [icon, title, ...rest] = line.split('|').map((s) => s.trim());
      return { icon: icon || 'star', title: title || '', text: rest.join('|') || '' };
    })
    .filter((f) => f.title);
  return serializeFeatures(features);
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugifyPlace(base);
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await prisma.place.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
  }
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission('places');
  const id = formData.get('id') as string;
  try {
    await prisma.place.delete({ where: { id } });
    revalidatePath('/admin/places');
    revalidatePath('/places');
  } catch (e) {
    console.error('Ошибка удаления места', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission('places');
  try {
    const title = String(formData.get('title') || '').trim();
    const summary = String(formData.get('summary') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const district = String(formData.get('district') || '').trim();
    const tips = String(formData.get('tips') || '').trim();
    const bestSeason = String(formData.get('bestSeason') || '').trim();
    const visitTime = String(formData.get('visitTime') || '').trim();
    const priceHint = String(formData.get('priceHint') || '').trim();
    const galleryRaw = String(formData.get('gallery') || '');
    const featuresRaw = formData.get('featuresJson');
    const slugInput = String(formData.get('slug') || '').trim();
    assertCleanText(title, summary, description, address, district, tips, bestSeason, visitTime, priceHint, galleryRaw);
    const imagePath = await processImage(formData);
    const latRaw = String(formData.get('lat') || '');
    const lngRaw = String(formData.get('lng') || '');
    const lat = latRaw.trim() === '' ? null : Number(latRaw);
    const lng = lngRaw.trim() === '' ? null : Number(lngRaw);
    const slug = await uniqueSlug(slugInput || title);
    await prisma.place.create({
      data: {
        title,
        slug,
        summary: summary || null,
        description: description || title,
        category: normalizePlaceCategory(formData.get('category') as string),
        address: address || null,
        district: district || null,
        lat: Number.isFinite(lat as number) ? (lat as number) : null,
        lng: Number.isFinite(lng as number) ? (lng as number) : null,
        image: imagePath || null,
        galleryJson: serializeGallery(parseGalleryJson(galleryRaw) || galleryRaw.split(',').map((s) => s.trim()).filter(Boolean)),
        featuresJson: parseFeaturesFromForm(featuresRaw),
        tips: tips || null,
        bestSeason: bestSeason || null,
        visitTime: visitTime || null,
        priceHint: priceHint || null,
        status: normalizePlaceStatus(formData.get('status') as string),
        sortOrder: parseInt(String(formData.get('sortOrder') || '0'), 10) || 0,
      },
    });
    revalidatePath('/admin/places');
    revalidatePath('/places');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка создания места', e);
  }
  redirect('/admin/places');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission('places');
  const id = formData.get('id') as string;
  try {
    const title = String(formData.get('title') || '').trim();
    const summary = String(formData.get('summary') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const district = String(formData.get('district') || '').trim();
    const tips = String(formData.get('tips') || '').trim();
    const bestSeason = String(formData.get('bestSeason') || '').trim();
    const visitTime = String(formData.get('visitTime') || '').trim();
    const priceHint = String(formData.get('priceHint') || '').trim();
    const galleryRaw = String(formData.get('gallery') || '');
    const featuresRaw = formData.get('featuresJson');
    const slugInput = String(formData.get('slug') || '').trim();
    assertCleanText(title, summary, description, address, district, tips, bestSeason, visitTime, priceHint, galleryRaw);
    const imagePath = await processImage(formData);
    const latRaw = String(formData.get('lat') || '');
    const lngRaw = String(formData.get('lng') || '');
    const lat = latRaw.trim() === '' ? null : Number(latRaw);
    const lng = lngRaw.trim() === '' ? null : Number(lngRaw);
    const slug = await uniqueSlug(slugInput || title, id);
    await prisma.place.update({
      where: { id },
      data: {
        title,
        slug,
        summary: summary || null,
        description: description || title,
        category: normalizePlaceCategory(formData.get('category') as string),
        address: address || null,
        district: district || null,
        lat: Number.isFinite(lat as number) ? (lat as number) : null,
        lng: Number.isFinite(lng as number) ? (lng as number) : null,
        image: imagePath || null,
        galleryJson: serializeGallery(
          parseGalleryJson(galleryRaw).length
            ? parseGalleryJson(galleryRaw)
            : galleryRaw.split(',').map((s) => s.trim()).filter(Boolean)
        ),
        featuresJson: parseFeaturesFromForm(featuresRaw),
        tips: tips || null,
        bestSeason: bestSeason || null,
        visitTime: visitTime || null,
        priceHint: priceHint || null,
        status: normalizePlaceStatus(formData.get('status') as string),
        sortOrder: parseInt(String(formData.get('sortOrder') || '0'), 10) || 0,
      },
    });
    revalidatePath('/admin/places');
    revalidatePath('/places');
    revalidatePath(`/places/${slug}`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка обновления места', e);
  }
  redirect('/admin/places');
}

async function reviewAction(formData: FormData) {
  'use server';
  await requirePermission('places');
  const id = String(formData.get('id') || '');
  const action = String(formData.get('action') || '');
  if (!id || (action !== 'APPROVED' && action !== 'REJECTED')) return;
  try {
    const review = await prisma.placeReview.update({
      where: { id },
      data: { status: action },
      select: { userId: true, placeId: true },
    });
    if (action === 'APPROVED') {
      await unlockAchievement(review.userId, 'PLACE_REVIEWER');
    }
    revalidatePath('/admin/places');
    revalidatePath('/places');
  } catch (e) {
    console.error('Ошибка модерации отзыва', e);
  }
}

function featuresTextareaValue(raw?: string | null) {
  const features = parseFeaturesJson(raw);
  if (!features.length) return '';
  return features.map((f) => `${f.icon}|${f.title}|${f.text}`).join('\n');
}

function galleryTextareaValue(raw?: string | null) {
  return parseGalleryJson(raw).join(', ');
}

export default async function AdminPlaces({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; add?: string }>;
}) {
  await requirePermissionPage('places');
  const resolvedParams = await searchParams;
  const isAdding = resolvedParams.add === 'true';

  let items: Awaited<ReturnType<typeof prisma.place.findMany>> = [];
  let pendingReviews: Array<{
    id: string;
    body: string;
    createdAt: Date;
    user: { name: string | null };
    place: { title: string; slug: string };
  }> = [];
  try {
    items = await prisma.place.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    pendingReviews = await prisma.placeReview.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { name: true } },
        place: { select: { title: true, slug: true } },
      },
    });
  } catch (e) {
    console.error(e);
  }

  const editId = resolvedParams.edit;
  const editItem = editId ? items.find((i) => i.id === editId) : null;
  const showModal = isAdding || Boolean(editItem);

  const formFields = (item: (typeof items)[number] | null) => (
    <>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Название</label>
        <input type="text" name="title" defaultValue={item?.title || ''} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Slug (URL)</label>
        <input type="text" name="slug" defaultValue={item?.slug || ''} placeholder="avtomaticheski-iz-nazvaniya" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Краткое описание</label>
        <input type="text" name="summary" defaultValue={item?.summary || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Категория</label>
          <select name="category" defaultValue={item?.category || 'UNIQUE'} className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
            {PLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{PLACE_CATEGORY_META[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Статус</label>
          <select name="status" defaultValue={item?.status || 'DRAFT'} className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
            {PLACE_STATUSES.map((s) => (
              <option key={s} value={s}>{PLACE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Адрес</label>
          <input type="text" name="address" defaultValue={item?.address || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Район</label>
          <input type="text" name="district" defaultValue={item?.district || ''} placeholder="Центр / Адлер / Хоста" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
      </div>
      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Широта</label>
          <input type="number" step="any" name="lat" defaultValue={item?.lat ?? ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Долгота</label>
          <input type="number" step="any" name="lng" defaultValue={item?.lng ?? ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
      </div>
      <div className="admin-form-grid admin-form-grid--3">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Сезон</label>
          <input type="text" name="bestSeason" defaultValue={item?.bestSeason || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Время визита</label>
          <input type="text" name="visitTime" defaultValue={item?.visitTime || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Цены</label>
          <input type="text" name="priceHint" defaultValue={item?.priceHint || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Порядок сортировки</label>
        <input type="number" name="sortOrder" defaultValue={item?.sortOrder ?? 0} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Перки (строки: icon|title|text)</label>
        <textarea name="featuresJson" rows={4} defaultValue={featuresTextareaValue(item?.featuresJson)} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Галерея (URL через запятую)</label>
        <textarea name="gallery" rows={2} defaultValue={galleryTextareaValue(item?.galleryJson)} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Советы</label>
        <textarea name="tips" rows={3} defaultValue={item?.tips || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
        <RichTextInput name="description" defaultValue={item?.description || ''} />
      </div>
      <CoverImageField currentImage={item?.image} />
    </>
  );

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Куда сходить
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>Места Сочи и модерация отзывов</p>
        </div>
        <Link href="?add=true" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', borderRadius: '100px' }}>
          Добавить место
        </Link>
      </div>

      {pendingReviews.length > 0 ? (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>Отзывы на модерации</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingReviews.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(13,148,136,0.2)',
                  background: 'rgba(13,148,136,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <strong>{r.user.name || 'Участник'}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {r.place.title} · {r.createdAt.toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.75rem', whiteSpace: 'pre-wrap' }}>{r.body}</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <form action={reviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="APPROVED" />
                    <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Check size={16} /> Одобрить
                    </button>
                  </form>
                  <form action={reviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="REJECTED" />
                    <button type="submit" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#b91c1c' }}>
                      <X size={16} /> Отклонить
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Название</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Категория</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Рейтинг</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Порядок</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td data-label="Название" style={{ padding: '0.75rem', fontWeight: 500 }}>{item.title}</td>
                <td data-label="Категория" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                  {PLACE_CATEGORY_META[normalizePlaceCategory(item.category)].label}
                </td>
                <td data-label="Статус" style={{ padding: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '100px',
                      fontWeight: 600,
                      backgroundColor:
                        item.status === 'PUBLISHED'
                          ? 'rgba(13,148,136,0.12)'
                          : item.status === 'DRAFT'
                            ? 'rgba(100,116,139,0.12)'
                            : 'rgba(180,83,9,0.12)',
                      color:
                        item.status === 'PUBLISHED'
                          ? '#0f766e'
                          : item.status === 'DRAFT'
                            ? '#475569'
                            : '#b45309',
                    }}
                  >
                    {PLACE_STATUS_LABELS[normalizePlaceStatus(item.status)]}
                  </span>
                </td>
                <td data-label="Рейтинг" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                  {item.ratingCount > 0 ? `${item.ratingAvg.toFixed(1)} (${item.ratingCount})` : '—'}
                </td>
                <td data-label="Порядок" style={{ padding: '0.75rem', color: 'var(--muted)' }}>{item.sortOrder}</td>
                <td data-label="Действия" style={{ padding: '0.75rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <Link href={`/admin/places?edit=${item.id}`} className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--primary)' }}>
                      <Edit size={16} />
                    </Link>
                    <form action={deleteItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--accent)' }}>
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>
                  Нет мест — добавьте или запустите scripts/seed-places.mjs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal ? (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{editItem ? 'Редактировать место' : 'Добавить место'}</h3>
              <Link href="?" className="yp-modal-close" aria-label="Закрыть">
                <X size={18} />
              </Link>
            </div>
            <form action={editItem ? updateItem : createItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {editItem ? <input type="hidden" name="id" value={editItem.id} /> : null}
              {formFields(editItem || null)}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', fontWeight: 600 }}>
                {editItem ? 'Сохранить' : 'Создать'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
