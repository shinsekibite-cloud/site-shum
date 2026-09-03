'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { containsUnsafeContent } from '@/lib/censor';
import { tagGroupsFor } from '@/lib/profile-meta';

type Suggestion = { tag: string; count: number; source: string };
type Pending = { id: string; tag: string; kind: string; status: string; createdAt: string };

function isCleanTag(tag: string) {
  const t = tag.trim();
  if (t.length < 2 || t.length > 40) return false;
  return !containsUnsafeContent(t);
}

export default function TagPicker({
  label,
  kind,
  value,
  onChange,
  hint,
}: {
  label: string;
  kind: 'hobbies' | 'interests';
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [custom, setCustom] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [openCustom, setOpenCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canPropose, setCanPropose] = useState(true);

  const load = () => {
    fetch(`/api/user/profile-tags?kind=${kind}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.suggestions)) {
          setSuggestions(
            data.suggestions.filter((s: Suggestion) => s?.tag && isCleanTag(String(s.tag)))
          );
        }
        if (Array.isArray(data.pending)) setPending(data.pending);
        if (typeof data.canProposeToday === 'boolean') setCanPropose(data.canProposeToday);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    const cleaned = value.filter(isCleanTag);
    if (cleaned.length !== value.length) onChange(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join('|')]);

  const selected = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const pendingTags = useMemo(
    () => pending.filter((p) => p.kind === kind && p.status === 'PENDING'),
    [pending, kind]
  );
  const groups = useMemo(() => tagGroupsFor(kind), [kind]);
  const q = query.trim().toLowerCase();

  const extraSuggestions = useMemo(() => {
    const catalog = new Set(groups.flatMap((g) => g.tags.map((t) => t.toLowerCase())));
    return suggestions.filter(
      (s) => !catalog.has(s.tag.toLowerCase()) && !selected.has(s.tag.toLowerCase()) && (!q || s.tag.toLowerCase().includes(q))
    );
  }, [groups, suggestions, selected, q]);

  const addCatalog = (tag: string) => {
    const t = tag.trim();
    setError('');
    if (!t || !isCleanTag(t)) {
      setError('Этот вариант нельзя добавить');
      return;
    }
    if (selected.has(t.toLowerCase())) return;
    onChange([...value, t].slice(0, 30));
  };

  const remove = (tag: string) => {
    onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
  };

  const proposeCustom = async () => {
    const t = custom.trim();
    setError('');
    if (!t) return;
    if (!isCleanTag(t)) {
      setError('Этот вариант нельзя добавить');
      return;
    }
    if (selected.has(t.toLowerCase())) {
      setError('Уже выбрано');
      return;
    }
    if (!canPropose) {
      setError('Свой вариант можно предложить 1 раз в сутки');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/user/profile-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, tag: t }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Не удалось отправить');
        return;
      }
      toast.success(data.message || 'Отправлено на проверку');
      setCustom('');
      setOpenCustom(false);
      setCanPropose(false);
      load();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yp-tag-picker yp-tag-picker--compact yp-tag-picker--grouped">
      <div className="yp-tag-picker__head">
        <label className="yp-tag-picker__label">{label}</label>
        {hint ? <p className="yp-tag-picker__hint">{hint}</p> : null}
      </div>

      {value.length > 0 ? (
        <div className="yp-tag-picker__selected">
          {value.map((tag) => (
            <button key={tag} type="button" onClick={() => remove(tag)} className="yp-tag-picker__chip is-on">
              {tag} <X size={12} />
            </button>
          ))}
        </div>
      ) : null}

      {pendingTags.length > 0 ? (
        <div className="yp-tag-picker__pending" aria-label="На проверке">
          {pendingTags.map((p) => (
            <span key={p.id} className="yp-tag-picker__chip is-pending" title="Ждёт модератора">
              {p.tag} · проверка
            </span>
          ))}
        </div>
      ) : null}

      <label className="yp-tag-picker__search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти хобби или интерес…"
          autoComplete="off"
          aria-label={`Поиск: ${label}`}
        />
      </label>

      {groups.map((group) => {
        const tags = group.tags.filter(
          (t) => !selected.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))
        );
        if (!tags.length) return null;
        return (
          <div key={group.title} className="yp-tag-picker__group">
            <p className="yp-tag-picker__group-title">{group.title}</p>
            <div className="yp-tag-picker__suggestions" role="list">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  role="listitem"
                  onClick={() => addCatalog(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {extraSuggestions.length ? (
        <div className="yp-tag-picker__group">
          <p className="yp-tag-picker__group-title">Ещё у пользователей</p>
          <div className="yp-tag-picker__suggestions" role="list">
            {extraSuggestions.map((s) => (
              <button
                key={s.tag}
                type="button"
                role="listitem"
                onClick={() => addCatalog(s.tag)}
                title={s.count > 0 ? `У ${s.count} пользователей` : 'Готовый вариант'}
              >
                {s.tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="yp-tag-picker__suggestions">
        <button
          type="button"
          className={`yp-tag-picker__own${openCustom ? ' is-open' : ''}`}
          onClick={() => setOpenCustom((v) => !v)}
          aria-expanded={openCustom}
        >
          Свой <ChevronDown size={14} />
        </button>
      </div>

      {openCustom ? (
        <div className="yp-tag-picker__add">
          <input
            id={`tag-custom-${kind}`}
            name={`tag-custom-${kind}`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void proposeCustom();
              }
            }}
            placeholder="Свой вариант…"
            maxLength={40}
            autoComplete="off"
            aria-label={`Свой вариант: ${label}`}
            disabled={!canPropose || busy}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void proposeCustom()}
            aria-label="Отправить на проверку"
            disabled={!canPropose || busy || !custom.trim()}
          >
            <Plus size={16} />
          </button>
        </div>
      ) : null}

      <p className="yp-tag-picker__note">
        {canPropose
          ? 'Свой вариант — 1 раз в сутки, появится после проверки модератором'
          : 'Сегодня свой вариант уже отправлен — завтра можно снова'}
      </p>
      {error ? <p className="yp-tag-picker__error">{error}</p> : null}
    </div>
  );
}
