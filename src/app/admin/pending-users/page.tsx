import { requireAdminPage } from '@/lib/acl';
import AdminPendingUsersClient from '@/components/admin/AdminPendingUsersClient';

export default async function AdminPendingUsersPage() {
  await requireAdminPage();
  return (
    <div className="admin-page-shell" style={{ paddingBottom: '4rem' }}>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>
            Заявки на регистрацию
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.95rem' }}>
            Пользователи, которые ещё не подтвердили email, и новые аккаунты на модерации
            (гость до одобрения). Через 3 рабочих часа (пн–пт 09:00–18:00 МСК) без решения
            учётная запись одобряется автоматически. Заблокировать можно в любой момент на карточке пользователя.
          </p>
        </div>
      </div>
      <AdminPendingUsersClient />
    </div>
  );
}
