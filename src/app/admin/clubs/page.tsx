import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Edit, Trash2, X, Users } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import { parseGalleryInput, serializeClubTags, parseClubTags } from '@/lib/clubs';
import GalleryPickerField from '@/components/admin/GalleryPickerField';
import { getGallerySettings } from '@/lib/gallery';
import AdminFilterTabs from '@/components/admin/AdminFilterTabs';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  const imageUrl = (formData.get('image') as string) || '';
  return saveUploadedImage(file, 'clubs', imageUrl);
}

function clubFields(formData: FormData) {
  const trimOrNull = (k: string) => {
    const v = String(formData.get(k) || '').trim();
    return v || null;
  };
  return {
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    template: (formData.get('template') as string) || 'DEFAULT',
    status: (formData.get('status') as string) || 'ACTIVE',
    meetingSchedule: ((formData.get('meetingSchedule') as string) || '').trim() || null,
    meetingPlace: ((formData.get('meetingPlace') as string) || '').trim() || null,
    curatorName: ((formData.get('curatorName') as string) || '').trim() || null,
    curatorContact: ((formData.get('curatorContact') as string) || '').trim() || null,
    curatorContactPublic: formData.get('curatorContactPublic') === 'on',
    tags: serializeClubTags(((formData.get('tags') as string) || '').trim() || null),
    gallery: parseGalleryInput(formData.get('gallery')),
    signupUrl: ((formData.get('signupUrl') as string) || '').trim() || null,
    goal: trimOrNull('goal'),
    mission: trimOrNull('mission'),
    roadmapJson: trimOrNull('roadmapJson'),
    rolesJson: trimOrNull('rolesJson'),
    tasksJson: trimOrNull('tasksJson'),
  };
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission('clubs');
  const id = formData.get('id') as string;
  try {
    await prisma.club.delete({ where: { id } });
    revalidatePath('/admin/clubs');
    revalidatePath('/clubs');
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission('clubs');
  try {
    const fields = clubFields(formData);
    assertCleanText(
      fields.title,
      fields.description,
      fields.meetingSchedule,
      fields.meetingPlace,
      fields.curatorName,
      fields.curatorContact,
      fields.tags
    );
    const imagePath = await processImage(formData);
    await prisma.club.create({
      data: { ...fields, image: imagePath },
    });
    revalidatePath('/admin/clubs');
    revalidatePath('/clubs');
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка создания', e);
  }
  redirect('/admin/clubs');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission('clubs');
  const id = formData.get('id') as string;
  try {
    const fields = clubFields(formData);
    assertCleanText(
      fields.title,
      fields.description,
      fields.meetingSchedule,
      fields.meetingPlace,
      fields.curatorName,
      fields.curatorContact,
      fields.tags
    );
    const imagePath = await processImage(formData);
    await prisma.club.update({
      where: { id },
      data: { ...fields, image: imagePath },
    });
    revalidatePath('/admin/clubs');
    revalidatePath('/clubs');
    revalidatePath(`/clubs/${id}`);
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка обновления', e);
  }
  redirect('/admin/clubs');
}

function ClubFormFields({ item, orgPool = [] }: { item?: any; orgPool?: string[] }) {
  return (
    <>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Название</label>
        <input
          type="text"
          name="title"
          defaultValue={item?.title || ''}
          required
          style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
        />
      </div>

      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Шаблон</label>
          <select
            name="template"
            defaultValue={item?.template || 'DEFAULT'}
            className="modern-input"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            <option value="DEFAULT">Стандартная страница</option>
            <option value="GALLERY">Галерея в тексте</option>
            <option value="TEAM">Команда</option>
            <option value="FAQ">FAQ</option>
            <option value="HERO">Hero</option>
            <option value="CONTACTS">Контакты</option>
            <option value="FEATURES">Особенности</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Статус</label>
          <select
            name="status"
            defaultValue={item?.status || 'ACTIVE'}
            className="modern-input"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            <option value="ACTIVE">Активный</option>
            <option value="COMPLETED">Завершён</option>
            <option value="INACTIVE">Скрыт</option>
          </select>
        </div>
      </div>

      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Расписание</label>
          <input
            type="text"
            name="meetingSchedule"
            defaultValue={item?.meetingSchedule || ''}
            placeholder="По средам в 18:00"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Место встреч</label>
          <input
            type="text"
            name="meetingPlace"
            defaultValue={item?.meetingPlace || ''}
            placeholder="Дом молодёжи, зал 2"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Цель клуба</label>
        <textarea name="goal" rows={2} defaultValue={item?.goal || ''} placeholder="Чему учимся / какой вклад в город" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Миссия</label>
        <textarea name="mission" rows={2} defaultValue={item?.mission || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Дорожная карта (JSON)</label>
        <textarea name="roadmapJson" rows={2} defaultValue={item?.roadmapJson || ''} placeholder='[{"title":"Знакомство","status":"active"}]' style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Роли (JSON)</label>
        <textarea name="rolesJson" rows={2} defaultValue={item?.rolesJson || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Задачи сезона (JSON)</label>
        <textarea name="tasksJson" rows={2} defaultValue={item?.tasksJson || ''} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }} />
      </div>

      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Куратор</label>
          <input
            type="text"
            name="curatorName"
            defaultValue={item?.curatorName || ''}
            placeholder="Имя куратора"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Контакт куратора</label>
          <input
            type="text"
            name="curatorContact"
            defaultValue={item?.curatorContact || ''}
            placeholder="@telegram или телефон"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.65rem',
          padding: '0.75rem 0.9rem',
          borderRadius: 12,
          background: '#f8fafc',
          border: '1px solid rgba(15,23,42,0.08)',
          fontSize: '0.88rem',
          lineHeight: 1.45,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          name="curatorContactPublic"
          defaultChecked={item?.curatorContactPublic !== false}
          style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
        />
        <span>
          <strong style={{ display: 'block', marginBottom: 2 }}>Показывать контакт публично</strong>
          Если выключено — контакт видят только одобренные участники клуба.
        </span>
      </label>

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
          Ссылка на запись (Telegram / форма)
        </label>
        <input
          type="url"
          name="signupUrl"
          defaultValue={item?.signupUrl || ''}
          placeholder="https://t.me/+… или анкета"
          style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
        />
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Если указана — на странице клуба появится кнопка «Записаться…». Можно оставить пустым и писать ссылку в описании.
        </p>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Теги интересов</label>
        <input
          type="text"
          name="tags"
          defaultValue={item?.tags ? serializeClubTags(parseClubTags(item.tags)) || '' : ''}
          placeholder="волонтёрство, спорт, медиа"
          style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
        <RichTextInput name="description" defaultValue={item?.description || ''} />
      </div>

      <GalleryPickerField
        name="gallery"
        label="Галерея клуба"
        defaultValue={item?.gallery}
        pool={orgPool}
      />

      <CoverImageField currentImage={item?.image} />
    </>
  );
}

export default async function AdminClubs({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; add?: string; status?: string }>;
}) {
  await requirePermissionPage('clubs');
  const resolvedParams = await searchParams;
  const isAdding = resolvedParams.add === 'true';
  const statusRaw = (resolvedParams.status || 'ALL').toUpperCase();
  const statusFilter =
    statusRaw === 'ACTIVE' || statusRaw === 'INACTIVE' || statusRaw === 'COMPLETED' || statusRaw === 'ALL'
      ? statusRaw
      : 'ALL';

  let allItems: any[] = [];
  try {
    allItems = await prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            applications: { where: { status: 'APPROVED' } },
          },
        },
      },
    });
  } catch {
    allItems = [];
  }

  const counts = {
    ALL: allItems.length,
    ACTIVE: allItems.filter((i) => i.status === 'ACTIVE').length,
    INACTIVE: allItems.filter((i) => i.status === 'INACTIVE').length,
    COMPLETED: allItems.filter((i) => i.status === 'COMPLETED').length,
  };
  const items = statusFilter === 'ALL' ? allItems : allItems.filter((i) => i.status === statusFilter);

  const editId = resolvedParams.edit;
  const editItem = editId ? allItems.find((i) => i.id === editId) : null;
  const showModal = isAdding || editItem;
  const gallerySettings = await getGallerySettings();
  const orgGalleryPool = gallerySettings.orgGallery;

  const statusHref = (s: string) => {
    const p = new URLSearchParams();
    p.set('status', s);
    if (isAdding) p.set('add', 'true');
    if (editId) p.set('edit', editId);
    return `?${p.toString()}`;
  };

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>Клубы</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Расписание, куратор, галерея и заявки участников
          </p>
        </div>
        <Link
          href={`?add=true&status=${statusFilter}`}
          className="btn btn-primary"
          style={{
            padding: '0.6rem 1.5rem',
            borderRadius: '100px',
            boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          Добавить клуб
        </Link>
      </div>

      <AdminFilterTabs
        ariaLabel="Статус клуба"
        items={[
          { href: statusHref('ALL'), label: 'Все', count: counts.ALL, active: statusFilter === 'ALL', tone: 'muted' },
          {
            href: statusHref('ACTIVE'),
            label: 'Активные',
            count: counts.ACTIVE,
            active: statusFilter === 'ACTIVE',
            tone: 'success',
          },
          {
            href: statusHref('COMPLETED'),
            label: 'Завершённые',
            count: counts.COMPLETED,
            active: statusFilter === 'COMPLETED',
          },
          {
            href: statusHref('INACTIVE'),
            label: 'Скрытые',
            count: counts.INACTIVE,
            active: statusFilter === 'INACTIVE',
            tone: 'danger',
          },
        ]}
      />

      <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Название</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Участники</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Расписание</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Фото</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td data-label="Название" style={{ padding: '0.75rem', fontWeight: 500 }}>
                  <Link href={`/clubs/${item.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {item.title}
                  </Link>
                </td>
                <td data-label="Статус" style={{ padding: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '100px',
                      fontWeight: 600,
                      backgroundColor:
                        item.status === 'ACTIVE'
                          ? 'rgba(34,197,94,0.1)'
                          : item.status === 'COMPLETED'
                            ? 'rgba(59,130,246,0.1)'
                            : 'rgba(239,68,68,0.1)',
                      color:
                        item.status === 'ACTIVE' ? '#15803d' : item.status === 'COMPLETED' ? '#1d4ed8' : '#b91c1c',
                    }}
                  >
                    {item.status === 'ACTIVE' ? 'Активный' : item.status === 'COMPLETED' ? 'Завершён' : 'Скрыт'}
                  </span>
                </td>
                <td data-label="Участники" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Users size={14} /> {item._count?.applications ?? 0}
                  </span>
                </td>
                <td data-label="Расписание" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.88rem' }}>
                  {item.meetingSchedule || '—'}
                </td>
                <td data-label="Фото" style={{ padding: '0.75rem' }}>
                  {item.image ? (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 6,
                        backgroundImage: `url(${item.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td data-label="Действия" style={{ padding: '0.75rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Link href={`/admin/clubs?edit=${item.id}`} className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--primary)' }}>
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
                  Нет записей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{editItem ? 'Редактировать клуб' : 'Новый клуб'}</h3>
              <Link href="?" className="yp-modal-close" aria-label="Закрыть">
                <X size={18} />
              </Link>
            </div>
            <form action={editItem ? updateItem : createItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {editItem && <input type="hidden" name="id" value={editItem.id} />}
              <ClubFormFields item={editItem || undefined} orgPool={orgGalleryPool} />
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontWeight: 600 }}>
                {editItem ? 'Сохранить' : 'Создать'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
