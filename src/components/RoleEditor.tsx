'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MODERATOR_PERMISSIONS, PERMISSION_LABELS, LIMITED_ADMIN_TOKEN, type ModeratorPermission } from '@/lib/acl-shared';

const PERMISSION_GROUPS: { title: string; keys: ModeratorPermission[] }[] = [
  {
    title: 'Контент сайта',
    keys: ['projects', 'clubs', 'spaces', 'places', 'pages', 'programs', 'news'],
  },
  {
    title: 'Заявки и афиша',
    keys: ['bookings', 'applications', 'scanner'],
  },
  {
    title: 'Модерация и команда',
    keys: ['portfolios', 'moderation', 'stats'],
  },
];

export default function RoleEditor({
  user,
}: {
  user: { id: string; role: string; permissions: string | null };
}) {
  const initialList = user.permissions ? user.permissions.split(',').map((p) => p.trim()).filter(Boolean) : [];
  const [role, setRole] = useState(user.role === 'PARTICIPANT' ? 'USER' : user.role);
  const [permissions, setPermissions] = useState<string[]>(initialList.filter((p) => p !== LIMITED_ADMIN_TOKEN));
  const [superAdmin, setSuperAdmin] = useState(user.role !== 'ADMIN' || !initialList.includes(LIMITED_ADMIN_TOKEN));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const setPermission = (id: string, allow: boolean) => {
    setPermissions((prev) => {
      const has = prev.includes(id);
      if (allow && !has) return [...prev, id];
      if (!allow && has) return prev.filter((p) => p !== id);
      return prev;
    });
  };

  const allowAll = () => setPermissions([...MODERATOR_PERMISSIONS]);
  const denyAll = () => setPermissions([]);

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          permissions: role === 'MODERATOR' || (role === 'ADMIN' && !superAdmin) ? permissions : [],
          isSuperAdmin: role === 'ADMIN' ? superAdmin : undefined,
        }),
      });
      if (res.ok) {
        setMessage('Права сохранены');
        startTransition(() => {
          router.refresh();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || 'Ошибка при сохранении прав');
      }
    } catch {
      setMessage('Сетевая ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Управление правами</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Роль пользователя</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,0,0,0.1)' }}
        >
          <option value="USER">Пользователь</option>
          <option value="MODERATOR">Модератор</option>
          <option value="SCANNER">Сканер билетов</option>
          <option value="ADMIN">Администратор</option>
        </select>
        {role === 'SCANNER' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            Сервисная учётная запись для входа: после логина открывается только сканер QR.
          </p>
        )}
        {role === 'USER' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            Участие в проектах и афише хранится в статусах заявок и броней («подана / одобрена / участник»), без отдельной роли.
          </p>
        )}
      </div>

      {role === 'ADMIN' && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={superAdmin} onChange={(e) => setSuperAdmin(e.target.checked)} />
          <span>
            <strong>Суперадминистратор (isSuperAdmin)</strong>
            <br />
            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
              Полный доступ к пользователям, настройкам и бэкапу. Снимите галочку, чтобы выдать только разделы как у модератора.
            </span>
          </span>
        </label>
      )}

      {(role === 'MODERATOR' || (role === 'ADMIN' && !superAdmin)) && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Персональные права по разделам</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={allowAll}>
                Разрешить всё
              </button>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={denyAll}>
                Запретить всё
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.85rem' }}>
            Для каждого раздела назначьте лично: <strong>Разрешить</strong> или <strong>Запретить</strong>.
            Модератор не получает доступ к «Настройкам» и «Пользователям».
          </p>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {group.title}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {group.keys.map((id) => {
                    const allowed = permissions.includes(id);
                    return (
                      <div
                        key={id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '0.55rem 0.65rem',
                          borderRadius: 10,
                          border: `1px solid ${allowed ? '#bbf7d0' : '#e2e8f0'}`,
                          background: allowed ? '#f0fdf4' : '#fff',
                        }}
                      >
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{PERMISSION_LABELS[id]}</span>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => setPermission(id, true)}
                            style={{
                              padding: '0.28rem 0.55rem',
                              borderRadius: 8,
                              border: '1px solid',
                              borderColor: allowed ? '#16a34a' : '#e2e8f0',
                              background: allowed ? '#16a34a' : '#fff',
                              color: allowed ? '#fff' : '#64748b',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Разрешить
                          </button>
                          <button
                            type="button"
                            onClick={() => setPermission(id, false)}
                            style={{
                              padding: '0.28rem 0.55rem',
                              borderRadius: 8,
                              border: '1px solid',
                              borderColor: !allowed ? '#b91c1c' : '#e2e8f0',
                              background: !allowed ? '#fee2e2' : '#fff',
                              color: !allowed ? '#991b1b' : '#64748b',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Запретить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: message.includes('сохран') ? '#166534' : '#b91c1c' }}>
          {message}
        </p>
      )}

      <button onClick={handleSave} disabled={loading || isPending} className="btn btn-primary" style={{ width: '100%' }}>
        {loading || isPending ? 'Сохранение...' : 'Сохранить права'}
      </button>
    </div>
  );
}
