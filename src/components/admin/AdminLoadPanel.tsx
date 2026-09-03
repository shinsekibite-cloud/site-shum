'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw, Users } from 'lucide-react';

type LoadPayload = {
  collectedAt?: string;
  overall?: { status: string; warnings: string[] };
  host?: {
    loadAvg?: { '1m': number; '5m': number; '15m': number };
    cpuCount?: number;
    memory?: { usedPercent: number | null; usedBytes: number | null; totalBytes: number | null };
  };
  process?: { memory?: { heapUsedBytes: number | null; rssBytes: number | null }; uptimeSec?: number };
  disk?: { root?: { usedPercent: number | null; availableBytes: number | null } };
  services?: { db?: { ok: boolean; latencyMs: number | null }; redis?: { ok: boolean; latencyMs: number | null } };
  catalog?: { users?: number; onlineApprox?: number };
};

function fmtBytes(n?: number | null) {
  if (n == null) return '—';
  const gb = n / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} ГБ`;
  return `${Math.round(n / 1024 / 1024)} МБ`;
}

/** Compact live load card for Settings → Нагрузка */
export default function AdminLoadPanel() {
  const [data, setData] = useState<LoadPayload | null>(null);
  const [online, setOnline] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [sys, on] = await Promise.all([
        fetch('/api/admin/system', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/online-users?status=online&limit=1', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setData(sys);
      setOnline(on.summary?.onlineCount || 0);
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const load1 = data?.host?.loadAvg?.['1m'];
  const cpu = data?.host?.cpuCount || 1;
  const loadPct = load1 != null ? Math.min(100, Math.round((load1 / cpu) * 100)) : null;

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.45 }}>
          Текущая нагрузка сайта и сервера. Полный дашборд — в «Состояние сервера», онлайн-пользователи — отдельный
          раздел.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={14} /> {busy ? '…' : 'Обновить'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Metric icon={<Activity size={16} />} label="Статус" value={(data?.overall?.status || '—').toUpperCase()} />
        <Metric icon={<Cpu size={16} />} label="Load 1m" value={load1 != null ? `${load1.toFixed(2)} (${loadPct}%)` : '—'} />
        <Metric
          icon={<MemoryStick size={16} />}
          label="RAM хоста"
          value={
            data?.host?.memory?.usedPercent != null
              ? `${data.host.memory.usedPercent}% · ${fmtBytes(data.host.memory.usedBytes)}`
              : '—'
          }
        />
        <Metric
          icon={<HardDrive size={16} />}
          label="Диск /"
          value={data?.disk?.root?.usedPercent != null ? `${data.disk.root.usedPercent}%` : '—'}
        />
        <Metric icon={<Users size={16} />} label="Онлайн" value={String(online)} />
        <Metric
          icon={<Activity size={16} />}
          label="DB / Redis"
          value={`${data?.services?.db?.ok ? 'DB OK' : 'DB…'} · ${data?.services?.redis?.ok ? 'Redis OK' : 'Redis…'}`}
        />
      </div>

      {data?.overall?.warnings?.length ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.85rem' }}>
          {data.overall.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/admin/system" className="btn btn-primary btn-sm">
          Полное состояние сервера
        </Link>
        <Link href="/admin/online" className="btn btn-secondary btn-sm">
          Пользователи онлайн
        </Link>
      </div>
      {data?.collectedAt ? (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          Снимок: {new Date(data.collectedAt).toLocaleString('ru-RU')} · heap{' '}
          {fmtBytes(data.process?.memory?.heapUsedBytes)} · uptime {data.process?.uptimeSec ?? '—'} c
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        padding: '0.7rem 0.8rem',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        background: '#fff',
        display: 'grid',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.75rem' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontWeight: 750, fontSize: '0.95rem' }}>{value}</div>
    </div>
  );
}
