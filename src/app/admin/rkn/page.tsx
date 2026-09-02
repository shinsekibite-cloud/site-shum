'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Download, FileBadge, Save } from 'lucide-react';
import {
  DEFAULT_RKN_PACK,
  parseRknPack,
  RKN_CHECK_KEYS,
  RKN_CHECK_LABELS,
  type RknPackDraft,
} from '@/lib/rkn-pack';

export default function AdminRknPage() {
  const [pack, setPack] = useState<RknPackDraft>({
    ...DEFAULT_RKN_PACK,
    checklist: { ...DEFAULT_RKN_PACK.checklist },
  });
  const [siteName, setSiteName] = useState('Портал');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rkn-pack');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setPack(parseRknPack(JSON.stringify(data.pack || {})));
      setSiteName(data.siteName || 'Портал');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = <K extends keyof RknPackDraft>(key: K, value: RknPackDraft[K]) => {
    setPack((p) => ({ ...p, [key]: value }));
  };

  const doneCount = useMemo(
    () => RKN_CHECK_KEYS.filter((k) => Boolean(pack.checklist[k])).length,
    [pack.checklist]
  );
  const totalChecks = RKN_CHECK_KEYS.length;
  const progressPct = Math.round((doneCount / Math.max(1, totalChecks)) * 100);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/rkn-pack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack: {
            ...pack,
            preparedAt: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Черновик РКН сохранён');
      setPack(parseRknPack(JSON.stringify(data.pack || pack)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = () => {
    window.open('/api/admin/rkn-pack?format=html', '_blank');
  };

  if (loading) return <p style={{ color: 'var(--muted)' }}>Загрузка…</p>;

  const fields: { key: keyof RknPackDraft; label: string; rows?: number }[] = [
    { key: 'operatorFullName', label: 'Полное наименование оператора' },
    { key: 'operatorShortName', label: 'Краткое наименование' },
    { key: 'inn', label: 'ИНН' },
    { key: 'ogrn', label: 'ОГРН / ОГРНИП' },
    { key: 'legalAddress', label: 'Юридический адрес', rows: 2 },
    { key: 'postalAddress', label: 'Почтовый адрес', rows: 2 },
    { key: 'pdnEmail', label: 'Email ответственного за ПДн' },
    { key: 'pdnPhone', label: 'Телефон' },
    { key: 'websiteUrl', label: 'Сайт (URL)' },
    { key: 'purposeNotes', label: 'Цели обработки', rows: 3 },
    { key: 'categoriesNotes', label: 'Категории ПДн', rows: 3 },
    { key: 'thirdPartiesNotes', label: 'Третьи лица', rows: 2 },
    { key: 'localizationNotes', label: 'Локализация', rows: 2 },
    { key: 'measuresNotes', label: 'Меры защиты', rows: 3 },
    { key: 'preparedBy', label: 'Кто подготовил' },
  ];

  return (
    <div style={{ maxWidth: 920 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: '1.1rem',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.45rem',
              fontWeight: 800,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <FileBadge size={22} /> Подготовка в РКН
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Черновик уведомления оператора ПДн для {siteName}. Подача: pd.rkn.gov.ru.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadDoc}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
          >
            <Download size={16} /> Документ HTML
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
          >
            <Save size={16} /> Сохранить
          </button>
        </div>
      </div>

      <section className="rkn-checklist" aria-label="Чеклист готовности">
        <div className="rkn-checklist__head">
          <div>
            <strong>Чеклист готовности</strong>
            <span className="rkn-checklist__meta">
              {doneCount}/{totalChecks}
            </span>
          </div>
          <div className="rkn-checklist__bar" aria-hidden>
            <i style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <ul className="rkn-checklist__grid">
          {RKN_CHECK_KEYS.map((k) => {
            const on = Boolean(pack.checklist[k]);
            return (
              <li key={k}>
                <button
                  type="button"
                  className={`rkn-check${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setPack((p) => ({
                      ...p,
                      checklist: { ...p.checklist, [k]: !p.checklist[k] },
                    }))
                  }
                >
                  <span className="rkn-check__mark" aria-hidden>
                    {on ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                  <span className="rkn-check__label">{RKN_CHECK_LABELS[k]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="glass" style={{ padding: '1rem', display: 'grid', gap: 12 }}>
        {fields.map((f) => (
          <div key={String(f.key)}>
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--muted)',
                marginBottom: 4,
              }}
            >
              {f.label}
            </label>
            {f.rows ? (
              <textarea
                value={String(pack[f.key] || '')}
                onChange={(e) => setField(f.key, e.target.value as never)}
                rows={f.rows}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 10,
                  border: '1.5px solid #e2e8f0',
                  font: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                value={String(pack[f.key] || '')}
                onChange={(e) => setField(f.key, e.target.value as never)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 10,
                  border: '1.5px solid #e2e8f0',
                  font: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
