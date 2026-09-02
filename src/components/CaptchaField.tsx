'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type Tile = { id: string; emoji: string; label: string };

type Props = {
  /** Called whenever a fresh solved token is ready (or cleared) */
  onToken: (token: string) => void;
  className?: string;
};

/**
 * Picture-pick captcha (with math fallback). Parent sends `captchaToken` + empty `website`.
 */
export default function CaptchaField({ onToken, className }: Props) {
  const [challengeId, setChallengeId] = useState('');
  const [question, setQuestion] = useState('Проверка…');
  const [kind, setKind] = useState<'pick' | 'math'>('pick');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [solved, setSolved] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    setSolved(false);
    setAnswer('');
    setSelected([]);
    onToken('');
    try {
      const res = await fetch('/api/captcha/challenge');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setChallengeId(data.challengeId);
      setQuestion(data.question || 'Решите проверку');
      setKind(data.kind === 'math' ? 'math' : 'pick');
      setTiles(Array.isArray(data.tiles) ? data.tiles : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить проверку');
      setQuestion('—');
    } finally {
      setBusy(false);
    }
  }, [onToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    if (!challengeId) {
      setError('Обновите проверку');
      return;
    }
    if (kind === 'pick' && selected.length === 0) {
      setError('Выберите картинки');
      return;
    }
    if (kind === 'math' && !answer.trim()) {
      setError('Введите ответ');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/captcha/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          answer: answer.trim(),
          selected,
          website: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Неверно');
      setSolved(true);
      onToken(data.token);
    } catch (e) {
      setSolved(false);
      onToken('');
      setError(e instanceof Error ? e.message : 'Ошибка');
      void load();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    if (busy || solved) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        defaultValue=""
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>{question}</label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load()}
          disabled={busy}
          aria-label="Обновить проверку"
          style={{ padding: '0.35rem 0.55rem' }}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {kind === 'pick' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '0.4rem',
          }}
        >
          {tiles.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                disabled={busy || solved}
                aria-pressed={on}
                aria-label={t.label}
                style={{
                  fontSize: '1.65rem',
                  lineHeight: 1.2,
                  padding: '0.55rem 0.2rem',
                  borderRadius: 10,
                  border: on ? '2px solid var(--primary, #0d9488)' : '1px solid rgba(0,0,0,0.12)',
                  background: on ? 'color-mix(in srgb, var(--primary, #0d9488) 12%, #fff)' : '#fff',
                  cursor: busy || solved ? 'default' : 'pointer',
                }}
              >
                <span aria-hidden>{t.emoji}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            inputMode="numeric"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (solved) {
                setSolved(false);
                onToken('');
              }
            }}
            placeholder="Ответ"
            disabled={busy || solved}
            aria-label="Ответ на проверку"
            style={{
              flex: '1 1 120px',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(255,255,255,0.85)',
            }}
          />
        </div>
      )}
      <button type="button" className="btn btn-secondary" onClick={() => void verify()} disabled={busy || solved}>
        {solved ? 'Готово' : 'Проверить'}
      </button>
      {error && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>}
      {solved && !error && (
        <p style={{ margin: 0, color: '#15803d', fontSize: '0.85rem' }}>Проверка пройдена</p>
      )}
    </div>
  );
}
