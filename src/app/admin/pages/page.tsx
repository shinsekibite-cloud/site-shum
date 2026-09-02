import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Edit, Trash2, Eye, Plus, Shield, Users, FileStack } from 'lucide-react';
import { deletePage } from './actions';
import { requirePermissionPage } from '@/lib/acl';
import { publishLabel } from '@/lib/publish';
import { ensureSystemPages, isSystemPageSlug, publicPagePath } from '@/lib/system-pages';
import AdminFilterTabs from '@/components/admin/AdminFilterTabs';

export default async function AdminPages({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermissionPage('pages');
  await ensureSystemPages();
  const resolved = await searchParams;
  const statusRaw = (resolved.status || 'ALL').toUpperCase();
  const status =
    statusRaw === 'DRAFT' || statusRaw === 'PUBLISHED' || statusRaw === 'ALL' ? statusRaw : 'ALL';

  let items: Awaited<ReturnType<typeof prisma.pageContent.findMany>> = [];
  try {
    items = await prisma.pageContent.findMany({
      where: status === 'ALL' ? undefined : { status },
      orderBy: { updatedAt: 'desc' },
    });
  } catch {
    items = [];
  }

  const [publishedCount, draftCount, allCount] = await Promise.all([
    prisma.pageContent.count({ where: { status: 'PUBLISHED' } }).catch(() => 0),
    prisma.pageContent.count({ where: { status: 'DRAFT' } }).catch(() => 0),
    prisma.pageContent.count().catch(() => 0),
  ]);

  const privacy =
    items.find((i) => i.slug === 'privacy') ||
    (await prisma.pageContent.findFirst({ where: { slug: 'privacy' } }));
  const about =
    items.find((i) => i.slug === 'about') || (await prisma.pageContent.findFirst({ where: { slug: 'about' } }));
  const rules =
    items.find((i) => i.slug === 'rules') || (await prisma.pageContent.findFirst({ where: { slug: 'rules' } }));

  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Страницы</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Редактор текстов сайта: политика, правила, «О нас», FAQ и страницы из VK (#правилаДМ, медиа). Файлы PDF и
            памятки — в{' '}
            <Link href="/admin/documents" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Документах
            </Link>
            ; афиша недели — в{' '}
            <Link href="/admin/settings?tab=afisha" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Настройках → Афиша
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/pages/new"
          className="btn btn-primary"
          style={{ padding: '0.6rem 1.5rem', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={18} /> Новая страница
        </Link>
      </div>

      <AdminFilterTabs
        ariaLabel="Статус страниц"
        items={[
          { href: '/admin/pages?status=ALL', label: 'Все', count: allCount, active: status === 'ALL', tone: 'muted' },
          {
            href: '/admin/pages?status=PUBLISHED',
            label: 'Опубликовано',
            count: publishedCount,
            active: status === 'PUBLISHED',
            tone: 'success',
          },
          {
            href: '/admin/pages?status=DRAFT',
            label: 'Черновики',
            count: draftCount,
            active: status === 'DRAFT',
            tone: 'warning',
          },
        ]}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        {privacy && (
          <Link
            href={`/admin/pages/${privacy.id}/edit`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'center',
              padding: '1rem 1.1rem',
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(14,165,233,0.06))',
              border: '1px solid rgba(37,99,235,0.18)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(37,99,235,0.12)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, fontSize: '0.98rem' }}>Политика конфиденциальности</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>/privacy · редактировать</div>
            </div>
          </Link>
        )}
        {about && (
          <Link
            href={`/admin/pages/${about.id}/edit`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'center',
              padding: '1rem 1.1rem',
              borderRadius: 14,
              background: 'white',
              border: '1px solid rgba(15,23,42,0.08)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(15,23,42,0.06)',
                color: '#0f172a',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Users size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, fontSize: '0.98rem' }}>О нас</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>/p/about · редактировать</div>
            </div>
          </Link>
        )}
        {rules && (
          <Link
            href={`/admin/pages/${rules.id}/edit`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'center',
              padding: '1rem 1.1rem',
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(15,23,42,0.04), rgba(100,116,139,0.08))',
              border: '1px solid rgba(15,23,42,0.1)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(15,23,42,0.08)',
                color: '#0f172a',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <FileStack size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, fontSize: '0.98rem' }}>Правила сайта</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>/rules · редактировать</div>
            </div>
          </Link>
        )}
        <Link
          href="/admin/documents"
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            gap: '0.85rem',
            alignItems: 'center',
            padding: '1rem 1.1rem',
            borderRadius: 14,
            background: 'white',
            border: '1px solid rgba(15,23,42,0.08)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.06)',
              color: '#0f172a',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <FileStack size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: '0.98rem' }}>Документы (файлы)</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>/documents · PDF и вложения</div>
          </div>
        </Link>
      </div>

      <div className="admin-table-wrap" style={{ padding: '0.5rem 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Страница</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Статус</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Меню</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Шаблон</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)' }}>Фото</th>
              <th style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const cover = item.images && item.images !== '[]' ? item.images : '';
              const path = publicPagePath(item.slug);
              const system = isSystemPageSlug(item.slug);
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Страница" style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {item.title}
                      {system && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 6,
                            background: 'rgba(37,99,235,0.1)',
                            color: 'var(--primary)',
                          }}
                        >
                          системная
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{path}</div>
                  </td>
                  <td data-label="Статус" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {publishLabel(item.status, item.publishedAt)}
                  </td>
                  <td data-label="Меню" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {item.menuPosition === 'FOOTER' && 'Подвал'}
                    {item.menuPosition === 'HEADER_MAIN' && 'Главное меню'}
                    {item.menuPosition === 'HEADER_SUB' && 'Подменю «Ещё»'}
                    {(!item.menuPosition || item.menuPosition === 'NONE') && 'Скрыто'}
                  </td>
                  <td data-label="Шаблон" style={{ padding: '0.75rem', color: 'var(--muted)' }}>
                    {item.template || 'DEFAULT'}
                  </td>
                  <td data-label="Фото" style={{ padding: '0.75rem' }}>
                    {cover ? (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          backgroundImage: `url(${cover})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          border: '1px solid #e2e8f0',
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Действия" className="actions-cell" style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <a href={path} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '0.5rem' }}>
                        <Eye size={16} />
                      </a>
                      <Link
                        href={`/admin/pages/${item.id}/edit`}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem', color: 'var(--primary)' }}
                      >
                        <Edit size={16} />
                      </Link>
                      {!system && (
                        <form action={deletePage}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--accent)' }}>
                            <Trash2 size={16} />
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                  Страниц пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
