import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Edit, Trash2, Users, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { parseGalleryInput } from '@/lib/clubs';
import GalleryPickerField from '@/components/admin/GalleryPickerField';
import { getGallerySettings } from '@/lib/gallery';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  const imageUrl = (formData.get('image') as string) || '';
  return saveUploadedImage(file, 'projects', imageUrl);
}

function projectFields(formData: FormData) {
  const trimOrNull = (k: string) => {
    const v = String(formData.get(k) || '').trim();
    return v || null;
  };
  return {
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    template: (formData.get('template') as string) || 'DEFAULT',
    status: (formData.get('status') as string) || 'ACTIVE',
    gallery: parseGalleryInput(formData.get('gallery')),
    goal: trimOrNull('goal'),
    mission: trimOrNull('mission'),
    roadmapJson: trimOrNull('roadmapJson'),
    rolesJson: trimOrNull('rolesJson'),
    tasksJson: trimOrNull('tasksJson'),
  };
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission('projects');
  const id = formData.get('id') as string;
  try {
    await prisma.project.delete({ where: { id } });
    revalidatePath('/admin/projects');
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission('projects');
  try {
    const fields = projectFields(formData);
    assertCleanText(fields.title, fields.description);
    const imagePath = await processImage(formData);
    await prisma.project.create({
      data: {
        ...fields,
        image: imagePath,
      },
    });
    revalidatePath('/admin/projects');
    revalidatePath('/projects');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка создания', e);
  }
  redirect('/admin/projects');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission('projects');
  const id = formData.get('id') as string;
  try {
    const fields = projectFields(formData);
    assertCleanText(fields.title, fields.description);
    const imagePath = await processImage(formData);
    await prisma.project.update({
      where: { id },
      data: {
        ...fields,
        image: imagePath,
      },
    });
    revalidatePath('/admin/projects');
    revalidatePath('/projects');
    revalidatePath(`/projects/${id}`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка обновления', e);
  }
  redirect('/admin/projects');
}

export default async function AdminProjects({ searchParams }: { searchParams: Promise<{ edit?: string, add?: string }> }) {
  await requirePermissionPage('projects');
  const resolvedParams = await searchParams;
  const isAdding = resolvedParams.add === 'true';
  let items: any[] = [];
  try {
    items = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { applications: { where: { status: 'APPROVED' } } },
        },
      },
    });
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
            Проекты
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>Управление молодежными проектами</p>
        </div>
        <Link href="?add=true" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', borderRadius: '100px', boxShadow: '0 4px 12px rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Добавить проект
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Таблица */}
        <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Название</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Участники</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Описание</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Фото</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Название" style={{ padding: '0.75rem', color: 'var(--foreground)', fontWeight: 500, overflowWrap: 'break-word' }}>{item.title}</td>
                  <td data-label="Участники" style={{ padding: '0.75rem' }}>
                    <Link
                      href={`/admin/applications?type=project&status=APPROVED&q=${encodeURIComponent(item.title)}`}
                      className="btn btn-secondary"
                      style={{
                        padding: '0.35rem 0.6rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                      title="Открыть одобренных участников"
                    >
                      <Users size={14} />
                      {item._count?.applications ?? 0}
                    </Link>
                  </td>
                  <td data-label="Статус" style={{ padding: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '100px', fontWeight: 600, backgroundColor: item.status === 'ACTIVE' ? 'rgba(34,197,94,0.1)' : item.status === 'COMPLETED' ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)', color: item.status === 'ACTIVE' ? '#15803d' : item.status === 'COMPLETED' ? '#1d4ed8' : '#b91c1c' }}>
                      {item.status === 'ACTIVE' ? 'Активный' : item.status === 'COMPLETED' ? 'Завершен' : 'Скрыт'}
                    </span>
                  </td>
                  <td data-label="Описание" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                    <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'break-word' }}>
                      {item.description.replace(/<[^>]+>/g, '')}
                    </div>
                  </td>
                  <td data-label="Фото" style={{ padding: '0.75rem', color: 'var(--muted)' }}>{item.image ? <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundImage: `url(${item.image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9', border: '1px solid rgba(0,0,0,0.1)' }} /> : '—'}</td>
                  
                  <td data-label="Действия" style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Link href={`/admin/projects?edit=${item.id}`} className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--primary)' }}><Edit size={16} /></Link>
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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
              <RichTextInput name="description" defaultValue={editItem?.description || ''} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Цель проекта</label>
              <textarea name="goal" rows={2} defaultValue={editItem?.goal || ''} placeholder="Что получит город / участники в итоге" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Миссия</label>
              <textarea name="mission" rows={2} defaultValue={editItem?.mission || ''} placeholder="Зачем проект существует" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Дорожная карта (JSON)</label>
              <textarea name="roadmapJson" rows={3} defaultValue={editItem?.roadmapJson || ''} placeholder='[{"title":"Сбор команды","status":"active"}]' style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Роли команды (JSON)</label>
              <textarea name="rolesJson" rows={2} defaultValue={editItem?.rolesJson || ''} placeholder='[{"role":"Куратор","duties":"Координирует сроки"}]' style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Задачи (JSON)</label>
              <textarea name="tasksJson" rows={2} defaultValue={editItem?.tasksJson || ''} placeholder='[{"title":"Собрать бриф","status":"todo"}]' style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
            </div>
            <GalleryPickerField
              name="gallery"
              label="Галерея проекта"
              defaultValue={editItem?.gallery}
              pool={orgGalleryPool}
            />
            <CoverImageField currentImage={editItem?.image} />
              </>
            ) : (
              <>
                
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Название</label>
              <input type="text" name="title" required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
              <RichTextInput name="description" />
            </div>
            <GalleryPickerField
              name="gallery"
              label="Галерея проекта"
              pool={orgGalleryPool}
            />
            <CoverImageField />
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
