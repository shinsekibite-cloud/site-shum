'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  RefreshCw,
  Server,
  DatabaseBackup,
  Wifi,
  ShieldAlert,
  Users,
  Folder,
  Newspaper,
  Clock,
} from 'lucide-react';

type ServerStatusPayload = {
  collectedAt: string;
  overall: { ok: boolean; status: 'ok' | 'warn' | 'critical'; warnings: string[] };
  app: {
    siteName: string | null;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    registrationOpen: boolean;
    messagingEnabled: boolean;
    nodeEnv: string;
    nodeVersion: string;
    pid: number;
    uptimeSec: number;
    cwd: string;
    publicOrigin: string | null;
  };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    cpuCount: number;
    loadAvg: { '1m': number; '5m': number; '15m': number };
    memory: { totalBytes: number | null; freeBytes: number | null; usedBytes: number | null; usedPercent: number | null };
  };
  process: {
    memory: {
      rssBytes: number | null;
      heapTotalBytes: number | null;
      heapUsedBytes: number | null;
      externalBytes: number | null;
      arrayBuffersBytes: number | null;
    };
    uptimeSec: number;
  };
  disk: {
    root: { usedPercent: number | null; usedBytes: number | null; totalBytes: number | null; availableBytes: number | null; target: string };
    uploads: { target: string };
    data: { target: string };
    uploadsDirBytes: number | null;
    dataDirBytes: number | null;
    coversPhotoDirBytes: number | null;
  };
  services: {
    db: { ok: boolean; latencyMs: number | null; sizeBytes: number | null; detail?: string | null };
    redis: {
      ok: boolean;
      latencyMs: number | null;
      usedMemoryBytes: number | null;
      maxMemoryBytes: number | null;
      detail?: string | null;
    };
  };
  catalog: {
    users: number;
    projects: number;
    clubs: number;
    spaces: number;
    news: number;
    pendingBookings: number;
    pendingApplications: number;
    unreadNotifications: number;
  };
  backup: {
    id: string;
    label: string | null;
    byteSize: number;
    schemaVersion: string;
    createdAt: string;
    ageHours: number;
  } | null;
  tgBackup?: {
    lastRequestAt: string | null;
    lastRequestFileMtime: string | null;
    pendingId: string | null;
  };
  modules?: {
    offCount: number;
    total: number;
    items: Array<{ key: string; label: string; enabled: boolean; offMode: string | null }>;
  };
};

function fmtBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function fmtAge(hours: number | null | undefined) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  if (hours < 48) return `${hours.toFixed(1)} ч`;
  return `${(hours / 24).toFixed(1)} д`;
}

function Meter({
  label,
  percent,
  tone,
  detail,
}: {
  label: string;
  percent: number | null | undefined;
  tone?: 'ok' | 'warn' | 'bad';
  detail?: string;
}) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const auto =
    percent == null ? 'ok' : percent >= 90 ? 'bad' : percent >= 75 ? 'warn' : 'ok';
  const t = tone || auto;
  const color = t === 'bad' ? '#dc2626' : t === 'warn' ? '#d97706' : '#0d9488';
  return (
    <div className="admin-system__meter">
      <div className="admin-system__meter-top">
        <span>{label}</span>
        <strong style={{ color }}>{percent == null ? '—' : `${percent}%`}</strong>
      </div>
      <div className="admin-system__meter-track">
        <div className="admin-system__meter-fill" style={{ width: `${p}%`, background: color }} />
      </div>
      {detail ? <div className="admin-system__meter-detail">{detail}</div> : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="admin-system__stat">
      <div className="admin-system__stat-ico">
        <Icon size={16} />
      </div>
      <div>
        <div className="admin-system__stat-label">{label}</div>
        <div className="admin-system__stat-value">{value}</div>
        {hint ? <div className="admin-system__stat-hint">{hint}</div> : null}
      </div>
    </div>
  );
}

