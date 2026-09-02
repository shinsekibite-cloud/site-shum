'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Search, RefreshCw } from 'lucide-react';

type HotIp = { ip: string; accounts: number };
type SuspiciousUser = {
  id: string;
  name: string | null;
  email: string | null;
  publicCode: string | null;
  role: string;
  suspiciousFlag: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  warnCount: number;
};

export default function AdminSecurityClient() {
  const [days, setDays] = useState(14);
  const [minAccounts, setMinAccounts] = useState(2);
  const [ipQuery, setIpQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [hotIps, setHotIps] = useState<HotIp[]>([]);
  const [suspiciousUsers, setSuspiciousUsers] = useState<SuspiciousUser[]>([]);
  const [recentBlockedRegs, setRecentBlockedRegs] = useState<any[]>([]);
  const [openProfileFlags, setOpenProfileFlags] = useState(0);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        days: String(days),
        minAccounts: String(minAccounts),
      });
      const res = await fetch(`/api/admin/security?${q}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Ошибка загрузки');
        return;
      }
      setHotIps(data.hotIps || []);
      setSuspiciousUsers(data.suspiciousUsers || []);
      setRecentBlockedRegs(data.recentBlockedRegs || []);
      setOpenProfileFlags(data.openProfileFlags || 0);
    } finally {
      setLoading(false);
    }
  }, [days, minAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const lookupIp = async (ip: string) => {
    const value = ip.trim();
    if (!value) return;
    setIpQuery(value);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/security?ip=${encodeURIComponent(value)}&days=${days}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Ошибка');
        return;
      }
      setDetail(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-security">
      <header className="admin-security__head">
        <div>
          <h1>
            <Shield size={22} aria-hidden /> IP и подозрительная активность
          </h1>
          <p>Общие IP, попытки регистрации, флаги подозрительности и блокировки.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> Обновить
        </button>
      </header>

      <div className="admin-security__filters">
        <label>
          Дней
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 14)}
          />
        </label>
        <label>
          Мин. аккаунтов на IP
          <input
            type="number"
            min={1}
            max={20}
            value={minAccounts}
            onChange={(e) => setMinAccounts(Number(e.target.value) || 2)}
          />
        </label>
        <form
          className="admin-security__ip-form"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupIp(ipQuery);
          }}
        >
          <Search size={16} aria-hidden />
          <input
            value={ipQuery}
            onChange={(e) => setIpQuery(e.target.value)}
            placeholder="Найти по IP…"
            aria-label="IP"
          />
          <button type="submit" className="btn btn-primary">
            Найти
          </button>
        </form>
      </div>

      {error ? <p className="admin-security__error">{error}</p> : null}

      <div className="admin-security__stats">
        <div className="glass">
          <strong>{hotIps.length}</strong>
          <span>IP с несколькими аккаунтами</span>
        </div>
        <div className="glass">
          <strong>{suspiciousUsers.length}</strong>
          <span>Подозрительные / заблокированные</span>
        </div>
        <div className="glass">
          <strong>{openProfileFlags}</strong>
          <span>Открытые флаги профиля/фото</span>
        </div>
      </div>

      {detail ? (
        <section className="glass admin-security__detail">
          <div className="admin-security__detail-head">
            <h2>IP {detail.ip}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
              Закрыть
            </button>
          </div>
          <h3>Пользователи с этого IP</h3>
          <ul>
            {(detail.users || []).map((u: any) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`}>{u.name || u.email}</Link>
                {' · '}
                {u.email}
                {u.blockedAt ? ' · ⛔' : ''}
                {u.suspiciousFlag ? ' · ⚠' : ''}
                {' · '}
                входов: {u.ipHits}
              </li>
            ))}
          </ul>
          <h3>Попытки регистрации</h3>
          <ul>
            {(detail.regAttempts || []).slice(0, 15).map((a: any) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString('ru-RU')} · {a.email || '—'} ·{' '}
                {a.success ? 'ok' : 'fail'}
                {a.blocked ? ' · blocked' : ''}
                {a.reason ? ` · ${a.reason}` : ''}
              </li>
            ))}
            {!detail.regAttempts?.length ? <li>Нет записей</li> : null}
          </ul>
        </section>
      ) : null}

      <div className="admin-security__grid">
        <section className="glass">
          <h2>IP с несколькими аккаунтами</h2>
          {loading && !hotIps.length ? <p>Загрузка…</p> : null}
          <ul className="admin-security__list">
            {hotIps.map((row) => (
              <li key={row.ip}>
                <button type="button" onClick={() => void lookupIp(row.ip)}>
                  {row.ip}
                </button>
                <span>{row.accounts} акк.</span>
              </li>
            ))}
            {!hotIps.length && !loading ? <li>Пока чисто</li> : null}
          </ul>
        </section>

        <section className="glass">
          <h2>Подозрительные пользователи</h2>
          <ul className="admin-security__list">
            {suspiciousUsers.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`}>{u.name || u.email}</Link>
                <span>
                  {u.suspiciousFlag ? 'флаг' : ''}
                  {u.blockedAt ? ' блок' : ''}
                  {u.warnCount ? ` · предупр. ${u.warnCount}` : ''}
                </span>
              </li>
            ))}
            {!suspiciousUsers.length ? <li>Список пуст</li> : null}
          </ul>
        </section>

        <section className="glass">
          <h2>Отклонённые / блоки регистрации</h2>
          <ul className="admin-security__list">
            {recentBlockedRegs.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => a.ip && void lookupIp(a.ip)}>
                  {a.ip || 'no-ip'}
                </button>
                <span>
                  {new Date(a.createdAt).toLocaleString('ru-RU')} · {a.email || '—'}
                </span>
              </li>
            ))}
            {!recentBlockedRegs.length ? <li>Нет записей</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
