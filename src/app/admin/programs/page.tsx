import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Edit, Trash2, X } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import RichTextInput from '@/components/RichTextInput';
import CoverImageField from '@/components/admin/CoverImageField';
import { assertCleanText, ProfanityError } from '@/lib/censor';
import { saveUploadedImage } from '@/lib/uploads';
import { requirePermission, requirePermissionPage } from '@/lib/acl';
import {
  BODY_TYPE_LABELS,
  PROGRAM_KIND_META,
  PROGRAM_KINDS,
  PROGRAM_STATUS_LABELS,
  ensurePrograms,
  isProgramKind,
  programPublicPath,
  type ProgramKind,
} from '@/lib/programs';

async function processImage(formData: FormData) {
  const file = formData.get('imageFile') as File | null;
  const imageUrl = (formData.get('image') as string) || '';
  return saveUploadedImage(file, 'programs', imageUrl);
}

function parseOptionalDate(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseOptionalInt(raw: FormDataEntryValue | null) {
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formToProgramData(formData: FormData, imagePath: string | null) {
  const kindRaw = String(formData.get('kind') || 'GRANT');
  const kind = isProgramKind(kindRaw) ? kindRaw : 'GRANT';
  const title = formData.get('title') as string;
  const summary = String(formData.get('summary') || '').trim() || null;
  const description = formData.get('description') as string;
  assertCleanText(title, summary || '', description);
  return {
    kind,
    title,
    summary,
    description,
    status: String(formData.get('status') || 'OPEN'),
    organizer: String(formData.get('organizer') || '').trim() || null,
    place: String(formData.get('place') || '').trim() || null,
    externalUrl: String(formData.get('externalUrl') || '').trim() || null,
    tags: String(formData.get('tags') || '').trim() || null,
    amountLabel: String(formData.get('amountLabel') || '').trim() || null,
    bodyType: String(formData.get('bodyType') || '').trim() || null,
    seats: parseOptionalInt(formData.get('seats')),
    sortOrder: parseOptionalInt(formData.get('sortOrder')) ?? 0,
    startsAt: parseOptionalDate(formData.get('startsAt')),
    endsAt: parseOptionalDate(formData.get('endsAt')),
    image: imagePath,
  };
}

async function deleteItem(formData: FormData) {
  'use server';
  await requirePermission(['programs', 'pages']);
  const id = formData.get('id') as string;
  try {
    await prisma.portalProgram.delete({ where: { id } });
    revalidatePath('/admin/programs');
    revalidatePath('/grants');
    revalidatePath('/dobro');
    revalidatePath('/self-gov');
  } catch (e) {
    console.error('Ошибка удаления программы', e);
  }
}

async function createItem(formData: FormData) {
  'use server';
  await requirePermission(['programs', 'pages']);
  try {
    const imagePath = await processImage(formData);
    const data = formToProgramData(formData, imagePath);
    await prisma.portalProgram.create({ data });
    revalidatePath('/admin/programs');
    revalidatePath(programPublicPath(data.kind as ProgramKind));
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка создания программы', e);
  }
  redirect('/admin/programs');
}

async function updateItem(formData: FormData) {
  'use server';
  await requirePermission(['programs', 'pages']);
  const id = formData.get('id') as string;
  try {
    const imagePath = await processImage(formData);
    const data = formToProgramData(formData, imagePath);
    await prisma.portalProgram.update({ where: { id }, data });
    revalidatePath('/admin/programs');
    revalidatePath(programPublicPath(data.kind as ProgramKind));
    revalidatePath(programPublicPath(data.kind as ProgramKind, id));
  } catch (e) {
    if (e instanceof ProfanityError) throw e;
    console.error('Ошибка обновления программы', e);
  }
  redirect('/admin/programs');
}

function toDateInput(d: Date | string | null | undefined) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function ProgramFormFields({ item }: { item?: any }) {
  return (
    <>
      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Раздел</label>
          <select
            name="kind"
            defaultValue={item?.kind || 'GRANT'}
            className="modern-input"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            {PROGRAM_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROGRAM_KIND_META[k].title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Статус</label>
          <select
            name="status"
            defaultValue={item?.status || 'OPEN'}
            className="modern-input"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            {Object.entries(PROGRAM_STATUS_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

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

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Краткий анонс</label>
        <input
          type="text"
          name="summary"
          defaultValue={item?.summary || ''}
          style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Описание</label>
        <RichTextInput name="description" defaultValue={item?.description || ''} />
      </div>

      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Организатор</label>
          <input
            type="text"
            name="organizer"
            defaultValue={item?.organizer || ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Место</label>
          <input
            type="text"
            name="place"
            defaultValue={item?.place || ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      <div className="admin-form-grid admin-form-grid--3">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Сумма (гранты)</label>
          <input
            type="text"
            name="amountLabel"
            placeholder="до 300 000 ₽"
            defaultValue={item?.amountLabel || ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Мест</label>
          <input
            type="number"
            name="seats"
            min={0}
            defaultValue={item?.seats ?? ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Порядок</label>
          <input
            type="number"
            name="sortOrder"
            defaultValue={item?.sortOrder ?? 0}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      <div className="admin-form-grid admin-form-grid--3">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Старт</label>
          <input
            type="date"
            name="startsAt"
            defaultValue={toDateInput(item?.startsAt)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Дедлайн / конец</label>
          <input
            type="date"
            name="endsAt"
            defaultValue={toDateInput(item?.endsAt)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Формат (самоупр.)</label>
          <select
            name="bodyType"
            defaultValue={item?.bodyType || ''}
            className="modern-input"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            <option value="">—</option>
            {Object.entries(BODY_TYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-form-grid admin-form-grid--2">
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Внешняя ссылка</label>
          <input
            type="url"
            name="externalUrl"
            placeholder="https://dobro.ru"
            defaultValue={item?.externalUrl || ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Теги</label>
          <input
            type="text"
            name="tags"
            placeholder="грант,медиа"
            defaultValue={item?.tags || ''}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      <CoverImageField currentImage={item?.image} />
    </>
  );
}

export default async function AdminPrograms({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; add?: string; kind?: string }>;
}) {
  await requirePermissionPage(['programs', 'pages']);
  await ensurePrograms();
  const resolved = await searchParams;
  const kindFilter = resolved.kind && isProgramKind(resolved.kind) ? resolved.kind : 'ALL';
  const isAdding = resolved.add === 'true';

  let items: any[] = [];
  try {
    items = await prisma.portalProgram.findMany({
      where: kindFilter === 'ALL' ? undefined : { kind: kindFilter },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { applications: true } } },
    });
  } catch {
    items = [];
  }

  const editId = resolved.edit;
  const editItem = editId ? items.find((i) => i.id === editId) : null;
  const showModal = isAdding || !!editItem;

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Гранты, Добро, Самоуправление
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Каталоги программ с заявками пользователей
          </p>
        </div>
        <Link
          href="?add=true"
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
          Добавить
        </Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <Link
          href="?"
          className="btn"
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: '0.85rem',
            background: kindFilter === 'ALL' ? 'var(--primary)' : 'rgba(15,23,42,0.04)',
            color: kindFilter === 'ALL' ? '#fff' : 'inherit',
          }}
        >
          Все
        </Link>
        {PROGRAM_KINDS.map((k) => (
          <Link
            key={k}
            href={`?kind=${k}`}
            className="btn"
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 999,
              fontWeight: 600,
              fontSize: '0.85rem',
              background: kindFilter === k ? 'var(--primary)' : 'rgba(15,23,42,0.04)',
              color: kindFilter === k ? '#fff' : 'inherit',
            }}
          >
            {PROGRAM_KIND_META[k].title}
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Раздел</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Название</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Заявки</th>
                <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const kind: ProgramKind = isProgramKind(String(item.kind)) ? (item.kind as ProgramKind) : 'GRANT';
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td data-label="Раздел" style={{ padding: '0.75rem', fontWeight: 600 }}>
                      {PROGRAM_KIND_META[kind].title}
                    </td>
                    <td data-label="Название" style={{ padding: '0.75rem' }}>
                      <Link href={programPublicPath(kind, item.id)} style={{ color: 'var(--primary)', fontWeight: 600 }}>
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
                            item.status === 'OPEN'
                              ? 'rgba(34,197,94,0.1)'
                              : item.status === 'CLOSED'
                                ? 'rgba(59,130,246,0.1)'
                                : 'rgba(100,116,139,0.15)',
                          color:
                            item.status === 'OPEN' ? '#15803d' : item.status === 'CLOSED' ? '#1d4ed8' : '#475569',
                        }}
                      >
                        {PROGRAM_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td data-label="Заявки" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                      {item._count?.applications ?? 0}
                    </td>
                    <td data-label="Действия" style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Link
                          href={`/admin/programs?edit=${item.id}${kindFilter !== 'ALL' ? `&kind=${kindFilter}` : ''}`}
                          className="btn btn-secondary"
                          style={{ padding: '0.5rem', color: 'var(--primary)' }}
                        >
                          <Edit size={16} />
                        </Link>
                        <form action={deleteItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem', color: 'var(--accent)' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>
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
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{editItem ? 'Редактировать' : 'Добавить'}</h3>
                <Link href="?" className="yp-modal-close" aria-label="Закрыть">
                  <X size={18} />
                </Link>
              </div>
              <form
                action={editItem ? updateItem : createItem}
                style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
              >
                {editItem && <input type="hidden" name="id" value={editItem.id} />}
                <ProgramFormFields item={editItem || undefined} />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', fontWeight: 600, fontSize: '1rem' }}
                >
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