export default function AdminSystemClient() {
  const [data, setData] = useState<ServerStatusPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Ошибка загрузки');
      setData(json as ServerStatusPayload);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [auto, load]);

  const status = data?.overall.status || 'ok';
  const statusLabel =
    status === 'critical' ? 'Критично' : status === 'warn' ? 'Внимание' : 'Норма';
  const statusColor =
    status === 'critical' ? '#dc2626' : status === 'warn' ? '#d97706' : '#0d9488';

  return (
    <div className="admin-page-shell admin-system">
      <div className="admin-page-header">
        <div>
          <h1>Состояние сервера</h1>
          <p>Нагрузка, память, диски, БД, Redis и сводка по сайту</p>
        </div>
        <div className="admin-system__actions">
          <label className="admin-system__auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Авто 60с
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      </div>

      {error ? (
        <div className="admin-system__error" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="admin-system__loading">Сбор метрик…</div>
      ) : null}

      {data ? (
        <>
          <section className="admin-system__banner" style={{ borderColor: `${statusColor}55` }}>
            <div className="admin-system__banner-main">
              {status === 'ok' ? <CheckCircle2 size={22} color={statusColor} /> : <ShieldAlert size={22} color={statusColor} />}
              <div>
                <strong style={{ color: statusColor }}>{statusLabel}</strong>
                <span>
                  {data.app.siteName || 'Портал'} · собрано{' '}
                  {new Date(data.collectedAt).toLocaleString('ru-RU')}
                </span>
              </div>
            </div>
            <div className="admin-system__banner-meta">
              <span>Uptime процесса: {fmtUptime(data.app.uptimeSec)}</span>
              <span>Node {data.app.nodeVersion}</span>
              <span>{data.app.nodeEnv}</span>
            </div>
            {data.overall.warnings.length ? (
              <ul className="admin-system__warnings">
                {data.overall.warnings.map((w) => (
                  <li key={w}>
                    <AlertTriangle size={14} /> {w}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-system__ok-line">Критичных предупреждений нет.</p>
            )}
          </section>

          <div className="admin-system__grid">
            <section className="glass admin-system__card">
              <h2>
                <Cpu size={18} /> Нагрузка и CPU
              </h2>
              <div className="admin-system__stats">
                <Stat icon={Activity} label="Load 1 / 5 / 15 мин" value={`${data.host.loadAvg['1m']} / ${data.host.loadAvg['5m']} / ${data.host.loadAvg['15m']}`} hint={`${data.host.cpuCount} CPU`} />
                <Stat icon={Server} label="Хост" value={data.host.hostname} hint={`${data.host.platform} ${data.host.arch}`} />
              </div>
              <Meter
                label="Load относительно CPU"
                percent={Math.min(100, Math.round((data.host.loadAvg['1m'] / Math.max(1, data.host.cpuCount)) * 100))}
                detail={`1m load ${data.host.loadAvg['1m']} при ${data.host.cpuCount} ядрах`}
              />
            </section>

            <section className="glass admin-system__card">
              <h2>
                <MemoryStick size={18} /> Память
              </h2>
              <Meter
                label="Контейнер / хост (видимый)"
                percent={data.host.memory.usedPercent}
                detail={`${fmtBytes(data.host.memory.usedBytes)} из ${fmtBytes(data.host.memory.totalBytes)}`}
              />
              <div className="admin-system__stats">
                <Stat icon={MemoryStick} label="RSS процесса" value={fmtBytes(data.process.memory.rssBytes)} />
                <Stat icon={MemoryStick} label="Heap used" value={fmtBytes(data.process.memory.heapUsedBytes)} hint={`total ${fmtBytes(data.process.memory.heapTotalBytes)}`} />
              </div>
            </section>

            <section className="glass admin-system__card">
              <h2>
                <HardDrive size={18} /> Диски
              </h2>
              <Meter
                label="Корень /"
                percent={data.disk.root.usedPercent}
                detail={`${fmtBytes(data.disk.root.usedBytes)} / ${fmtBytes(data.disk.root.totalBytes)} · свободно ${fmtBytes(data.disk.root.availableBytes)}`}
              />
              <div className="admin-system__stats">
                <Stat icon={HardDrive} label="Uploads" value={fmtBytes(data.disk.uploadsDirBytes)} hint={data.disk.uploads.target} />
                <Stat icon={HardDrive} label="Data" value={fmtBytes(data.disk.dataDirBytes)} hint={data.disk.data.target} />
                <Stat icon={HardDrive} label="Photo covers" value={fmtBytes(data.disk.coversPhotoDirBytes)} />
              </div>
            </section>

            <section className="glass admin-system__card">
              <h2>
                <Database size={18} /> Сервисы
              </h2>
              <div className="admin-system__svc">
                <div className={`admin-system__svc-row${data.services.db.ok ? '' : ' is-bad'}`}>
                  <strong>PostgreSQL</strong>
                  <span>{data.services.db.ok ? 'OK' : 'FAIL'}</span>
                  <em>{data.services.db.latencyMs != null ? `${data.services.db.latencyMs} мс` : '—'}</em>
                  <em>{fmtBytes(data.services.db.sizeBytes)}</em>
                </div>
                <div className={`admin-system__svc-row${data.services.redis.ok ? '' : ' is-bad'}`}>
                  <strong>Redis</strong>
                  <span>{data.services.redis.ok ? 'OK' : 'FAIL'}</span>
                  <em>{data.services.redis.latencyMs != null ? `${data.services.redis.latencyMs} мс` : '—'}</em>
                  <em>
                    {fmtBytes(data.services.redis.usedMemoryBytes)}
                    {data.services.redis.maxMemoryBytes ? ` / ${fmtBytes(data.services.redis.maxMemoryBytes)}` : ''}
                  </em>
                </div>
              </div>
              {!data.services.redis.ok && data.services.redis.detail ? (
                <p className="admin-system__hint">{data.services.redis.detail}</p>
              ) : null}
            </section>

            <section className="glass admin-system__card">
              <h2>
                <Wifi size={18} /> Режим сайта
              </h2>
              <div className="admin-system__stats">
                <Stat
                  icon={ShieldAlert}
                  label="Обслуживание"
                  value={data.app.maintenanceMode ? 'Включено' : 'Выкл'}
                  hint={data.app.maintenanceMessage || undefined}
                />
                <Stat icon={Users} label="Регистрация" value={data.app.registrationOpen ? 'Открыта' : 'Закрыта'} />
                <Stat icon={Wifi} label="Сообщения" value={data.app.messagingEnabled ? 'Вкл' : 'Тихий режим'} />
                <Stat icon={Clock} label="Public URL" value={data.app.publicOrigin || '—'} />
              </div>
              <div className="admin-system__links">
                <Link href="/admin/settings" className="btn btn-secondary">
                  Настройки
                </Link>
                <Link href="/admin/settings?tab=modules" className="btn btn-secondary">
                  Модули
                </Link>
              </div>
            </section>

            <section className="glass admin-system__card">
              <h2>
                <DatabaseBackup size={18} /> Бэкап
              </h2>
              {data.backup ? (
                <div className="admin-system__stats">
                  <Stat icon={DatabaseBackup} label="Последний" value={data.backup.label || data.backup.id} hint={new Date(data.backup.createdAt).toLocaleString('ru-RU')} />
                  <Stat icon={HardDrive} label="Размер" value={fmtBytes(data.backup.byteSize)} />
                  <Stat icon={Clock} label="Возраст" value={fmtAge(data.backup.ageHours)} hint={`schema ${data.backup.schemaVersion}`} />
                </div>
              ) : (
                <p className="admin-system__hint">Бэкапов в панели пока нет.</p>
              )}
              {data.tgBackup ? (
                <div className="admin-system__stats" style={{ marginTop: 10 }}>
                  <Stat
                    icon={Clock}
                    label="TG backup .last"
                    value={
                      data.tgBackup.lastRequestFileMtime
                        ? new Date(data.tgBackup.lastRequestFileMtime).toLocaleString('ru-RU')
                        : '—'
                    }
                    hint={
                      data.tgBackup.lastRequestAt
                        ? `запрос ${new Date(data.tgBackup.lastRequestAt).toLocaleString('ru-RU')}`
                        : data.tgBackup.pendingId
                          ? `pending ${data.tgBackup.pendingId}`
                          : 'нет запросов'
                    }
                  />
                </div>
              ) : null}
              <div className="admin-system__links">
                <Link href="/admin/backup" className="btn btn-primary">
                  Открыть бэкапы
                </Link>
              </div>
            </section>

            {data.modules ? (
              <section className="glass admin-system__card admin-system__card--wide">
                <h2>
                  <ShieldAlert size={18} /> Модули Ops
                </h2>
                <p className="admin-system__hint" style={{ marginTop: 0 }}>
                  Выключено: {data.modules.offCount} из {data.modules.total}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.modules.items
                    .filter((m) => !m.enabled)
                    .slice(0, 24)
                    .map((m) => (
                      <span
                        key={m.key}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.5rem',
                          borderRadius: 8,
                          background: 'rgba(217,119,6,0.12)',
                          color: '#b45309',
                        }}
                      >
                        {m.label}
                        {m.offMode === 'soon' ? ' · soon' : ''}
                      </span>
                    ))}
                  {!data.modules.offCount ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Все модули включены</span>
                  ) : null}
                </div>
                <div className="admin-system__links">
                  <Link href="/admin/settings?tab=modules" className="btn btn-secondary">
                    Модули
                  </Link>
                </div>
              </section>
            ) : null}
          </div>

          <section className="glass admin-system__card admin-system__card--wide">
            <h2>
              <Folder size={18} /> Сводка по сайту
            </h2>
            <div className="admin-system__kpis">
              <div>
                <strong>{data.catalog.users}</strong>
                <span>Пользователи</span>
              </div>
              <div>
                <strong>{data.catalog.projects}</strong>
                <span>Проекты</span>
              </div>
              <div>
                <strong>{data.catalog.clubs}</strong>
                <span>Клубы</span>
              </div>
              <div>
                <strong>{data.catalog.spaces}</strong>
                <span>Пространства</span>
              </div>
              <div>
                <strong>{data.catalog.news}</strong>
                <span>Новости</span>
              </div>
              <div>
                <strong>{data.catalog.pendingApplications}</strong>
                <span>Заявки</span>
              </div>
              <div>
                <strong>{data.catalog.pendingBookings}</strong>
                <span>Брони на модерации</span>
              </div>
              <div>
                <strong>{data.catalog.unreadNotifications}</strong>
                <span>
                  <Newspaper size={12} /> Непрочит. уведомл.
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
