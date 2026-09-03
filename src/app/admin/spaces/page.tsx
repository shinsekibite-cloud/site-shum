import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Edit, Trash2, X, QrCode } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import SpaceAmenitiesField from '@/components/admin/SpaceAmenitiesField';
import GalleryPickerField from '@/components/admin/GalleryPickerField';
import {
  SPACE_CATEGORIES,
  amenitiesFromFormData,
  amenityLabel,
  normalizeSpaceCategory,
  parseSpaceAmenities,
} from '@/lib/spaces';
import { galleryUrls, getGallerySettings, parseGalleryItems, serializeGalleryUrls } from '@/lib/gallery';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  const imageUrl = (formData.get('image') as string) || '';
  return saveUploadedImage(file, 'spaces', imageUrl);
}

function parseGallery(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== 'string') return null;
  return serializeGalleryUrls(galleryUrls(parseGalleryItems(raw, 24)), 24);
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission('spaces');
  const id = formData.get('id') as string;
  try {
    await prisma.space.delete({ where: { id } });
    revalidatePath('/admin/spaces');
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission('spaces');
  try {
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const address = formData.get('address') as string;
    const galleryRaw = formData.get('gallery') as string;
    assertCleanText(title, description, address, galleryRaw);
    const imagePath = await processImage(formData);
    const latRaw = (formData.get('lat') as string) || '';
    const lngRaw = (formData.get('lng') as string) || '';
    const lat = latRaw.trim() === '' ? null : Number(latRaw);
    const lng = lngRaw.trim() === '' ? null : Number(lngRaw);
    await prisma.space.create({
      data: {
        title,
        description,
        address,
        lat: Number.isFinite(lat as number) ? (lat as number) : null,
        lng: Number.isFinite(lng as number) ? (lng as number) : null,
        capacity: parseInt(formData.get('capacity') as string) || 50,
        template: formData.get('template') as string || 'DEFAULT',
        status: formData.get('status') as string || 'ACTIVE',
        category: normalizeSpaceCategory(formData.get('category') as string),
        amenities: amenitiesFromFormData(formData),
        image: imagePath,
        gallery: parseGallery(galleryRaw),
      }
    });
    revalidatePath('/admin/spaces');
    revalidatePath('/spaces');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка создания', e);
  }
  redirect('/admin/spaces');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission('spaces');
  const id = formData.get('id') as string;
  try {
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const address = formData.get('address') as string;
    const galleryRaw = formData.get('gallery') as string;
    assertCleanText(title, description, address, galleryRaw);
    const imagePath = await processImage(formData);
    const latRaw = (formData.get('lat') as string) || '';
    const lngRaw = (formData.get('lng') as string) || '';
    const lat = latRaw.trim() === '' ? null : Number(latRaw);
    const lng = lngRaw.trim() === '' ? null : Number(lngRaw);
    await prisma.space.update({
      where: { id },
      data: {
        title,
        description,
        address,
        lat: Number.isFinite(lat as number) ? (lat as number) : null,
        lng: Number.isFinite(lng as number) ? (lng as number) : null,
        capacity: parseInt(formData.get('capacity') as string) || 50,
        template: formData.get('template') as string || 'DEFAULT',
        status: formData.get('status') as string || 'ACTIVE',
        category: normalizeSpaceCategory(formData.get('category') as string),
        amenities: amenitiesFromFormData(formData),
        image: imagePath,
        gallery: parseGallery(galleryRaw),
      }
    });
    revalidatePath('/admin/spaces');
    revalidatePath('/spaces');
    revalidatePath(`/spaces/${id}`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка обновления', e);
  }
  redirect('/admin/spaces');
}

export default async function AdminSpaces({ searchParams }: { searchParams: Promise<{ edit?: string, add?: string }> }) {
  await requirePermissionPage('spaces');
  const resolvedParams = await searchParams;
  const isAdding = resolvedParams.add === 'true';
  let items: any[] = [];
  try {
    items = await prisma.space.findMany({ orderBy: { createdAt: 'desc' } });
  } catch (e) {
    items = [];
  }

  const editId = resolvedParams.edit;
  const editItem = editId ? items.find(i => i.id === editId) : null;
  const showModal = isAdding || editItem;
  const gallerySettings = await getGallerySettings();
  const orgGalleryPool = gallerySettings.orgGallery;

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Пространства
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>Управление доступными пространствами</p>
        </div>
        <Link href="?add=true" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', borderRadius: '100px', boxShadow: '0 4px 12px rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Добавить пространство
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Таблица */}
        <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Название</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Категория</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Адрес</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Особенности</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Фото</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Мест</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Название" style={{ padding: '0.75rem', color: 'var(--foreground)', fontWeight: 500, overflowWrap: 'break-word' }}>{item.title}</td>
                  <td data-label="Статус" style={{ padding: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', fontWeight: 600, backgroundColor: item.status === 'ACTIVE' ? 'rgba(34,197,94,0.1)' : item.status === 'COMPLETED' ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)', color: item.status === 'ACTIVE' ? '#15803d' : item.status === 'COMPLETED' ? '#1d4ed8' : '#b91c1c' }}>
                      {item.status === 'ACTIVE' ? 'Активный' : item.status === 'COMPLETED' ? 'Завершен' : 'Скрыт'}
                    </span>
                  </td>
                  <td data-label="Категория" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>{item.category || 'Общее'}</td>
                  <td data-label="Адрес" style={{ padding: '0.75rem', color: 'var(--muted)', overflowWrap: 'break-word' }}>{item.address}</td>
                  <td data-label="Особенности" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {parseSpaceAmenities(item.amenities).map(amenityLabel).join(', ') || '—'}
                  </td>
                  <td data-label="Фото" style={{ padding: '0.75rem', color: 'var(--muted)' }}>{item.image ? <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundImage: `url(${item.image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9', border: '1px solid rgba(0,0,0,0.1)' }} /> : '—'}</td>
                  <td data-label="Мест" style={{ padding: '0.75rem', color: 'var(--muted)' }}>{item.capacity}</td>
                  <td data-label="Действия" style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Link
                        href={`/admin/spaces/${item.id}/checkin-qr`}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem', color: 'var(--primary)' }}
                        title="Постоянный QR на вход"
                      >
                        <QrCode size={16} />
                      </Link>
                      <Link href={`/admin/spaces?edit=${item.id}`} className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--primary)' }}><Edit size={16} /></Link>
                      <form action={deleteItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--accent)' }}><Trash2 size={16} /></button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Нет записей</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Форма добавления/редактирования */}
        {showModal && (
          <div className="admin-modal-backdrop">
            <div className="admin-modal-dialog">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{editItem ? 'Редактировать' : 'Добавить'}</h3>
                <Link href="?" className="yp-modal-close" aria-label="Закрыть"><X size={18} /></Link>
              </div>
          
          <form action={editItem ? updateItem : createItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {editItem && <input type="hidden" name="id" value={editItem.id} />}
            {editItem ? (
              <>
                
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Название</label>
              <input type="text" name="title" defaultValue={editItem?.title || ''} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Адрес (для маршрута в Яндекс.Картах)</label>
              <input type="text" name="address" defaultValue={editItem?.address || ''} required placeholder="г. Сочи, ул. …" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div className="admin-form-grid admin-form-grid--2">
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Широта (lat)</label>
                <input type="number" step="any" name="lat" defaultValue={editItem?.lat ?? ''} placeholder="43.5869" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Долгота (lng)</label>
                <input type="number" step="any" name="lng" defaultValue={editItem?.lng ?? ''} placeholder="39.7237" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
              </div>
            </div>
            <p style={{ margin: '-0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>Координаты необязательны — если пусто, точка определится по адресу.</p>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Шаблон отображения</label>
              <select name="template" defaultValue={editItem?.template || 'DEFAULT'} className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                <option value="DEFAULT">Стандартная текстовая страница</option>
                <option value="GALLERY">Галерея фотографий</option>
                <option value="TEAM">Команда (Карточки)</option>
                <option value="FAQ">Вопрос-Ответ (FAQ)</option>
                <option value="HERO">Hero (крупный заголовок)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Статус</label>
              <select name="status" defaultValue={editItem?.status || 'ACTIVE'} className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                <option value="ACTIVE">Активный</option>
                <option value="COMPLETED">Завершен</option>
                <option value="INACTIVE">Скрыт (Черновик)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Категория</label>
              <select name="category" defaultValue={editItem?.category || 'Общее'} className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                {SPACE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <SpaceAmenitiesField defaultValue={editItem?.amenities} />

            <GalleryPickerField
              name="gallery"
              label="Галерея пространства"
              defaultValue={editItem?.gallery}
              pool={orgGalleryPool}
            />
            
<div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
              <RichTextInput name="description" defaultValue={editItem?.description || ''} />
            </div>
            <CoverImageField currentImage={editItem?.image} />
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Вместимость (чел.)</label>
              <input type="number" name="capacity" defaultValue={editItem?.capacity || 50} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
              </>
            ) : (
              <>
                
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Название</label>
              <input type="text" name="title" required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Адрес (для маршрута в Яндекс.Картах)</label>
              <input type="text" name="address" required placeholder="г. Сочи, ул. …" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div className="admin-form-grid admin-form-grid--2">
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Широта (lat)</label>
                <input type="number" step="any" name="lat" placeholder="43.5869" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Долгота (lng)</label>
                <input type="number" step="any" name="lng" placeholder="39.7237" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Шаблон отображения</label>
              <select name="template" defaultValue="DEFAULT" className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                <option value="DEFAULT">Стандартная текстовая страница</option>
                <option value="GALLERY">Галерея фотографий</option>
                <option value="TEAM">Команда (Карточки)</option>
                <option value="FAQ">Вопрос-Ответ (FAQ)</option>
                <option value="HERO">Hero (крупный заголовок)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Статус</label>
              <select name="status" defaultValue="ACTIVE" className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                <option value="ACTIVE">Активный</option>
                <option value="COMPLETED">Завершен</option>
                <option value="INACTIVE">Скрыт (Черновик)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Категория</label>
              <select name="category" defaultValue="Общее" className="modern-input" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}>
                {SPACE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <SpaceAmenitiesField />

            <GalleryPickerField
              name="gallery"
              label="Галерея пространства"
              pool={orgGalleryPool}
            />
            
<div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
              <RichTextInput name="description" />
            </div>
            <CoverImageField />
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Вместимость (чел.)</label>
              <input type="number" name="capacity" defaultValue={50} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
              </>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', fontWeight: 600, fontSize: '1rem' }}>
              {editItem ? 'Сохранить изменения' : 'Создать'}
            </button>
          </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
