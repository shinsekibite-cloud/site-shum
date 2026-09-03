import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Trash2, Eye } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireAdminPage } from '@/lib/acl';
import AdminFilterTabs from '@/components/admin/AdminFilterTabs';
import { roleLabelRu } from '@/lib/role-labels';

async function deleteUser(formData: FormData) {
  'use server';
  const session = await requireAdmin();
  const id = formData.get('id') as string;
  try {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return;
    if (target.role === 'TECH') {
      throw new Error('Нельзя удалить техучётку');
    }
    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new Error('Нельзя удалить последнего администратора');
      }
    }
    if (id === session.user.id) {
      throw new Error('Нельзя удалить собственный аккаунт');
    }
    await prisma.user.delete({ where: { id } });
    revalidatePath('/admin/users');
  } catch (e) {
    console.error('Ошибка удаления', e);
  }
}

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; role?: string }> }) {
  await requireAdminPage();
  const resolvedParams = await searchParams;
  const page = parseInt(resolvedParams.page || '1', 10);
  const q = (resolvedParams.q || '').trim();
  const roleFilter = (resolvedParams.role || '').trim();
  const take = 20;
  const skip = (page - 1) * take;

  const where: any = { role: { not: 'TECH' } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  if (roleFilter === 'USER') {
    where.role = { in: ['USER', 'PARTICIPANT'] };
  } else if (roleFilter && ['MODERATOR', 'ADMIN', 'SCANNER'].includes(roleFilter)) {
    where.role = roleFilter;
  }

  let users: any[] = [];
  let total = 0;
  try {
    total = await prisma.user.count({ where });
    users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, image: true, role: true, reliabilityScore: true, attendedCount: true, noShowCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });
  } catch (e) {
    users = [];
  }
  const totalPages = Math.max(1, Math.ceil(total / take));

  let roleCounts: Record<string, number> = { ALL: 0 };
  try {
    const grouped = await prisma.user.groupBy({ by: ['role'], _count: true });
    for (const g of grouped) {
      if (g.role === 'TECH') continue;
      roleCounts[g.role] = g._count;
      roleCounts.ALL += g._count;
    }
  } catch {
    /* ignore */
  }

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (roleFilter) p.set('role', roleFilter);
    Object.entries(extra).forEach(([k, v]) => {
      if (v === '' || v == null) p.delete(k);
      else p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const roleTab = (role: string, label: string) => ({
    href: qs({ role: role === 'ALL' ? '' : role, page: 1 }),
    label,
    count: roleCounts[role === 'ALL' ? 'ALL' : role] || 0,
    active: role === 'ALL' ? !roleFilter : roleFilter === role,
  });

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '6rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
            Пользователи
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
            Найдено: {total}. Управление зарегистрированными аккаунтами
          </p>
        </div>
      </div>

      <AdminFilterTabs
        ariaLabel="Роль / тип участия"
        items={[
          roleTab('ALL', 'Все'),
          roleTab('USER', 'Пользователи'),
          roleTab('MODERATOR', 'Модераторы'),
          roleTab('ADMIN', 'Администраторы'),
          roleTab('SCANNER', 'Сканеры'),
        ]}
      />

      <form method="GET" className="card-surface" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск: имя, email, телефон"
          className="settings-input"
          style={{ flex: '1 1 220px', minWidth: 0, margin: 0 }}
        />
        {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
        <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.1rem' }}>Найти</button>
        {(q || roleFilter) && (
          <Link href="/admin/users" className="btn btn-secondary" style={{ padding: '0.55rem 1.1rem' }} prefetch>Сбросить</Link>
        )}
      </form>

      <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflowX: 'auto' }}>
        <div className="admin-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              <th style={{ padding: '1rem', color: 'var(--muted)' }}>Имя</th>
              <th style={{ padding: '1rem', color: 'var(--muted)' }}>Контакты</th>
              <th style={{ padding: '1rem', color: 'var(--muted)' }}>Рейтинг</th>
              <th style={{ padding: '1rem', color: 'var(--muted)' }}>Роль</th>
              <th style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td data-label="Имя" style={{ padding: '1rem', fontWeight: 500 }}>
                  <Link href={`/admin/users/${user.id}`} style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                    {user.name || 'Без имени'}
                  </Link>
                </td>
                <td data-label="Контакты" style={{ padding: '1rem', color: 'var(--muted)' }}>
                  <div>{user.email || 'Нет email'}</div>
                  <div style={{ fontSize: '0.8rem' }}>{user.phone || 'Нет телефона'}</div>
                </td>
                <td data-label="Рейтинг" style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700 }}>{user.reliabilityScore ?? 100}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    ✓{user.attendedCount ?? 0} · ✗{user.noShowCount ?? 0}
                  </div>
                </td>
                <td data-label="Роль" style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: user.role === 'ADMIN' ? 'rgba(244,63,94,0.1)' : '#f1f5f9', color: user.role === 'ADMIN' ? 'var(--accent)' : 'inherit' }}>
                    {roleLabelRu(user.role)}
                  </span>
                </td>
                <td data-label="Действия" className="actions-cell" style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Link href={`/admin/users/${user.id}`} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
                      <Eye size={16} />
                    </Link>
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={user.id} />
                      <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--accent)' }} title="Удалить">
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Ничего не найдено</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          {page > 1 && (
            <Link href={qs({ page: page - 1 })} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Назад</Link>
          )}
          <span style={{ padding: '0.5rem 1rem', fontWeight: 600 }}>Страница {page} из {totalPages}</span>
          {page < totalPages && (
            <Link href={qs({ page: page + 1 })} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Вперед</Link>
          )}
        </div>
      )}
    </div>
  );
}
